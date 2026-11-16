const { cmd } = require('../arslan');
const config = require('../config');
const crypto = require('crypto');
const axios = require('axios');

// ===========================================================
// 🎁 1-10: ISLAMIC + SPIRITUAL
// ===========================================================

// 1. QURAN-SEARCH — Surah info
cmd({
    pattern: 'surah',
    alias: ['quraninfo', 'surahinfo'],
    desc: 'Quran Surah ki info',
    category: 'islamic',
    react: '📖',
    use: '.surah 2',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const num = parseInt(ctx.q);
    if (!num || num < 1 || num > 114) return ctx.reply('Use: `.surah <1-114>`\n\nExample: `.surah 2`');

    try {
        const r = await axios.get(`https://api.alquran.cloud/v1/surah/${num}`, { timeout: 10000 });
        const s = r.data.data;
        return ctx.reply([
            `📖 *SURAH ${s.number}: ${s.name}*`,
            '',
            `🌐 English: *${s.englishName}*`,
            `💬 Meaning: *${s.englishNameTranslation}*`,
            `📌 Revelation: *${s.revelationType}*`,
            `📊 Total Ayahs: *${s.numberOfAyahs}*`,
            '',
            `💡 Recite daily for blessings!`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Surah info fail.'); }
});

// 2. ALLAH99 — Random Allah name
cmd({
    pattern: 'allahname',
    alias: ['asmaulhusna'],
    desc: 'Allah ka 99 naam',
    category: 'islamic',
    react: '✨',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const names = [
        { ar: 'الرَّحْمَنُ', eng: 'Ar-Rahman', meaning: 'The Most Merciful' },
        { ar: 'الرَّحِيمُ', eng: 'Ar-Raheem', meaning: 'The Most Compassionate' },
        { ar: 'الْمَلِكُ', eng: 'Al-Malik', meaning: 'The King' },
        { ar: 'الْقُدُّوسُ', eng: 'Al-Quddus', meaning: 'The Most Holy' },
        { ar: 'السَّلَامُ', eng: 'As-Salam', meaning: 'The Source of Peace' },
        { ar: 'الْعَزِيزُ', eng: 'Al-Aziz', meaning: 'The Almighty' },
        { ar: 'الْخَالِقُ', eng: 'Al-Khaliq', meaning: 'The Creator' },
        { ar: 'الْغَفَّارُ', eng: 'Al-Ghaffar', meaning: 'The Ever-Forgiving' },
        { ar: 'الرَّزَّاقُ', eng: 'Ar-Razzaq', meaning: 'The Provider' },
        { ar: 'الْعَلِيمُ', eng: 'Al-Aleem', meaning: 'The All-Knowing' }
    ];
    const pick = names[crypto.randomInt(names.length)];
    return ctx.reply([
        `✨ *ALLAH'S NAME*`,
        '',
        `📖 Arabic: *${pick.ar}*`,
        `💬 English: *${pick.eng}*`,
        `📌 Meaning: *${pick.meaning}*`
    ].join('\n'));
});

// 3. RAMADANCOUNT — Ramadan countdown
cmd({
    pattern: 'ramadancount',
    alias: ['ramadanleft'],
    desc: 'Ramadan kitna door',
    category: 'islamic',
    react: '🌙',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const now = new Date();
    const year = now.getFullYear();
    // Approximate Ramadan dates
    const ramadanStart = new Date(year, 1, 18); // Feb 18 approx

    if (now > ramadanStart) {
        const nextRamadan = new Date(year + 1, 1, 8);
        const days = Math.ceil((nextRamadan - now) / (1000 * 60 * 60 * 24));
        return ctx.reply(`🌙 *Ramadan in ${days} days* (approx)\n\n📅 Next: *${nextRamadan.toDateString()}*`);
    }

    const days = Math.ceil((ramadanStart - now) / (1000 * 60 * 60 * 24));
    return ctx.reply(`🌙 *Ramadan in ${days} days!*\n\n📅 Start: *${ramadanStart.toDateString()}*`);
});

// 4. PRAYER-ALL — 5 waqt ki namaz ek saath
cmd({
    pattern: 'allnamaz',
    alias: ['prayerall'],
    desc: '5 waqt ki namaz ek saath',
    category: 'islamic',
    react: '🕌',
    use: '.allnamaz Lahore',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const city = (ctx.q || 'Karachi').trim();
    try {
        const r = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=Pakistan&method=1`, { timeout: 10000 });
        const t = r.data.data.timings;
        return ctx.reply([
            `🕌 *NAMAZ TIMES — ${city.toUpperCase()}*`,
            '',
            `🌅 Fajr: *${t.Fajr}*`,
            `🌄 Sunrise: *${t.Sunrise}*`,
            `🌇 Dhuhr: *${t.Dhuhr}*`,
            `🌆 Asr: *${t.Asr}*`,
            `🌃 Maghrib: *${t.Maghrib}*`,
            `🌙 Isha: *${t.Isha}*`,
            '',
            `📅 ${new Date().toDateString()}`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Timings fail.'); }
});

// 5. DUACATEGORY — Category se dua
cmd({
    pattern: 'duacat',
    alias: ['duacategory'],
    desc: 'Category se dua',
    category: 'islamic',
    react: '🤲',
    use: '.duacat health',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const cat = (ctx.q || '').toLowerCase();
    const duas = {
        health: 'اللَّهُمَّ عَافِنِي فِي بَدَنِي — "O Allah, grant me health in my body"',
        rizq: 'اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ — "O Allah, suffice me with halal"',
        knowledge: 'رَبِّ زِدْنِي عِلْمًا — "My Lord, increase me in knowledge"',
        family: 'رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ — "Grant us comfort in spouses and children"',
        protection: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ — "In Allah\'s name, nothing harms"',
        anxiety: 'حَسْبِيَ اللَّهُ وَنِعْمَ الْوَكِيلُ — "Allah is sufficient for me"'
    };

    if (!cat || !duas[cat]) {
        return ctx.reply('Use: `.duacat <category>`\n\nCategories: health, rizq, knowledge, family, protection, anxiety');
    }

    return ctx.reply(`🤲 *DUA — ${cat.toUpperCase()}*\n\n${duas[cat]}`);
});

// 6. ZIKR-COUNTER — Zikr counter with target
const zikrData = new Map();
cmd({
    pattern: 'zikrstart',
    alias: ['startzikr'],
    desc: 'Zikr counter start karo',
    category: 'islamic',
    react: '📿',
    use: '.zikrstart 100',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const target = parseInt(ctx.q) || 33;
    const key = ctx.sender;
    zikrData.set(key, { count: 0, target });
    return ctx.reply(`📿 *Zikr started!*\n\n🎯 Target: *${target}*\n\nHar baar `.zikr` likho — count barhega.`);
});

cmd({
    pattern: 'zikr',
    alias: ['zikrcount'],
    desc: 'Zikr count karo',
    category: 'islamic',
    react: '📿',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const key = ctx.sender;
    if (!zikrData.has(key)) return ctx.reply('Pehle `.zikrstart 33` chalao.');

    const data = zikrData.get(key);
    data.count++;

    if (data.count >= data.target) {
        zikrData.delete(key);
        return ctx.reply(`🎉 *MUBARAK! ${data.target}/${data.target} complete!*\n\n💫 Allah accept kare!`);
    }

    const remaining = data.target - data.count;
    return ctx.reply(`📿 *Zikr: ${data.count}/${data.target}*\n\n⏳ Remaining: *${remaining}*`);
});

// 7. ISLAMIC-QUIZ2 — Islamic quiz with answer
cmd({
    pattern: 'islamquiz',
    alias: ['deeni-sawal'],
    desc: 'Islamic quiz',
    category: 'islamic',
    react: '❓',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const qs = [
        { q: 'Quran ka pehla Surah?', a: 'Al-Fatihah' },
        { q: 'Quran me total kitne Surah?', a: '114' },
        { q: 'Pehla Khalifa?', a: 'Abu Bakr (RA)' },
        { q: 'Hajj kis mahine me?', a: 'Dhul Hijjah' },
        { q: 'Jumma ka din ki fazilat?', a: 'Best day of week' }
    ];
    const pick = qs[crypto.randomInt(qs.length)];
    return ctx.reply(`❓ *ISLAMIC QUIZ*\n\n📌 ${pick.q}\n\n💡 ||${pick.a}||`);
});

// 8. KALIMA — 6 Kalimas
cmd({
    pattern: 'kalima',
    alias: ['kalimas'],
    desc: '6 Kalimas',
    category: 'islamic',
    react: '🕋',
    use: '.kalima 1-6',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const num = parseInt(ctx.q);
    const kalimas = {
        1: 'لَا إِلَٰهَ إِلَّا اللَّهُ مُحَمَّدٌ رَسُولُ اللَّهِ\n\n"La ilaha illallahu Muhammadur Rasulullah"',
        2: 'أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ',
        3: 'سُبْحَانَ اللَّهِ وَالْحَمْدُ لِلَّهِ وَلَا إِلَٰهَ إِلَّا اللَّهُ وَاللَّهُ أَكْبَرُ',
        4: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ الْعَلِيِّ الْعَظِيمِ',
        5: 'أَسْتَغْفِرُ اللَّهَ رَبِّي مِنْ كُلِّ ذَنْبٍ',
        6: 'لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ'
    };

    if (!num || num < 1 || num > 6) {
        return ctx.reply('Use: `.kalima <1-6>`\n\n6 Kalimas available');
    }

    return ctx.reply(`🕋 *KALIMA ${num}*\n\n${kalimas[num]}`);
});

// 9. ISLAMIC-NAME — Islamic name meaning
cmd({
    pattern: 'namemeaning',
    alias: ['naam'],
    desc: 'Islamic naam ka meaning',
    category: 'islamic',
    react: '📝',
    use: '.namemeaning Ali',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const names = {
        ali: 'علي — High, Exalted, Noble',
        ahmed: 'أحمد — Most Praised',
        muhammad: 'محمد — Praiseworthy',
        fatima: 'فاطمة — Prophet\'s daughter, Chaste',
        aisha: 'عائشة — Alive, Living',
        hassan: 'حسن — Beautiful, Good',
        hussain: 'حسين — Beautiful, Good',
        omar: 'عمر — Flourishing, Long-lived',
        khadija: 'خديجة — Prophet\'s first wife',
        zainab: 'زينب — Fragrant flower'
    };
    const name = (ctx.q || '').toLowerCase().trim();
    if (!name || !names[name]) {
        return ctx.reply(`Use: \`.namemeaning <name>\`\n\nAvailable: ${Object.keys(names).join(', ')}`);
    }
    return ctx.reply(`📝 *${name.toUpperCase()}*\n\n${names[name]}`);
});

// 10. HIJRI-EVENT — Islamic date events
cmd({
    pattern: 'islamicevent',
    alias: ['islamicevents'],
    desc: 'Islamic events',
    category: 'islamic',
    react: '🌙',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const events = [
        '🌙 *Ramadan* — 9th month, fasting',
        '🕋 *Hajj* — 12th month, Dhul Hijjah 8-13',
        '🎉 *Eid ul-Fitr* — 1st Shawwal',
        '🐐 *Eid ul-Adha* — 10th Dhul Hijjah',
        '🌸 *Muharram* — 1st month, Islamic new year',
        '💫 *Mawlid* — 12th Rabi al-Awwal',
        '🌃 *Shab-e-Miraj* — 27th Rajab',
        '📿 *Shab-e-Barat* — 15th Shaban'
    ];
    return ctx.reply(`🌙 *ISLAMIC EVENTS*\n\n${events.join('\n')}`);
});

// ===========================================================
// 🌍 11-20: WORLD INFO
// ===========================================================

// 11. TIMEZONE — Current time in any timezone
cmd({
    pattern: 'timezone',
    alias: ['tz', 'clock'],
    desc: 'Kisi bhi timezone ka time',
    category: 'tools',
    react: '🕐',
    use: '.timezone America/New_York',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const tz = (ctx.q || 'Asia/Karachi').trim();
    try {
        const time = new Date().toLocaleString('en-GB', { timeZone: tz });
        return ctx.reply(`🕐 *TIME — ${tz}*\n\n*${time}*`);
    } catch (e) { return ctx.reply('❌ Invalid timezone.'); }
});

// 12. WORLDCAP — Country capital
cmd({
    pattern: 'capital',
    alias: ['capitals'],
    desc: 'Country ka capital',
    category: 'tools',
    react: '🏛️',
    use: '.capital Pakistan',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const country = (ctx.q || '').trim();
    if (!country) return ctx.reply('Use: `.capital Pakistan`');
    try {
        const r = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}`, { timeout: 10000 });
        const c = r.data[0];
        return ctx.reply([
            `🏛️ *${c.name.common}*`,
            '',
            `🏛️ Capital: *${c.capital?.[0]}*`,
            `👥 Population: *${c.population.toLocaleString()}*`,
            `🌐 Region: *${c.region}*`,
            `🗣️ Languages: *${Object.values(c.languages || {}).slice(0, 3).join(', ')}*`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Country not found.'); }
});

// 13. FLAG — Country flag
cmd({
    pattern: 'flag',
    alias: ['countryflag'],
    desc: 'Country ka flag',
    category: 'tools',
    react: '🚩',
    use: '.flag Pakistan',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const flags = {
        pakistan: '🇵🇰', india: '🇮🇳', usa: '🇺🇸', uk: '🇬🇧',
        china: '🇨🇳', japan: '🇯🇵', germany: '🇩🇪', france: '🇫🇷',
        saudi: '🇸🇦', uae: '🇦🇪', turkey: '🇹🇷', iran: '🇮🇷',
        russia: '🇷🇺', brazil: '🇧🇷', australia: '🇦🇺', canada: '🇨🇦'
    };
    const country = (ctx.q || '').toLowerCase().trim();
    if (!country || !flags[country]) {
        return ctx.reply(`Use: \`.flag <country>\`\n\nAvailable: ${Object.keys(flags).join(', ')}`);
    }
    return ctx.reply(`${flags[country]} *${country.toUpperCase()}*`);
});

