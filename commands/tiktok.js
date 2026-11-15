'use strict';

/**
 * MR SAQIB MD :: TIKTOK MULTI-ENGINE DOWNLOADER
 * ============================================================================
 * - Multi-Tier Resilient Architecture:
 *   • Server 1 (API 1): TikWM Engine (Direct HD Video + Carousel Slides + Audio)
 *   • Server 2 (API 2): SSSTik Native Engine (Direct High-Speed CDN Stream)
 *   • Server 3 (API 3): Ruhend Engine (Independent Scraper Pipeline)
 *   • Server 4 (API 4): Jawad-Tech Vercel Fallback
 * - Auto-Failover: If one server fails or rate-limits, it instantly tries the next!
 * - Dedicated Server Commands: .tt1, .tt2, .tt3 (Force specific server)
 * - General Commands: .tt, .tiktok, .ttdl (Auto best server)
 * - Audio-only: .ttmp3, .ttaudio, .tiktokaudio
 * ============================================================================
 */

const axios = require('axios');
const cheerio = require('cheerio');
let ttdl;
try {
    ttdl = require('ruhend-scraper').ttdl;
} catch {}
const settings = require('../settings');

// In-memory cache for recent TikTok lookups (10-minute TTL, max 100 items)
const ttCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCached(url) {
    if (!url) return null;
    const item = ttCache.get(url);
    if (!item) return null;
    if (Date.now() - item.time > CACHE_TTL_MS) {
        ttCache.delete(url);
        return null;
    }
    return item.data;
}

function setCached(url, data) {
    if (!url || !data) return;
    if (ttCache.size > 100) {
        const firstKey = ttCache.keys().next().value;
        ttCache.delete(firstKey);
    }
    ttCache.set(url, { time: Date.now(), data });
}

/**
 * Extracts and cleans a TikTok / Douyin URL from any input text
 */
function extractTikTokUrl(text) {
    if (!text || typeof text !== 'string') return null;
    const regex = /(?:https?:\/\/)?(?:[a-zA-Z0-9_-]+\.)?(?:tiktok\.com|douyin\.com)\/[^\s]+/i;
    const match = text.match(regex);
    if (!match) return null;
    let url = match[0].trim();
    // Strip trailing punctuation, parenthesis, quotes, brackets
    url = url.replace(/[.,!?;:)\]>'"\\]+$/, '');
    if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
    }
    return url;
}

/**
 * Deep extract text from quoted message in Baileys
 */
function extractQuotedText(msg) {
    if (!msg || typeof msg !== 'object') return '';
    const ctx = msg.message?.extendedTextMessage?.contextInfo ||
                msg.message?.imageMessage?.contextInfo ||
                msg.message?.videoMessage?.contextInfo;
    let quoted = ctx?.quotedMessage;
    if (!quoted) return '';

    if (quoted.ephemeralMessage?.message) quoted = quoted.ephemeralMessage.message;
    if (quoted.viewOnceMessage?.message) quoted = quoted.viewOnceMessage.message;
    if (quoted.viewOnceMessageV2?.message) quoted = quoted.viewOnceMessageV2.message;
    if (quoted.documentWithCaptionMessage?.message) quoted = quoted.documentWithCaptionMessage.message;

    return quoted.conversation ||
           quoted.extendedTextMessage?.text ||
           quoted.imageMessage?.caption ||
           quoted.videoMessage?.caption ||
           '';
}

/**
 * Resolves short redirect URLs (vt.tiktok.com, vm.tiktok.com, tiktok.com/t/)
 */
async function resolveTikTokRedirect(url) {
    try {
        const res = await axios.get(url, {
            maxRedirects: 5,
            timeout: 6000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            },
            validateStatus: s => s >= 200 && s < 400
        });
        const finalUrl = res.request?.res?.responseUrl || res.headers?.location;
        if (finalUrl && (finalUrl.includes('tiktok.com') || finalUrl.includes('douyin.com'))) {
            return finalUrl;
        }
    } catch (_) {}
    return url;
}

