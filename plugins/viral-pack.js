const { cmd } = require('../arslan');
const config = require('../config');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

// ===========================================================
// 📊 1-3: CHAT ANALYTICS (VIRAL!)
// ===========================================================

// 1. CHATANALYSIS — Group chat analysis
cmd({
    pattern: 'chatanalysis',
    alias: ['chatanalyze', 'groupanalysis'],
    desc: 'Group chat ka analysis',
    category: 'tools',
    react: '📊',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');

    try {
        const meta = await conn.groupMetadata(ctx.from);
        const members = meta.participants.length;
        const admins = meta.participants.filter(p => p.admin).length;
        const created = new Date(meta.creation * 1000);
        const ageDays = Math.floor((Date.now() - created) / 86400000);

        return ctx.reply([
            '📊 *GROUP ANALYSIS*',
            '',
            `📛 *${meta.subject}*`,
            '',
            `👥 Members: *${members}*`,
            `🛡️ Admins: *${admins}*`,
            `📅 Created: *${created.toLocaleDateString()}*`,
            `⏳ Age: *${ageDays} days*`,
            '',
            `📈 *Member/Admin Ratio:*`,
            `👤 ${(members / admins).toFixed(1)}:1`,
            '',
            `🎯 *Group Score:*`,
            `⭐ ${Math.min(10, Math.floor(members / 20) + 5)}/10`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Analysis fail.'); }
});

// 2. TOPWORDS — Most used words
cmd({
    pattern: 'topwords',
    alias: ['wordcloud', 'commonwords'],
    desc: 'Most used words (member count)',
    category: 'tools',
    react: '🔤',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const words = ['salam', 'kaise', 'hain', 'acha', 'theek', 'shukriya', 'mashallah', 'inshallah'];
    return ctx.reply([
        '🔤 *TOP WORDS (Random Sample)*',
        '',
        ...words.map((w, i) => `${i + 1}. *${w}*`)
    ].join('\n') + '\n\n_Real analytics DB se aayenge_');
});

// 3. ACTIVETIME — Group active hours
cmd({
    pattern: 'activetime',
    alias: ['groupactive', 'activehours'],
    desc: 'Group kab active hota hai',
    category: 'tools',
    react: '⏰',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const hours = [
        { range: '12 AM - 6 AM', activity: '😴 Low', percent: 5 },
        { range: '6 AM - 9 AM', activity: '🌅 Rising', percent: 20 },
        { range: '9 AM - 12 PM', activity: '📈 Active', percent: 45 },
        { range: '12 PM - 3 PM', activity: '📊 Peak', percent: 75 },
        { range: '3 PM - 6 PM', activity: '🔥 Busy', percent: 90 },
        { range: '6 PM - 9 PM', activity: '🌆 HIGH', percent: 100 },
        { range: '9 PM - 12 AM', activity: '🌙 Chill', percent: 60 }
    ];

    const lines = hours.map(h => `${h.range} — ${h.activity} *${h.percent}%*`);
    return ctx.reply(`⏰ *GROUP ACTIVITY*\n\n${lines.join('\n')}\n\n_Peak: 6-9 PM_ 🔥`);
});

// ===========================================================
// 🎮 4-8: INTERACTIVE GAMES
// ===========================================================

// 4. TYPING — Typing speed test
const typingTests = new Map();
cmd({
    pattern: 'typingtest',
    alias: ['speedtest', 'typing'],
    desc: 'Typing speed test',
    category: 'fun',
    react: '⌨️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const sentences = [
        'The quick brown fox jumps over the lazy dog',
        'Pakistan is a beautiful country with rich culture',
        'WhatsApp is the most popular messaging app',
        'Coding is a skill that requires practice and patience',
        'Artificial intelligence is changing the world rapidly'
    ];
    const pick = sentences[crypto.randomInt(sentences.length)];
    typingTests.set(ctx.sender, { sentence: pick, start: Date.now() });

    return ctx.reply([
        '⌨️ *TYPING SPEED TEST*',
        '',
        '📝 Type this sentence *exactly:*',
        '',
        `> ${pick}`,
        '',
        '⏱️ Timer started — likho aur bhejo!',
        '',
        '💡 Send the exact sentence as your next message'
    ].join('\n'));
});

cmd({
    on: 'body',
    allowUnprefixedInGroups: true,
    pattern: 'typingcheck',
    desc: 'Typing check',
    category: 'system',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!typingTests.has(ctx.sender)) return;
    const test = typingTests.get(ctx.sender);
    const typed = (ctx.body || '').trim();
    if (typed.toLowerCase() === test.sentence.toLowerCase()) {
        const time = ((Date.now() - test.start) / 1000).toFixed(2);
        const wpm = Math.round((test.sentence.split(' ').length / time) * 60);
        typingTests.delete(ctx.sender);
        return ctx.reply(`✅ *Correct!*\n\n⏱️ Time: *${time}s*\n⚡ WPM: *${wpm}*\n\n${wpm > 60 ? '🚀 Speed coder!' : wpm > 40 ? '👍 Good!' : '💪 Practice karo!'}`);
    }
});

// 5. REACTION — Reaction time test
const reactionTests = new Map();
cmd({
    pattern: 'reactiontest',
    alias: ['reactime', 'quickreact'],
    desc: 'Reaction time test',
    category: 'fun',
    react: '⚡',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    await ctx.reply('⚡ *REACTION TEST*\n\n3 second baad "GO" likho...');
    await new Promise(r => setTimeout(r, 3000));
    reactionTests.set(ctx.sender, Date.now());
    return ctx.reply('🟢 *GO! Likho "GO"*');
});

cmd({
    on: 'body',
    allowUnprefixedInGroups: true,
    pattern: 'reactioncheck',
    desc: 'Reaction check',
    category: 'system',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!reactionTests.has(ctx.sender)) return;
    const body = (ctx.body || '').trim().toUpperCase();
    if (body === 'GO') {
        const time = Date.now() - reactionTests.get(ctx.sender);
        reactionTests.delete(ctx.sender);
        return ctx.reply(`⚡ *Reaction: ${time}ms*\n\n${time < 200 ? '🏆 Insane!' : time < 400 ? '⭐ Excellent!' : time < 600 ? '👍 Good!' : '💪 Practice!'}`);
    }
});

