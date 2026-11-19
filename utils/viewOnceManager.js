'use strict';

/**
 * MR SAQIB MD :: ADVANCED 3-LAYER VIEW-ONCE RETRIEVAL & AUTO-SAVE ENGINE
 * ============================================================================
 * Powered by Baileys native `downloadMediaMessage`, `normalizeMessageContent`,
 * and automatic server reupload negotiation (`sock.updateMediaMessage`).
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const {
    downloadMediaMessage,
    downloadContentFromMessage,
    normalizeMessageContent,
    getContentType,
    jidNormalizedUser
} = require('@whiskeysockets/baileys');

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

// Recent diagnostic event log ring buffer
const debugLogs = [];

function addLog(type, msgId, details = {}) {
    const entry = {
        time: new Date().toLocaleTimeString(),
        type,
        msgId: msgId || 'none',
        details
    };
    debugLogs.push(entry);
    if (debugLogs.length > 80) debugLogs.shift();
}

const MAX_CACHE_ENTRIES = 300;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Checks if a message is a View-Once message across all known WhatsApp wrappers
 */
function isViewOnceMessage(msg) {
    if (!msg || !msg.message) return false;
    const m = msg.message;
    if (m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension) return true;
    if (m.ephemeralMessage?.message?.viewOnceMessage || m.ephemeralMessage?.message?.viewOnceMessageV2 || m.ephemeralMessage?.message?.viewOnceMessageV2Extension) return true;
    if (m.documentWithCaptionMessage?.message?.viewOnceMessageV2 || m.documentWithCaptionMessage?.message?.viewOnceMessage) return true;
    if (m.deviceSentMessage?.message?.viewOnceMessageV2 || m.deviceSentMessage?.message?.viewOnceMessage) return true;

    // Check inside normalized content
    try {
        const norm = normalizeMessageContent(m);
        if (norm) {
            const type = getContentType(norm);
            if (type && norm[type]?.viewOnce === true) return true;
        }
    } catch (_) {}

    return false;
}

/**
 * Extracts normalized media details from a message
 */
