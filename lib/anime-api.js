// lib/anime-api.js
// One shared anime backend: keyless APIs only, retry + automatic fallback.
//   Images/GIFs : nekos.best (v2)  ->  waifu.pics  ->  nekosia
//   Characters  : AniList (GraphQL) -> Jikan (MAL) -> Kitsu
//   Tags        : mapped to nekos.best / waifu.pics categories, else character search
// Nothing here needs an API key.

const axios = require('axios');

const UA = 'AMAN-MINI-BOT/3.1';
const TIMEOUT = 12000;
const isUrl = v => typeof v === 'string' && /^https?:\/\//i.test(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function http(method, url, { data, headers, retries = 2 } = {}) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await axios({
                method, url, data, timeout: TIMEOUT,
                headers: { 'User-Agent': UA, Accept: 'application/json', ...(headers || {}) }
            });
            return res.data;
        } catch (e) {
            lastErr = e;
            const st = e.response?.status;
            // retry only for temporary errors
            if (st && st < 500 && st !== 429) break;
            if (i < retries) await sleep(700 * (i + 1));
        }
    }
    throw lastErr;
}
const getJson = (url, o) => http('GET', url, o);

// ───────────── categories ─────────────
const NEKOS_BEST_CATS = new Set([
    'neko', 'waifu', 'husbando', 'kitsune',
    'angry', 'baka', 'bite', 'blush', 'bored', 'cry', 'cuddle', 'dance', 'facepalm', 'feed', 'handhold',
    'handshake', 'happy', 'highfive', 'hug', 'kick', 'kiss', 'laugh', 'lurk', 'nod', 'nom', 'nope', 'pat',
    'peck', 'poke', 'pout', 'punch', 'run', 'shoot', 'shrug', 'slap', 'sleep', 'smile', 'smug', 'stare',
    'think', 'thumbsup', 'tickle', 'wave', 'wink', 'yawn', 'yeet'
]);
const WAIFU_PICS_CATS = new Set([
    'waifu', 'neko', 'shinobu', 'megumin', 'bully', 'cuddle', 'cry', 'hug', 'awoo', 'kiss', 'lick', 'pat',
    'smug', 'bonk', 'yeet', 'blush', 'smile', 'wave', 'highfive', 'handhold', 'nom', 'bite', 'glomp',
    'slap', 'kill', 'kick', 'happy', 'wink', 'poke', 'dance', 'cringe'
]);

// ───────────── image providers ─────────────
async function nekosBest(category = 'neko') {
    if (!NEKOS_BEST_CATS.has(category)) return null;
    try {
        const d = await getJson(`https://nekos.best/api/v2/${category}?amount=1`);
        const r = d?.results?.[0];
        if (isUrl(r?.url)) return { url: r.url, artist: r.artist_name || null, anime: r.anime_name || null, source: r.source_url || null };
    } catch (e) { console.warn('[anime-api] nekos.best:', e.message); }
    return null;
}

async function waifuPics(category = 'waifu') {
    if (!WAIFU_PICS_CATS.has(category)) return null;
    try {
        const d = await getJson(`https://api.waifu.pics/sfw/${category}`);
        if (isUrl(d?.url)) return { url: d.url };
    } catch (e) { console.warn('[anime-api] waifu.pics:', e.message); }
    return null;
}

async function nekosia(category = 'catgirl') {
    try {
        const d = await getJson(`https://api.nekosia.cat/api/v1/images/${encodeURIComponent(category)}?rating=safe`);
        const url = d?.image?.original?.url || d?.image?.compressed?.url;
        if (isUrl(url)) return { url, artist: d?.anime?.title || null, tags: d?.tags || [] };
    } catch (e) { console.warn('[anime-api] nekosia:', e.message); }
    return null;
}

// extra keyless providers so one dead API never breaks .waifu / .neko
async function waifuIm(tag = 'waifu') {
    try {
        const d = await getJson(`https://api.waifu.im/search?included_tags=${encodeURIComponent(tag)}&is_nsfw=false`);
        const url = d?.images?.[0]?.url;
        if (isUrl(url)) return { url, source: d?.images?.[0]?.source || null };
    } catch (e) { console.warn('[anime-api] waifu.im:', e.message); }
    return null;
}

async function purrbot(category = 'neko') {
    try {
        const d = await getJson(`https://api.purrbot.site/v2/img/sfw/${encodeURIComponent(category)}/img`);
        if (!d?.error && isUrl(d?.link)) return { url: d.link };
    } catch (e) { console.warn('[anime-api] purrbot:', e.message); }
    return null;
}