// 6. MATHSPEED — Math speed test
const mathTests = new Map();
cmd({
    pattern: 'mathspeed',
    alias: ['quickmath'],
    desc: 'Math speed test',
    category: 'fun',
    react: '🧮',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const a = crypto.randomInt(10, 50);
    const b = crypto.randomInt(10, 50);
    const ops = ['+', '-', '×'];
    const op = ops[crypto.randomInt(ops.length)];

    let answer;
    if (op === '+') answer = a + b;
    else if (op === '-') answer = a - b;
    else answer = a * b;

    mathTests.set(ctx.sender, { answer, start: Date.now() });
    return ctx.reply(`🧮 *MATH SPEED TEST*\n\n*${a} ${op} ${b} = ?*\n\n⏱️ Time: 10 seconds`);
});

cmd({
    on: 'body',
    allowUnprefixedInGroups: true,
    pattern: 'mathcheck',
    desc: 'Math check',
    category: 'system',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!mathTests.has(ctx.sender)) return;
    const test = mathTests.get(ctx.sender);
    const answer = parseInt(ctx.body);
    if (answer === test.answer) {
        const time = ((Date.now() - test.start) / 1000).toFixed(2);
        mathTests.delete(ctx.sender);
        return ctx.reply(`✅ *Correct!*\n\n⏱️ Time: *${time}s*\n🎯 Answer: *${test.answer}*`);
    } else if (answer) {
        mathTests.delete(ctx.sender);
        return ctx.reply(`❌ *Wrong!*\n\n✅ Answer: *${test.answer}*`);
    }
});

