const { cmd } = require('../arslan');
const config = require('../config');
const crypto = require('crypto');
const axios = require('axios');

// ===========================================================
// 1. FAKECHAT — Fake WhatsApp chat banao
// ===========================================================

// source.unsplash.com is discontinued -> keyless replacements
async function fetchKeywordImage(keyword) {
    const kw = encodeURIComponent(String(keyword || 'nature').trim().replace(/\s+/g, ','));
    const urls = [
        `https://loremflickr.com/800/600/${kw}?lock=${Date.now() % 100000}`,
        `https://picsum.photos/800/600?random=${Date.now()}`
    ];
    let last;
    for (const u of urls) {
        try {
            const r = await axios.get(u, { responseType: 'arraybuffer', timeout: 15000, maxRedirects: 5 });
            if (r.data && r.data.length > 3000) return Buffer.from(r.data);
        } catch (e) { last = e; }
    }
    throw last || new Error('IMAGE_FETCH_FAILED');
}

cmd({
    pattern: 'fakechat',
    alias: ['chatmaker'],
    desc: 'Fake WhatsApp chat screenshot banao',
    category: 'tools',
    react: '💬',
    use: '.fakechat Name1|msg1|Name2|msg2',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const parts = (ctx.q || '').split('|').map(x => x.trim()).filter(Boolean);
    if (parts.length < 4 || parts.length % 2 !== 0) {
        return ctx.reply('📝 Use: `.fakechat Name1|msg1|Name2|msg2`\n\nExample:\n`.fakechat Ali|Hello!|Sara|Hi, kya haal?|Ali|Theek hun`');
    }
    let text = '💬 *FAKE CHAT*\n\n';
    for (let i = 0; i < parts.length; i += 2) {
        text += `👤 *${parts[i]}:* ${parts[i + 1]}\n\n`;
    }
    return ctx.reply(text);
});

// ===========================================================
// 2. COUNTDOWN2 — Custom countdown timer
// ===========================================================
cmd({
    pattern: 'count',
    alias: ['cd'],
    desc: 'Custom countdown',
    category: 'tools',
    react: '⏳',
    use: '.count 5',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const sec = Math.min(10, Math.max(3, parseInt(ctx.q) || 5));
    await ctx.reply(`⏳ *Countdown: ${sec}*`);
    for (let i = sec; i > 0; i--) {
        await new Promise(r => setTimeout(r, 1000));
        await conn.sendMessage(ctx.from, { text: `*${i}*` }, { quoted: mek });
    }
    await conn.sendMessage(ctx.from, { text: '🎉 *Time up!*' }, { quoted: mek });
});

// ===========================================================
// 3. STOPTIME — Time in different zones
// ===========================================================
cmd({
    pattern: 'worldtime',
    alias: ['timezones'],
    desc: 'Different timezones ka time',
    category: 'tools',
    react: '🌍',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const moment = require('moment-timezone');
    const zones = [
        { name: '🇵🇰 Pakistan', tz: 'Asia/Karachi' },
        { name: '🇮🇳 India', tz: 'Asia/Kolkata' },
        { name: '🇦🇪 Dubai', tz: 'Asia/Dubai' },
        { name: '🇬🇧 London', tz: 'Europe/London' },
        { name: '🇺🇸 New York', tz: 'America/New_York' },
        { name: '🇸🇦 Makkah', tz: 'Asia/Riyadh' }
    ];
    const lines = zones.map(z => `${z.name}: *${moment().tz(z.tz).format('HH:mm')}*`);
    return ctx.reply(`🌍 *WORLD TIME*\n\n${lines.join('\n')}`);
});

// ===========================================================
// 4. DAYINFO — Aaj ka din info
// ===========================================================
cmd({
    pattern: 'dayinfo',
    alias: ['today'],
    desc: 'Aaj ka din ki info',
    category: 'tools',
    react: '📅',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const moment = require('moment-timezone');
    const now = moment().tz('Asia/Karachi');
    const dayOfYear = now.dayOfYear();
    const weekNum = now.week();
    return ctx.reply([
        '📅 *TODAY INFO*',
        '',
        `🗓️ Date: *${now.format('dddd, MMMM Do YYYY')}*`,
        `📆 Day of year: *${dayOfYear}*`,
        `🔢 Week: *${weekNum}*`,
        `⏰ Time: *${now.format('HH:mm:ss')}*`,
        `🌙 Month: *${now.format('MMMM')}*`,
        `📊 Year: *${now.format('YYYY')}*`
    ].join('\n'));
});

