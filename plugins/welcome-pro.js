// plugins/welcome-pro.js
// Welcome / Goodbye with member DP card, Urdu shayari and stylish fonts.
// Every command below is per group. Group admins (or the bot owner) can use them.
//
//   .welcome on|off          .goodbye on|off
//   .setwelcome <text>       .setgoodbye <text>      (reset = default)
//   .welcomefont 1-7         .shayari on|off         .setshayari <text>
//   .welcomepic on|off       .testwelcome            .testgoodbye
//   .welcomeinfo
//   .setbotpic (image)       .resetbotpic            (owner)
//   .setownerpic (image)     .ownerpic on|off        .resetownerpic   (owner: apni photo welcome/goodbye card par)

const { cmd } = require('../arslan');
const config = require('../config');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const W = require('../lib/welcome');
const botpic = require('../lib/botpic');

const P = () => config.PREFIX || '.';
const onOff = v => (/^(on|true|yes|1|enable|chalu)$/i.test(v) ? true : /^(off|false|no|0|disable|band)$/i.test(v) ? false : null);
const mark = b => (b ? '✅ ON' : '❌ OFF');

async function groupOnly(ctx) {
    if (!ctx.isGroup) { await ctx.reply('⛔ Ye command sirf group mein chalti hai.'); return false; }
    return true;
}

// ───────────────────────── info panel ─────────────────────────
function panel(conn, groupJid) {
    const s = W.getSettings(conn, groupJid);
    const p = P();
    return (
`🌸 *WELCOME SETTINGS*

👋 Welcome: ${mark(s.welcome)}
🥀 Goodbye: ${mark(s.goodbye)}
🖼️ DP card: ${mark(s.pic)}
📜 Shayari: ${mark(s.shayari)}${s.shayariText ? ' (custom)' : ' (auto)'}
🔤 Font: ${s.font} — ${W.FONT_NAMES[s.font]?.[0] || 'Normal'}
✍️ Welcome text: ${s.wtext ? 'custom' : 'default'}
✍️ Goodbye text: ${s.gtext ? 'custom' : 'default'}

*Commands*
• ${p}welcome on/off  • ${p}goodbye on/off
• ${p}setwelcome <text>  • ${p}setgoodbye <text>
• ${p}welcomefont 1-7  • ${p}welcomepic on/off
• ${p}shayari on/off  • ${p}setshayari <text>
• ${p}testwelcome  • ${p}testgoodbye

*Text mein ye likh sakte hain:*
@user  @group  @count  @date  @time  @shayari`
    );
}

cmd({
    pattern: 'welcomeinfo',
    alias: ['welcomesettings', 'wsettings'],
    desc: 'Show welcome/goodbye settings of this group',
    category: 'group',
    react: '🌸',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await groupOnly(ctx))) return;
    return ctx.reply(panel(conn, ctx.from));
});

// ───────────────────────── on / off ─────────────────────────
for (const [name, field, label] of [['welcome', 'welcome', 'Welcome'], ['goodbye', 'goodbye', 'Goodbye']]) {
    cmd({
        pattern: name,
        alias: name === 'welcome' ? ['setwelcomeon'] : ['byemsg'],
        desc: `${label} message on/off for this group`,
        category: 'group',
        react: name === 'welcome' ? '👋' : '🥀',
        use: `.${name} on|off`,
        filename: __filename
    }, async (conn, mek, m, ctx) => {
        if (!(await groupOnly(ctx))) return;
        const v = onOff((ctx.args && ctx.args[0]) || '');
        if (v === null) return ctx.reply(panel(conn, ctx.from));
        W.setSetting(conn, ctx.from, { [field]: v });
        return ctx.reply(`✅ ${label} ab ${mark(v)} hai.${v ? `\n💡 Test karne ke liye: ${P()}test${name}` : ''}`);
    });
}

// ───────────────────────── custom texts ─────────────────────────
for (const [name, field, label] of [['setwelcome', 'wtext', 'Welcome'], ['setgoodbye', 'gtext', 'Goodbye']]) {
    cmd({
        pattern: name,
        desc: `Set custom ${label.toLowerCase()} text`,
        category: 'group',
        react: '✍️',
        use: `.${name} Welcome @user to @group!`,
        filename: __filename
    }, async (conn, mek, m, ctx) => {
        if (!(await groupOnly(ctx))) return;
        const text = (ctx.q || '').trim();
        if (!text) {
            return ctx.reply(
`✍️ *${name.toUpperCase()}*

Likhein: ${P()}${name} <apna message>
Default par wapas: ${P()}${name} reset

Placeholders:
@user — naya member (tag hoga)
@group — group ka naam
@count — total members
@date / @time — tareekh / waqt
@shayari — Urdu shayari

Misal:
${P()}${name} 🌹 @user, @group mein khush aamdeed!\\n@shayari`
            );
        }
        if (/^(reset|default|off)$/i.test(text)) {
            W.setSetting(conn, ctx.from, { [field]: null });
            return ctx.reply(`✅ ${label} text default par wapas aa gaya.`);
        }
        W.setSetting(conn, ctx.from, { [field]: text.replace(/\\n/g, '\n') });
        return ctx.reply(`✅ ${label} text set ho gaya.\n💡 Dekhne ke liye: ${P()}test${name === 'setwelcome' ? 'welcome' : 'goodbye'}`);
    });
}

