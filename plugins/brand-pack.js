const { cmd } = require('../arslan');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

// ✅ Sirf import — baaki sab premium-check.js me hai
const { requirePremium, isOwner, isPremiumUser } = require('../lib/premium-check');

// ===========================================================
// 1. SETPP — Bot ki display pic change
// ===========================================================
cmd({
    pattern: 'setpp',
    alias: ['setdp', 'botpic', 'setprofile', 'setbotpp'],
    desc: 'Premium/Owner: Bot ki profile pic change karo',
    category: 'tools',
    react: '🖼️',
    use: '.setpp (image reply karke)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    // ✅ Premium check (owner auto bypass)
    if (!(await requirePremium(ctx))) return;

    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = quoted?.imageMessage || mek.message?.imageMessage;

    if (!imgMsg) {
        return ctx.reply('❌ Kisi image pe reply karo ya image ke saath *.setpp* likho.');
    }

    try {
        await ctx.reply('⏳ Bot ki profile pic update kar raha hun…');
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(imgMsg, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        await conn.updateProfilePicture(conn.user.id, buffer);
        return ctx.reply('✅ *Bot ki display pic update ho gayi!* 🔥');
    } catch (e) {
        console.error('setpp error:', e.message);
        return ctx.reply('❌ PP update fail: ' + e.message);
    }
});

// ===========================================================
// 2. REMOVEPP
// ===========================================================
cmd({
    pattern: 'removepp',
    alias: ['delpp', 'cleardp', 'removebotpp'],
    desc: 'Premium/Owner: Bot ki profile pic hatao',
    category: 'tools',
    react: '🗑️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await requirePremium(ctx))) return;

    try {
        await conn.removeProfilePicture(conn.user.id);
        return ctx.reply('✅ *Bot ki PP remove ho gayi.*');
    } catch (e) {
        return ctx.reply('❌ ' + e.message);
    }
});

// ===========================================================
// 3. SETBOTNAME
// ===========================================================
cmd({
    pattern: 'setbotname',
    alias: ['botname', 'setwa', 'renamebot'],
    desc: 'Premium/Owner: Bot ka WhatsApp naam change karo',
    category: 'tools',
    react: '✏️',
    use: '.setbotname 𝗔𝗠𝗔𝗡-𝐌𝐃 V2',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await requirePremium(ctx))) return;

    const name = (ctx.q || '').trim();
    if (!name || name.length > 25) {
        return ctx.reply('❌ Naam 1-25 characters ka do.\nUse: *.setbotname <name>*');
    }

    try {
        await conn.updateProfileName(name);
        config.BOT_NAME = name;
        return ctx.reply(`✅ *Bot ka naam update ho gaya:* ${name}`);
    } catch (e) {
        return ctx.reply('❌ ' + e.message);
    }
});

// ===========================================================
// 4. SETSTATUS
// ===========================================================
cmd({
    pattern: 'setstatus',
    alias: ['botstatus', 'setabout'],
    desc: 'Premium/Owner: Bot ka about/status change karo',
    category: 'tools',
    react: '💬',
    use: '.setstatus Available 24/7',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await requirePremium(ctx))) return;

    const text = (ctx.q || '').trim();
    if (!text || text.length > 139) {
        return ctx.reply('❌ Status 1-139 characters ka do.');
    }

    try {
        await conn.updateProfileStatus(text);
        return ctx.reply(`✅ *Bot ka status update:* ${text}`);
    } catch (e) {
        return ctx.reply('❌ ' + e.message);
    }
});

// ===========================================================
// 5. BOTINFO
// ===========================================================
cmd({
    pattern: 'botinfo',
    alias: ['aboutbot', 'mybot', 'botprofile'],
    desc: 'Bot ki poori info dekho',
    category: 'general',
    react: '🤖',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    let pp = '';
    try { pp = await conn.profilePictureUrl(conn.user.id, 'image'); } catch {}

    const [status] = await conn.fetchStatus(conn.user.id).catch(() => [{}]);

    const text = [
        `🤖 *${config.BOT_NAME || 'AMAN Mini Bot'} BOT INFO*`,
        '',
        `📛 Name: *${config.BOT_NAME}*`,
        `👑 Owner: *Private*`,
        `🔧 Prefix: *${config.PREFIX}*`,
        `⚙️ Mode: *${config.WORK_TYPE || 'public'}*`,
        `💬 About: *${status?.status || 'N/A'}*`,
        `🖼️ PP: *${pp ? 'Available' : 'Hidden'}*`,
        '',
        `📢 Channel: ${config.CHANNEL_LINK}`,
        `© Powered by ${config.BOT_NAME || 'AMAN Mini Bot'}`
    ].join('\n');

    if (pp) {
        await conn.sendMessage(ctx.from, { image: { url: pp }, caption: text }, { quoted: mek });
    } else {
        await ctx.reply(text);
    }
});

// ===========================================================
// 6. SETALL — Ek saath sab
// ===========================================================
cmd({
    pattern: 'setall',
    alias: ['setbotall', 'botbrand'],
    desc: 'Premium/Owner: DP + Name + Status ek saath',
    category: 'tools',
    react: '⚡',
    use: '.setall Name | Status | (image reply)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await requirePremium(ctx))) return;

    const parts = (ctx.q || '').split('|').map(x => x.trim());
    const name = parts[0] || '';
    const status = parts[1] || '';
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = quoted?.imageMessage || mek.message?.imageMessage;

    if (!name && !status && !imgMsg) {
        return ctx.reply(
            '❌ Kuch bhi set karne ke liye do.\n\n' +
            '*Examples:*\n' +
            '• `.setall 𝗔𝗠𝗔𝗡-𝐌𝐃 V2 | Online 24/7 |`\n' +
            '• `.setall | |` (sirf image reply ke saath)'
        );
    }

    let results = [];
    await ctx.reply('⚡ Bot branding update kar raha hun…');

    if (imgMsg) {
        try {
            const filePath = await conn.downloadAndSaveMediaMessage(
                { msg: imgMsg, mtype: 'imageMessage' },
                `./tmp/allpp_${Date.now()}`
            );
            await conn.updateProfilePicture(conn.user.id, { url: filePath });
            await fs.remove(filePath).catch(() => {});
            results.push('✅ DP updated');
        } catch (e) { results.push('❌ DP fail: ' + e.message); }
    }

    if (name && name.length <= 25) {
        try {
            await conn.updateProfileName(name);
            results.push(`✅ Naam: ${name}`);
        } catch (e) { results.push('❌ Naam fail: ' + e.message); }
    }

    if (status && status.length <= 139) {
        try {
            await conn.updateProfileStatus(status);
            results.push(`✅ Status: ${status}`);
        } catch (e) { results.push('❌ Status fail: ' + e.message); }
    }

    return ctx.reply(`⚡ *BRANDING UPDATE*\n\n${results.join('\n')}`);
});