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

// In-memory media upload cache (20-minute TTL)
const mediaCache = new Map();
const MEDIA_TTL_MS = 20 * 60 * 1000;

async function getUploadedHeaderMedia(sock, prepareWAMessageMedia) {
    if (!sock || typeof sock.waUploadToServer !== 'function') return null;

    const pic = getBotPic(sock) || {
        url: settings.menuImage || config.menuImage || 'https://ik.imagekit.io/19imy4f1u/lite_1775822697436_IXJPba-z2.png'
    };
    const key = `${String(sock?.user?.id || '').split(':')[0]}|${pic.url}`;

    const hit = mediaCache.get(key);
    if (hit && Date.now() - hit.at < MEDIA_TTL_MS) {
        return hit.media;
    }

    try {
        const upload = await Promise.race([
            prepareWAMessageMedia({ image: pic }, { upload: sock.waUploadToServer }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Image upload timeout')), 8000))
        ]);
        const media = upload?.imageMessage || null;
        if (media) mediaCache.set(key, { at: Date.now(), media });
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
function buildMetaAiQuote(botName = 'MR SAQIB MD', ownerNumber = '923468616487') {
    const cleanNum = String(ownerNumber || '923468616487').replace(/[^0-9]/g, '');
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
                vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Meta AI\nORG:Meta AI;\nTEL;type=CELL;type=VOICE;waid=${cleanNum}:+${cleanNum}\nEND:VCARD`
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

    // Build the exact card body matching Image 2 & Image 3
    let bodyText =
        `🏷️ *${botName}*\n` +
        `${timings.endTomorrowStr}\n` +
        `Code: ${botName} WaBot\n\n` +
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
        `📚 *Use ${cleanPrefix}allmenu to browse all commands.*\n` +
        `🔥 *Powered by ${ownerName}*`;

    const metaAiQuote = buildMetaAiQuote(botName, config.OWNER_NUMBER || '923468616487');

    try {
        const baileys = require('@whiskeysockets/baileys');
        const { proto, prepareWAMessageMedia, generateWAMessageFromContent } = baileys;
        const IM = proto.Message.InteractiveMessage;

        // Upload / fetch banner image
        const imageMessage = await getUploadedHeaderMedia(sock, prepareWAMessageMedia);

        const cardHeader = IM.Header.fromObject({
            title: `${botName} WaBot`,
            subtitle: `${timings.endTomorrowStr}\nCode: ${botName} WaBot`,
            hasMediaAttachment: Boolean(imageMessage),
            ...(imageMessage ? { imageMessage } : {})
        });

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
                    url: 'https://whatsapp.com/channel/0029Vb4qJbC7Noa7UjO62V1i',
                    merchant_url: 'https://whatsapp.com/channel/0029Vb4qJbC7Noa7UjO62V1i'
                })
            },
            {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: '📋 Copy Bot Code',
                    copy_code: `${botName} WaBot`
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

        // Private chat business bot tag
        if (!from.endsWith('@g.us')) {
            additionalNodes.push({
                tag: 'bot',
                attrs: { biz_bot: '1' }
            });
        }

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
        // Fallback: Send message quoting Meta AI
        try {
            const pic = getBotPic(sock) || {
                url: settings.menuImage || config.menuImage || 'https://ik.imagekit.io/19imy4f1u/lite_1775822697436_IXJPba-z2.png'
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
