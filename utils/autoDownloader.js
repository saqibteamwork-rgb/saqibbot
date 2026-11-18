'use strict';

/**
 * MR SAQIB MD :: Auto URL & Social Reel Downloader
 * ============================================================================
 * Automatically detects links sent in chats (Instagram Reels, TikTok,
 * Facebook Videos, YouTube Shorts) and downloads the media without needing
 * any command prefix (.ig, .tt, etc.)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'autodl.json');

// In-memory state and anti-spam locks
let state = {
    globalEnabled: true,
    chats: {}, // jid -> { enabled: boolean }
    stats: {
        total: 0,
        instagram: 0,
        tiktok: 0,
        facebook: 0,
        youtube: 0
    }
};

const busyUrls = new Set();
const chatCooldowns = new Map(); // jid -> lastDownloadTimestamp

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const raw = fs.readFileSync(STATE_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            state = {
                globalEnabled: parsed.globalEnabled !== false,
                chats: parsed.chats || {},
                stats: {
                    total: 0,
                    instagram: 0,
                    tiktok: 0,
                    facebook: 0,
                    youtube: 0,
                    ...(parsed.stats || {})
                }
            };
        } else {
            saveState();
        }
    } catch (e) {
        console.error('[AutoDL Load Error]:', e.message);
    }
}

function saveState() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
        console.error('[AutoDL Save Error]:', e.message);
    }
}

loadState();

function isChatEnabled(jid) {
    if (!state.globalEnabled) return false;
    if (jid && state.chats[jid] && state.chats[jid].enabled === false) return false;
    return true;
}

function setChatEnabled(jid, enabled) {
    if (!state.chats) state.chats = {};
    if (!state.chats[jid]) state.chats[jid] = {};
    state.chats[jid].enabled = Boolean(enabled);
    saveState();
}

function setGlobalEnabled(enabled) {
    state.globalEnabled = Boolean(enabled);
    saveState();
}

function getStats() {
    return state.stats;
}

/**
 * Extracts URL and identifies the supported social platform
 */
function extractUrlAndPlatform(text) {
    if (!text || typeof text !== 'string') return null;

    // Instagram: posts, reels, tv, stories
    const igRegex = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv|stories|share\/reel)\/([a-zA-Z0-9_\-\.]+)/i;
    const igMatch = text.match(igRegex);
    if (igMatch) {
        return { platform: 'instagram', url: igMatch[0].trim() };
    }

    // TikTok: standard, mobile, short, douyin
    const ttRegex = /(?:https?:\/\/)?(?:[a-zA-Z0-9_\-]+\.)?(?:tiktok\.com|douyin\.com)\/[a-zA-Z0-9_\-\.\/]+/i;
    const ttMatch = text.match(ttRegex);
    if (ttMatch) {
        return { platform: 'tiktok', url: ttMatch[0].trim() };
    }

    // Facebook: reels, videos, watch, share
    const fbRegex = /(?:https?:\/\/)?(?:www\.|m\.|web\.|fb\.)?(?:facebook\.com|fb\.watch)\/(?:reel|videos|watch|share|[a-zA-Z0-9_\-\.]+\/videos)\/[^\s]+/i;
    const fbMatch = text.match(fbRegex);
    if (fbMatch) {
        return { platform: 'facebook', url: fbMatch[0].trim() };
    }

    // YouTube Shorts
    const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_\-]{6,15})/i;
    const ytMatch = text.match(ytRegex);
    if (ytMatch && ytMatch[0].includes('shorts/')) {
        return { platform: 'youtube', url: ytMatch[0].trim() };
    }

    return null;
}

/**
 * Multi-Engine Instagram Downloader
 */