// 14. POPULATION — Country population
cmd({
    pattern: 'population',
    alias: ['pop'],
    desc: 'Country ki population',
    category: 'tools',
    react: '👥',
    use: '.population India',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const country = (ctx.q || '').trim();
    if (!country) return ctx.reply('Use: `.population India`');
    try {
        const r = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}`, { timeout: 10000 });
        const c = r.data[0];
        return ctx.reply(`👥 *${c.name.common}*\n\n📊 Population: *${c.population.toLocaleString()}*`);
    } catch (e) { return ctx.reply('❌ Country not found.'); }
});

// 15. LANGUAGES — Country languages
cmd({
    pattern: 'languages',
    alias: ['countrylang'],
    desc: 'Country ki languages',
    category: 'tools',
    react: '🗣️',
    use: '.languages India',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const country = (ctx.q || '').trim();
    if (!country) return ctx.reply('Use: `.languages India`');
    try {
        const r = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}`, { timeout: 10000 });
        const c = r.data[0];
        const langs = Object.values(c.languages || {}).join(', ');
        return ctx.reply(`🗣️ *${c.name.common}*\n\n📝 Languages: *${langs}*`);
    } catch (e) { return ctx.reply('❌ Country not found.'); }
});

// 16. TRAVELTIP — Random travel tip
cmd({
    pattern: 'traveltip',
    alias: ['travel'],
    desc: 'Random travel tip',
    category: 'fun',
    react: '✈️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const tips = [
        '✈️ Passport ki photocopy alag rakho',
        '💰 Local currency me paisa rakho, ATM card alag',
        '📱 Offline maps download karo',
        '🧳 Cabin bag me essentials rakho',
        '🛡️ Travel insurance lo',
        '💊 Basic medicines saath rakho',
        '📸 Local photos ka folder banao',
        '🌐 Local SIM ya eSIM lo',
        '🎒 Thoda space khali rakho shopping ke liye',
        '📝 Hotel address local language me likho'
    ];
    return ctx.reply(tips[crypto.randomInt(tips.length)]);
});

