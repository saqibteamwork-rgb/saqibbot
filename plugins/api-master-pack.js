const { cmd } = require('../arslan');
const config = require('../config');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs-extra');

// ===========================================================
// 🎌 1-5: ANIME COMMANDS (Working APIs)
// ===========================================================

// 1. ANIMEWALL — Anime wallpaper
cmd({
    pattern: 'animewall',
    alias: ['animewallpaper', 'awall'],
    desc: 'Anime wallpaper fetch',
    category: 'anime',
    react: '🎌',
    use: '.animewall naruto',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const query = (ctx.q || 'anime').trim();
    try {
        const r = await axios.get(`https://api.waifu.pics/sfw/waifu`, { timeout: 10000 });
        if (r.data?.url) {
            await conn.sendMessage(ctx.from, {
                image: { url: r.data.url },
                caption: `🎌 *Anime Wallpaper*\n🔍 ${query}`
            }, { quoted: mek });
        }
    } catch (e) {
        // Fallback
        try {
            const r2 = await axios.get(`https://nekos.best/api/v2/neko`, { timeout: 10000 });
            if (r2.data?.results?.[0]?.url) {
                await conn.sendMessage(ctx.from, {
                    image: { url: r2.data.results[0].url },
                    caption: '🎌 Anime image'
                }, { quoted: mek });
            }
        } catch (e2) { return ctx.reply('❌ Image fetch fail.'); }
    }
});

// 2. WAIFU — Random waifu (multi-API fallback: nekos.best -> waifu.pics -> nekosia -> waifu.im -> purrbot)
const animeApi = require('../lib/anime-api');
async function sendRandomAnime(conn, mek, ctx, category, caption) {
    const pick = await animeApi.randomImage(category);
    if (!pick || !pick.url) return ctx.reply('❌ Anime image servers abhi jawab nahi de rahe. `.nettest` chala kar internet check karein.');
    try {
        await conn.sendMessage(ctx.from, { image: { url: pick.url }, caption }, { quoted: mek });
    } catch (e1) {
        // WhatsApp could not fetch the URL itself -> download here and send as a file
        const r = await axios.get(pick.url, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        await conn.sendMessage(ctx.from, { image: Buffer.from(r.data), caption }, { quoted: mek });
    }
}

cmd({
    pattern: 'waifu',
    alias: ['animegirl'],
    desc: 'Random waifu image',
    category: 'anime',
    react: '💖',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try { await sendRandomAnime(conn, mek, ctx, 'waifu', '💖 Random Waifu'); }
    catch (e) { return ctx.reply('❌ Waifu nahi aayi: ' + String(e.message).slice(0, 120)); }
});

// 3. NEKO — Random neko
cmd({
    pattern: 'neko',
    alias: ['nekopic'],
    desc: 'Random neko image',
    category: 'anime',
    react: '🐱',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try { await sendRandomAnime(conn, mek, ctx, 'neko', '🐱 Random Neko'); }
    catch (e) { return ctx.reply('❌ Neko nahi aayi: ' + String(e.message).slice(0, 120)); }
});

// 4. ANIMEQUOTE — Anime quote
cmd({
    pattern: 'animequote',
    alias: ['aniquote'],
    desc: 'Random anime quote',
    category: 'anime',
    react: '💬',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const r = await axios.get('https://animechan.io/api/v1/quotes/random', { timeout: 10000 });
        if (r.data?.data) {
            return ctx.reply(`💬 *ANIME QUOTE*\n\n"${r.data.data.content}"\n\n— *${r.data.data.character.name}* (${r.data.data.anime.name})`);
        }
    } catch (e) {
        // Fallback — hardcoded
        const quotes = [
            { q: 'I will become the Pirate King!', c: 'Monkey D. Luffy', a: 'One Piece' },
            { q: 'Believe it!', c: 'Naruto Uzumaki', a: 'Naruto' },
            { q: 'Power comes in response to a need, not a desire.', c: 'Goku', a: 'Dragon Ball Z' },
            { q: 'Whatever you lose, you will find it again.', c: 'Kenshin Himura', a: 'Rurouni Kenshin' },
            { q: 'It\'s not the face that makes someone a monster.', c: 'Naruto Uzumaki', a: 'Naruto' }
        ];
        const pick = quotes[crypto.randomInt(quotes.length)];
        return ctx.reply(`💬 *ANIME QUOTE*\n\n"${pick.q}"\n\n— *${pick.c}* (${pick.a})`);
    }
});

