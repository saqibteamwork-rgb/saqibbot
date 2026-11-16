const { cmd } = require('../arslan');
const { getMode, setMode } = require('../lib/antidelete');

const label = { on: '🟢 ON (usi chat mein)', dm: '🟢 ON (sirf aap ke DM mein)', off: '🔴 OFF' };

cmd({
    pattern: 'antidelete',
    alias: ['antidel', 'ad'],
    desc: 'Delete kiye hue messages wapas bhejo: on / dm / off',
    category: 'owner',
    react: '🛡️',
    use: '.antidelete on | dm | off',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const { args, reply } = ctx;
    if (!(ctx.isCreator || ctx.isOwner)) return reply('*YEH COMMAND SIRF MERE LIE HAI 😎*');
    const a = String(args[0] || '').toLowerCase();

    if (['on', 'enable', 'true'].includes(a)) return setMode(conn, 'on') ? reply('*👑 ANTI-DELETE ON*\nSab chats mein delete hua message usi chat mein wapas aayega.') : reply('❌ Save nahi hua.');
    if (['dm', 'private', 'me'].includes(a)) return setMode(conn, 'dm') ? reply('*👑 ANTI-DELETE ON (DM)*\nDelete hua message sirf aap ke apne DM mein aayega.') : reply('❌ Save nahi hua.');
    if (['off', 'disable', 'false'].includes(a)) return setMode(conn, 'off') ? reply('*👑 ANTI-DELETE OFF*') : reply('❌ Save nahi hua.');
    return reply(`*ANTI-DELETE:* ${label[getMode(conn)]}\n\n\`.antidelete on\`  (usi chat mein)\n\`.antidelete dm\`  (sirf mere DM mein)\n\`.antidelete off\``);
});
