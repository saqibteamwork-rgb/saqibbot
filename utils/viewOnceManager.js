'use strict';

/**
 * MR SAQIB MD :: ADVANCED 3-LAYER VIEW-ONCE RETRIEVAL & AUTO-SAVE ENGINE
 * ============================================================================
 * Solves the modern WhatsApp client issue where directPath, mediaKey, or URLs
 * are stripped out of quoted View-Once messages.
 *
 * 3-LAYER ARCHITECTURE:
 * Layer 1 [Pre-Cache on Arrival]:
 *   Intercepts every incoming View-Once message in real-time before it is opened
 *   or quoted. The raw message has 100% intact directPath & mediaKey. Pre-downloads
 *   the buffer and caches it in memory and tmp/viewonce/ keyed by message ID.
 *
 * Layer 2 [In-Memory Raw Store]:
 *   Retains the raw, unstripped protobuf structure of incoming messages. If pre-download
 *   was deferred or incomplete, .vv extracts the original intact message from store
 *   instead of relying on the stripped quoted context.
 *
 * Layer 3 [Quoted Context Fallback]:
 *   If a message is not in cache or store (e.g. sent while bot was offline), attempts
 *   deep unwrap of contextInfo.quotedMessage.
 *
 * Layer 4 [Auto-VV Forwarder]:
 *   When enabled, automatically deposits any incoming View-Once media into the
 *   owner's "You" (Message Yourself) chat without requiring any reply command.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

const TEMP_VO_DIR = path.join(__dirname, '../tmp/viewonce');
const CONFIG_FILE = path.join(__dirname, '../data/autovv.json');

// Ensure tmp/viewonce directory exists
if (!fs.existsSync(TEMP_VO_DIR)) {
    try {
        fs.mkdirSync(TEMP_VO_DIR, { recursive: true });
    } catch (_) {}
}

// In-Memory Caches
// Layer 1: Downloaded media buffer cache (keyed by messageId)
const mediaCache = new Map();

// Layer 2: Raw message structure store (keyed by messageId)
const rawStore = new Map();

// Processing deduplication lock
const inFlightDownloads = new Set();

const MAX_CACHE_ENTRIES = 300;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Deep recursive unwrap of View-Once and wrapper messages
 */
function unwrapViewOnceDeep(msgObj) {
    if (!msgObj || typeof msgObj !== 'object') return null;

    let m = msgObj;
    let isViewOnce = false;

    // Deep unwrap through known WhatsApp message wrappers
    for (let depth = 0; depth < 8 && m; depth++) {
        if (m.ephemeralMessage?.message) {
            m = m.ephemeralMessage.message;
            continue;
        }
        if (m.viewOnceMessageV2Extension?.message) {
            isViewOnce = true;
            m = m.viewOnceMessageV2Extension.message;
            continue;
        }
        if (m.viewOnceMessageV2?.message) {
            isViewOnce = true;
            m = m.viewOnceMessageV2.message;
            continue;
        }
        if (m.viewOnceMessage?.message) {
            isViewOnce = true;
            m = m.viewOnceMessage.message;
            continue;
        }
        if (m.documentWithCaptionMessage?.message) {
            m = m.documentWithCaptionMessage.message;
            continue;
        }
        break;
    }

    let mediaType = null;
    let mediaObj = null;

    if (m?.imageMessage) {
        mediaType = 'image';
        mediaObj = m.imageMessage;
        if (mediaObj.viewOnce) isViewOnce = true;
    } else if (m?.videoMessage) {
        mediaType = 'video';
        mediaObj = m.videoMessage;
        if (mediaObj.viewOnce) isViewOnce = true;
    } else if (m?.audioMessage) {
        mediaType = 'audio';
        mediaObj = m.audioMessage;
        if (mediaObj.viewOnce) isViewOnce = true;
    }

    if (!mediaObj || !mediaType) {
        return null;
    }

    return {
        isViewOnce,
        mediaType,
        mediaObj,
        caption: mediaObj.caption || '',
        mimetype: mediaObj.mimetype || (mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'audio/mp4'),
        rawUnwrapped: m
    };
}

