// commands/apk.js
'use strict';

const axios = require('axios');
const settings = require('../settings');

/**
 * High-Speed APK Downloader with multi-source fallback
 */
async function apkCommand(sock, chatId, message, args = []) {
    try {
        let appName = (args || []).join(' ').trim();
        if (!appName) {
            const userMessage =
                message.message?.conversation ||
                message.message?.extendedTextMessage?.text ||
                '';
            appName = userMessage.split(' ').slice(1).join(' ').trim();
        }

        if (!appName) {
            return await sock.sendMessage(
                chatId,
                { text: '⚠️ *Please provide an app name!*\nExample: `.apk WhatsApp` or `.apk Free Fire`' },
                { quoted: message }
            );
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } }).catch(() => {});

        let apkData = null;

        // Source 1: PrinceTech APK API (from D:\mybot)
        try {
            const res = await axios.get(`https://api.princetechn.com/api/download/apkdl?apikey=prince&appName=${encodeURIComponent(appName)}`, { timeout: 15000 });
            if (res.data?.result?.dllink) {
                apkData = {
                    name: res.data.result.name || appName,
                    size: res.data.result.size || 'Unknown',
                    package: res.data.result.package || 'com.app',
                    lastup: res.data.result.lastup || 'Recent',
                    icon: res.data.result.icon,
                    dllink: res.data.result.dllink
                };
            }
        } catch (_) {}

        // Source 2: BK9 APK API Fallback
        if (!apkData) {
            try {
                const res = await axios.get(`https://bk9.fun/download/apk?q=${encodeURIComponent(appName)}`, { timeout: 15000 });
                if (res.data?.BK9?.dllink) {
                    const r = res.data.BK9;
                    apkData = {
                        name: r.name || appName,
                        size: r.size || 'Unknown',
                        package: r.package || 'com.app',
                        lastup: r.lastup || 'Recent',
                        icon: r.icon,
                        dllink: r.dllink
                    };
                }
            } catch (_) {}
        }

        // Source 3: NexOracle Fallback
        if (!apkData) {
            try {
                const res = await axios.get(`https://api.nexoracle.com/downloader/apk?apikey=free_key@maher_apis&q=${encodeURIComponent(appName)}`, { timeout: 15000 });
                if (res.data?.result?.dllink) {
                    const r = res.data.result;
                    apkData = {
                        name: r.name || appName,
                        size: r.size || 'Unknown',
                        package: r.package || 'com.app',
                        lastup: r.lastup || 'Recent',
                        icon: r.icon,
                        dllink: r.dllink
                    };
                }
            } catch (_) {}
        }

        if (!apkData || !apkData.dllink) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }).catch(() => {});
            return await sock.sendMessage(
                chatId,
                { text: `❌ *APK not found for "${appName}".* Please check the name or try another app.` },
                { quoted: message }
            );
        }

        const caption =
`╭━━━〔 📱 *APK DOWNLOADER* 〕━━━┈⊷
┃ 🏷️ *App:* ${apkData.name}
┃ 📦 *Package:* ${apkData.package}
┃ 📏 *Size:* ${apkData.size}
┃ 📅 *Updated:* ${apkData.lastup}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Powered by MR SAQIB MD*`;

        // Send thumbnail preview if available
        if (apkData.icon) {
            await sock.sendMessage(
                chatId,
                {
                    image: { url: apkData.icon },
                    caption: `📦 *Preparing download for ${apkData.name} (${apkData.size})...*`
                },
                { quoted: message }
            ).catch(() => {});
        }

        // Send direct document URL streaming to avoid RAM overload
        await sock.sendMessage(
            chatId,
            {
                document: { url: apkData.dllink },
                mimetype: 'application/vnd.android.package-archive',
                fileName: `${apkData.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.apk`,
                caption
            },
            { quoted: message }
        );

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } }).catch(() => {});
    } catch (err) {
        console.error('❌ Error in apkCommand:', err);
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }).catch(() => {});
        await sock.sendMessage(
            chatId,
            { text: `❌ Download error: ${err.message}` },
            { quoted: message }
        ).catch(() => {});
    }
}

module.exports = apkCommand;
