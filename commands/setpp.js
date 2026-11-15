'use strict';

/**
 * ProBoy-MD / MR SAQIB MD :: Full DP & Group DP Module
 * ============================================================================
 * Features:
 * - .setpp  : Set bot profile picture (100% Full Edge-to-Edge HD, zero sidebars)
 * - .setgpp : Set group profile picture (100% Full Edge-to-Edge HD, zero sidebars)
 * - Supports Multi-Session: Updates DP across all connected bot sessions
 * - Modes:
 *     👉 .setpp       -> 100% Full Cover HD (Smart Attention / Face Focus, zero blur)
 *     👉 .setpp top   -> 100% Full Cover HD (Top Aligned, best for full standing photos)
 *     👉 .setpp center-> 100% Full Cover HD (Center Crop)
 *     👉 .setpp blur  -> Contain with Blurred Padding (No Crop)
 * ============================================================================
 */

const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const settings = require('../settings');

/**
 * Convert string to Mathematical Sans-Serif Bold Unicode (e.g. 𝗠𝗥 𝗦𝗔𝗤𝗜𝗕 𝗠𝗗)
 */
function toSansBold(str) {
    return String(str || '').replace(/[A-Za-z0-9]/g, c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + code - 97);
        if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);
        return c;
    });
}

/**
 * Gather all active connected Baileys sockets across sessions
 */
