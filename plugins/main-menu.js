const config = require('../config')
const { cmd, commands } = require('../command');
const path = require('path');
const os = require("os")
const fs = require('fs');
const {runtime} = require('../lib/functions')
const axios = require('axios')

// Helper function for small caps text
const toSmallCaps = (text) => {
if (!text || typeof text !== 'string') return '';
const smallCapsMap = {
'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ғ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ',
'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ',
's': 's', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ',
'A': 'ᴀ', 'B': 'ʙ', 'C': 'ᴄ', 'D': 'ᴅ', 'E': 'ᴇ', 'F': 'ғ', 'G': 'ɢ', 'H': 'ʜ', 'I': 'ɪ',
'J': 'ᴊ', 'K': 'ᴋ', 'L': 'ʟ', 'M': 'ᴍ', 'N': 'ɴ', 'O': 'ᴏ', 'P': 'ᴘ', 'Q': 'ǫ', 'R': 'ʀ',
'S': 's', 'T': 'ᴛ', 'U': 'ᴜ', 'V': 'ᴠ', 'W': 'ᴡ', 'X': 'x', 'Y': 'ʏ', 'Z': 'ᴢ'
};
return text.split('').map(char => smallCapsMap[char] || char).join('');
};

// Format category with your exact styles
const formatCategory = (category, cmds) => {
// Filter out commands with empty or undefined patterns
const validCmds = cmds.filter(cmd => cmd.pattern && cmd.pattern.trim() !== '');

if (validCmds.length === 0) return ''; // Skip empty categories  
  
let title = `\n\`『 ${category.toUpperCase()} 』\`\n╭───────────────────⊷\n`;  
let body = validCmds.map(cmd => {  
    const commandName = cmd.pattern || '';  
    return `*┃✮│➣ ${toSmallCaps(commandName)}*`;  
}).join('\n');  
let footer = `\n╰───────────────────⊷`;  
return `${title}${body}${footer}`;

};

// Function to validate image URL
const isValidImageUrl = (url) => {
if (!url || typeof url !== 'string' || url.trim() === '') {
return false;
}

const urlLower = url.toLowerCase();  
  
// Check image extensions  
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];  
if (imageExtensions.some(ext => urlLower.endsWith(ext))) {  
    return true;  
}  
  
return false;

};

cmd({
pattern: "menu",
alias: ["m", "help", "allmenu","fullmenu"],
use: '.menu',
desc: "Show all bot commands",
category: "main",
react: "⚡",
filename: __filename
},
async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply, userConfig }) => {
try {
// Show typing presence before processing
await conn.sendPresenceUpdate('composing', from);

let totalCommands = Object.keys(commands).length;  
      
    // Get all unique categories and filter out undefined/null categories  
    const categories = [...new Set(Object.values(commands).map(c => c.category))].filter(cat =>   
        cat && cat.trim() !== '' && cat !== 'undefined'  
    );  
      
    // Organize commands by category and filter out empty categories  
    const categorized = {};  
    categories.forEach(cat => {  
        const categoryCommands = Object.values(commands).filter(c => c.category === cat);  
        // Only add category if it has valid commands  
        const validCommands = categoryCommands.filter(cmd => cmd.pattern && cmd.pattern.trim() !== '');  
        if (validCommands.length > 0) {  
            categorized[cat] = validCommands;  
        }  
    });  

    // Build menu sections - only for categories that have commands  
    let menuSections = '';  
    for (const [category, cmds] of Object.entries(categorized)) {  
        if (cmds && cmds.length > 0) {  
            const section = formatCategory(category, cmds);  
            if (section !== '') {  
                menuSections += section;  
            }  
        }  
    }  

    // Get all values from userConfig with fallback to config  
    const BOT_NAME = userConfig?.BOT_NAME || config.BOT_NAME || "𝙏𝙚𝙘𝙝𝙓 𝙈𝘿";  
    const OWNER_NAME = userConfig?.OWNER_NAME || config.OWNER_NAME || "Sɪʟᴠᴇʀ × Zᴀᴍᴀɴ";  
    const PREFIX = userConfig?.PREFIX || config.PREFIX || ".";  
    const MODE = userConfig?.MODE || config.MODE || "public";  
    const VERSION = userConfig?.VERSION || config.VERSION || "7.0";  
    const DESCRIPTION = userConfig?.DESCRIPTION || config.DESCRIPTION || "";  
      
    // Get BOT_IMAGE from userConfig first, then config.BOT_IMAGE, then config.BOT_MEDIA_URL  
    const BOT_IMAGE = userConfig?.BOT_IMAGE || userConfig?.BOT_MEDIA_URL || config.BOT_IMAGE || config.BOT_MEDIA_URL;  
      
    // Main menu text with new bar styles  
    let dec = `*╭┈───〔 ${BOT_NAME} 〕┈───⊷*
*┃✮╭────────────────*      
*┃✮│ 👑 Owner:* *𖣂 𝙎𝙄𝙇𝙑𝙀𝙍 × 𝙕𝘼𝙈𝘼𝙉 𖣂*
*┃✮│ 📛 Bot:* 𝙏𝙝𝙚 𝙏𝙚𝙘𝙝𝙓 𝙈𝘿🤓
*┃✮│ ⏱️ Uptime:* ${runtime(process.uptime())}
*┃✮│ 🔣 Prefix:* ${PREFIX}
*┃✮│ 📳 Mode:* ${MODE}
*┃✮│ 🏷️ Version* : *7.0*
*┃✮│ 📚 Commands:* ${totalCommands}
*┃✮╰────────────────*
*╰───────────────────⊷*
${menuSections}

> ${DESCRIPTION || ''}`;



// Determine which image to use  
    let imageToUse;  
    const localImagePath = path.join(__dirname, '../lib/jawadmd.jpg');  
      
    // Check if BOT_IMAGE is a valid image URL  
    if (isValidImageUrl(BOT_IMAGE)) {  
        try {  
            // Check if server is accessible (timeout after 3 seconds)  
            await axios.head(BOT_IMAGE, { timeout: 3000 });  
            // Server is up, use the URL image  
            imageToUse = BOT_IMAGE;  
        } catch (serverError) {  
            // Server is down or inaccessible, use local image  
            console.log('Image server down, using local image:', serverError.message);  
            imageToUse = localImagePath;  
        }  
    } else {  
        // Invalid image URL format, use local image  
        imageToUse = localImagePath;  
    }  

    await conn.sendMessage(from, {   
        image: { url: imageToUse },  
        caption: dec,   
        contextInfo: {   
            mentionedJid: [m.sender],   
            forwardingScore: 999,   
            isForwarded: true,   
            forwardedNewsletterMessageInfo: {   
                newsletterJid: config.newsletterJid || '120363431913895899@newsletter',   
                newsletterName: config.channelName || 'Mr SAQIB',   
                serverMessageId: -1
            }   
        }   
    }, { quoted: mek });  

} catch (e) {   
    console.log(e);   
    reply(`Error: ${e}`);   
}

});
