'use strict';

/**
 * MR SAQIB MD :: AUTO-READ (BLUE TICKS) CONTROLLER
 * ============================================================================
 * - Automatically marks all incoming private messages & group chats as read (blue ticks)
 * - Persisted per-user session in botData & MongoDB Atlas
 * - Fallback compatibility with legacy data/autoread.json
 * - Command: .autoread on / off / status
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const settings = require('../settings');

const configPath = path.join(__dirname, '..', 'data', 'autoread.json');

// In-memory cache to prevent blocking disk I/O
let cachedConfig = null;

function initConfig() {
    if (cachedConfig) return cachedConfig;
    try {
        if (!fs.existsSync(configPath)) {
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            fs.writeFileSync(configPath, JSON.stringify({ enabled: false }, null, 2));
            cachedConfig = { enabled: false };
        } else {
            cachedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) {
        cachedConfig = { enabled: false };
    }
    return cachedConfig;
}

function toBold(text) {
    const boldChars = {
        'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
    };
    return String(text).split('').map(c => boldChars[c] || c).join('');
}

/**
 * .autoread on/off Command Handler
 * Supports both standard: (sock, from, msg, isOwner, botData, saveBotData, userId, args)
 * and legacy: (sock, chatId, message)
 */
async function autoreadCommand(sock, from, msg, isOwner, botData, saveBotData, userId, args) {
    try {
        const chatId = from;
        const message = msg;

        // Determine owner permission
        const isSelf = message?.key?.fromMe === true;
        const hasOwnerAccess = isOwner === true || isSelf;

        if (!hasOwnerAccess) {
            return await sock.sendMessage(chatId, {
                text: '❌ *Access Denied:* Sirf Bot Owner hi `.autoread` use kar sakta hai.',
                quoted: message
            });
        }

        // Extract action argument
        let action = '';
        if (Array.isArray(args) && args.length > 0) {
            action = String(args[0]).toLowerCase();
        } else {
            const rawText = message?.message?.conversation || 
                            message?.message?.extendedTextMessage?.text || 
                            message?.message?.imageMessage?.caption || 
                            message?.message?.videoMessage?.caption || '';
            const parts = rawText.trim().split(/\s+/);
            action = parts[1] ? parts[1].toLowerCase() : '';
        }

        // Resolve user session settings
        let currentStatus = false;
        if (botData && userId) {
            if (!botData.statusSettings) botData.statusSettings = {};
            if (!botData.statusSettings[userId]) {
                botData.statusSettings[userId] = { autoRead: false };
            }
            if (typeof botData.statusSettings[userId].autoRead === 'undefined') {
                botData.statusSettings[userId].autoRead = false;
            }
            currentStatus = botData.statusSettings[userId].autoRead;
        } else {
            currentStatus = isAutoreadEnabled();
        }

        // 1. Show Status / Help Menu
        if (!action || action === 'status' || action === 'check') {
            const menuText =
                `╭━━━〔 📖 ${toBold("AUTO-READ CONTROLLER")} 〕━━━┈⊷\n` +
                `┃ 📌 ${toBold("Current Status:")} ${currentStatus ? '🟢 ON' : '🔴 OFF'}\n` +
                `┃ 👁️ ${toBold("Blue Ticks:")} ${currentStatus ? 'Active' : 'Disabled'}\n` +
                `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
                `┃ 💡 *Available Options:*\n` +
                `┃   • \`.autoread on\`  ➜ Auto-read sabhi messages (Blue Ticks)\n` +
                `┃   • \`.autoread off\` ➜ Auto-read band karein\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;
            return await sock.sendMessage(chatId, { text: menuText }, { quoted: message });
        }

        // 2. Turn ON
        if (action === 'on' || action === 'enable' || action === '1' || action === 'start') {
            if (botData && userId) {
                botData.statusSettings[userId].autoRead = true;
                if (typeof saveBotData === 'function') saveBotData();
            }
            const config = initConfig();
            config.enabled = true;
            cachedConfig = config;
            try { fs.writeFileSync(configPath, JSON.stringify(config, null, 2)); } catch (_) {}

            const replyText =
                `╭━━━〔 📖 ${toBold("AUTO-READ: ACTIVATED")} 〕━━━┈⊷\n` +
                `┃ 🟢 ${toBold("Status:")} ON (Active)\n` +
                `┃ 💬 Sabhi incoming messages automatically\n` +
                `┃    read (Blue Ticks) ho jayenge!\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;
            return await sock.sendMessage(chatId, { text: replyText }, { quoted: message });
        }

        // 3. Turn OFF
        if (action === 'off' || action === 'disable' || action === '0' || action === 'stop') {
            if (botData && userId) {
                botData.statusSettings[userId].autoRead = false;
                if (typeof saveBotData === 'function') saveBotData();
            }
            const config = initConfig();
            config.enabled = false;
            cachedConfig = config;
            try { fs.writeFileSync(configPath, JSON.stringify(config, null, 2)); } catch (_) {}

            const replyText =
                `╭━━━〔 📖 ${toBold("AUTO-READ: DEACTIVATED")} 〕━━━┈⊷\n` +
                `┃ 🔴 ${toBold("Status:")} OFF (Disabled)\n` +
                `┃ 💬 Messages ab automatically read nahi honge.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;
            return await sock.sendMessage(chatId, { text: replyText }, { quoted: message });
        }

        // Invalid argument
        return await sock.sendMessage(chatId, {
            text: `❌ Invalid option! Use: \`.autoread on\` ya \`.autoread off\``,
            quoted: message
        });

    } catch (error) {
        console.error('Error in autoread command:', error);
        await sock.sendMessage(from, {
            text: `❌ Error processing .autoread: ${error.message}`,
            quoted: msg
        });
    }
}

/**
 * Check if global fallback autoread is enabled
 */
function isAutoreadEnabled() {
    try {
        const config = initConfig();
        return Boolean(config && config.enabled);
    } catch (error) {
        return false;
    }
}

/**
 * Handle incoming message for auto-read (marks blue ticks in WhatsApp)
 */
async function handleAutoread(sock, message, userId = null, botData = null) {
    if (!sock || !message || !message.key) return false;

    // Never mark own outgoing messages or status stories
    if (message.key.fromMe) return false;
    const remoteJid = message.key.remoteJid || '';
    if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) {
        return false;
    }

    // Determine if auto-read is enabled for this session
    let isEnabled = false;
    if (userId && botData?.statusSettings?.[userId]?.autoRead !== undefined) {
        isEnabled = Boolean(botData.statusSettings[userId].autoRead);
    } else {
        isEnabled = isAutoreadEnabled();
    }

    if (!isEnabled) return false;

    // Mark message as read (Blue Ticks)
    try {
        await sock.readMessages([message.key]);
        return true;
    } catch (e) {
        // Silent catch to prevent spamming logs
        return false;
    }
}

module.exports = {
    autoreadCommand,
    isAutoreadEnabled,
    handleAutoread
};
