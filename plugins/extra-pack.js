const { cmd } = require('../arslan');
const config = require('../config');
const crypto = require('crypto');
const axios = require('axios');

// ===========================================================
// 🎮 GAMES (1-10)
// ===========================================================

// 1. QUIZ — General knowledge quiz
cmd({
    pattern: 'quiz',
    alias: ['gk', 'sawal'],
    desc: 'General knowledge quiz',
    category: 'fun',
    react: '❓',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const questions = [
        { q: 'Pakistan ka capital kya hai?', a: 'Islamabad' },
        { q: 'Sabse bara ocean kaunsa hai?', a: 'Pacific Ocean' },
        { q: 'Duniya ki sabse lambi nadi?', a: 'Nile' },
        { q: 'Pakistan ka national animal?', a: 'Markhor' },
        { q: 'Sabse zyada population wala mulk?', a: 'India' },
        { q: 'Sun se sabse door planet?', a: 'Neptune' },
        { q: 'Insaan ke kitni haddiyan?', a: '206' },
        { q: 'Sabse chhota mulk?', a: 'Vatican City' },
        { q: 'K2 kis mulk me?', a: 'Pakistan' },
        { q: 'Sabse purana university?', a: 'Al-Qarawiyyin' }
    ];
    const pick = questions[crypto.randomInt(questions.length)];
    return ctx.reply([
        `❓ *QUIZ*`,
        '',
        `📌 *Sawal:* ${pick.q}`,
        '',
        `💡 *Jawab:* ||${pick.a}||`
    ].join('\n'));
});

// 2. WORDCHAIN — Word chain game
cmd({
    pattern: 'wordchain',
    alias: ['wc'],
    desc: 'Word chain game',
    category: 'fun',
    react: '🔗',
    use: '.wordchain apple',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const start = (ctx.q || '').trim().toLowerCase();
    if (!start) return ctx.reply('Use: *.wordchain apple*');

    const lastLetter = start.slice(-1);
    const words = {
        a: 'apple', b: 'ball', c: 'cat', d: 'dog', e: 'elephant',
        f: 'fish', g: 'goat', h: 'house', i: 'ice', j: 'jug',
        k: 'kite', l: 'lion', m: 'mango', n: 'nest', o: 'orange',
        p: 'pen', q: 'queen', r: 'rat', s: 'sun', t: 'tree',
        u: 'umbrella', v: 'van', w: 'water', x: 'xylophone', y: 'yacht', z: 'zebra'
    };
    const next = words[lastLetter] || 'apple';

    return ctx.reply([
        `🔗 *WORD CHAIN*`,
        '',
        `📝 Tum: *${start}*`,
        `🤖 Bot: *${next}*`,
        '',
        `✏️ Ab "*${next.slice(-1).toUpperCase()}*" se shuru karo!`
    ].join('\n'));
});

// 3. RIDDLE — Riddle
cmd({
    pattern: 'riddle',
    alias: ['paheli'],
    desc: 'Random riddle',
    category: 'fun',
    react: '🧩',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const riddles = [
        { q: 'I speak without a mouth and hear without ears. What am I?', a: 'Echo' },
        { q: 'The more you take, the more you leave behind. What am I?', a: 'Footsteps' },
        { q: 'What has keys but no locks?', a: 'Piano' },
        { q: 'What has a head but no brain?', a: 'Coin' },
        { q: 'What gets wetter the more it dries?', a: 'Towel' },
        { q: 'What has hands but cannot clap?', a: 'Clock' },
        { q: 'What comes once in a minute, twice in a moment?', a: 'Letter M' },
        { q: 'I have cities, but no houses. What am I?', a: 'Map' }
    ];
    const pick = riddles[crypto.randomInt(riddles.length)];
    return ctx.reply([
        `🧩 *RIDDLE*`,
        '',
        `❓ ${pick.q}`,
        '',
        `💡 *Answer:* ||${pick.a}||`
    ].join('\n'));
});

// 4. PICKUP — Random pickup line
cmd({
    pattern: 'pickup',
    alias: ['pickupline', 'flirt'],
    desc: 'Random pickup line',
    category: 'fun',
    react: '😘',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const lines = [
        'Tumhari smile ne mere WiFi ka password tod diya 😍',
        'Kya tum Google ho? Kyunki tum wo sab kuch ho jo main dhoondh raha tha 💕',
        'Tumhare bina mera din aisa hai jaise phone bina charger 🔋',
        'Meri zindagi ki picture me tum hero ho 🎬',
        'Kya tum WhatsApp ho? Kyunki tumhare bina main adhura hun 📱',
        'Tumhari aankhon me mera future dikhta hai ✨',
        'Tum meri zindagi ka wo update ho jiska mujhe intezar tha 💫'
    ];
    return ctx.reply(`😘 ${lines[crypto.randomInt(lines.length)]}`);
});

