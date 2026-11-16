// plugins/animeinfo.js
// MR SAQIB MD — Anime info commands (multi-API, working)
// APIs (keyless): Jikan v4 for info, lib/anime-api.js for images

const { cmd } = require('../arslan');
const axios = require('axios');
const api = require('../lib/anime-api');

const JIKAN = 'https://api.jikan.moe/v4';
const UA = 'AMAN-HELL-MD/3.0';

async function get(url, opts = {}) {
    // Jikan rate-limits (429) and sometimes 5xx: retry with backoff
    let lastErr;
    for (let i = 0; i < 3; i++) {
        try {
            const res = await axios.get(url, {
                timeout: 15000,
                headers: { 'User-Agent': UA, ...(opts.headers || {}) },
                ...opts
            });
            return res.data;
        } catch (e) {
            lastErr = e;
            const st = e.response?.status;
            if (st && st < 500 && st !== 429) break;
            await new Promise(r => setTimeout(r, 900 * (i + 1)));
        }
    }
    throw lastErr;
}

const safe = (v, max = 300) => String(v || 'N/A').replace(/[\r\n]+/g, ' ').slice(0, max);
const isUrl = v => typeof v === 'string' && /^https?:\/\//i.test(v);

// ═══════════════════════════════════════════
//  REGISTER HELPER
// ═══════════════════════════════════════════
function register(pattern, alias, desc, handler) {
    cmd({
        pattern,
        alias,
        desc,
        category: 'anime',
        react: '🎌',
        use: `.${pattern} <name>`,
        filename: __filename
    }, handler);
}

// ═══════════════════════════════════════════
//  MULTI-API IMAGE FETCHERS
// ═══════════════════════════════════════════




// Master — try all, return first successful

// ═══════════════════════════════════════════
const getRandomAnimeImage = cat => api.randomImage(cat);
const nekosBestImage = cat => api.nekosBest(cat);

//  INFO COMMANDS (Jikan)
// ═══════════════════════════════════════════

register('animeinfo', ['aniinfo'], 'Anime details', async (conn, mek, m, ctx) => {
    const q = (ctx.q || '').trim();
    if (!q) return ctx.reply('Use: `.animeinfo Naruto`');
    try {
        const d = await get(`${JIKAN}/anime?q=${encodeURIComponent(q)}&limit=1`);
        const a = d.data?.[0];
        if (!a) return ctx.reply('Anime nahi mila.');
        return ctx.reply(
            `🎌 *ANIME INFO*\n\n` +
            `📺 *${safe(a.title)}*\n` +
            `⭐ Score: ${a.score || 'N/A'}\n` +
            `🎞️ Episodes: ${a.episodes || 'Unknown'}\n` +
            `📅 Year: ${a.year || 'N/A'}\n` +
            `📖 ${safe(a.synopsis, 700)}\n` +
            `🔗 ${a.url}`
        );
    } catch (e) { return ctx.reply('❌ Anime info API busy hai. Thori dair baad try karo.'); }
});

register('animeupcoming', ['aniupcoming'], 'Upcoming anime list', async (conn, mek, m, ctx) => {
    try {
        const d = await get(`${JIKAN}/seasons/upcoming?limit=5`);
        const a = d.data || [];
        return ctx.reply(
            '🆕 *UPCOMING ANIME*\n\n' +
            (a.map((x, i) =>
                `${i + 1}. *${safe(x.title)}*\n📅 ${x.aired?.from ? String(x.aired.from).slice(0, 10) : 'Date TBA'}\n⭐ ${x.score || 'N/A'}`
            ).join('\n\n') || 'No results.')
        );
    } catch (e) { return ctx.reply('❌ Upcoming anime fetch nahi ho saka.'); }
});

register('animetop', ['topanime'], 'Top rated anime', async (conn, mek, m, ctx) => {
    try {
        const d = await get(`${JIKAN}/top/anime?limit=10`);
        return ctx.reply('🏆 *TOP ANIME*\n\n' + (d.data || []).map((x, i) => `${i + 1}. *${safe(x.title)}* — ⭐ ${x.score || 'N/A'}`).join('\n'));
    } catch (e) { return ctx.reply('❌ Top list abhi unavailable hai.'); }
});

