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
 * Robust 6-level recursive unwrap for all WhatsApp wrappers
 * Handles: viewOnceMessage, viewOnceMessageV2, viewOnceMessageV2Extension (Voice Notes!),
 * ephemeralMessage, documentWithCaptionMessage, groupStatusMessageV2, deviceSentMessage
 */
function unwrapMessage(message) {
    let cur = message;
    let isViewOnce = false;

    for (let i = 0; i < 6 && cur; i++) {
        const vo =
            cur.viewOnceMessage ||
            cur.viewOnceMessageV2 ||
            cur.viewOnceMessageV2Extension;

        if (vo?.message) {
            isViewOnce = true;
            cur = vo.message;
            continue;
        }

        const wrap =
            cur.ephemeralMessage ||
            cur.documentWithCaptionMessage ||
            cur.groupStatusMessageV2 ||
            cur.deviceSentMessage;

        if (wrap?.message) {
            cur = wrap.message;
            continue;
        }

        break;
    }

    const type = cur?.imageMessage
        ? 'image'
        : cur?.videoMessage
            ? 'video'
            : cur?.audioMessage
                ? 'audio'
                : null;

    const media = type ? cur[`${type}Message`] : null;

    return { cur, type, media, isViewOnce };
}

/**
 * Checks if a message is a View-Once message across all known WhatsApp wrappers
 */
function isViewOnceMessage(msg) {
    if (!msg || !msg.message) return false;
    const { isViewOnce, type, media } = unwrapMessage(msg.message);
    if (isViewOnce) return true;
    if (type && media?.viewOnce === true) return true;
    return false;
}

/**
 * Extracts normalized media details from a message
 */
function extractMediaDetails(msg) {
    if (!msg || !msg.message) return null;
    try {
        const unwrapped = unwrapMessage(msg.message);
        if (!unwrapped.type || !unwrapped.media) return null;

        const mediaObj = unwrapped.media;
        const mediaType = unwrapped.type;
        return {
            mediaType,
            mediaObj,
            caption: mediaObj.caption || '',
            mimetype: mediaObj.mimetype || (mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'audio/ogg; codecs=opus'),
            ptt: !!mediaObj.ptt
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

            // Layer 4: Auto-VV Forward to Owner's "You" chat if enabled
            if (isAutoVVEnabled()) {
                await autoForwardToOwner(sock, msg, cachedItem, opts);
            }

            // Memory Shield: Free heavy buffer from RAM once saved to disk. resolveMedia will read from diskPath.
            delete cachedItem.buffer;
            mediaCache.set(msgId, cachedItem);
            if (mediaCache.size > 50) {
                const oldest = mediaCache.keys().next().value;
                mediaCache.delete(oldest);
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
 * Checks: Layer 1 (Cache) -> Multi-Source Unwrapped Stream & Download (Layer 2 & 3)
 */
async function resolveMedia({ quoted, stanzaId, from, sock, participant, rawQuotedMessage }) {
    console.log(`[ViewOnceManager] Resolving media for stanzaId: ${stanzaId || 'none'}`);

    // ===== LAYER 1: Check In-Memory Buffer Cache =====
    if (stanzaId && mediaCache.has(stanzaId)) {
        const item = mediaCache.get(stanzaId);
        let buf = item.buffer;
        if (!buf && item.diskPath && fs.existsSync(item.diskPath)) {
            try { buf = await fs.promises.readFile(item.diskPath); } catch (_) {}
        }
        if (buf && buf.length > 0) {
            addLog('resolve_layer1_hit_ram', stanzaId);
            return {
                layer: 1,
                buffer: buf,
                mediaType: item.mediaType,
                mimetype: item.mimetype,
                caption: item.caption,
                sender: item.sender,
                ptt: !!item.ptt,
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
                            mimetype: mType === 'image' ? 'image/jpeg' : mType === 'video' ? 'video/mp4' : 'audio/ogg; codecs=opus',
                            caption: '',
                            ptt: ext === 'opus' || ext === 'mp3',
                            source: 'cache_disk'
                        };
                    }
                } catch (_) {}
            }
        }
    }

    // ===== MULTI-SOURCE RETRIEVAL (xlicon-v2-md Technique) =====
    const vvKey = {
        remoteJid: from,
        id: stanzaId || 'unknown',
        ...(participant ? { participant } : {})
    };

    const storedRaw = stanzaId ? rawStore.get(stanzaId)?.msg : null;
    const storedCopy = storedRaw?.message || (typeof global.getMessage === 'function' ? global.getMessage(vvKey) : null);

    const sources = [
        storedCopy,
        rawQuotedMessage,
        quoted,
        quoted?.viewOnceMessage?.message,
        quoted?.viewOnceMessageV2?.message,
        quoted?.viewOnceMessageV2Extension?.message,
        quoted?.message
    ].filter(Boolean);

    for (const source of sources) {
        const unwrapped = unwrapMessage(source);
        if (!unwrapped.type || !unwrapped.media) continue;

        const media = unwrapped.media;
        let downloadedBuffer = null;

        // 1. Primary: downloadMediaMessage with vvKey (triggers sock.updateMediaMessage if reupload needed)
        try {
            downloadedBuffer = await downloadMediaMessage(
                {
                    key: vvKey,
                    message: unwrapped.cur
                },
                'buffer',
                {},
                {
                    logger: sock?.logger,
                    reuploadRequest: typeof sock?.updateMediaMessage === 'function' ? sock.updateMediaMessage.bind(sock) : undefined
                }
            );
        } catch (_) {}

        // 2. Secondary: direct stream downloadContentFromMessage
        if ((!downloadedBuffer || downloadedBuffer.length === 0) && media.mediaKey && (media.directPath || media.url)) {
            try {
                const stream = await downloadContentFromMessage(media, unwrapped.type);
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                downloadedBuffer = Buffer.concat(chunks);
            } catch (_) {}
        }

        if (Buffer.isBuffer(downloadedBuffer) && downloadedBuffer.length > 0) {
            addLog('resolve_multisource_success', stanzaId);
            const ext = unwrapped.type === 'image' ? 'jpg' : unwrapped.type === 'video' ? 'mp4' : 'mp3';
            if (stanzaId) {
                const diskPath = path.join(TEMP_VO_DIR, `${stanzaId}.${ext}`);
                try { await fs.promises.writeFile(diskPath, downloadedBuffer); } catch (_) {}
                mediaCache.set(stanzaId, {
                    id: stanzaId,
                    mediaType: unwrapped.type,
                    buffer: downloadedBuffer,
                    caption: media.caption || '',
                    mimetype: media.mimetype || (unwrapped.type === 'image' ? 'image/jpeg' : unwrapped.type === 'video' ? 'video/mp4' : 'audio/ogg; codecs=opus'),
                    ptt: !!media.ptt,
                    timestamp: Date.now()
                });
            }

            return {
                layer: 2,
                buffer: downloadedBuffer,
                mediaType: unwrapped.type,
                mimetype: media.mimetype || (unwrapped.type === 'image' ? 'image/jpeg' : unwrapped.type === 'video' ? 'video/mp4' : 'audio/ogg; codecs=opus'),
                caption: media.caption || '',
                ptt: !!media.ptt,
                source: 'multisource_unwrapped'
            };
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
