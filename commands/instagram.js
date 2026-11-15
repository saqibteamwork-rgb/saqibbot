// commands/instagram.js
'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const settings = require('../settings');

let ruhendLib = null;
try {
    ruhendLib = require('ruhend-scraper');
} catch (e) {}

let btchLib = null;
try {
    btchLib = require('btch-downloader');
} catch (e) {}

/**
 * Extract clean Instagram URL from query or message object
 */
function extractIgUrl(input, message) {
    if (typeof input === 'string' && (input.includes('instagram.com') || input.includes('instagr.am'))) {
        const m = input.match(/https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/[^\s]+/i);
        if (m) return m[0];
    }
    if (message && typeof message === 'object') {
        const msgObj = message.message?.ephemeralMessage?.message || message.message?.viewOnceMessage?.message || message.message?.viewOnceMessageV2?.message || message.message || {};
        const text = (msgObj.conversation || msgObj.extendedTextMessage?.text || msgObj.imageMessage?.caption || msgObj.videoMessage?.caption || '').trim();
        const m = text.match(/https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/[^\s]+/i);
        if (m) return m[0];
    }
    return null;
}

/**
 * Engine 1: SaveInsta Engine (Token + userverify + ajaxSearch + Cheerio)
 */
async function engineSaveInsta(targetUrl) {
    const home = await axios.get('https://saveinsta.to/en/highlights', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 8000
    });

    const expMatch = home.data.match(/k_exp\s*=\s*["']([^"']+)["']/);
    const tokenMatch = home.data.match(/k_token\s*=\s*["']([^"']+)["']/);

    if (!expMatch || !tokenMatch) throw new Error('Could not find tokens on SaveInsta');

    const k_exp = expMatch[1];
    const k_token = tokenMatch[1];

    let cftoken = '';
    try {
        const verifyRes = await axios.post('https://saveinsta.to/api/userverify', new URLSearchParams({ url: targetUrl }), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Origin': 'https://saveinsta.to',
                'Referer': 'https://saveinsta.to/en/video',
                'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 6000
        });
        cftoken = verifyRes.data?.token || '';
    } catch (e) {}

    const searchParams = new URLSearchParams({
        k_exp,
        k_token,
        q: targetUrl,
        t: 'media',
        lang: 'en',
        v: 'v2'
    });
    if (cftoken) searchParams.append('cftoken', cftoken);

    const searchRes = await axios.post('https://saveinsta.to/api/ajaxSearch', searchParams, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Origin': 'https://saveinsta.to',
            'Referer': 'https://saveinsta.to/en/highlights',
            'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 10000
    });

    if (searchRes.data?.status === 'ok' && searchRes.data?.data) {
        const $ = cheerio.load(searchRes.data.data);
        const media = [];

        $('ul.download-box li').each((i, el) => {
            let videoUrl = $(el).find('a[video]').attr('href');
            if (!videoUrl) {
                $(el).find('.download-items__btn a').each((_, a) => {
                    const text = $(a).text().toLowerCase();
                    if (text.includes('download video') || text.includes('video')) {
                        videoUrl = $(a).attr('href');
                    }
                });
            }
            if (!videoUrl) {
                videoUrl = $(el).find('.download-items__btn a').first().attr('href');
            }

            if (videoUrl) {
                const isVideo = /\.(mp4|mov|webm)/i.test(videoUrl) || $(el).find('.download-items__btn a').text().toLowerCase().includes('video');
                media.push({
                    url: videoUrl,
                    type: isVideo ? 'video' : 'image'
                });
            }
        });

        if (media.length === 0) {
            $('a[href]').each((i, a) => {
                const href = $(a).attr('href');
                if (href && (href.startsWith('http') || href.startsWith('/download'))) {
                    const full = href.startsWith('/') ? 'https://saveinsta.to' + href : href;
                    media.push({
                        url: full,
                        type: /\.(mp4|mov|webm)/i.test(full) ? 'video' : 'image'
                    });
                }
            });
        }

        if (media.length > 0) {
            return {
                items: media,
                engine: 'Engine 1 (SaveInsta)'
            };
        }
    }
    throw new Error('SaveInsta no media returned');
}