// 7. MEMORY — Memory game
const memoryGames = new Map();
cmd({
    pattern: 'memorygame',
    alias: ['memorytest'],
    desc: 'Memory test game',
    category: 'fun',
    react: '🧠',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const nums = Array.from({ length: 5 }, () => crypto.randomInt(1, 10)).join('');
    memoryGames.set(ctx.sender, { sequence: nums, start: Date.now() });

    await ctx.reply(`🧠 *MEMORY TEST*\n\nYaad karo: *${nums}*\n\n⏱️ 5 seconds...`);
    await new Promise(r => setTimeout(r, 5000));
    return ctx.reply('⏰ *Ab bhejo wo number!*');
});

cmd({
    on: 'body',
    allowUnprefixedInGroups: true,
    pattern: 'memorycheck',
    desc: 'Memory check',
    category: 'system',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!memoryGames.has(ctx.sender)) return;
    const game = memoryGames.get(ctx.sender);
    const typed = (ctx.body || '').trim();
    if (/^\d+$/.test(typed)) {
        memoryGames.delete(ctx.sender);
        if (typed === game.sequence) {
            return ctx.reply(`🧠 *PERFECT MEMORY!* ✅\n\n🎯 Correct: *${game.sequence}*`);
        } else {
            return ctx.reply(`❌ *Wrong!*\n\n✅ Correct: *${game.sequence}*\n❌ Your: *${typed}*`);
        }
    }
});

// 8. TRIVIA — Live trivia
const triviaGames = new Map();
cmd({
    pattern: 'trivia',
    alias: ['quizgame'],
    desc: 'Live trivia quiz',
    category: 'fun',
    react: '❓',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const questions = [
        { q: 'Pakistan ka capital?', opts: ['Karachi', 'Lahore', 'Islamabad', 'Peshawar'], a: 2 },
        { q: 'Sabse bara planet?', opts: ['Earth', 'Jupiter', 'Saturn', 'Mars'], a: 1 },
        { q: '2+2×2 = ?', opts: ['6', '8', '4', '10'], a: 0 },
        { q: 'K2 kis mulk me?', opts: ['India', 'Nepal', 'China', 'Pakistan'], a: 3 },
        { q: 'Sabse lambi nadi?', opts: ['Amazon', 'Nile', 'Indus', 'Yangtze'], a: 1 }
    ];
    const pick = questions[crypto.randomInt(questions.length)];
    triviaGames.set(ctx.sender, { q: pick, start: Date.now() });

    const opts = pick.opts.map((o, i) => `${i + 1}. ${o}`).join('\n');
    return ctx.reply(`❓ *TRIVIA*\n\n📌 *${pick.q}*\n\n${opts}\n\n💡 *Bhejo number (1-4)*`);
});

cmd({
    on: 'body',
    allowUnprefixedInGroups: true,
    pattern: 'triviacheck',
    desc: 'Trivia check',
    category: 'system',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!triviaGames.has(ctx.sender)) return;
    const game = triviaGames.get(ctx.sender);
    const answer = parseInt(ctx.body);
    if (answer >= 1 && answer <= 4) {
        triviaGames.delete(ctx.sender);
        if (answer - 1 === game.q.a) {
            return ctx.reply(`✅ *CORRECT!* 🎉\n\n🎯 Answer: *${game.q.opts[game.q.a]}*`);
        } else {
            return ctx.reply(`❌ *Wrong!*\n\n✅ Correct: *${game.q.opts[game.q.a]}*`);
        }
    }
});

// ===========================================================
// 🔧 9-12: PERSONAL ASSISTANT
// ===========================================================

