// lib/reactor.js
// Channel reactions straight through Baileys (no external API).
// - resolveChannelLink : channel link  -> real newsletter JID + post (server) id
// - reactViaBaileys    : one session reacts
// - reactAllSessions   : EVERY connected session reacts (used by .sreacts / .arcadd)

const { delay } = require('@whiskeysockets/baileys');

const CONFIG = {
    REACT_DELAY_MS: 1500,  // pause between sessions (anti rate-limit)
    JITTER_PCT: 0.5,
    MAX_ACCOUNTS: Number(process.env.MASS_MAX_SESSIONS) || 40   // sessions used per mass command (set MASS_MAX_SESSIONS to change)
};

// Used when the owner does not pass any emoji
const DEFAULT_EMOJIS = ['❤️', '🔥', '😍', '👍', '😂', '😮', '🥰', '🎉', '💯', '🙏', '😎', '✨'];

const sleepJitter = base => delay(Math.max(150, base + (Math.random() * 2 - 1) * base * CONFIG.JITTER_PCT));

// link -> jid cache (a channel JID never changes)
const jidCache = new Map();

function parseChannelLink(link) {
    const m = String(link || '').match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)(?:\/(\d+))?/i);
    if (!m) return null;
    return { inviteCode: m[1], serverId: m[2] || null };
}