/**
 * Engine 2: All-Media-Downloader Cloud Engine
 */
async function engineCloudAPI(targetUrl) {
    const servers = [
        'https://all-media-downloader-api.onrender.com',
        'https://all-media-downloader-api-0rts.onrender.com'
    ];

    for (const base of servers) {
        try {
            const apiUrl = `${base}/api/download?url=${encodeURIComponent(targetUrl)}&api_key=m41nul`;
            const res = await axios.get(apiUrl, { timeout: 15000 });
            if (res.data && res.data.success && res.data.video_url) {
                return {
                    items: [{
                        url: res.data.video_url,
                        type: 'video'
                    }],
                    title: res.data.title || res.data.caption || 'Instagram Video',
                    engine: 'Engine 2 (Cloud Engine)'
                };
            }
        } catch (e) {}
    }
    throw new Error('Cloud Engine failed');
}

/**
 * Engine 3: Ruhend Scraper (igdl2 SnapSave fallback)
 */
async function engineRuhend(targetUrl) {
    if (!ruhendLib) throw new Error('ruhend-scraper not installed');
    if (typeof ruhendLib.igdl2 === 'function') {
        const res = await ruhendLib.igdl2(targetUrl);
        if (res && res.status && res.data && res.data.length > 0) {
            return {
                items: res.data.map(d => ({
                    url: d.url,
                    type: /\.(mp4|mov|webm)/i.test(d.url) ? 'video' : 'image'
                })),
                engine: 'Engine 3 (Ruhend-2)'
            };
        }
    }

    if (typeof ruhendLib.igdl === 'function') {
        const res = await ruhendLib.igdl(targetUrl);
        if (res && res.data && res.data.length > 0) {
            return {
                items: res.data.map(d => ({
                    url: d.url,
                    type: d.type || (/\.(mp4|mov|webm)/i.test(d.url) ? 'video' : 'image')
                })),
                engine: 'Engine 3 (Ruhend)'
            };
        }
    }

    throw new Error('Ruhend scraper failed');
}

/**
 * Engine 4: btch-downloader
 */
async function engineBtch(targetUrl) {
    if (!btchLib || !btchLib.igdl) throw new Error('btch-downloader not available');
    const res = await btchLib.igdl(targetUrl);
    if (!res || !res.status || !res.result || res.result.length === 0) {
        throw new Error('btch-downloader returned no result');
    }

    return {
        items: res.result.map(r => ({
            url: r.url,
            type: /\.(mp4|mov|webm)/i.test(r.url) ? 'video' : 'image'
        })),
        engine: 'Engine 4 (Btch)'
    };
}

/**
 * Main Instagram Downloader Command with Multi-Engine Fallback
 */
