const { cmd } = require('../arslan');
const config = require('../config');

// Premium removed — gate always passes
const {
    requirePremium,
    isOwner,
    isPremiumUser,
    cleanNumber
} = require('../lib/premium-check');

// ===========================================================
// 1. CHANNELSTATUS — Channel pe text/image status
// ===========================================================
cmd({
    pattern: 'channelstatus',
    alias: ['chstatus', 'chstat', 'statusupdate'],
    desc: 'Premium/Owner: Channel pe 24hr temporary status post karo',
    category: 'tools',
    react: '📢',
    use: '.channelstatus <channel_jid> <text>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    // ✅ Universal premium check (owner bypass auto)
    if (!(await requirePremium(ctx))) return;

    const parts = (ctx.q || '').split(' ');
    const channelJid = parts.shift();
    const text = parts.join(' ');

    if (!channelJid || (!text && !mek.message?.imageMessage)) {
        return ctx.reply(
            '📢 *Channel Status Post*\n\n' +
            'Use: `.channelstatus <channel_jid> <text>`\n' +
            'Ya: Image pe reply karke `.channelstatus <channel_jid>`\n\n' +
            'Example:\n' +
            '`.channelstatus 0029Vb...@newsletter New update!`'
        );
    }

    try {
        const jid = channelJid.endsWith('@newsletter') ? channelJid : `${channelJid}@newsletter`;
        const imgMsg = mek.message?.imageMessage;

        if (imgMsg) {
            const filePath = await conn.downloadAndSaveMediaMessage(
                { msg: imgMsg, mtype: 'imageMessage' },
                `./tmp/chstat_${Date.now()}`
            );
            await conn.sendMessage(jid, {
                image: { url: filePath },
                caption: text || '📢 Channel Update'
            });
        } else {
            await conn.sendMessage(jid, { text });
        }

        return ctx.reply(`✅ Channel pe status post ho gaya!\n\n📌 ${jid}\n💬 ${text || '(image)'}`);
    } catch (e) {
        return ctx.reply('❌ Channel status post fail: ' + e.message);
    }
});

// ===========================================================
// 2. CHSTATIMG — Image status
// ===========================================================
cmd({
    pattern: 'chstatimg',
    alias: ['chstatusimg', 'chstatpic'],
    desc: 'Premium/Owner: Channel pe image status post karo',
    category: 'tools',
    react: '🖼️',
    use: '.chstatimg <channel_jid> (image reply)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await requirePremium(ctx))) return;

    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = quoted?.imageMessage || mek.message?.imageMessage;
    if (!imgMsg) return ctx.reply('❌ Image pe reply karo.');

    const channelJid = (ctx.args[0] || '').trim();
    if (!channelJid) return ctx.reply('❌ Channel JID do.\nExample: `.chstatimg 0029Vb...@newsletter`');

    try {
        const jid = channelJid.endsWith('@newsletter') ? channelJid : `${channelJid}@newsletter`;
        const caption = (ctx.args.slice(1).join(' ') || '📢 Channel Update').trim();

        const filePath = await conn.downloadAndSaveMediaMessage(
            { msg: imgMsg, mtype: 'imageMessage' },
            `./tmp/chstatimg_${Date.now()}`
        );
        await conn.sendMessage(jid, { image: { url: filePath }, caption });
        return ctx.reply(`✅ Image status post ho gaya!\n📌 ${jid}`);
    } catch (e) {
        return ctx.reply('❌ ' + e.message);
    }
});

// ===========================================================
// 3. CHSTATVID — Video status
// ===========================================================
cmd({
    pattern: 'chstatvid',
    alias: ['chstatusvideo', 'chstatvideo'],
    desc: 'Premium/Owner: Channel pe video status post karo',
    category: 'tools',
    react: '🎥',
    use: '.chstatvid <channel_jid> (video reply)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await requirePremium(ctx))) return;

    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const vidMsg = quoted?.videoMessage || mek.message?.videoMessage;
    if (!vidMsg) return ctx.reply('❌ Video pe reply karo.');

    const channelJid = (ctx.args[0] || '').trim();
    if (!channelJid) return ctx.reply('❌ Channel JID do.');

    try {
        const jid = channelJid.endsWith('@newsletter') ? channelJid : `${channelJid}@newsletter`;
        const caption = (ctx.args.slice(1).join(' ') || '📢 Channel Update').trim();

        const filePath = await conn.downloadAndSaveMediaMessage(
            { msg: vidMsg, mtype: 'videoMessage' },
            `./tmp/chstatvid_${Date.now()}`
        );
        await conn.sendMessage(jid, { video: { url: filePath }, caption });
        return ctx.reply(`✅ Video status post ho gaya!\n📌 ${jid}`);
    } catch (e) {
        return ctx.reply('❌ ' + e.message);
    }
});

