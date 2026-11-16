// plugins/video.js — YouTube video download (MR SAQIB MD Engine)
const { cmd } = require('../arslan');
const { ytmp4Command } = require('../commands/yt');

cmd({
    pattern: 'video',
    alias: ['vedio', 'vid', 'playvideo', 'ytmp4', 'mp4'],
    desc: 'Download YouTube video',
    category: 'download',
    react: '🎬',
    use: '.video <name or youtube link>',
    filename: __filename
}, async (conn, mek, m, { from, reply, text, q, args }) => {
    try {
        const queryArgs = (args && args.length) ? args : (text || q || '').trim().split(/\s+/).filter(Boolean);
        await ytmp4Command(conn, from, mek, queryArgs);
    } catch (err) {
        console.error('[VIDEO Plugin Error]:', err.message);
        reply(`❌ *Video download fail ho gayi:*\n_${err.message}_`);
    }
});