// 5. PUNJABI — Random Punjabi joke
cmd({
    pattern: 'punjabi',
    alias: ['punjabijoke'],
    desc: 'Punjabi joke',
    category: 'fun',
    react: '😂',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const jokes = [
        'Sardar ji ne mirror bech diya kyunki unhe apna chehra pasand nahi aya 😂',
        'Sardar ji ne AC kharida, ghar me fan laga ke thanda kar diya ❄️',
        'Sardar ji doctor ke paas gaye: "Doctor sahab, jab main apna sir hilata hun to dard hota hai." Doctor: "Sir mat hilao!" 😂',
        'Sardar ji ne swimming seekhi — swimming pool me paani nahi tha 🏊',
        'Sardar ji ne mobile kharida, "Hello" bola, jawab nahi aya, wapas kar diya 📱'
    ];
    return ctx.reply(`😂 ${jokes[crypto.randomInt(jokes.length)]}`);
});

// 6. MEME — Random meme text
cmd({
    pattern: 'meme',
    alias: ['memes'],
    desc: 'Random meme text',
    category: 'fun',
    react: '😆',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const memes = [
        'When you finally finish homework:\n"Sir, homework kahan hai?" 😂',
        'Mom: Beta utho, school jaana hai.\nMe: 5 minute aur...\nMom: 5 minute me 5 saal ho gaye 😴',
        'WiFi: 1 bar\nMe: 0 bar\nWhatsApp: Connected ✅',
        'Teacher: Mobile do.\nMe: Nahi hai.\nTeacher: Phir haath me kya hai?\nMe: Kismat 💀',
        'Friend: Free ho?\nMe: Haan.\nFriend: Ek kaam kar do.\nMe: Busy hun 😂'
    ];
    return ctx.reply(`😆 ${memes[crypto.randomInt(memes.length)]}`);
});

// 7. DARE2 — Extreme dare
cmd({
    pattern: 'dare2',
    alias: ['harddare'],
    desc: 'Extreme dare',
    category: 'fun',
    react: '🔥',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const dares = [
        'Apne ex ko "I miss you" bhejo 💔',
        'Group me apni latest selfie bhejo 📸',
        'Apni chat history ka screenshot bhejo 📱',
        'Voice note me apna favourite song gao 🎤',
        'Kisi bhi random contact ko "Good morning" bhejo 🌅',
        'Apne bank balance ka screenshot bhejo 💰'
    ];
    return ctx.reply(`🔥 *HARD DARE*\n\n${dares[crypto.randomInt(dares.length)]}`);
});

// 8. TRUTH2 — Deep truth
cmd({
    pattern: 'truth2',
    alias: ['hardtruth'],
    desc: 'Deep truth question',
    category: 'fun',
    react: '🤔',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const truths = [
        'Apni zindagi ka sabse bara regret kya hai?',
        'Kis insaan ko tum hamesha miss karte ho?',
        'Apna sabse bara darr kya hai?',
        'Agar 1 din ki zindagi bachi ho to kya karo?',
        'Kya tumne kabhi kisi ko dhoka diya hai?',
        'Aap apne aap me kya badalna chahte ho?'
    ];
    return ctx.reply(`🤔 *HARD TRUTH*\n\n${truths[crypto.randomInt(truths.length)]}`);
});

// 9. WOULDYOU — Would you question
cmd({
    pattern: 'wouldyou',
    alias: ['wyq'],
    desc: 'Would you question',
    category: 'fun',
    react: '💭',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const questions = [
        'Kya tum 10 saal purani zindagi wapas chaho ge?',
        'Kya tum apna future dekhna chahte ho?',
        'Kya tum kisi ajnabi se pyar kar sakte ho?',
        'Kya tum apni sabse badi galti sudhar sakte ho?',
        'Kya tum apni yaadon ko delete karna chahoge?',
        'Kya tum apni zindagi kisi aur se badal lo ge?'
    ];
    return ctx.reply(`💭 *WOULD YOU?*\n\n${questions[crypto.randomInt(questions.length)]}`);
});

