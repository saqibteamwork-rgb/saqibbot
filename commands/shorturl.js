// commands/shorturl.js
'use strict';

const axios = require('axios');
const settings = require('../settings');

function getApiBaseUrl() {
    let base = settings.cameraApiUrl || process.env.CAMERA_API_URL || 'https://earnpk92-two.vercel.app';
    return base.replace(/\/+$/, '');
}

async function shorturlCommand(sock, from, msg, args = []) {
    const rawUrl = args[0]?.trim();
    if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 🔗 *URL SHORTENER* 〕━━━┈⊷
┃ 📌 *Usage:*
┃ 👉 *.shorturl <link> [custom_alias]*
┃ 👉 *.shorten <link> [custom_alias]*
┃ 👉 *.tinyurl <link>*
┃
┃ 💡 *Examples:*
┃ .shorturl https://google.com
┃ .shorturl https://google.com mylink
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const customAlias = args[1]?.trim() ? args[1].trim().replace(/[^a-zA-Z0-9_-]/g, '') : undefined;

    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

    // 1. Try our high-speed earnpk92 URL shortener
    try {
        const sender = msg.key.participant || msg.participant || from || '';
        const senderNumber = sender.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') || '923468616487';

        const payload = {
            longUrl: rawUrl,
            phoneNumber: senderNumber,
            deviceId: `wa-${senderNumber}`
        };
        if (customAlias) {
            payload.customAlias = customAlias;
        }

        const res = await axios.post(`${getApiBaseUrl()}/api/shorten`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        if (res.data && res.data.success && res.data.shortUrl) {
            const short = res.data.shortUrl;
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            const text =
`╭━━━〔 🔗 *URL SHORTENED* 〕━━━┈⊷
┃ 🌐 *Original:* ${rawUrl}
┃ 🚀 *Short URL:* ${short}
${customAlias ? `┃ 🏷️ *Custom Alias:* ${customAlias}\n` : ''}┃ 📱 *Account ID:* ${senderNumber}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

💡 *Copy Link:*
\`${short}\``;
            return await sock.sendMessage(from, { text }, { quoted: msg });
        }
    } catch (localErr) {
        console.error('[Shortener API Error]:', localErr.response?.data || localErr.message);
    }

    // 2. Fallback to TinyURL if primary fails
    try {
        const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(rawUrl)}`, {
            timeout: 10000
        });
        const short = String(res.data).trim();

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

        const text =
`╭━━━〔 🔗 *SHORTENED URL (TinyURL)* 〕━━━┈⊷
┃ 🌐 *Original:* ${rawUrl}
┃ 🚀 *Short URL:* ${short}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

💡 *Copy Link:*
\`${short}\``;

        await sock.sendMessage(from, { text }, { quoted: msg });

    } catch (e) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, { text: `❌ URL shorten nahi ho saka: ${e.message}` }, { quoted: msg });
    }
}

module.exports = { shorturlCommand };
