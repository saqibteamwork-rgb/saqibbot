const { cmd } = require('../arslan');
const config = require('../config');
const crypto = require('crypto');

function cleanNumber(value) {
    let n = String(value || '').replace(/\D/g, '');
    if (n.startsWith('0')) n = `${config.DEFAULT_COUNTRY_CODE}${n.slice(1)}`;
    return n;
}

// ===========================================================
// 🆕 Auto-React Engine — Channel status pe auto emoji
// ===========================================================
const AUTO_REACT_EMOJIS = ['🔥', '❤️', '😍', '🥳', '💯', '✨', '👏', '💫'];
const activeAutoReact = new Map();

async function startAutoReact(conn, channelJid, intervalSec = 300) {
    if (activeAutoReact.has(channelJid)) {
        clearInterval(activeAutoReact.get(channelJid));
    }
    const interval = setInterval(async () => {
        try {
            const emoji = AUTO_REACT_EMOJIS[crypto.randomInt(AUTO_REACT_EMOJIS.length)];
            if (typeof conn.newsletterReactMessage === 'function') {
                await conn.newsletterReactMessage(channelJid, 'latest', emoji).catch(() => {});
            }
        } catch (e) {
            console.error('AutoReact error:', e.message);
        }
    }, intervalSec * 1000);
    activeAutoReact.set(channelJid, interval);
    return interval;
}

// ===========================================================
// 1. CHANNELSTATUS — Text/Image status
// ===========================================================
cmd({
    pattern: 'channelstatus',
    alias: ['chstatus', 'chstat'],
    desc: 'Channel pe 24hr temporary status post karo',
    category: 'tools',    // 🆕 sab users
    react: '📢',
    use: '.channelstatus <channel_jid> <text>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const parts = (ctx.q || '').split(' ');
    const channelJid = parts.shift();
    const text = parts.join(' ');
    const imgMsg = mek.message?.imageMessage;

    if (!channelJid || (!text && !imgMsg)) {
        return ctx.reply('📢 Use: `.channelstatus <channel_jid> <text>`\nYa image reply karke.');
    }

    try {
        const jid = channelJid.endsWith('@newsletter') ? channelJid : `${channelJid}@newsletter`;
        if (imgMsg) {
            const filePath = await conn.downloadAndSaveMediaMessage(
                { msg: imgMsg, mtype: 'imageMessage' },
                `./tmp/chstat_${Date.now()}`
            );
            await conn.sendMessage(jid, { image: { url: filePath }, caption: text || '📢 Update' });
        } else {
            await conn.sendMessage(jid, { text });
        }
        return ctx.reply(`✅ Channel status post ho gaya!\n📌 ${jid}`);
    } catch (e) {
        return ctx.reply('❌ ' + e.message);
    }
});

