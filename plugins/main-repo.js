// Jawad Tech 

const config = require('../config')
const {cmd , commands} = require('../command')
const os = require("os")
const {runtime, sleep} = require('../lib/functions')
const axios = require('axios')
const fs = require('fs')
const path = require('path')

// Function to validate image URL - SIMPLIFIED VERSION
const isValidImageUrl = (url) => {
    if (!url || typeof url !== 'string' || url.trim() === '') {
        return false;
    }
    
    const urlLower = url.toLowerCase();
    
    // Check ONLY for image file extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    return imageExtensions.some(ext => urlLower.endsWith(ext));
};

cmd({
    pattern: "repo",
    alias: ["sc", "script", "repository", "deploy"],
    desc: "Get 𝙏𝙚𝙘𝙝𝙓 𝙈𝘿 deploy link and information",
    react: "📂",
    category: "main",
    filename: __filename,
},
async (conn, mek, m, { from, reply, userConfig }) => {
    try {
        // Get values from userConfig with fallback to config
        const BOT_NAME = userConfig?.BOT_NAME || config.BOT_NAME || '𝙏𝙚𝙘𝙝𝙓 𝙈𝘿';
        const OWNER_NAME = userConfig?.OWNER_NAME || config.OWNER_NAME || 'Sɪʟᴠᴇʀ × Zᴀᴍᴀɴ';
        
        // Get BOT_IMAGE from userConfig first, then config.BOT_IMAGE, then config.BOT_MEDIA_URL
        const BOT_IMAGE = userConfig?.BOT_IMAGE || userConfig?.BOT_MEDIA_URL || config.BOT_IMAGE || config.BOT_MEDIA_URL;
        
        const deployLink = 'https://techxpair.vercel.app/';

        // Format the information
        const formattedInfo = `
╭─〔 *${BOT_NAME} MINI* 〕
│
├─ *🤖 Bot Name:* ${BOT_NAME}
├─ *👑 Creator:* ${OWNER_NAME}
├─ *⚡ Version:* 2.0
│
├─ *🌐 Deploy Link:*
│   ${deployLink}
│
├─ *📲 How to Deploy:*
│   Method 1 - Manual:
│   1. Visit: ${deployLink}
│   2. Enter your WhatsApp number
│   3. Get pairing code
│   4. Link with WhatsApp
│
│   Method 2 - Direct:
│   Use: .pair number
│   Example: .pair 923xxxx
│
╰─ *🚀 Powered by ${OWNER_NAME}*
`.trim();

        // Determine which image to use
        let imageToUse;
        const localImagePath = path.join(__dirname, '../lib/khanmd.jpg');
        
        // Check if BOT_IMAGE is a valid image URL (only checks file extensions)
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

        // Send an image with the formatted info
        await conn.sendMessage(from, {
            image: { url: imageToUse },
            caption: formattedInfo,
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

    } catch (error) {
        console.error("Error in repo command:", error);
        reply("❌ Sorry, something went wrong while fetching information.");
    }
});
