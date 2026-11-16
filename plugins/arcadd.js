// plugins/arcadd.js
// .arcadd — channel post par SAB connected sessions se react (owner)

const { cmd } = require('../arslan');
const config = require('../config');
const reactor = require('../lib/reactor');

const DEFAULT_REACTION_EMOJI = '❤️';

cmd({
    pattern: 'arcadd',
    alias: ['arcreact', 'addreact'],
    desc: 'React to a channel post from all connected sessions',
    category: 'tools',
    react: '💗',
    use: '.arcadd <channel-post-link> ❤️ 🔥',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const P = config.PREFIX || '.';


    const q = (ctx.q || '').trim();
    if (!q) {
        return ctx.reply(
`💗 *ARCADD*
Use: ${P}arcadd <channel-post-link> ❤️ 🔥

• 1 emoji → saare sessions wahi lagayenge
• Kai emoji → sessions mein baant diye jayenge
• Emoji nahi → ${DEFAULT_REACTION_EMOJI}`
        );
    }

    const parts = q.split(/\s+/);
    const link = parts.find(p => /whatsapp\.com\/channel\//i.test(p));
    if (!link) return ctx.reply('❌ Valid WhatsApp channel post link do.');

    let emojis = reactor.extractEmojis(parts.filter(p => p !== link).join(' '));
    if (!emojis.length) emojis = [DEFAULT_REACTION_EMOJI];
    if (emojis.length > 30) return ctx.reply('⚠️ Max 30 emojis.');

    const sessions = reactor.getConnectedSockets();
    if (!sessions.length) return ctx.reply('❌ Koi connected session nahi mila.');

    let resolved = await reactor.resolveChannelLink(conn, link);
    if (!resolved.ok) {
        for (const s of sessions) {
            if (s.sock === conn) continue;
            resolved = await reactor.resolveChannelLink(s.sock, link);
            if (resolved.ok) break;
        }
    }
    if (!resolved.ok) return ctx.reply(`❌ Channel resolve nahi hua: ${resolved.error}`);
    if (!resolved.serverId) return ctx.reply('❌ Link mein post number nahi hai (…/channel/XXXX/123).');

    await ctx.reply(`⏳ ${sessions.length} sessions se react ho raha hai... ${emojis.join(' ')}`);

    const res = await reactor.reactAllSessions(resolved.channelJid, resolved.serverId, emojis, { mode: 'cycle' });
    if (!res.success) {
        const why = Object.keys(res.errors || {})[0] || res.error || 'unknown';
        return ctx.reply(`❌ React fail.\nReason: ${why}`);
    }

    const used = Object.entries(res.used).map(([e, n]) => `${e} ×${n}`).join('  ');
    return ctx.reply(
`🎯 *CHANNEL REACTION RESULT*

📌 Post: ${resolved.serverId}
👥 Sessions: ${res.total}
✅ Success: ${res.success}
❌ Failed: ${res.failed}
✨ ${used}`
    );
});