// 10. DUEL — Duel between two users
cmd({
    pattern: 'duel',
    alias: ['fight'],
    desc: 'Do users ka duel',
    category: 'fun',
    react: '⚔️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned.length < 2) return ctx.reply('❌ 2 users ko mention karo.');

    const p1Power = crypto.randomInt(50, 101);
    const p2Power = crypto.randomInt(50, 101);
    const winner = p1Power > p2Power ? mentioned[0] : mentioned[1];
    const loser = p1Power > p2Power ? mentioned[1] : mentioned[0];

    return conn.sendMessage(ctx.from, {
        text: [
            '⚔️ *DUEL RESULT*',
            '',
            `🔴 @${mentioned[0].split('@')[0]} — Power: *${p1Power}*`,
            `🔵 @${mentioned[1].split('@')[0]} — Power: *${p2Power}*`,
            '',
            `🏆 *Winner:* @${winner.split('@')[0]}`,
            `💀 *Loser:* @${loser.split('@')[0]}`
        ].join('\n'),
        mentions: mentioned
    }, { quoted: mek });
});

// ===========================================================
// 📊 INFO COMMANDS (11-20)
// ===========================================================

// 11. PING2 — Advanced ping
cmd({
    pattern: 'ping2',
    alias: ['speedtest2'],
    desc: 'Advanced ping',
    category: 'general',
    react: '📡',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const t1 = Date.now();
    await ctx.reply('📡 Testing…');
    const t2 = Date.now();
    const mem = process.memoryUsage();
    return ctx.reply([
        '📡 *PING DETAILS*',
        '',
        `⚡ Latency: *${t2 - t1}ms*`,
        `⏱ Uptime: *${Math.floor(process.uptime() / 60)}m*`,
        `💾 RAM: *${(mem.rss / 1048576).toFixed(2)} MB*`,
        `🌐 Node: *${process.version}*`,
        `📱 Sockets: *${global.activeSockets?.size || 0}*`,
        `🖥 Platform: *${require('os').platform()}*`
    ].join('\n'));
});

// 12. SERVER — Server info
cmd({
    pattern: 'server',
    alias: ['serverinfo'],
    desc: 'Server info',
    category: 'general',
    react: '🖥️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const os = require('os');
    const mem = process.memoryUsage();
    const total = os.totalmem() / 1048576;
    const free = os.freemem() / 1048576;
    const used = total - free;

    return ctx.reply([
        '🖥️ *SERVER INFO*',
        '',
        `🖥 Platform: *${os.platform()}*`,
        `⚙ CPU: *${os.cpus()[0]?.model?.slice(0, 30) || 'N/A'}*`,
        `🧠 Cores: *${os.cpus().length}*`,
        `💾 RAM: *${used.toFixed(0)}/${total.toFixed(0)} MB*`,
        `📊 Process: *${(mem.rss / 1048576).toFixed(0)} MB*`,
        `⏱ Uptime: *${Math.floor(os.uptime() / 3600)}h*`
    ].join('\n'));
});

// 13. DATE — Current date and time
cmd({
    pattern: 'date',
    alias: ['time'],
    desc: 'Current date and time',
    category: 'general',
    react: '📅',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const moment = require('moment-timezone');
    const time = moment().tz('Asia/Karachi').format('HH:mm:ss');
    const date = moment().tz('Asia/Karachi').format('dddd, MMMM Do YYYY');
    const hijri = moment().tz('Asia/Karachi').format('DD-MM-YYYY');

    return ctx.reply([
        '📅 *DATE & TIME*',
        '',
        `🕐 Time: *${time}*`,
        `📆 Date: *${date}*`,
        `🌙 Timezone: *Asia/Karachi (PKT)*`,
        `📅 Year: *${new Date().getFullYear()}*`
    ].join('\n'));
});

// 14. CALC — Calculator
cmd({
    pattern: 'calc',
    alias: ['calculator', 'math'],
    desc: 'Calculator',
    category: 'tools',
    react: '🧮',
    use: '.calc 5 + 3 * 2',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const expr = (ctx.q || '').replace(/[^0-9+\-*/.()% ]/g, '');
    if (!expr) return ctx.reply('Use: *.calc 5+3*');

    try {
        const result = Function(`"use strict"; return (${expr})`)();
        return ctx.reply(`🧮 *${expr} = ${result}*`);
    } catch (e) {
        return ctx.reply('❌ Invalid expression.');
    }
});