// ===========================================================
// 4. CHSTATSTICKER — Sticker post
// ===========================================================
cmd({
    pattern: 'chstatsticker',
    alias: ['stickerstatus', 'chstatstk'],
    desc: 'Premium/Owner: Sticker channel pe post karo',
    category: 'tools',
    react: '🎨',
    use: '.chstatsticker <channel_jid> (image reply)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await requirePremium(ctx))) return;

    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = quoted?.imageMessage || mek.message?.imageMessage;
    if (!imgMsg) return ctx.reply('❌ Image pe reply karo.');

    const channelJid = (ctx.args[0] || '').trim();
    if (!channelJid) return ctx.reply('❌ Channel JID do.');

    try {
        const jid = channelJid.endsWith('@newsletter') ? channelJid : `${channelJid}@newsletter`;
        const filePath = await conn.downloadAndSaveMediaMessage(
            { msg: imgMsg, mtype: 'imageMessage' },
            `./tmp/stk_${Date.now()}`
        );
        const { Sticker, StickerTypes } = require('wa-sticker-formatter');
        const sticker = new Sticker(filePath, {
            pack: config.BOT_NAME,
            author: '𝗔𝗠𝗔𝗡-𝐌𝐃',
            type: StickerTypes.FULL,
            quality: 80
        });
        const buffer = await sticker.toBuffer();
        await conn.sendMessage(jid, { sticker: buffer });
        return ctx.reply(`✅ Sticker post!\n📌 ${jid}`);
    } catch (e) {
        return ctx.reply('❌ ' + e.message);
    }
});

// ===========================================================
// 5. CHSTATREMIND — Expiry reminder
// ===========================================================
cmd({
    pattern: 'chstatremind',
    alias: ['statusremind'],
    desc: 'Premium/Owner: Status expiry reminder set karo',
    category: 'tools',
    react: '⏰',
    use: '.chstatremind <channel_jid> <hours>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await requirePremium(ctx))) return;

    const args = ctx.args || [];
    const channelJid = args[0];
    const hours = parseFloat(args[1]) || 24;

    if (!channelJid) return ctx.reply('Use: `.chstatremind <channel_jid> <hours>`');
    if (hours > 48) return ctx.reply('❌ Max 48 hours.');

    const ms = hours * 3600 * 1000;
    const sender = cleanNumber(ctx.senderNumber);

    await ctx.reply(`⏰ Reminder set!\n📌 ${channelJid}\n⏱️ ${hours} hours baad yaad dilaunga.`);

    setTimeout(async () => {
        try {
            await conn.sendMessage(sender + '@s.whatsapp.net', {
                text: `⏰ *Status Expiry Reminder*\n\n📌 ${channelJid}\nStatus ${hours}hr me expire ho gaya hai.\nNaya status post karo!`
            });
        } catch (e) {
            console.error('remind failed:', e.message);
        }
    }, ms);
});

// ===========================================================
// 6. CHSTATFORWARD — Post ko group me forward
// ===========================================================
cmd({
    pattern: 'chstatforward',
    alias: ['chforward'],
    desc: 'Premium/Owner: Channel post ko group me forward',
    category: 'tools',
    react: '↗️',
    use: '.chstatforward <group_jid> (channel post pe reply)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await requirePremium(ctx))) return;

    const groupJid = (ctx.args[0] || '').trim();
    if (!groupJid) return ctx.reply('Use: `.chstatforward <group_jid>`');

    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return ctx.reply('❌ Channel post pe reply karo.');

    try {
        await conn.sendMessage(groupJid, {
            forward: {
                key: mek.message.extendedTextMessage.contextInfo.stanzaId,
                message: quoted
            }
        });
        return ctx.reply(`✅ Post forward ho gaya!\n📌 → ${groupJid}`);
    } catch (e) {
        return ctx.reply('❌ ' + e.message);
    }
});

