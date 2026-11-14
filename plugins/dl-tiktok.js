const { cmd } = require("../command");
const tiktokCommand = require("../commands/tiktok");

cmd({
    pattern: "tiktok",
    alias: ["tt", "ttdl", "tik", "tktok"],
    desc: "Download TikTok videos and photo slides without watermark",
    category: "download",
    react: "🎵",
    filename: __filename
}, async (conn, mek, m, { from, q }) => {
    await tiktokCommand(conn, from, mek, q);
});

cmd({
    pattern: "tiktok2",
    alias: ["tt2", "ttdl2"],
    desc: "Download TikTok videos and photo slides (Mirror 2)",
    category: "download",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, q }) => {
    await tiktokCommand(conn, from, mek, q);
});

cmd({
    pattern: "tiktok3",
    alias: ["tt3", "ttdl3"],
    desc: "Download HD TikTok videos and photo slides (Mirror 3)",
    category: "download",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, q }) => {
    await tiktokCommand(conn, from, mek, q);
});