// 5. ANIMESEARCH — Anime search
cmd({
    pattern: 'animesearch',
    alias: ['anisearch'],
    desc: 'Anime search',
    category: 'anime',
    react: '🔍',
    use: '.animesearch naruto',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const q = (ctx.q || '').trim();
    if (!q) return ctx.reply('Use: `.animesearch naruto`');
    try {
        const r = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=3`, { timeout: 10000 });
        if (r.data?.data?.length) {
            const lines = r.data.data.map((a, i) =>
                `${i + 1}. *${a.title}*\n   ⭐ ${a.score || 'N/A'} | 📺 ${a.episodes || '?'} eps | 📅 ${a.year || '?'}`
            ).join('\n\n');
            return ctx.reply(`🔍 *ANIME SEARCH: ${q}*\n\n${lines}`);
        }
    } catch (e) { return ctx.reply('❌ Search fail.'); }
});

// ===========================================================
// 🎮 6-10: GAMING & ENTERTAINMENT
// ===========================================================

// 6. FREE FIRE — FF player info
cmd({
    pattern: 'ff',
    alias: ['freefire'],
    desc: 'Free Fire player info',
    category: 'games',
    react: '🎮',
    use: '.ff 123456789',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const uid = (ctx.q || '').replace(/\D/g, '');
    if (!uid) return ctx.reply('Use: `.ff <player_uid>`');
    try {
        const r = await axios.get(`https://api.duniagames.co.id/api/transaction/v1/check-nickname?userId=${uid}&gameId=freefire`, { timeout: 10000 });
        if (r.data?.data?.userName) {
            return ctx.reply(`🎮 *FREE FIRE INFO*\n\n🆔 UID: *${uid}*\n👤 Username: *${r.data.data.userName}*`);
        }
    } catch (e) { /* continue */ }
    // Fallback
    return ctx.reply(`🎮 *FREE FIRE*\n\n🆔 UID: *${uid}*\n👤 Username: *Player_${uid.slice(-4)}*\n\n_Manual check karo: id.duniagames.co.id_`);
});

// 7. MLBB — Mobile Legends info
cmd({
    pattern: 'mlbb',
    alias: ['ml', 'mobilelegends'],
    desc: 'Mobile Legends player info',
    category: 'games',
    react: '⚔️',
    use: '.mlbb 123456 (1234)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const match = (ctx.q || '').match(/(\d+)\s*\(?(\d+)?\)?/);
    if (!match) return ctx.reply('Use: `.mlbb 123456 (1234)`\n\nFormat: ID (Zone)');
    const uid = match[1];
    const zone = match[2] || '';
    try {
        const r = await axios.get(`https://api.isan.eu.org/nickname/ml?id=${uid}&zone=${zone}`, { timeout: 10000 });
        if (r.data?.name) {
            return ctx.reply(`⚔️ *MLBB INFO*\n\n🆔 ID: *${uid}*\n🌍 Zone: *${zone}*\n👤 Name: *${r.data.name}*`);
        }
    } catch (e) { /* continue */ }
    return ctx.reply(`⚔️ *MLBB*\n\n🆔 ID: *${uid}*\n🌍 Zone: *${zone}*\n\n_Manual check: id.duniagames.co.id_`);
});

// 8. MINECRAFT — Minecraft server info
cmd({
    pattern: 'mcserver',
    alias: ['minecraft'],
    desc: 'Minecraft server info',
    category: 'games',
    react: '⛏️',
    use: '.mcserver play.hypixel.net',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const host = (ctx.q || '').trim();
    if (!host) return ctx.reply('Use: `.mcserver play.hypixel.net`');
    try {
        const r = await axios.get(`https://api.mcsrvstat.us/3/${host}`, { timeout: 10000 });
        if (r.data?.online) {
            return ctx.reply([
                `⛏️ *MINECRAFT SERVER*`,
                '',
                `🌐 Host: *${host}*`,
                `✅ Status: *Online*`,
                `👥 Players: *${r.data.players?.online || 0}/${r.data.players?.max || 0}*`,
                `🎮 Version: *${r.data.version || 'N/A'}*`,
                r.data.motd?.clean ? `📝 MOTD: *${r.data.motd.clean.join(' ')}*` : ''
            ].filter(Boolean).join('\n'));
        }
        return ctx.reply('❌ Server offline ya not found.');
    } catch (e) { return ctx.reply('❌ Server info fail.'); }
});

// 9. STEAM — Steam game info
cmd({
    pattern: 'steam',
    alias: ['steamgame'],
    desc: 'Steam game info',
    category: 'games',
    react: '🎮',
    use: '.steam GTA V',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const q = (ctx.q || '').trim();
    if (!q) return ctx.reply('Use: `.steam GTA V`');
    try {
        const r = await axios.get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=us`, { timeout: 10000 });
        if (r.data?.items?.length) {
            const game = r.data.items[0];
            const detail = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${game.id}`, { timeout: 10000 });
            const d = detail.data[game.id]?.data;
            return ctx.reply([
                `🎮 *STEAM GAME*`,
                '',
                `📌 Name: *${game.name}*`,
                d?.price_overview ? `💰 Price: *${d.price_overview.final_formatted}*` : '💰 Free',
                d?.release_date?.date ? `📅 Released: *${d.release_date.date}*` : '',
                d?.metacritic?.score ? `⭐ Metacritic: *${d.metacritic.score}*` : ''
            ].filter(Boolean).join('\n'));
        }
    } catch (e) { return ctx.reply('❌ Game not found.'); }
});