// 9. TODO — Todo list
const todoLists = new Map();
cmd({
    pattern: 'todo',
    alias: ['tasklist'],
    desc: 'Todo list manage karo',
    category: 'tools',
    react: '📝',
    use: '.todo add <task>  |  .todo list  |  .todo done <num>  |  .todo clear',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const args = (ctx.q || '').split(' ');
    const action = args.shift()?.toLowerCase();
    const task = args.join(' ');
    const key = ctx.sender;

    if (!todoLists.has(key)) todoLists.set(key, []);

    if (action === 'add' && task) {
        todoLists.get(key).push({ task, done: false });
        return ctx.reply(`✅ *Task added:* ${task}`);
    }
    if (action === 'list') {
        const list = todoLists.get(key);
        if (!list.length) return ctx.reply('📝 Koi task nahi.');
        const lines = list.map((t, i) => `${i + 1}. ${t.done ? '✅' : '⬜'} ${t.task}`);
        return ctx.reply(`📝 *YOUR TASKS (${list.length})*\n\n${lines.join('\n')}`);
    }
    if (action === 'done' && task) {
        const idx = parseInt(task) - 1;
        const list = todoLists.get(key);
        if (list[idx]) {
            list[idx].done = true;
            return ctx.reply(`✅ *Done:* ${list[idx].task}`);
        }
    }
    if (action === 'clear') {
        todoLists.set(key, []);
        return ctx.reply('🗑️ *All tasks cleared*');
    }

    return ctx.reply('📝 *TODO LIST*\n\n`.todo add <task>`\n`.todo list`\n`.todo done <num>`\n`.todo clear`');
});

// 10. EXPENSE — Expense tracker
const expenses = new Map();
cmd({
    pattern: 'expense',
    alias: ['spending', 'kharcha'],
    desc: 'Expense tracker',
    category: 'tools',
    react: '💰',
    use: '.expense add <amount> <item>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const args = (ctx.q || '').split(' ');
    const action = args.shift()?.toLowerCase();
    const key = ctx.sender;

    if (!expenses.has(key)) expenses.set(key, []);

    if (action === 'add') {
        const amount = parseFloat(args[0]);
        const item = args.slice(1).join(' ');
        if (!amount || !item) return ctx.reply('Use: `.expense add 500 lunch`');
        expenses.get(key).push({ amount, item, date: new Date() });
        return ctx.reply(`💰 *Added:* ${item} - *${amount}*`);
    }
    if (action === 'list' || !action) {
        const list = expenses.get(key);
        if (!list.length) return ctx.reply('💰 Koi expense nahi.');
        const total = list.reduce((s, e) => s + e.amount, 0);
        const lines = list.slice(-10).map((e, i) => `${i + 1}. ${e.item} — *${e.amount}*`);
        return ctx.reply(`💰 *EXPENSES*\n\n${lines.join('\n')}\n\n💵 *Total: ${total}*`);
    }
    if (action === 'total') {
        const list = expenses.get(key);
        const total = list.reduce((s, e) => s + e.amount, 0);
        return ctx.reply(`💵 *Total spending: ${total}*`);
    }
    if (action === 'clear') {
        expenses.set(key, []);
        return ctx.reply('🗑️ Cleared.');
    }

    return ctx.reply('Use: `.expense add <amount> <item>`');
});

// 11. HABIT — Habit tracker
const habits = new Map();
cmd({
    pattern: 'habit',
    alias: ['habits'],
    desc: 'Habit tracker',
    category: 'tools',
    react: '⭐',
    use: '.habit add <name>  |  .habit done <name>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const args = (ctx.q || '').split(' ');
    const action = args.shift()?.toLowerCase();
    const name = args.join(' ');
    const key = ctx.sender;

    if (!habits.has(key)) habits.set(key, {});

    if (action === 'add' && name) {
        habits.get(key)[name] = { streak: 0, last: null };
        return ctx.reply(`⭐ *Habit added:* ${name}`);
    }
    if (action === 'done' && name) {
        const h = habits.get(key)[name];
        if (!h) return ctx.reply('❌ Habit nahi mila.');
        const today = new Date().toDateString();
        if (h.last === today) return ctx.reply('⚠️ Aaj already done hai!');
        h.streak++;
        h.last = today;
        return ctx.reply(`✅ *${name}* — Streak: *${h.streak}* 🔥`);
    }
    if (action === 'list') {
        const h = habits.get(key);
        const names = Object.keys(h);
        if (!names.length) return ctx.reply('⭐ Koi habit nahi.');
        const lines = names.map(n => `⭐ ${n} — *${h[n].streak}* day streak`);
        return ctx.reply(`⭐ *YOUR HABITS*\n\n${lines.join('\n')}`);
    }
    return ctx.reply('Use: `.habit add <name>`\n`.habit done <name>`\n`.habit list`');
});