// ===========================================================
// 5. ZODIAC — Zodiac sign info
// ===========================================================
cmd({
    pattern: 'zodiacsign',
    alias: ['zodiacinfo'],
    desc: 'Zodiac sign ki info',
    category: 'fun',
    react: '♈',
    use: '.zodiacsign aries',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const sign = (ctx.q || '').toLowerCase();
    const data = {
        aries: '♈ Aries (Mar 21 - Apr 19)\nElement: Fire 🔥\nRuling: Mars\nTraits: Bold, Ambitious, Confident',
        taurus: '♉ Taurus (Apr 20 - May 20)\nElement: Earth 🌍\nRuling: Venus\nTraits: Reliable, Patient, Devoted',
        gemini: '♊ Gemini (May 21 - Jun 20)\nElement: Air 💨\nRuling: Mercury\nTraits: Curious, Adaptable, Witty',
        cancer: '♋ Cancer (Jun 21 - Jul 22)\nElement: Water 💧\nRuling: Moon\nTraits: Caring, Loyal, Intuitive',
        leo: '♌ Leo (Jul 23 - Aug 22)\nElement: Fire 🔥\nRuling: Sun\nTraits: Confident, Brave, Generous',
        virgo: '♍ Virgo (Aug 23 - Sep 22)\nElement: Earth 🌍\nRuling: Mercury\nTraits: Analytical, Kind, Hardworking',
        libra: '♎ Libra (Sep 23 - Oct 22)\nElement: Air 💨\nRuling: Venus\nTraits: Balanced, Fair, Social',
        scorpio: '♏ Scorpio (Oct 23 - Nov 21)\nElement: Water 💧\nRuling: Pluto\nTraits: Passionate, Brave, Loyal',
        sagittarius: '♐ Sagittarius (Nov 22 - Dec 21)\nElement: Fire 🔥\nRuling: Jupiter\nTraits: Adventurous, Honest, Optimistic',
        capricorn: '♑ Capricorn (Dec 22 - Jan 19)\nElement: Earth 🌍\nRuling: Saturn\nTraits: Disciplined, Responsible, Ambitious',
        aquarius: '♒ Aquarius (Jan 20 - Feb 18)\nElement: Air 💨\nRuling: Uranus\nTraits: Progressive, Original, Independent',
        pisces: '♓ Pisces (Feb 19 - Mar 20)\nElement: Water 💧\nRuling: Neptune\nTraits: Compassionate, Artistic, Intuitive'
    };
    if (!sign || !data[sign]) {
        return ctx.reply('Use: `.zodiacsign <sign>`\n\nSigns: aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces');
    }
    return ctx.reply(data[sign]);
});

// ===========================================================
// 6. COUNTRYINFO — Country info
// ===========================================================
cmd({
    pattern: 'countryinfo',
    alias: ['country'],
    desc: 'Country ki info',
    category: 'tools',
    react: '🌍',
    use: '.countryinfo Pakistan',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const country = (ctx.q || '').trim();
    if (!country) return ctx.reply('Use: `.countryinfo Pakistan`');
    try {
        const r = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}`, { timeout: 10000 });
        const c = r.data[0];
        return ctx.reply([
            `🌍 *${c.name.common}*`,
            '',
            `🏛️ Capital: *${c.capital?.[0] || 'N/A'}*`,
            `👥 Population: *${c.population.toLocaleString()}*`,
            `🗺️ Region: *${c.region}*`,
            `💰 Currency: *${Object.values(c.currencies || {})[0]?.name || 'N/A'}*`,
            `🗣️ Language: *${Object.values(c.languages || {})[0] || 'N/A'}*`,
            `🌐 Code: *${c.cca2}*`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Country nahi mila.'); }
});

// ===========================================================
// 7. GITHUB — GitHub user info
// ===========================================================
cmd({
    pattern: 'github',
    alias: ['ghuser'],
    desc: 'GitHub user info',
    category: 'tools',
    react: '🐙',
    use: '.github torvalds',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const user = (ctx.q || '').trim();
    if (!user) return ctx.reply('Use: `.github <username>`');
    try {
        const r = await axios.get(`https://api.github.com/users/${user}`, { timeout: 10000 });
        const d = r.data;
        return ctx.reply([
            `🐙 *${d.login}*`,
            '',
            `📛 Name: *${d.name || 'N/A'}*`,
            `📝 Bio: *${(d.bio || 'N/A').slice(0, 100)}*`,
            `📍 Location: *${d.location || 'N/A'}*`,
            `📦 Repos: *${d.public_repos}*`,
            `👥 Followers: *${d.followers}*`,
            `⭐ Following: *${d.following}*`,
            `🔗 ${d.html_url}`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ User nahi mila.'); }
});

// ===========================================================
// 8. THEME — Random WhatsApp theme
// ===========================================================
cmd({
    pattern: 'theme',
    alias: ['randomtheme'],
    desc: 'Random WhatsApp theme',
    category: 'fun',
    react: '🎨',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const themes = [
        '🌙 *Dark Mode* — Aankhon ke liye best!',
        '☀️ *Light Mode* — Din me best!',
        '🌸 *Pink Theme* — Cute look!',
        '💙 *Blue Theme* — Cool vibe!',
        '💚 *Green Theme* — Fresh look!',
        '🖤 *Black Theme* — Pro look!',
        '💜 *Purple Theme* — Royal!',
        '❤️ *Red Theme* — Bold!'
    ];
    return ctx.reply(`🎨 Aaj ka theme:\n\n${themes[crypto.randomInt(themes.length)]}`);
});

// ===========================================================
// 9. RANDOMPIC — Random image from Unsplash
// ===========================================================
cmd({
    pattern: 'randompic',
    alias: ['rpic', 'wallpaper'],
    desc: 'Random wallpaper image',
    category: 'fun',
    react: '🖼️',
    use: '.randompic nature',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const query = (ctx.q || 'nature').trim();
    try {
        const img = await fetchKeywordImage(query);
        await conn.sendMessage(ctx.from, {
            image: img,
            caption: `🖼️ Random: *${query}*`
        }, { quoted: mek });
    } catch (e) { return ctx.reply('❌ Image fetch fail.'); }
});

// ===========================================================
// 10. DOG — Random dog picture
// ===========================================================
cmd({
    pattern: 'dog',
    alias: ['dogpic', 'kutta'],
    desc: 'Random dog picture',
    category: 'fun',
    react: '🐕',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const r = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 10000 });
        if (r.data.status === 'success') {
            await conn.sendMessage(ctx.from, {
                image: { url: r.data.message },
                caption: '🐕 Random Dog!'
            }, { quoted: mek });
        }
    } catch (e) { return ctx.reply('❌ Dog fetch fail.'); }
});

