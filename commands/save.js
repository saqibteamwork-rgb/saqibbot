'use strict';

/**
 * MR SAQIB MD :: STATUS & MEDIA SAVER ENGINE (.save)
 * ============================================================================
 * Allows users to easily save WhatsApp Status (Photo, Video, Audio, Text)
 * and download any replied media (Image, Video, Audio, Sticker, Document,
 * View-Once) directly into the chat with zero quality loss.
 * ============================================================================
 */

const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

async function saveCommand(sock, from, msg, args = []) {
    const context = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = context?.quotedMessage;

    if (!quoted) {
        const guide = 
`╭━━━〔 📥 *STATUS & MEDIA SAVER* 〕━━━┈⊷
┃
┃ 📌 *How to Save Status:*
┃ 1️⃣ Kisi ka bhi WhatsApp Status dekhein.
┃ 2️⃣ Status par Reply karein aur likhein:
┃    👉 *.save*  (ya sirf *bhejo*, *send*, *save*)
┃ 3️⃣ Bot foran status download karke
┃    aapko send kar dega!
┃
┃ 💡 *Media Saver:*
┃ Kisi bhi Photo, Video, Audio ya View-Once
┃ message ko reply karke *.save* likhein!
┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD Engine*`;
        return await sock.sendMessage(from, { text: guide }, { quoted: msg });
    }

    // Reaction: Processing
    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

    // Unpack any wrappers (ephemeral, view-once, document-with-caption)
    let inner = quoted;
    if (inner.ephemeralMessage?.message) inner = inner.ephemeralMessage.message;
    if (inner.viewOnceMessage?.message) inner = inner.viewOnceMessage.message;
    if (inner.viewOnceMessageV2?.message) inner = inner.viewOnceMessageV2.message;
    if (inner.viewOnceMessageV2Extension?.message) inner = inner.viewOnceMessageV2Extension.message;
    if (inner.documentWithCaptionMessage?.message) inner = inner.documentWithCaptionMessage.message;

    // Detect sender info
    const senderJid = context.participant || context.remoteJid || from;
    const senderNumber = senderJid ? senderJid.split('@')[0].split(':')[0] : 'Contact';
    const isStatus = context.remoteJid === 'status@broadcast' || context.participant === 'status@broadcast';

    const header = isStatus ? '📥 *STATUS SAVED*' : '📥 *MEDIA SAVED*';

    // Target destination: If replying to status from user's phone, save to user's personal inbox!
    const myJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
    const targetDest = (isStatus && msg.key?.fromMe && myJid) ? myJid : from;

    try {
        if (inner.imageMessage) {
            const stream = await downloadContentFromMessage(inner.imageMessage, 'image');
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            const originalCaption = inner.imageMessage.caption ? `\n┃ 💬 *Caption:* ${inner.imageMessage.caption}` : '';
            const caption =
`╭━━━〔 ${header} 〕━━━┈⊷
┃ 👤 *From:* +${senderNumber}${originalCaption}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved by MR SAQIB MD*`;

            await sock.sendMessage(targetDest, {
                image: buffer,
                caption,
                mimetype: inner.imageMessage.mimetype || 'image/jpeg'
            }, (targetDest === from ? { quoted: msg } : {}));

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return;
        }

        if (inner.videoMessage) {
            const stream = await downloadContentFromMessage(inner.videoMessage, 'video');
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            const originalCaption = inner.videoMessage.caption ? `\n┃ 💬 *Caption:* ${inner.videoMessage.caption}` : '';
            const caption =
`╭━━━〔 ${header} 〕━━━┈⊷
┃ 👤 *From:* +${senderNumber}${originalCaption}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved by MR SAQIB MD*`;

            await sock.sendMessage(targetDest, {
                video: buffer,
                caption,
                mimetype: inner.videoMessage.mimetype || 'video/mp4'
            }, (targetDest === from ? { quoted: msg } : {}));

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return;
        }

        if (inner.audioMessage) {
            const stream = await downloadContentFromMessage(inner.audioMessage, 'audio');
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            await sock.sendMessage(targetDest, {
                audio: buffer,
                mimetype: inner.audioMessage.mimetype || 'audio/mp4',
                ptt: inner.audioMessage.ptt || false
            }, (targetDest === from ? { quoted: msg } : {}));

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return;
        }

        if (inner.stickerMessage) {
            const stream = await downloadContentFromMessage(inner.stickerMessage, 'sticker');
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            await sock.sendMessage(targetDest, { sticker: buffer }, (targetDest === from ? { quoted: msg } : {}));
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return;
        }

        if (inner.documentMessage) {
            const stream = await downloadContentFromMessage(inner.documentMessage, 'document');
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            await sock.sendMessage(targetDest, {
                document: buffer,
                mimetype: inner.documentMessage.mimetype || 'application/octet-stream',
                fileName: inner.documentMessage.fileName || 'status_file'
            }, (targetDest === from ? { quoted: msg } : {}));

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return;
        }

        // Text status or regular text
        const textContent = inner.conversation || inner.extendedTextMessage?.text;
        if (textContent) {
            const caption =
`╭━━━〔 📥 *STATUS TEXT SAVED* 〕━━━┈⊷
┃ 👤 *From:* +${senderNumber}
┃ 💬 *Text:* ${textContent}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved by MR SAQIB MD*`;

            await sock.sendMessage(targetDest, { text: caption }, (targetDest === from ? { quoted: msg } : {}));
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            return;
        }

        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, { text: "❌ *Unsupported media format!* Sirf Photo, Video, Audio, Sticker aur Text status save ho sakte hain." }, { quoted: msg });

    } catch (err) {
        console.error('[saveCommand Error]:', err);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, { text: `❌ *Save Failed:* ${err.message}` }, { quoted: msg });
    }
}

module.exports = saveCommand;
