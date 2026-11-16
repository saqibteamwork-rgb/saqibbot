// commands/yt.js
'use strict';

/**
 * YouTube Downloader Engine (YTMP3 & YTMP4) - High Reliability Multi-Tier Edition
 * Features:
 * - Multi-source ytdlAuto: ytdl-lite + savetube.vip + savenow direct
 * - Proper RFC 'audio/mpeg' mimetype for seamless WhatsApp native audio playback
 * - In-Memory Link Cache for instant repeated requests
 * - Extended 75s download timeout + native fetch fallback to avoid timeout drops
 * - Commands:
 *     Audio: .play, .song, .ytmp3, .yta, .audio, .mp3, .music
 *     Video: .video, .ytmp4, .ytv, .yt, .ytdl, .mp4
 */

const axios = require('axios');
const yts = require('yt-search');
const ytdl = require('ytdl-lite');
const fsSync = require('fs');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const settings = require('../settings');
const { ytdlAuto } = require('../lib/ytdlScraper');

// 30-minute in-memory cache for ultra-smooth re-requests
const linkCache = new Map();

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
];

function isYoutubeUrl(text) {
    const patterns = [
        /youtube\.com\/watch\?v=/,
        /youtu\.be\//,
        /youtube\.com\/shorts\//,
        /youtube\.com\/embed\//,
        /m\.youtube\.com\/watch\?v=/
    ];
    return patterns.some(pattern => pattern.test(text));
}

/**
 * Parse duration string (e.g. "3:45", "1:02:15") into total seconds
 */
function parseDurationToSeconds(durationStr) {
    if (!durationStr || typeof durationStr !== 'string') return 0;
    const parts = durationStr.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

/**
 * High-Speed YouTube Search (Resolves in ~1s)
 */
async function searchYoutube(query) {
    // 1. Primary: yt-search
    try {
        const search = await yts(query);
        if (search?.videos?.length > 0) {
            const v = search.videos[0];
            return {
                title: v.title,
                url: v.url,
                author: v.author?.name || 'YouTube Creator',
                thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
                duration: v.timestamp || '0:00',
                seconds: v.seconds || parseDurationToSeconds(v.timestamp)
            };
        }
    } catch {}

    // 2. Fallback: ytdl-lite search
    try {
        const results = await ytdl.search(query, 1);
        if (results && results.length > 0) {
            const v = results[0];
            return {
                title: v.title || query,
                url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
                author: v.author || 'YouTube Creator',
                thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
                duration: v.duration || '0:00',
                seconds: parseDurationToSeconds(v.duration)
            };
        }
    } catch {}

    throw new Error('Koi video nahi mili. Baraye meharbani title ya link dobara check karein.');
}

/**
 * Resolves Video / Audio Stream Links with Multi-Tier Fallback & Cache
 */
async function getYoutubeDownloadLinks(url, type = 'mp4') {
    const isAudio = (type === 'mp3' || type === 'audio');
    const format = isAudio ? 'mp3' : '360';

    // Check memory cache first (instant response)
    const cacheKey = `${type}:${url}`;
    const cached = linkCache.get(cacheKey);
    if (cached && (Date.now() - cached.time < 30 * 60 * 1000)) {
        return cached.data;
    }

    try {
        const result = await ytdlAuto(url, format);
        if (result && result.status && result.download_url) {
            const resultData = {
                title: result.title || 'YouTube Media',
                author: result.author || 'YouTube Creator',
                thumbnail: result.thumbnail || null,
                duration: result.duration || null,
                mp3: isAudio ? result.download_url : null,
                mp4: isAudio ? null : result.download_url,
                engine: 'multi-source-ytdl'
            };
            linkCache.set(cacheKey, { time: Date.now(), data: resultData });
            return resultData;
        }
    } catch (e) {
        console.warn(`[YouTube DL] ytdlAuto error: ${e.message}`);
    }

    throw new Error('Download link generate nahi ho saka. Baraye meharbani kuch dair baad dobara koshish karein.');
}

/**
 * Resilient Binary Buffer Downloader (Axios with Node.js fetch fallback)
 * Uses y2down.cc headers to guarantee full media bytes instead of HTML bot gates.
 */
async function downloadMediaBuffer(url, timeoutMs = 90000) {
    const headers = {
        'User-Agent': USER_AGENTS[0],
        'Referer': 'https://y2down.cc/',
        'Origin': 'https://y2down.cc',
        'Accept': '*/*'
    };

    try {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: timeoutMs,
            headers
        });
        const ct = String(res.headers['content-type'] || '').toLowerCase();
        if (ct.includes('text/html') || ct.includes('application/json')) {
            throw new Error(`Invalid media content-type: ${ct}`);
        }
        if (res.data && res.data.length > 5000) {
            return Buffer.from(res.data);
        }
    } catch (err) {
        console.warn('[downloadMediaBuffer Axios Warning]:', err.message);
    }

    // Secondary fallback: Native fetch
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const fRes = await fetch(url, {
            headers,
            signal: ctrl.signal
        });
        clearTimeout(timer);
        if (fRes.ok) {
            const ct = String(fRes.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('text/html') || ct.includes('application/json')) {
                throw new Error(`Invalid media content-type: ${ct}`);
            }
            const ab = await fRes.arrayBuffer();
            if (ab && ab.byteLength > 5000) {
                return Buffer.from(ab);
            }
        }
    } catch (fErr) {
        console.warn('[downloadMediaBuffer Fetch Warning]:', fErr.message);
    }

    return null;
}

