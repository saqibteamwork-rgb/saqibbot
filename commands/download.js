// commands/download.js
'use strict';

/**
 * Universal Auto-Downloader
 * Automatically inspects the URL and downloads from YouTube, Instagram, TikTok, Facebook, CapCut, etc.
 */

const { ytmp4Command, ytmp3Command } = require('./yt');
const tiktokCommand = require('./tiktok');
const instagramCommand = require('./instagram');
const facebookCommand = require('./facebook');
const { capcutCommand } = require('./capcut');

async function downloadCommand(sock, from, msg, args = []) {
    const url = args[0]?.trim();
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 ⚡ *UNIVERSAL DOWNLOADER* ⚡ 〕━━━┈⊷
┃ 📥 *Supported Platforms:*
┃ • YouTube (Video & Audio)
┃ • TikTok (No watermark)
┃ • Instagram (Reels & Posts)
┃ • Facebook (HD Video)
┃ • CapCut Templates
┃
┃ 📌 *Usage:*
┃ 👉 *.dl <any media link>*
┃ 👉 *.download <any media link>*
┃
┃ 💡 *Example:*
┃ .dl https://youtube.com/watch?v=...
┃ .dl https://vt.tiktok.com/...
┃ .dl https://instagram.com/reel/...
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const lower = url.toLowerCase();

    if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
        return await ytmp4Command(sock, from, msg, args);
    } else if (lower.includes('tiktok.com') || lower.includes('douyin.com')) {
        return await tiktokCommand(sock, from, msg, url);
    } else if (lower.includes('instagram.com')) {
        return await instagramCommand(sock, from, msg, url);
    } else if (lower.includes('facebook.com') || lower.includes('fb.watch')) {
        return await facebookCommand(sock, from, msg, url);
    } else if (lower.includes('capcut.com')) {
        return await capcutCommand(sock, from, msg, args);
    } else {
        // Fallback: try YouTube downloader or report
        try {
            return await ytmp4Command(sock, from, msg, args);
        } catch {
            return await sock.sendMessage(from, {
                text: "❌ Yeh link support nahi hua. Direct specific command try karein: `.ytmp4`, `.ig`, `.tiktok`, `.fb`."
            }, { quoted: msg });
        }
    }
}

module.exports = { downloadCommand };
