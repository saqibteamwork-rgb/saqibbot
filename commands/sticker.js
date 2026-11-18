// commands/sticker.js - High Quality Sticker Maker with Custom EXIF (MR SAQIB MD)
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const webpmux = require('node-webpmux');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

// Helper to inject WhatsApp sticker EXIF metadata
async function addExif(webpBuffer, packname = 'MR SAQIB MD', author = 'MR SAQIB') {
    try {
        const img = new webpmux.Image();
        await img.load(webpBuffer);
        const json = {
            'sticker-pack-id': 'https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M',
            'sticker-pack-name': packname,
            'sticker-pack-publisher': author,
            'emojis': ['✨', '🤖', '👑']
        };
        const exifAttr = Buffer.from([
            0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
            0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x16, 0x00, 0x00, 0x00
        ]);
        const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
        const exif = Buffer.concat([exifAttr, jsonBuffer]);
        exif.writeUIntLE(jsonBuffer.length, 14, 4);
        img.exif = exif;
        return await img.save(null);
    } catch (e) {
        console.error('[Sticker] Failed to write EXIF:', e.message);
        return webpBuffer;
    }
}

// Extract media message (from quoted or direct message)
function extractMedia(msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = quoted || msg.message;
    if (!target) return null;

    const actual = target.viewOnceMessageV2?.message || target.viewOnceMessage?.message || target;

    if (actual.imageMessage) return { type: 'image', msg: actual.imageMessage, name: 'image' };
    if (actual.videoMessage) return { type: 'video', msg: actual.videoMessage, name: 'video' };
    if (actual.stickerMessage) return { type: 'sticker', msg: actual.stickerMessage, name: 'sticker' };
    return null;
}

// Download media into Buffer
async function downloadMediaBuffer(media) {
    const stream = await downloadContentFromMessage(media.msg, media.name);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

// Main Sticker Command (.sticker / .s)
async function stickerCommand(sock, from, msg, args) {
    try {
        await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } }).catch(() => {});

        const media = extractMedia(msg);
        if (!media) {
            return await sock.sendMessage(from, {
                text: "🎨 *STICKER MAKER - MR SAQIB MD*\n\nReply to an *image*, *gif*, or *short video (≤10s)* with:\n👉 *.sticker* ya *.s*\n\n💡 *Custom Pack Name:*\n*.sticker MyPack|MyName*"
            }, { quoted: msg });
        }

        // Custom pack and author if provided in args
        let packname = 'MR SAQIB MD';
        let author = 'MR SAQIB';
        if (args && args.length > 0) {
            const rawArgs = args.join(' ');
            if (rawArgs.includes('|')) {
                const parts = rawArgs.split('|');
                packname = parts[0].trim() || packname;
                author = parts[1].trim() || author;
            } else {
                packname = rawArgs.trim();
            }
        }

        const buffer = await downloadMediaBuffer(media);
        if (!buffer || buffer.length === 0) {
            return await sock.sendMessage(from, { text: "❌ Failed to download media." }, { quoted: msg });
        }

        const tmpDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        if (media.type === 'image') {
            // High quality image to 512x512 WebP using sharp
            const webpBuffer = await sharp(buffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .webp({ quality: 80 })
                .toBuffer();

            const finalSticker = await addExif(webpBuffer, packname, author);
            await sock.sendMessage(from, { sticker: finalSticker }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✨', key: msg.key } }).catch(() => {});

        } else if (media.type === 'video') {
            const duration = media.msg.seconds || 0;
            if (duration > 15) {
                return await sock.sendMessage(from, {
                    text: "⚠️ Video bohot lambi hai! Sirf *10 seconds* tak ki short video bhejein."
                }, { quoted: msg });
            }

            const inPath = path.join(tmpDir, `stk_in_${Date.now()}.mp4`);
            const outPath = path.join(tmpDir, `stk_out_${Date.now()}.webp`);
            fs.writeFileSync(inPath, buffer);

            const ffmpegBin = ffmpegStatic || 'ffmpeg';
            const cmd = `"${ffmpegBin}" -i "${inPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=12,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=00000000" -loop 0 -ss 0 -t 10 -preset default -an -vsync 0 "${outPath}" -y`;

            await new Promise((resolve, reject) => {
                exec(cmd, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            if (!fs.existsSync(outPath)) {
                throw new Error("FFmpeg failed to generate animated WebP.");
            }

            const rawWebp = fs.readFileSync(outPath);
            const finalSticker = await addExif(rawWebp, packname, author);

            await sock.sendMessage(from, { sticker: finalSticker }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '🎬', key: msg.key } }).catch(() => {});

            try {
                if (fs.existsSync(inPath)) fs.unlinkSync(inPath);
                if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
            } catch (_) {}

        } else if (media.type === 'sticker') {
            // Take / change watermark of existing sticker
            const finalSticker = await addExif(buffer, packname, author);
            await sock.sendMessage(from, { sticker: finalSticker }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '🏷️', key: msg.key } }).catch(() => {});
        }

    } catch (e) {
        console.error('[Sticker Command Error]:', e);
        await sock.sendMessage(from, {
            text: `❌ *Sticker Creation Failed*\n\nReason: ${e.message || 'Unknown error'}`
        }, { quoted: msg });
    }
}

// Take / Steal command to rename existing sticker
async function takeCommand(sock, from, msg, args) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted?.stickerMessage) {
        return await sock.sendMessage(from, {
            text: "❌ Kisi sticker ko reply kar ke *.take* likhein!\n\nExample: *.take MR SAQIB|BOT*"
        }, { quoted: msg });
    }
    return await stickerCommand(sock, from, msg, args);
}

module.exports = {
    stickerCommand,
    takeCommand
};