// 17. AIRPORT — Airport info
cmd({
    pattern: 'airport',
    alias: ['airportinfo'],
    desc: 'Airport ki info',
    category: 'tools',
    react: '🛫',
    use: '.airport KHI',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const code = (ctx.q || '').toUpperCase().trim();
    const airports = {
        KHI: { name: 'Jinnah International', city: 'Karachi' },
        LHE: { name: 'Allama Iqbal International', city: 'Lahore' },
        ISB: { name: 'Islamabad International', city: 'Islamabad' },
        DXB: { name: 'Dubai International', city: 'Dubai' },
        DOH: { name: 'Hamad International', city: 'Doha' },
        JED: { name: 'King Abdulaziz International', city: 'Jeddah' },
        LHR: { name: 'Heathrow', city: 'London' },
        JFK: { name: 'John F. Kennedy', city: 'New York' }
    };

    if (!code || !airports[code]) {
        return ctx.reply(`Use: \`.airport <code>\`\n\nCodes: ${Object.keys(airports).join(', ')}`);
    }

    const a = airports[code];
    return ctx.reply(`🛫 *${code}*\n\n🏢 ${a.name}\n🏙️ ${a.city}`);
});

// 18. WEATHER3 — 7-day weather
cmd({
    pattern: 'weatherweek',
    alias: ['weekweather'],
    desc: '7-day weather forecast',
    category: 'tools',
    react: '🌤️',
    use: '.weatherweek Lahore',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const city = (ctx.q || 'Karachi').trim();
    try {
        const r = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 15000 });
        const d = r.data.weather.slice(0, 7);
        const lines = d.map(day =>
            `📅 ${day.date}\n🌡️ ${day.mintempC}°C - ${day.maxtempC}°C\n☁️ ${day.hourly[0].weatherDesc[0].value}`
        );
        return ctx.reply(`🌤️ *7-DAY FORECAST — ${city}*\n\n${lines.join('\n\n')}`);
    } catch (e) { return ctx.reply('❌ Forecast fail.'); }
});

