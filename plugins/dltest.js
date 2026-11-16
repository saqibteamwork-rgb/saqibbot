// plugins/dltest.js — download system ka test (owner): yt-dlp, ffmpeg, JS runtime, cookies + ek asli YouTube check
const { cmd } = require('../arslan');
const mediaDl = require('../lib/media-dl');

cmd({
    pattern: 'dltest',
    alias: ['dlcheck', 'ytcheck'],
    desc: 'Download system check (yt-dlp, ffmpeg, cookies)',
    category: 'owner',
    react: '🧪',
    use: '.dltest [youtube link]',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(ctx.isCreator || ctx.isOwner)) return ctx.reply('⛔ Sirf bot owner.');
    const url = ((ctx.q || '').match(/https?:\/\/\S+/) || ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'])[0];
    await ctx.reply('🧪 Check chal raha hai… (30-60 second)');
    try {
        const report = await mediaDl.diagnose(url);
        return ctx.reply('🧪 *DOWNLOAD TEST*\n\n' + report);
    } catch (e) {
        return ctx.reply('❌ Test mein error: ' + String(e.message).slice(0, 200));
    }
});