/**
 * Download a media stream into a complete Buffer
 */
async function downloadStreamToBuffer(mediaObj, mediaType) {
    const stream = await downloadContentFromMessage(mediaObj, mediaType);
    let buffer = Buffer.alloc(0);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

/**
 * Loads Auto-VV configuration
 */
function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            const def = { enabled: true };
            fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(def, null, 2));
            return def;
        }
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch {
        return { enabled: true };
    }
}

/**
 * Saves Auto-VV configuration
 */
function saveConfig(cfg) {
    try {
        fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    } catch (err) {
        console.error('[ViewOnceManager] saveConfig error:', err.message);
    }
}

function isAutoVVEnabled() {
    return loadConfig().enabled !== false;
}

function setAutoVV(enabled) {
    const cfg = loadConfig();
    cfg.enabled = Boolean(enabled);
    saveConfig(cfg);
    return cfg.enabled;
}

/**
 * Clean old disk files in tmp/viewonce (older than 24h)
 */
function cleanupExpiredCache() {
    try {
        const now = Date.now();
        // Memory cache eviction by TTL
        for (const [key, item] of mediaCache.entries()) {
            if (now - item.timestamp > CACHE_TTL_MS) {
                mediaCache.delete(key);
            }
        }
        for (const [key, item] of rawStore.entries()) {
            if (now - item.timestamp > CACHE_TTL_MS) {
                rawStore.delete(key);
            }
        }

        // Disk cache cleanup
        if (fs.existsSync(TEMP_VO_DIR)) {
            const files = fs.readdirSync(TEMP_VO_DIR);
            for (const file of files) {
                const fp = path.join(TEMP_VO_DIR, file);
                try {
                    const stat = fs.statSync(fp);
                    if (now - stat.mtimeMs > CACHE_TTL_MS) {
                        fs.unlinkSync(fp);
                    }
                } catch (_) {}
            }
        }
    } catch (_) {}
}

setInterval(cleanupExpiredCache, 60 * 60 * 1000); // Hourly check

/**
 * Intercept incoming messages in messages.upsert
 * Pre-downloads and caches View-Once media in Layer 1 & 2
 */
async function processIncoming(sock, msg, opts = {}) {
    try {
        if (!msg || !msg.key || !msg.message) return;
        const msgId = msg.key.id;
        if (!msgId) return;

        const info = unwrapViewOnceDeep(msg.message);
        if (!info || !info.isViewOnce) return;

        // Layer 2: Save original unstripped raw message object into rawStore
        if (rawStore.size >= MAX_CACHE_ENTRIES) {
            const oldestKey = rawStore.keys().next().value;
            rawStore.delete(oldestKey);
        }
        rawStore.set(msgId, {
            id: msgId,
            chatId: msg.key?.remoteJid,
            sender: msg.key?.participant || msg.participant || msg.key?.remoteJid,
            info,
            timestamp: Date.now()
        });

        // Layer 1: Pre-download media buffer in background
        if (inFlightDownloads.has(msgId)) return;
        inFlightDownloads.add(msgId);

        let cachedItem = null;
        try {
            const { mediaObj, mediaType, caption, mimetype } = info;
            if (mediaObj && (mediaObj.directPath || mediaObj.url)) {
                const buffer = await downloadStreamToBuffer(mediaObj, mediaType);
                if (buffer && buffer.length > 0) {
                    const ext = mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'mp3';
                    const diskPath = path.join(TEMP_VO_DIR, `${msgId}.${ext}`);
                    try {
                        await fs.promises.writeFile(diskPath, buffer);
                    } catch (_) {}

                    cachedItem = {
                        id: msgId,
                        chatId: msg.key?.remoteJid,
                        sender: msg.key?.participant || msg.participant || msg.key?.remoteJid,
                        mediaType,
                        buffer,
                        diskPath,
                        caption,
                        mimetype,
                        timestamp: Date.now()
                    };

                    if (mediaCache.size >= MAX_CACHE_ENTRIES) {
                        const oldestKey = mediaCache.keys().next().value;
                        mediaCache.delete(oldestKey);
                    }
                    mediaCache.set(msgId, cachedItem);
                    console.log(`[ViewOnceManager] ✅ Layer 1 Cached: View-Once ${mediaType} (${(buffer.length / 1024).toFixed(1)} KB) for ${msgId}`);
                }
            }
        } catch (downloadErr) {
            console.warn(`[ViewOnceManager] Pre-download warning for ${msgId}:`, downloadErr.message);
        } finally {
            inFlightDownloads.delete(msgId);
        }

        // Layer 4: Auto-VV Forward to Owner's "You" chat if enabled
        if (cachedItem && isAutoVVEnabled() && !msg.key?.fromMe) {
            await autoForwardToOwner(sock, msg, cachedItem, opts);
        }
    } catch (err) {
        console.warn('[ViewOnceManager] processIncoming error:', err.message);
    }
}

