'use strict';

/**
 * MR SAQIB MD :: Meta AI Luxury Button Menu (Style 15)
 * ============================================================================
 * Sends a native WhatsApp Interactive Button Card matching the SAYRON MD / FAM OFC style:
 *   - Quoted Meta AI verified status badge:
 *       "Meta AI [blue verified checkmark] • Status"
 *       "👤 Contact: ! MR SAQIB MD !"
 *       "Forwarded many times" with Newsletter channel link
 *   - High quality Anime / Bot banner image header
 *   - Limited-Time Offer / Coupon header box:
 *       "🏷️ MR SAQIB MD"
 *       "Ends tomorrow at 5:40 PM"
 *       "Code: MR SAQIB MD WaBot"
 *   - Aesthetic curved info card with user greeting, date, uptime, prefix, host
 *   - Interactive Native Flow Action Buttons:
 *       [ ↩️ 📚 ALL MENU ]   -> 1-Tap Quick Reply triggering .allmenu
 *       [ 🟢 WA Channel ]     -> 1-Tap opens official WhatsApp Channel
 *       [ 📋 Copy Bot Code ]  -> 1-Tap copies 'MR SAQIB MD WaBot' to clipboard
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { getBotPic } = require('../lib/botpic');
const settings = require('../settings');
const config = require('../config');

// In-memory media upload cache (30-minute TTL)
const mediaCache = new Map();
const MEDIA_TTL_MS = 30 * 60 * 1000;
const MENU15_MP4_PATH = path.join(__dirname, '..', 'media', 'menu15.mp4');
const MENU15_IMAGE_PATH = path.join(__dirname, '..', 'media', 'menu15.jpg');

async function getUploadedHeaderMedia(sock, prepareWAMessageMedia) {
    if (!sock || typeof sock.waUploadToServer !== 'function') return null;

    const sockId = String(sock?.user?.id || '').split(':')[0];

    // Priority 1: Check animated GIF / video file
    if (fs.existsSync(MENU15_MP4_PATH)) {
        const vidKey = `${sockId}|gif|${MENU15_MP4_PATH}`;
        const hitVid = mediaCache.get(vidKey);
        if (hitVid && Date.now() - hitVid.at < MEDIA_TTL_MS) {
            return hitVid.media;
        }

        try {
            const videoBuffer = fs.readFileSync(MENU15_MP4_PATH);
            const upload = await Promise.race([
                prepareWAMessageMedia(
                    { video: videoBuffer, gifPlayback: true, mimetype: 'video/mp4' },
                    { upload: sock.waUploadToServer }
                ),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Video GIF upload timeout')), 5000))
            ]);
            if (upload?.videoMessage) {
                const media = { videoMessage: upload.videoMessage };
                mediaCache.set(vidKey, { at: Date.now(), media });
                return media;
            }
        } catch (e) {
            console.warn('[MetaAiMenu] Warning: GIF video upload timeout/failed, falling back to image:', e.message);
        }
    }

    // Priority 2: Check high-res banner image
    let imageSource = null;
    let imgKey = null;

    if (fs.existsSync(MENU15_IMAGE_PATH)) {
        imageSource = fs.readFileSync(MENU15_IMAGE_PATH);
        imgKey = `${sockId}|img|menu15.jpg`;
    } else {
        const pic = getBotPic(sock) || {
            url: settings.menuImage || config.menuImage || 'https://ik.imagekit.io/mrsaqib/image_ePUwM_YDT.png'
        };
        imageSource = pic;
        imgKey = `${sockId}|img|${pic.url}`;
    }

    const hit = mediaCache.get(imgKey);
    if (hit && Date.now() - hit.at < MEDIA_TTL_MS) {
        return hit.media;
    }

    try {
        const upload = await Promise.race([
            prepareWAMessageMedia({ image: imageSource }, { upload: sock.waUploadToServer }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Image upload timeout')), 4000))
        ]);
        const media = upload?.imageMessage ? { imageMessage: upload.imageMessage } : null;
        if (media) mediaCache.set(imgKey, { at: Date.now(), media });
        return media;
    } catch (e) {
        console.warn('[MetaAiMenu] Warning: Header image upload failed:', e.message);
        return null;
    }
}

/**
 * Builds Meta AI Quoted Contact Message Object
 * When quoted in WhatsApp, Meta client renders the verified purple ring Meta AI badge
 */
