'use strict';

const { cmd } = require('../arslan');
const axios = require('axios');

const API_TIMEOUT = 30000;
const API_HEADERS = { 'User-Agent': 'SAQIB-MD/1.0 (Aptoide app search)' };

function cleanFileName(value) {
  return String(value || 'app')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'app';
}

cmd({
  pattern: 'apk',
  alias: ['app', 'playstore', 'application'],
  desc: 'Search and download an Android APK from Aptoide',
  category: 'download',
  react: '📦',
  use: '.apk <app name>',
  filename: __filename
}, async (conn, mek, m, { from, reply, q }) => {
  try {
    const query = String(q || '').trim();
    if (!query) {
      return reply('📦 *SAQIB APK DOWNLOADER*\n\nUse: `.apk WhatsApp`\n\nApp ka naam likhein jise search karna hai.');
    }
    if (query.length > 100) return reply('❌ App name 100 characters se chhota rakhein.');

    await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } });

    const apiUrl = `https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=1`;
    const response = await axios.get(apiUrl, {
      timeout: API_TIMEOUT,
      headers: API_HEADERS,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 300
    });
    const list = response.data?.datalist?.list;
    if (!Array.isArray(list) || list.length === 0) {
      await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
      return reply('⚠️ Is naam ki app Aptoide par nahi mili. App ka naam check karke dobara try karein.');
    }

    const app = list[0];
    const downloadUrl = app?.file?.path_alt || app?.file?.path || app?.file?.pathAlt;
    if (!downloadUrl || !/^https:\/\//i.test(downloadUrl)) {
      await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
      return reply('❌ Aptoide ne valid HTTPS download link nahi diya. Baad mein dobara try karein.');
    }

    const sizeBytes = Number(app.size || app.file?.size || 0);
    const sizeText = sizeBytes > 0 ? `${(sizeBytes / 1048576).toFixed(2)} MB` : 'Unknown';
    const appName = String(app.name || query);
    const packageName = String(app.package || 'Unknown');
    const developer = String(app.developer?.name || 'Unknown');
    const version = String(app.file?.vername || app.file?.vercode || 'Unknown');
    const updated = String(app.updated || 'Unknown');
    const caption = [
      '╭━━━〔 📦 SAQIB APK DOWNLOADER 〕━━━',
      `┃ 📱 Name: ${appName}`,
      `┃ 📦 Size: ${sizeText}`,
      `┃ 🆔 Package: ${packageName}`,
      `┃ 🔖 Version: ${version}`,
      `┃ 📅 Updated: ${updated}`,
      `┃ 👨‍💻 Developer: ${developer}`,
      '╰━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '⚠️ Install karne se pehle app aur developer verify karein. APK sirf trusted source se install karein.',
      '— MR SAQIB MD'
    ].join('\n');

    await conn.sendMessage(from, { react: { text: '⬆️', key: mek.key } });
    await conn.sendMessage(from, {
      document: { url: downloadUrl },
      fileName: `${cleanFileName(appName)}.apk`,
      mimetype: 'application/vnd.android.package-archive',
      caption
    }, { quoted: mek });
    await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });
  } catch (error) {
    console.error('[APK Downloader]', error?.message || error);
    try { await conn.sendMessage(from, { react: { text: '❌', key: mek.key } }); } catch (_) {}
    return reply('❌ APK fetch/download fail ho gaya. Aptoide service ya network busy ho sakta hai; baad mein try karein.');
  }
});
