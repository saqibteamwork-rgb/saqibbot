'use strict';

/**
 * MR SAQIB MD :: CUSTOM PROFILE & BRANDING CONTROLLER
 * ============================================================================
 * Allows:
 * 1. Paired Session Owners (Users) to customize:
 *    - Bot Name (.setbotname / .setname)
 *    - Owner Name (.setownername / .setownname)
 *    - Menu Picture (.setmenupic / .setmenuimg)
 *    -> Only changes for THEIR OWN session (baaqi users par koi asar nahi)!
 *
 * 2. Master Owner (03438673242) to customize:
 *    - Global Default Bot Name (.setbotname -g <name>)
 *    - Global Default Owner Name (.setownername -g <name>)
 *    - Global Default Menu Picture (.setmenupic -g)
 *    -> Changes default for ALL users who haven't set custom profile!
 * ============================================================================
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const settings = require('../settings');

const MENU_PICS_DIR = path.join(__dirname, '..', 'data', 'menu_pics');
fs.ensureDirSync(MENU_PICS_DIR);

function toSansBold(str) {
    return String(str || '').replace(/[A-Za-z0-9]/g, c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + code - 97);
        if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);
        return c;
    });
}

function ensureProfiles(botData, userId) {
    if (!botData.customProfiles) botData.customProfiles = {};
    if (!botData.globalSettings) botData.globalSettings = {};
    if (userId && !botData.customProfiles[userId]) {
        botData.customProfiles[userId] = {};
    }
}

/**
 * Extract image buffer from quoted or direct message
 */
