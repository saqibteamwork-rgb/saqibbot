const axios = require('axios');
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
 * Extracts and cleans a TikTok / Douyin URL from any input text:
 * - Direct argument string (q)
 * - Raw message content
 * - Quoted message text / caption
 * Handles:
 * - URLs missing https:// (e.g. vt.tiktok.com/...)
 * - Trailing punctuation / brackets
 * - Short links (vt.tiktok.com, vm.tiktok.com, tiktok.com/t/)
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
 * into canonical https://www.tiktok.com/@user/video/... URLs
 */
async function resolveTikTokRedirect(url) {
    try {
        const res = await axios.get(url, {
            maxRedirects: 5,
            timeout: 7000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            },
            validateStatus: s => s >= 200 && s < 400
        });
        const finalUrl = res.request?.res?.responseUrl || res.headers?.location;
        if (finalUrl && (finalUrl.includes('tiktok.com') || finalUrl.includes('douyin.com'))) {
            return finalUrl;
        }
    } catch {}
    return url;
}

/**
 * Core TikTok Media Fetcher:
 * Coordinates multi-tier APIs, URL normalization, redirect resolution, and caching.
 */
async function fetchTikTokData(rawInput, msg = null) {
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

    // Check in-memory cache
    const cached = getCached(targetUrl);
    if (cached) {
        return { targetUrl, resolvedUrl: cached.resolvedUrl || targetUrl, ...cached };
    }

    let videoUrl = null;
    let images = null;
    let audioUrl = null;
    let title = 'TikTok Video';
    let author = 'TikTok Creator';

    // Resolve short link redirect if applicable
    let resolvedUrl = targetUrl;
    if (/(?:vt|vm)\.tiktok\.com|tiktok\.com\/t\/|v\.douyin\.com/i.test(targetUrl)) {
        resolvedUrl = await resolveTikTokRedirect(targetUrl);
    }

    // ==========================================
    // TIER 1: TikWM Direct GET API (with rate-limit retry)
    // ==========================================
    try {
        let res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, {
            timeout: 14000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        });

        // Handle TikWM 1 req/sec rate limit
        if (res.data && res.data.code === -1 && String(res.data.msg).includes('Limit')) {
            await new Promise(r => setTimeout(r, 1150));
            res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, {
                timeout: 14000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
        }

        // If URL parsing failed on short link, retry with resolvedUrl
        if ((!res.data || res.data.code === -1) && resolvedUrl !== targetUrl) {
            await new Promise(r => setTimeout(r, 600));
            res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(resolvedUrl)}`, {
                timeout: 14000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
        }

        if (res.data && res.data.code === 0 && res.data.data) {
            const d = res.data.data;
            videoUrl = d.play || d.hdplay || d.wmplay;
            if (videoUrl && videoUrl.startsWith('/')) {
                videoUrl = 'https://www.tikwm.com' + videoUrl;
            }
            if (Array.isArray(d.images) && d.images.length > 0) {
                images = d.images;
            }
            audioUrl = d.music || d.music_info?.play;
            title = d.title || title;
            author = d.author?.nickname || d.author?.unique_id || author;
        }
    } catch (err) {
        console.warn('[TikTok] Tier 1 (TikWM GET) error:', err.message);
    }

    // ==========================================
    // TIER 2: Jawad-Tech Vercel API
    // ==========================================
    if (!videoUrl && !images) {
        try {
            let res = await axios.get(`https://jawad-tech.vercel.app/download/tiktok?url=${encodeURIComponent(targetUrl)}`, {
                timeout: 14000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            if ((!res.data?.status || !res.data?.result) && resolvedUrl !== targetUrl) {
                res = await axios.get(`https://jawad-tech.vercel.app/download/tiktok?url=${encodeURIComponent(resolvedUrl)}`, {
                    timeout: 14000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
            }

            if (res.data?.status && res.data?.result) {
                videoUrl = res.data.result;
                title = res.data.metadata?.title || title;
                author = res.data.metadata?.author || res.data.metadata?.username || author;
            }
        } catch (err) {
            console.warn('[TikTok] Tier 2 (Jawad-Tech) error:', err.message);
        }
    }

    // ==========================================
    // TIER 3: TikWM POST API Mirror
    // ==========================================
    if (!videoUrl && !images) {
        try {
            const postUrl = resolvedUrl || targetUrl;
            const params = new URLSearchParams();
            params.append('url', postUrl);
            params.append('count', '12');
            params.append('cursor', '0');
            params.append('web', '1');
            params.append('hd', '1');

            const res = await axios.post('https://tikwm.com/api/', params, {
                timeout: 14000,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            });

            if (res.data && res.data.code === 0 && res.data.data) {
                const d = res.data.data;
                videoUrl = d.play || d.hdplay || d.wmplay;
                if (videoUrl && videoUrl.startsWith('/')) {
                    videoUrl = 'https://www.tikwm.com' + videoUrl;
                }
                if (Array.isArray(d.images) && d.images.length > 0) {
                    images = d.images;
                }
                audioUrl = d.music || d.music_info?.play;
                title = d.title || title;
                author = d.author?.nickname || d.author?.unique_id || author;
            }
        } catch (err) {
            console.warn('[TikTok] Tier 3 (TikWM POST) error:', err.message);
        }
    }

    // ==========================================
    // TIER 4: Ruhend Scraper Fallback
    // ==========================================
    if (!videoUrl && !images && typeof ttdl === 'function') {
        try {
            const data = await ttdl(resolvedUrl || targetUrl);
            if (data && (data.video || data.video_hd || data.video_wm)) {
                videoUrl = data.video || data.video_hd || data.video_wm;
                title = data.title || title;
                author = data.author || data.username || author;
            }
        } catch (err) {
            console.warn('[TikTok] Tier 4 (ruhend-scraper) error:', err.message);
        }
    }

    if (!videoUrl && (!images || images.length === 0)) {
        return null;
    }

    const result = { targetUrl, resolvedUrl, videoUrl, images, audioUrl, title, author };

    // Cache the successful lookup for both targetUrl and resolvedUrl
    setCached(targetUrl, result);
    if (resolvedUrl && resolvedUrl !== targetUrl) {
        setCached(resolvedUrl, result);
    }

    return result;
}

/**
 * Main TikTok Command Handler (.tt / .tiktok / .ttdl / .tik / .tktok)
 */
async function tiktokCommand(sock, from, msg, q) {
    const data = await fetchTikTokData(q, msg);

    if (!data) {
        // If no link or extraction failed, check if user provided anything at all
        const rawText = (typeof q === 'string' ? q : '').trim();
        const hasSomeTiktokWord = rawText.includes('tiktok') || rawText.includes('douyin') || extractQuotedText(msg).includes('tiktok');
        
        if (hasSomeTiktokWord) {
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return await sock.sendMessage(from, {
                text: "❌ *TikTok link nahi mil saka ya video private/delete ho chuki hai.*\nBarah-e-karam link check karein aur dobara try karein."
            }, { quoted: msg });
        }

        return await sock.sendMessage(from, {
            text:
`╭━━━〔 📱 *TIKTOK DOWNLOADER* 〕━━━┈⊷
┃ 📌 *Usage:*
┃ 👉 *.tt <tiktok url>*
┃ 👉 *.tiktok <tiktok url>*
┃
┃ 💡 *Tip:*
┃ _Aap kisi bhi TikTok link wale message ko reply karke bhi *.tt* likh sakte hain!_
┃
┃ 💡 *Examples:*
┃ .tt https://vt.tiktok.com/ZSp9fXCWS/
┃ .tiktok https://www.tiktok.com/@user/video/...
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *${settings.botName || 'MR SAQIB MD'}*`
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

        const { videoUrl, images, audioUrl, title, author } = data;
        const cleanTitle = (title || 'TikTok Video').replace(/\s+/g, ' ').trim().slice(0, 80);

        // ==========================================
        // CASE A: PHOTO SLIDESHOW / CAROUSEL POST
        // ==========================================
        if (images && images.length > 0) {
            const maxPhotos = Math.min(images.length, 6);
            for (let i = 0; i < maxPhotos; i++) {
                const imgCaption = (i === 0)
                    ? `╭━━━〔 📸 *TIKTOK PHOTO SLIDE* 〕━━━┈⊷\n┃ 📌 *Title:* ${cleanTitle}\n┃ 👤 *Author:* ${author}\n┃ 🖼️ *Slide:* ${i + 1}/${images.length}\n┃ ⚡ *Powered by:* ${settings.botName || 'MR SAQIB MD'}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
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
┃ ⚡ *Powered by:* ${settings.botName || 'MR SAQIB MD'}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

        // Attempt 1: High-reliability Buffer Download (bypasses Baileys streaming quirks)
        let sent = false;
        try {
            const vidRes = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
                timeout: 45000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://www.tiktok.com/'
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
