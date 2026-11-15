'use strict';

/**
 * MR SAQIB MD :: STATUS & PRESENCE AUTOMATION CONTROLLER
 * ============================================================================
 * - Auto Status Seen / View (.statusseen / .autostatusseen / .autoview)
 * - Auto Status React / Like (.statusreact / .autostatusreact / .statuslike)
 * - Auto Typing Indicator (.autotyping / .typing)
 * - Auto Recording Indicator (.autorecording / .recording)
 * - Full Status Dashboard (.status / .autostatus)
 * ============================================================================
 */

const toBold = (text) => {
    const boldChars = {
        'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝘀', 'T': '𝘁', 'U': '𝘂', 'V': '𝘃', 'W': '𝘄', 'X': '𝘅', 'Y': '𝘆', 'Z': '𝘇',
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
    };
    return text.split('').map(c => boldChars[c] || c).join('');
};

function ensureStatusSettings(botData, userId) {
    if (!botData.statusSettings) botData.statusSettings = {};
    if (!botData.statusSettings[userId]) {
        botData.statusSettings[userId] = {
            autoStatus: false,
            autoSeen: false,
            autoLike: false,
            autoDownload: false,
            autoTyping: false,
            autoRecording: false,
            system: 1,
            isPublic: false
        };
    }
    // Ensure all keys exist
    const s = botData.statusSettings[userId];
    if (typeof s.autoStatus === 'undefined') s.autoStatus = false;
    if (typeof s.autoSeen === 'undefined') s.autoSeen = false;
    if (typeof s.autoLike === 'undefined') s.autoLike = false;
    if (typeof s.autoDownload === 'undefined') s.autoDownload = false;
    if (typeof s.autoTyping === 'undefined') s.autoTyping = false;
    if (typeof s.autoRecording === 'undefined') s.autoRecording = false;
    if (typeof s.autoRead === 'undefined') s.autoRead = false;
    return s;
}

/**
 * Main .status / .autostatus Controller & Dashboard
 */
async function statusCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args) {
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ Only owner can use this command." }, { quoted: msg });
    
    const settings = ensureStatusSettings(botData, userId);
    const action = args[0]?.toLowerCase();
    
    if (!action) {
        const menu =
            `╭━━━〔 ⚡ ${toBold("STATUS & PRESENCE AUTOMATION")} 〕━━━┈⊷\n` +
            `┃ 👁️ ${toBold("Auto Status Seen:")} ${settings.autoSeen ? '🟢 ON' : '🔴 OFF'}\n` +
            `┃ 💖 ${toBold("Auto Status React:")} ${settings.autoLike ? '🟢 ON' : '🔴 OFF'}\n` +
            `┃ 📖 ${toBold("Auto Read Msgs:")} ${settings.autoRead ? '🟢 ON' : '🔴 OFF'}\n` +
            `┃ ⌨️ ${toBold("Auto Typing:")} ${settings.autoTyping ? '🟢 ON' : '🔴 OFF'}\n` +
            `┃ 🎙️ ${toBold("Auto Recording:")} ${settings.autoRecording ? '🟢 ON' : '🔴 OFF'}\n` +
            `┃ 📥 ${toBold("Auto Download:")} ${settings.autoDownload ? '🟢 ON' : '🔴 OFF'}\n` +
            `┃ ⚙️ ${toBold("Master Status:")} ${settings.autoStatus ? '🟢 ON' : '🔴 OFF'}\n` +
            `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
            `┃ 💡 *Direct Commands:*\n` +
            `┃   • \`.autoread on/off\` (Auto Read Messages / Blue Ticks)\n` +
            `┃   • \`.statusseen on/off\` (Auto View Status)\n` +
            `┃   • \`.statusreact on/off\` (Auto React Status)\n` +
            `┃   • \`.autotyping on/off\` (Auto Typing Presence)\n` +
            `┃   • \`.autorecording on/off\` (Auto Recording)\n` +
            `┃   • \`.status on/off\` (Toggle All Features)\n` +
            `┃   • \`.status download on/off\` (Auto Save Status)\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;
        return await sock.sendMessage(from, { text: menu }, { quoted: msg });
    }

    if (action === 'on' || action === 'all') {
        settings.autoStatus = true;
        settings.autoSeen = true;
        settings.autoLike = true;
        saveBotData();
        return await sock.sendMessage(from, {
            text: `╭━━━〔 ✅ *ALL STATUS AUTOMATION: ON* 〕━━━┈⊷\n` +
                  `┃ 👁️ *Auto Status Seen:* ON\n` +
                  `┃ 💖 *Auto Status React:* ON\n` +
                  `┃ 🟢 Status updates will now be auto-seen and reacted!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else if (action === 'off') {
        settings.autoStatus = false;
        settings.autoSeen = false;
        settings.autoLike = false;
        settings.autoDownload = false;
        saveBotData();
        return await sock.sendMessage(from, {
            text: `╭━━━〔 ❌ *ALL STATUS AUTOMATION: OFF* 〕━━━┈⊷\n` +
                  `┃ 👁️ *Auto Status Seen:* OFF\n` +
                  `┃ 💖 *Auto Status React:* OFF\n` +
                  `┃ ⚪ Status automation has been disabled.\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else if (action === 'seen' || action === 'view') {
        return await statusseenCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args.slice(1));
    } else if (action === 'like' || action === 'react') {
        return await statusreactCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args.slice(1));
    } else if (action === 'typing') {
        return await autotypingCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args.slice(1));
    } else if (action === 'recording' || action === 'record') {
        return await autorecordingCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args.slice(1));
    } else if (action === 'download') {
        const val = args[1]?.toLowerCase();
        if (val === 'on' || val === 'enable' || val === '1') {
            settings.autoDownload = true;
            settings.autoStatus = true;
            saveBotData();
            return await sock.sendMessage(from, { text: "✅ *Auto Download Status Media: ON*" }, { quoted: msg });
        } else if (val === 'off' || val === 'disable' || val === '0') {
            settings.autoDownload = false;
            saveBotData();
            return await sock.sendMessage(from, { text: "❌ *Auto Download Status Media: OFF*" }, { quoted: msg });
        } else {
            return await sock.sendMessage(from, { text: `*Auto Download:* ${settings.autoDownload ? 'ON' : 'OFF'}\nUsage: \`.status download on/off\`` }, { quoted: msg });
        }
    } else {
        return await sock.sendMessage(from, { text: "❌ Invalid option! Use: `.status` to view menu or `.status on/off`" }, { quoted: msg });
    }
}