// ───────────────────────── fonts ─────────────────────────
cmd({
    pattern: 'welcomefont',
    alias: ['wfont', 'setwelcomefont'],
    desc: 'Choose stylish font for the welcome message',
    category: 'group',
    react: '🔤',
    use: '.welcomefont 1',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await groupOnly(ctx))) return;
    const n = parseInt((ctx.args && ctx.args[0]) || '', 10);
    if (Number.isNaN(n) || !W.FONT_NAMES[n]) {
        const list = Object.entries(W.FONT_NAMES).map(([k, v]) => `${k}. ${v[1]}  — ${v[0]}`).join('\n');
        return ctx.reply(`🔤 *WELCOME FONTS*\n\n${list}\n\nSet: ${P()}welcomefont 2`);
    }
    W.setSetting(conn, ctx.from, { font: n });
    return ctx.reply(`✅ Font set: ${W.fancy('Welcome AMAN', n)}\n💡 Test: ${P()}testwelcome`);
});

// ───────────────────────── shayari ─────────────────────────
cmd({
    pattern: 'shayari',
    alias: ['welcomeshayari'],
    desc: 'Urdu shayari in welcome on/off',
    category: 'group',
    react: '📜',
    use: '.shayari on|off',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await groupOnly(ctx))) return;
    const v = onOff((ctx.args && ctx.args[0]) || '');
    if (v === null) return ctx.reply(`📜 Shayari: ${mark(W.getSettings(conn, ctx.from).shayari)}\nSet: ${P()}shayari on / off`);
    W.setSetting(conn, ctx.from, { shayari: v });
    return ctx.reply(`✅ Shayari ab ${mark(v)} hai.`);
});

cmd({
    pattern: 'setshayari',
    desc: 'Set your own shayari for the welcome message',
    category: 'group',
    react: '📜',
    use: '.setshayari <2 lines>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await groupOnly(ctx))) return;
    const text = (ctx.q || '').trim();
    if (!text) return ctx.reply(`📜 Apni shayari likhein (2 lines, \\n se alag):\n${P()}setshayari آپ آئے بہار آئی\\nدل کو قرار آیا\n\nAuto shayari par wapas: ${P()}setshayari reset`);
    if (/^(reset|default|auto)$/i.test(text)) {
        W.setSetting(conn, ctx.from, { shayariText: null, shayari: true });
        return ctx.reply('✅ Ab har dafa nayi auto shayari aayegi.');
    }
    W.setSetting(conn, ctx.from, { shayariText: text.replace(/\\n/g, '\n').slice(0, 400), shayari: true });
    return ctx.reply('✅ Aap ki shayari set ho gayi.');
});

// ───────────────────────── DP card ─────────────────────────
cmd({
    pattern: 'welcomepic',
    alias: ['welcomedp', 'welcomecard'],
    desc: 'Show member DP card in welcome on/off',
    category: 'group',
    react: '🖼️',
    use: '.welcomepic on|off',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await groupOnly(ctx))) return;
    const v = onOff((ctx.args && ctx.args[0]) || '');
    if (v === null) return ctx.reply(`🖼️ DP card: ${mark(W.getSettings(conn, ctx.from).pic)}\nSet: ${P()}welcomepic on / off`);
    W.setSetting(conn, ctx.from, { pic: v });
    return ctx.reply(`✅ DP card ab ${mark(v)} hai.`);
});

// ───────────────────────── test ─────────────────────────
for (const [name, kind] of [['testwelcome', 'welcome'], ['testgoodbye', 'goodbye']]) {
    cmd({
        pattern: name,
        desc: `Preview the ${kind} message (uses your own number)`,
        category: 'group',
        react: '🧪',
        filename: __filename
    }, async (conn, mek, m, ctx) => {
        if (!(await groupOnly(ctx))) return;
        const jid = ctx.sender;
        const number = String(ctx.senderNumber || jid).split('@')[0].split(':')[0];
        await W.sendNotice(conn, kind, ctx.from, jid, number);
    });
}

// ───────────────────────── bot picture ─────────────────────────
function pickImage(mek) {
    const ctxInfo = mek.message?.extendedTextMessage?.contextInfo
        || mek.message?.imageMessage?.contextInfo || null;
    return mek.message?.imageMessage
        || ctxInfo?.quotedMessage?.imageMessage
        || null;
}