register('animemovie', ['animemovies'], 'Anime movies search', async (conn, mek, m, ctx) => {
    const q = (ctx.q || '').trim();
    if (!q) return ctx.reply('Use: `.animemovie Your Name`');
    try {
        const d = await get(`${JIKAN}/anime?q=${encodeURIComponent(q)}&type=movie&limit=5`);
        return ctx.reply(
            '🎬 *ANIME MOVIES*\n\n' +
            ((d.data || []).map((x, i) =>
                `${i + 1}. *${safe(x.title)}*\n⭐ ${x.score || 'N/A'} | ${x.year || 'Year unknown'}\n${x.url}`
            ).join('\n\n') || 'Movie nahi mili.')
        );
    } catch (e) { return ctx.reply('❌ Movie search fail.'); }
});

register('animecharacters', ['anichar'], 'Search anime characters', async (conn, mek, m, ctx) => {
    const q = (ctx.q || '').trim();
    if (!q) return ctx.reply('Use: `.animecharacters Naruto`');
    try {
        const d = await get(`${JIKAN}/characters?q=${encodeURIComponent(q)}&limit=5`);
        return ctx.reply(
            '👤 *ANIME CHARACTERS*\n\n' +
            ((d.data || []).map((x, i) =>
                `${i + 1}. *${safe(x.name)}*\n${x.url}`
            ).join('\n\n') || 'Character nahi mila.')
        );
    } catch (e) { return ctx.reply('❌ Character search fail.'); }
});

register('animegenre', ['anigenre'], 'Anime by genre ID', async (conn, mek, m, ctx) => {
    const id = Number((ctx.q || '').trim());
    if (!Number.isInteger(id) || id < 1 || id > 60) return ctx.reply('Use: `.animegenre 1`\nGenre ID official Jikan list ke mutabiq do.');
    try {
        const d = await get(`${JIKAN}/anime?genres=${id}&order_by=score&sort=desc&limit=5`);
        return ctx.reply(
            '🎭 *ANIME BY GENRE*\n\n' +
            ((d.data || []).map((x, i) =>
                `${i + 1}. *${safe(x.title)}* ⭐ ${x.score || 'N/A'}\n${x.url}`
            ).join('\n\n') || 'Results nahi mile.')
        );
    } catch (e) { return ctx.reply('❌ Genre search fail.'); }
});

register('animeseason', ['aniseason'], 'Current season anime', async (conn, mek, m, ctx) => {
    try {
        const d = await get(`${JIKAN}/seasons/now?limit=10`);
        return ctx.reply('🌸 *CURRENT SEASON ANIME*\n\n' + (d.data || []).map((x, i) => `${i + 1}. *${safe(x.title)}* — ⭐ ${x.score || 'N/A'}`).join('\n'));
    } catch (e) { return ctx.reply('❌ Season list unavailable.'); }
});

register('animegenres', ['anigenres'], 'Show common anime genres', async (conn, mek, m, ctx) => {
    try {
        const d = await get(`${JIKAN}/genres/anime`);
        return ctx.reply(
            '🎭 *ANIME GENRES*\n\n' +
            (d.data || []).slice(0, 25).map(x => `• ${x.name} — ID: ${x.mal_id}`).join('\n')
        );
    } catch (e) { return ctx.reply('❌ Genre list unavailable.'); }
});

register('animebyyear', ['aniyear'], 'Anime released in a year', async (conn, mek, m, ctx) => {
    const y = Number((ctx.q || '').trim());
    if (y < 1960 || y > new Date().getFullYear() + 5) return ctx.reply('Use: `.animebyyear 2024`');
    try {
        const d = await get(`${JIKAN}/anime?start_date=${y}-01-01&end_date=${y}-12-31&order_by=score&sort=desc&limit=5`);
        return ctx.reply(
            `📅 *ANIME ${y}*\n\n` +
            ((d.data || []).map((x, i) =>
                `${i + 1}. *${safe(x.title)}* — ⭐ ${x.score || 'N/A'}\n${x.url}`
            ).join('\n\n') || 'No results.')
        );
    } catch (e) { return ctx.reply('❌ Year search fail.'); }
});

register('animeairing', ['aniairing'], 'Currently airing anime', async (conn, mek, m, ctx) => {
    try {
        const d = await get(`${JIKAN}/seasons/now?filter=tv&limit=8`);
        return ctx.reply(
            '📡 *AIRING ANIME*\n\n' +
            (d.data || []).map((x, i) =>
                `${i + 1}. *${safe(x.title)}*\n⭐ ${x.score || 'N/A'} | Episodes: ${x.episodes || '?'}`
            ).join('\n\n')
        );
    } catch (e) { return ctx.reply('❌ Airing list unavailable.'); }
});