async function fetchInstagram(url) {
    // Engine 1: ruhend-scraper
    try {
        const ruhend = require('ruhend-scraper');
        if (ruhend && typeof ruhend.igdl === 'function') {
            const res = await ruhend.igdl(url);
            if (res && (res.video || (Array.isArray(res.data) && res.data.length > 0))) {
                const videoUrl = res.video || res.data?.[0]?.url;
                if (videoUrl) return { videoUrl, caption: 'Instagram Reel' };
            }
        }
    } catch (_) {}

    // Engine 2: ultra-igdl
    try {
        const ultra = require('ultra-igdl');
        if (ultra && typeof ultra.ultraigdl === 'function') {
            const res = await ultra.ultraigdl(url);
            if (res?.data && res.data.length > 0) {
                const item = res.data[0];
                const videoUrl = item.url || item.downloadUrl;
                if (videoUrl) return { videoUrl, caption: 'Instagram Reel' };
            }
        }
    } catch (_) {}

    // Engine 3: ab-downloader
    try {
        const ab = require('ab-downloader');
        if (ab && typeof ab.igdl === 'function') {
            const res = await ab.igdl(url);
            if (res && (res.result || res.url)) {
                const videoUrl = typeof res.result === 'string' ? res.result : (res.result?.[0]?.url || res.url);
                if (videoUrl) return { videoUrl, caption: 'Instagram Reel' };
            }
        }
    } catch (_) {}

    // Engine 4: public API (aswin-sparky)
    try {
        const res = await axios.get(`https://api-aswin-sparky.koyeb.app/api/downloader/igdl?url=${encodeURIComponent(url)}`, { timeout: 8000 });
        if (res.data?.status && res.data.data?.length) {
            const v = res.data.data.find(x => x.type === 'video') || res.data.data[0];
            if (v?.url) return { videoUrl: v.url, caption: 'Instagram Media' };
        }
    } catch (_) {}

    // Engine 5: public API (jawad-tech)
    try {
        const res = await axios.get(`https://jawad-tech.vercel.app/downloader?url=${encodeURIComponent(url)}`, { timeout: 8000 });
        if (res.data?.status && Array.isArray(res.data.result) && res.data.result.length > 0) {
            const videoUrl = res.data.result[0];
            if (videoUrl) return { videoUrl, caption: 'Instagram Video' };
        }
    } catch (_) {}

    return null;
}

/**
 * Multi-Engine TikTok Downloader
 */
async function fetchTikTok(url) {
    // Engine 1: commands/tiktok.js (TikWM, SSSTik, Ruhend, Jawad)
    try {
        const { fetchTikTokData } = require('../commands/tiktok');
        if (typeof fetchTikTokData === 'function') {
            const data = await fetchTikTokData(url);
            if (data && (data.videoUrl || data.images)) {
                return {
                    videoUrl: data.videoUrl,
                    images: data.images,
                    title: data.title,
                    author: data.author
                };
            }
        }
    } catch (_) {}

    // Engine 2: direct TikWM
    try {
        const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (res.data?.code === 0 && res.data?.data) {
            const d = res.data.data;
            let videoUrl = d.play || d.hdplay || d.wmplay;
            if (videoUrl && videoUrl.startsWith('/')) videoUrl = 'https://www.tikwm.com' + videoUrl;
            return {
                videoUrl,
                images: Array.isArray(d.images) && d.images.length > 0 ? d.images : null,
                title: d.title || 'TikTok Video',
                author: d.author?.nickname || 'TikTok'
            };
        }
    } catch (_) {}

    // Engine 3: ruhend-scraper
    try {
        const ruhend = require('ruhend-scraper');
        if (ruhend && typeof ruhend.ttdl === 'function') {
            const res = await ruhend.ttdl(url);
            if (res && (res.video || res.url)) {
                return { videoUrl: res.video || res.url, title: res.title || 'TikTok Video' };
            }
        }
    } catch (_) {}

    // Engine 4: ab-downloader
    try {
        const ab = require('ab-downloader');
        if (ab && typeof ab.ttdl === 'function') {
            const res = await ab.ttdl(url);
            const videoUrl = res?.video || res?.result || res?.url;
            if (videoUrl) return { videoUrl, title: res.title || 'TikTok Video' };
        }
    } catch (_) {}

    return null;
}

/**
 * Multi-Engine Facebook Downloader
 */
async function fetchFacebook(url) {
    // Engine 1: ruhend-scraper
    try {
        const ruhend = require('ruhend-scraper');
        if (ruhend && typeof ruhend.fbdl === 'function') {
            const res = await ruhend.fbdl(url);
            if (res && (res.video || res.data?.[0]?.url)) {
                return { videoUrl: res.video || res.data[0].url };
            }
        }
    } catch (_) {}

    // Engine 2: ab-downloader
    try {
        const ab = require('ab-downloader');
        if (ab && typeof ab.fbdown === 'function') {
            const res = await ab.fbdown(url);
            const videoUrl = res?.hd || res?.sd || res?.result || res?.url;
            if (videoUrl) return { videoUrl };
        }
    } catch (_) {}

    // Engine 3: jawad-tech
    try {
        const res = await axios.get(`https://jawad-tech.vercel.app/downloader?url=${encodeURIComponent(url)}`, { timeout: 8000 });
        if (res.data?.status && Array.isArray(res.data.result) && res.data.result.length > 0) {
            const hd = res.data.result.find(v => v.quality === 'HD');
            const sd = res.data.result.find(v => v.quality === 'SD');
            const target = hd || sd || res.data.result[0];
            if (target?.url) return { videoUrl: target.url };
        }
    } catch (_) {}

    return null;
}

