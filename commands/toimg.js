// commands/toimg.js - Convert WhatsApp Sticker to High Quality Image
'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');

/**
 * .toimg / .photo / .s2img
 * Converts any WhatsApp sticker back into a full-resolution PNG/JPG image.
 */
async function toimgCommand(sock, from, msg) {
    try {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const target = quoted || msg.message;
        const actual = target?.viewOnceMessageV2?.message || target?.viewOnceMessage?.message || target;

        const stickerMsg = actual?.stickerMessage;
        if (!stickerMsg) {
            return await sock.sendMessage(from, {
                text: 
`╭━━━〔 🖼️ *STICKER TO IMAGE* 〕━━━┈⊷
┃ 📌 *Usage:*
┃ Kisi bhi sticker ko reply karke *.toimg* likhein.
┃ 
┃ 💡 *Aliases:*
┃ • *.toimg*
┃ • *.photo*
┃ • *.s2img*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

🚀 *Powered by MR SAQIB MD*`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        if (!buffer || buffer.length === 0) {
            return await sock.sendMessage(from, { text: "❌ Sticker download fail ho gaya." }, { quoted: msg });
        }

        // Convert WebP (static or animated first-frame) to crisp PNG
        const imageBuffer = await sharp(buffer, { pages: 1 })
            .png({ quality: 95 })
            .toBuffer();

        await sock.sendMessage(from, {
            image: imageBuffer,
            caption: `✅ *Sticker successfully converted to image!*\n\n🚀 _MR SAQIB MD_`
        }, { quoted: msg });

        await sock.sendMessage(from, { react: { text: '✨', key: msg.key } }).catch(() => {});

    } catch (error) {
        console.error('[toimg Error]:', error);
        await sock.sendMessage(from, {
            text: `❌ Image conversion fail ho gayi: ${error.message || 'Unknown error'}`
        }, { quoted: msg });
    }
}

module.exports = { toimgCommand };
