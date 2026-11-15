// commands/facebook.js
'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const settings = require('../settings');

let fbDownloaderLib = null;
try {
    fbDownloaderLib = require('@renpwn/fb-downloader');
} catch (e) {}

let snapsaveLib = null;
try {
    snapsaveLib = require('snapsave-media-downloader');
} catch (e) {}

let btchLib = null;
try {
    btchLib = require('btch-downloader');
} catch (e) {}

/**
 * Extract clean Facebook URL from query or message object
 */
function extractFbUrl(input, message) {
    if (typeof input === 'string' && (input.includes('facebook.com') || input.includes('fb.watch'))) {
        const m = input.match(/https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch)\/[^\s]+/i);
        if (m) return m[0];
    }
    if (message && typeof message === 'object') {
        const msgObj = message.message?.ephemeralMessage?.message || message.message?.viewOnceMessage?.message || message.message?.viewOnceMessageV2?.message || message.message || {};
        const text = (msgObj.conversation || msgObj.extendedTextMessage?.text || msgObj.imageMessage?.caption || msgObj.videoMessage?.caption || '').trim();
        const m = text.match(/https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch)\/[^\s]+/i);
        if (m) return m[0];
    }
    return null;
}

/**
 * Engine 1: @renpwn/fb-downloader (Direct Facebook CDN parser)
 */
async function engineRenpwn(url) {
    if (!fbDownloaderLib) throw new Error('renpwn not installed');
    const getFBInfo = typeof fbDownloaderLib === 'function' ? fbDownloaderLib : fbDownloaderLib.getFBInfo;
    if (!getFBInfo) throw new Error('getFBInfo not found');

    const res = await getFBInfo(url);
    if (!res || (!res.hd && !res.sd)) throw new Error('No video URL returned by renpwn');

    return {
        videoUrl: res.hd || res.sd,
        quality: res.hd ? 'HD' : 'SD',
        title: res.title || 'Facebook Video',
        engine: 'Engine 1 (Direct CDN)'
    };
}

/**
 * Engine 2: snapsave-media-downloader (SnapSave direct scraper)
 */
async function engineSnapSave(url) {
    const snap = snapsaveLib?.snapsave || (await import('snapsave-media-downloader').catch(() => ({}))).snapsave;
    if (!snap) throw new Error('snapsave not available');

    const res = await snap(url);
    if (!res || !res.success || !res.data || !res.data.media || res.data.media.length === 0) {
        throw new Error('SnapSave returned no media');
    }

    const items = res.data.media;
    const hd = items.find(m => String(m.quality || '').toUpperCase().includes('HD'));
    const item = hd || items[0];

    return {
        videoUrl: item.url,
        quality: hd ? 'HD' : (item.quality || 'SD'),
        title: res.data.description || 'Facebook Video',
        engine: 'Engine 2 (SnapSave)'
    };
}

/**
 * Engine 3: All-Media-Downloader Cloud Engine
 */
async function engineCloudAPI(url) {
    const servers = [
        'https://all-media-downloader-api.onrender.com',
        'https://all-media-downloader-api-0rts.onrender.com'
    ];

    for (const base of servers) {
        try {
            const apiUrl = `${base}/api/download?url=${encodeURIComponent(url)}&api_key=m41nul`;
            const res = await axios.get(apiUrl, { timeout: 15000 });
            if (res.data && res.data.success && res.data.video_url) {
                return {
                    videoUrl: res.data.video_url,
                    quality: res.data.quality || 'HD',
                    title: res.data.title || res.data.caption || 'Facebook Video',
                    engine: 'Engine 3 (Cloud API)'
                };
            }
        } catch (e) {
            // try next server
        }
    }
    throw new Error('Cloud API failed');
}

/**
 * Engine 4: Native Direct Facebook HTML extraction
 */
async function engineDirectHTML(url) {
    const mobileUrl = url.replace('www.facebook.com', 'm.facebook.com');
    const res = await axios.get(mobileUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000,
        maxRedirects: 5
    });

    const html = res.data;
    if (typeof html !== 'string') throw new Error('Invalid HTML');

    const clean = u => u ? u.replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/\\\//g, '/') : null;

    const hdMatch = html.match(/"playable_url_quality_hd":"([^"]+)"/) || html.match(/"browser_native_hd_url":"([^"]+)"/);
    const sdMatch = html.match(/"playable_url":"([^"]+)"/) || html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/sd_src:"([^"]+)"/);

    const hd = clean(hdMatch?.[1]);
    const sd = clean(sdMatch?.[1]);

    if (!hd && !sd) throw new Error('No playable url in HTML');

    return {
        videoUrl: hd || sd,
        quality: hd ? 'HD' : 'SD',
        title: 'Facebook Video',
        engine: 'Engine 4 (Native Regex)'
    };
}