// ===========================================================
// 7. CHSTATREACT — Custom emoji reaction
// ===========================================================
cmd({
    pattern: 'chstatreact',
    alias: ['chreactstatus'],
    desc: 'Premium/Owner: Channel status pe custom reaction',
    category: 'tools',
    react: '💫',
    use: '.chstatreact <channel_jid> <serverId> <emoji>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await requirePremium(ctx))) return;

    const args = ctx.args || [];
    const channelJid = args[0];
    const serverId = args[1];
    const emoji = args[2] || '🔥';

    if (!channelJid || !serverId) {
        return ctx.reply('Use: `.chstatreact <channel_jid> <serverId> <emoji>`');
    }

    try {
        const jid = channelJid.endsWith('@newsletter') ? channelJid : `${channelJid}@newsletter`;
        await conn.newsletterReactMessage(jid, serverId, emoji);
        return ctx.reply(`✅ Reaction *${emoji}* bheji gayi!\n📌 ${jid}/${serverId}`);
    } catch (e) {
        return ctx.reply('❌ ' + e.message);
    }
});

// ===========================================================
// 8. CHSTATBULK — Bulk status post multiple channels
// ===========================================================
cmd({
    pattern: 'chstatbulk',
    alias: ['bulkstatus'],
    desc: 'Premium/Owner: Ek hi text multiple channels pe',
    category: 'tools',
    react: '📣',
    use: '.chstatbulk <jid1,jid2,jid3> <text>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await requirePremium(ctx))) return;

    const parts = (ctx.q || '').split(' ');
    const jids = (parts.shift() || '').split(',').map(j => j.trim()).filter(Boolean);
    const text = parts.join(' ');

    if (!jids.length || !text) return ctx.reply('Use: `.chstatbulk <jid1,jid2> <text>`');

    let success = 0, failed = 0;
    for (const cj of jids) {
        try {
            const jid = cj.endsWith('@newsletter') ? cj : `${cj}@newsletter`;
            await conn.sendMessage(jid, { text });
            success++;
            await new Promise(r => setTimeout(r, 1000));
        } catch { failed++; }
    }

    return ctx.reply(`✅ *Bulk Status*\n\n📤 Success: *${success}*\n❌ Failed: *${failed}*`);
});

// ===========================================================
// 9. CHANNELINFO — Channel info (free — sab users)
// ===========================================================
cmd({
    pattern: 'channelinfo',
    alias: ['chinfo', 'chstatcheck'],
    desc: 'Channel ki info aur status feature check',
    category: 'general',
    react: '📊',
    use: '.channelinfo <channel_jid>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const channelJid = (ctx.args[0] || '').trim();
    if (!channelJid) return ctx.reply('❌ Channel JID do.\nExample: `.channelinfo 0029Vb...@newsletter`');

    try {
        const jid = channelJid.endsWith('@newsletter') ? channelJid : `${channelJid}@newsletter`;

        let metadata = null;
        if (typeof conn.newsletterMetadata === 'function') {
            metadata = await conn.newsletterMetadata('jid', jid).catch(() => null);
        }

        return ctx.reply([
            '📊 *CHANNEL INFO*',
            '',
            `🆔 JID: \`${jid}\``,
            `📛 Name: *${metadata?.name || 'N/A'}*`,
            `👥 Subscribers: *${metadata?.subscribers || 'N/A'}*`,
            `📝 Desc: *${(metadata?.description || 'N/A').slice(0, 100)}*`,
            '',
            '💡 *Channel Status* WhatsApp feature hai jo 24hr temporary updates allow karta hai.',
            `✅ Ye bot usse use karta hai \`${config.PREFIX}channelstatus\` command se.`
        ].join('\n'));
    } catch (e) {
        return ctx.reply('❌ Channel info fail: ' + e.message);
    }
});