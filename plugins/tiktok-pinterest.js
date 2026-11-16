// TikTok + Pinterest downloader — koi API key nahi chahiye
// 1) yt-dlp (lib/media-dl.js) se local download  2) Pinterest ke liye page ke og:video / og:image se
const axios = require('axios');
const { cmd } = require('../arslan');
const mediaDl = require('../lib/media-dl');

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

const pickUrl = (q, m) => {
    const raw = String(q || (m && m.quoted && (m.quoted.text || m.quoted.body)) || '');
    const hit = raw.match(/https?:\/\/[^\s]+/i);
    return hit ? hit[0].trim() : '';
};

const isTikTok = (u) => /^https?:\/\/([a-z0-9-]+\.)*(tiktok\.com|tiktokv\.com)\//i.test(u);
const isPinterest = (u) => /^https?:\/\/([a-z0-9-]+\.)*(pinterest\.[a-z.]+|pin\.it)\//i.test(u);

// ───────────────────────── TIKTOK ─────────────────────────
cmd({
    pattern: 'tiktok',
    alias: ['tt', 'tiktokdl', 'ttdl'],
    desc: 'Download TikTok video (no watermark when available)',
    category: 'download',
    use: '.tiktok <TikTok link>',
    react: '🎵',
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        const url = pickUrl(q, m);
        if (!url || !isTikTok(url)) {
            return reply('*TIKTOK VIDEO DOWNLOAD KARNI HAI? 🎵*\n\nLink copy karo aur likho:\n*.tiktok <TikTok link>*\n\nYa kisi link wale message par reply karke *.tiktok* likho.');
        }
        await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } }).catch(() => {});
        const local = await mediaDl.downloadAnyVideo(url);
        await conn.sendMessage(from, {
            video: local.buffer,
            mimetype: 'video/mp4',
            caption: '*🎵 TIKTOK VIDEO 🎵*\n*👑 BY :❯ 𝗔𝗠𝗔𝗡-𝐌𝐃 👑*'
        }, { quoted: mek });
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } }).catch(() => {});
    } catch (e) {
        console.warn('[TIKTOK]', e.message, e.details || '');
        const tooBig = /TOO_BIG|max-filesize/i.test(String(e.message) + JSON.stringify(e.details || ''));
        const why = mediaDl.explainError(e);
        await reply(tooBig
            ? '❌ Video bohat bari hai, WhatsApp par nahi bheji ja sakti.'
            : '❌ TikTok video download nahi ho saki.\nLink public hona chahiye (private ya photo-slideshow post nahi chalta).' + (why ? '\n\n💡 ' + why : ' Thori der baad dobara try karo.'));
    }
});

// ───────────────────────── PINTEREST ─────────────────────────
function metaContent(html, prop) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
    const hit = html.match(re1) || html.match(re2);
    return hit ? hit[1].replace(/&amp;/g, '&') : '';
}

async function pinterestPage(url) {
    const res = await axios.get(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        maxRedirects: 8, timeout: 20000, responseType: 'text',
        validateStatus: s => s >= 200 && s < 400
    });
    const html = String(res.data || '');
    const video = metaContent(html, 'og:video') || metaContent(html, 'og:video:url') || metaContent(html, 'twitter:player:stream');
    let image = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
    if (image) image = image.replace(/\/(?:\d+x\d*|\d+x)\//, '/originals/');
    const title = metaContent(html, 'og:title');
    return { video, image, title };
}

cmd({
    pattern: 'pinterest',
    alias: ['pin', 'pindl', 'pinterestdl'],
    desc: 'Download Pinterest video or image from a pin link',
    category: 'download',
    use: '.pinterest <Pinterest link>',
    react: '📌',
    filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
    try {
        const url = pickUrl(q, m);
        if (!url || !isPinterest(url)) {
            return reply('*PINTEREST VIDEO / PHOTO DOWNLOAD KARNI HAI? 📌*\n\nPin ka link copy karo aur likho:\n*.pinterest <Pinterest link>*\n\nYa kisi link wale message par reply karke *.pinterest* likho.');
        }
        await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } }).catch(() => {});

        // 1) video pin -> yt-dlp
        try {
            const local = await mediaDl.downloadAnyVideo(url);
            await conn.sendMessage(from, {
                video: local.buffer,
                mimetype: 'video/mp4',
                caption: '*📌 PINTEREST VIDEO 📌*\n*👑 BY :❯ 𝗔𝗠𝗔𝗡-𝐌𝐃 👑*'
            }, { quoted: mek });
            return await conn.sendMessage(from, { react: { text: '✅', key: mek.key } }).catch(() => {});
        } catch (e) {
            console.warn('[PINTEREST] yt-dlp failed, trying page meta:', e.message);
        }

        // 2) page ke og:video / og:image se (image pins bhi yahin se)
        const page = await pinterestPage(url);
        const caption = `*📌 PINTEREST ${page.video && /\.mp4/i.test(page.video) ? 'VIDEO' : 'PHOTO'} 📌*${page.title ? `\n*${page.title}*` : ''}\n*👑 BY :❯ 𝗔𝗠𝗔𝗡-𝐌𝐃 👑*`;
        if (page.video && /\.mp4/i.test(page.video)) {
            await conn.sendMessage(from, { video: { url: page.video }, mimetype: 'video/mp4', caption }, { quoted: mek });
        } else if (page.image) {
            await conn.sendMessage(from, { image: { url: page.image }, caption }, { quoted: mek });
        } else {
            return reply('❌ Is pin se video ya photo nahi mili. Link sahi aur public hona chahiye.');
        }
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } }).catch(() => {});
    } catch (e) {
        console.warn('[PINTEREST]', e.message);
        await reply('❌ Pinterest se download nahi ho saka. Link check karo aur dobara try karo.');
    }
});