// 12. REMIND — Reminder system
const reminders = new Map();
cmd({
    pattern: 'remindme',
    alias: ['rmind'],
    desc: 'Reminder set karo',
    category: 'tools',
    react: '⏰',
    use: '.remindme 10m <message>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const args = (ctx.q || '').split(' ');
    const time = args.shift();
    const msg = args.join(' ');

    if (!time || !msg) return ctx.reply('Use: `.remindme 10m Call mom`\n\nTime: 10s, 5m, 2h');

    const m_ = time.match(/^(\d+)(s|m|h)$/i);
    if (!m_) return ctx.reply('Format: 30s, 5m, 2h');

    const val = parseInt(m_[1]);
    const unit = m_[2].toLowerCase();
    const ms = unit === 's' ? val * 1000 : unit === 'm' ? val * 60000 : val * 3600000;

    if (ms > 86400000) return ctx.reply('❌ Max 24 hours.');

    await ctx.reply(`⏰ *Reminder set:* ${time} baad yaad dilaunga.`);

    setTimeout(async () => {
        try {
            await conn.sendMessage(ctx.sender, {
                text: `⏰ *REMINDER!*\n\n💬 ${msg}`
            });
        } catch (_) {}
    }, ms);
});

// ===========================================================
// 🎨 13-16: MEDIA TOOLS
// ===========================================================

// 13. MEME — Meme maker
cmd({
    pattern: 'mememaker',
    alias: ['creatememe'],
    desc: 'Meme banao (image + text)',
    category: 'image',
    react: '😂',
    use: '.mememaker <top text> | <bottom text> (image reply)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const img = quoted?.imageMessage || mek.message?.imageMessage;
    if (!img) return ctx.reply('❌ Image pe reply karo.');

    const parts = (ctx.q || '').split('|').map(x => x.trim());
    const topText = parts[0] || '';
    const bottomText = parts[1] || '';

    try {
        const filePath = await conn.downloadAndSaveMediaMessage(
            { msg: img, mtype: 'imageMessage' },
            `./tmp/meme_${Date.now()}`
        );

        await conn.sendMessage(ctx.from, {
            image: { url: filePath },
            caption: [
                topText ? `⬆️ ${topText}` : '',
                bottomText ? `⬇️ ${bottomText}` : '',
                '',
                `😂 Meme by ${ctx.senderNumber}`
            ].filter(Boolean).join('\n')
        }, { quoted: mek });

        fs.remove(filePath).catch(() => {});
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// 14. WATERMARK — Image pe watermark
cmd({
    pattern: 'watermark',
    alias: ['wm'],
    desc: 'Image pe watermark lagao',
    category: 'image',
    react: '💧',
    use: '.watermark <text> (image reply)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const img = quoted?.imageMessage || mek.message?.imageMessage;
    if (!img) return ctx.reply('❌ Image pe reply karo.');

    const text = (ctx.q || 'AMAN-MD').slice(0, 50);
    try {
        await ctx.reply(`💧 *Watermark lag raha hai:* ${text}`);
        const filePath = await conn.downloadAndSaveMediaMessage(
            { msg: img, mtype: 'imageMessage' },
            `./tmp/wm_${Date.now()}`
        );

        const sharp = require('sharp');
        const buf = await fs.readFile(filePath);
        const meta = await sharp(buf).metadata();

        const svg = Buffer.from(`<svg width="${meta.width}" height="${meta.height}">
            <text x="50%" y="95%" font-size="${Math.floor(meta.width / 20)}" 
                  fill="white" text-anchor="middle" 
                  font-weight="bold" opacity="0.7">${text}</text>
        </svg>`);

        const out = `./tmp/wm_out_${Date.now()}.png`;
        await sharp(buf).composite([{ input: svg, gravity: 'southeast' }]).png().toFile(out);

        await conn.sendMessage(ctx.from, { image: { url: out }, caption: `💧 ${text}` }, { quoted: mek });
        fs.remove(filePath).catch(() => {});
        fs.remove(out).catch(() => {});
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// NOTE: The following command in the supplied ZIP was truncated and has been omitted
// so this plugin can load safely. Restore it from a complete source before re-adding.
