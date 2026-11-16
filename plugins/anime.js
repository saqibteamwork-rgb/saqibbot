// plugins/anime.js
// MR SAQIB MD — Anime commands with multi-API fallback
// APIs (all keyless): AniList, Jikan, Kitsu, Nekos.best, waifu.pics, Nekosia — via lib/anime-api.js

const { cmd } = require('../arslan');
const axios = require('axios');
const api = require('../lib/anime-api');

const TIMEOUT = 12000;
const UA = 'SAQIB-MD/3.0';

// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════
async function httpGet(url, opts = {}) {
    const res = await axios.get(url, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': UA, ...(opts.headers || {}) },
        ...opts
    });
    return res.data;
}

const clean = v => String(v || '').replace(/[\r\n]+/g, ' ').slice(0, 160);
const isUrl = v => typeof v === 'string' && /^https?:\/\//i.test(v);

// ═══════════════════════════════════════════
//  API LAYER — lib/anime-api.js (keyless, retry + fallback)
// ═══════════════════════════════════════════
const NEKOS_CATEGORIES = [...api.NEKOS_BEST_CATS];
const WAIFU_TAGS = ['waifu', 'neko', 'maid', 'megumin', 'shinobu', 'raiden shogun', 'kamisato ayaka', 'marin kitagawa', 'hug', 'pat'];
const nekosBestRandom = cat => api.nekosBest(cat);
const waifuPicsRandom = cat => api.waifuPics(cat);
const nekosiaRandom = () => api.nekosia();
const waifuImRandom = tag => (tag ? api.taggedImage(tag) : api.randomImage('waifu'));
const getAnimeImages = q => api.searchImages(q, 3);

// ═══════════════════════════════════════════
//  API 1 — JIKAN v4 (MyAnimeList)
// ═══════════════════════════════════════════
const JIKAN = 'https://api.jikan.moe/v4';



// ═══════════════════════════════════════════
//  API 2 — NEKOS.BEST (SFW images/GIFs)
// ═══════════════════════════════════════════



// ═══════════════════════════════════════════
//  API 3 — WAIFU.IM (SFW curated)
// ═══════════════════════════════════════════



// ═══════════════════════════════════════════
//  API 4 — NEKOSIA (keyless, no auth)
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
//  API 5 — WAIFU.PICS (backup)
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
//  MASTER — Character image search
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
//  .anime — character/series search
// ═══════════════════════════════════════════
cmd({
    pattern: 'anime',
    alias: ['animes', 'animeimg', 'animepic', 'animecharacter'],
    desc: 'Search anime character images',
    category: 'fun',
    react: '🎀',
    use: '.anime <character or series>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const query = (ctx.q || '').trim();

    if (!query) {
        return ctx.reply(
`🎀 *SAQIB ANIME CENTER*

📌 *Commands:*
• \`.anime <name>\` — character/series search
• \`.randomanime [category]\` — random SFW image
• \`.animegif <category>\` — random anime GIF
• \`.animetag <tag>\` — Waifu.im tag search
• \`.neko\` — random neko
• \`.waifu\` — random waifu
• \`.husbando\` — random husbando

📖 *Examples:*
.anime Naruto
.anime Mikasa
.randomanime
.animegif hug
.animetag maid`
        );
    }

    await conn.sendMessage(ctx.from, { react: { text: '🔍', key: mek.key } });

    try {
        const images = await getAnimeImages(query);

        if (!images.length) {
            return ctx.reply('❌ Koi image nahi mili. Dusra naam try karo.');
        }

        let sent = 0;
        for (const url of images) {
            try {
                await conn.sendMessage(ctx.from, {
                    image: { url },
                    caption: `🎀 *SAQIB ANIME*\n🔎 ${clean(query)}\n🖼️ ${sent + 1}/${images.length}`
                }, { quoted: mek });
                sent++;
                await new Promise(r => setTimeout(r, 400));
            } catch (e) {
                console.warn('[anime] send fail:', e.message);
            }
        }

        if (!sent) return ctx.reply('❌ Images mili but send nahi ho saki.');

    } catch (err) {
        console.error('[anime] error:', err.message);
        return ctx.reply('❌ Anime search fail. Dobara try karo.');
    }
});

// ═══════════════════════════════════════════
//  .randomanime — random SFW image (multi-API)
// ═══════════════════════════════════════════
cmd({
    pattern: 'randomanime',
    alias: ['random', 'waifupic', 'animepicture'],
    desc: 'Random SFW anime image',
    category: 'fun',
    react: '🖼️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const pick = await api.randomImage('neko');

        if (!pick) return ctx.reply('❌ Random API unavailable.');

        let caption = '🖼️ *SAQIB RANDOM ANIME*';
        if (pick.artist) caption += `\n🎨 Artist: ${clean(pick.artist)}`;
        if (pick.anime) caption += `\n📺 Anime: ${clean(pick.anime)}`;

        return conn.sendMessage(ctx.from, {
            image: { url: pick.url },
            caption
        }, { quoted: mek });

    } catch (e) {
        console.warn('[random] err:', e.message);
        return ctx.reply('❌ Random image fail.');
    }
});