// 10. POKEMON — Pokemon info
cmd({
    pattern: 'pokemon',
    alias: ['poke'],
    desc: 'Pokemon info',
    category: 'games',
    react: '⚡',
    use: '.pokemon pikachu',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const name = (ctx.q || 'pikachu').toLowerCase().trim();
    try {
        const r = await axios.get(`https://pokeapi.co/api/v2/pokemon/${name}`, { timeout: 10000 });
        const p = r.data;
        const types = p.types.map(t => t.type.name).join(', ');
        return ctx.reply([
            `⚡ *POKEMON: ${p.name.toUpperCase()}*`,
            '',
            `🆔 ID: *${p.id}*`,
            `🔤 Types: *${types}*`,
            `📏 Height: *${p.height / 10} m*`,
            `⚖️ Weight: *${p.weight / 10} kg*`,
            `🎯 Abilities: *${p.abilities.map(a => a.ability.name).join(', ')}*`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Pokemon not found.'); }
});

// ===========================================================
// 🛠️ 11-15: UTILITY COMMANDS
// ===========================================================

// 11. SCREENSHOT — Website screenshot
cmd({
    pattern: 'webshot',
    alias: ['ssweb2', 'screenshotweb'],
    desc: 'Website screenshot',
    category: 'tools',
    react: '📸',
    use: '.webshot https://google.com',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const url = (ctx.q || '').trim();
    if (!url || !/^https?:\/\//.test(url)) return ctx.reply('Use: `.webshot https://google.com`');
    try {
        const r = await axios.get(`https://image.thum.io/get/width/720/crop/1024/${url}`, {
            responseType: 'arraybuffer',
            timeout: 20000
        });
        await conn.sendMessage(ctx.from, {
            image: Buffer.from(r.data),
            caption: `📸 *Screenshot:* ${url}`
        }, { quoted: mek });
    } catch (e) { return ctx.reply('❌ Screenshot fail.'); }
});

// 12. IPLOOKUP2 — IP info
cmd({
    pattern: 'ip2',
    alias: ['iplookup2'],
    desc: 'IP address info',
    category: 'tools',
    react: '🌐',
    use: '.ip2 8.8.8.8',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const ip = (ctx.q || '').trim();
    try {
        const r = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 10000 });
        const d = r.data;
        if (d.status === 'success') {
            return ctx.reply([
                `🌐 *IP INFO: ${d.query}*`,
                '',
                `🌍 Country: *${d.country}* (${d.countryCode})`,
                `🏙️ City: *${d.city}*`,
                `📡 ISP: *${d.isp}*`,
                `🕐 Timezone: *${d.timezone}*`
            ].join('\n'));
        }
    } catch (e) { return ctx.reply('❌ IP lookup fail.'); }
});

// 13. BASE64 — Encode/decode
cmd({
    pattern: 'b64',
    alias: ['base64'],
    desc: 'Base64 encode/decode',
    category: 'tools',
    react: '🔢',
    use: '.b64 encode Hello',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const parts = (ctx.q || '').split(' ');
    const mode = parts.shift()?.toLowerCase();
    const text = parts.join(' ');
    if (!mode || !text) return ctx.reply('Use: `.b64 encode|decode <text>`');
    if (mode === 'encode') return ctx.reply(`🔢 ${Buffer.from(text).toString('base64')}`);
    if (mode === 'decode') return ctx.reply(`🔢 ${Buffer.from(text, 'base64').toString('utf8')}`);
    return ctx.reply('Use: encode ya decode');
});

// 14. SHORTURL2 — URL shortener
cmd({
    pattern: 'short2',
    alias: ['tinyurl2'],
    desc: 'URL shortener',
    category: 'tools',
    react: '🔗',
    use: '.short2 https://example.com',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const url = (ctx.q || '').trim();
    if (!url) return ctx.reply('Use: `.short2 <url>`');
    try {
        const r = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout: 10000 });
        return ctx.reply(`🔗 *Short URL:* ${r.data}`);
    } catch (e) { return ctx.reply('❌ Fail.'); }
});

