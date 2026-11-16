const { cmd } = require('../arslan');
const config = require('../config');
const crypto = require('crypto');
const axios = require('axios');

// ===========================================================
// 👥 GROUP COMMANDS (1-15)
// ===========================================================

// 1. GROUPSTATS — Group ki detailed stats
cmd({
    pattern: 'groupstats',
    alias: ['gstats'],
    desc: 'Group ki detailed stats',
    category: 'group',
    react: '📊',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    try {
        const meta = await conn.groupMetadata(ctx.from);
        const admins = meta.participants.filter(p => p.admin);
        const created = new Date(meta.creation * 1000).toLocaleDateString('en-GB');
        return ctx.reply([
            '📊 *GROUP STATS*',
            '',
            `📛 Name: *${meta.subject}*`,
            `👥 Members: *${meta.participants.length}*`,
            `🛡️ Admins: *${admins.length}*`,
            `📅 Created: *${created}*`,
            `🔒 Announce: *${meta.announce ? 'Yes' : 'No'}*`,
            `🔐 Restrict: *${meta.restrict ? 'Yes' : 'No'}*`
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// 2. TOPACTIVE — Top active members (approx)
cmd({
    pattern: 'topactive',
    alias: ['topmembers'],
    desc: 'Top active members (approx)',
    category: 'group',
    react: '🏆',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    try {
        const meta = await conn.groupMetadata(ctx.from);
        // Random pick for demo — real data ke liye database chahiye
        const members = [...meta.participants].sort(() => 0.5 - Math.random()).slice(0, 5);
        const lines = members.map((p, i) => {
            const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i];
            return `${medal} @${p.id.split('@')[0]}`;
        });
        return conn.sendMessage(ctx.from, {
            text: `🏆 *TOP ACTIVE MEMBERS*\n\n${lines.join('\n')}\n\n_Approx ranking_`,
            mentions: members.map(p => p.id)
        }, { quoted: mek });
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// 3. SILENTTAG — Silent tag (mention without name visible)
cmd({
    pattern: 'silenttag',
    alias: ['sttag'],
    desc: 'Silent tag — sabko tag karo bina naam',
    category: 'group',
    react: '👻',
    use: '.silenttag <message>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    const meta = await conn.groupMetadata(ctx.from);
    const jids = meta.participants.map(p => p.id);
    await conn.sendMessage(ctx.from, { text: ctx.q || '👻', mentions: jids }, { quoted: mek });
});

// 4. GROUPNAME — Group ka naam change (admin only)
cmd({
    pattern: 'setgname',
    alias: ['gname'],
    desc: 'Admin: Group ka naam change karo',
    category: 'group',
    react: '✏️',
    use: '.setgname <new name>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    if (!ctx.isAdmins && !ctx.isOwner) return ctx.reply('⛔ Admin only.');
    if (!ctx.q) return ctx.reply('Use: .setgname <name>');
    try {
        await conn.groupUpdateSubject(ctx.from, ctx.q);
        return ctx.reply('✅ Name updated.');
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// 5. GROUPDESC — Group description change
cmd({
    pattern: 'setgdesc',
    alias: ['gdesc'],
    desc: 'Admin: Group description change',
    category: 'group',
    react: '📝',
    use: '.setgdesc <text>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    if (!ctx.isAdmins && !ctx.isOwner) return ctx.reply('⛔ Admin only.');
    if (!ctx.q) return ctx.reply('Use: .setgdesc <text>');
    try {
        await conn.groupUpdateDescription(ctx.from, ctx.q);
        return ctx.reply('✅ Description updated.');
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// 6. POLL — Group poll
cmd({
    pattern: 'poll',
    alias: ['createpoll', 'vote'],
    desc: 'Group me poll banao',
    category: 'group',
    react: '📊',
    use: '.poll Question | opt1 | opt2',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    const parts = (ctx.q || '').split('|').map(x => x.trim()).filter(Boolean);
    if (parts.length < 3) return ctx.reply('Use: *.poll Question | opt1 | opt2*');

    const name = parts.shift();
    if (parts.length > 12) return ctx.reply('❌ Max 12 options.');

    try {
        await conn.sendMessage(ctx.from, {
            poll: { name, values: parts, selectableCount: 1 }
        }, { quoted: mek });
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// 7. WARN — User ko warn
const warns = new Map();
cmd({
    pattern: 'warn',
    alias: ['warning'],
    desc: 'Admin: Kisi ko warn karo',
    category: 'group',
    react: '⚠️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    if (!ctx.isAdmins && !ctx.isOwner) return ctx.reply('⛔ Admin only.');

    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned[0]) return ctx.reply('❌ Kisi ko mention karo.');

    const key = `${ctx.from}:${mentioned[0]}`;
    const count = (warns.get(key) || 0) + 1;
    warns.set(key, count);

    await conn.sendMessage(ctx.from, {
        text: `⚠️ @${mentioned[0].split('@')[0]} ko warn kiya gaya!\n\n*Warnings: ${count}/3*`,
        mentions: mentioned
    }, { quoted: mek });

    if (count >= 3) {
        try {
            await conn.groupParticipantsUpdate(ctx.from, [mentioned[0]], 'remove');
            warns.delete(key);
            await ctx.reply(`🚫 3 warnings complete — user kicked!`);
        } catch (_) {}
    }
});

// 8. WARNS — Warnings check
cmd({
    pattern: 'warns',
    alias: ['checkwarn'],
    desc: 'User ke warnings check karo',
    category: 'group',
    react: '📋',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || ctx.sender;
    const key = `${ctx.from}:${target}`;
    const count = warns.get(key) || 0;
    return ctx.reply(`⚠️ @${target.split('@')[0]} — *${count}/3* warnings`, { mentions: [target] });
});

// 9. RESETWARN — Warnings reset
cmd({
    pattern: 'resetwarn',
    alias: ['clearwarn'],
    desc: 'Admin: Warnings reset karo',
    category: 'group',
    react: '🔄',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isAdmins && !ctx.isOwner) return ctx.reply('⛔ Admin only.');
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned[0]) return ctx.reply('❌ Mention karo.');
    warns.delete(`${ctx.from}:${mentioned[0]}`);
    return ctx.reply(`✅ @${mentioned[0].split('@')[0]} ki warnings reset.`, { mentions: mentioned });
});

// 10. ADDMEMBER — Member add karo
cmd({
    pattern: 'addmember',
    alias: ['invite'],
    desc: 'Admin: Member add karo',
    category: 'group',
    react: '➕',
    use: '.addmember 923XXXXXXXXX',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    if (!ctx.isAdmins && !ctx.isOwner) return ctx.reply('⛔ Admin only.');
    const num = (ctx.q || '').replace(/\D/g, '');
    if (!num) return ctx.reply('Use: .addmember <number>');
    try {
        await conn.groupParticipantsUpdate(ctx.from, [`${num}@s.whatsapp.net`], 'add');
        return ctx.reply('✅ Member added.');
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// 11. KICKALL — Sab members remove (dangerous!)
cmd({
    pattern: 'kickall',
    alias: ['removeall'],
    desc: 'Group admin/owner: remove non-admin members',
    category: 'group',
    react: '🚫',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    if (!ctx.isAdmins && !ctx.isOwner) return ctx.reply('⛔ Group admins and owner only.');
    if (!ctx.isBotAdmins) return ctx.reply('❌ Bot admin nahi hai.');

    const meta = await conn.groupMetadata(ctx.from);
    const members = meta.participants.filter(p => !p.admin && p.id !== ctx.botNumber2);
    await ctx.reply(`⚠️ *${members.length}* members kick kar raha hun…`);

    for (const member of members) {
        try {
            await conn.groupParticipantsUpdate(ctx.from, [member.id], 'remove');
            await new Promise(r => setTimeout(r, 500));
        } catch (_) {}
    }
    return ctx.reply('✅ Sab members kick kar diye.');
});

// 12. LOCK — Group lock karo
cmd({
    pattern: 'lock',
    alias: ['lockgroup'],
    desc: 'Admin: Group lock — sirf admin bol sakta',
    category: 'group',
    react: '🔒',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    if (!ctx.isAdmins && !ctx.isOwner) return ctx.reply('⛔ Admin only.');
    try {
        await conn.groupSettingUpdate(ctx.from, 'announcement');
        return ctx.reply('🔒 Group locked.');
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// 13. UNLOCK — Group unlock
cmd({
    pattern: 'unlock',
    alias: ['unlockgroup'],
    desc: 'Admin: Group unlock',
    category: 'group',
    react: '🔓',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    if (!ctx.isAdmins && !ctx.isOwner) return ctx.reply('⛔ Admin only.');
    try {
        await conn.groupSettingUpdate(ctx.from, 'not_announcement');
        return ctx.reply('🔓 Group unlocked.');
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// 14. GROUPJOIN — Group invite link
cmd({
    pattern: 'ginvite',
    alias: ['invitelink', 'gclink'],
    desc: 'Group ka invite link',
    category: 'group',
    react: '🔗',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    try {
        const code = await conn.groupInviteCode(ctx.from);
        return ctx.reply(`🔗 *Invite Link:*\nhttps://chat.whatsapp.com/${code}`);
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// 15. REVOKE — Invite link revoke
cmd({
    pattern: 'grevoke',
    alias: ['revokeinvite'],
    desc: 'Admin: Invite link revoke',
    category: 'group',
    react: '🔄',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    if (!ctx.isAdmins && !ctx.isOwner) return ctx.reply('⛔ Admin only.');
    try {
        await conn.groupRevokeInvite(ctx.from);
        return ctx.reply('🔄 Invite link revoke ho gaya.');
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 🎮 FUN COMMANDS (16-30)
// ===========================================================

// 16. TRUTH — Truth question
cmd({
    pattern: 'truth',
    alias: ['sach'],
    desc: 'Random truth question',
    category: 'fun',
    react: '🤔',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const truths = [
        'Aapki zindagi ki sabse bari ghalti kya thi?',
        'Aapne aaj tak kis se sabse zyada jhoot bola?',
        'Aapki sabse embarrassing moment kya thi?',
        'Aap kis se secretly pyar karte hain?',
        'Aapne kabhi kisi ka dil toda hai?',
        'Aapka sabse bara secret kya hai?',
        'Aap apni life me kya badalna chahte hain?'
    ];
    return ctx.reply(`🤔 *TRUTH*\n\n${truths[crypto.randomInt(truths.length)]}`);
});

// 17. DARE — Dare challenge
cmd({
    pattern: 'dare',
    alias: ['himmat'],
    desc: 'Random dare challenge',
    category: 'fun',
    react: '🔥',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const dares = [
        'Apne crush ko abhi message karo!',
        'Apni last selfie group me bhejo!',
        'Apne 3 dost ko "I love you" bhejo!',
        'Voice note bhejo jisme tum gaa rahe ho!',
        'Apna funniest photo bhejo!',
        'Apne sabse purane message ka screenshot bhejo!',
        'Kisi random number pe "Hi" bhejo!'
    ];
    return ctx.reply(`🔥 *DARE*\n\n${dares[crypto.randomInt(dares.length)]}`);
});

// 18. WOULD YOU — Would you rather
cmd({
    pattern: 'wouldyourather',
    alias: ['wyr'],
    desc: 'Would you rather question',
    category: 'fun',
    react: '🤷',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const questions = [
        '🤔 *Would you rather:*\n\nA) Har waqt sach bolo\nB) Har waqt jhoot bolo',
        '🤔 *Would you rather:*\n\nA) 1 crore rupay lo\nB) Sab ki respect lo',
        '🤔 *Would you rather:*\n\nA) Hamesha ameer raho\nB) Hamesha khush raho',
        '🤔 *Would you rather:*\n\nA) Mobile na ho\nB) Internet na ho',
        '🤔 *Would you rather:*\n\nA) Purani zindagi wapas\nB) Naya future dekho'
    ];
    return ctx.reply(questions[crypto.randomInt(questions.length)]);
});

// 19. NEVER HAVE — Never have I ever
cmd({
    pattern: 'neverhave',
    alias: ['nhie'],
    desc: 'Never have I ever',
    category: 'fun',
    react: '🙈',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const statements = [
        'Never have I ever lied to my parents.',
        'Never have I ever broken someone\'s heart.',
        'Never have I ever cheated in an exam.',
        'Never have I ever stalked my ex.',
        'Never have I ever cried watching a movie.',
        'Never have I ever sent a message to wrong person.',
        'Never have I ever pretended to be sick.'
    ];
    return ctx.reply(`🙈 *NEVER HAVE I EVER*\n\n${statements[crypto.randomInt(statements.length)]}`);
});

// 20. SHIP — Ship two users
cmd({
    pattern: 'ship',
    alias: ['love'],
    desc: 'Do users ko ship karo',
    category: 'fun',
    react: '💘',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned.length < 2) return ctx.reply('❌ 2 users ko mention karo.');

    const percent = crypto.randomInt(20, 101);
    const bar = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));

    return conn.sendMessage(ctx.from, {
        text: `💘 *SHIP METER*\n\n@${mentioned[0].split('@')[0]} ❤️ @${mentioned[1].split('@')[0]}\n\n${bar} *${percent}%*\n\n${percent > 80 ? '💍 Perfect match!' : percent > 50 ? '😍 Good match!' : '😅 Friendzone!'}`,
        mentions: mentioned
    }, { quoted: mek });
});

// 21. GAYMETER — Fun gay meter
cmd({
    pattern: 'gaymeter',
    alias: ['gaytest'],
    desc: 'Fun gay meter',
    category: 'fun',
    react: '🏳️‍🌈',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || ctx.sender;
    const percent = crypto.randomInt(0, 101);
    const bar = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));

    return conn.sendMessage(ctx.from, {
        text: `🏳️‍🌈 *GAY METER*\n\n@${target.split('@')[0]}\n${bar} *${percent}%*`,
        mentions: [target]
    }, { quoted: mek });
});

// 22. RATE — Rate someone
cmd({
    pattern: 'rate',
    alias: ['rating'],
    desc: 'Kisi ko rate karo',
    category: 'fun',
    react: '⭐',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || ctx.sender;
    const rate = crypto.randomInt(1, 11);
    const stars = '⭐'.repeat(rate) + '☆'.repeat(10 - rate);

    return conn.sendMessage(ctx.from, {
        text: `⭐ *RATING*\n\n@${target.split('@')[0]}\n\n${stars}\n*${rate}/10*`,
        mentions: [target]
    }, { quoted: mek });
});

// 23. HACK — Fake hack prank
cmd({
    pattern: 'hack',
    alias: ['hacker'],
    desc: 'Fake hack (prank)',
    category: 'fun',
    react: '💻',
    use: '.hack @user',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || ctx.sender;
    const targetNum = target.split('@')[0];

    await ctx.reply(`💻 *Hacking @${targetNum}…*`);
    await new Promise(r => setTimeout(r, 1500));
    await ctx.reply(`🔍 *Finding IP address…*`);
    await new Promise(r => setTimeout(r, 1500));
    await ctx.reply(`📡 *IP Found: 192.168.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}*`);
    await new Promise(r => setTimeout(r, 1500));
    await ctx.reply(`🔐 *Cracking password…*`);
    await new Promise(r => setTimeout(r, 1500));
    await ctx.reply(`✅ *Password: 12345678*`);
    await new Promise(r => setTimeout(r, 1000));
    await ctx.reply(`⚠️ *JK! Ye sirf prank tha* 😂`);
});

// 24. SLAP — Slap someone
cmd({
    pattern: 'slap',
    alias: ['thappar'],
    desc: 'Kisi ko slap karo (fun)',
    category: 'fun',
    react: '👋',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || ctx.sender;

    return conn.sendMessage(ctx.from, {
        text: `👋 @${ctx.senderNumber} ne @${target.split('@')[0]} ko *thappar* maara! 😂`,
        mentions: [ctx.sender, target]
    }, { quoted: mek });
});

// 25. HUG — Hug someone
cmd({
    pattern: 'hug',
    alias: ['galey'],
    desc: 'Kisi ko hug karo',
    category: 'fun',
    react: '🤗',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || ctx.sender;

    return conn.sendMessage(ctx.from, {
        text: `🤗 @${ctx.senderNumber} ne @${target.split('@')[0]} ko *hug* kiya! 💗`,
        mentions: [ctx.sender, target]
    }, { quoted: mek });
});

// 26. KISS — Kiss someone (fun)
cmd({
    pattern: 'kiss',
    alias: ['pappi'],
    desc: 'Kisi ko kiss karo (fun)',
    category: 'fun',
    react: '😘',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || ctx.sender;

    return conn.sendMessage(ctx.from, {
        text: `😘 @${ctx.senderNumber} ne @${target.split('@')[0]} ko *kiss* kiya! 💋`,
        mentions: [ctx.sender, target]
    }, { quoted: mek });
});

// 27. PUNCH — Punch someone
cmd({
    pattern: 'punch',
    alias: ['mukka'],
    desc: 'Kisi ko punch (fun)',
    category: 'fun',
    react: '👊',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || ctx.sender;

    return conn.sendMessage(ctx.from, {
        text: `👊 @${ctx.senderNumber} ne @${target.split('@')[0]} ko *punch* kiya! 💥`,
        mentions: [ctx.sender, target]
    }, { quoted: mek });
});

// 28. KILL — Kill someone (fun)
cmd({
    pattern: 'kill',
    alias: ['maar'],
    desc: 'Kisi ko kill (fun)',
    category: 'fun',
    react: '🔪',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || ctx.sender;

    return conn.sendMessage(ctx.from, {
        text: `🔪 @${ctx.senderNumber} ne @${target.split('@')[0]} ko *kill* kar diya! 💀\n\n_RIP_ 🪦`,
        mentions: [ctx.sender, target]
    }, { quoted: mek });
});

// NOTE: The following command in the supplied ZIP was truncated and has been omitted
// so this plugin can load safely. Restore it from a complete source before re-adding.
