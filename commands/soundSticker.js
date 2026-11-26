'use strict';

/**
 * MR SAQIB MD :: WhatsApp Native Sound Sticker Creator (.ssound / .stickersound)
 * ============================================================================
 * Creates genuine WhatsApp Sound Stickers (field 134 audioStickerMessage) from:
 *  - Replied Sticker / Photo / Short Video + Built-in SFX preset (sigma, boom, fah, ...)
 *  - Replied Sticker / Photo + YouTube Song / Audio Link (.ssound <song name / url>)
 *  - Two-step Sticker + Voice Note / MP3 pairing in chat
 *  - Short Video (<= 15s) -> Animated Sticker + its own audio track
 *  - .ssound get / extract -> Downloads playable audio from an incoming Sound Sticker
 * ============================================================================
 */

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const axios = require('axios');
const sharp = require('sharp');
const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');
const { sendSoundStickerMessage } = require('../lib/soundStickerProto');

let webpmux = null;
try { webpmux = require('node-webpmux'); } catch (_) {}

function resolveFfmpegBin() {
    try {
        const ff = require('ffmpeg-static');
        if (ff && fs.existsSync(ff)) return ff;
    } catch (_) {}
    try {
        const ff2 = require('@ffmpeg-installer/ffmpeg');
        if (ff2?.path && fs.existsSync(ff2.path)) return ff2.path;
    } catch (_) {}
    return 'ffmpeg';
}

const FFMPEG_BIN = resolveFfmpegBin();
const SFX_DIR = path.join(__dirname, '..', 'assets', 'sfx');
const DEFAULT_STICKER_PATH = path.join(SFX_DIR, 'default_sticker.webp');
const MAX_AUDIO_BYTES = 920000;
const PENDING_TTL_MS = 5 * 60 * 1000;

const PRESET_LIST = [
    { key: 'sigma', file: 'sigma.ogg', emoji: '🗿', label: 'Sigma Boy Meme' },
    { key: 'malik', file: 'malik.ogg', emoji: '👑', label: 'Malik Viral Voice' },
    { key: 'famofc', file: 'famofc.ogg', emoji: '⚡', label: 'FAM OFC Track' },
    { key: 'bondo', file: 'bondo.ogg', emoji: '🔥', label: 'Bondo Dialogue' },
    { key: 'boom', file: 'boom.ogg', emoji: '💥', label: 'Vine Boom Impact' },
    { key: 'bruh', file: 'bruh.ogg', emoji: '😑', label: 'Bruh Sound' },
    { key: 'fah', file: 'fah.ogg', emoji: '📉', label: 'Fah Drop Horn' },
    { key: 'ding', file: 'ding.ogg', emoji: '🔔', label: 'Bright Notification Ding' },
    { key: 'sad', file: 'sad.ogg', emoji: '🎺', label: 'Sad Trombone' },
    { key: 'pad', file: 'pad.ogg', emoji: '🎧', label: 'Soft Ambient Pad' }
];

const PRESET_ALIASES = {
    faah: 'fah',
    vineboom: 'boom',
    vine: 'boom',
    chime: 'ding',
    bell: 'ding',
    bgm: 'pad',
    ambient: 'pad',
    trombone: 'sad',
    sigh: 'bruh'
};

// Bounded 5-min RAM pairer: lets user send Sticker + Voice in 2 quick messages
const pendingPairCache = new Map();

function capSetPending(key, patch) {
    const now = Date.now();
    for (const [k, v] of pendingPairCache.entries()) {
        if (now - v.updatedAt > PENDING_TTL_MS) pendingPairCache.delete(k);
    }
    if (pendingPairCache.size >= 60) {
        const first = pendingPairCache.keys().next().value;
        pendingPairCache.delete(first);
    }
    const prev = pendingPairCache.get(key) || {};
    const next = { ...prev, ...patch, updatedAt: now };
    pendingPairCache.set(key, next);
    return next;
}

function getCallerKey(from, msg) {
    const sender = msg?.key?.participant || msg?.key?.remoteJid || from;
    const normSender = sender ? jidNormalizedUser(sender).split('@')[0].split(':')[0] : 'anon';
    return `${from}:${normSender}`;
}