// 19. SUNRISE2 — Sunrise/sunset times
cmd({
    pattern: 'sunriseset',
    alias: ['sun'],
    desc: 'Sunrise/sunset time',
    category: 'tools',
    react: '🌅',
    use: '.sunriseset Karachi',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const city = (ctx.q || 'Karachi').trim();
    try {
        const r = await axios.get(`https://api.sunrise-sunset.org/json?lat=24.86&lng=67.01`, { timeout: 10000 });
        const d = r.data.results;
        return ctx.reply([
            `🌅 *SUNRISE/SUNSET — ${city}*`,
            '',
            `🌅 Sunrise: *${new Date(d.sunrise).toLocaleTimeString('en-GB')}*`,
            `🌇 Sunset: *${new Date(d.sunset).toLocaleTimeString('en-GB')}*`,
            `🌞 Day Length: *${(d.day_length / 3600).toFixed(1)} hours*`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Sunrise fail.'); }
});

// 20. MOON — Moon phase
cmd({
    pattern: 'moon',
    alias: ['moonphase'],
    desc: 'Aaj ka moon phase',
    category: 'fun',
    react: '🌙',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const phases = ['🌑 New Moon', '🌒 Waxing Crescent', '🌓 First Quarter',
        '🌔 Waxing Gibbous', '🌕 Full Moon', '🌖 Waning Gibbous',
        '🌗 Last Quarter', '🌘 Waning Crescent'];
    const day = new Date().getDate();
    const phase = phases[day % 8];
    return ctx.reply(`🌙 *MOON PHASE TODAY*\n\n*${phase}*`);
});

// ===========================================================
// 🎮 21-30: FUN + USEFUL
// ===========================================================

// 21. ALPHABET — ABCD for kids
cmd({
    pattern: 'abcd',
    alias: ['alphabet'],
    desc: 'ABCD for kids',
    category: 'fun',
    react: '🔤',
    use: '.abcd A',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const words = {
        A: 'Apple 🍎', B: 'Ball ⚽', C: 'Cat 🐱', D: 'Dog 🐕',
        E: 'Elephant 🐘', F: 'Fish 🐟', G: 'Goat 🐐', H: 'Horse 🐴',
        I: 'Ice cream 🍦', J: 'Jug 🏺', K: 'Kite 🪁', L: 'Lion 🦁',
        M: 'Mango 🥭', N: 'Nest 🪹', O: 'Orange 🍊', P: 'Pen 🖊️',
        Q: 'Queen 👑', R: 'Rabbit 🐰', S: 'Sun ☀️', T: 'Tree 🌳',
        U: 'Umbrella ☂️', V: 'Van 🚐', W: 'Watch ⌚', X: 'Xylophone 🎵',
        Y: 'Yo-yo 🪀', Z: 'Zebra 🦓'
    };
    const letter = (ctx.q || '').toUpperCase().trim();
    if (!letter || !words[letter]) {
        return ctx.reply('Use: `.abcd A`\n\nYa phir koi letter do A-Z me se.');
    }
    return ctx.reply(`🔤 *${letter}* for *${words[letter]}*`);
});

// 22. COUNTING — 1-10 counting for kids
cmd({
    pattern: 'count123',
    alias: ['counting'],
    desc: '1-10 counting',
    category: 'fun',
    react: '🔢',
    use: '.count123 5',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const num = parseInt(ctx.q);
    if (!num || num < 1 || num > 10) return ctx.reply('Use: `.count123 5` (1-10)');

    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const count = emojis.slice(0, num).join(' ');
    return ctx.reply(`🔢 *Counting ${num}:*\n\n${count}`);
});

// NOTE: The following command in the supplied ZIP was truncated and has been omitted
// so this plugin can load safely. Restore it from a complete source before re-adding.