// ═════════════════════════════════════════════════════════
// SERVER 1: TikWM High-Definition Engine (GET + POST)
// ═════════════════════════════════════════════════════════
async function fetchTikWM(targetUrl, resolvedUrl) {
    const urlsToTry = [targetUrl];
    if (resolvedUrl && resolvedUrl !== targetUrl) urlsToTry.push(resolvedUrl);

    for (const u of urlsToTry) {
        // 1. GET attempt
        try {
            let res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(u)}`, {
                timeout: 8000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
            });

            // Handle TikWM 1 req/sec rate limit
            if (res.data?.code === -1 && String(res.data?.msg).includes('Limit')) {
                await new Promise(r => setTimeout(r, 600));
                res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(u)}`, {
                    timeout: 8000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                });
            }

            if (res.data?.code === 0 && res.data?.data) {
                const d = res.data.data;
                let videoUrl = d.play || d.hdplay || d.wmplay;
                if (videoUrl && videoUrl.startsWith('/')) videoUrl = 'https://www.tikwm.com' + videoUrl;
                const images = (Array.isArray(d.images) && d.images.length > 0) ? d.images : null;
                const audioUrl = d.music || d.music_info?.play || null;
                const title = d.title || 'TikTok Video';
                const author = d.author?.nickname || d.author?.unique_id || 'TikTok Creator';
                if (videoUrl || images) {
                    return { videoUrl, images, audioUrl, title, author, server: 'TikWM (Server 1)' };
                }
            }
        } catch (_) {}

        // 2. POST attempt
        try {
            const params = new URLSearchParams();
            params.append('url', u);
            params.append('count', '12');
            params.append('cursor', '0');
            params.append('web', '1');
            params.append('hd', '1');

            const res = await axios.post('https://tikwm.com/api/', params, {
                timeout: 8000,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            });

            if (res.data?.code === 0 && res.data?.data) {
                const d = res.data.data;
                let videoUrl = d.play || d.hdplay || d.wmplay;
                if (videoUrl && videoUrl.startsWith('/')) videoUrl = 'https://www.tikwm.com' + videoUrl;
                const images = (Array.isArray(d.images) && d.images.length > 0) ? d.images : null;
                const audioUrl = d.music || d.music_info?.play || null;
                const title = d.title || 'TikTok Video';
                const author = d.author?.nickname || d.author?.unique_id || 'TikTok Creator';
                if (videoUrl || images) {
                    return { videoUrl, images, audioUrl, title, author, server: 'TikWM (Server 1)' };
                }
            }
        } catch (_) {}
    }
    return null;
}

// ═════════════════════════════════════════════════════════
// SERVER 2: SSSTik Native Engine (Cheerio + Direct CDN)
// ═════════════════════════════════════════════════════════
async function fetchSSSTik(targetUrl, resolvedUrl) {
    const urlsToTry = [targetUrl];
    if (resolvedUrl && resolvedUrl !== targetUrl) urlsToTry.push(resolvedUrl);

    for (const u of urlsToTry) {
        try {
            const getRes = await axios.get('https://ssstik.io/en', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                },
                timeout: 8000
            });
            const html = getRes.data;
            const match = html.match(/s_tt\s*=\s*['"]([^'"]+)['"]/);
            const ttToken = match ? match[1] : '';

            const postParams = new URLSearchParams();
            postParams.append('id', u);
            postParams.append('locale', 'en');
            postParams.append('tt', ttToken);

            const cookie = getRes.headers['set-cookie'] ? getRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') : '';

            const postRes = await axios.post('https://ssstik.io/abc?url=dl', postParams, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://ssstik.io/en',
                    'Origin': 'https://ssstik.io',
                    'Cookie': cookie
                },
                timeout: 8000
            });

            const parsed = cheerio.load(postRes.data);
            const videoUrl = parsed('a.without_watermark').attr('href') || 
                             parsed('a.download_link.without_watermark').attr('href') || 
                             parsed('a.without_watermark_direct').attr('href');
            const title = parsed('p.maintext').text().trim() || 'TikTok Video';
            const audioUrl = parsed('a.download_link.music').attr('href') || null;

            // Check if SSSTik returned photos
            const photoElements = parsed('.splide__slide img');
            let images = null;
            if (photoElements && photoElements.length > 0) {
                images = [];
                photoElements.each((_, el) => {
                    const src = parsed(el).attr('src');
                    if (src) images.push(src);
                });
            }

            if (videoUrl || (images && images.length > 0)) {
                return {
                    videoUrl: videoUrl || null,
                    images: (images && images.length > 0) ? images : null,
                    audioUrl,
                    title,
                    author: 'TikTok Creator',
                    server: 'SSSTik (Server 2)'
                };
            }
        } catch (_) {}
    }
    return null;
}