function runFfmpeg(args, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
        execFile(FFMPEG_BIN, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { timeout: timeoutMs }, (err, _out, stderr) => {
            if (err) {
                reject(new Error(String(stderr || err.message || 'FFmpeg failed').slice(0, 180)));
            } else {
                resolve();
            }
        });
    });
}

async function addStickerExif(webpBuffer, packname = 'MR SAQIB MD', author = 'MR SAQIB') {
    if (!webpmux) return webpBuffer;
    try {
        const img = new webpmux.Image();
        await img.load(webpBuffer);
        const json = {
            'sticker-pack-id': 'https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M',
            'sticker-pack-name': packname,
            'sticker-pack-publisher': author,
            emojis: ['🎵', '⚡', '👑']
        };
        const exifAttr = Buffer.from([
            0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
            0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x16, 0x00, 0x00, 0x00
        ]);
        const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
        const exif = Buffer.concat([exifAttr, jsonBuffer]);
        exif.writeUIntLE(jsonBuffer.length, 14, 4);
        img.exif = exif;
        return await img.save(null);
    } catch (_) {
        return webpBuffer;
    }
}

async function convertAnyToOpusOgg(inputBuf, maxSec = 18) {
    const tmpDir = os.tmpdir();
    const id = crypto.randomBytes(6).toString('hex');
    const inPath = path.join(tmpDir, `ssound_in_${id}`);
    const outPath = path.join(tmpDir, `ssound_out_${id}.ogg`);

    try {
        await fsp.writeFile(inPath, inputBuf);
        await runFfmpeg([
            '-i', inPath,
            '-vn', '-map', '0:a:0',
            '-t', String(maxSec),
            '-ac', '1', '-ar', '48000',
            '-c:a', 'libopus', '-b:a', '32k',
            '-f', 'ogg', outPath
        ]);
        let outBuf = await fsp.readFile(outPath);
        if (outBuf.length > MAX_AUDIO_BYTES) {
            await runFfmpeg([
                '-i', inPath,
                '-vn', '-map', '0:a:0',
                '-t', '14',
                '-ac', '1', '-ar', '48000',
                '-c:a', 'libopus', '-b:a', '20k',
                '-f', 'ogg', outPath
            ]);
            outBuf = await fsp.readFile(outPath);
        }
        return outBuf;
    } finally {
        await fsp.unlink(inPath).catch(() => {});
        await fsp.unlink(outPath).catch(() => {});
    }
}

async function imageBufferToWebpSticker(imgBuf) {
    const raw = await sharp(imgBuf)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 80 })
        .toBuffer();
    return addStickerExif(raw);
}

async function videoBufferToWebpSticker(vidBuf) {
    const tmpDir = os.tmpdir();
    const id = crypto.randomBytes(6).toString('hex');
    const inPath = path.join(tmpDir, `ssound_vid_${id}.mp4`);
    const outPath = path.join(tmpDir, `ssound_vid_${id}.webp`);
    try {
        await fsp.writeFile(inPath, vidBuf);
        await runFfmpeg([
            '-i', inPath,
            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=12,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=00000000',
            '-loop', '0', '-ss', '0', '-t', '10',
            '-preset', 'default', '-an', '-vsync', '0',
            outPath
        ]);
        const raw = await fsp.readFile(outPath);
        return addStickerExif(raw);
    } finally {
        await fsp.unlink(inPath).catch(() => {});
        await fsp.unlink(outPath).catch(() => {});
    }
}

function resolvePreset(query) {
    const clean = String(query || '').toLowerCase().trim();
    if (!clean) return null;
    let hit = null;
    if (/^\d+$/.test(clean)) {
        const idx = parseInt(clean, 10) - 1;
        if (idx >= 0 && idx < PRESET_LIST.length) hit = PRESET_LIST[idx];
    }
    if (!hit) {
        const mapped = PRESET_ALIASES[clean] || clean;
        hit = PRESET_LIST.find((p) => p.key === mapped) || null;
    }
    if (!hit) return null;
    const fp = path.join(SFX_DIR, hit.file);
    if (!fs.existsSync(fp)) return null;
    return { ...hit, buffer: fs.readFileSync(fp) };
}