async function instagramCommand(sock, chatId, message, directUrl = '') {
    const url = extractIgUrl(directUrl, message) || extractIgUrl(chatId, message);

    if (!url) {
        return await sock.sendMessage(chatId, {
            text:
`╭━━━〔 ⚡ *INSTAGRAM DOWNLOADER* ⚡ 〕━━━┈⊷
┃ 📥 *Supported:* Reels, Posts, Carousels & Stories
┃
┃ 📌 *Usage:*
┃ 👉 *.ig <instagram link>*
┃ 👉 *.insta <instagram link>*
┃
┃ 💡 *Example:*
┃ .ig https://www.instagram.com/reel/...
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: message });
    }

    // Reaction indicator
    await sock.sendMessage(chatId, { react: { text: '🔄', key: message?.key } }).catch(() => {});

    let result = null;
    const engines = [
        { name: 'Engine 1 (SaveInsta)', fn: engineSaveInsta },
        { name: 'Engine 2 (Cloud Engine)', fn: engineCloudAPI },
        { name: 'Engine 3 (Ruhend)', fn: engineRuhend },
        { name: 'Engine 4 (Btch)', fn: engineBtch }
    ];

    let lastError = null;
    for (const engine of engines) {
        try {
            console.log(`[IG DOWNLOAD] Trying ${engine.name} for ${url}...`);
            result = await engine.fn(url);
            if (result && result.items && result.items.length > 0) {
                console.log(`[IG DOWNLOAD] Success with ${engine.name}! Got ${result.items.length} items`);
                break;
            }
        } catch (e) {
            console.log(`[IG DOWNLOAD] ${engine.name} failed:`, e.message);
            lastError = e;
        }
    }

    if (!result || !result.items || result.items.length === 0) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message?.key } }).catch(() => {});
        return await sock.sendMessage(chatId, {
            text: `❌ *Instagram Download Failed:*\n\nPost download nahi ho saki (${lastError?.message || 'Server timeout'}).\nAccount private, link expired ya video deleted ho sakti hai.`
        }, { quoted: message });
    }

    // Deduplicate URLs and take top 5
    const seen = new Set();
    const uniqueItems = [];
    for (const item of result.items) {
        if (!item.url || seen.has(item.url)) continue;
        seen.add(item.url);
        uniqueItems.push(item);
        if (uniqueItems.length >= 5) break;
    }

    let sentCount = 0;
    for (let i = 0; i < uniqueItems.length; i++) {
        const item = uniqueItems[i];
        const isVideo = item.type === 'video' || /\.(mp4|mov|webm)/i.test(item.url);
        const itemCaption =
`╭━━━〔 ⚡ *INSTAGRAM DOWNLOADER* ⚡ 〕━━━┈⊷
┃ 📸 *Item:* ${i + 1} of ${uniqueItems.length}
┃ 🎥 *Type:* ${isVideo ? 'Video (MP4)' : 'Photo (JPG)'}
┃ 🚀 *Server:* ${result.engine}
┃ 🤖 *Bot:* ${settings.botName || 'MR SAQIB BOT'}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;

        try {
            if (isVideo) {
                await sock.sendMessage(chatId, {
                    video: { url: item.url },
                    mimetype: 'video/mp4',
                    caption: itemCaption
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, {
                    image: { url: item.url },
                    caption: itemCaption
                }, { quoted: message });
            }
            sentCount++;
        } catch (mediaErr) {
            console.log(`[IG DOWNLOAD] Direct send failed for item ${i + 1}, trying buffer stream...`, mediaErr.message);

            // Fallback to buffer stream
            try {
                const tmpDir = path.join(process.cwd(), 'tmp');
                if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
                const ext = isVideo ? 'mp4' : 'jpg';
                const tmpFile = path.join(tmpDir, `ig_${Date.now()}_${i}.${ext}`);

                const vRes = await axios({
                    method: 'GET',
                    url: item.url,
                    responseType: 'stream',
                    timeout: 60000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                const writer = fs.createWriteStream(tmpFile);
                vRes.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                if (fs.existsSync(tmpFile) && fs.statSync(tmpFile).size > 0) {
                    if (isVideo) {
                        await sock.sendMessage(chatId, {
                            video: fs.readFileSync(tmpFile),
                            mimetype: 'video/mp4',
                            caption: itemCaption
                        }, { quoted: message });
                    } else {
                        await sock.sendMessage(chatId, {
                            image: fs.readFileSync(tmpFile),
                            caption: itemCaption
                        }, { quoted: message });
                    }
                    sentCount++;
                    try { fs.unlinkSync(tmpFile); } catch (e) {}
                }
            } catch (bufErr) {
                console.error('[IG DOWNLOAD] Buffer send failed:', bufErr.message);
            }
        }
    }

    if (sentCount > 0) {
        await sock.sendMessage(chatId, { react: { text: '✅', key: message?.key } }).catch(() => {});
    } else {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message?.key } }).catch(() => {});
        await sock.sendMessage(chatId, {
            text: `❌ Instagram media send karne mein masla aya.`
        }, { quoted: message });
    }
}

module.exports = instagramCommand;
