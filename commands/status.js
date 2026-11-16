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

/**
 * Bulletproof Recording Presence Dispatcher
 * Sends both standard Baileys chatstate ('composing' media='audio') and direct raw WhatsApp
 * recording XML stanza (<chatstate><recording/></chatstate>) with presence subscription.
 * This guarantees 100% visibility on all WhatsApp clients (Android, iOS, Web, Desktop).
 */
async function sendRecordingPresence(sock, toJid) {
    if (!sock || !toJid) return;
    try {
        if (typeof sock.presenceSubscribe === 'function') {
            await sock.presenceSubscribe(toJid).catch(() => {});
        }
        if (typeof sock.sendPresenceUpdate === 'function') {
            await sock.sendPresenceUpdate('recording', toJid).catch(() => {});
        }
        if (typeof sock.sendNode === 'function') {
            const isLid = String(toJid).includes('@lid');
            const myId = isLid ? sock.user?.lid : sock.user?.id;
            await sock.sendNode({
                tag: 'chatstate',
                attrs: {
                    to: toJid,
                    ...(myId ? { from: myId } : {})
                },
                content: [
                    {
                        tag: 'recording',
                        attrs: {}
                    }
                ]
            }).catch(() => {});
        }
    } catch (e) {}
}

/**
 * Bulletproof Typing Presence Dispatcher
 */
async function sendTypingPresence(sock, toJid) {
    if (!sock || !toJid) return;
    try {
        if (typeof sock.presenceSubscribe === 'function') {
            await sock.presenceSubscribe(toJid).catch(() => {});
        }
        if (typeof sock.sendPresenceUpdate === 'function') {
            await sock.sendPresenceUpdate('composing', toJid).catch(() => {});
        }
    } catch (e) {}
}

