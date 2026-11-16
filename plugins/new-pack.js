const { cmd } = require('../arslan');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');

// Premium removed — gate always passes
const {
    isOwner,
    isPremiumUser,
    requirePremium,
    cleanNumber
} = require('../lib/premium-check');

function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(2) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(2) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
}

function formatUptime(s) {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
}

// ===========================================================
// 1. STICKERPACK
// ===========================================================
cmd({
    pattern: 'stickerpack',
    alias: ['stkpack'],
    desc: 'Image/video se sticker pack banao',
    category: 'image',
    react: '📦',
    use: '.stickerpack <pack_name> (reply on image)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const img = quoted?.imageMessage || mek.message?.imageMessage;
    if (!img) return ctx.reply('❌ Image pe reply karo.');

    const packName = (ctx.q || config.BOT_NAME).slice(0, 30);
    try {
        await ctx.reply('📦 Sticker pack ban raha hai…');
        const filePath = await conn.downloadAndSaveMediaMessage({ msg: img, mtype: 'imageMessage' }, `./tmp/stkp_${Date.now()}`);
        const { Sticker, StickerTypes } = require('wa-sticker-formatter');
        const stk = new Sticker(filePath, {
            pack: packName,
            author: config.BOT_NAME || 'AMAN Mini Bot',
            type: StickerTypes.FULL,
            quality: 80
        });
        const buf = await stk.toBuffer();
        await conn.sendMessage(ctx.from, { sticker: buf }, { quoted: mek });
        await fs.remove(filePath).catch(() => {});
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 2. BLUR
// ===========================================================
cmd({
    pattern: 'blur',
    alias: ['blurimg'],
    desc: 'Image ko blur karo',
    category: 'image',
    react: '🌫️',
    use: '.blur (reply on image)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const img = quoted?.imageMessage || mek.message?.imageMessage;
    if (!img) return ctx.reply('❌ Image pe reply karo.');
    try {
        await ctx.reply('🌫️ Blur kar raha hun…');
        const filePath = await conn.downloadAndSaveMediaMessage({ msg: img, mtype: 'imageMessage' }, `./tmp/blur_${Date.now()}`);
        const sharp = require('sharp');
        const out = `./tmp/blurout_${Date.now()}.png`;
        await sharp(filePath).blur(15).png().toFile(out);
        await conn.sendMessage(ctx.from, { image: { url: out }, caption: '🌫️ Blurred' }, { quoted: mek });
        await fs.remove(filePath).catch(() => {});
        await fs.remove(out).catch(() => {});
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 3. SEPIA
// ===========================================================
cmd({
    pattern: 'sepia',
    alias: ['oldpic'],
    desc: 'Image ko sepia (purana look)',
    category: 'image',
    react: '🟤',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const img = quoted?.imageMessage || mek.message?.imageMessage;
    if (!img) return ctx.reply('❌ Image pe reply karo.');
    try {
        const filePath = await conn.downloadAndSaveMediaMessage({ msg: img, mtype: 'imageMessage' }, `./tmp/sepia_${Date.now()}`);
        const sharp = require('sharp');
        const out = `./tmp/sepiaout_${Date.now()}.png`;
        await sharp(filePath).modulate({ saturation: 0.5 }).tint({ r: 112, g: 66, b: 20 }).png().toFile(out);
        await conn.sendMessage(ctx.from, { image: { url: out }, caption: '🟤 Sepia' }, { quoted: mek });
        await fs.remove(filePath).catch(() => {});
        await fs.remove(out).catch(() => {});
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 4. FLIP
// ===========================================================
cmd({
    pattern: 'flip',
    alias: ['mirror'],
    desc: 'Image ko hoamanntal/vertical flip',
    category: 'image',
    react: '🔄',
    use: '.flip h  OR  .flip v',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const img = quoted?.imageMessage || mek.message?.imageMessage;
    if (!img) return ctx.reply('❌ Image pe reply karo.');
    const mode = (ctx.q || 'h').trim().toLowerCase();
    try {
        const filePath = await conn.downloadAndSaveMediaMessage({ msg: img, mtype: 'imageMessage' }, `./tmp/flip_${Date.now()}`);
        const sharp = require('sharp');
        const out = `./tmp/flipout_${Date.now()}.png`;
        let pipeline = sharp(filePath);
        if (mode === 'v') pipeline = pipeline.flip();
        else pipeline = pipeline.flop();
        await pipeline.png().toFile(out);
        await conn.sendMessage(ctx.from, { image: { url: out }, caption: `🔄 Flipped (${mode})` }, { quoted: mek });
        await fs.remove(filePath).catch(() => {});
        await fs.remove(out).catch(() => {});
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 5. EMOJIMIX
// ===========================================================
cmd({
    pattern: 'emojimix',
    alias: ['mix'],
    desc: 'Do emojis ko mix karke sticker banao',
    category: 'image',
    react: '🎭',
    use: '.emojimix 😀+😎',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const input = (ctx.q || '').replace(/\s/g, '');
    const parts = input.split('+');
    if (parts.length !== 2) return ctx.reply('Use: *.emojimix 😀+😎*');
    try {
        const url = `https://tenor.googleapis.com/v2/featured?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${encodeURIComponent(parts[0])}_${encodeURIComponent(parts[1])}`;
        const r = await axios.get(url, { timeout: 10000 });
        if (!r.data?.results?.length) return ctx.reply('❌ Ye combination support nahi.');
        const imgUrl = r.data.results[0].url;
        await conn.sendMessage(ctx.from, { image: { url: imgUrl }, caption: '🎭 EmojiMix' }, { quoted: mek });
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// (antidelete ab plugins/anti-delete.js mein hai)

// ===========================================================
// 7. TAGME
// ===========================================================
cmd({
    pattern: 'tagme',
    alias: ['mention'],
    desc: 'Khud ko tag karo',
    category: 'fun',
    react: '📣',
    use: '.tagme <message>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const text = (ctx.q || '👋 Hello!') + ` @${ctx.senderNumber}`;
    await conn.sendMessage(ctx.from, { text, mentions: [ctx.sender] }, { quoted: mek });
});

// ===========================================================
// 8. BOTSTATS
// ===========================================================
cmd({
    pattern: 'botstats',
    alias: ['bstats', 'usage'],
    desc: 'Bot ke usage stats dekho',
    category: 'owner',
    react: '📊',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');
    const { getStatsForNumber } = require('../lib/database');
    const num = conn.user.id.split(':')[0];
    try {
        const stats = await getStatsForNumber(num);
        if (!stats.length) return ctx.reply('❌ Koi stats nahi mile.');
        const lines = stats.slice(0, 10).map(s =>
            `📅 ${s.date}\n  💬 Msgs: ${s.messagesReceived} | ⚡ Cmds: ${s.commandsUsed}`
        );
        return ctx.reply(`📊 *Bot Stats (${num})*\n\n` + lines.join('\n'));
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 9. RANDOM PICK
// ===========================================================
cmd({
    pattern: 'random',
    alias: ['pickrandom'],
    desc: 'Comma-separated list me se random pick',
    category: 'fun',
    react: '🎲',
    use: '.random chai,coffee,juice',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const list = (ctx.q || '').split(',').map(x => x.trim()).filter(Boolean);
    if (list.length < 2) return ctx.reply('Use: *.random a,b,c*');
    const pick = list[crypto.randomInt(list.length)];
    return ctx.reply(`🎲 *Random pick:* ${pick}`);
});

// ===========================================================
// 10. NICKNAME
// ===========================================================
cmd({
    pattern: 'nickname',
    alias: ['nick'],
    desc: 'Kisi ko nickname do',
    category: 'fun',
    react: '📝',
    use: '.nickname @user <name>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned[0]) return ctx.reply('❌ Kisi ko mention karo.');
    const name = (ctx.q || '').replace(/@\d+/g, '').trim() || 'Best Friend';
    const nicknames = ['👑 King', '🔥 Star', '⚡ Legend', '😎 Boss', '🌟 Hero'];
    const tag = nicknames[crypto.randomInt(nicknames.length)];
    await conn.sendMessage(ctx.from, {
        text: `📝 @${mentioned[0].split('@')[0]} ka naya naam: *${name}* ${tag}`,
        mentions: mentioned
    }, { quoted: mek });
});

// ===========================================================
// 11. AGE
// ===========================================================
cmd({
    pattern: 'age',
    alias: ['ageguess'],
    desc: 'Random age guess',
    category: 'fun',
    react: '🎂',
    use: '.age @user',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const age = crypto.randomInt(15, 60);
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned[0]) {
        await conn.sendMessage(ctx.from, {
            text: `🎂 @${mentioned[0].split('@')[0]} ki age: *${age}* saal`,
            mentions: mentioned
        }, { quoted: mek });
    } else {
        return ctx.reply(`🎂 Meri guess: *${age}* saal`);
    }
});

// ===========================================================
// 12. HOWGAY
// ===========================================================
cmd({
    pattern: 'howgay',
    alias: ['gaymeter'],
    desc: 'Fun meter (mazak)',
    category: 'fun',
    react: '🌈',
    use: '.howgay @user',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const pct = crypto.randomInt(0, 101);
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] ? `@${mentioned[0].split('@')[0]}` : 'Aap';
    const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
    await conn.sendMessage(ctx.from, {
        text: `🌈 *HowGay Meter*\n\n${target}\n${bar} *${pct}%*`,
        mentions: mentioned
    }, { quoted: mek });
});

// ===========================================================
// 13. ROAST
// ===========================================================
cmd({
    pattern: 'roast',
    alias: ['burn'],
    desc: 'Random roast',
    category: 'fun',
    react: '🔥',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const roasts = [
        'Tumhari shakal dekhi to mirror ne complaint file kar di 😂',
        'Tumhari intelligence Google bhi search nahi kar sakta 🔍',
        'Tum WhatsApp pe ho? Mujhe laga WhatsApp tum se pareshan hai 📱',
        'Tumhari photo dekhi, phone ne khud ko reboot kar liya 💀',
        'Tum ho ya WhatsApp ka bug? 🐛'
    ];
    return ctx.reply(`🔥 ${roasts[crypto.randomInt(roasts.length)]}`);
});

// ===========================================================
// 14. COMPLIMENT
// ===========================================================
cmd({
    pattern: 'compliment',
    alias: ['tarif'],
    desc: 'Kisi ko compliment do',
    category: 'fun',
    react: '💐',
    use: '.compliment @user',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const list = [
        'Tum bahut acha insaan ho 🌟',
        'Tumhari smile sabko roshan karti hai 😊',
        'Tumhari baatein sun ke din ban jata hai ✨',
        'Tum waqai talented ho 🎯',
        'Tum jaisa koi nahi 💫'
    ];
    const pick = list[crypto.randomInt(list.length)];
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned[0]) {
        await conn.sendMessage(ctx.from, {
            text: `💐 @${mentioned[0].split('@')[0]} — ${pick}`,
            mentions: mentioned
        }, { quoted: mek });
    } else {
        return ctx.reply(`💐 ${pick}`);
    }
});

// ===========================================================
// 15. PINGS
// ===========================================================
cmd({
    pattern: 'pings',
    alias: ['latency'],
    desc: 'Detailed ping',
    category: 'general',
    react: '📡',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const t1 = Date.now();
    await ctx.reply('📡 Checking…');
    const t2 = Date.now();
    const mem = process.memoryUsage();
    return ctx.reply([
        '📡 *Ping Details*',
        '',
        `⚡ Latency: *${t2 - t1}ms*`,
        `⏱️ Uptime: *${formatUptime(process.uptime())}*`,
        `💾 RAM: *${formatBytes(mem.rss)}*`,
        `🌐 Node: *${process.version}*`,
        `📱 Active sockets: *${global.activeSockets?.size || 0}*`
    ].join('\n'));
});

// ===========================================================
// 16. WHOIS
// ===========================================================
cmd({
    pattern: 'whois',
    alias: ['profile'],
    desc: 'Kisi user ki info dekho',
    category: 'general',
    react: '👤',
    use: '.whois @user',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || mek.message?.extendedTextMessage?.contextInfo?.participant || ctx.sender;
    const num = target.split('@')[0];
    const [status] = await conn.fetchStatus(target).catch(() => [{}]);
    let pp = '';
    try { pp = await conn.profilePictureUrl(target, 'image'); } catch {}

    const text = [
        '👤 *User Info*',
        '',
        `📱 Number: *+${num}*`,
        `💬 About: *${status?.status || 'N/A'}*`,
        `🖼️ PP: *${pp ? 'Available' : 'Hidden'}*`
    ].join('\n');
    if (pp) await conn.sendMessage(ctx.from, { image: { url: pp }, caption: text }, { quoted: mek });
    else await ctx.reply(text);
});

// ===========================================================
// 17. SLOGAN
// ===========================================================
cmd({
    pattern: 'slogan',
    alias: ['tagline'],
    desc: 'Random WhatsApp slogan',
    category: 'fun',
    react: '💬',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const list = [
        'Always online, always ready! ⚡',
        'Connecting hearts since 2024 💗',
        'Your message, my priority 📬',
        'Fast, secure, reliable 🔐',
        'Making conversations easier 💬'
    ];
    return ctx.reply(`💬 ${list[crypto.randomInt(list.length)]}`);
});

// ===========================================================
// 18. NAMAZ
// ===========================================================
cmd({
    pattern: 'namaz',
    alias: ['prayer', 'salah'],
    desc: 'Namaz ke auqaat (city)',
    category: 'islamic',
    react: '🕌',
    use: '.namaz Lahore',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const city = (ctx.q || 'Karachi').trim();
    try {
        const r = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=Pakistan&method=1`, { timeout: 10000 });
        const t = r.data.data.timings;
        return ctx.reply([
            `🕌 *Namaz Timings — ${city}*`,
            '',
            `🌅 Fajr: *${t.Fajr}*`,
            `🌄 Dhuhr: *${t.Dhuhr}*`,
            `🌇 Asr: *${t.Asr}*`,
            `🌆 Maghrib: *${t.Maghrib}*`,
            `🌙 Isha: *${t.Isha}*`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Timings fetch fail.'); }
});

// ===========================================================
// 19. DUA
// ===========================================================
cmd({
    pattern: 'dua',
    alias: ['duain'],
    desc: 'Random Islamic dua',
    category: 'islamic',
    react: '🤲',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const duas = [
        '🤲 *Dua for knowledge:*\nرَبِّ زِدْنِي عِلْمًا\n"Rabbi zidni ilma"',
        '🤲 *Dua for protection:*\nبِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ',
        '🤲 *Morning dua:*\nاللَّهُمَّ بِكَ أَصْبَحْنَا',
        '🤲 *Dua for rizq:*\nاللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ'
    ];
    return ctx.reply(duas[crypto.randomInt(duas.length)]);
});

// ===========================================================
// 20. LIVESCORE
// ===========================================================
cmd({
    pattern: 'livescore',
    alias: ['score', 'cricket'],
    desc: 'Live cricket score (best effort)',
    category: 'fun',
    react: '🏏',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    return ctx.reply('🏏 Live score API ke bina nahi mil sakti. Ye command demo hai.\n\n💡 Tip: *".score"* ke liye koi free API add karo.');
});