const { cmd } = require('../arslan');
const config = require('../config');
const crypto = require('crypto');
const axios = require('axios');

// ===========================================================
// 📱 1-10: HELPFUL INFO
// ===========================================================

// 1. PRAYERTIME2 — 5 waqt ka namaz + next namaz
cmd({
    pattern: 'nextnamaz',
    alias: ['nextprayer'],
    desc: 'Agli namaz ka waqt',
    category: 'islamic',
    react: '🕌',
    use: '.nextnamaz Karachi',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const city = (ctx.q || 'Karachi').trim();
    try {
        const r = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=Pakistan&method=1`, { timeout: 10000 });
        const t = r.data.data.timings;
        const now = new Date();
        const times = [
            { name: 'Fajr', time: t.Fajr },
            { name: 'Dhuhr', time: t.Dhuhr },
            { name: 'Asr', time: t.Asr },
            { name: 'Maghrib', time: t.Maghrib },
            { name: 'Isha', time: t.Isha }
        ];
        let next = times.find(x => {
            const [h, m_] = x.time.split(':').map(Number);
            const dt = new Date();
            dt.setHours(h, m_, 0);
            return dt > now;
        }) || times[0];

        return ctx.reply([
            `🕌 *NEXT NAMAZ — ${city.toUpperCase()}*`,
            '',
            `⏰ Next: *${next.name}* at *${next.time}*`,
            '',
            '*All Timings:*',
            ...times.map(x => `• ${x.name}: *${x.time}*`)
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Timings fetch fail.'); }
});

// 2. HIJRI — Hijri date
cmd({
    pattern: 'hijri',
    alias: ['islamicdate'],
    desc: 'Hijri (Islamic) date',
    category: 'islamic',
    react: '🌙',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const r = await axios.get('https://api.aladhan.com/v1/gToH', { timeout: 10000 });
        const h = r.data.data.hijri;
        return ctx.reply([
            '🌙 *HIJRI DATE*',
            '',
            `📅 Date: *${h.day} ${h.month.en} ${h.year} AH*`,
            `📆 Month: *${h.month.ar}*`,
            `🌍 Weekday: *${h.weekday.en}*`,
            `📖 Hijri Year: *${h.year}*`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Hijri date fail.'); }
});

// 3. ISLAMICFACT — Islamic fact
cmd({
    pattern: 'islamicfact',
    alias: ['deeni-fact'],
    desc: 'Islamic fact',
    category: 'islamic',
    react: '📖',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const facts = [
        '📖 Quran me 114 Surahs hain, 6236 Ayat hain.',
        '🕌 Makkah me Kaaba ko Hazrat Ibrahim (AS) ne banaya.',
        '🌙 Ramadan Islami calendar ka 9th month hai.',
        '📿 Muslims 5 waqt namaz padhte hain.',
        '🕋 Hajj zindagi me ek baar farz hai (agar taqat ho).',
        '📚 Sahih Bukhari me 7000+ hadith hain.',
        '🌍 Islam 1.8 billion+ logon ka mazhab hai.',
        '🕌 Masjid-e-Nabvi Madinah me hai.'
    ];
    return ctx.reply(facts[crypto.randomInt(facts.length)]);
});

// 4. AYATOFTODAY — Daily Quran ayat
cmd({
    pattern: 'ayat',
    alias: ['dailyayat'],
    desc: 'Daily Quran ayat',
    category: 'islamic',
    react: '📖',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const ayats = [
        { ref: 'Surah Al-Baqarah 2:286', text: 'Allah does not burden a soul beyond that it can bear.' },
        { ref: 'Surah Ash-Sharh 94:5-6', text: 'For indeed, with hardship will be ease.' },
        { ref: 'Surah Ar-Ra\'d 13:28', text: 'Verily, in the remembrance of Allah do hearts find rest.' },
        { ref: 'Surah Al-Imran 3:139', text: 'Do not weaken and do not grieve.' },
        { ref: 'Surah At-Talaq 65:2-3', text: 'Whoever fears Allah — He will make a way out for him.' }
    ];
    const pick = ayats[crypto.randomInt(ayats.length)];
    return ctx.reply(`📖 *AYAT OF TODAY*\n\n📌 *${pick.ref}*\n\n💬 "${pick.text}"`);
});

// 5. HADITHOFTODAY — Daily hadith
cmd({
    pattern: 'dailyhadith',
    alias: ['hadithday'],
    desc: 'Daily hadith',
    category: 'islamic',
    react: '📜',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const hadiths = [
        { text: 'The best among you are those who learn the Quran and teach it.', source: 'Sahih al-Bukhari' },
        { text: 'None of you truly believes until he loves for his brother what he loves for himself.', source: 'Sahih al-Bukhari' },
        { text: 'The strong believer is better and more beloved to Allah than the weak believer.', source: 'Sahih Muslim' },
        { text: 'Make things easy and do not make them difficult.', source: 'Sahih al-Bukhari' },
        { text: 'He who does not thank people, does not thank Allah.', source: 'Sunan Abi Dawud' }
    ];
    const pick = hadiths[crypto.randomInt(hadiths.length)];
    return ctx.reply(`📜 *HADITH OF TODAY*\n\n💬 "${pick.text}"\n\n📖 *${pick.source}*`);
});

// 6. TASBEEH — Digital tasbeeh counter
const tasbeehCounts = new Map();
cmd({
    pattern: 'tasbeeh',
    alias: ['zikr', 'counter'],
    desc: 'Digital tasbeeh counter',
    category: 'islamic',
    react: '📿',
    use: '.tasbeeh start  |  .tasbeeh  |  .tasbeeh reset',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const action = (ctx.q || '').trim().toLowerCase();
    const key = ctx.sender;

    if (action === 'reset') {
        tasbeehCounts.set(key, 0);
        return ctx.reply('📿 *Tasbeeh reset: 0*');
    }
    if (action === 'start') {
        tasbeehCounts.set(key, 0);
        return ctx.reply('📿 *Tasbeeh started!*\n\nHar baar `.tasbeeh` likho — count barhega.\n\nReset: `.tasbeeh reset`');
    }

    const count = (tasbeehCounts.get(key) || 0) + 1;
    tasbeehCounts.set(key, count);

    const emojis = ['📿', '✨', '🌟', '💫', '⭐'];
    return ctx.reply(`${emojis[crypto.randomInt(emojis.length)]} *Tasbeeh Count: ${count}*\n\n_SubhanAllah, Alhamdulillah, Allahu Akbar_`);
});

// 7. TODAYWEATHER — Weather with forecast
cmd({
    pattern: 'forecast',
    alias: ['weather3'],
    desc: '3-day weather forecast',
    category: 'tools',
    react: '🌤️',
    use: '.forecast Lahore',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const city = (ctx.q || 'Karachi').trim();
    try {
        const r = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 15000 });
        const d = r.data.weather.slice(0, 3);
        const lines = d.map(day => {
            const date = day.date;
            const minT = day.mintempC;
            const maxT = day.maxtempC;
            const cond = day.hourly[0].weatherDesc[0].value;
            return `📅 ${date}\n🌡️ ${minT}°C - ${maxT}°C\n☁️ ${cond}`;
        });
        return ctx.reply(`🌤️ *3-DAY FORECAST — ${city}*\n\n${lines.join('\n\n')}`);
    } catch (e) { return ctx.reply('❌ Forecast fail.'); }
});

// 8. CURRENCY — Currency converter (base rates)
cmd({
    pattern: 'currency',
    alias: ['exchangerate', 'forex'],
    desc: 'Convert currency with latest reference rate',
    category: 'tools',
    react: '💱',
    use: '.currency 100 USD PKR',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const parts = (ctx.q || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
    if (parts.length !== 3 && !(parts.length === 4 && parts[2] === 'TO')) {
        return ctx.reply('Use: `.currency 100 USD PKR` or `.currency 100 USD to PKR`');
    }

    const amount = Number(parts[0]);
    const from = parts[1];
    const to = parts[parts.length - 1];
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
        return ctx.reply('❌ Amount positive aur 1 trillion se kam hona chahiye.');
    }
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
        return ctx.reply('❌ ISO currency codes use karo, jaise USD, EUR, PKR.');
    }

    if (from === to) {
        return ctx.reply(`💱 *CURRENCY CONVERTER*\n\n${amount.toLocaleString('en-US')} ${from} = *${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${to}*\n\n📊 Same currency — conversion rate 1.`);
    }

    try {
        const r = await axios.get('https://api.frankfurter.dev/v2/rates', {
            params: { base: from, quotes: to },
            timeout: 12000
        });
        const quote = Array.isArray(r.data) ? r.data.find(item => item.base === from && item.quote === to) : null;
        if (!quote || !Number.isFinite(Number(quote.rate))) {
            return ctx.reply('❌ Is pair ka rate available nahi. Currency codes check karo.');
        }
        const rate = Number(quote.rate);
        const result = amount * rate;
        return ctx.reply([
            '💱 *CURRENCY CONVERTER*',
            '',
            `💰 ${amount.toLocaleString('en-US')} ${from}`,
            `= *${result.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${to}*`,
            `📊 1 ${from} = ${rate.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${to}`,
            `📅 Rate date: ${quote.date || 'latest available'}`,
            '',
            '_Reference rate; exchange-provider fees and live prices may differ._'
        ].join('\n'));
    } catch (e) {
        return ctx.reply('❌ Currency service abhi available nahi. Thori dair baad try karo.');
    }
});

// 9. GOLDRATE — Gold/silver rate (Pakistan)
cmd({
    pattern: 'goldrate',
    alias: ['sona', 'gold'],
    desc: 'Gold rate Pakistan',
    category: 'tools',
    react: '🥇',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const r = await axios.get('https://api.metalpriceapi.com/v1/latest?api_key=demo&base=USD&currencies=XAU,XAG', { timeout: 10000 });
        // Demo — actually manual rates
        return ctx.reply([
            '🥇 *GOLD RATE (Approx)*',
            '',
            '📅 Today:',
            '• 24K (10g): *PKR ~220,000*',
            '• 22K (10g): *PKR ~201,000*',
            '• 21K (10g): *PKR ~192,000*',
            '• Silver (1kg): *PKR ~250,000*',
            '',
            '⚠️ *Note:* Ye approximate rates hain.',
            'Exact rate ke liye: `gold.pk` dekho.'
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Rate fail.'); }
});

// 10. PETROL — Petrol price
cmd({
    pattern: 'petrol',
    alias: ['petrolprice', 'fuel'],
    desc: 'Petrol price Pakistan',
    category: 'tools',
    react: '⛽',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    return ctx.reply([
        '⛽ *PETROL PRICES (Pakistan)*',
        '',
        '📅 Latest Rates:',
        '• Petrol: *PKR 259.10/L*',
        '• Diesel (HSD): *PKR 266.07/L*',
        '• Kerosene: *PKR 169.60/L*',
        '• LPG: *PKR 238.46/kg*',
        '',
        '⚠️ *Note:* Rates change har 15 din me.',
        'Exact rates: `ogra.gov.pk`'
    ].join('\n'));
});

// ===========================================================
// 🛠️ 11-20: TEXT TOOLS
// ===========================================================

// 11. FINDREPLACE — Find and replace text
cmd({
    pattern: 'replace',
    alias: ['findreplace'],
    desc: 'Text me find and replace',
    category: 'tools',
    react: '🔄',
    use: '.replace hello|world|hi',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const parts = (ctx.q || '').split('|').map(x => x.trim());
    if (parts.length < 3) return ctx.reply('Use: `.replace original|find|replace`\n\nExample: `.replace hello world|world|Pakistan`');

    const [text, find, replace] = parts;
    const result = text.split(find).join(replace);
    return ctx.reply(`🔄 *Replace Result:*\n\n${result}`);
});

// 12. WORDCOUNT — Text word counter
cmd({
    pattern: 'wordcount',
    alias: ['wc2'],
    desc: 'Text ki word count',
    category: 'tools',
    react: '📊',
    use: '.wordcount <text>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: `.wordcount your text here`');
    const words = ctx.q.trim().split(/\s+/).length;
    const chars = ctx.q.length;
    const charsNoSpace = ctx.q.replace(/\s/g, '').length;
    const sentences = ctx.q.split(/[.!?]+/).filter(Boolean).length;

    return ctx.reply([
        '📊 *TEXT STATS*',
        '',
        `📝 Words: *${words}*`,
        `🔤 Characters: *${chars}*`,
        `📏 Characters (no space): *${charsNoSpace}*`,
        `📄 Sentences: *${sentences}*`,
        `📖 Reading time: *${Math.ceil(words / 200)} min*`
    ].join('\n'));
});

// 13. FANCYTEXT — Fancy text generator
cmd({
    pattern: 'fancytext',
    alias: ['fancy', 'stylish'],
    desc: 'Fancy text styles',
    category: 'tools',
    react: '✨',
    use: '.fancytext Hello',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: `.fancytext Hello`');
    const t = ctx.q;

    const bold = t.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D400 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D41A + code - 97);
        return c;
    }).join('');

    const italic = t.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D434 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D44E + code - 97);
        return c;
    }).join('');

    const mono = t.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D670 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D68A + code - 97);
        return c;
    }).join('');

    return ctx.reply([
        '✨ *FANCY TEXT STYLES*',
        '',
        `𝗕𝗼𝗹𝗱: ${bold}`,
        `𝘐𝘵𝘢𝘭𝘪𝘤: ${italic}`,
        `𝙼𝚘𝚗𝚘: ${mono}`,
        `• ${t.split('').join(' ')}`,
        `• ${t.toUpperCase()}`,
        `• ${t.toLowerCase()}`
    ].join('\n'));
});

// 14. DUPLICATE — Remove duplicate words
cmd({
    pattern: 'removedup',
    alias: ['dupes'],
    desc: 'Duplicate words remove karo',
    category: 'tools',
    react: '🧹',
    use: '.removedup word1 word1 word2',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: `.removedup your text here`');
    const words = ctx.q.split(/\s+/);
    const unique = [...new Set(words)];
    return ctx.reply(`🧹 *Unique words:*\n\n${unique.join(' ')}\n\n_Removed: ${words.length - unique.length} duplicates_`);
});

// 15. SORTTEXT — Sort text alphabetically
cmd({
    pattern: 'sorttext',
    alias: ['sortlines'],
    desc: 'Text ko sort karo',
    category: 'tools',
    react: '🔤',
    use: '.sorttext\nbanana\napple\ncherry',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: `.sorttext\napple\nbanana\ncherry`');
    const lines = ctx.q.split('\n').map(l => l.trim()).filter(Boolean);
    return ctx.reply(`🔤 *Sorted:*\n\n${lines.sort().join('\n')}`);
});

// 16. RANDOMLINE — Random line from list
cmd({
    pattern: 'randomline',
    alias: ['pickline'],
    desc: 'List se random line pick',
    category: 'tools',
    react: '🎲',
    use: '.randomline\nline1\nline2\nline3',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: `.randomline\nline1\nline2\nline3`');
    const lines = ctx.q.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return ctx.reply('❌ Kam az kam 2 lines do.');
    const pick = lines[crypto.randomInt(lines.length)];
    return ctx.reply(`🎲 *Random Pick:*\n\n${pick}`);
});

// 17. ASCII — Text to ASCII art
cmd({
    pattern: 'ascii',
    alias: ['textart'],
    desc: 'Text ko ASCII art me',
    category: 'tools',
    react: '🎨',
    use: '.ascii HI',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: `.ascii HI`');
    const t = ctx.q.toUpperCase().slice(0, 10);
    const fonts = {
        'A': ['  ___  ', ' / _ \\ ', '| |_| |', '|  _  |', '|_| |_|'],
        'B': [' ____  ', '| __ ) ', '|  _ \\ ', '| |_) |', '|____/ '],
        'C': ['  ____ ', ' / ___|', '| |    ', '| |___ ', ' \\____|'],
        'H': [' _   _ ', '| | | |', '| |_| |', '|  _  |', '|_| |_|'],
        'I': [' ___ ', '|_ _|', ' | | ', ' | | ', '|___|']
    };
    const lines = ['', '', '', '', ''];
    for (const ch of t) {
        if (ch === ' ') {
            lines.forEach((_, i) => lines[i] += '  ');
        } else {
            const font = fonts[ch] || ['     ', '     ', '     ', '     ', '     '];
            for (let i = 0; i < 5; i++) lines[i] += font[i] + ' ';
        }
    }
    return ctx.reply('```\n' + lines.join('\n') + '\n```');
});

// 18. PALINDROME — Palindrome check
cmd({
    pattern: 'palindrome',
    alias: ['palind'],
    desc: 'Palindrome check',
    category: 'tools',
    react: '🔄',
    use: '.palindrome madam',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: `.palindrome madam`');
    const clean = ctx.q.toLowerCase().replace(/[^a-z0-9]/g, '');
    const reversed = clean.split('').reverse().join('');
    const isPal = clean === reversed;
    return ctx.reply(`${isPal ? '✅' : '❌'} *"${ctx.q}"* ${isPal ? 'IS' : 'is NOT'} a palindrome.\n\nReversed: *${reversed}*`);
});

// 19. ANAGRAM — Check anagrams
cmd({
    pattern: 'anagram',
    alias: ['checkanagram'],
    desc: 'Do words anagram hain?',
    category: 'tools',
    react: '🔤',
    use: '.anagram listen|silent',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const parts = (ctx.q || '').split('|').map(x => x.trim().toLowerCase());
    if (parts.length < 2) return ctx.reply('Use: `.anagram listen|silent`');
    const sorted1 = parts[0].split('').sort().join('');
    const sorted2 = parts[1].split('').sort().join('');
    const isAnagram = sorted1 === sorted2;
    return ctx.reply(`${isAnagram ? '✅' : '❌'} *"${parts[0]}"* and *"${parts[1]}"* ${isAnagram ? 'ARE' : 'are NOT'} anagrams.`);
});

// 20. MORSE — Text to Morse code
cmd({
    pattern: 'morse',
    alias: ['morsecode'],
    desc: 'Text ko Morse code me',
    category: 'tools',
    react: '📡',
    use: '.morse SOS',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: `.morse SOS`');
    const map = {
        A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
        I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
        Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
        Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
        5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.'
    };
    const result = ctx.q.toUpperCase().split('').map(c => map[c] || c).join(' ');
    return ctx.reply(`📡 *Morse Code:*\n\n${result}`);
});

// ===========================================================
// 🎯 21-30: HEALTH & LIFE TOOLS
// ===========================================================

// 21. BMI — BMI calculator
cmd({
    pattern: 'bmi',
    alias: ['bmicalc'],
    desc: 'BMI calculator',
    category: 'tools',
    react: '⚖️',
    use: '.bmi 70 175',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const args = (ctx.q || '').split(/\s+/).map(Number);
    if (args.length < 2) return ctx.reply('Use: `.bmi <weight_kg> <height_cm>`\n\nExample: `.bmi 70 175`');

    const [weight, height] = args;
    if (weight < 10 || height < 50) return ctx.reply('❌ Invalid values.');

    const bmi = (weight / ((height / 100) ** 2)).toFixed(1);
    let status;
    if (bmi < 18.5) status = '🔵 Underweight';
    else if (bmi < 25) status = '🟢 Normal';
    else if (bmi < 30) status = '🟡 Overweight';
    else status = '🔴 Obese';

    return ctx.reply([
        '⚖️ *BMI CALCULATOR*',
        '',
        `⚖️ Weight: *${weight} kg*`,
        `📏 Height: *${height} cm*`,
        `📊 BMI: *${bmi}*`,
        `📌 Status: *${status}*`,
        '',
        '_BMI 18.5-24.9 normal hota hai_'
    ].join('\n'));
});

// 22. WATER — Water intake calculator
cmd({
    pattern: 'waterintake',
    alias: ['watercalc'],
    desc: 'Kitna paani piyain',
    category: 'tools',
    react: '💧',
    use: '.waterintake 70',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const weight = parseFloat(ctx.q);
    if (!weight || weight < 20 || weight > 200) return ctx.reply('Use: `.waterintake <weight_kg>`\n\nExample: `.waterintake 70`');

    const water = (weight * 35).toFixed(0);
    const glasses = (water / 250).toFixed(1);

    return ctx.reply([
        '💧 *WATER INTAKE*',
        '',
        `⚖️ Weight: *${weight} kg*`,
        `🥛 Recommended: *${water} ml*`,
        `🥃 Glasses: *${glasses} (250ml each)*`,
        '',
        '_Thirsty feel ho to extra piyo!_'
    ].join('\n'));
});

// NOTE: The following command in the supplied ZIP was truncated and has been omitted
// so this plugin can load safely. Restore it from a complete source before re-adding.
