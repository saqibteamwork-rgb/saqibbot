const axios = require("axios");
const { cmd } = require("../command");

cmd({
  pattern: "mediafire",
  alias: ["mfire", "mfdownload", "mf"],
  react: '📥',
  desc: "Download any file from MediaFire (supports .mp4, .apk, .zip, .js, documents, etc.)",
  category: "download",
  use: ".mediafire <MediaFire URL>",
  filename: __filename
}, async (conn, mek, m, { from, reply, args }) => {
  try {
    const url = args.join(" ").trim();
    if (!url || !url.includes("mediafire.com")) {
      return reply("❌ Please provide a valid MediaFire URL\nExample: .mediafire https://www.mediafire.com/file/...");
    }

    await conn.sendMessage(from, { react: { text: '⏳', key: m.key } }).catch(() => {});

    let fileInfo = null;

    // Source 1: Backend Tioo API (from D:\mybot)
    try {
      const res = await axios.get(`https://backend1.tioo.eu.org/MediaFire?url=${encodeURIComponent(url)}`, { timeout: 15000 });
      if (res.data?.status && res.data?.url) {
        fileInfo = {
          fileName: res.data.filename || 'MediaFire_File',
          downloadUrl: res.data.url,
          filesize: res.data.filesize || res.data.filesizeH || 'Unknown',
          mimetype: res.data.mimetype || 'application/octet-stream'
        };
      }
    } catch (_) {}

    // Source 2: Deline API Fallback
    if (!fileInfo) {
      try {
        const res = await axios.get(`https://api.deline.web.id/downloader/mediafire?url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (res.data?.status && res.data?.result?.downloadUrl) {
          fileInfo = {
            fileName: res.data.result.fileName || 'MediaFire_File',
            downloadUrl: res.data.result.downloadUrl,
            filesize: res.data.result.size || 'Unknown',
            mimetype: 'application/octet-stream'
          };
        }
      } catch (_) {}
    }

    // Source 3: Gifted API Fallback
    if (!fileInfo) {
      try {
        const res = await axios.get(`https://api.giftedtech.my.id/api/download/mediafire?url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (res.data?.success && res.data?.result?.download_url) {
          fileInfo = {
            fileName: res.data.result.filename || 'MediaFire_File',
            downloadUrl: res.data.result.download_url,
            filesize: res.data.result.filesize || 'Unknown',
            mimetype: res.data.result.filetype || 'application/octet-stream'
          };
        }
      } catch (_) {}
    }

    if (!fileInfo || !fileInfo.downloadUrl) {
      await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
      return reply("❌ Failed to fetch MediaFire download link. Invalid URL or API offline.");
    }

    const fileName = fileInfo.fileName;
    const downloadUrl = fileInfo.downloadUrl;
    const ext = fileName.split('.').pop().toLowerCase();
    let mimetype = fileInfo.mimetype || 'application/octet-stream';
    if (ext === 'mp4') mimetype = 'video/mp4';
    else if (ext === 'apk') mimetype = 'application/vnd.android.package-archive';
    else if (ext === 'zip') mimetype = 'application/zip';
    else if (ext === 'js') mimetype = 'text/javascript';
    else if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'].includes(ext)) mimetype = 'application/octet-stream';

    const caption =
`╭━━━〔 📁 *MEDIAFIRE DOWNLOAD* 〕━━━┈⊷
┃ 📄 *File:* ${fileName}
┃ 📦 *Size:* ${fileInfo.filesize}
┃ 🔤 *Ext:* .${ext}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Powered by MR SAQIB MD*`;

    await conn.sendMessage(from, {
      document: { url: downloadUrl },
      fileName: fileName,
      mimetype: mimetype,
      caption: caption
    }, { quoted: mek });

    await conn.sendMessage(from, { react: { text: '✅', key: m.key } }).catch(() => {});

  } catch (error) {
    console.error("MediaFire Error:", error);
    await conn.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
    reply(`❌ MediaFire download failed: ${error.message}`);
  }
});