/**
 * Multi-Engine YouTube Shorts Downloader
 */
async function fetchYouTube(url) {
    try {
        const ab = require('ab-downloader');
        if (ab && typeof ab.youtube === 'function') {
            const res = await ab.youtube(url);
            const videoUrl = res?.video || res?.mp4 || res?.url;
            if (videoUrl) return { videoUrl, title: res.title || 'YouTube Short' };
        }
    } catch (_) {}

    try {
        const res = await axios.get(`https://jawad-tech.vercel.app/download/ytdl?url=${encodeURIComponent(url)}`, { timeout: 8000 });
        if (res.data?.status && res.data?.result?.video) {
            return { videoUrl: res.data.result.video, title: res.data.metadata?.title || 'YouTube Short' };
        }
    } catch (_) {}

    return null;
}

/**
 * Main Auto-Downloader Handler for incoming messages
 */
async function handleMessage(sock, from, msg, text, isGroup = false) {
    if (!from || from === 'status@broadcast' || from.endsWith('@newsletter')) return false;

    // Do not trigger if message is an explicit command (.ig, .tiktok, .ytdl, etc.)
    if (/^[.#!/?][a-zA-Z0-9]/.test(text.trim())) return false;

    // Check if AutoDL is enabled for this chat
    if (!isChatEnabled(from)) return false;

    const detected = extractUrlAndPlatform(text);
    if (!detected || !detected.url || !detected.platform) return false;

    const { platform, url } = detected;

    // Concurrency & spam check
    if (busyUrls.has(url)) return false;

    // Chat cooldown (5 seconds)
    const lastDl = chatCooldowns.get(from) || 0;
    if (Date.now() - lastDl < 5000) return false;

    busyUrls.add(url);
    chatCooldowns.set(from, Date.now());

    // Show processing reaction
    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

    try {
        let media = null;
        if (platform === 'instagram') media = await fetchInstagram(url);
        else if (platform === 'tiktok') media = await fetchTikTok(url);
        else if (platform === 'facebook') media = await fetchFacebook(url);
        else if (platform === 'youtube') media = await fetchYouTube(url);

        if (!media || (!media.videoUrl && !media.images)) {
            // Remove processing reaction
            await sock.sendMessage(from, { react: { text: '', key: msg.key } }).catch(() => {});
            busyUrls.delete(url);
            return false;
        }

        const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
        const caption =
            `╔══════════════════════════╗\n` +
            `   📥 *MR SAQIB MD :: AUTO DOWNLOADER*\n` +
            `╚══════════════════════════╝\n\n` +
            `🎬 *Platform:* ${platformName}\n` +
            `${media.title ? `📝 *Title:* ${media.title.slice(0, 100)}\n` : ''}` +
            `${media.author ? `👤 *Creator:* ${media.author}\n` : ''}` +
            `⚡ *Quality:* HD (No Watermark)\n\n` +
            `> *Powered by MR SAQIB MD*`;

        const contextInfo = {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363431913895899@newsletter',
                newsletterName: 'Mr SAQIB',
                serverMessageId: 1
            }
        };

        if (media.videoUrl) {
            await sock.sendMessage(from, {
                video: { url: media.videoUrl },
                caption,
                contextInfo
            }, { quoted: msg });
        } else if (Array.isArray(media.images) && media.images.length > 0) {
            // Send first slide with caption, others as carousel
            for (let i = 0; i < Math.min(media.images.length, 5); i++) {
                const imgUrl = media.images[i];
                await sock.sendMessage(from, {
                    image: { url: imgUrl },
                    caption: i === 0 ? caption : undefined,
                    contextInfo: i === 0 ? contextInfo : undefined
                }, { quoted: msg });
                await new Promise(r => setTimeout(r, 600));
            }
        }

        // Success reaction
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

        // Update statistics
        state.stats.total = (state.stats.total || 0) + 1;
        state.stats[platform] = (state.stats[platform] || 0) + 1;
        saveState();

        return true;
    } catch (err) {
        console.error(`[AutoDL Error on ${platform}]:`, err.message);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return false;
    } finally {
        busyUrls.delete(url);
    }
}

module.exports = {
    loadState,
    saveState,
    isChatEnabled,
    setChatEnabled,
    setGlobalEnabled,
    getStats,
    extractUrlAndPlatform,
    handleMessage,
    getState: () => state
};
