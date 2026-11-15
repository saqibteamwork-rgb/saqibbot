const { cmd } = require("../command");
const tiktokCommand = require("../commands/tiktok");

cmd({
    pattern: "tiktok",
    alias: ["tt", "ttdl", "tik", "tktok"],
    desc: "Download TikTok videos and photo slides without watermark (Auto Best Server)",
    category: "download",
    react: "🎵",
    filename: __filename
}, async (conn, mek, m, { from, q }) => {
    await tiktokCommand(conn, from, mek, q, "tiktok");
});

cmd({
    pattern: "tiktok1",
    alias: ["tt1", "ttdl1"],
    desc: "Download TikTok videos (Server 1: TikWM HD)",
    category: "download",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, q }) => {
    await tiktokCommand(conn, from, mek, q, "tiktok1");
});

cmd({
    pattern: "tiktok2",
    alias: ["tt2", "ttdl2"],
    desc: "Download TikTok videos (Server 2: SSSTik Fast)",
    category: "download",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, q }) => {
    await tiktokCommand(conn, from, mek, q, "tiktok2");
});

cmd({
    pattern: "tiktok3",
    alias: ["tt3", "ttdl3"],
    desc: "Download TikTok videos (Server 3: Ruhend Engine)",
    category: "download",
    react: "🎬",
    filename: __filename
}, async (conn, mek, m, { from, q }) => {
    await tiktokCommand(conn, from, mek, q, "tiktok3");
});
