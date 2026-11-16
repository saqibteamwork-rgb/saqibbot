const { cmd } = require('../arslan');
const axios = require('axios');
const mediaDl = require('../lib/media-dl');

cmd({
  pattern: "fb",
  react: "☺️",
  alias: ["facebook", "fbdl"],
  category: "download",
  filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
  let localWhy = '';
  try {
    if (!q) return reply("*AP NE KOI FACEBOOK VIDEO DOWNLOAD KARNI HAI 🤔 TO AP US FACEBOOK VIDEO KA LINK COPY KAR LO 🤗*\n*PHIR ESE LIKHO ☺️*\n\n*FB ❮FACEBOOK VIDEO LINK❯*\n\n*JAB AP ESE LIKHO GE 😇 TO APKI FACEBOOK VIDEO DOWNLOAD KAR KE 😃 YAHA PER BHEJ DE JAYE GE 😍♥️*");

    // 1) LOCAL (no API) via yt-dlp
    try {
      const local = await mediaDl.downloadAnyVideo(q.trim());
      return await conn.sendMessage(from, {
        video: local.buffer,
        mimetype: "video/mp4",
        caption: "*👑 FB VIDEO 👑*\n*👑 BY :❯ 𝗔𝗠𝗔𝗡-𝐌𝐃 👑*"
      }, { quoted: mek });
    } catch (localErr) {
      localWhy = mediaDl.explainError(localErr);
      console.warn('[FB] local download failed, trying API:', localErr.message, localErr.details || '');
    }

    // 2) fallback: public API
    const apiUrl = `https://movanest.xyz/v2/fbdown?url=${encodeURIComponent(q)}`;
    const res = await axios.get(apiUrl);
    const data = res.data;

    // 🔎 API status check
    if (data.status !== true) {
      return reply("API ERROR 😢");
    }

    // 🔎 Results check
    if (!Array.isArray(data.results) || data.results.length === 0) {
      return reply("*FACEBOOK VIDEO NAHI MIL RAHI 🥺*");
    }

    const result = data.results[0];

    // 🎥 Quality selection (API ke mutabiq)
    const videoUrl = result.hdQualityLink
      ? result.hdQualityLink
      : result.normalQualityLink;

    if (!videoUrl) {
      return reply("*SIRF FACEBOOK VIDEO KA LINK DO ☺️*");
    }

    // 📝 Caption API data se
    const caption = `*👑 FB VIDEO 👑*
*👑 TIME :❯ ${result.duration}*
*👑 CREATER :❯ ${data.creator}*
*👑 BY :❯ 𝗔𝗠𝗔𝗡-𝐌𝐃 👑*`;

    await conn.sendMessage(
      from,
      {
        video: { url: videoUrl },
        mimetype: "video/mp4",
        caption: caption
      },
      { quoted: mek }
    );

  } catch (err) {
    console.log(err);
    reply("❌ Facebook video download nahi ho saki." + (localWhy ? "\n\n💡 " + localWhy : ""));
  }
});