// ===========================================================
// 11. CAT — Random cat picture
// ===========================================================
cmd({
    pattern: 'cat',
    alias: ['catpic', 'billi'],
    desc: 'Random cat picture',
    category: 'fun',
    react: '🐈',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const r = await axios.get('https://api.thecatapi.com/v1/images/search', { timeout: 10000 });
        if (r.data?.[0]?.url) {
            await conn.sendMessage(ctx.from, {
                image: { url: r.data[0].url },
                caption: '🐈 Random Cat!'
            }, { quoted: mek });
        }
    } catch (e) { return ctx.reply('❌ Cat fetch fail.'); }
});

// ===========================================================
// 12. FOX — Random fox picture
// ===========================================================
cmd({
    pattern: 'fox',
    alias: ['foxpic'],
    desc: 'Random fox picture',
    category: 'fun',
    react: '🦊',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const r = await axios.get('https://randomfox.ca/floof/', { timeout: 10000 });
        if (r.data?.image) {
            await conn.sendMessage(ctx.from, {
                image: { url: r.data.image },
                caption: '🦊 Random Fox!'
            }, { quoted: mek });
        }
    } catch (e) { return ctx.reply('❌ Fox fetch fail.'); }
});

// ===========================================================
// 13. PNGCAT — Random panda (with fallback)
// ===========================================================
cmd({
    pattern: 'panda',
    alias: ['pandapic'],
    desc: 'Random panda picture',
    category: 'fun',
    react: '🐼',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const img = await fetchKeywordImage('panda');
        await conn.sendMessage(ctx.from, {
            image: img,
            caption: '🐼 Random Panda!'
        }, { quoted: mek });
    } catch (e) { return ctx.reply('❌ Panda fetch fail.'); }
});

// ===========================================================
// 14. ADVICE — Random advice
// ===========================================================
cmd({
    pattern: 'advice',
    alias: ['adviceapi', 'salah'],
    desc: 'Random advice',
    category: 'fun',
    react: '💡',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const r = await axios.get('https://api.adviceslip.com/advice', { timeout: 10000 });
        return ctx.reply(`💡 *ADVICE*\n\n${r.data.slip.advice}`);
    } catch (e) { return ctx.reply('❌ Advice fetch fail.'); }
});

// ===========================================================
// 15. CHUCKNORRIS — Random Chuck Norris joke
// ===========================================================
cmd({
    pattern: 'chucknorris',
    alias: ['chuck', 'norris'],
    desc: 'Random Chuck Norris joke',
    category: 'fun',
    react: '🥋',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const r = await axios.get('https://api.chucknorris.io/jokes/random', { timeout: 10000 });
        return ctx.reply(`🥋 *CHUCK NORRIS*\n\n${r.data.value}`);
    } catch (e) { return ctx.reply('❌ Joke fetch fail.'); }
});