// ===========================================================
// 2. CHSTATIMG — Image status
// ===========================================================
cmd({
    pattern: 'chstatimg',
    alias: ['chstatusimg'],
    desc: 'Image channel status post karo',
    category: 'tools',
    react: '🖼️',
    use: '.chstatimg <channel_jid> (image reply)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = quoted?.imageMessage || mek.message?.imageMessage;
    if (!imgMsg) return ctx.reply('❌ Image pe reply karo.');

    const channelJid = (ctx.args[0] || '').trim();
    if (!channelJid) return ctx.reply('❌ Channel JID do.');

    try {
        const jid = channelJid.endsWith('@newsletter') ? channelJid : `${channelJid}@newsletter`;
        const caption = (ctx.args.slice(1).join(' ') || '📢 Update').trim();
        const filePath = await conn.downloadAndSaveMediaMessage(
            { msg: imgMsg, mtype: 'imageMessage' },
            `./tmp/chstatimg_${Date.now()}`
        );
        await conn.sendMessage(jid, { image: { url: filePath }, caption });
        return ctx.reply(`✅ Image status post!\n📌 ${jid}`);
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 3. CHSTATVID — Video status
// ===========================================================
cmd({
    pattern: 'chstatvid',
    alias: ['chstatusvid'],
    desc: 'Video channel status post karo',
    category: 'tools',
    react: '🎥',
    use: '.chstatvid <channel_jid> (video reply)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const vidMsg = quoted?.videoMessage || mek.message?.videoMessage;
    if (!vidMsg) return ctx.reply('❌ Video pe reply karo.');

    const channelJid = (ctx.args[0] || '').trim();
    if (!channelJid) return ctx.reply('❌ Channel JID do.');

    try {
        const jid = channelJid.endsWith('@newsletter') ? channelJid : `${channelJid}@newsletter`;
        const caption = (ctx.args.slice(1).join(' ') || '📢 Update').trim();
        const filePath = await conn.downloadAndSaveMediaMessage(
            { msg: vidMsg, mtype: 'videoMessage' },
            `./tmp/chstatvid_${Date.now()}`
        );
        await conn.sendMessage(jid, { video: { url: filePath }, caption });
        return ctx.reply(`✅ Video status post!\n📌 ${jid}`);
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 4. CHSTATAUTO — Random Islamic/Motivational status
// ===========================================================
cmd({
    pattern: 'chstatauto',
    alias: ['autostatus'],
    desc: 'Random status channel pe post karo',
    category: 'tools',
    react: '🎲',
    use: '.chstatauto <channel_jid>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const channelJid = (ctx.args[0] || '').trim();
    if (!channelJid) return ctx.reply('❌ Channel JID do.');

    const statuses = [
        '🤲 Ya Allah, make this day better than yesterday.',
        '🌙 "Verily, with hardship comes ease." — Quran 94:6',
        '📿 SubhanAllahi wa bihamdihi, SubhanAllahil Azeem.',
        '💫 The best among you are those who learn Quran and teach it.',
        '✨ Whoever fears Allah — He will make a way out for him.',
        '🌟 Jumma Mubarak! May Allah bless you with peace.',
        '🕌 Don\'t forget to read Surah Al-Kahf today.',
        '🕋 Indeed, prayer prohibits immorality and wrongdoing.'
    ];
    const pick = statuses[crypto.randomInt(statuses.length)];

    try {
        const jid = channelJid.endsWith('@newsletter') ? channelJid : `${channelJid}@newsletter`;
        await conn.sendMessage(jid, { text: pick });
        return ctx.reply(`✅ Random status post!\n📌 ${jid}\n💬 ${pick}`);
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 5. CHSTATSTICKER — Sticker post
// ===========================================================
cmd({
    pattern: 'chstatsticker',
    alias: ['stickerstatus'],
    desc: 'Sticker channel pe post karo',
    category: 'tools',
    react: '🎨',
    use: '.chstatsticker <channel_jid> (image reply)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
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
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 6. CHSTATREMIND — Expiry reminder
// ===========================================================
cmd({
    pattern: 'chstatremind',
    alias: ['statusremind'],
    desc: 'Status expiry reminder set karo',
    category: 'tools',
    react: '⏰',
    use: '.chstatremind <channel_jid> <hours>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
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
        } catch (e) { console.error('remind failed:', e.message); }
    }, ms);
});

// ===========================================================
// 7. CHSTATFORWARD — Post ko group me forward
// ===========================================================
cmd({
    pattern: 'chstatforward',
    alias: ['chforward'],
    desc: 'Channel post ko group me forward karo',
    category: 'tools',
    react: '↗️',
    use: '.chstatforward <group_jid> (channel post pe reply)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
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
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 8. CHSTATREACT — Custom emoji reaction
// ===========================================================
cmd({
    pattern: 'chstatreact',
    alias: ['chreactstatus'],
    desc: 'Channel status pe reaction lagao',
    category: 'tools',
    react: '💫',
    use: '.chstatreact <channel_jid> <serverId> <emoji>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
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
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 9. AUTOREACT-ON — Auto-reaction engine ON
// ===========================================================
cmd({
    pattern: 'autoreact-on',
    alias: ['autoreactstart'],
    desc: 'Channel status pe auto-reaction engine ON',
    category: 'tools',
    react: '⚡',
    use: '.autoreact-on <channel_jid> [interval_seconds]',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const args = ctx.args || [];
    const channelJid = args[0];
    const interval = parseInt(args[1]) || 300;

    if (!channelJid) return ctx.reply('Use: `.autoreact-on <channel_jid> [seconds]`');
    if (interval < 30) return ctx.reply('❌ Minimum 30 seconds.');

    const jid = channelJid.endsWith('@newsletter') ? channelJid : `${channelJid}@newsletter`;
    await startAutoReact(conn, jid, interval);
    return ctx.reply(`⚡ Auto-react ON!\n📌 ${jid}\n⏱️ Every ${interval}s`);
});

// ===========================================================
// 10. AUTOREACT-OFF — Auto-reaction OFF
// ===========================================================
cmd({
    pattern: 'autoreact-off',
    alias: ['autoreactstop'],
    desc: 'Auto-reaction engine OFF',
    category: 'tools',
    react: '🛑',
    use: '.autoreact-off <channel_jid>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const channelJid = (ctx.args[0] || '').trim();
    if (!channelJid) return ctx.reply('Use: `.autoreact-off <channel_jid>`');

    const jid = channelJid.endsWith('@newsletter') ? channelJid : `${channelJid}@newsletter`;
    if (activeAutoReact.has(jid)) {
        clearInterval(activeAutoReact.get(jid));
        activeAutoReact.delete(jid);
        return ctx.reply(`🛑 Auto-react OFF for ${jid}`);
    }
    return ctx.reply('❌ Ye channel auto-react list me nahi.');
});

// ===========================================================
// 11. CHANNELINFO — Channel info
// ===========================================================
cmd({
    pattern: 'channelinfo',
    alias: ['chinfo'],
    desc: 'Channel ki info dekho',
    category: 'tools',
    react: '📊',
    use: '.channelinfo <channel_jid>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const channelJid = (ctx.args[0] || '').trim();
    if (!channelJid) return ctx.reply('Use: `.channelinfo <channel_jid>`');

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
            `⚡ Auto-react: *${activeAutoReact.has(jid) ? 'ON' : 'OFF'}*`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 12. CHSTATLIST — Auto-react list
// ===========================================================
cmd({
    pattern: 'chstatlist',
    alias: ['autoreactlist'],
    desc: 'Auto-react channels list dekho',
    category: 'tools',
    react: '📋',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (activeAutoReact.size === 0) return ctx.reply('❌ Koi channel auto-react list me nahi.');

    const lines = [...activeAutoReact.keys()].map((jid, i) => `${i + 1}. ${jid}`);
    return ctx.reply(`⚡ *Auto-React Channels (${activeAutoReact.size})*\n\n` + lines.join('\n'));
});

// ===========================================================
// 13. CHSTATBULK — Bulk post multiple channels
// ===========================================================
cmd({
    pattern: 'chstatbulk',
    alias: ['bulkstatus'],
    desc: 'Ek text multiple channels pe post karo',
    category: 'tools',
    react: '📣',
    use: '.chstatbulk <jid1,jid2,jid3> <text>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
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