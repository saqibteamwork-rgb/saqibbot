// MR SAQIB MD — YouTube drama search and download
// .drama <name> — search + seedha download aur send (reply ki zaroorat nahi)
const { cmd } = require('../arslan');
const yts = require('yt-search');
const config = require('../config');
const mediaDl = require('../lib/media-dl');

function cleanFileName(value) {
    return String(value || 'drama')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100) || 'drama';
}

cmd({
    pattern: 'drama',
    alias: ['darama', 'dramadl'],
    desc: 'YouTube par 15+ minute drama search aur download',
    category: 'download',
    react: '🎬',
    use: '.drama <drama name>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const reply = ctx.reply || (text => conn.sendMessage(ctx.from || mek.key.remoteJid, { text }, { quoted: mek }));
    const chat = ctx.from || mek.key?.remoteJid;
    const query = String(ctx.q || '').trim();

    try {
        if (!query) return reply('⚠️ Drama ka naam likho.\nExample: *.drama Ertugrul episode*');
        if (/youtube\.com\/|youtu\.be\//i.test(query)) {
            return reply('❌ Link nahi, sirf drama ka naam likho.');
        }

        await reply('🔎 Drama search ho raha hai, please wait…');
        const search = await yts(query);
        const video = (search.videos || []).find(item => Number(item.seconds) >= 900);
        if (!video) return reply('❌ 15 minutes ya usse lamba suitable drama nahi mila.');

        const caption = [
            '╭━━〔 🎬 SAQIB DRAMA DOWNLOADER 〕━━╮',
            `┃ 🎞️ Title: ${video.title}`,
            `┃ ⏱️ Duration: ${video.timestamp}`,
            `┃ 👁️ Views: ${Number(video.views || 0).toLocaleString()}`,
            `┃ 📺 Channel: ${video.author?.name || 'Unknown'}`,
            '┃',
            '┃ ⏳ Download shuru hai... (3-10 min lag sakte hain)',
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            `\n${config.BOT_FOOTER || '© MR SAQIB MD'}`
        ].join('\n');

        await conn.sendMessage(chat, {
            image: { url: video.thumbnail },
            caption
        }, { quoted: mek }).catch(() => reply(caption));

        // Seedha download aur send — koi reply ki zaroorat nahi
        let dl = null;
        try {
            await conn.sendMessage(chat, { react: { text: '⏳', key: mek.key } }).catch(() => {});

            // Apne server par yt-dlp se download (koi third-party API nahi)
            dl = await mediaDl.downloadFullVideoFile(video.url, { maxBytes: 400 * 1024 * 1024 });

            const title = cleanFileName(video.title);
            const mb = (dl.size / 1048576).toFixed(0);
            const cap = `🎬 *${video.title}*\n📦 ${mb} MB · ${dl.height}p\n\n${config.BOT_FOOTER || 'MR SAQIB MD'}`;
            try {
                await conn.sendMessage(chat, { video: { url: dl.path }, mimetype: 'video/mp4', caption: cap }, { quoted: mek });
            } catch (e) {
                // video send fail ho to document ke tor par bhej do
                console.warn('[SAQIB DRAMA] video send failed, trying document:', e.message);
                await conn.sendMessage(chat, { document: { url: dl.path }, mimetype: 'video/mp4', fileName: `${title}.mp4`, caption: cap }, { quoted: mek });
            }
            await conn.sendMessage(chat, { react: { text: '✅', key: mek.key } }).catch(() => {});
        } catch (error) {
            console.error('[SAQIB DRAMA] Failed:', error.details || error.message);
            await conn.sendMessage(chat, { react: { text: '❌', key: mek.key } }).catch(() => {});
            const why = mediaDl.explainError(error);
            await reply('❌ Drama download/send nahi ho saki.' + (why ? '\n\n💡 ' + why : '\nThori der baad dobara try karo.'));
        } finally {
            if (dl && dl.cleanup) dl.cleanup();
        }
    } catch (error) {
        console.error('[SAQIB DRAMA] Command failed:', error.message);
        return reply('❌ Drama search mein error aaya. Thori dair baad dobara try karo.');
    }
});