// ═════════════════════════════════════════════════════════
// SERVER 3: Ruhend Engine (Independent Scraper Pipeline)
// ═════════════════════════════════════════════════════════
async function fetchRuhend(targetUrl, resolvedUrl) {
    if (typeof ttdl !== 'function') return null;
    const urlsToTry = [resolvedUrl || targetUrl, targetUrl];

    for (const u of urlsToTry) {
        try {
            const data = await ttdl(u);
            if (data && (data.video || data.video_hd || data.video_wm)) {
                return {
                    videoUrl: data.video || data.video_hd || data.video_wm,
                    images: null,
                    audioUrl: data.music || null,
                    title: data.title || 'TikTok Video',
                    author: data.author || data.username || 'TikTok Creator',
                    server: 'Ruhend (Server 3)'
                };
            }
        } catch (_) {}
    }
    return null;
}

// ═════════════════════════════════════════════════════════
// SERVER 4: Jawad-Tech Vercel Mirror Engine
// ═════════════════════════════════════════════════════════
async function fetchJawadTech(targetUrl, resolvedUrl) {
    const urlsToTry = [targetUrl];
    if (resolvedUrl && resolvedUrl !== targetUrl) urlsToTry.push(resolvedUrl);

    for (const u of urlsToTry) {
        try {
            const res = await axios.get(`https://jawad-tech.vercel.app/download/tiktok?url=${encodeURIComponent(u)}`, {
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (res.data?.status && res.data?.result) {
                return {
                    videoUrl: res.data.result,
                    images: null,
                    audioUrl: null,
                    title: res.data.metadata?.title || 'TikTok Video',
                    author: res.data.metadata?.author || res.data.metadata?.username || 'TikTok Creator',
                    server: 'Jawad-Tech (Server 4)'
                };
            }
        } catch (_) {}
    }
    return null;
}

/**
 * Core Multi-Tier TikTok Media Fetcher:
 * Coordinates Server 1, Server 2, Server 3, Server 4 with instant failover.
 */
async function fetchTikTokData(rawInput, msg = null, preferredServer = 0) {
    // 1. URL Extraction from multiple possible sources
    const rawText = (typeof rawInput === 'string' ? rawInput : Array.isArray(rawInput) ? rawInput.join(' ') : '').trim();
    let targetUrl = extractTikTokUrl(rawText);

    // Fallback: check direct message caption/text
    if (!targetUrl && msg?.message) {
        const directText = msg.message.conversation ||
                           msg.message.extendedTextMessage?.text ||
                           msg.message.imageMessage?.caption ||
                           msg.message.videoMessage?.caption || '';
        targetUrl = extractTikTokUrl(directText);
    }

    // Fallback: check replied/quoted message text/caption
    if (!targetUrl && msg) {
        const quotedText = extractQuotedText(msg);
        targetUrl = extractTikTokUrl(quotedText);
    }

    if (!targetUrl || (!targetUrl.includes('tiktok.com') && !targetUrl.includes('douyin.com'))) {
        return null;
    }

    // Check in-memory cache (only for auto mode)
    if (preferredServer === 0) {
        const cached = getCached(targetUrl);
        if (cached) {
            return { targetUrl, resolvedUrl: cached.resolvedUrl || targetUrl, ...cached };
        }
    }

    // Resolve short link redirect if applicable
    let resolvedUrl = targetUrl;
    if (/(?:vt|vm)\.tiktok\.com|tiktok\.com\/t\/|v\.douyin\.com/i.test(targetUrl)) {
        resolvedUrl = await resolveTikTokRedirect(targetUrl);
    }

    // Define Server Execution Order based on preferredServer (0 = Auto, 1 = TikWM, 2 = SSSTik, 3 = Ruhend)
    let engineOrder = [];
    if (preferredServer === 1) {
        engineOrder = [fetchTikWM, fetchSSSTik, fetchRuhend, fetchJawadTech];
    } else if (preferredServer === 2) {
        engineOrder = [fetchSSSTik, fetchTikWM, fetchRuhend, fetchJawadTech];
    } else if (preferredServer === 3) {
        engineOrder = [fetchRuhend, fetchSSSTik, fetchTikWM, fetchJawadTech];
    } else {
        // Auto Best Order: Server 1 ➜ Server 2 ➜ Server 3 ➜ Server 4
        engineOrder = [fetchTikWM, fetchSSSTik, fetchRuhend, fetchJawadTech];
    }

    let resultData = null;
    for (const engine of engineOrder) {
        try {
            const data = await engine(targetUrl, resolvedUrl);
            if (data && (data.videoUrl || (data.images && data.images.length > 0))) {
                resultData = data;
                break;
            }
        } catch (_) {}
    }

    if (!resultData) {
        return null;
    }

    const finalResult = {
        targetUrl,
        resolvedUrl,
        ...resultData
    };

    // Cache the successful lookup for both targetUrl and resolvedUrl
    setCached(targetUrl, finalResult);
    if (resolvedUrl && resolvedUrl !== targetUrl) {
        setCached(resolvedUrl, finalResult);
    }

    return finalResult;
}

/**
 * Main TikTok Command Handler (.tt / .tiktok / .ttdl / .tt1 / .tt2 / .tt3)
 */
async function tiktokCommand(sock, from, msg, q, commandName = '') {
    // Detect preferred server if user called .tt1, .tt2, .tt3
    let preferredServer = 0;
    const cmd = String(commandName || '').toLowerCase();
    if (cmd.includes('1')) preferredServer = 1;
    else if (cmd.includes('2')) preferredServer = 2;
    else if (cmd.includes('3')) preferredServer = 3;

    const data = await fetchTikTokData(q, msg, preferredServer);

    if (!data) {
        const rawText = (typeof q === 'string' ? q : '').trim();
        const hasSomeTiktokWord = rawText.includes('tiktok') || rawText.includes('douyin') || extractQuotedText(msg).includes('tiktok');
        
        if (hasSomeTiktokWord) {
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return await sock.sendMessage(from, {
                text: "❌ *Tamam servers (1, 2, 3) se TikTok video nahi mil saki.*\nVideo shayad private ya delete ho chuki hai. Link check karein aur dobara try karein."
            }, { quoted: msg });
        }

        return await sock.sendMessage(from, {
            text:
`╭━━━〔 📱 *TIKTOK MULTI-ENGINE DOWNLOADER* 〕━━━┈⊷
┃ 📌 *Available Commands:*
┃ 👉 *.tt <url>*       ➜ Auto Multi-Server Fallback (1, 2, 3)
┃ 👉 *.tt1 <url>*      ➜ Server 1 (TikWM HD)
┃ 👉 *.tt2 <url>*      ➜ Server 2 (SSSTik Fast)
┃ 👉 *.tt3 <url>*      ➜ Server 3 (Ruhend Engine)
┃ 👉 *.ttmp3 <url>*    ➜ Audio / MP3 Only
┃
┃ 💡 *Tip:*
┃ _Aap kisi bhi TikTok link wale message ko reply karke bhi *.tt* likh sakte hain!_
┃
┃ 💡 *Examples:*
┃ • .tt https://vt.tiktok.com/ZSp9fXCWS/
┃ • .tiktok https://www.tiktok.com/@user/video/...
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

        const { videoUrl, images, audioUrl, title, author, server } = data;
        const cleanTitle = (title || 'TikTok Video').replace(/\s+/g, ' ').trim().slice(0, 80);

        // ==========================================
        // CASE A: PHOTO SLIDESHOW / CAROUSEL POST
        // ==========================================
        if (images && images.length > 0) {
            const maxPhotos = Math.min(images.length, 6);
            for (let i = 0; i < maxPhotos; i++) {
                const imgCaption = (i === 0)
                    ? `╭━━━〔 📸 *TIKTOK PHOTO SLIDE* 〕━━━┈⊷\n┃ 📌 *Title:* ${cleanTitle}\n┃ 👤 *Author:* ${author}\n┃ 🖼️ *Slide:* ${i + 1}/${images.length}\n┃ 🌐 *Engine:* ${server || 'Multi-Engine'}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
                    : `📸 Slide [${i + 1}/${images.length}]`;

                await sock.sendMessage(from, {
                    image: { url: images[i] },
                    caption: imgCaption
                }, { quoted: msg });
                await new Promise(r => setTimeout(r, 400));
            }

            // Also send background audio if available
            if (audioUrl) {
                await sock.sendMessage(from, {
                    audio: { url: audioUrl },
                    mimetype: 'audio/mp4',
                    fileName: `${cleanTitle.slice(0, 30)}.mp3`
                }, { quoted: msg }).catch(() => {});
            }

            await sock.sendMessage(from, { react: { text: '📸', key: msg.key } }).catch(() => {});
            return;
        }

        // ==========================================
        // CASE B: STANDARD VIDEO POST
        // ==========================================
        const caption =
`╭━━━〔 📱 *TIKTOK DOWNLOADED* 〕━━━┈⊷
┃ 📌 *Title:* ${cleanTitle}
┃ 👤 *Author:* ${author}
┃ 🌐 *Engine:* ${server || 'Auto-Balanced'}
┃ ⚡ *Quality:* HD No-Watermark
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;

        // Attempt 1: High-reliability Buffer Download
        let sent = false;
        try {
            const vidRes = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
                timeout: 45000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': videoUrl.includes('ssstik') || videoUrl.includes('tikcdn') ? 'https://ssstik.io/' : 'https://www.tiktok.com/'
                }
            });

            if (vidRes.data && vidRes.data.length > 1000) {
                await sock.sendMessage(from, {
                    video: Buffer.from(vidRes.data),
                    caption,
                    mimetype: 'video/mp4'
                }, { quoted: msg });
                sent = true;
            }
        } catch (bufErr) {
            console.warn('[TikTok] Buffer fetch failed, falling back to direct URL streaming:', bufErr.message);
        }

        // Attempt 2: Direct URL Streaming Fallback
        if (!sent) {
            await sock.sendMessage(from, {
                video: { url: videoUrl },
                caption,
                mimetype: 'video/mp4'
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '🎬', key: msg.key } }).catch(() => {});

    } catch (e) {
        console.error('[TikTok Command Error]:', e);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, { text: `❌ TikTok download fail ho gaya: ${e.message}` }, { quoted: msg });
    }
}

/**
 * TikTok Audio Only Command (.ttmp3 / .ttaudio / .tiktokmp3)
 */
async function tiktokAudioCommand(sock, from, msg, q) {
    try {
        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
        const data = await fetchTikTokData(q, msg);

        if (!data || (!data.audioUrl && !data.videoUrl)) {
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return await sock.sendMessage(from, {
                text: "❌ *TikTok audio link nahi mil saka.* Link check karein ya replied message mein TikTok link dein."
            }, { quoted: msg });
        }

        const audioLink = data.audioUrl || data.videoUrl;
        const cleanTitle = (data.title || 'TikTok Audio').replace(/\s+/g, ' ').trim().slice(0, 60);

        await sock.sendMessage(from, {
            audio: { url: audioLink },
            mimetype: 'audio/mp4',
            fileName: `${cleanTitle}.mp3`,
            ptt: false
        }, { quoted: msg });

        await sock.sendMessage(from, { react: { text: '🎵', key: msg.key } }).catch(() => {});
    } catch (e) {
        console.error('[TikTok Audio Command Error]:', e);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, { text: `❌ TikTok audio download fail ho gaya: ${e.message}` }, { quoted: msg });
    }
}

module.exports = tiktokCommand;
module.exports.tiktokCommand = tiktokCommand;
module.exports.tiktokAudioCommand = tiktokAudioCommand;
module.exports.fetchTikTokData = fetchTikTokData;
module.exports.extractTikTokUrl = extractTikTokUrl;
