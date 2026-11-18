// plugins/autodl.js — MR SAQIB MD: Auto URL & Reel Downloader
// ============================================================================
//   .autodl on | off          → Is chat mein Auto-Downloader chalu ya band karein
//   .autodl status            → Current chat status aur statistics dekhein
//   .autodl global on | off   → Sabhi chats ke liye default toggle (Owner only)
// ============================================================================

const { cmd } = require('../command');
const autoDownloader = require('../utils/autoDownloader');
const config = require('../config');

const P = () => config.prefix || config.PREFIX || '.';

cmd({
    pattern: 'autodl',
    alias: ['autoreel', 'autodownload', 'autolink'],
    desc: 'Chat mein Auto URL & Reel downloader toggle karein',
    category: 'download',
    react: '📥',
    use: '.autodl on | off | status | global on/off',
    filename: __filename
}, async (conn, mek, m, { args, reply, from, isOwner, isAdmin, isGroup }) => {
    const sub = String(args[0] || '').toLowerCase();

    if (sub === 'on') {
        if (isGroup && !isAdmin && !isOwner) {
            return reply('❌ *Access Denied:* Sirf Group Admin ya Bot Owner hi Auto-Downloader ON kar sakte hain.');
        }
        autoDownloader.setChatEnabled(from, true);
        return reply(
            `📥 *MR SAQIB MD :: AUTO DOWNLOADER ON* 📥\n\n` +
            `✅ *Status:* Activated for this chat\n\n` +
            `🎬 *Supported Links:*\n` +
            `• Instagram Reels & Posts\n` +
            `• TikTok Videos (No Watermark)\n` +
            `• Facebook Reels & Videos\n` +
            `• YouTube Shorts\n\n` +
            `💡 _Ab koi bhi link send karega to bot bina kisi command ke video download karke bhej dega!_`
        );
    }

    if (sub === 'off') {
        if (isGroup && !isAdmin && !isOwner) {
            return reply('❌ *Access Denied:* Sirf Group Admin ya Bot Owner hi Auto-Downloader OFF kar sakte hain.');
        }
        autoDownloader.setChatEnabled(from, false);
        return reply('🔇 *MR SAQIB MD :: AUTO DOWNLOADER OFF*\nIs chat mein Auto URL downloader band kar diya gaya hai.');
    }

    if (sub === 'global') {
        if (!isOwner) return reply('❌ *Access Denied:* Sirf Bot Owner hi global setting change kar sakte hain.');
        const mode = String(args[1] || '').toLowerCase();
        if (mode === 'on') {
            autoDownloader.setGlobalEnabled(true);
            return reply('✅ *Global Auto-Downloader ON:* Saare chats mein default active ho gaya hai.');
        } else if (mode === 'off') {
            autoDownloader.setGlobalEnabled(false);
            return reply('🔇 *Global Auto-Downloader OFF:* Saare chats mein default band kar diya gaya hai.');
        } else {
            return reply(`Format: \`${P()}autodl global on | off\``);
        }
    }

    // Default: Status & Help card
    const isEnabled = autoDownloader.isChatEnabled(from);
    const stats = autoDownloader.getStats();

    return reply(
        `╔══════════════════════════╗\n` +
        `   📥 *AUTO REEL DOWNLOADER* 📥\n` +
        `╚══════════════════════════╝\n\n` +
        `🔘 *Chat Status:* ${isEnabled ? 'ON ✅ (Active)' : 'OFF ❌ (Disabled)'}\n` +
        `🌐 *Global Default:* ${autoDownloader.getState().globalEnabled ? 'ON ✅' : 'OFF ❌'}\n\n` +
        `📊 *Total Auto-Downloads:* ${stats.total || 0}\n` +
        `• 📸 Instagram: ${stats.instagram || 0}\n` +
        `• 🎵 TikTok: ${stats.tiktok || 0}\n` +
        `• 📘 Facebook: ${stats.facebook || 0}\n` +
        `• 🔴 YouTube Shorts: ${stats.youtube || 0}\n\n` +
        `📌 *COMMAND GUIDE:*\n` +
        `• \`${P()}autodl on\` → Turn ON in this chat\n` +
        `• \`${P()}autodl off\` → Turn OFF in this chat\n` +
        `• \`${P()}autodl status\` → View status & stats\n` +
        `• \`${P()}autodl global on | off\` → Toggle globally (Owner)\n\n` +
        `⚡ *Powered by MR SAQIB MD*`
    );
});

module.exports = autoDownloader;