function ensureStatusSettings(botData, userId, sock = null) {
    if (!botData.statusSettings) botData.statusSettings = {};

    const userKeys = [userId].filter(Boolean);
    if (sock?.user?.id) {
        const phoneDigits = String(sock.user.id).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        if (phoneDigits && !userKeys.includes(phoneDigits)) userKeys.push(phoneDigits);
    }

    let existingKey = userKeys.find(k => botData.statusSettings[k]);
    if (!existingKey) {
        existingKey = userKeys[0] || 'default';
        let saved = null;
        try {
            const zeroLoss = require('../utils/zeroLossManager');
            saved = zeroLoss.getUserSettings(existingKey) || (userKeys[1] ? zeroLoss.getUserSettings(userKeys[1]) : null);
        } catch (_) {}

        botData.statusSettings[existingKey] = saved || {
            autoStatus: false,
            autoSeen: false,
            autoLike: false,
            autoDownload: false,
            autoTyping: false,
            autoRecording: false,
            alwaysOnline: false,
            autoRead: false,
            system: 1,
            isPublic: false
        };
    }

    const s = botData.statusSettings[existingKey];
    if (typeof s.autoStatus === 'undefined') s.autoStatus = false;
    if (typeof s.autoSeen === 'undefined') s.autoSeen = false;
    if (typeof s.autoLike === 'undefined') s.autoLike = false;
    if (typeof s.autoDownload === 'undefined') s.autoDownload = false;
    if (typeof s.autoTyping === 'undefined') s.autoTyping = false;
    if (typeof s.autoRecording === 'undefined') s.autoRecording = false;
    if (typeof s.alwaysOnline === 'undefined') s.alwaysOnline = false;
    if (typeof s.autoRead === 'undefined') s.autoRead = false;

    // Link reference across all userKeys
    userKeys.forEach(k => {
        botData.statusSettings[k] = s;
    });

    try {
        const zeroLoss = require('../utils/zeroLossManager');
        zeroLoss.persistUserSettings(existingKey, s);
    } catch (_) {}

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
            `┃ 🟢 ${toBold("Always Online:")} ${settings.alwaysOnline ? '🟢 ON' : '🔴 OFF'}\n` +
            `┃ 📥 ${toBold("Auto Download:")} ${settings.autoDownload ? '🟢 ON' : '🔴 OFF'}\n` +
            `┃ ⚙️ ${toBold("Master Status:")} ${settings.autoStatus ? '🟢 ON' : '🔴 OFF'}\n` +
            `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
            `┃ 💡 *Direct Commands:*\n` +
            `┃   • \`.autoread on/off\` (Auto Read Messages / Blue Ticks)\n` +
            `┃   • \`.statusseen on/off\` (Auto View Status)\n` +
            `┃   • \`.statusreact on/off\` (Auto React Status)\n` +
            `┃   • \`.autotyping on/off\` (Auto Typing Presence)\n` +
            `┃   • \`.autorecording on/off\` (Auto Recording)\n` +
            `┃   • \`.alwaysonline on/off\` (24/7 Always Online)\n` +
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
    } else if (action === 'typing' || action === 'type') {
        return await autotypingCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args.slice(1));
    } else if (action === 'recording' || action === 'record' || action === 'recoding' || action === 'autorecoding' || action === 'autorecord') {
        return await autorecordingCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args.slice(1));
    } else if (action === 'online' || action === 'alwaysonline' || action === 'alwayson' || action === 'awalysonline' || action === 'always_online' || action === 'awalys_online') {
        return await alwaysonlineCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args.slice(1));
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

    const settings = ensureStatusSettings(botData, userId, sock);
    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
        settings.autoTyping = true;
        settings.autoRecording = false; // Mutually exclusive
        if (typeof saveBotData === 'function') saveBotData();
        await sendTypingPresence(sock, from);
        return await sock.sendMessage(from, {
            text: `╭━━━〔 ⌨️ *AUTO TYPING: ON* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Active & Enabled\n` +
                  `┃ ⚡ Bot ab chats me automatic "typing..." show karega!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else if (action === 'off' || action === 'disable' || action === '0') {
        settings.autoTyping = false;
        if (typeof saveBotData === 'function') saveBotData();
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

    const settings = ensureStatusSettings(botData, userId, sock);
    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
        settings.autoRecording = true;
        settings.autoTyping = false; // Mutually exclusive
        if (typeof saveBotData === 'function') saveBotData();
        await sendRecordingPresence(sock, from);
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🎙️ *AUTO RECORDING: ON* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Active & Enabled\n` +
                  `┃ ⚡ Bot ab chats me automatic "recording audio..." show karega!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else if (action === 'off' || action === 'disable' || action === '0') {
        settings.autoRecording = false;
        if (typeof saveBotData === 'function') saveBotData();
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

/**
 * .alwaysonline / .online / .alwayson on/off - 24/7 Always Online Controller
 */
async function alwaysonlineCommand(sock, from, msg, isAdmin, botData, saveBotData, userId, args) {
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ Only owner can use this command." }, { quoted: msg });

    const settings = ensureStatusSettings(botData, userId, sock);
    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
        settings.alwaysOnline = true;
        if (typeof saveBotData === 'function') saveBotData();
        await sock.sendPresenceUpdate('available').catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🟢 *ALWAYS ONLINE: ACTIVATED* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Active & 24/7 Online\n` +
                  `┃ ⚡ *Engine:* Real-Time Presence Heartbeat (15s)\n` +
                  `┃ 🌐 *Visibility:* Green Dot / Online in all chats\n` +
                  `┃ 💡 Bot ab WhatsApp par 24/7 ONLINE nazar aayega!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else if (action === 'off' || action === 'disable' || action === '0' || action === 'of') {
        settings.alwaysOnline = false;
        if (typeof saveBotData === 'function') saveBotData();
        await sock.sendPresenceUpdate('unavailable').catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 ⚪ *ALWAYS ONLINE: DISABLED* 〕━━━┈⊷\n` +
                  `┃ ❌ *Status:* Disabled / Idle Standby\n` +
                  `┃ 💤 *Engine:* Standard Offline Mode\n` +
                  `┃ ⚪ Bot ab hamesha online show nahi hoga.\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    } else {
        const cur = settings.alwaysOnline;
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🟢 *ALWAYS ONLINE SETTINGS* 〕━━━┈⊷\n` +
                  `┃ ⋄ *Current Status:* ${cur ? '🟢 ACTIVE (24/7 Online)' : '🔴 DISABLED (Offline)'}\n` +
                  `┃ ⋄ *Commands:*\n` +
                  `┃   • \`.alwaysonline on\`  (Turn 24/7 Online ON)\n` +
                  `┃   • \`.alwaysonline off\` (Turn Online OFF)\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    }
}

// Attach helpers to statusCommand for backward compatibility
const { autoreadCommand } = require('./autoread');
statusCommand.statusCommand = statusCommand;
statusCommand.autotypingCommand = autotypingCommand;
statusCommand.autorecordingCommand = autorecordingCommand;
statusCommand.alwaysonlineCommand = alwaysonlineCommand;
statusCommand.statusseenCommand = statusseenCommand;
statusCommand.statusreactCommand = statusreactCommand;
statusCommand.autoreadCommand = autoreadCommand;
statusCommand.sendRecordingPresence = sendRecordingPresence;
statusCommand.sendTypingPresence = sendTypingPresence;

module.exports = statusCommand;
module.exports.alwaysonlineCommand = alwaysonlineCommand;
module.exports.sendRecordingPresence = sendRecordingPresence;
module.exports.sendTypingPresence = sendTypingPresence;