// Works with any session socket (first working one is enough)
async function resolveChannelLink(sock, link) {
    try {
        const parsed = parseChannelLink(link);
        if (!parsed) return { ok: false, error: 'invalid channel link' };
        const { inviteCode, serverId } = parsed;

        let channelJid = jidCache.get(inviteCode) || null;
        if (!channelJid) {
            if (typeof sock.newsletterMetadata !== 'function') {
                return { ok: false, error: 'newsletterMetadata not supported in this Baileys version' };
            }
            const meta = await Promise.race([sock.newsletterMetadata('invite', inviteCode), new Promise((_, rej) => setTimeout(() => rej(new Error('channel lookup timeout')), 12000))]);
            channelJid = meta?.id || meta?.jid || null;
            if (channelJid) jidCache.set(inviteCode, channelJid);
        }
        if (!channelJid) return { ok: false, error: 'could not resolve channel JID' };

        return { ok: true, channelJid, serverId, inviteCode };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

async function reactViaBaileys(sock, channelJid, serverId, emoji) {
    try {
        if (typeof sock.newsletterReactMessage !== 'function') {
            return { ok: false, error: 'newsletterReactMessage not available in this Baileys version' };
        }
        await Promise.race([sock.newsletterReactMessage(channelJid, String(serverId), emoji), new Promise((_, rej) => setTimeout(() => rej(new Error('react timeout')), 15000))]);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}

// all connected sessions
function getConnectedSockets() {
    const list = [];
    const store = global.activeSockets;
    if (store && typeof store.forEach === 'function') {
        store.forEach((sock, number) => {
            if (sock && sock.user && sock.user.id) list.push({ number, sock });
        });
    }
    return list.slice(0, CONFIG.MAX_ACCOUNTS);
}

function getAccountStats() {
    const connected = getConnectedSockets();
    return { total: connected.length, numbers: connected.map(s => s.number) };
}

/**
 * Every connected session reacts to the post.
 * @param {string}   channelJid  xxxx@newsletter
 * @param {string}   serverId    post id from the link
 * @param {string[]} emojis      pool of emojis; [] = DEFAULT_EMOJIS random
 * @param {object}   opts        { mode: 'random' | 'cycle', follow: boolean, onProgress }
 */
async function reactAllSessions(channelJid, serverId, emojis, opts = {}) {
    const sessions = getConnectedSockets();
    if (!sessions.length) return { ok: false, error: 'no connected sessions', total: 0, success: 0, failed: 0 };

    const pool = (emojis && emojis.length) ? emojis : DEFAULT_EMOJIS;
    const mode = opts.mode || 'cycle';

    let success = 0, failed = 0;
    const used = {};
    const errors = {};

    for (let i = 0; i < sessions.length; i++) {
        const { sock } = sessions[i];
        const emoji = mode === 'cycle' ? pool[i % pool.length] : pool[Math.floor(Math.random() * pool.length)];

        if (opts.follow && typeof sock.newsletterFollow === 'function') {
            try { await sock.newsletterFollow(channelJid); } catch (_) { /* already following */ }
        }

        const r = await reactViaBaileys(sock, channelJid, serverId, emoji);
        if (r.ok) {
            success++;
            used[emoji] = (used[emoji] || 0) + 1;
        } else {
            failed++;
            const key = String(r.error || 'error').slice(0, 60);
            errors[key] = (errors[key] || 0) + 1;
        }
        if (typeof opts.onProgress === 'function') {
            try { opts.onProgress(i + 1, sessions.length, success, failed); } catch (_) {}
        }
        if (i < sessions.length - 1) await sleepJitter(CONFIG.REACT_DELAY_MS);
    }

    return { ok: success > 0, total: sessions.length, success, failed, used, errors };
}

// Every connected session reacts to a normal chat/group MESSAGE (reply-to-message mode)
async function reactAllToMessage(chatJid, key, emojis, opts = {}) {
    const sessions = getConnectedSockets();
    if (!sessions.length) return { ok: false, error: 'no connected sessions', total: 0, success: 0, failed: 0 };
    const pool = (emojis && emojis.length) ? emojis : DEFAULT_EMOJIS;
    const mode = opts.mode || 'cycle';
    let success = 0, failed = 0;
    const used = {}, errors = {};
    for (let i = 0; i < sessions.length; i++) {
        const { sock } = sessions[i];
        const emoji = mode === 'cycle' ? pool[i % pool.length] : pool[Math.floor(Math.random() * pool.length)];
        try {
            await sock.sendMessage(chatJid, { react: { text: emoji, key } });
            success++;
            used[emoji] = (used[emoji] || 0) + 1;
        } catch (e) {
            failed++;
            const k = String(e.message || 'error').slice(0, 60);
            errors[k] = (errors[k] || 0) + 1;
        }
        if (i < sessions.length - 1) await sleepJitter(CONFIG.REACT_DELAY_MS);
    }
    return { ok: success > 0, total: sessions.length, success, failed, used, errors };
}

// ─────────────── EMOJI -> STICKER (webp) ───────────────
// Emoji image comes from Twemoji (jsDelivr CDN), rendered with sharp. Everything is cached.
const svgCache = new Map();
const stickerCache = new Map();
const pngCache = new Map();

async function fetchEmojiSvg(emoji) {
    if (svgCache.has(emoji)) return svgCache.get(emoji);
    const axios = require('axios');
    const cps = Array.from(emoji).map(c => c.codePointAt(0).toString(16));
    const withFe = cps.join('-');
    const noFe = cps.filter(c => c !== 'fe0f').join('-');
    const names = [...new Set([cps.includes('200d') ? withFe : noFe, withFe, noFe])];
    for (const n of names) {
        try {
            const r = await axios.get(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${n}.svg`, { responseType: 'arraybuffer', timeout: 15000 });
            if (r.data && r.data.length > 50) { const svg = Buffer.from(r.data); svgCache.set(emoji, svg); return svg; }
        } catch (_) { /* try next name */ }
    }
    throw new Error('emoji image not found: ' + emoji);
}

async function emojiToSticker(emoji) {
    if (stickerCache.has(emoji)) return stickerCache.get(emoji);
    const sharp = require('sharp');
    const svg = await fetchEmojiSvg(emoji);
    const webp = await sharp(svg, { density: 400 })
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90 })
        .toBuffer();
    stickerCache.set(emoji, webp);
    return webp;
}

async function emojiPng(emoji, size) {
    const key = emoji + ':' + size;
    if (pngCache.has(key)) return pngCache.get(key);
    const sharp = require('sharp');
    const svg = await fetchEmojiSvg(emoji);
    const png = await sharp(svg, { density: Math.max(72, size * 3) })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    pngCache.set(key, png);
    return png;
}

// ─────────────── ANIMATED CIRCLE STICKER ───────────────
// Emojis fly up from the bottom and open into a circle (ring), then the ring spins + pulses.
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const circleCache = new Map();

function ffmpegBin() {
    try { return require('@ffmpeg-installer/ffmpeg').path; } catch (_) { return 'ffmpeg'; }
}

function runFfmpeg(args) {
    const { spawn } = require('child_process');
    return new Promise((resolve, reject) => {
        const p = spawn(ffmpegBin(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-10000); });
        p.on('error', reject);
        p.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg failed: ' + err.trim().split('\n').pop())));
    });
}

async function buildCircleSticker(emojis, opts = {}) {
    const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
    const sharp = require('sharp');
    const pool = (emojis && emojis.length) ? emojis : DEFAULT_EMOJIS;
    const count = Math.max(8, Math.min(14, opts.count || 10));
    const key = pool.join('') + '|' + count;
    if (circleCache.has(key)) return circleCache.get(key);

    const W = 512, F = 42, FPS = 15, ENTER = 12, SPIN_FROM = 26;
    const base = 88, R = 176, cx = W / 2, cy = W / 2;
    const items = Array.from({ length: count }, (_, i) => ({ emoji: pool[i % pool.length], start: Math.round(i * (14 / count)) }));

    const dir = path.join(os.tmpdir(), 'aman-circle-' + crypto.randomBytes(6).toString('hex'));
    fs.mkdirSync(dir, { recursive: true });
    try {
        for (let f = 0; f < F; f++) {
            const spin = f >= SPIN_FROM ? ((f - SPIN_FROM) / (F - SPIN_FROM)) * (2 * Math.PI / count) : 0;
            const pulse = f >= SPIN_FROM ? 1 + 0.06 * Math.sin(((f - SPIN_FROM) / (F - SPIN_FROM)) * 2 * Math.PI) : 1;
            const overlays = [];
            for (let i = 0; i < count; i++) {
                const p = Math.max(0, Math.min(1, (f - items[i].start) / ENTER));
                if (p <= 0) continue;
                const ang = -Math.PI / 2 + (2 * Math.PI * i) / count + spin;
                const tx = cx + R * Math.cos(ang), ty = cy + R * Math.sin(ang);
                const sx = cx, sy = W - base / 2;               // everything starts at the bottom centre
                const m = easeOutCubic(p);
                const x = sx + (tx - sx) * m, y = sy + (ty - sy) * m;
                const size = Math.max(16, Math.round(base * Math.max(0.2, easeOutBack(p)) * pulse / 4) * 4);
                const png = await emojiPng(items[i].emoji, size);
                overlays.push({
                    input: png,
                    left: Math.max(0, Math.min(W - size, Math.round(x - size / 2))),
                    top: Math.max(0, Math.min(W - size, Math.round(y - size / 2)))
                });
            }
            await sharp({ create: { width: W, height: W, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
                .composite(overlays)
                .png({ compressionLevel: 3 })
                .toFile(path.join(dir, `f${String(f).padStart(3, '0')}.png`));
        }

        // WhatsApp animated stickers must stay under ~500 KB -> step quality/size down until it fits
        const ladder = [{ s: 512, q: 60 }, { s: 512, q: 40 }, { s: 384, q: 45 }, { s: 320, q: 35 }, { s: 256, q: 30 }];
        let out = null;
        for (const step of ladder) {
            const file = path.join(dir, `out_${step.s}_${step.q}.webp`);
            // libwebp_anim clears old frames properly (plain libwebp leaves trails on transparent frames)
            const encode = enc => runFfmpeg([
                '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%03d.png'),
                '-vf', `scale=${step.s}:${step.s}:flags=lanczos,format=yuva420p`,
                '-c:v', enc, '-lossless', '0', '-q:v', String(step.q),
                '-compression_level', '4', '-loop', '0', '-an', file
            ]);
            try { await encode('libwebp_anim'); }
            catch (e1) { console.warn('[REACTOR] libwebp_anim unavailable, using libwebp:', e1.message); await encode('libwebp'); }
            const buf = fs.readFileSync(file);
            out = buf;
            if (buf.length <= 480 * 1024) break;
        }
        if (!out) throw new Error('circle sticker not created');
        circleCache.set(key, out);
        return out;
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
}

// Every connected session sends an emoji-sticker as a reply under the given message
async function stickerReactAll(chatJid, quoted, emojis, opts = {}) {
    const sessions = getConnectedSockets();
    if (!sessions.length) return { ok: false, error: 'no connected sessions', total: 0, success: 0, failed: 0 };
    const pool = (emojis && emojis.length) ? emojis : DEFAULT_EMOJIS;
    const mode = opts.mode || 'cycle';
    let success = 0, failed = 0;
    const used = {}, errors = {};
    for (let i = 0; i < sessions.length; i++) {
        const { sock } = sessions[i];
        const emoji = mode === 'cycle' ? pool[i % pool.length] : pool[Math.floor(Math.random() * pool.length)];
        try {
            const sticker = await emojiToSticker(emoji);
            await sock.sendMessage(chatJid, { sticker }, { quoted });
            success++;
            used[emoji] = (used[emoji] || 0) + 1;
        } catch (e) {
            failed++;
            const k = String(e.message || 'error').slice(0, 60);
            errors[k] = (errors[k] || 0) + 1;
        }
        if (i < sessions.length - 1) await sleepJitter(CONFIG.REACT_DELAY_MS);
    }
    return { ok: success > 0, total: sessions.length, success, failed, used, errors };
}

// Every connected session sends the animated circle sticker under the given message
async function circleStickerReactAll(chatJid, quoted, emojis, opts = {}) {
    const sessions = getConnectedSockets();
    if (!sessions.length) return { ok: false, error: 'no connected sessions', total: 0, success: 0, failed: 0 };
    let sticker;
    try { sticker = await buildCircleSticker(emojis, { count: sessions.length }); }
    catch (e) { return { ok: false, error: e.message, total: sessions.length, success: 0, failed: sessions.length, errors: { [String(e.message).slice(0, 60)]: sessions.length } }; }
    let success = 0, failed = 0;
    const errors = {};
    for (let i = 0; i < sessions.length; i++) {
        try {
            await sessions[i].sock.sendMessage(chatJid, { sticker }, { quoted });
            success++;
        } catch (e) {
            failed++;
            const k = String(e.message || 'error').slice(0, 60);
            errors[k] = (errors[k] || 0) + 1;
        }
        if (i < sessions.length - 1) await sleepJitter(CONFIG.REACT_DELAY_MS);
    }
    const pool = (emojis && emojis.length) ? emojis : DEFAULT_EMOJIS;
    const used = {}; pool.slice(0, 14).forEach(e => { used[e] = 1; });
    return { ok: success > 0, total: sessions.length, success, failed, used, errors, sizeKB: Math.round(sticker.length / 1024) };
}

// One mass command per chat every 25 s (returns seconds still to wait, or 0)
const massLast = new Map();
function massCooldown(key, ms = 25000) {
    const now = Date.now();
    const last = massLast.get(key) || 0;
    if (now - last < ms) return Math.ceil((ms - (now - last)) / 1000);
    massLast.set(key, now);
    if (massLast.size > 500) massLast.clear();
    return 0;
}

// kept for old callers
async function massReact(channelJid, serverId, emoji, onProgress) {
    return reactAllSessions(channelJid, serverId, [emoji], { onProgress });
}

// Pull emojis out of any text ("❤️🔥 😍,👍" -> ['❤️','🔥','😍','👍'])
function extractEmojis(text) {
    const src = String(text || '');
    const re = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;
    const found = src.match(re) || [];
    return [...new Set(found)];
}

module.exports = {
    CONFIG,
    DEFAULT_EMOJIS,
    parseChannelLink,
    resolveChannelLink,
    reactViaBaileys,
    reactAllSessions,
    reactAllToMessage,
    emojiToSticker,
    stickerReactAll,
    circleStickerReactAll,
    buildCircleSticker,
    massReact,
    getConnectedSockets,
    massCooldown,
    getAccountStats,
    extractEmojis
};