function buildMetaAiQuote(botName = 'MR SAQIB MD', ownerNumber = '923286037243') {
    const cleanNum = String(ownerNumber || '923286037243').replace(/[^0-9]/g, '');
    return {
        key: {
            fromMe: false,
            participant: '0@s.whatsapp.net',
            remoteJid: 'status@broadcast',
            id: `META_AI_${Date.now()}`
        },
        message: {
            contactMessage: {
                displayName: `! ${botName} !`,
                vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Meta AI\nORG:Meta AI;\nTEL;type=CELL;type=VOICE;waid=${cleanNum}:+${cleanNum}\nEND:VCARD`,
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363431913895899@newsletter',
                        newsletterName: `${botName} • X-IK AI`,
                        serverMessageId: 1
                    }
                }
            }
        }
    };
}

/**
 * Format today / tomorrow time strings
 */
function getTimingStrings() {
    const now = new Date();
    // Pakistan Time (UTC+5)
    const pktNow = new Date(now.getTime() + (5 * 60 + now.getTimezoneOffset()) * 60000);

    const pad = n => String(n).padStart(2, '0');
    const day = pad(pktNow.getDate());
    const month = pad(pktNow.getMonth() + 1);
    const year = pktNow.getFullYear();
    const hours = pad(pktNow.getHours());
    const minutes = pad(pktNow.getMinutes());
    const seconds = pad(pktNow.getSeconds());

    const dateStr = `${day}/${month}/${year}`;
    const timeStr = `${hours}:${minutes}:${seconds}`;

    // 12-hour format for "Ends tomorrow at 5:40 PM"
    let h12 = pktNow.getHours();
    const ampm = h12 >= 12 ? 'PM' : 'AM';
    h12 = h12 % 12 || 12;
    const endTomorrowStr = `Ends tomorrow at ${h12}:${minutes} ${ampm}`;

    return { dateStr, timeStr, endTomorrowStr };
}

/**
 * Sends Meta AI Luxury Button Menu (Style 15)
 */
async function sendMetaAiButtonMenu(sock, from, msg, botName = 'MR SAQIB MD', ownerName = 'Mr SAQIB', userName = 'Muhammad Saqib', statsData = {}, categoryCommandsText = null, prefix = '.') {
    // Quick reaction
    await sock.sendMessage(from, { react: { text: '✨', key: msg.key } }).catch(() => {});

    const timings = getTimingStrings();
    const uptimeStr = statsData.runtimeStr || 'Online';
    const totalCmds = statsData.totalCommands || '400';
    const cleanPrefix = prefix || '.';
    const websiteUrl = settings.websiteUrl || 'https://mrsaqib.me';

    const channelUrl = settings.channelLink || config.channelLink || 'https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M';

    // Build the exact card body matching Image 2 & Image 3
    let bodyText =
        `🏷️ *${botName}*\n` +
        `${timings.endTomorrowStr}\n` +
        `🌐 *Web:* ${websiteUrl}\n\n` +
        `╭───〔 *${botName} WaBot* 〕───╮\n` +
        `│ Assalam-o-Alaikum,\n` +
        `*${userName}* 🌸\n` +
        `├─────────────\n` +
        `│ 📅 ${timings.dateStr} • ⏱️ ${timings.timeStr}\n` +
        `├─────────────\n` +
        `│ 🟢 *Status:* Online (${uptimeStr})\n` +
        `│ 📶 *Host:* SAQIB-SRV-1\n` +
        `│ ⚡ *Prefix:* [ ${cleanPrefix} ] • ${totalCmds}+ Cmds\n` +
        `╰─────────────\n\n`;

    if (categoryCommandsText) {
        bodyText += categoryCommandsText + `\n\n`;
    }

    bodyText +=
        `📚 *Use ${cleanPrefix}allmenu to browse all commands.*`;

    const metaAiQuote = buildMetaAiQuote(botName, config.OWNER_NUMBER || '923286037243');

    try {
        const baileys = require('@whiskeysockets/baileys');
        const { proto, prepareWAMessageMedia, generateWAMessageFromContent } = baileys;
        const IM = proto.Message.InteractiveMessage;

        // Upload / fetch banner GIF video / image
        const mediaObj = await getUploadedHeaderMedia(sock, prepareWAMessageMedia);

        const cardHeaderObj = {
            title: `${botName} WaBot`,
            subtitle: `${timings.endTomorrowStr}\nOfficial WaBot`,
            hasMediaAttachment: Boolean(mediaObj?.videoMessage || mediaObj?.imageMessage)
        };
        if (mediaObj?.videoMessage) {
            cardHeaderObj.videoMessage = mediaObj.videoMessage;
        } else if (mediaObj?.imageMessage) {
            cardHeaderObj.imageMessage = mediaObj.imageMessage;
        }

        const cardHeader = IM.Header.fromObject(cardHeaderObj);

        const buttons = [
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '↩️ 📚 ALL MENU',
                    id: `${cleanPrefix}allmenu`
                })
            },
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: '🟢 WA Channel',
                    url: channelUrl,
                    merchant_url: channelUrl
                })
            },
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: '🌐 Website',
                    url: websiteUrl,
                    merchant_url: websiteUrl
                })
            }
        ];

        const interactive = IM.create({
            header: cardHeader,
            body: IM.Body.create({ text: bodyText }),
            footer: IM.Footer.create({ text: `🔥 Powered by ${ownerName}` }),
            nativeFlowMessage: IM.NativeFlowMessage.create({
                buttons,
                messageVersion: 1
            })
        });

        // 100% Reliable Native Flow node (NO biz_bot:1 to ensure flawless delivery in private & group chats)
        const additionalNodes = [
            {
                tag: 'biz',
                attrs: {},
                content: [
                    {
                        tag: 'interactive',
                        attrs: { type: 'native_flow', v: '1' },
                        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                    }
                ]
            }
        ];

        const waMsg = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: interactive
                }
            }
        }, {
            userJid: sock.user?.id,
            quoted: metaAiQuote
        });

        await sock.relayMessage(from, waMsg.message, {
            messageId: waMsg.key.id,
            additionalNodes
        });

        return true;
    } catch (err) {
        console.error('[sendMetaAiButtonMenu Error]:', err.stack || err.message);
        // Fallback: Send GIF video, image, or text quoting Meta AI
        try {
            if (fs.existsSync(MENU15_MP4_PATH)) {
                await sock.sendMessage(from, {
                    video: fs.readFileSync(MENU15_MP4_PATH),
                    gifPlayback: true,
                    caption: bodyText
                }, { quoted: metaAiQuote });
                return true;
            }
            if (fs.existsSync(MENU15_IMAGE_PATH)) {
                await sock.sendMessage(from, {
                    image: fs.readFileSync(MENU15_IMAGE_PATH),
                    caption: bodyText
                }, { quoted: metaAiQuote });
                return true;
            }
            const pic = getBotPic(sock) || {
                url: settings.menuImage || config.menuImage || 'https://ik.imagekit.io/mrsaqib/image_ePUwM_YDT.png'
            };
            if (pic && pic.url) {
                await sock.sendMessage(from, { image: { url: pic.url }, caption: bodyText }, { quoted: metaAiQuote });
            } else {
                await sock.sendMessage(from, { text: bodyText }, { quoted: metaAiQuote });
            }
            return true;
        } catch (e2) {
            await sock.sendMessage(from, { text: bodyText }, { quoted: msg }).catch(() => {});
            return false;
        }
    }
}

module.exports = {
    sendMetaAiButtonMenu,
    buildMetaAiQuote
};