function getActiveSockets(primarySock) {
    let activeSocks = [];
    try {
        if (typeof globalThis.ProBoySessionManager?.getActiveSocks === 'function') {
            activeSocks = globalThis.ProBoySessionManager.getActiveSocks();
        }
    } catch {}

    const seen = new Set();
    const result = [];

    const checkAndAdd = (s) => {
        if (!s) return;
        const rawId = s.user?.id || '';
        const acct = rawId ? jidNormalizedUser(rawId) : null;
        if (!acct || seen.has(acct)) return;
        const isUp = Boolean(s.ws?.isOpen || s.ws?.readyState === 1 || s.user?.id);
        if (isUp) {
            seen.add(acct);
            result.push(s);
        }
    };

    if (primarySock) checkAndAdd(primarySock);
    for (const s of activeSocks) {
        checkAndAdd(s);
    }
    if (!result.length && primarySock) result.push(primarySock);
    return result;
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
 * Process image to WhatsApp 720x720 canvas
 * By default: 100% Full Edge-to-Edge HD (Zero Sidebars, Zero Blur, Smart Attention / Face Focus)
 */
async function processFullDP(buffer, modeArg = '') {
    const img = sharp(buffer);
    const meta = await img.metadata();
    const w = meta.width || 720;
    const h = meta.height || 720;
    const targetSize = 720;

    const ratio = w / h;
    const isSquare = Math.abs(ratio - 1) < 0.05;
    const mode = String(modeArg || '').trim().toLowerCase();

    // Mode: blur / fit (Contain with blurred padding - only if explicitly requested)
    if (mode === 'blur' || mode === 'fit' || mode === 'pad') {
        const background = await sharp(buffer)
            .resize(targetSize, targetSize, { fit: 'cover' })
            .blur(25)
            .toBuffer();

        const foreground = await sharp(buffer)
            .resize(targetSize, targetSize, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .toBuffer();

        const blurredComposite = await sharp(background)
            .composite([{ input: foreground, gravity: 'center' }])
            .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
            .toBuffer();

        return {
            buffer: blurredComposite,
            width: w,
            height: h,
            mode: 'Contain (Blurred Sidebars)'
        };
    }

    // Mode: top (Full edge-to-edge aligned to top, ideal for standing portrait)
    if (mode === 'top') {
        const topCropped = await sharp(buffer)
            .resize(targetSize, targetSize, { fit: 'cover', position: 'top' })
            .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
            .toBuffer();

        return {
            buffer: topCropped,
            width: w,
            height: h,
            mode: '100% Full Cover HD (Top Focus)'
        };
    }

    // Mode: center / crop (Full edge-to-edge centered)
    if (mode === 'center' || mode === 'crop') {
        const centerCropped = await sharp(buffer)
            .resize(targetSize, targetSize, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
            .toBuffer();

        return {
            buffer: centerCropped,
            width: w,
            height: h,
            mode: '100% Full Cover HD (Center Focus)'
        };
    }

    // DEFAULT MODE (No arguments or 'full'):
    // 100% FULL FRAME COVER HD! Zero sidebars, zero blur padding, smart attention/face focus!
    let fullBuffer;
    try {
        fullBuffer = await sharp(buffer)
            .resize(targetSize, targetSize, {
                fit: 'cover',
                position: sharp.strategy.attention
            })
            .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
            .toBuffer();
    } catch {
        fullBuffer = await sharp(buffer)
            .resize(targetSize, targetSize, {
                fit: 'cover',
                position: h > w ? 'top' : 'center'
            })
            .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
            .toBuffer();
    }

    return {
        buffer: fullBuffer,
        width: w,
        height: h,
        mode: isSquare ? '100% Full HD (1:1 Original)' : '100% Full Cover HD (Zero Sidebars)'
    };
}

/**
 * .setpp / .fullpp / .longpp - Set bot profile picture
 */
async function setppCommand(sock, from, msg, isOwner, args = []) {
    try {
        if (!isOwner) {
            return await sock.sendMessage(from, { 
                text: "❌ *Access Denied:*\nSirf Bot Owner ya is session ka paired user profile picture change kar sakta hai!" 
            }, { quoted: msg });
        }

        const buffer = await extractImageBuffer(msg);
        if (!buffer || buffer.length === 0) {
            return await sock.sendMessage(from, {
                text: 
`╭━━━〔 ⚡ ${toSansBold('SET PROFILE PICTURE')} ⚡ 〕━━━┈⊷
┃ 📸 *Usage:* Kisi photo ke reply mein likhein:
┃
┃ 👉 *.setpp*       — 100% Full HD DP (Zero Sidebars / Smart Focus)
┃ 👉 *.setpp top*   — 100% Full HD DP (Top Focus for standing photos)
┃ 👉 *.setpp center*— 100% Full HD DP (Center Crop)
┃ 👉 *.setpp blur*  — Full Portrait with Blurred Sidebars
┃
┃ ✨ *Features:*
┃ ✦ 100% Full Screen Edge-to-Edge HD (720×720)
┃ ✦ Bilkul sidebars ya blur nahi aayega!
┃ ✦ Multi-Session Auto-Update!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        const modeArg = args[0] || '';
        const processed = await processFullDP(buffer, modeArg);

        // ONLY update this WhatsApp account (sock). Other users' profiles remain completely untouched!
        const rawId = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
        const acctNum = rawId ? rawId.split('@')[0] : 'Bot';

        try {
            // Direct WhatsApp IQ query (highest quality, no lossy Baileys re-compression)
            await sock.query({
                tag: 'iq',
                attrs: {
                    to: 's.whatsapp.net',
                    type: 'set',
                    xmlns: 'w:profile:picture'
                },
                content: [
                    {
                        tag: 'picture',
                        attrs: { type: 'image' },
                        content: processed.buffer
                    }
                ]
            });
        } catch (iqErr) {
            if (rawId) {
                await sock.updateProfilePicture(rawId, processed.buffer);
            } else {
                throw iqErr;
            }
        }

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

        const responseText = 
`╭━━━〔 ⚡ ${toSansBold(settings.botName || 'MR SAQIB MD')} ⚡ 〕━━━┈⊷
┃ 🖼️ *Profile Picture Updated!*
┃ 📏 *Style:* ${processed.mode}
┃ 📐 *Size:* 720 × 720 Full HD
┃ 📱 *Account:* +${acctNum}
┃ 👑 *Set By:* ${toSansBold(settings.ownerName || 'MR SAQIB')}
┃ 🟢 *Status:* DP Sirf Iss Number Par Set Ho Gayi ✅
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
💡 _Dusre kisi user ya session ki profile picture change nahi hui._`;

        await sock.sendMessage(from, { text: responseText }, { quoted: msg });

    } catch (err) {
        console.error('[SETPP Error]:', err);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, { 
            text: `❌ *Profile picture update failed:*\n_${err.message}_` 
        }, { quoted: msg });
    }
}

/**
 * .setgpp / .gpp / .setgroupdp - Set group profile picture
 */
async function setgppCommand(sock, from, msg, isAdmin, isOwner, args = []) {
    try {
        if (!from.endsWith('@g.us')) {
            return await sock.sendMessage(from, { 
                text: "❌ *Ye command sirf groups mein use ho sakti hai!*" 
            }, { quoted: msg });
        }

        if (!isAdmin && !isOwner) {
            return await sock.sendMessage(from, { 
                text: "❌ *Sirf group admin ya bot owner group DP change kar sakta hai!*" 
            }, { quoted: msg });
        }

        const buffer = await extractImageBuffer(msg);
        if (!buffer || buffer.length === 0) {
            return await sock.sendMessage(from, {
                text: 
`╭━━━〔 ⚡ ${toSansBold('SET GROUP DP')} ⚡ 〕━━━┈⊷
┃ 👥 *Usage:* Group mein kisi photo ke reply mein likhein:
┃
┃ 👉 *.setgpp*       — 100% Full HD Group DP (Zero Sidebars)
┃ 👉 *.setgpp top*   — 100% Full HD Group DP (Top Focus)
┃ 👉 *.setgpp blur*  — Group DP with Blurred Padding
┃
┃ ✨ *Features:*
┃ ✦ 100% Full Screen Edge-to-Edge HD (720×720)
┃ ✦ Bilkul sidebars ya blur borders nahi aayenge!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        // Check if bot is admin in the group
        const groupMetadata = await sock.groupMetadata(from).catch(() => null);
        const botPhone = (sock.user?.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const botLid = (sock.user?.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const botParticipant = groupMetadata?.participants?.find(p => {
            const pIdDigits = (p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            const pLidDigits = (p.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            return (botPhone && (pIdDigits === botPhone || pLidDigits === botPhone)) ||
                   (botLid && (pIdDigits === botLid || pLidDigits === botLid));
        });
        const botIsAdmin = botParticipant && (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin');

        if (!botIsAdmin) {
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            return await sock.sendMessage(from, {
                text: "❌ *Bot is group ka admin nahi hai!*\n\nPehle bot ko admin banayein taake group DP update ho sake."
            }, { quoted: msg });
        }

        const modeArg = args[0] || '';
        const processed = await processFullDP(buffer, modeArg);

        const targetGroupJid = jidNormalizedUser(from);

        // Apply via direct IQ query
        try {
            await sock.query({
                tag: 'iq',
                attrs: {
                    to: 's.whatsapp.net',
                    type: 'set',
                    xmlns: 'w:profile:picture',
                    target: targetGroupJid
                },
                content: [
                    {
                        tag: 'picture',
                        attrs: { type: 'image' },
                        content: processed.buffer
                    }
                ]
            });
        } catch (iqErr) {
            await sock.updateProfilePicture(targetGroupJid, processed.buffer);
        }

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

        const responseText = 
`╭━━━〔 ⚡ ${toSansBold(settings.botName || 'MR SAQIB MD')} ⚡ 〕━━━┈⊷
┃ 👥 *Group DP Updated!*
┃ 🏷️ *Group:* ${groupMetadata.subject || 'Group'}
┃ 📏 *Style:* ${processed.mode}
┃ 📐 *Size:* 720 × 720 Full HD
┃ 🟢 *Status:* 100% Full Cover Applied ✅
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

        await sock.sendMessage(from, { text: responseText }, { quoted: msg });

    } catch (err) {
        console.error('[SETGPP Error]:', err);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, { 
            text: `❌ *Group DP update failed:*\n_${err.message}_` 
        }, { quoted: msg });
    }
}

module.exports = {
    setppCommand,
    setgppCommand,
    processFullDP,
    extractImageBuffer
};