function unwrapQuotedContent(quoted) {
    let cur = quoted;
    for (let i = 0; i < 6 && cur && typeof cur === 'object'; i++) {
        if (cur.ephemeralMessage?.message) { cur = cur.ephemeralMessage.message; continue; }
        if (cur.viewOnceMessage?.message) { cur = cur.viewOnceMessage.message; continue; }
        if (cur.viewOnceMessageV2?.message) { cur = cur.viewOnceMessageV2.message; continue; }
        if (cur.viewOnceMessageV2Extension?.message) { cur = cur.viewOnceMessageV2Extension.message; continue; }
        if (cur.audioStickerMessage?.message) { cur = cur.audioStickerMessage.message; continue; }
        break;
    }
    return cur || null;
}

async function downloadBaileysBuffer(mediaObj, kind) {
    const stream = await downloadContentFromMessage(mediaObj, kind);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

async function fetchSongClipBuffer(query) {
    let targetUrl = query;
    if (/^https?:\/\//i.test(query) && !/(youtube\.com|youtu\.be)/i.test(query)) {
        const r = await axios.get(query, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 15 * 1024 * 1024 });
        return Buffer.from(r.data);
    }
    if (!/(youtube\.com|youtu\.be)/i.test(targetUrl)) {
        const yts = require('yt-search');
        const sr = await yts(query);
        if (!sr?.videos?.length) throw new Error('Koi song / sound result nahi mila.');
        targetUrl = sr.videos[0].url;
    }
    const ytdl = require('ytdl-lite');
    const dl = await ytdl.ytmp3(targetUrl);
    if (!dl?.url) throw new Error('Song audio link extract nahi ho saka.');
    const res = await axios.get(dl.url, { responseType: 'arraybuffer', timeout: 25000, maxContentLength: 15 * 1024 * 1024 });
    return Buffer.from(res.data);
}