// ===========================================================
// 16. YESNO — Yes/No answer
// ===========================================================
cmd({
    pattern: 'yesno',
    alias: ['hannahl'],
    desc: 'Yes/No answer',
    category: 'fun',
    react: '❓',
    use: '.yesno Kya main jeetunga?',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const answers = [
        { yes: true, text: '✅ *YES!* Bilkul ho sakta hai!' },
        { yes: false, text: '❌ *NO!* Nahi hoga.' },
        { yes: true, text: '✅ *YES!* 100%' },
        { yes: false, text: '❌ *NO!* Bhool jao.' },
        { yes: true, text: '✅ *YES!* Chances high hain.' },
        { yes: false, text: '❌ *NO!* Time waste.' }
    ];
    const pick = answers[crypto.randomInt(answers.length)];
    return ctx.reply(`❓ *${ctx.q || 'Sawal'}*\n\n${pick.text}`);
});

// ===========================================================
// 17. RANDOMNUMBER — Random number generator
// ===========================================================
cmd({
    pattern: 'rnum',
    alias: ['randnum'],
    desc: 'Random number generate',
    category: 'tools',
    react: '🔢',
    use: '.rnum 1 100',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const args = (ctx.q || '').split(/\s+/);
    const min = parseInt(args[0]) || 1;
    const max = parseInt(args[1]) || 100;

    if (min >= max) return ctx.reply('❌ Min max se chota hona chahiye.');

    const num = crypto.randomInt(min, max + 1);
    return ctx.reply(`🔢 *Random (${min} - ${max}):*\n\n*${num}*`);
});

// ===========================================================
// 18. RANDOMLETTER — Random letter
// ===========================================================
cmd({
    pattern: 'rletter',
    alias: ['randomletter'],
    desc: 'Random letter',
    category: 'fun',
    react: '🔤',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return ctx.reply(`🔤 *Random Letter:* *${letters[crypto.randomInt(letters.length)]}*`);
});

// ===========================================================
// 19. COLOR — Random color
// ===========================================================
cmd({
    pattern: 'color',
    alias: ['randomcolor'],
    desc: 'Random color',
    category: 'fun',
    react: '🎨',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const hex = '#' + crypto.randomBytes(3).toString('hex').toUpperCase();
    return ctx.reply(`🎨 *Random Color:* *${hex}*`);
});

// ===========================================================
// 20. PASSWORD2 — Strong password with symbols
// ===========================================================
cmd({
    pattern: 'password2',
    alias: ['strongpass'],
    desc: 'Strong password',
    category: 'tools',
    react: '🔐',
    use: '.password2 16',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const len = Math.min(32, Math.max(8, parseInt(ctx.q) || 16));
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.?';
    let pass = '';
    for (let i = 0; i < len; i++) pass += chars[crypto.randomInt(chars.length)];
    return ctx.reply(`🔐 *Password (${len} chars):*\n\n\`${pass}\``);
});

// ===========================================================
// 21. STICKER2TEXT — Sticker ka text
// ===========================================================
cmd({
    pattern: 'stickerinfo',
    alias: ['stkinfo'],
    desc: 'Sticker ki info',
    category: 'image',
    react: '📋',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const stk = quoted?.stickerMessage;
    if (!stk) return ctx.reply('❌ Sticker pe reply karo.');

    const size = (stk.fileLength || 0) / 1024;
    return ctx.reply([
        '📋 *STICKER INFO*',
        '',
        `📦 Size: *${size.toFixed(2)} KB*`,
        `📐 Dimensions: *${stk.width}x${stk.height}*`,
        `🎬 Animated: *${stk.isAnimated ? 'Yes' : 'No'}*`,
        `👤 Pack: *${stk.packName || 'N/A'}*`,
        `✏️ Author: *${stk.packId || 'N/A'}*`
    ].join('\n'));
});

// ===========================================================
// 22. VV2 — View-once save (advanced)
// ===========================================================
cmd({
    pattern: 'vv2',
    alias: ['savevo'],
    desc: 'View-once save (advanced)',
    category: 'tools',
    react: '👁️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return ctx.reply('❌ View-once message pe reply karo.');

    const inner = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessage?.message || quoted;
    const type = inner?.imageMessage ? 'image' : inner?.videoMessage ? 'video' : null;
    if (!type) return ctx.reply('❌ Ye view-once nahi.');

    try {
        const media = inner[`${type}Message`];
        const stream = await conn.downloadAndSaveMediaMessage(
            { msg: media, mtype: `${type}Message` },
            `./tmp/vv2_${Date.now()}`
        );
        await conn.sendMessage(ctx.from, {
            [type]: { url: stream },
            caption: media.caption || '👁️ Saved'
        }, { quoted: mek });
        require('fs-extra').remove(stream).catch(() => {});
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================

// NOTE: The following command in the supplied ZIP was truncated and has been omitted
// so this plugin can load safely. Restore it from a complete source before re-adding.
