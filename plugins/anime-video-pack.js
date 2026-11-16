const { cmd } = require('../arslan');
const axios = require('axios');

const API = 'https://api.jikan.moe/v4';
const clean = (value, max = 180) => String(value || 'N/A').replace(/[\r\n]+/g, ' ').slice(0, max);

async function api(path) {
    const response = await axios.get(`${API}${path}`, {
        timeout: 15000,
        headers: { 'User-Agent': 'SAQIB-MD/2.3 anime-video-commands' }
    });
    return response.data;
}

async function searchAnime(query) {
    const result = await api(`/anime?q=${encodeURIComponent(query)}&limit=5&sfw=true`);
    return result.data || [];
}

async function chooseAnime(query, ctx) {
    if (!query) {
        await ctx.reply('🎌 Anime ka naam likho.\nExample: `.animetrailer Naruto`');
        return null;
    }
    const list = await searchAnime(query);
    if (!list.length) {
        await ctx.reply('❌ Is naam ka anime nahi mila. Spelling check karke dobara try karo.');
        return null;
    }
    return list[0];
}

function videoUrl(video) {
    return video?.trailer?.url || video?.url || video?.embed_url || null;
}

function formatVideo(video, index, label) {
    const title = clean(video.title || video.name || `${label} ${index + 1}`, 120);
    const url = videoUrl(video);
    return url ? `${index + 1}. *${title}*\n🔗 ${url}` : '';
}

function register(pattern, alias, desc, handler) {
    cmd({
        pattern, alias, desc, category: 'anime', react: '🎬',
        use: `.${pattern} <anime name>`, filename: __filename
    }, handler);
}

register('animetrailer', ['anitrailer', 'animepv'], 'Find available anime trailers and promos', async (conn, mek, m, ctx) => {
    const query = (ctx.q || '').trim();
    try {
        const anime = await chooseAnime(query, ctx);
        if (!anime) return;
        const result = await api(`/anime/${anime.mal_id}/videos`);
        const videos = (result.data?.promo || []).filter(v => videoUrl(v)).slice(0, 6);
        const trailer = anime.trailer?.url;
        let body = `🎬 *SAQIB ANIME TRAILERS*\n\n📺 *${clean(anime.title)}*\n`;
        if (trailer) body += `\n▶️ Main trailer: ${trailer}\n`;
        if (videos.length) body += '\n' + videos.map((v, i) => formatVideo(v, i, 'Promo')).filter(Boolean).join('\n\n');
        if (!trailer && !videos.length) body += '\nIs anime ka trailer API par available nahi hai.';
        body += `\n\n🔎 More results: https://www.youtube.com/results?search_query=${encodeURIComponent(anime.title + ' official trailer')}`;
        return ctx.reply(body);
    } catch (e) {
        console.error('[ANIME TRAILER]', e.message);
        return ctx.reply('❌ Anime trailer service abhi busy hai. Thori dair baad try karo.');
    }
});

register('animevideo', ['anivideo', 'animevideos'], 'Find available anime video links', async (conn, mek, m, ctx) => {
    const query = (ctx.q || '').trim();
    try {
        const anime = await chooseAnime(query, ctx);
        if (!anime) return;
        const result = await api(`/anime/${anime.mal_id}/videos`);
        const promos = (result.data?.promo || []).filter(v => videoUrl(v)).slice(0, 4);
        const episodes = (result.data?.episodes || []).filter(v => videoUrl(v)).slice(0, 4);
        const items = [
            ...promos.map((v, i) => formatVideo(v, i, 'Promo')),
            ...episodes.map((v, i) => formatVideo(v, i, 'Episode'))
        ].filter(Boolean);
        let body = `📽️ *ANIME VIDEO FINDER*\n\n📺 *${clean(anime.title)}*\n`;
        if (items.length) body += '\n' + items.join('\n\n');
        else body += '\nIs anime ke video links API par available nahi mile.';
        body += `\n\n🔎 Search more: https://www.youtube.com/results?search_query=${encodeURIComponent(anime.title + ' official anime video')}`;
        body += '\n\n_Note: API har episode ya full episode provide nahi karti._';
        return ctx.reply(body);
    } catch (e) {
        console.error('[ANIME VIDEO]', e.message);
        return ctx.reply('❌ Video links fetch nahi huay. Dobara try karo.');
    }
});

register('animeepisode', ['aniepisode', 'aniepisodes'], 'Show available episode preview links', async (conn, mek, m, ctx) => {
    const query = (ctx.q || '').trim();
    try {
        const anime = await chooseAnime(query, ctx);
        if (!anime) return;
        const result = await api(`/anime/${anime.mal_id}/videos/episodes?page=1`);
        const episodes = (result.data || []).filter(v => videoUrl(v)).slice(0, 10);
        let body = `📺 *AVAILABLE EPISODE VIDEOS*\n\n*${clean(anime.title)}*\n`;
        body += episodes.length
            ? '\n' + episodes.map((v, i) => `${i + 1}. *${clean(v.title || v.episode || `Episode ${i + 1}`)}*\n🔗 ${videoUrl(v)}`).join('\n\n')
            : '\nAPI par episode preview links available nahi hain.';
        body += `\n\n🔎 Search: https://www.youtube.com/results?search_query=${encodeURIComponent(anime.title + ' official episode')}`;
        return ctx.reply(body);
    } catch (e) {
        console.error('[ANIME EPISODE]', e.message);
        return ctx.reply('❌ Episode links abhi available nahi. Thori dair baad try karo.');
    }
});

register('animehelp', ['anihelp', 'animecommands'], 'Show anime commands', async (conn, mek, m, ctx) => {
    return ctx.reply(
        '🎌 *MR SAQIB MD — ANIME CENTER*\n\n' +
        '• `.animeinfo Naruto` — anime details\n' +
        '• `.animetrailer Naruto` — trailers/promos\n' +
        '• `.animevideo Naruto` — available video links\n' +
        '• `.animeepisode Naruto` — episode preview links\n' +
        '• `.animetop` — top anime\n' +
        '• `.animeupcoming` — upcoming anime\n' +
        '• `.animemovie Your Name` — anime movies\n' +
        '• `.animecharacters Naruto` — character search\n' +
        '• `.animepicture` — anime picture\n' +
        '• `.animehug` — anime hug picture\n\n' +
        '_Powered by public Jikan metadata. Video availability varies by title._'
    );
});