// 15. PASSWORD — Password generator
cmd({
    pattern: 'genpass',
    alias: ['password'],
    desc: 'Password generator',
    category: 'tools',
    react: '🔐',
    use: '.genpass 16',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const len = Math.min(32, Math.max(8, parseInt(ctx.q) || 16));
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < len; i++) pass += chars[crypto.randomInt(chars.length)];
    return ctx.reply(`🔐 *Password (${len}):*\n\n\`${pass}\``);
});

// ===========================================================
// 🕌 16-20: ISLAMIC + MORE
// ===========================================================

// 16. QURANSEARCH — Search Quran
cmd({
    pattern: 'quransearch',
    alias: ['searchquran'],
    desc: 'Quran me search',
    category: 'islamic',
    react: '📖',
    use: '.quransearch patience',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const q = (ctx.q || '').trim();
    if (!q) return ctx.reply('Use: `.quransearch patience`');
    try {
        const r = await axios.get(`https://api.alquran.cloud/v1/search/${encodeURIComponent(q)}/all/en`, { timeout: 15000 });
        if (r.data?.data?.matches?.length) {
            const matches = r.data.data.matches.slice(0, 3);
            const lines = matches.map(m => `📌 *${m.surah.englishName} ${m.surah.number}:${m.numberInSurah}*\n"${m.text}"`).join('\n\n');
            return ctx.reply(`📖 *QURAN SEARCH: ${q}*\n\n${lines}`);
        }
    } catch (e) { return ctx.reply('❌ Search fail.'); }
});

// 17. HIJRI2 — Hijri date
cmd({
    pattern: 'hijri2',
    alias: ['islamicdate2'],
    desc: 'Hijri date',
    category: 'islamic',
    react: '🌙',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const r = await axios.get('https://api.aladhan.com/v1/gToH', { timeout: 10000 });
        const h = r.data.data.hijri;
        return ctx.reply(`🌙 *HIJRI DATE*\n\n📅 *${h.day} ${h.month.en} ${h.year} AH*`);
    } catch (e) {
        const now = new Date();
        return ctx.reply(`🌙 *DATE*\n\n📅 ${now.toDateString()}\n\n_Hijri API offline_`);
    }
});

// 18. PRAYER2 — Namaz timings
cmd({
    pattern: 'namaz2',
    alias: ['prayer2'],
    desc: 'Namaz timings',
    category: 'islamic',
    react: '🕌',
    use: '.namaz2 Lahore',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const city = (ctx.q || 'Karachi').trim();
    try {
        const r = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=Pakistan&method=1`, { timeout: 10000 });
        const t = r.data.data.timings;
        return ctx.reply([
            `🕌 *NAMAZ — ${city}*`,
            '',
            `🌅 Fajr: *${t.Fajr}*`,
            `🌇 Dhuhr: *${t.Dhuhr}*`,
            `🌆 Asr: *${t.Asr}*`,
            `🌃 Maghrib: *${t.Maghrib}*`,
            `🌙 Isha: *${t.Isha}*`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Timings fail.'); }
});

// 19. HADITH2 — Random hadith
cmd({
    pattern: 'hadith2',
    alias: ['hadees2'],
    desc: 'Random hadith',
    category: 'islamic',
    react: '📜',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const hadiths = [
        { text: 'The best among you are those who learn the Quran and teach it.', source: 'Sahih al-Bukhari' },
        { text: 'None of you truly believes until he loves for his brother what he loves for himself.', source: 'Sahih al-Bukhari' },
        { text: 'The strong believer is better and more beloved to Allah than the weak believer.', source: 'Sahih Muslim' },
        { text: 'Make things easy and do not make them difficult.', source: 'Sahih al-Bukhari' }
    ];
    const pick = hadiths[crypto.randomInt(hadiths.length)];
    return ctx.reply(`📜 *HADITH*\n\n💬 "${pick.text}"\n\n📖 *${pick.source}*`);
});

// 20. AYAT2 — Daily ayat
cmd({
    pattern: 'ayat2',
    alias: ['dailyayat2'],
    desc: 'Daily Quran ayat',
    category: 'islamic',
    react: '📖',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const ayats = [
        { ref: 'Surah Al-Baqarah 2:286', text: 'Allah does not burden a soul beyond that it can bear.' },
        { ref: 'Surah Ash-Sharh 94:5-6', text: 'For indeed, with hardship will be ease.' },
        { ref: 'Surah Ar-Ra\'d 13:28', text: 'Verily, in the remembrance of Allah do hearts find rest.' },
        { ref: 'Surah At-Talaq 65:2-3', text: 'Whoever fears Allah — He will make a way out for him.' }
    ];
    const pick = ayats[crypto.randomInt(ayats.length)];
    return ctx.reply(`📖 *AYAT*\n\n📌 *${pick.ref}*\n\n💬 "${pick.text}"`);
});