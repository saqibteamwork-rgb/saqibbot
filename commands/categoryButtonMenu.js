'use strict';

/**
 * MR SAQIB MD :: All-Categories Interactive Button Menu (Style 16 - AMAN-MD Style)
 * ============================================================================
 * Sends a native WhatsApp Interactive Button Card matching the user's uploaded
 * reference (AMAN-MD Style):
 *   - Clean aesthetic header:
 *       *MR SAQIB MD*
 *       📁 Categories (10) · 987 commands
 *       Kisi bhi category par tap karo
 *       👇
 *   - Native Flow Action Buttons:
 *       [ 🔗 Pair ]              -> CTA URL
 *       [ 👑 SAQIB (93) ]        -> Quick reply -> .menu owner
 *       [ 🏠 GENERAL (60) ]      -> Quick reply -> .menu general
 *       [ 👥 GROUP (94) ]        -> Quick reply -> .menu group
 *       [ 📥 DOWNLOAD (41) ]     -> Quick reply -> .menu download
 *       [ 🧰 TOOLS (206) ]       -> Quick reply -> .menu tools
 *       [ 🤖 AI & MEDIA (60) ]   -> Quick reply -> .menu ai
 *       [ 🎮 FUN (203) ]         -> Quick reply -> .menu fun
 *       [ 🕌 ISLAMIC (69) ]      -> Quick reply -> .menu islamic
 *       [ 🎌 ANIME (39) ]        -> Quick reply -> .menu anime
 *   - Footer:
 *       Powered By MR SAQIB MD
 * ============================================================================
 */

const { getBotPic } = require('../lib/botpic');
const settings = require('../settings');
const config = require('../config');

// Category metadata definitions with icons & filter codes
const BUTTON_CATEGORIES = [
    { name: 'SAQIB', icon: '👑', filter: 'owner', count: 93 },
    { name: 'GENERAL', icon: '🏠', filter: 'general', count: 60 },
    { name: 'GROUP', icon: '👥', filter: 'group', count: 94 },
    { name: 'DOWNLOAD', icon: '📥', filter: 'download', count: 41 },
    { name: 'TOOLS', icon: '🧰', filter: 'tools', count: 206 },
    { name: 'AI & MEDIA', icon: '🤖', filter: 'ai', count: 60 },
    { name: 'FUN', icon: '🎮', filter: 'fun', count: 203 },
    { name: 'ISLAMIC', icon: '🕌', filter: 'islamic', count: 69 },
    { name: 'ANIME', icon: '🎌', filter: 'anime', count: 39 }
];

/**
 * Builds Meta AI Quoted Contact Message Object
 */
function buildMetaAiQuote(botName = 'MR SAQIB MD', ownerNumber = '923468616487') {
    const cleanNum = String(ownerNumber || '923468616487').replace(/[^0-9]/g, '');
    return {
        key: {
            fromMe: false,
            participant: '0@s.whatsapp.net',
            remoteJid: 'status@broadcast',
            id: `META_CAT_${Date.now()}`
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
                        newsletterName: `${botName} • SAQIB AI`,
                        serverMessageId: 1
                    }
                }
            }
        }
    };
}

/**
 * Sends All-Categories Interactive Button Menu (Style 16)
 */
async function sendCategoryButtonMenu(sock, from, msg, botName = 'MR SAQIB MD', ownerName = 'Mr SAQIB', prefix = '.') {
    // Quick reaction
    await sock.sendMessage(from, { react: { text: '📁', key: msg.key } }).catch(() => {});

    const cleanPrefix = prefix || '.';
    const pairUrl = settings.websiteUrl ? `${settings.websiteUrl}/pair` : 'https://mrsaqib.me/pair';
    const totalCmds = 987;

    // Body text matching the user's reference image exactly
    const bodyText =
        `*${botName}*\n` +
        `📁 Categories (${BUTTON_CATEGORIES.length}) · ${totalCmds} commands\n` +
        `Kisi bhi category par tap karo\n` +
        `👇`;

    const metaAiQuote = buildMetaAiQuote(botName, config.OWNER_NUMBER || '923468616487');

    try {
        const baileys = require('@whiskeysockets/baileys');
        const { proto, generateWAMessageFromContent, prepareWAMessageMedia } = baileys;
        const IM = proto.Message.InteractiveMessage;

        // Upload official menu image if available
        let imageMessage = null;
        if (typeof sock?.waUploadToServer === 'function') {
            try {
                const pic = getBotPic(sock) || { url: settings.menuImage || 'https://ik.imagekit.io/mrsaqib/image_ePUwM_YDT.png' };
                const upload = await Promise.race([
                    prepareWAMessageMedia({ image: pic }, { upload: sock.waUploadToServer }),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
                ]);
                imageMessage = upload.imageMessage;
            } catch (_) {}
        }

        // Build native flow buttons list
        const buttons = [
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: '🔗 Pair',
                    url: pairUrl,
                    merchant_url: pairUrl
                })
            }
        ];

        // Add each category button
        for (const cat of BUTTON_CATEGORIES) {
            buttons.push({
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: `${cat.icon} ${cat.name} (${cat.count})`,
                    id: `${cleanPrefix}menu ${cat.filter}`
                })
            });
        }

        const interactive = IM.create({
            header: IM.Header.create({
                title: `${botName}`,
                hasMediaAttachment: Boolean(imageMessage),
                ...(imageMessage ? { imageMessage } : {})
            }),
            body: IM.Body.create({ text: bodyText }),
            footer: IM.Footer.create({ text: `Powered By ${botName}` }),
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
        console.error('[sendCategoryButtonMenu Error]:', err.stack || err.message);

        // Fallback: Clean text categories list with emojis
        const fallbackText =
            `*${botName}*\n` +
            `📁 *Categories (${BUTTON_CATEGORIES.length}) · ${totalCmds} commands*\n` +
            `Kisi bhi category par tap karein ya command likhein:\n\n` +
            BUTTON_CATEGORIES.map(c => `• *${c.icon} ${c.name} (${c.count})* 👉 \`${cleanPrefix}menu ${c.filter}\``).join('\n') +
            `\n\n> *Powered By ${ownerName}*`;

        await sock.sendMessage(from, { text: fallbackText }, { quoted: msg }).catch(() => {});
        return false;
    }
}

module.exports = {
    sendCategoryButtonMenu,
    BUTTON_CATEGORIES
};