async function extractImageBuffer(msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = quoted || msg.message;
    if (!target) return null;

    const actual = target.viewOnceMessageV2?.message 
        || target.viewOnceMessage?.message 
        || target.viewOnceMessageV2Extension?.message 
        || target;

    let mediaObj = null;
    let mediaType = 'image';

    if (actual.imageMessage) {
        mediaObj = actual.imageMessage;
        mediaType = 'image';
    } else if (actual.documentMessage && (actual.documentMessage.mimetype || '').startsWith('image/')) {
        mediaObj = actual.documentMessage;
        mediaType = 'document';
    } else if (actual.stickerMessage) {
        mediaObj = actual.stickerMessage;
        mediaType = 'sticker';
    }

    if (!mediaObj) return null;

    const stream = await downloadContentFromMessage(mediaObj, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

/**
 * .setbotname / .setname <name> [-g for global]
 */
async function setbotnameCommand(sock, from, msg, isOwner, isSessionOwner, botData, saveBotData, userId, args, q) {
    if (!isOwner && !isSessionOwner) {
        return await sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner ya is session ka user bot name badal sakta hai." }, { quoted: msg });
    }

    ensureProfiles(botData, userId);

    let rawInput = (q || '').trim();
    if (!rawInput) {
        return await sock.sendMessage(from, { 
            text: `╭━━━〔 🤖 *SET BOT NAME* 〕━━━┈⊷\n` +
                  `┃ 📌 *Usage:*\n` +
                  `┃ 👉 *.setbotname <naam>* — Apne session ka bot name badlein\n` +
                  (isOwner ? `┃ 👉 *.setbotname -g <naam>* — Sabhi users ke liye global default badlein (Owner Only)\n` : '') +
                  `┃\n` +
                  `┃ 💡 *Example:* .setbotname My WhatsApp Bot\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const isGlobal = isOwner && (args[0] === '-g' || args[0] === 'all' || args[0] === '--global');
    const newName = isGlobal ? args.slice(1).join(' ').trim() : rawInput;

    if (!newName) {
        return await sock.sendMessage(from, { text: "❌ Please provide a valid bot name." }, { quoted: msg });
    }

    if (isGlobal) {
        botData.globalSettings.botName = newName;
        saveBotData();
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🌍 *GLOBAL DEFAULT BOT NAME UPDATED* 〕━━━┈⊷\n` +
                  `┃ 🤖 *New Global Bot Name:* ${toSansBold(newName)}\n` +
                  `┃ 👥 *Applied to:* All users who haven't set a custom name\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    } else {
        botData.customProfiles[userId].botName = newName;
        if (!botData.userNames) botData.userNames = {};
        botData.userNames[userId] = newName;
        saveBotData();
        return await sock.sendMessage(from, {
            text: `╭━━━〔 ✅ *SESSION BOT NAME UPDATED* 〕━━━┈⊷\n` +
                  `┃ 🤖 *Your Bot Name:* ${toSansBold(newName)}\n` +
                  `┃ 🔒 *Scope:* Sirf aapke session (.menu / .ping) par apply hoga\n` +
                  `┃ 💡 *Baaqi users:* Unka apna default rahega, unpar koi asar nahi\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }
}

/**
 * .setownername / .setownname <name> [-g for global]
 */
async function setownernameCommand(sock, from, msg, isOwner, isSessionOwner, botData, saveBotData, userId, args, q) {
    if (!isOwner && !isSessionOwner) {
        return await sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner ya is session ka user owner name badal sakta hai." }, { quoted: msg });
    }

    ensureProfiles(botData, userId);

    let rawInput = (q || '').trim();
    if (!rawInput) {
        return await sock.sendMessage(from, { 
            text: `╭━━━〔 👑 *SET OWNER NAME* 〕━━━┈⊷\n` +
                  `┃ 📌 *Usage:*\n` +
                  `┃ 👉 *.setownername <naam>* — Apne session ka owner name badlein\n` +
                  (isOwner ? `┃ 👉 *.setownername -g <naam>* — Sabhi users ke liye global owner name badlein (Owner Only)\n` : '') +
                  `┃\n` +
                  `┃ 💡 *Example:* .setownername Saqib King\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const isGlobal = isOwner && (args[0] === '-g' || args[0] === 'all' || args[0] === '--global');
    const newName = isGlobal ? args.slice(1).join(' ').trim() : rawInput;

    if (!newName) {
        return await sock.sendMessage(from, { text: "❌ Please provide a valid owner name." }, { quoted: msg });
    }

    if (isGlobal) {
        botData.globalSettings.ownerName = newName;
        saveBotData();
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🌍 *GLOBAL DEFAULT OWNER NAME UPDATED* 〕━━━┈⊷\n` +
                  `┃ 👑 *New Global Owner:* ${toSansBold(newName)}\n` +
                  `┃ 👥 *Applied to:* All users who haven't set a custom owner name\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    } else {
        botData.customProfiles[userId].ownerName = newName;
        saveBotData();
        return await sock.sendMessage(from, {
            text: `╭━━━〔 ✅ *SESSION OWNER NAME UPDATED* 〕━━━┈⊷\n` +
                  `┃ 👑 *Your Owner Name:* ${toSansBold(newName)}\n` +
                  `┃ 🔒 *Scope:* Sirf aapke session (.menu / .ping) par display hoga\n` +
                  `┃ 💡 *Baaqi users:* Unka apna default rahega\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }
}

/**
 * .setmenupic / .setmenuimg (reply to an image, optionally with -g for global)
 */
async function setmenupicCommand(sock, from, msg, isOwner, isSessionOwner, botData, saveBotData, userId, args) {
    if (!isOwner && !isSessionOwner) {
        return await sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner ya is session ka user menu picture badal sakta hai." }, { quoted: msg });
    }

    ensureProfiles(botData, userId);

    const isGlobal = isOwner && (args[0] === '-g' || args[0] === 'all' || args[0] === '--global');

    const buffer = await extractImageBuffer(msg);
    if (!buffer || buffer.length === 0) {
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🖼️ *SET MENU PICTURE* 〕━━━┈⊷\n` +
                  `┃ 📸 *Usage:* Kisi photo ke reply mein likhein:\n` +
                  `┃ 👉 *.setmenupic* — Apne session ka menu picture badlein\n` +
                  (isOwner ? `┃ 👉 *.setmenupic -g* — Sabhi users ke liye default menu pic badlein (Owner Only)\n` : '') +
                  `┃\n` +
                  `┃ ✨ *Note:* Reply photo will be saved in full HD for .menu!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

    try {
        if (isGlobal) {
            const globalPicPath = path.join(MENU_PICS_DIR, 'global_default.jpg');
            await fs.writeFile(globalPicPath, buffer);
            botData.globalSettings.menuImage = globalPicPath;
            botData.globalSettings.menuImageBase64 = buffer.toString('base64');
            saveBotData();

            // Real-time broadcast to all Heroku s1-s10 nodes and Railway
            try {
                const clusterSync = require('../utils/clusterSync');
                clusterSync.broadcastToCluster('setmenupic', { imageBase64: buffer.toString('base64') }).catch(() => {});
            } catch (_) {}

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return await sock.sendMessage(from, {
                text: `╭━━━〔 🌍 *GLOBAL DEFAULT MENU PIC UPDATED* 〕━━━┈⊷\n` +
                      `┃ 🖼️ *Status:* Default menu picture successfully updated!\n` +
                      `┃ 👥 *Applied to:* All users who haven't set a custom picture\n` +
                      `┃ 💡 Check karo: *.menu* likh kar dekhein!\n` +
                      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
            }, { quoted: msg });
        } else {
            const userPicPath = path.join(MENU_PICS_DIR, `session_${userId}.jpg`);
            await fs.writeFile(userPicPath, buffer);
            botData.customProfiles[userId].menuImage = userPicPath;
            saveBotData();

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return await sock.sendMessage(from, {
                text: `╭━━━〔 ✅ *SESSION MENU PIC UPDATED* 〕━━━┈⊷\n` +
                      `┃ 🖼️ *Status:* Menu picture set for your session!\n` +
                      `┃ 🔒 *Scope:* Sirf aapke session ke *.menu* mein dikhai degi\n` +
                      `┃ 👥 *Baaqi users:* Unka apna default rahega\n` +
                      `┃ 💡 Check karo: *.menu* likh kar dekhein!\n` +
                      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
            }, { quoted: msg });
        }
    } catch (err) {
        console.error('[setmenupic Error]:', err.message);
        return await sock.sendMessage(from, { text: `❌ Failed to save menu picture: ${err.message}` }, { quoted: msg });
    }
}

/**
 * .resetprofile / .resetmenu (revert back to global defaults)
 */
async function resetprofileCommand(sock, from, msg, isOwner, isSessionOwner, botData, saveBotData, userId) {
    if (!isOwner && !isSessionOwner) {
        return await sock.sendMessage(from, { text: "❌ *Access Denied.*" }, { quoted: msg });
    }

    ensureProfiles(botData, userId);

    if (botData.customProfiles[userId]) {
        const pic = botData.customProfiles[userId].menuImage;
        if (pic && typeof pic === 'string' && fs.existsSync(pic)) {
            try { fs.unlinkSync(pic); } catch (_) {}
        }
        delete botData.customProfiles[userId];
    }
    if (botData.userNames && botData.userNames[userId]) {
        delete botData.userNames[userId];
    }
    saveBotData();

    return await sock.sendMessage(from, {
        text: `╭━━━〔 🔄 *PROFILE RESET TO DEFAULT* 〕━━━┈⊷\n` +
              `┃ ✅ Aapke session ka Bot Name, Owner Name, aur Menu Pic\n` +
              `┃    wapas *Global Defaults* par reset kar diya gaya hai!\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
}

/**
 * .myprofile / .profileinfo
 */
async function profileinfoCommand(sock, from, msg, isOwner, isSessionOwner, botData, userId) {
    ensureProfiles(botData, userId);

    const userProfile = botData.customProfiles[userId] || {};
    const globalSettings = botData.globalSettings || {};

    const sessBotName = userProfile.botName || botData.userNames?.[userId] || `(Default: ${globalSettings.botName || settings.botName})`;
    const sessOwnerName = userProfile.ownerName || `(Default: ${globalSettings.ownerName || settings.ownerName})`;
    const sessMenuPic = userProfile.menuImage ? '✅ Custom Image Active' : `(Default: ${globalSettings.menuImage ? 'Global Custom' : 'Default Preset'})`;

    const text = 
`╭━━━〔 👤 *BRANDING & PROFILE INFO* 〕━━━┈⊷
┃ 📱 *Your Session (${userId}):*
┃ 🤖 *Bot Name:* ${sessBotName}
┃ 👑 *Owner Name:* ${sessOwnerName}
┃ 🖼️ *Menu Picture:* ${sessMenuPic}
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
┃ 🌍 *Global Defaults:*
┃ 🤖 *Default Bot:* ${globalSettings.botName || settings.botName}
┃ 👑 *Default Owner:* ${globalSettings.ownerName || settings.ownerName}
┃ 🖼️ *Default Pic:* ${globalSettings.menuImage ? 'Custom Global Set' : 'Default Asset'}
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
┃ 💡 *Available Commands:*
┃ • \`.setbotname <naam>\` — Bot name badlein
┃ • \`.setownername <naam>\` — Owner name badlein
┃ • \`.setmenupic\` (reply photo) — Menu pic badlein
┃ • \`.resetmenu\` — Default par wapas reset karein
${isOwner ? `┃ • \`.setbotname -g <name>\` — All users default\n┃ • \`.setownername -g <name>\` — All users default\n┃ • \`.setmenupic -g\` — All users default pic\n` : ''}╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

    return await sock.sendMessage(from, { text }, { quoted: msg });
}

/**
 * Resolves the effective botName, ownerName, and menuImage for a given userId / session:
 * 1. Session-level custom override (botData.customProfiles[userId])
 * 2. Global custom override set by Master Owner (botData.globalSettings)
 * 3. Default settings (settings.botName, settings.ownerName, settings.menuImage)
 */
function getEffectiveProfile(botData, userId) {
    const userProfile = (botData?.customProfiles && userId && botData.customProfiles[userId]) || {};
    const globalSettings = botData?.globalSettings || {};

    const botName = userProfile.botName || (botData?.userNames && userId && botData.userNames[userId]) || globalSettings.botName || settings.botName || 'MR SAQIB MD';
    const ownerName = userProfile.ownerName || globalSettings.ownerName || settings.ownerName || 'MR SAQIB';

    let menuImage = null;
    if (userProfile.menuImage && typeof userProfile.menuImage === 'string' && fs.existsSync(userProfile.menuImage)) {
        menuImage = userProfile.menuImage;
    } else if (globalSettings.menuImage && typeof globalSettings.menuImage === 'string' && fs.existsSync(globalSettings.menuImage)) {
        menuImage = globalSettings.menuImage;
    } else if (globalSettings.menuImageBase64) {
        try {
            const globalPicPath = path.join(MENU_PICS_DIR, 'global_default.jpg');
            if (!fs.existsSync(globalPicPath)) {
                fs.ensureDirSync(MENU_PICS_DIR);
                fs.writeFileSync(globalPicPath, Buffer.from(globalSettings.menuImageBase64, 'base64'));
            }
            globalSettings.menuImage = globalPicPath;
            menuImage = globalPicPath;
        } catch (_) {}
    }

    const menuStyle = Number(userProfile.menuStyle || globalSettings.menuStyle || 1);

    return {
        botName,
        ownerName,
        menuImage,
        menuStyle,
        isSessionCustom: !!(userProfile.botName || userProfile.ownerName || userProfile.menuImage || userProfile.menuStyle),
        isGlobalCustom: !!(globalSettings.botName || globalSettings.ownerName || globalSettings.menuImage || globalSettings.menuStyle)
    };
}

module.exports = {
    setbotnameCommand,
    setownernameCommand,
    setmenupicCommand,
    resetprofileCommand,
    profileinfoCommand,
    getEffectiveProfile
};
