// plugins/song.js
// MR SAQIB MD — Song download: LOCAL yt-dlp / ytdl-core first (no API), public APIs only as last fallback

const { cmd } = require('../arslan');
const config = require('../config');
const axios = require('axios');
const yts = require('yt-search');
const mediaDl = require('../lib/media-dl');

const CONFIG = {
    apiTimeout: 12000,
    downloadTimeout: 60000,
    maxAudioSize: 100 * 1024 * 1024,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getCobaltConfig() {
    const configuredUrl = String(process.env.COBALT_API_URL || '').trim();
    if (!configuredUrl) return null;
    try {
        const base = new URL(configuredUrl);
        if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) {
            console.warn('[SAQIB MUSIC] COBALT_API_URL must be an HTTP(S) instance URL without embedded credentials.');
            return null;
        }
        base.pathname = '/';
        base.search = '';
        base.hash = '';
        const headers = {};
        if (process.env.COBALT_API_KEY) headers.Authorization = `Api-Key ${process.env.COBALT_API_KEY}`;
        return { url: base.toString(), headers };
    } catch (_) {
        console.warn('[SAQIB MUSIC] COBALT_API_URL is not a valid URL.');
        return null;
    }
}

// ═══════════════════════════════════════════
//  MULTI-API AUDIO URL — 2026 working APIs
// ═══════════════════════════════════════════
async function getAudioUrl(youtubeUrl) {
    const enc = encodeURIComponent(youtubeUrl);
    const cobalt = getCobaltConfig();

    const apis = [
        // Use only a Cobalt instance the operator is authorized to access.
        ...(cobalt ? [{
            name: 'Cobalt (configured instance)',
            method: 'POST',
            url: cobalt.url,
            data: { url: youtubeUrl, downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '320' },
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', ...cobalt.headers },
            parse: d => ['tunnel', 'redirect'].includes(d?.status) && d?.url
                ? { download: d.url, title: String(d.filename || '').replace(/\.(?:mp3|ogg|wav|opus)$/i, '') || null }
                : null
        }] : []),
        // 2. Loader.to (reliable)
        {
            name: 'Loader.to',
            method: 'GET',
            url: `https://loader.to/ajax/download.php?format=mp3&url=${enc}`,
            parse: d => d?.id ? { download: `https://loader.to/ajax/progress.php?id=${d.id}`, title: d.title, needsFetch: true, id: d.id } : null
        },
        // 3. Y2Mate API
        {
            name: 'Y2Mate',
            method: 'POST',
            url: 'https://api.y2mate.com/api/convert',
            data: { url: youtubeUrl, format: 'mp3', quality: '320' },
            headers: { 'Content-Type': 'application/json' },
            parse: d => d?.downloadUrl ? { download: d.downloadUrl, title: d.title } : null
        },
        // 4. Direct cobalt mirror
        {
            name: 'Cobalt-Mirror',
            method: 'POST',
            url: 'https://co.wuk.sh/api/json',
            data: { url: youtubeUrl, isAudioOnly: true },
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            parse: d => d?.url ? { download: d.url, title: null } : null
        },
        // 5. YTMP3 via Vercel (community)
        {
            name: 'YTMP3-Community',
            method: 'GET',
            url: `https://yt-api-psi.vercel.app/api/ytmp3?url=${enc}`,
            parse: d => (d?.url || d?.download) ? { download: d.url || d.download, title: d.title } : null
        },
        // 6. Ryzen API
        {
            name: 'Ryzen',
            method: 'GET',
            url: `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${enc}`,
            parse: d => d?.url ? { download: d.url, title: d.title } : null
        },
        // 7. Optional — AlyaChan (Railway env)
        ...(process.env.ALYACHAN_API_KEY ? [{
            name: 'AlyaChan',
            method: 'GET',
            url: `https://api.alyachan.pro/api/ytmp3?url=${enc}&apikey=${encodeURIComponent(process.env.ALYACHAN_API_KEY)}`,
            parse: d => {
                const u = d?.result?.url || d?.result?.downloadUrl || d?.data?.url || d?.url;
                return u ? { download: u, title: d?.result?.title || d?.data?.title } : null;
            }
        }] : [])
    ];

    for (const api of apis) {
        try {
            console.log(`[SAQIB MUSIC] Trying ${api.name}`);

            const cfg = {
                method: api.method || 'GET',
                url: api.url,
                timeout: CONFIG.apiTimeout,
                headers: {
                    'User-Agent': CONFIG.userAgent,
                    'Accept': 'application/json',
                    ...(api.headers || {})
                }
            };
            if (api.data) cfg.data = api.data;

            const res = await axios(cfg);
            const result = api.parse(res.data);

            if (result?.download) {
                // some APIs need a secondary fetch (loader.to)
                if (result.needsFetch && result.id) {
                    const final = await resolveLoaderTo(result.id);
                    if (final) return { download: final, title: result.title };
                    continue;
                }
            console.log(`[SAQIB MUSIC] ✅ ${api.name} returned an audio link.`);
                return result;
            }
            console.warn(`[SAQIB MUSIC] ${api.name}: no download field`);
        } catch (err) {
            console.warn(`[SAQIB MUSIC] ${api.name} failed (${err.code || err.response?.status || 'request error'}).`);
        }
    }

    throw new Error('ALL_AUDIO_APIS_FAILED');
}