// 15. REVERSE — Text reverse
cmd({
    pattern: 'reverse',
    alias: ['revtext'],
    desc: 'Text ko reverse karo',
    category: 'tools',
    react: '🔄',
    use: '.reverse hello',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: *.reverse hello*');
    return ctx.reply(`🔄 ${ctx.q.split('').reverse().join('')}`);
});

// 16. UPPERCASE — Text uppercase
cmd({
    pattern: 'uppercase',
    alias: ['upper'],
    desc: 'Text uppercase',
    category: 'tools',
    react: '🔠',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: *.uppercase hello*');
    return ctx.reply(`🔠 ${ctx.q.toUpperCase()}`);
});

// 17. LOWERCASE — Text lowercase
cmd({
    pattern: 'lowercase',
    alias: ['lower'],
    desc: 'Text lowercase',
    category: 'tools',
    react: '🔡',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: *.lowercase HELLO*');
    return ctx.reply(`🔡 ${ctx.q.toLowerCase()}`);
});

// 18. LENGTH — Text length
cmd({
    pattern: 'length',
    alias: ['count'],
    desc: 'Text ki length',
    category: 'tools',
    react: '📏',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: *.length hello*');
    return ctx.reply([
        `📏 *TEXT STATS*`,
        '',
        `📝 Text: ${ctx.q}`,
        `🔢 Characters: *${ctx.q.length}*`,
        `📄 Words: *${ctx.q.split(/\s+/).length}*`,
        `📃 Lines: *${ctx.q.split('\n').length}*`
    ].join('\n'));
});

// 19. BINARY — Text to binary
cmd({
    pattern: 'tobin',
    alias: ['text2bin'],
    desc: 'Text to binary',
    category: 'tools',
    react: '💻',
    use: '.tobin hi',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: *.tobin hello*');
    const binary = ctx.q.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
    return ctx.reply(`💻 ${binary}`);
});

// 20. FROMBIN — Binary to text
cmd({
    pattern: 'frombin',
    alias: ['bin2text'],
    desc: 'Binary to text',
    category: 'tools',
    react: '💬',
    use: '.frombin 01001000 01101001',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: *.frombin 01001000 01101001*');
    try {
        const text = ctx.q.split(/\s+/).map(b => String.fromCharCode(parseInt(b, 2))).join('');
        return ctx.reply(`💬 ${text}`);
    } catch (e) { return ctx.reply('❌ Invalid binary.'); }
});

// ===========================================================
// 🎉 FUN MORE (21-30)
// ===========================================================

// 21. COMPLIMENT2 — Sweet compliment
cmd({
    pattern: 'compliment2',
    alias: ['sweet'],
    desc: 'Sweet compliment',
    category: 'fun',
    react: '💐',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const lines = [
        'Tumhari muskurahat duniya ki sabse pyari cheez hai 😊',
        'Tum jaise log duniya me kam hote hain 💫',
        'Tumhari baaton me ek alag si jaan hai ✨',
        'Tum sabki favourite ho, ye tumhe pata bhi nahi 🌟',
        'Tumhari presence se din acha ban jata hai 💖'
    ];
    return ctx.reply(`💐 ${lines[crypto.randomInt(lines.length)]}`);
});

// 22. INSULT — Funny insult
cmd({
    pattern: 'insult',
    alias: ['gaali'],
    desc: 'Funny insult',
    category: 'fun',
    react: '😂',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const lines = [
        'Tumhari shakal dekh ke WiFi bhi disconnect ho jata hai 😂',
        'Tumhari intelligence Google bhi search nahi kar sakta 🔍',
        'Tum WhatsApp pe ho? Mujhe laga WhatsApp tumse pareshan hai 📱',
        'Tumhari photo dekh ke phone restart ho gaya 💀',
        'Tumhare jaise log duniya ko interesting banate hain 🎭'
    ];
    return ctx.reply(`😂 ${lines[crypto.randomInt(lines.length)]}`);
});

// 23. GOODMORNING — Morning message
cmd({
    pattern: 'goodmorning',
    alias: ['gm', 'subah'],
    desc: 'Good morning message',
    category: 'fun',
    react: '🌅',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const moments = [
        '🌅 *Good Morning!* Subah ki pehli roshni tumhare liye khushiyan laye!',
        '🌅 *Good Morning!* Aaj ka din tumhara best din ho!',
        '🌅 *Good Morning!* Utho, muskurao, duniya jeeto!',
        '🌅 *Good Morning!* Chai piyo, kaam karo, khush raho!',
        '🌅 *Good Morning!* Tumhari subah roshan ho!'
    ];
    return ctx.reply(moments[crypto.randomInt(moments.length)]);
});