/**
 * Resilient File-Based Downloader for Video (Streams chunk-by-chunk to disk)
 * Avoids Node.js 50MB arraybuffer heap crashes and guarantees genuine MP4 container.
 */
async function downloadMediaToFile(url, destPath, timeoutMs = 180000) {
    const headers = {
        'User-Agent': USER_AGENTS[0],
        'Referer': 'https://y2down.cc/',
        'Origin': 'https://y2down.cc',
        'Accept': '*/*'
    };

    // Primary: Axios streaming directly to disk
    try {
        const res = await axios({
            method: 'GET',
            url,
            responseType: 'stream',
            timeout: timeoutMs,
            headers
        });

        const ct = String(res.headers['content-type'] || '').toLowerCase();
        if (ct.includes('text/html') || ct.includes('application/json')) {
            throw new Error(`Server returned non-media content type (${ct})`);
        }

        const ws = fsSync.createWriteStream(destPath);
        res.data.pipe(ws);

        await new Promise((resolve, reject) => {
            ws.on('finish', resolve);
            ws.on('error', reject);
            res.data.on('error', reject);
        });

        if (fsSync.existsSync(destPath)) {
            const size = fsSync.statSync(destPath).size;
            if (size > 50000) {
                // Verify not an HTML error file
                const fd = fsSync.openSync(destPath, 'r');
                const headBuf = Buffer.alloc(100);
                fsSync.readSync(fd, headBuf, 0, 100, 0);
                fsSync.closeSync(fd);
                const headStr = headBuf.toString('utf8').toLowerCase();
                if (headStr.includes('<!doctype') || headStr.includes('<html')) {
                    throw new Error('Downloaded file contains HTML bot challenge.');
                }
                return { success: true, size };
            }
        }
    } catch (err) {
        console.warn('[downloadMediaToFile Axios Stream Warning]:', err.message);
        try { if (fsSync.existsSync(destPath)) fsSync.unlinkSync(destPath); } catch (_) {}
    }

    // Secondary fallback: Native fetch streaming
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const fRes = await fetch(url, {
            headers,
            signal: ctrl.signal
        });
        clearTimeout(timer);

        if (fRes.ok && fRes.body) {
            const { pipeline } = require('stream/promises');
            const { Readable } = require('stream');
            const ws = fsSync.createWriteStream(destPath);
            await pipeline(Readable.fromWeb(fRes.body), ws);

            if (fsSync.existsSync(destPath) && fsSync.statSync(destPath).size > 50000) {
                return { success: true, size: fsSync.statSync(destPath).size };
            }
        }
    } catch (fErr) {
        console.warn('[downloadMediaToFile Fetch Stream Warning]:', fErr.message);
        try { if (fsSync.existsSync(destPath)) fsSync.unlinkSync(destPath); } catch (_) {}
    }

    return { success: false };
}

