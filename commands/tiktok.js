const axios = require('axios');
let ttdl;
try {
    ttdl = require('ruhend-scraper').ttdl;
} catch {}
const settings = require('../settings');

/**
 * Highly Resilient Multi-Engine TikTok Video Downloader
 * - Supports short URLs (vt.tiktok.com, vm.tiktok.com) & full URLs (tiktok.com/@user/video/...)
 * - 4-Tier Fallback Architecture:
 *     Tier 1: TikWM Direct GET API (fast, reliable, handles short links natively)
 *     Tier 2: Jawad-Tech Vercel API
 *     Tier 3: TikWM POST API
 *     Tier 4: Ruhend Scraper ttdl
 * - High-speed binary buffer download + URL stream fallback for 100% Baileys delivery
 */
async function tiktokCommand(sock, from, msg, q) {
    const rawText = (typeof q === 'string' ? q : '').trim();
    const urlMatch = rawText.match(/https?:\/\/(?:[a-zA-Z0-9_-]+\.)?tiktok\.com\/[^\s]+/i);
    const targetUrl = urlMatch ? urlMatch[0].trim() : rawText;

    if (!targetUrl || !targetUrl.includes('tiktok.com')) {
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 📱 *TIKTOK DOWNLOADER* 〕━━━┈⊷
┃ 📌 *Usage:*
┃ 👉 *.tt <tiktok url>*
┃ 👉 *.tiktok <tiktok url>*
┃
┃ 💡 *Example:*
┃ .tt https://vt.tiktok.com/ZSp9fXCWS/
┃ .tiktok https://www.tiktok.com/@user/video/...
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *${settings.botName || 'MR SAQIB MD'}*`
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

        let videoUrl = null;
        let title = 'TikTok Video';
        let author = 'TikTok Creator';

        // ==========================================
        // TIER 1: TikWM Direct GET API
        // ==========================================
        try {
            const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
            });

            if (res.data && res.data.code === 0 && res.data.data) {
                const d = res.data.data;
                videoUrl = d.play || d.hdplay || d.wmplay;
                if (videoUrl && videoUrl.startsWith('/')) {
                    videoUrl = 'https://www.tikwm.com' + videoUrl;
                }
                title = d.title || title;
                author = d.author?.nickname || d.author?.unique_id || author;
            }
        } catch (err) {
            console.warn('[TikTok] Tier 1 (TikWM GET) error:', err.message);
        }

        // ==========================================
        // TIER 2: Jawad-Tech Vercel API
        // ==========================================
        if (!videoUrl) {
            try {
                const res = await axios.get(`https://jawad-tech.vercel.app/download/tiktok?url=${encodeURIComponent(targetUrl)}`, {
                    timeout: 15000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

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
        if (!videoUrl) {
            try {
                const params = new URLSearchParams();
                params.append('url', targetUrl);
                params.append('count', '12');
                params.append('cursor', '0');
                params.append('web', '1');
                params.append('hd', '1');

                const res = await axios.post('https://tikwm.com/api/', params, {
                    timeout: 15000,
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
        if (!videoUrl && typeof ttdl === 'function') {
            try {
                const data = await ttdl(targetUrl);
                if (data && (data.video || data.video_hd || data.video_wm)) {
                    // Note: prefer standard .video over .video_hd to prevent TikWM 400 bad request
                    videoUrl = data.video || data.video_hd || data.video_wm;
                    title = data.title || title;
                    author = data.author || data.username || author;
                }
            } catch (err) {
                console.warn('[TikTok] Tier 4 (ruhend-scraper) error:', err.message);
            }
        }

        if (!videoUrl) {
            throw new Error('Video download link nahi mil saka. Baraye meharbani link check karein.');
        }

        const cleanTitle = (title || 'TikTok Video').replace(/\s+/g, ' ').trim().slice(0, 80);
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

module.exports = tiktokCommand;