/**
 * .autotyping / .typing on/off - Auto Typing Presence Controller
 */
async function autotypingCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args) {
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ Only owner can use this command." }, { quoted: msg });

    const settings = ensureStatusSettings(botData, userId);
    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
        settings.autoTyping = true;
        settings.autoRecording = false; // Mutually exclusive
        saveBotData();
        await sock.sendPresenceUpdate('composing', from).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 ⌨️ *AUTO TYPING: ON* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Active & Enabled\n` +
                  `┃ ⚡ Bot ab chats me automatic "typing..." show karega!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else if (action === 'off' || action === 'disable' || action === '0') {
        settings.autoTyping = false;
        saveBotData();
        await sock.sendPresenceUpdate('paused', from).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 ⌨️ *AUTO TYPING: OFF* 〕━━━┈⊷\n` +
                  `┃ ❌ *Status:* Disabled / Off\n` +
                  `┃ ⚪ Bot ab automatic typing show nahi karega.\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else {
        const cur = settings.autoTyping;
        return await sock.sendMessage(from, {
            text: `╭━━━〔 ⌨️ *AUTO TYPING SETTINGS* 〕━━━┈⊷\n` +
                  `┃ ⋄ *Current Status:* ${cur ? '🟢 ON' : '🔴 OFF'}\n` +
                  `┃ ⋄ *Commands:*\n` +
                  `┃   • \`.autotyping on\`\n` +
                  `┃   • \`.autotyping off\`\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    }
}

/**
 * .autorecording / .recording on/off - Auto Recording Presence Controller
 */
async function autorecordingCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args) {
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ Only owner can use this command." }, { quoted: msg });

    const settings = ensureStatusSettings(botData, userId);
    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
        settings.autoRecording = true;
        settings.autoTyping = false; // Mutually exclusive
        saveBotData();
        await sock.sendPresenceUpdate('recording', from).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🎙️ *AUTO RECORDING: ON* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Active & Enabled\n` +
                  `┃ ⚡ Bot ab chats me automatic "recording audio..." show karega!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else if (action === 'off' || action === 'disable' || action === '0') {
        settings.autoRecording = false;
        saveBotData();
        await sock.sendPresenceUpdate('paused', from).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🎙️ *AUTO RECORDING: OFF* 〕━━━┈⊷\n` +
                  `┃ ❌ *Status:* Disabled / Off\n` +
                  `┃ ⚪ Bot ab automatic recording show nahi karega.\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else {
        const cur = settings.autoRecording;
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🎙️ *AUTO RECORDING SETTINGS* 〕━━━┈⊷\n` +
                  `┃ ⋄ *Current Status:* ${cur ? '🟢 ON' : '🔴 OFF'}\n` +
                  `┃ ⋄ *Commands:*\n` +
                  `┃   • \`.autorecording on\`\n` +
                  `┃   • \`.autorecording off\`\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    }
}

/**
 * .statusseen / .autostatusseen / .autoview / .statusview on/off - Auto Status Seen Controller
 */
async function statusseenCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args) {
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ Only owner can use this command." }, { quoted: msg });

    const settings = ensureStatusSettings(botData, userId);
    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
        settings.autoSeen = true;
        settings.autoStatus = true;
        saveBotData();
        return await sock.sendMessage(from, {
            text: `╭━━━〔 👁️ *AUTO STATUS SEEN: ON* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Active & Enabled\n` +
                  `┃ ⚡ Bot ab contacts ke har WhatsApp status ko\n` +
                  `┃    instant auto-view (seen) karega!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else if (action === 'off' || action === 'disable' || action === '0') {
        settings.autoSeen = false;
        if (!settings.autoLike && !settings.autoDownload) {
            settings.autoStatus = false;
        }
        saveBotData();
        return await sock.sendMessage(from, {
            text: `╭━━━〔 👁️ *AUTO STATUS SEEN: OFF* 〕━━━┈⊷\n` +
                  `┃ ❌ *Status:* Disabled / Off\n` +
                  `┃ ⚪ Bot ab automatic status view nahi karega.\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else {
        const cur = settings.autoSeen;
        return await sock.sendMessage(from, {
            text: `╭━━━〔 👁️ *AUTO STATUS SEEN SETTINGS* 〕━━━┈⊷\n` +
                  `┃ ⋄ *Current Status:* ${cur ? '🟢 ON' : '🔴 OFF'}\n` +
                  `┃ ⋄ *Commands:*\n` +
                  `┃   • \`.statusseen on\`\n` +
                  `┃   • \`.statusseen off\`\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    }
}

/**
 * .statusreact / .autostatusreact / .statuslike / .autolike on/off - Auto Status React Controller
 */
async function statusreactCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args) {
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ Only owner can use this command." }, { quoted: msg });

    const settings = ensureStatusSettings(botData, userId);
    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
        settings.autoLike = true;
        settings.autoStatus = true;
        saveBotData();
        return await sock.sendMessage(from, {
            text: `╭━━━〔 💖 *AUTO STATUS REACT: ON* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Active & Enabled\n` +
                  `┃ ✨ *Reaction Emojis:* ❤️ 🔥 ✨ ✅ 🙌 🌟 😍 💚 🌸 💯\n` +
                  `┃ ⚡ Bot ab contacts ke statuses par\n` +
                  `┃    automatically reactions send karega!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else if (action === 'off' || action === 'disable' || action === '0') {
        settings.autoLike = false;
        if (!settings.autoSeen && !settings.autoDownload) {
            settings.autoStatus = false;
        }
        saveBotData();
        return await sock.sendMessage(from, {
            text: `╭━━━〔 💖 *AUTO STATUS REACT: OFF* 〕━━━┈⊷\n` +
                  `┃ ❌ *Status:* Disabled / Off\n` +
                  `┃ ⚪ Bot ab status par reactions nahi lagayega.\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else {
        const cur = settings.autoLike;
        return await sock.sendMessage(from, {
            text: `╭━━━〔 💖 *AUTO STATUS REACT SETTINGS* 〕━━━┈⊷\n` +
                  `┃ ⋄ *Current Status:* ${cur ? '🟢 ON' : '🔴 OFF'}\n` +
                  `┃ ⋄ *Commands:*\n` +
                  `┃   • \`.statusreact on\`\n` +
                  `┃   • \`.statusreact off\`\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    }
}

// Attach helpers to statusCommand for backward compatibility
const { autoreadCommand } = require('./autoread');
statusCommand.statusCommand = statusCommand;
statusCommand.autotypingCommand = autotypingCommand;
statusCommand.autorecordingCommand = autorecordingCommand;
statusCommand.statusseenCommand = statusseenCommand;
statusCommand.statusreactCommand = statusreactCommand;
statusCommand.autoreadCommand = autoreadCommand;

module.exports = statusCommand;
