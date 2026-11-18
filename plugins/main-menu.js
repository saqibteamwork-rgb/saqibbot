const config = require('../config');
const { cmd, commands } = require('../command');
const { menuCommand } = require('../commands/menu');
const path = require('path');
const os = require("os");
const fs = require('fs');

cmd({
    pattern: "menu",
    alias: ["m", "help", "allmenu", "fullmenu"],
    use: '.menu',
    desc: "Show all bot commands",
    category: "main",
    react: "⚡",
    filename: __filename
},
async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply, userConfig }) => {
    try {
        await conn.sendPresenceUpdate('composing', from).catch(() => {});
        return await menuCommand(conn, from, mek, null, {}, Date.now(), args || []);
    } catch (e) {
        console.error('[plugins/main-menu Error]:', e);
        try {
            await conn.sendMessage(from, { text: `⚡ *${config.BOT_NAME || 'MR SAQIB MD'}*\n\nType *.menu 15* for button menu.\nType *.allmenu* for complete command list.` }, { quoted: mek });
        } catch (_) {}
    }
});