register('animeova', ['aniova'], 'Search OVA anime', async (conn, mek, m, ctx) => {
    const q = (ctx.q || '').trim();
    if (!q) return ctx.reply('Use: `.animeova Naruto`');
    try {
        const d = await get(`${JIKAN}/anime?q=${encodeURIComponent(q)}&type=ova&limit=5`);
        return ctx.reply(
            '📼 *OVA RESULTS*\n\n' +
            ((d.data || []).map((x, i) =>
                `${i + 1}. *${safe(x.title)}*\n${x.url}`
            ).join('\n\n') || 'OVA nahi mili.')
        );
    } catch (e) { return ctx.reply('❌ OVA search fail.'); }
});

register('animespecial', ['anispecial'], 'Search anime specials', async (conn, mek, m, ctx) => {
    const q = (ctx.q || '').trim();
    if (!q) return ctx.reply('Use: `.animespecial Naruto`');
    try {
        const d = await get(`${JIKAN}/anime?q=${encodeURIComponent(q)}&type=special&limit=5`);
        return ctx.reply(
            '✨ *ANIME SPECIALS*\n\n' +
            ((d.data || []).map((x, i) =>
                `${i + 1}. *${safe(x.title)}*\n${x.url}`
            ).join('\n\n') || 'Special nahi mila.')
        );
    } catch (e) { return ctx.reply('❌ Specials search fail.'); }
});

register('animemanga', ['animanga'], 'Search manga', async (conn, mek, m, ctx) => {
    const q = (ctx.q || '').trim();
    if (!q) return ctx.reply('Use: `.animemanga One Piece`');
    try {
        const d = await get(`${JIKAN}/manga?q=${encodeURIComponent(q)}&limit=5`);
        return ctx.reply(
            '📚 *MANGA SEARCH*\n\n' +
            ((d.data || []).map((x, i) =>
                `${i + 1}. *${safe(x.title)}*\n📖 Chapters: ${x.chapters || '?'} | ⭐ ${x.score || 'N/A'}\n${x.url}`
            ).join('\n\n') || 'Manga nahi mili.')
        );
    } catch (e) { return ctx.reply('❌ Manga search fail.'); }
});

register('animepeople', ['anipeople'], 'Search voice actors and people', async (conn, mek, m, ctx) => {
    const q = (ctx.q || '').trim();
    if (!q) return ctx.reply('Use: `.animepeople Mamoru Miyano`');
    try {
        const d = await get(`${JIKAN}/people?q=${encodeURIComponent(q)}&limit=5`);
        return ctx.reply(
            '🎙️ *ANIME PEOPLE*\n\n' +
            ((d.data || []).map((x, i) =>
                `${i + 1}. *${safe(x.name)}*\n${x.url}`
            ).join('\n\n') || 'Person nahi mili.')
        );
    } catch (e) { return ctx.reply('❌ Search fail.'); }
});

register('animefacts', ['anifact'], 'Anime facts from public metadata', async (conn, mek, m, ctx) => {
    const q = (ctx.q || '').trim();
    if (!q) return ctx.reply('Use: `.animefacts Naruto`');
    try {
        const d = await get(`${JIKAN}/anime?q=${encodeURIComponent(q)}&limit=1`);
        const a = d.data?.[0];
        if (!a) return ctx.reply('Anime nahi mila.');
        return ctx.reply(
            `🧠 *${safe(a.title)} FACTS*\n\n` +
            `📺 Type: ${a.type || 'N/A'}\n` +
            `🎞️ Episodes: ${a.episodes || 'Unknown'}\n` +
            `⏱️ Duration: ${safe(a.duration)}\n` +
            `📅 Year: ${a.year || 'N/A'}\n` +
            `🏢 Studio/Source: ${safe(a.source)}\n` +
            `⭐ Score: ${a.score || 'N/A'}\n` +
            `🔗 ${a.url}`
        );
    } catch (e) { return ctx.reply('❌ Facts unavailable.'); }
});