// ═══════════════════════════════════════════
//  .animegif — random GIF from Nekos.best
// ═══════════════════════════════════════════
cmd({
    pattern: 'animegif',
    alias: ['gifanime', 'animeaction'],
    desc: 'Random anime GIF (hug, pat, kiss, dance, etc.)',
    category: 'fun',
    react: '🎬',
    use: '.animegif <category>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const category = (ctx.q || 'hug').toLowerCase().trim().split(/\s+/)[0];

    const validCats = ['hug', 'kiss', 'pat', 'cuddle', 'dance', 'wave', 'poke',
                       'happy', 'wink', 'smile', 'bite', 'blush', 'bored',
                       'cry', 'facepalm', 'highfive', 'kick', 'laugh',
                       'nod', 'nom', 'nope', 'pout', 'punch', 'shoot',
                       'shrug', 'slap', 'sleep', 'smug', 'stare', 'think',
                       'thumbsup', 'tickle', 'wag', 'yawn', 'yeet'];

    if (!validCats.includes(category)) {
        return ctx.reply(
`🎬 *ANIME GIF*

📌 *Usage:* .animegif <category>

📖 *Categories:*
${validCats.slice(0, 20).map(c => `• \`${c}\``).join('\n')}
...and ${validCats.length - 20} more

📖 *Example:* .animegif hug`
        );
    }

    try {
        const result = await nekosBestRandom(category);
        if (!result?.url) return ctx.reply('❌ GIF nahi mila.');

        let caption = `🎬 *SAQIB ANIME GIF*\n✨ Category: \`${category}\``;
        if (result.anime) caption += `\n📺 Anime: ${clean(result.anime)}`;
        if (result.artist) caption += `\n🎨 Artist: ${clean(result.artist)}`;

        return conn.sendMessage(ctx.from, {
            video: { url: result.url },
            gifPlayback: true,
            caption
        }, { quoted: mek });

    } catch (e) {
        console.warn('[animegif] err:', e.message);
        return ctx.reply('❌ GIF fetch fail.');
    }
});

// ═══════════════════════════════════════════
//  .animetag — Waifu.im tag search
// ═══════════════════════════════════════════
cmd({
    pattern: 'animetag',
    alias: ['waifutag', 'tagsearch'],
    desc: 'Search by Waifu.im tag',
    category: 'fun',
    react: '🏷️',
    use: '.animetag <tag>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const tag = (ctx.q || '').toLowerCase().trim();

    if (!tag) {
        return ctx.reply(
`🏷️ *ANIME TAG SEARCH*

📌 *Usage:* .animetag <tag>

📖 *Popular tags:*
${WAIFU_TAGS.slice(0, 10).map(t => `• \`${t}\``).join('\n')}

📖 *Example:* .animetag maid`
        );
    }

    try {
        const result = await waifuImRandom(tag);
        if (!result?.url) return ctx.reply(`❌ Tag \`${tag}\` ke liye image nahi mili.`);

        let caption = `🏷️ *WAIFU TAG: ${clean(tag)}*`;
        if (result.artist) caption += `\n🎨 Artist: ${clean(result.artist)}`;
        if (result.tags?.length) caption += `\n🔖 Tags: ${result.tags.slice(0, 5).join(', ')}`;

        return conn.sendMessage(ctx.from, {
            image: { url: result.url },
            caption
        }, { quoted: mek });

    } catch (e) {
        return ctx.reply('❌ Tag search fail.');
    }
});

// ═══════════════════════════════════════════
//  .neko — random neko image
// ═══════════════════════════════════════════
cmd({
    pattern: 'neko',
    alias: ['nekopic', 'catgirl'],
    desc: 'Random neko image',
    category: 'fun',
    react: '🐱',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const pick = await api.randomImage('neko');
        if (!pick) return ctx.reply('❌ Neko API unavailable.');

        let caption = '🐱 *SAQIB NEKO*';
        if (pick.artist) caption += `\n🎨 ${clean(pick.artist)}`;

        return conn.sendMessage(ctx.from, {
            image: { url: pick.url },
            caption
        }, { quoted: mek });

    } catch (e) {
        return ctx.reply('❌ Neko fail.');
    }
});

// ═══════════════════════════════════════════
//  .waifu — random waifu
// ═══════════════════════════════════════════
cmd({
    pattern: 'waifu',
    alias: ['waifupic', 'mywaifu'],
    desc: 'Random waifu image',
    category: 'fun',
    react: '💗',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const pick = await api.randomImage('waifu');
        if (!pick) return ctx.reply('❌ Waifu API unavailable.');

        let caption = '💗 *SAQIB WAIFU*';
        if (pick.artist) caption += `\n🎨 ${clean(pick.artist)}`;

        return conn.sendMessage(ctx.from, {
            image: { url: pick.url },
            caption
        }, { quoted: mek });

    } catch (e) {
        return ctx.reply('❌ Waifu fail.');
    }
});

// ═══════════════════════════════════════════
//  .husbando — random husbando
// ═══════════════════════════════════════════
cmd({
    pattern: 'husbando',
    alias: ['husbandopic', 'myhusbando'],
    desc: 'Random husbando image',
    category: 'fun',
    react: '💙',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const pick = await api.randomImage('husbando');
        if (!pick) return ctx.reply('❌ Husbando API unavailable.');

        let caption = '💙 *SAQIB HUSBANDO*';
        if (pick.artist) caption += `\n🎨 ${clean(pick.artist)}`;

        return conn.sendMessage(ctx.from, {
            image: { url: pick.url },
            caption
        }, { quoted: mek });

    } catch (e) {
        return ctx.reply('❌ Husbando fail.');
    }
});

console.log('[MR SAQIB MD] Anime commands loaded (multi-API)');