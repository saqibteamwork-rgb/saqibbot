/**
 * ╭━━━[ MR SAQIB MD — MULTI-SOURCE YOUTUBE ENGINE ]━━━╮
 * ┃ Tier 1: ytdl-lite (Fastest, zero-dependency)
 * ┃ Tier 2: savetube.vip (AES Decrypted High-Speed CDN)
 * ┃ Tier 3: SaveNow Engine (Direct API Polling)
 * ┃ Supported: MP3 Audio & MP4 Video (360p / 720p)
 * ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
 */

'use strict';

const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const ytdl = require('ytdl-lite');

const agent = new https.Agent({ rejectUnauthorized: false });

// ═══════════════════════════════════════════════════════
// SOURCE 1: ytdl-lite Direct Stream Engine
// ═══════════════════════════════════════════════════════
async function ytdl_lite_engine(url, type = 'audio') {
    try {
        if (type === 'audio' || type === 'mp3') {
            const res = await ytdl.ytmp3(url);
            if (res && res.url) {
                return {
                    status: true,
                    title: res.title || 'YouTube Audio',
                    download_url: res.url,
                    thumbnail: res.thumbnail || '',
                    duration: res.duration || ''
                };
            }
        } else {
            const res = await ytdl.ytmp4(url, '360');
            if (res && res.url) {
                return {
                    status: true,
                    title: res.title || 'YouTube Video',
                    download_url: res.url,
                    thumbnail: res.thumbnail || '',
                    duration: res.duration || ''
                };
            }
        }
    } catch (e) {
        console.warn('[YTDL-Lite Engine Warning]:', e.message);
    }
    return { status: false };
}

// ═══════════════════════════════════════════════════════
// SOURCE 2: SaveTube.vip AES Decryption Engine (LIVE CDN)
// ═══════════════════════════════════════════════════════
const savetube = {
    api: {
        base: 'https://media.savetube.vip/api',
        cdn: '/random-cdn',
        info: '/v2/info',
        download: '/download'
    },
    headers: {
        accept: '*/*',
        'content-type': 'application/json',
        origin: 'https://save-tube.com',
        referer: 'https://save-tube.com/',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36'
    },
    crypto: {
        hexToBuffer: (hexString) => {
            const matches = hexString.match(/.{1,2}/g) || [];
            return Buffer.from(matches.join(''), 'hex');
        },
        decrypt: (enc) => {
            const secretKey = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
            const data = Buffer.from(enc, 'base64');
            const iv = data.slice(0, 16);
            const content = data.slice(16);
            const key = savetube.crypto.hexToBuffer(secretKey);
            const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
            let decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
            return JSON.parse(decrypted.toString());
        }
    },
    youtubeId: (url) => {
        if (!url) return null;
        const patterns = [
            /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
            /youtu\.be\/([a-zA-Z0-9_-]{11})/
        ];
        for (const p of patterns) {
            const match = url.match(p);
            if (match && match[1]) return match[1];
        }
        return null;
    },
    download: async (link, format = 'mp3') => {
        const id = savetube.youtubeId(link);
        if (!id) return { status: false };

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const { data: cdnRes } = await axios.get(savetube.api.base + savetube.api.cdn, {
                    headers: savetube.headers,
                    timeout: 8000
                });
                const cdn = cdnRes.cdn;
                if (!cdn) continue;

                const { data: infoRes } = await axios.post('https://' + cdn + savetube.api.info, {
                    url: 'https://www.youtube.com/watch?v=' + id
                }, { headers: savetube.headers, timeout: 12000 });

                if (!infoRes || !infoRes.data) continue;
                const decrypted = savetube.crypto.decrypt(infoRes.data);

                const isAudio = format === 'mp3' || format === 'audio';
                const { data: dlRes } = await axios.post('https://' + cdn + savetube.api.download, {
                    id,
                    downloadType: isAudio ? 'audio' : 'video',
                    quality: isAudio ? '128' : '360',
                    key: decrypted.key
                }, { headers: savetube.headers, timeout: 15000 });

                if (dlRes?.data?.downloadUrl) {
                    return {
                        status: true,
                        title: decrypted.title || 'YouTube Media',
                        download_url: dlRes.data.downloadUrl,
                        thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
                        duration: decrypted.duration || ''
                    };
                }
            } catch (err) {
                console.warn(`[savetube.vip attempt ${attempt}]:`, err.message);
            }
        }
        return { status: false };
    }
};

// ═══════════════════════════════════════════════════════
// SOURCE 3: SaveNow Engine (Direct Polling)
// ═══════════════════════════════════════════════════════
const SaveNow = {
    _api: 'https://p.savenow.to',
    _key: 'dfcb6d76f2f6a9894gjkege8a4ab232222',
    _agent: agent,
    poll: async (url, limit = 15) => {
        for (let i = 0; i < limit; i++) {
            try {
                const { data } = await axios.get(url, {
                    httpsAgent: SaveNow._agent,
                    timeout: 15000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                });
                if (data && data.success === 1 && data.download_url) return data;
                if (data && data.success === -1) break;
            } catch {}
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        return null;
    }
};

async function ytdlv3_savenow(url, res = 'mp3') {
    try {
        const format = res === 'audio' || res === 'mp3' ? 'mp3' : (res || '360');
        const { data: init } = await axios.get(`${SaveNow._api}/ajax/download.php`, {
            params: {
                copyright: 0,
                format,
                url,
                api: SaveNow._key
            },
            httpsAgent: SaveNow._agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'https://savenow.to/'
            },
            timeout: 20000
        });

        if (!init || !init.success || !init.progress_url) return { status: false };
        const result = await SaveNow.poll(init.progress_url);
        if (result && result.download_url) {
            return {
                status: true,
                title: init.info?.title || 'YouTube Media',
                download_url: result.download_url
            };
        }
        return { status: false };
    } catch {
        return { status: false };
    }
}

// ═══════════════════════════════════════════════════════
// MASTER MULTI-SOURCE YOUTUBE AUTO ENGINE
// ═══════════════════════════════════════════════════════
async function ytdlAuto(url, res = 'mp3') {
    console.log(`[YTDL-Engine] Attempting download for: ${url} (format: ${res})`);

    // Tier 1: ytdl-lite (Fastest, zero-config)
    try {
        const r1 = await ytdl_lite_engine(url, res);
        if (r1 && r1.status && r1.download_url) {
            console.log('[YTDL-Engine] ✅ Tier 1 (ytdl-lite) succeeded!');
            return r1;
        }
    } catch (e) {
        console.warn('[YTDL-Engine Tier 1 error]:', e.message);
    }

    // Tier 2: savetube.vip with AES Decryption
    try {
        const r2 = await savetube.download(url, res);
        if (r2 && r2.status && r2.download_url) {
            console.log('[YTDL-Engine] ✅ Tier 2 (savetube.vip) succeeded!');
            return r2;
        }
    } catch (e) {
        console.warn('[YTDL-Engine Tier 2 error]:', e.message);
    }

    // Tier 3: SaveNow Engine (Direct Polling)
    try {
        const r3 = await ytdlv3_savenow(url, res);
        if (r3 && r3.status && r3.download_url) {
            console.log('[YTDL-Engine] ✅ Tier 3 (savenow) succeeded!');
            return r3;
        }
    } catch (e) {
        console.warn('[YTDL-Engine Tier 3 error]:', e.message);
    }

    return { status: false, error: 'All YouTube download sources exhausted.' };
}

module.exports = {
    ytdlAuto,
    ytdl_lite_engine,
    savetube,
    SaveNow,
    ytdlv3_savenow
};
