// plugins/video.js — YouTube video download, LOCAL (yt-dlp), no API needed
const yts = require('yt-search');
const { cmd } = require('../arslan');
const { fakevCard } = require('../lib/fakevCard');
const mediaDl = require('../lib/media-dl');

cmd({
    pattern: 'video',
    alias: ['vid', 'playvideo', 'ytmp4', 'mp4'],
    desc: 'Download YouTube video',
    category: 'download',
    react: '🎬',
    use: '.video <name or youtube link>',
    filename: __filename
}, async (conn, mek, m, { from, reply, text }) => {
    try {
        const query = String(text || '').trim();
        if (!query) return reply('❌ Example:\n.video pasoori');

        let vid;
        if (/youtube\.com|youtu\.be/i.test(query)) {
            const r = await yts(query);
            vid = r?.videos?.[0] || { url: query, title: 'YouTube Video', timestamp: 'Unknown', thumbnail: null };
        } else {
            const search = await yts(query);
            if (!search.videos.length) return reply('❌ No video found');
            vid = search.videos[0];
        }

        // keep long videos away from the server (WhatsApp/limits)
        if (vid.seconds && vid.seconds > 20 * 60) {
            return reply('❌ Video 20 minute se lambi hai. Chhoti video try karo.');
        }

        const caption =
`╔ஜ۩▒█ AMAN-ᴍᴅ █▒۩ஜ╗
┃🎬 VIDEO FOUND
┃📌 Title: ${vid.title}
┃⏱️ Duration: ${vid.timestamp}
┃⚡ Sending video...
╰━━━━━━━━━━━━━━⊷`;

        if (vid.thumbnail) {
            await conn.sendMessage(from, { image: { url: vid.thumbnail }, caption }, { quoted: fakevCard }).catch(() => reply(caption));
        } else {
            await reply(caption);
        }

        const { buffer } = await mediaDl.downloadVideo(vid.url, 720);
        if (buffer.length > mediaDl.MAX_BYTES) return reply('❌ Video bohat bari hai (100MB+).');

        await conn.sendMessage(from, {
            video: buffer,
            mimetype: 'video/mp4',
            caption: `🎬 *${vid.title}*\n\n> © AMAN-ᴍᴅ`
        }, { quoted: fakevCard });
    } catch (err) {
        console.error('[VIDEO]', err.details || err.message);
        const why = mediaDl.explainError(err);
        reply('❌ Video download nahi ho saki.' + (why ? '\n\n💡 ' + why : '\nThori der baad try karo.'));
    }
});