function extractMediaDetails(msg) {
    if (!msg || !msg.message) return null;
    try {
        const norm = normalizeMessageContent(msg.message);
        if (!norm) return null;
        const type = getContentType(norm);
        if (!type || !['imageMessage', 'videoMessage', 'audioMessage'].includes(type)) return null;

        const mediaObj = norm[type];
        const mediaType = type.replace('Message', '');
        return {
            mediaType,
            mediaObj,
            caption: mediaObj.caption || '',
            mimetype: mediaObj.mimetype || (mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'audio/mp4')
        };
    } catch (_) {
        return null;
    }
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
 * Intercept incoming messages
 * Pre-downloads and caches View-Once media in Layer 1 & 2
 */
async function processIncoming(sock, msg, opts = {}) {
    try {
        if (!msg || !msg.key || !msg.message) return;
        const msgId = msg.key.id;
        if (!msgId) return;

        const isVO = isViewOnceMessage(msg);
        const details = extractMediaDetails(msg);

        // Always store raw intact message in rawStore for Layer 2 & Baileys getMessage
        if (details && rawStore.size < MAX_CACHE_ENTRIES) {
            rawStore.set(msgId, {
                id: msgId,
                chatId: msg.key?.remoteJid,
                sender: msg.key?.participant || msg.participant || msg.key?.remoteJid,
                msg,
                details,
                timestamp: Date.now()
            });
        }

        // If not a View-Once media, skip background auto-pre-download
        if (!isVO || !details) return;

        addLog('incoming_vo_detected', msgId, {
            mediaType: details.mediaType,
            from: msg.key?.remoteJid,
            fromMe: Boolean(msg.key?.fromMe)
        });
        console.log(`[ViewOnceManager] 🎯 View-Once incoming! ID: ${msgId}, Type: ${details.mediaType}`);

        if (inFlightDownloads.has(msgId)) return;
        inFlightDownloads.add(msgId);

        let buffer = null;
        try {
            // First attempt Baileys native downloadMediaMessage with reuploadRequest
            buffer = await downloadMediaMessage(msg, 'buffer', {}, {
                logger: sock?.logger,
                reuploadRequest: typeof sock?.updateMediaMessage === 'function' ? sock.updateMediaMessage.bind(sock) : undefined
            });
        } catch (dErr) {
            // Fallback to downloadContentFromMessage
            if (details.mediaObj && (details.mediaObj.directPath || details.mediaObj.url)) {
                try {
                    const stream = await downloadContentFromMessage(details.mediaObj, details.mediaType);
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    buffer = Buffer.concat(chunks);
                } catch (cErr) {
                    addLog('pre_download_fail', msgId, { error: cErr.message });
                }
            }
        } finally {
            inFlightDownloads.delete(msgId);
        }

        if (buffer && buffer.length > 0) {
            const ext = details.mediaType === 'image' ? 'jpg' : details.mediaType === 'video' ? 'mp4' : 'mp3';
            const diskPath = path.join(TEMP_VO_DIR, `${msgId}.${ext}`);
            try { await fs.promises.writeFile(diskPath, buffer); } catch (_) {}

            const cachedItem = {
                id: msgId,
                chatId: msg.key?.remoteJid,
                sender: msg.key?.participant || msg.participant || msg.key?.remoteJid,
                mediaType: details.mediaType,
                buffer,
                diskPath,
                caption: details.caption,
                mimetype: details.mimetype,
                timestamp: Date.now()
            };

            mediaCache.set(msgId, cachedItem);
            addLog('pre_download_success', msgId, { sizeKb: (buffer.length / 1024).toFixed(1) });
            console.log(`[ViewOnceManager] ✅ Pre-cached View-Once ${details.mediaType} (${(buffer.length / 1024).toFixed(1)} KB) for ${msgId}`);

            // Layer 4: Auto-VV Forward to Owner's "You" chat if enabled
            if (isAutoVVEnabled()) {
                await autoForwardToOwner(sock, msg, cachedItem, opts);
            }
        } else {
            addLog('pre_download_empty_buffer', msgId);
        }
    } catch (err) {
        addLog('process_error', msg?.key?.id, { error: err.message });
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
        addLog('auto_forward_sent', cachedItem.id, { target: targetInbox });
        console.log(`[ViewOnceManager] 🚀 Auto-forwarded View-Once to ${targetInbox} from +${senderNum}`);
    } catch (err) {
        addLog('auto_forward_failed', cachedItem.id, { error: err.message });
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
            addLog('resolve_layer1_hit_ram', stanzaId);
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
                        addLog('resolve_layer1_hit_disk', stanzaId);
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

    // ===== LAYER 2: Check Raw Store (Original intact WAMessage) =====
    if (stanzaId && rawStore.has(stanzaId)) {
        const rawItem = rawStore.get(stanzaId);
        if (rawItem && rawItem.msg) {
            try {
                console.log(`[ViewOnceManager] 🎯 Layer 2 HIT: Attempting downloadMediaMessage on raw intact message for ${stanzaId}`);
                let buffer = null;
                try {
                    buffer = await downloadMediaMessage(rawItem.msg, 'buffer', {}, {
                        logger: sock?.logger,
                        reuploadRequest: typeof sock?.updateMediaMessage === 'function' ? sock.updateMediaMessage.bind(sock) : undefined
                    });
                } catch (e1) {
                    if (rawItem.details?.mediaObj) {
                        const stream = await downloadContentFromMessage(rawItem.details.mediaObj, rawItem.details.mediaType);
                        const chunks = [];
                        for await (const chunk of stream) chunks.push(chunk);
                        buffer = Buffer.concat(chunks);
                    }
                }

                if (buffer && buffer.length > 0) {
                    addLog('resolve_layer2_hit_store', stanzaId);
                    mediaCache.set(stanzaId, {
                        id: stanzaId,
                        mediaType: rawItem.details?.mediaType || 'image',
                        buffer,
                        caption: rawItem.details?.caption || '',
                        mimetype: rawItem.details?.mimetype || 'image/jpeg',
                        timestamp: Date.now()
                    });
                    return {
                        layer: 2,
                        buffer,
                        mediaType: rawItem.details?.mediaType || 'image',
                        mimetype: rawItem.details?.mimetype || 'image/jpeg',
                        caption: rawItem.details?.caption || '',
                        sender: rawItem.sender,
                        source: 'raw_store'
                    };
                }
            } catch (err) {
                addLog('resolve_layer2_error', stanzaId, { error: err.message });
            }
        }
    }

    // ===== LAYER 3: Quoted Message Fallback =====
    if (quoted) {
        try {
            const fakeWAMessage = {
                key: { id: stanzaId || 'unknown' },
                message: quoted
            };
            let buffer = null;
            try {
                buffer = await downloadMediaMessage(fakeWAMessage, 'buffer', {}, {
                    logger: sock?.logger,
                    reuploadRequest: typeof sock?.updateMediaMessage === 'function' ? sock.updateMediaMessage.bind(sock) : undefined
                });
            } catch (_) {}

            if (!buffer) {
                const norm = normalizeMessageContent(quoted);
                const type = getContentType(norm);
                if (type && norm[type]) {
                    const media = norm[type];
                    const stream = await downloadContentFromMessage(media, type.replace('Message', ''));
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    buffer = Buffer.concat(chunks);
                }
            }

            if (buffer && buffer.length > 0) {
                addLog('resolve_layer3_hit_quoted', stanzaId);
                const norm = normalizeMessageContent(quoted);
                const type = getContentType(norm) || 'imageMessage';
                const mediaType = type.replace('Message', '');
                return {
                    layer: 3,
                    buffer,
                    mediaType,
                    mimetype: mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'audio/mp4',
                    caption: norm?.[type]?.caption || '',
                    source: 'quoted_context'
                };
            }
        } catch (err) {
            addLog('resolve_layer3_error', stanzaId, { error: err.message });
        }
    }

    addLog('resolve_all_layers_failed', stanzaId, {
        cacheKeysCount: mediaCache.size,
        storeKeysCount: rawStore.size
    });
    return null;
}

function getRawMessage(id) {
    if (!id) return undefined;
    const item = rawStore.get(id);
    return item?.msg?.message || undefined;
}

function getDebugStatus() {
    return {
        mediaCacheSize: mediaCache.size,
        rawStoreSize: rawStore.size,
        mediaCacheKeys: Array.from(mediaCache.keys()).slice(-15),
        rawStoreKeys: Array.from(rawStore.keys()).slice(-15),
        autoVV: isAutoVVEnabled(),
        recentLogs: debugLogs.slice(-25)
    };
}

module.exports = {
    processIncoming,
    resolveMedia,
    isViewOnceMessage,
    extractMediaDetails,
    getRawMessage,
    getDebugStatus,
    isAutoVVEnabled,
    setAutoVV,
    loadConfig,
    saveConfig
};