/**
 * .ytmp3 / .song / .play / .yta / .audio / .mp3 / .music
 * Ultra-Fast Playable Audio Downloader
 */
async function ytmp3Command(sock, from, msg, args = []) {
    const query = args.join(' ').trim();
    if (!query) {
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 🎵 *YOUTUBE AUDIO PLAYER* 〕━━━┈⊷
┃ 📌 *Usage:*
┃ 👉 *.play <song name ya youtube link>*
┃ 👉 *.song <song name>*
┃ 👉 *.ytmp3 <youtube link>*
┃
┃ 💡 *Example:*
┃ .play faasle kaavish
┃ .song despacito
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *${settings.botName || 'MR SAQIB MD'}*`
        }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

    try {
        let videoInfo;
        if (isYoutubeUrl(query)) {
            videoInfo = { url: query, title: 'YouTube Audio', thumbnail: null, seconds: 0 };
        } else {
            videoInfo = await searchYoutube(query);
        }

        // Safety: Avoid multi-hour live streams that crash server memory (> 20 mins)
        if (videoInfo.seconds && videoInfo.seconds > 1200) {
            await sock.sendMessage(from, { react: { text: '⚠️', key: msg.key } }).catch(() => {});
            return await sock.sendMessage(from, {
                text: `⚠️ *Song Bohat Lamba Hai:* (${videoInfo.duration})\nServer par bot ko crash hone se bachane ke liye 20 minutes se chhota song select karein.`
            }, { quoted: msg });
        }

        const dlData = await getYoutubeDownloadLinks(videoInfo.url, 'mp3');
        const audioUrl = dlData.mp3;
        if (!audioUrl) throw new Error('Audio stream link generate nahi hua.');

        const finalTitle = dlData.title || videoInfo.title || 'audio';
        const cleanTitle = finalTitle.replace(/[\\/:*?"<>|]/g, '').slice(0, 60);

        // 1. Send Beautiful Song Info Card with Cover Art
        const thumbUrl = dlData.thumbnail || videoInfo.thumbnail || settings.websiteThumbnail;
        if (thumbUrl) {
            await sock.sendMessage(from, {
                image: { url: thumbUrl },
                caption:
`╭━━━〔 🎵 *${settings.botName || 'MR SAQIB MD'} PLAYER* 〕━━━┈⊷
┃ 📌 *Title:* ${finalTitle}
┃ 👤 *Channel:* ${dlData.author || videoInfo.author || 'YouTube'}
┃ ⏱️ *Duration:* ${videoInfo.duration || 'N/A'}
┃ ⚡ *Status:* Downloading Audio...
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
            }, { quoted: msg }).catch(() => {});
        }

        // 2. Fetch Audio Buffer directly for 100% Baileys delivery
        const audioBuffer = await downloadMediaBuffer(audioUrl, 75000);

        // 3. Send Playable Audio with proper 'audio/mpeg' mimetype
        if (audioBuffer && audioBuffer.length > 0) {
            await sock.sendMessage(from, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${cleanTitle}.mp3`,
                ptt: false
            }, { quoted: msg });
        } else {
            // Stream URL fallback if buffer fetch failed
            await sock.sendMessage(from, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg',
                fileName: `${cleanTitle}.mp3`,
                ptt: false
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '🎶', key: msg.key } }).catch(() => {});

    } catch (err) {
        console.error('[YTMP3 Error]:', err.message);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, {
            text: `❌ *Audio download fail ho gayi:*\n_${err.message}_`
        }, { quoted: msg });
    }
}

/**
 * .ytmp4 / .video / .ytv / .yt / .ytdl / .mp4
 * High-Quality Video Downloader
 */
async function ytmp4Command(sock, from, msg, args = []) {
    const query = args.join(' ').trim();
    if (!query) {
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 🎬 *YOUTUBE MP4 VIDEO DOWNLOADER* 〕━━━┈⊷
┃ 📌 *Usage:*
┃ 👉 *.ytmp4 <video name ya youtube link>*
┃ 👉 *.video <video name>*
┃ 👉 *.yt <video name>*
┃
┃ 💡 *Example:*
┃ .video faasle kaavish
┃ .ytmp4 https://youtu.be/...
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *${settings.botName || 'MR SAQIB MD'}*`
        }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

    try {
        let videoInfo;
        if (isYoutubeUrl(query)) {
            videoInfo = { url: query, title: 'YouTube Video', thumbnail: null, seconds: 0 };
        } else {
            videoInfo = await searchYoutube(query);
        }

        // Safety: Avoid multi-hour videos
        if (videoInfo.seconds && videoInfo.seconds > 1200) {
            await sock.sendMessage(from, { react: { text: '⚠️', key: msg.key } }).catch(() => {});
            return await sock.sendMessage(from, {
                text: `⚠️ *Video Bohat Lambi Hai:* (${videoInfo.duration})\nServer memory limit ke mutabiq 20 minutes se kam video download karein.`
            }, { quoted: msg });
        }

        const dlData = await getYoutubeDownloadLinks(videoInfo.url, 'mp4');
        const videoUrl = dlData.mp4;
        if (!videoUrl) throw new Error('Video stream link generate nahi hua.');

        const finalTitle = dlData.title || videoInfo.title || 'video';
        const cleanTitle = finalTitle.replace(/[\\/:*?"<>|]/g, '').slice(0, 60);

        const caption =
`╭━━━〔 🎬 *YOUTUBE VIDEO* 〕━━━┈⊷
┃ 📌 *Title:* ${finalTitle}
┃ 👤 *Channel:* ${dlData.author || videoInfo.author || 'YouTube'}
┃ ⚡ *Powered by:* ${settings.botName || 'MR SAQIB MD'}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

        // Download to temp file on disk for rock-solid Baileys video delivery without memory exhaustion
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fsSync.existsSync(tempDir)) fsSync.mkdirSync(tempDir, { recursive: true });
        const tempFileName = `yt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.mp4`;
        const tempFilePath = path.join(tempDir, tempFileName);

        try {
            const dlResult = await downloadMediaToFile(videoUrl, tempFilePath, 180000);

            if (dlResult.success && fsSync.existsSync(tempFilePath)) {
                const videoBuffer = await fs.readFile(tempFilePath);
                await sock.sendMessage(from, {
                    video: videoBuffer,
                    mimetype: 'video/mp4',
                    fileName: `${cleanTitle}.mp4`,
                    caption
                }, { quoted: msg });
            } else {
                // Secondary URL Stream fallback
                await sock.sendMessage(from, {
                    video: { url: videoUrl },
                    mimetype: 'video/mp4',
                    fileName: `${cleanTitle}.mp4`,
                    caption
                }, { quoted: msg });
            }
        } finally {
            try {
                if (fsSync.existsSync(tempFilePath)) {
                    await fs.unlink(tempFilePath);
                }
            } catch (_) {}
        }

        await sock.sendMessage(from, { react: { text: '🎬', key: msg.key } }).catch(() => {});

    } catch (err) {
        console.error('[YTMP4 Error]:', err.message);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, {
            text: `❌ *Video download fail ho gayi:*\n_${err.message}_`
        }, { quoted: msg });
    }
}

module.exports = {
    ytmp3Command,
    ytmp4Command
};