/**
 * Engine 5: btch-downloader
 */
async function engineBtch(url) {
    if (!btchLib || !btchLib.fbdown) throw new Error('btch fbdown not available');
    const res = await btchLib.fbdown(url);
    if (!res || !res.status || (!res.normal && !res.hd)) throw new Error('btch fbdown failed');

    return {
        videoUrl: res.hd || res.normal,
        quality: res.hd ? 'HD' : 'SD',
        title: res.title || 'Facebook Video',
        engine: 'Engine 5 (Btch)'
    };
}

/**
 * Main Facebook Downloader Command with 5-Tier Fallback
 */
async function facebookCommand(sock, chatId, message, directUrl = '') {
    const url = extractFbUrl(directUrl, message) || extractFbUrl(chatId, message);

    if (!url) {
        return await sock.sendMessage(chatId, {
            text:
`╭━━━〔 ⚡ *FACEBOOK DOWNLOADER* ⚡ 〕━━━┈⊷
┃ 📥 *Supported:* Facebook Videos, Reels & Watch
┃
┃ 📌 *Usage:*
┃ 👉 *.fb <facebook video link>*
┃ 👉 *.facebook <facebook video link>*
┃
┃ 💡 *Example:*
┃ .fb https://www.facebook.com/watch/?v=10153231379946729
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: message });
    }

    // Reaction indicator
    await sock.sendMessage(chatId, { react: { text: '🔄', key: message?.key } }).catch(() => {});

    let result = null;
    const engines = [
        { name: 'Engine 1 (Direct CDN)', fn: engineRenpwn },
        { name: 'Engine 2 (SnapSave)', fn: engineSnapSave },
        { name: 'Engine 3 (Cloud API)', fn: engineCloudAPI },
        { name: 'Engine 4 (Native Regex)', fn: engineDirectHTML },
        { name: 'Engine 5 (Btch)', fn: engineBtch }
    ];

    let lastError = null;
    for (const engine of engines) {
        try {
            console.log(`[FB DOWNLOAD] Trying ${engine.name} for ${url}...`);
            result = await engine.fn(url);
            if (result && result.videoUrl) {
                console.log(`[FB DOWNLOAD] Success with ${engine.name}!`);
                break;
            }
        } catch (e) {
            console.log(`[FB DOWNLOAD] ${engine.name} failed:`, e.message);
            lastError = e;
        }
    }

    if (!result || !result.videoUrl) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message?.key } }).catch(() => {});
        return await sock.sendMessage(chatId, {
            text: `❌ *Facebook Download Failed:*\n\nVideo download nahi ho saki (${lastError?.message || 'Server timeout'}).\nVideo private, deleted ya region-locked ho sakti hai.`
        }, { quoted: message });
    }

    const caption =
`╭━━━〔 ⚡ *FACEBOOK DOWNLOADER* ⚡ 〕━━━┈⊷
┃ 📝 *Title:* ${result.title}
┃ 🎥 *Quality:* ${result.quality}
┃ 🚀 *Server:* ${result.engine}
┃ 🤖 *Bot:* ${settings.botName || 'MR SAQIB BOT'}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;

    // Attempt 1: Direct URL delivery (fastest & lowest RAM)
    try {
        await sock.sendMessage(chatId, {
            video: { url: result.videoUrl },
            mimetype: 'video/mp4',
            caption
        }, { quoted: message });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message?.key } }).catch(() => {});
        return;
    } catch (urlErr) {
        console.log('[FB DOWNLOAD] Direct URL send failed, attempting stream buffer...', urlErr.message);
    }

    // Attempt 2: Buffer stream download (failover)
    try {
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const tmpFile = path.join(tmpDir, `fb_${Date.now()}.mp4`);

        const vRes = await axios({
            method: 'GET',
            url: result.videoUrl,
            responseType: 'stream',
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.facebook.com/'
            }
        });

        const writer = fs.createWriteStream(tmpFile);
        vRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        if (fs.existsSync(tmpFile) && fs.statSync(tmpFile).size > 0) {
            await sock.sendMessage(chatId, {
                video: fs.readFileSync(tmpFile),
                mimetype: 'video/mp4',
                caption
            }, { quoted: message });

            try { fs.unlinkSync(tmpFile); } catch (e) {}
            await sock.sendMessage(chatId, { react: { text: '✅', key: message?.key } }).catch(() => {});
            return;
        }
    } catch (bufErr) {
        console.error('[FB DOWNLOAD] Buffer send also failed:', bufErr.message);
    }

    await sock.sendMessage(chatId, { react: { text: '❌', key: message?.key } }).catch(() => {});
    await sock.sendMessage(chatId, {
        text: `❌ Video send karte waqt error aya. Link: ${result.videoUrl}`
    }, { quoted: message });
}

module.exports = facebookCommand;