register('animevoice', ['anivoice'], 'Search anime voice actor', async (conn, mek, m, ctx) => {
    const q = (ctx.q || '').trim();
    if (!q) return ctx.reply('Use: `.animevoice character name`');
    try {
        const d = await get(`${JIKAN}/characters?q=${encodeURIComponent(q)}&limit=3`);
        const lines = [];
        for (const c of (d.data || [])) {
            try {
                const v = await get(`${JIKAN}/characters/${c.mal_id}/voices`);
                lines.push(
                    `👤 *${safe(c.name)}*\n` +
                    (v.data || []).slice(0, 3).map(x => `🎙️ ${safe(x.person?.name)} (${safe(x.language)})`).join('\n')
                );
            } catch (_) {
                lines.push(`👤 *${safe(c.name)}*\n_No VA data_`);
            }
        }
        return ctx.reply('🎙️ *VOICE ACTORS*\n\n' + (lines.join('\n\n') || 'Result nahi mila.'));
    } catch (e) { return ctx.reply('❌ Voice actor search fail.'); }
});

// ═══════════════════════════════════════════
//  IMAGE COMMANDS (multi-API)
// ═══════════════════════════════════════════

register('animepicture', ['anipic', 'animepic'], 'Send a safe anime picture', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('waifu');
    if (!r) return ctx.reply('❌ Image APIs unavailable hain. Kuch dair baad try karo.');
    let cap = '🎌 *AMAN ANIME PICTURE*';
    if (r.artist) cap += `\n🎨 ${safe(r.artist)}`;
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: cap }, { quoted: mek });
});

register('animehug', ['anihug', 'hug'], 'Cute anime hug picture', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('hug');
    if (!r) return ctx.reply('❌ Hug image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '🫂 *ANIME HUG*' }, { quoted: mek });
});

register('animewave', ['aniwave', 'wave'], 'Anime wave image', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('wave');
    if (!r) return ctx.reply('❌ Wave image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '👋 *ANIME WAVE*' }, { quoted: mek });
});

register('animehighfive', ['anihighfive'], 'Anime high-five picture', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('highfive');
    if (!r) return ctx.reply('❌ High-five image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '🙌 *ANIME HIGH FIVE*' }, { quoted: mek });
});

register('animehandhold', ['anihandhold'], 'Anime hand-hold picture', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('handhold');
    if (!r) return ctx.reply('❌ Image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '🤝 *ANIME FRIENDSHIP*' }, { quoted: mek });
});

register('animepat', ['anipat', 'pat'], 'Anime pat picture', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('pat');
    if (!r) return ctx.reply('❌ Pat image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '🖐️ *ANIME PAT*' }, { quoted: mek });
});

register('animekiss', ['anikiss', 'kiss'], 'Anime kiss picture', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('kiss');
    if (!r) return ctx.reply('❌ Kiss image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '💋 *ANIME KISS*' }, { quoted: mek });
});

register('animecuddle', ['anicuddle', 'cuddle'], 'Anime cuddle picture', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('cuddle');
    if (!r) return ctx.reply('❌ Cuddle image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '🥰 *ANIME CUDDLE*' }, { quoted: mek });
});

register('animesmile', ['anismile'], 'Anime smile picture', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('smile');
    if (!r) return ctx.reply('❌ Smile image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '😊 *ANIME SMILE*' }, { quoted: mek });
});

register('animedance', ['anidance'], 'Anime dance picture', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('dance');
    if (!r) return ctx.reply('❌ Dance image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '💃 *ANIME DANCE*' }, { quoted: mek });
});

register('animewink', ['aniwink'], 'Anime wink picture', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('wink');
    if (!r) return ctx.reply('❌ Wink image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '😉 *ANIME WINK*' }, { quoted: mek });
});

register('animehappy', ['anihappy'], 'Anime happy picture', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('happy');
    if (!r) return ctx.reply('❌ Happy image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '😄 *ANIME HAPPY*' }, { quoted: mek });
});

register('neko', ['nekopic'], 'Random neko image', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('neko');
    if (!r) return ctx.reply('❌ Neko image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '🐱 *NEKO*' }, { quoted: mek });
});

register('waifu', ['waifupic'], 'Random waifu image', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('waifu');
    if (!r) return ctx.reply('❌ Waifu image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '💗 *WAIFU*' }, { quoted: mek });
});

register('husbando', ['husbandopic'], 'Random husbando image', async (conn, mek, m, ctx) => {
    const r = await getRandomAnimeImage('husbando');
    if (!r) return ctx.reply('❌ Husbando image unavailable.');
    return conn.sendMessage(ctx.from, { image: { url: r.url }, caption: '💙 *HUSBANDO*' }, { quoted: mek });
});

console.log('[MR SAQIB MD] Anime info + image commands loaded (multi-API)');