function buildUsageGuide(prefix = '.') {
    const presetLines = PRESET_LIST.map((p, i) => `┃ ${i + 1}. ${p.emoji} *${prefix}ssound ${p.key}* — ${p.label}`).join('\n');
    return (
        `╭━━━〔 🔊 *STICKER SOUND EFFECTS* 〕━━━┈⊷\n` +
        `┃ Ab kisi bhi *Sticker, Photo, ya Video* par\n` +
        `┃ WhatsApp ka *Sound Effect / Song* lagayein!\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
        `📌 *KAISE USE KAREIN:*\n` +
        `1️⃣ *Preset Sound:* Kisi sticker/photo par reply karein:\n` +
        `   👉 *${prefix}ssound sigma* | *boom* | *fah* | *malik*\n` +
        `2️⃣ *Apni Voice / Audio + Sticker:*\n` +
        `   • Pehle Voice/Audio par reply karke *${prefix}ssound* likhein\n` +
        `   • Phir Sticker/Photo par reply karke *${prefix}ssound* likhein!\n` +
        `3️⃣ *YouTube Song on Sticker:*\n` +
        `   👉 Sticker par reply karke *${prefix}ssound <song name>* likhein\n` +
        `4️⃣ *Video to Sound Sticker:*\n` +
        `   👉 Kisi short video (<=15s) par reply karke *${prefix}ssound* likhein!\n` +
        `5️⃣ *Extract Sound:* Sound sticker par reply *${prefix}ssound get*\n\n` +
        `🎵 *BUILT-IN PRESETS (Direct Bhi Chalega):*\n` +
        `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
        `${presetLines}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    );
}

async function soundStickerCommand(sock, from, msg, args = []) {
    try {
        const fullArg = (args || []).join(' ').trim();
        const lowerArg = fullArg.toLowerCase();

        if (['help', 'list', 'presets', 'guide'].includes(lowerArg)) {
            return await sock.sendMessage(from, { text: buildUsageGuide('.') }, { quoted: msg });
        }

        const quotedRaw =
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
            msg.message?.imageMessage?.contextInfo?.quotedMessage ||
            msg.message?.videoMessage?.contextInfo?.quotedMessage;
        const quoted = unwrapQuotedContent(quotedRaw);
        const direct = unwrapQuotedContent(msg.message);

        // Extract audio track from an incoming WhatsApp Sound Sticker
        if (['get', 'extract', 'audio', 'tomp3'].includes(lowerArg)) {
            const embeddedAudio = quoted?.stickerMessage?.audioMessage || quoted?.audioStickerMessage?.message?.stickerMessage?.audioMessage;
            if (!embeddedAudio?.url) {
                return await sock.sendMessage(from, {
                    text: '❌ Kisi *Sound Sticker* par reply karke `.ssound get` likhein!'
                }, { quoted: msg });
            }
            await sock.sendMessage(from, { react: { text: '🎵', key: msg.key } }).catch(() => {});
            const audioBuf = await downloadBaileysBuffer(embeddedAudio, 'audio');
            await sock.sendMessage(from, { audio: audioBuf, mimetype: 'audio/ogg; codecs=opus', ptt: false }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return;
        }

        const callerKey = getCallerKey(from, msg);
        const srcMedia = quoted || direct;

        const stickerMsg = srcMedia?.stickerMessage || null;
        const imageMsg = !stickerMsg ? srcMedia?.imageMessage || null : null;
        const videoMsg = (!stickerMsg && !imageMsg) ? srcMedia?.videoMessage || null : null;
        const audioMsg = srcMedia?.audioMessage || (srcMedia?.documentMessage && /^audio\//i.test(srcMedia.documentMessage.mimetype || '') ? srcMedia.documentMessage : null);

        // React processing immediately in background
        sock.sendMessage(from, { react: { text: '🔊', key: msg.key } }).catch(() => {});

        const presetMatch = fullArg ? resolvePreset(lowerArg) : null;

        // Case 1: Replied to a Voice Note / Audio / MP3
        if (audioMsg && !stickerMsg && !imageMsg && !videoMsg) {
            const rawAudio = await downloadBaileysBuffer(audioMsg, audioMsg === srcMedia?.documentMessage ? 'document' : 'audio');
            const cleanOgg = await convertAnyToOpusOgg(rawAudio, 18);
            const cached = capSetPending(callerKey, { audioBuffer: cleanOgg, audioSec: audioMsg.seconds || null });

            if (cached.stickerBuffer) {
                pendingPairCache.delete(callerKey);
                await sendSoundStickerMessage(sock, from, {
                    stickerBuffer: cached.stickerBuffer,
                    audioBuffer: cleanOgg,
                    durationSec: audioMsg.seconds || null,
                    emoji: '🎵',
                    quoted: msg
                });
                sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
                return;
            }
            return await sock.sendMessage(from, {
                text: '✅ *Audio saved!*\nAb kisi bhi *Sticker* ya *Photo* par reply karke `.ssound` likhein — Sound Sticker ban kar send ho jayega!'
            }, { quoted: msg });
        }

        // Case 2: Replied to a Short Video -> animated WebP sticker + audio track (or custom preset/song)
        if (videoMsg) {
            const vidSec = Number(videoMsg.seconds || 0);
            if (vidSec > 16) {
                return await sock.sendMessage(from, {
                    text: '⚠️ Video bohot lambi hai! Sound sticker ke liye maximum *15 seconds* tak ki video par reply karein.'
                }, { quoted: msg });
            }
            const rawVid = await downloadBaileysBuffer(videoMsg, 'video');
            const stickerWebp = await videoBufferToWebpSticker(rawVid);

            let audioOgg = null;
            let emoji = '🎬';
            if (presetMatch) {
                audioOgg = presetMatch.buffer;
                emoji = presetMatch.emoji;
            } else if (fullArg) {
                const songRaw = await fetchSongClipBuffer(fullArg);
                audioOgg = await convertAnyToOpusOgg(songRaw, 18);
            } else {
                const pending = pendingPairCache.get(callerKey);
                if (pending?.audioBuffer && Date.now() - pending.updatedAt <= PENDING_TTL_MS) {
                    audioOgg = pending.audioBuffer;
                    pendingPairCache.delete(callerKey);
                } else {
                    try {
                        audioOgg = await convertAnyToOpusOgg(rawVid, 15);
                    } catch (_) {
                        return await sock.sendMessage(from, {
                            text: '❌ Is video mein audio track nahi mila! Saath preset dein, jaise: `.ssound sigma`'
                        }, { quoted: msg });
                    }
                }
            }

            await sendSoundStickerMessage(sock, from, {
                stickerBuffer: stickerWebp,
                audioBuffer: audioOgg,
                durationSec: vidSec || null,
                emoji,
                quoted: msg
            });
            sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return;
        }

        // Case 3: Replied to a Sticker or Photo
        if (stickerMsg || imageMsg) {
            let stickerBuf;
            if (stickerMsg) {
                const rawSticker = await downloadBaileysBuffer(stickerMsg, 'sticker');
                stickerBuf = rawSticker;
            } else {
                const rawImg = await downloadBaileysBuffer(imageMsg, 'image');
                stickerBuf = await imageBufferToWebpSticker(rawImg);
            }

            let audioBuf = null;
            let emoji = '🎵';
            if (presetMatch) {
                audioBuf = presetMatch.buffer;
                emoji = presetMatch.emoji;
            } else if (fullArg) {
                const songRaw = await fetchSongClipBuffer(fullArg);
                audioBuf = await convertAnyToOpusOgg(songRaw, 18);
            } else {
                const pending = pendingPairCache.get(callerKey);
                if (pending?.audioBuffer && Date.now() - pending.updatedAt <= PENDING_TTL_MS) {
                    audioBuf = pending.audioBuffer;
                    pendingPairCache.delete(callerKey);
                } else {
                    capSetPending(callerKey, { stickerBuffer: stickerBuf });
                    return await sock.sendMessage(from, {
                        text: '✅ *Sticker saved!*\nAb:\n• Kisi *Voice / Audio* par reply karke `.ssound` likhein,\n• YA yahin likhein: `.ssound sigma` / `.ssound boom` / `.ssound fah`!'
                    }, { quoted: msg });
                }
            }

            await sendSoundStickerMessage(sock, from, {
                stickerBuffer: stickerBuf,
                audioBuffer: audioBuf,
                emoji,
                quoted: msg
            });
            sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return;
        }

        // Case 4: No quoted media — check if user passed a preset or song name
        if (presetMatch) {
            const pending = pendingPairCache.get(callerKey);
            const fallbackSticker = (pending?.stickerBuffer && Date.now() - pending.updatedAt <= PENDING_TTL_MS)
                ? pending.stickerBuffer
                : (fs.existsSync(DEFAULT_STICKER_PATH) ? fs.readFileSync(DEFAULT_STICKER_PATH) : null);

            if (!fallbackSticker) {
                return await sock.sendMessage(from, { text: buildUsageGuide('.') }, { quoted: msg });
            }
            if (pending?.stickerBuffer) pendingPairCache.delete(callerKey);

            await sendSoundStickerMessage(sock, from, {
                stickerBuffer: fallbackSticker,
                audioBuffer: presetMatch.buffer,
                emoji: presetMatch.emoji,
                quoted: msg
            });
            sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return;
        }

        if (fullArg) {
            const pending = pendingPairCache.get(callerKey);
            const targetSticker = (pending?.stickerBuffer && Date.now() - pending.updatedAt <= PENDING_TTL_MS)
                ? pending.stickerBuffer
                : (fs.existsSync(DEFAULT_STICKER_PATH) ? fs.readFileSync(DEFAULT_STICKER_PATH) : null);

            if (!targetSticker) {
                return await sock.sendMessage(from, { text: '❌ Pehle kisi Sticker par reply karke `.ssound ' + fullArg + '` likhein!' }, { quoted: msg });
            }
            const songRaw = await fetchSongClipBuffer(fullArg);
            const audioOgg = await convertAnyToOpusOgg(songRaw, 18);
            if (pending?.stickerBuffer) pendingPairCache.delete(callerKey);

            await sendSoundStickerMessage(sock, from, {
                stickerBuffer: targetSticker,
                audioBuffer: audioOgg,
                emoji: '🎵',
                quoted: msg
            });
            sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return;
        }

        return await sock.sendMessage(from, { text: buildUsageGuide('.') }, { quoted: msg });
    } catch (err) {
        console.error('[SoundSticker Error]:', err);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, {
            text: `❌ *Sound Sticker Error:* ${err.message || 'Conversion fail ho gayi.'}`
        }, { quoted: msg }).catch(() => {});
    }
}

module.exports = {
    soundStickerCommand,
    PRESET_LIST
};
