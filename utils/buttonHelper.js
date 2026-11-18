'use strict';

/**
 * MR SAQIB MD :: FAM-Style Interactive Native Flow Button Engine
 * ============================================================================
 * Implements native flow button cards (identical to FAM Bot / famofcV22.js):
 * - cta_url   : Opens website & Google Search directly
 * - cta_copy  : 1-Tap copy phone number or text to clipboard
 * - quick_reply: 1-Tap interactive command buttons (.menu, .owner, etc.)
 *
 * NOTE: As per Meta / WhatsApp protocol, Native Flow Buttons render natively
 * on Mobile WhatsApp (Android & iOS). On WhatsApp Web (PC), Meta displays
 * "Open on your phone to view it".
 * ============================================================================
 */

const fs = require('fs');
const { generateWAMessageFromContent, generateWAMessageContent } = require('@whiskeysockets/baileys');
const settings = require('../settings');

/**
 * Quick Reply Button (Triggers a bot command when tapped on mobile)
 */
function quickReplyButton(displayText, id) {
    return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: String(displayText || ''),
            id: String(id || '')
        })
    };
}

/**
 * CTA URL Button (Opens external browser link when tapped on mobile)
 */
function urlButton(displayText, url) {
    const targetUrl = String(url || '').trim();
    return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
            display_text: String(displayText || ''),
            url: targetUrl,
            merchant_url: targetUrl
        })
    };
}

/**
 * CTA Copy Button (Copies text to phone clipboard when tapped on mobile)
 */
function copyButton(displayText, copyCode) {
    return {
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
            display_text: String(displayText || ''),
            copy_code: String(copyCode || '')
        })
    };
}

/**
 * CTA Call Button (Calls number when tapped on mobile)
 */
function callButton(displayText, phoneNumber) {
    return {
        name: 'cta_call',
        buttonParamsJson: JSON.stringify({
            display_text: String(displayText || ''),
            phone_number: String(phoneNumber || '')
        })
    };
}

/**
 * Sends FAM-Style WhatsApp Interactive Native Flow Button Message
 */
async function sendInteractiveButtons(sock, to, bodyText, buttons = [], quotedMsg = null, options = {}) {
    if (!sock) {
        console.error('[buttonHelper] Cannot send message: sock is undefined');
        return false;
    }

    try {
        let header = undefined;

        // Image header if image is provided
        if (options.image && typeof sock.waUploadToServer === 'function') {
            try {
                let imgData = options.image;
                if (typeof imgData === 'string') {
                    const trimmed = imgData.trim();
                    if (fs.existsSync(trimmed)) {
                        imgData = fs.readFileSync(trimmed);
                    } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                        imgData = { url: trimmed };
                    }
                }
                const content = await generateWAMessageContent(
                    { image: imgData },
                    { upload: sock.waUploadToServer }
                );
                if (content && content.imageMessage) {
                    header = {
                        hasMediaAttachment: true,
                        imageMessage: content.imageMessage
                    };
                }
            } catch (err) {
                console.warn('[buttonHelper] Image header upload failed, sending text:', err.message);
            }
        }

        const interactiveMessage = {
            header: header,
            body: { text: String(bodyText || '') },
            footer: { text: String(options.footer || settings.botName || 'MR SAQIB MD') },
            nativeFlowMessage: {
                buttons: buttons
            }
        };

        if (options.contextInfo) {
            interactiveMessage.contextInfo = options.contextInfo;
        }

        const additionalNodes = [
            {
                tag: "biz",
                attrs: {},
                content: [
                    {
                        tag: "interactive",
                        attrs: { type: "native_flow", v: "1" },
                        content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }]
                    }
                ]
            }
        ];

        const msgObj = generateWAMessageFromContent(to, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: interactiveMessage
                }
            }
        }, { quoted: quotedMsg });

        await sock.relayMessage(to, msgObj.message, {
            messageId: msgObj.key.id,
            additionalNodes: additionalNodes
        });
        return true;
    } catch (err) {
        console.error('[buttonHelper] Interactive button relay failed:', err.message);
        // Safe fallback
        try {
            if (options.image) {
                await sock.sendMessage(to, { image: options.image, caption: bodyText }, { quoted: quotedMsg });
            } else {
                await sock.sendMessage(to, { text: bodyText }, { quoted: quotedMsg });
            }
            return true;
        } catch (e) {
            return false;
        }
    }
}

module.exports = {
    quickReplyButton,
    urlButton,
    copyButton,
    callButton,
    sendInteractiveButtons
};