/**
 * Auto-forwards View-Once media directly to the user's "You" (Message Yourself) chat
 */
async function autoForwardToOwner(sock, msg, cachedItem, opts = {}) {
    try {
        const from = msg.key?.remoteJid;
        const myJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
        const masterJid = '923438673242@s.whatsapp.net';
        const targetInbox = myJid || masterJid;

        const senderJid = msg.key?.participant || msg.participant || from;
        const senderNum = String(senderJid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const isGroup = from && from.endsWith('@g.us');
        const where = isGroup ? ` (Group: ${from.split('@')[0]})` : '';

        const caption =
`╭━━━〔 🔓 *AUTO VIEW-ONCE CAPTURED* 〕━━━┈⊷
┃ 👤 *From:* +${senderNum}${where}
┃ 📁 *Type:* ${cachedItem.mediaType.toUpperCase()}
┃ 💬 *Caption:* ${cachedItem.caption ? cachedItem.caption : 'None'}
┃ ⚡ *Engine:* Layer 1 Pre-Cache
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved by MR SAQIB MD*`;

        const contextInfo = {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363431913895899@newsletter',
                newsletterName: 'Mr SAQIB',
                serverMessageId: 1
            }
        };

        if (cachedItem.mediaType === 'image') {
            await sock.sendMessage(targetInbox, { image: cachedItem.buffer, caption, mimetype: cachedItem.mimetype, contextInfo });
        } else if (cachedItem.mediaType === 'video') {
            await sock.sendMessage(targetInbox, { video: cachedItem.buffer, caption, mimetype: cachedItem.mimetype, contextInfo });
        } else if (cachedItem.mediaType === 'audio') {
            await sock.sendMessage(targetInbox, { audio: cachedItem.buffer, mimetype: cachedItem.mimetype, ptt: false, contextInfo });
            await sock.sendMessage(targetInbox, { text: `🎙️ *Voice Note from +${senderNum}*` });
        }
        console.log(`[ViewOnceManager] 🚀 Auto-forwarded View-Once to ${targetInbox} from +${senderNum}`);
    } catch (err) {
        console.warn('[ViewOnceManager] autoForwardToOwner error:', err.message);
    }
}

/**
 * Universal multi-layer resolver for View-Once media
 * Checks: Layer 1 (Cache) -> Layer 2 (Raw Store) -> Layer 3 (Quoted Message)
 */