async function downloadImage(imgMsg) {
    const stream = await downloadContentFromMessage(imgMsg, 'image');
    let buf = Buffer.from([]);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
    return buf;
}

cmd({
    pattern: 'setbotpic',
    alias: ['setmenupic', 'botimage', 'setbotimage', 'setbotpicture'],
    desc: 'Change the bot picture used in menu / alive (image reply, attach or link)',
    category: 'owner',
    react: '🖼️',
    use: '.setbotpic (image reply)  |  .setbotpic <image-link>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const url = ((ctx.q || '').match(/https?:\/\/\S+/) || [])[0];
        const imgMsg = pickImage(mek);
        if (!imgMsg && !url) {
            return ctx.reply(`🖼️ *BOT PICTURE*\n\n• Kisi photo ko reply karke ${P()}setbotpic\n• Ya photo bhejte waqt caption mein ${P()}setbotpic\n• Ya link: ${P()}setbotpic https://.../pic.jpg\n• Wapas default: ${P()}resetbotpic\n\n(WhatsApp ki apni profile photo ke liye ${P()}setpp use karein.)`);
        }
        await ctx.reply('⏳ Bot ki picture update ho rahi hai...');
        if (imgMsg) await botpic.setBotPicFromBuffer(conn, await downloadImage(imgMsg));
        else await botpic.setBotPicFromUrl(conn, url);
        await conn.sendMessage(ctx.from, { image: botpic.getBotPic(conn), caption: '✅ *Bot picture set ho gayi!*\nAb menu / alive mein yehi aayegi.' }, { quoted: mek });
    } catch (e) {
        return ctx.reply('❌ Picture set nahi hui: ' + String(e.message).slice(0, 160));
    }
});

cmd({
    pattern: 'resetbotpic',
    alias: ['defaultbotpic', 'delbotpic'],
    desc: 'Restore the default bot picture',
    category: 'owner',
    react: '♻️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    botpic.resetBotPic(conn);
    return ctx.reply('✅ Bot picture default par wapas aa gayi.');
});


// ───────────────────────── owner photo on the card ─────────────────────────
cmd({
    pattern: 'setownerpic',
    alias: ['setwelcomeowner', 'ownerpicset'],
    desc: 'Welcome/goodbye card par apni photo lagao (image reply, attach or link)',
    category: 'owner',
    react: '🖼️',
    use: '.setownerpic (image reply)  |  .setownerpic <image-link>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isCreator) return ctx.reply('⛔ Sirf bot owner.');
    try {
        const url = ((ctx.q || '').match(/https?:\/\/\S+/) || [])[0];
        const imgMsg = pickImage(mek);
        if (!imgMsg && !url) {
            return ctx.reply(`🖼️ *OWNER PHOTO (welcome card)*\n\n• Apni photo ko reply karke ${P()}setownerpic\n• Ya photo bhejte waqt caption mein ${P()}setownerpic\n• Ya link: ${P()}setownerpic https://.../photo.jpg\n\nOn/off: ${P()}ownerpic on / off\nHatana: ${P()}resetownerpic`);
        }
        await ctx.reply('⏳ Photo set ho rahi hai...');
        const buf = imgMsg ? await downloadImage(imgMsg) : await W.fetchBuffer(url);
        await W.setOwnerPic(conn, buf);
        return ctx.reply(`✅ *Owner photo set ho gayi!*\nAb har welcome / goodbye card par member ki DP ke saath aap ki photo bhi aayegi.\nDekhne ke liye group mein ${P()}testwelcome chalao.`);
    } catch (e) {
        return ctx.reply('❌ Photo set nahi hui: ' + String(e.message).slice(0, 160));
    }
});

cmd({
    pattern: 'ownerpic',
    alias: ['welcomeowner'],
    desc: 'Welcome card par owner photo on/off',
    category: 'owner',
    react: '🖼️',
    use: '.ownerpic on|off',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isCreator) return ctx.reply('⛔ Sirf bot owner.');
    const v = onOff((ctx.args && ctx.args[0]) || '');
    if (!W.hasOwnerPic(conn)) return ctx.reply(`ℹ️ Pehle photo set karo: ${P()}setownerpic`);
    if (v === null) return ctx.reply(`🖼️ Owner photo: ${mark(W.ownerPicEnabled(conn))}\nSet: ${P()}ownerpic on / off`);
    W.setOwnerPicEnabled(conn, v);
    return ctx.reply(`✅ Owner photo ab ${mark(v)} hai.`);
});

cmd({
    pattern: 'resetownerpic',
    alias: ['delownerpic'],
    desc: 'Welcome card se owner photo hata do',
    category: 'owner',
    react: '♻️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isCreator) return ctx.reply('⛔ Sirf bot owner.');
    W.clearOwnerPic(conn);
    return ctx.reply('✅ Owner photo hata di.');
});

console.log('[AMAN Mini Bot] welcome-pro loaded');
