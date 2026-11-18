// plugins/chreact.js
// CHREACT — Baileys direct channel reaction (no API key)

const { cmd } = require('../arslan');
const reactor = require('../lib/reactor');

cmd({
    pattern: 'chreact',
    alias: ['creact', 'reactch', 'channelreact'],
    desc: 'React to WhatsApp channel post (Baileys direct)',
    category: 'general',
    react: '💫',
    filename: __filename
},
async (conn, mek, m, { args, reply }) => {
    try {
        if (args.length < 2) {
            return reply(
`💫 *CHREACT — Channel Reaction*

📌 *Usage:* .chreact <link> <emoji>

📖 *Examples:*
.chreact https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M/1673 ❤️
.chreact https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M/1673 🔥

💡 Single emoji only
🔗 Baileys direct — no API key`
            );
        }

        const link = args[0];
        const emoji = Array.from(args.slice(1).join(''))[0]; // single emoji

        if (!link.includes('whatsapp.com/channel/')) {
            return reply('❌ *Invalid channel link!*');
        }

        await reply(`💫 *Sending...*\n📡 \`...${link.split('/').slice(-2).join('/')}\`\n💫 ${emoji}`);

        // resolve channel
        const resolved = await reactor.resolveChannelLink(conn, link);
        if (!resolved.ok) {
            return reply(`❌ *Channel resolve failed:* ${resolved.error}`);
        }

        if (!resolved.serverId) {
            return reply('❌ *Server ID missing.* Link mein post number nahi hai.');
        }

        // react
        const result = await reactor.reactViaBaileys(conn, resolved.channelJid, resolved.serverId, emoji);

        if (result.ok) {
            return reply(
`✅ *REACTED*
📡 Channel : \`${resolved.channelJid.split('@')[0].slice(0, 20)}...\`
🎯 Post    : #${resolved.serverId}
💫 Emoji   : ${emoji}`
            );
        } else {
            return reply(`⚠️ *Failed:* ${result.error}`);
        }

    } catch (err) {
        return reply(`❌ ${err.message}`);
    }
});