// ═══════════════════════════════════════════
//  LOADER.TO — secondary fetch for real URL
// ═══════════════════════════════════════════
async function resolveLoaderTo(id) {
    for (let i = 0; i < 10; i++) {
        try {
            await sleep(1000);
            const r = await axios.get(`https://loader.to/ajax/progress.php?id=${id}`, { timeout: 10000 });
            const d = r.data;
            if (d?.download_url) return d.download_url;
            if (d?.progress >= 1000 || d?.success) return d?.download_url || null;
        } catch (_) {}
    }
    return null;
}

function extractVideoId(url) {
    const m = String(url).match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
}

// ═══════════════════════════════════════════
//  DOWNLOAD AUDIO BUFFER (unchanged)
// ═══════════════════════════════════════════
async function downloadAudioBuffer(audioUrl) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await axios.get(audioUrl, {
                responseType: 'arraybuffer',
                timeout: CONFIG.downloadTimeout,
                maxRedirects: 10,
                maxContentLength: CONFIG.maxAudioSize,
                headers: {
                    'User-Agent': CONFIG.userAgent,
                    'Accept': 'audio/*, application/octet-stream, */*',
                    'Accept-Encoding': 'identity'
                }
            });

            const ct = String(res.headers['content-type'] || '').toLowerCase();
            const buf = Buffer.from(res.data);

            if (buf.length < 5000) throw new Error('Too small');
            if (ct.includes('text/html') || ct.includes('application/json') || ct.includes('text/plain')) {
                throw new Error('Invalid content-type');
            }

            const head = buf.subarray(0, 80).toString('utf8').trim().toLowerCase();
            if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('{"error')) {
                throw new Error('HTML/JSON error payload');
            }
            return buf;
        } catch (err) {
            lastError = err;
            console.error(`[SAQIB MUSIC] Download attempt ${attempt} failed (${err.code || err.response?.status || 'request error'}).`);
            if (attempt < 3) await sleep(1500);
        }
    }
    throw lastError || new Error('Download failed');
}

// ═══════════════════════════════════════════
//  SEARCH
// ═══════════════════════════════════════════
async function searchSong(query) {
    if (/youtube\.com|youtu\.be/i.test(query)) {
        const r = await yts(query);
        return r?.videos?.[0] || { url: query, title: 'YouTube Audio', timestamp: 'Unknown', author: { name: 'Unknown' } };
    }
    const r = await yts(query);
    if (!r?.videos?.length) throw new Error('NO_RESULT');
    return r.videos[0];
}