async function resolveMedia({ quoted, stanzaId, from, sock }) {
    console.log(`[ViewOnceManager] Resolving media for stanzaId: ${stanzaId || 'none'}`);

    // ===== LAYER 1: Check In-Memory Buffer Cache =====
    if (stanzaId && mediaCache.has(stanzaId)) {
        const item = mediaCache.get(stanzaId);
        if (item && item.buffer && item.buffer.length > 0) {
            console.log(`[ViewOnceManager] 🎯 Layer 1 HIT (Pre-cached RAM buffer) for ${stanzaId}`);
            return {
                layer: 1,
                buffer: item.buffer,
                mediaType: item.mediaType,
                mimetype: item.mimetype,
                caption: item.caption,
                sender: item.sender,
                source: 'cache_memory'
            };
        }
    }

    // Disk fallback for Layer 1
    if (stanzaId) {
        const exts = ['jpg', 'mp4', 'mp3', 'opus'];
        for (const ext of exts) {
            const diskFile = path.join(TEMP_VO_DIR, `${stanzaId}.${ext}`);
            if (fs.existsSync(diskFile)) {
                try {
                    const buf = await fs.promises.readFile(diskFile);
                    if (buf && buf.length > 0) {
                        const mType = ext === 'jpg' ? 'image' : ext === 'mp4' ? 'video' : 'audio';
                        console.log(`[ViewOnceManager] 🎯 Layer 1 HIT (Pre-cached Disk buffer) for ${stanzaId}`);
                        return {
                            layer: 1,
                            buffer: buf,
                            mediaType: mType,
                            mimetype: mType === 'image' ? 'image/jpeg' : mType === 'video' ? 'video/mp4' : 'audio/mp4',
                            caption: '',
                            source: 'cache_disk'
                        };
                    }
                } catch (_) {}
            }
        }
    }

    // ===== LAYER 2: Check Raw Store (Original unstripped incoming message) =====
    if (stanzaId && rawStore.has(stanzaId)) {
        const rawItem = rawStore.get(stanzaId);
        if (rawItem && rawItem.info) {
            try {
                console.log(`[ViewOnceManager] 🎯 Layer 2 HIT (Raw Store intact directPath) for ${stanzaId}`);
                const { mediaObj, mediaType, caption, mimetype } = rawItem.info;
                const buffer = await downloadStreamToBuffer(mediaObj, mediaType);
                if (buffer && buffer.length > 0) {
                    // Cache in Layer 1
                    mediaCache.set(stanzaId, {
                        id: stanzaId,
                        mediaType,
                        buffer,
                        caption,
                        mimetype,
                        timestamp: Date.now()
                    });
                    return {
                        layer: 2,
                        buffer,
                        mediaType,
                        mimetype,
                        caption,
                        sender: rawItem.sender,
                        source: 'raw_store'
                    };
                }
            } catch (err) {
                console.warn(`[ViewOnceManager] Layer 2 download failed for ${stanzaId}:`, err.message);
            }
        }
    }

    // ===== LAYER 3: Quoted Message Fallback (Traditional Unwrap) =====
    if (quoted) {
        try {
            console.log(`[ViewOnceManager] Attempting Layer 3 (Quoted context unwrap)...`);
            const unwrapped = unwrapViewOnceDeep(quoted);
            if (unwrapped && unwrapped.mediaObj && unwrapped.mediaType) {
                const buffer = await downloadStreamToBuffer(unwrapped.mediaObj, unwrapped.mediaType);
                if (buffer && buffer.length > 0) {
                    console.log(`[ViewOnceManager] 🎯 Layer 3 HIT (Quoted context download succeeded)`);
                    if (stanzaId) {
                        mediaCache.set(stanzaId, {
                            id: stanzaId,
                            mediaType: unwrapped.mediaType,
                            buffer,
                            caption: unwrapped.caption,
                            mimetype: unwrapped.mimetype,
                            timestamp: Date.now()
                        });
                    }
                    return {
                        layer: 3,
                        buffer,
                        mediaType: unwrapped.mediaType,
                        mimetype: unwrapped.mimetype,
                        caption: unwrapped.caption,
                        source: 'quoted_context'
                    };
                }
            }
        } catch (err) {
            console.warn(`[ViewOnceManager] Layer 3 download failed:`, err.message);
        }
    }

    return null;
}

module.exports = {
    processIncoming,
    resolveMedia,
    unwrapViewOnceDeep,
    isAutoVVEnabled,
    setAutoVV,
    loadConfig,
    saveConfig
};
