// commands/photoFilter.js - High Speed Local Photo Filters & Enhancers using Sharp
'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');

/**
 * Extract image or sticker buffer from message or quoted message
 */
async function extractImageBuffer(msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = quoted || msg.message;
    if (!target) return null;

    const actual = target.viewOnceMessageV2?.message || target.viewOnceMessage?.message || target;

    let mediaMsg = null;
    let mediaType = null;

    if (actual.imageMessage) {
        mediaMsg = actual.imageMessage;
        mediaType = 'image';
    } else if (actual.stickerMessage) {
        mediaMsg = actual.stickerMessage;
        mediaType = 'sticker';
    }

    if (!mediaMsg) return null;

    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return { buffer, isSticker: mediaType === 'sticker' };
}

/**
 * Universal Photo Filter Command
 */
async function photoFilterCommand(sock, from, msg, filterType = 'enhance', args = []) {
    try {
        const extracted = await extractImageBuffer(msg);
        if (!extracted || !extracted.buffer || extracted.buffer.length === 0) {
            return await sock.sendMessage(from, {
                text:
`╭━━━〔 🎨 *AI PHOTO FILTERS & ENHANCER* 〕━━━┈⊷
┃ 📌 *Usage:*
┃ Kisi bhi image ya sticker ko reply karke command likhein:
┃ 
┃ ✨ *Available Filters:*
┃ • *.enhance* ya *.hd* (Sharpen & High Definition)
┃ • *.bw* ya *.grayscale* (Monochrome Black & White)
┃ • *.blur [1-30]* (Gaussian Blur for Privacy)
┃ • *.invert* ya *.negative* (Color Inversion)
┃ • *.sepia* (Vintage Retro Effect)
┃ • *.circle* ya *.round* (Circular Avatar Crop)
┃ • *.flip* ya *.mirror* (Horizontal Mirror)
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

🚀 *Powered by MR SAQIB MD (Sharp Engine)*`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } }).catch(() => {});

        let pipeline = sharp(extracted.buffer, { pages: 1 });
        let outMime = 'image/jpeg';
        let actionLabel = 'Enhanced';

        switch (filterType.toLowerCase()) {
            case 'enhance':
            case 'sharpen':
            case 'hd':
                pipeline = pipeline
                    .sharpen({ sigma: 1.5, m1: 1.3, m2: 0.7 })
                    .normalize()
                    .modulate({ brightness: 1.04, saturation: 1.08 });
                actionLabel = 'Enhanced (HD Quality)';
                break;

            case 'bw':
            case 'grayscale':
            case 'blackandwhite':
                pipeline = pipeline
                    .grayscale()
                    .normalize();
                actionLabel = 'Black & White Aesthetic';
                break;

            case 'blur': {
                const radius = Math.min(Math.max(parseInt(args[0], 10) || 7, 1), 30);
                pipeline = pipeline.blur(radius);
                actionLabel = `Gaussian Blur (${radius}px)`;
                break;
            }

            case 'invert':
            case 'negative':
                pipeline = pipeline.negate({ alpha: false });
                actionLabel = 'Negative Color Invert';
                break;

            case 'sepia':
                pipeline = pipeline.recomb([
                    [0.393, 0.769, 0.189],
                    [0.349, 0.686, 0.168],
                    [0.272, 0.534, 0.131]
                ]);
                actionLabel = 'Vintage Sepia';
                break;

            case 'flip':
            case 'mirror':
                pipeline = pipeline.flop();
                actionLabel = 'Horizontal Mirror';
                break;

            case 'circle':
            case 'round': {
                const meta = await pipeline.metadata();
                const minDim = Math.min(meta.width || 400, meta.height || 400);
                const r = Math.floor(minDim / 2);
                const svgMask = Buffer.from(
                    `<svg width="${minDim}" height="${minDim}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff" /></svg>`
                );
                pipeline = pipeline
                    .resize(minDim, minDim, { fit: 'cover' })
                    .composite([{ input: svgMask, blend: 'dest-in' }])
                    .png();
                outMime = 'image/png';
                actionLabel = 'Circular Crop';
                break;
            }

            default:
                pipeline = pipeline.sharpen().normalize();
                actionLabel = 'Enhanced';
        }

        const outputBuffer = outMime === 'image/png'
            ? await pipeline.png({ quality: 95 }).toBuffer()
            : await pipeline.jpeg({ quality: 90 }).toBuffer();

        await sock.sendMessage(from, {
            image: outputBuffer,
            caption: `✅ *Photo ${actionLabel}!*\n\n🚀 _MR SAQIB MD_`
        }, { quoted: msg });

        await sock.sendMessage(from, { react: { text: '✨', key: msg.key } }).catch(() => {});

    } catch (error) {
        console.error('[Photo Filter Error]:', error);
        await sock.sendMessage(from, {
            text: `❌ Photo filter fail ho gaya: ${error.message || 'Unknown error'}`
        }, { quoted: msg });
    }
}

module.exports = { photoFilterCommand };