// ═══════════════════════════════════════════
//  .play / .song COMMAND
// ═══════════════════════════════════════════
cmd({
    pattern: 'song',
    alias: ['play', 'ytmp3', 'mp3', 'gana', 'music', 'audio'],
    desc: 'Download song audio',
    category: 'download',
    react: '🎵',
    use: '.play <song name>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const query = (ctx.q || '').trim();
    if (!query) {
        return ctx.reply(`🎵 *${config.BOT_NAME || 'MR SAQIB MD'} MUSIC*\n\nUse: .play song name\nExample: .play a song title`);
    }

    await conn.sendMessage(ctx.from, { react: { text: '⏳', key: mek.key } });

    let localReason = '';
    try {
        const video = await searchSong(query);

        const songCaption =
            `🎵 *${config.BOT_NAME || 'MR SAQIB MD'}*\n\n` +
            `📌 ${video.title}\n` +
            `🎤 ${video.author?.name || 'Unknown'}\n` +
            `⏱️ ${video.timestamp || 'Unknown'}\n\n` +
            `⬇️ Preparing audio…`;
        const thumbnail = video.thumbnail || video.image || video.thumbnails?.[0]?.url;
        if (thumbnail) {
            try {
                await conn.sendMessage(ctx.from, {
                    image: { url: thumbnail },
                    caption: songCaption
                }, { quoted: mek });
            } catch (thumbnailError) {
                console.warn('[SAQIB MUSIC] Thumbnail send failed:', thumbnailError.message);
                await conn.sendMessage(ctx.from, { text: songCaption }, { quoted: mek });
            }
        } else {
            await conn.sendMessage(ctx.from, { text: songCaption }, { quoted: mek });
        }

        const baseName = (video.title || 'SAQIB-Song').replace(/[\\/:*?"<>|]/g, '').slice(0, 100) || 'SAQIB-Song';
        let buffer = null;
        let ext = 'mp3';
        let finalTitle = baseName;

        // 1) LOCAL (no API): yt-dlp / ytdl-core
        try {
            const local = await mediaDl.downloadAudio(video.url, { fallbackQuery: video.title });
            buffer = local.buffer;
            ext = local.ext || 'mp3';
        } catch (localErr) {
            localReason = (localErr.details || [localErr.message]).slice(-3).join('\n');
            console.warn('[SAQIB MUSIC] Local download failed, trying API fallbacks:', (localErr.details || [localErr.message]).join(' | '));
        }

        // 2) LAST RESORT: public APIs (only if local method failed)
        if (!buffer) {
            let audioData;
            try { audioData = await getAudioUrl(video.url); }
            catch (apiErr) { apiErr.localReason = localReason; throw apiErr; }
            buffer = await downloadAudioBuffer(audioData.download);
            ext = 'mp3';
            if (audioData.title) finalTitle = String(audioData.title).replace(/[\\/:*?"<>|]/g, '').slice(0, 100) || baseName;
        }

        if (buffer.length > mediaDl.MAX_BYTES) throw new Error('TOO_LARGE');

        const mimeMap = { mp3: 'audio/mpeg', m4a: 'audio/mp4', opus: 'audio/ogg; codecs=opus', ogg: 'audio/ogg', webm: 'audio/webm' };

        await conn.sendMessage(ctx.from, {
            audio: buffer,
            mimetype: mimeMap[ext] || 'audio/mpeg',
            fileName: `${finalTitle}.${ext}`,
            ptt: false
        }, { quoted: mek });

        await conn.sendMessage(ctx.from, { react: { text: '✅', key: mek.key } });
    } catch (error) {
        console.error('[SAQIB SONG ERROR]', error.code || error.response?.status || error.message || 'Unknown error');
        await conn.sendMessage(ctx.from, { react: { text: '❌', key: mek.key } });

        if (error.message === 'TOO_LARGE') return ctx.reply('❌ Audio bohat bari hai (100MB se zyada).');
        if (error.message === 'NO_RESULT') return ctx.reply('❌ Song nahi mila. Dusra naam try karo.');
        if (error.message === 'ALL_AUDIO_APIS_FAILED') {
            const why = String(error.localReason || localReason || '');
            let hint = '';
            if (/sign in to confirm|not a bot|cookies/i.test(why)) hint = '🔒 YouTube ne server ka IP block kiya hai.\n👉 Railway Variables mein YTDLP_COOKIES_B64 set karein (browser se export ki hui cookies.txt ka base64).';
            else if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|getaddrinfo|Unable to download/i.test(why)) hint = '🌐 Server se YouTube/internet nahi khul raha (network block).';
            else if (/YTDLP_UNAVAILABLE|ENOENT|spawn/i.test(why)) hint = '⚙️ yt-dlp install nahi ho saka. YTDLP_PATH set karein ya GitHub access check karein.';
            else if (/ffmpeg|ffprobe/i.test(why)) hint = '⚙️ ffmpeg missing hai.';
            return ctx.reply(
                '❌ *Audio download nahi ho saka.*\n\n' +
                (hint ? hint + '\n\n' : '') +
                (why ? '🧾 *Reason:*\n```' + why.slice(0, 350) + '```\n\n' : '') +
                '💡 `.nettest` chala kar dekhein kya block hai.'
            );
        }
        return ctx.reply('❌ Audio could not be downloaded right now. Please try again later.');
    }
});

console.log('[MR SAQIB MD] Song command loaded');