// ───────────── character / anime search ─────────────
async function anilistQuery(query, variables) {
    const d = await http('POST', 'https://graphql.anilist.co', {
        data: { query, variables },
        headers: { 'Content-Type': 'application/json' }
    });
    return d?.data;
}

async function anilistCharacterImages(q) {
    try {
        const d = await anilistQuery(
            'query($s:String){Page(perPage:5){characters(search:$s){image{large} name{full}}}}', { s: q });
        return (d?.Page?.characters || []).map(c => c?.image?.large).filter(isUrl);
    } catch (e) { console.warn('[anime-api] anilist character:', e.message); return []; }
}

async function anilistAnimeImages(q) {
    try {
        const d = await anilistQuery(
            'query($s:String){Page(perPage:5){media(search:$s,type:ANIME,isAdult:false){coverImage{extraLarge large} bannerImage}}}', { s: q });
        const out = [];
        for (const m of d?.Page?.media || []) {
            if (isUrl(m?.coverImage?.extraLarge || m?.coverImage?.large)) out.push(m.coverImage.extraLarge || m.coverImage.large);
        }
        return out;
    } catch (e) { console.warn('[anime-api] anilist anime:', e.message); return []; }
}

async function jikanCharacterImages(q) {
    try {
        const d = await getJson(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(q)}&limit=5`);
        return (d?.data || []).map(c => c.images?.webp?.image_url || c.images?.jpg?.image_url).filter(isUrl);
    } catch (e) { console.warn('[anime-api] jikan character:', e.message); return []; }
}

async function jikanAnimeImages(q) {
    try {
        const d = await getJson(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=5&sfw=true`);
        return (d?.data || []).map(a => a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url || a.images?.jpg?.image_url).filter(isUrl);
    } catch (e) { console.warn('[anime-api] jikan anime:', e.message); return []; }
}

async function kitsuAnimeImages(q) {
    try {
        const d = await getJson(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=5`, {
            headers: { Accept: 'application/vnd.api+json' }
        });
        return (d?.data || []).map(a => a.attributes?.posterImage?.large || a.attributes?.posterImage?.original).filter(isUrl);
    } catch (e) { console.warn('[anime-api] kitsu:', e.message); return []; }
}

// Search by character/series name — first provider that gives results wins
async function searchImages(q, limit = 3) {
    const seen = new Set();
    const out = [];
    const push = arr => { for (const u of arr) if (isUrl(u) && !seen.has(u)) { seen.add(u); out.push(u); } };

    push(await anilistCharacterImages(q));
    if (out.length < 2) push(await jikanCharacterImages(q));
    if (out.length < 2) push(await anilistAnimeImages(q));
    if (out.length < 2) push(await jikanAnimeImages(q));
    if (out.length < 2) push(await kitsuAnimeImages(q));
    return out.slice(0, limit);
}

// ───────────── random image with fallback chain ─────────────
async function randomImage(category = 'waifu') {
    const cat = String(category || 'waifu').toLowerCase();
    const chain = [
        () => nekosBest(cat),
        () => waifuPics(cat),
        () => (cat === 'neko' || cat === 'catgirl' ? nekosia('catgirl') : null),
        () => waifuIm(cat === 'neko' ? 'maid' : 'waifu'),
        () => purrbot(cat === 'neko' ? 'neko' : 'neko'),
        // generic safety nets if the category is not supported anywhere
        () => nekosBest('waifu'),
        () => waifuPics('waifu')
    ];
    for (const step of chain) {
        const r = await step();
        if (r?.url) return r;
    }
    return null;
}

// tag search (kept for .animetag) — categories first, then character search
async function taggedImage(tag) {
    const t = String(tag || '').toLowerCase().trim();
    if (!t) return randomImage('waifu');
    if (NEKOS_BEST_CATS.has(t) || WAIFU_PICS_CATS.has(t)) {
        const r = await randomImage(t);
        if (r) return { ...r, tags: [t] };
    }
    const imgs = await searchImages(t.replace(/-/g, ' '), 5);
    if (imgs.length) return { url: imgs[Math.floor(Math.random() * imgs.length)], tags: [t] };
    return null;
}

module.exports = {
    NEKOS_BEST_CATS, WAIFU_PICS_CATS,
    getJson, nekosBest, waifuPics, nekosia, waifuIm, purrbot,
    anilistCharacterImages, anilistAnimeImages, jikanCharacterImages, jikanAnimeImages, kitsuAnimeImages,
    searchImages, randomImage, taggedImage
};