// 24. GOODNIGHT — Night message
cmd({
    pattern: 'goodnight',
    alias: ['gn', 'raat'],
    desc: 'Good night message',
    category: 'fun',
    react: '🌙',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const moments = [
        '🌙 *Good Night!* Meethe sapne! 💤',
        '🌙 *Good Night!* Allah tumhe achi neend de! 😴',
        '🌙 *Good Night!* Kal subah nayi umeed leke aana! ✨',
        '🌙 *Good Night!* Chand tumhari hifazat kare! 🌟',
        '🌙 *Good Night!* Sote waqt muskurao! 😊'
    ];
    return ctx.reply(moments[crypto.randomInt(moments.length)]);
});

// 25. SHAYARI2 — Romantic shayari
cmd({
    pattern: 'shayari2',
    alias: ['romantic'],
    desc: 'Romantic shayari',
    category: 'fun',
    react: '💕',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const shayari = [
        'Tumhari yaadon me kho jata hun,\nTumhare bina kuch nahi hota 💕',
        'Dil ki dhadkan tum ho,\nZindagi ki khushi tum ho 💗',
        'Tumse milkar laga,\nSadiyon ka safar tay ho gaya ✨',
        'Aankhon me tum, khwabon me tum,\nHar pal me sirf tum ho 💫'
    ];
    return ctx.reply(`💕 *SHAYARI*\n\n${shayari[crypto.randomInt(shayari.length)]}`);
});

// 26. JOKE2 — Funny joke
cmd({
    pattern: 'joke2',
    alias: ['mazak2'],
    desc: 'Funny joke',
    category: 'fun',
    react: '😄',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const jokes = [
        'Doctor: Tumhe aaram chahiye.\nPatient: Doctor sahab, main mobile chalata hun to aaram milta hai.\nDoctor: Wahi to problem hai! 😂',
        'Teacher: Beta, padhai kaisi chal rahi hai?\nStudent: Sir, WiFi ka password nahi pata! 😅',
        'Friend: Kahan tha kal?\nMe: So raha tha.\nFriend: Din me?\nMe: Sardi hai bhai! ❄️',
        'Boss: Tumhe kaam aata hai?\nMe: Sir, seekh raha hun.\nBoss: Salary bhi seekh ke lena! 💰'
    ];
    return ctx.reply(`😄 ${jokes[crypto.randomInt(jokes.length)]}`);
});

// 27. QUOTE2 — Motivational quote
cmd({
    pattern: 'quote2',
    alias: ['motivation'],
    desc: 'Motivational quote',
    category: 'fun',
    react: '💫',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const quotes = [
        '💫 "Mehnat itni khamoshi se karo ke kamyabi shor kar de."',
        '💫 "Haar ke baad hi jeet ki qadar hoti hai."',
        '💫 "Khwab wo nahi jo neend me dekho, khwab wo hai jo tumhe sone na de."',
        '💫 "Aaj ka kaam kal pe mat chhodo."',
        '💫 "Har mushkil ke baad aasani hai."',
        '💫 "Apne aap pe bharosa rakho, sab kuch mumkin hai."'
    ];
    return ctx.reply(quotes[crypto.randomInt(quotes.length)]);
});

// 28. FORTUNE — Fortune cookie
cmd({
    pattern: 'fortune',
    alias: ['kismat'],
    desc: 'Fortune cookie',
    category: 'fun',
    react: '🔮',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const fortunes = [
        '🔮 Aaj tumhara lucky day hai! Kuch acha hone wala hai ✨',
        '🔮 Koi purana dost wapas aayega 💫',
        '🔮 Aaj kaam me kamyabi milegi 🌟',
        '🔮 Paisa aane wala hai 💰',
        '🔮 Kisi se pyar ki baat hogi 💕',
        '🔮 Aaj koi achi khabar sunne ko milegi 📰',
        '🔮 Tumhara intezar khatam hone wala hai ⏳'
    ];
    return ctx.reply(fortunes[crypto.randomInt(fortunes.length)]);
});

// NOTE: The following command in the supplied ZIP was truncated and has been omitted
// so this plugin can load safely. Restore it from a complete source before re-adding.
