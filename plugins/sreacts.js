// plugins/sreacts.js
// .sreacts — bot se connected SAB sessions channel post par react karein

const { cmd } = require('../arslan');
const config = require('../config');
const reactor = require('../lib/reactor');

cmd({
    pattern: 'sreacts',
    alias: ['sreact', 'allreact', 'sessionreacts', 'massreact', 'arcadd', 'arcreact', 'addreact'],
    desc: 'All connected sessions react on a channel post',
    category: 'general',
    react: '💫',
    use: '.sreacts <channel-post-link> [emojis]',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        return await handleSreacts(conn, mek, m, ctx);
    } catch (e) {
        return ctx.reply('⚠️ sreacts error: ' + String(e.message || e).slice(0, 200));
    }
});

async function handleSreacts(conn, mek, m, ctx) {
    const P = config.PREFIX || '.';
    const q = (ctx.q || '').trim();

    // ── REPLY MODE: group/chat message ko reply karke .sreacts → sab sessions us message par react ──
    const qctx = (mek && mek.quoted) || null;
    const ci = mek?.message?.extendedTextMessage?.contextInfo
        || mek?.message?.[Object.keys(mek.message || {})[0]]?.contextInfo || null;
    const stanzaId = qctx?.stanzaId || ci?.stanzaId;
    const quotedParticipant = qctx?.participant || ci?.participant;
    if (stanzaId && !/whatsapp\.com\/channel\//i.test(q)) {
        { const w = reactor.massCooldown('r:' + ctx.from); if (w) return ctx.reply(`⏳ ${w} second baad dobara chalayein (account safety ke liye).`); }
        const chatJid = ctx.from;
        const key = {
            remoteJid: chatJid,
            id: stanzaId,
            fromMe: false,
            ...(chatJid.endsWith('@g.us') && quotedParticipant ? { participant: quotedParticipant } : {})
        };
        const wantSticker = /(^|\s)(sticker|stickers|stiker|stk|circle|gol)(\s|$)/i.test(q);
        const wantStatic = /(^|\s)(static|plain|single)(\s|$)/i.test(q);
        const emojis = reactor.extractEmojis(q);
        if (emojis.length > 30) return ctx.reply('⚠️ Max 30 emojis.');
        const total = reactor.getConnectedSockets().length;
        if (!total) return ctx.reply('❌ Koi connected session nahi mila.');
        await ctx.reply(`⏳ *Reacting...*\n👥 Sessions: ${total}\n💫 Emoji: ${emojis.length ? emojis.join(' ') : 'random mix'}`);
        const mode = emojis.length ? 'cycle' : 'random';
        const quoted = { key, message: qctx?.message || ci?.quotedMessage };
        if (wantSticker && !wantStatic) await ctx.reply('🎨 Circle animation sticker ban raha hai...');
        const r = wantSticker
            ? (wantStatic
                ? await reactor.stickerReactAll(chatJid, quoted, emojis, { mode })
                : await reactor.circleStickerReactAll(chatJid, quoted, emojis, { mode }))
            : await reactor.reactAllToMessage(chatJid, key, emojis, { mode });
        if (!r.ok) {
            const why = Object.keys(r.errors || {})[0] || r.error || 'unknown';
            return ctx.reply(`❌ Kisi session se react nahi hua.\nReason: ${why}`);
        }
        const used = Object.entries(r.used).map(([e, n]) => `${e} ×${n}`).join('  ');
        let out = `✅ *SREACTS DONE*\n\n👥 Sessions: ${r.total}\n✅ Success: ${r.success}\n❌ Failed: ${r.failed}\n💫 ${used}`;
        if (r.failed) out += `\n\nℹ️ Failed wo sessions hain jo is group mein maujood nahi.`;
        return ctx.reply(out);
    }

    if (!q) {
        const st = reactor.getAccountStats();
        return ctx.reply(
`💫 *SREACTS — All Sessions React*

📌 *Usage:*
${P}sreacts <channel-post-link>
${P}sreacts <channel-post-link> ❤️
${P}sreacts <channel-post-link> ❤️ 🔥 😍 👍
${P}sreacts <channel-post-link> ❤️ follow\n(Group mein kisi message ko *reply* karke ${P}sreacts ❤️ 🔥 → sab sessions us message par react)\n(Animated *circle sticker* ke liye: reply karke ${P}sreacts sticker ❤️ 🔥 😍)\n(Sirf simple emoji sticker: ${P}sreacts sticker static ❤️)

📖 *Rules:*
• Emoji nahi diya → har session random emoji lagayega
• 1 emoji → sab sessions wahi lagayenge
• Kai emoji → sessions mein baant diye jayenge
• Last mein \`follow\` likho to har session pehle channel follow karega

🟢 Connected sessions: *${st.total}*`
        );
    }

    const parts = q.split(/\s+/);
    const link = parts.find(p => /whatsapp\.com\/channel\//i.test(p));
    if (!link) return ctx.reply('❌ Valid channel post link do.\nMisal: https://whatsapp.com/channel/XXXX/123');

    const rest = parts.filter(p => p !== link);
    const follow = rest.some(p => /^follow$/i.test(p));
    const emojis = reactor.extractEmojis(rest.filter(p => !/^follow$/i.test(p)).join(' '));
    if (emojis.length > 30) return ctx.reply('⚠️ Max 30 emojis.');

    const sessions = reactor.getConnectedSockets();
    if (!sessions.length) return ctx.reply('❌ Koi connected session nahi mila.');

    // Resolve with the session that sent the command, fall back to any other session
    { const w = reactor.massCooldown('r:' + ctx.from); if (w) return ctx.reply(`⏳ ${w} second baad dobara chalayein (account safety ke liye).`); }
    let resolved = await reactor.resolveChannelLink(conn, link);
    if (!resolved.ok) {
        for (const s of sessions) {
            if (s.sock === conn) continue;
            resolved = await reactor.resolveChannelLink(s.sock, link);
            if (resolved.ok) break;
        }
    }
    if (!resolved.ok) return ctx.reply(`❌ Channel resolve nahi hua: ${resolved.error}`);
    if (!resolved.serverId) return ctx.reply('❌ Link mein post number nahi hai.\nChannel ki *post* ka link do (…/channel/XXXX/123).');

    await ctx.reply(
`⏳ *Reacting...*
👥 Sessions: ${sessions.length}
🎯 Post: #${resolved.serverId}
💫 Emoji: ${emojis.length ? emojis.join(' ') : 'random mix'}`
    );

    const res = await reactor.reactAllSessions(
        resolved.channelJid,
        resolved.serverId,
        emojis,
        { mode: emojis.length ? 'cycle' : 'random', follow }
    );

    if (!res.ok && !res.success) {
        const why = Object.keys(res.errors || {})[0] || res.error || 'unknown';
        return ctx.reply(`❌ Kisi session se react nahi hua.\nReason: ${why}\n\n💡 Agar channel follow nahi kiya to \`${P}sreacts <link> follow\` try karo.`);
    }

    const used = Object.entries(res.used || {}).map(([e, n]) => `${e} ×${n}`).join('  ');
    let out =
`✅ *SREACTS DONE*

📡 Post: #${resolved.serverId}
👥 Sessions: ${res.total}
✅ Success: ${res.success}
❌ Failed: ${res.failed}
💫 ${used}`;
    if (res.failed) {
        const top = Object.entries(res.errors).slice(0, 2).map(([k, v]) => `• ${k} (${v})`).join('\n');
        out += `\n\n⚠️ Fail reasons:\n${top}`;
    }
    return ctx.reply(out);
}

console.log('[AMAN Mini Bot] .sreacts loaded');
