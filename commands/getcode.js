'use strict';

/**
 * MR SAQIB MD :: CODE EXTRACTOR & PROTO RUNNER ENGINE (.gitcode / .run)
 * ============================================================================
 * Extracts raw WAMessageContent / proto from any replied message (menus,
 * interactive buttons, lottie stickers, carousels, view-once, media, etc.)
 * and exports it as a valid executable .js backup file.
 * 
 * Commands:
 * - .gitcode / .getcode / .dumpcode / .rawcode / .gwtcode : Extract code to .js file
 * - .viewcode / .showcode                                : View extracted code as text
 * - .run / .restore / .relaycode                         : Restore/relay replied .js backup
 * ============================================================================
 */

const vm = require('vm');
const { downloadContentFromMessage, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

/**
 * Extract contextInfo from any message wrapper
 */
function extractContextInfo(msg) {
    if (!msg || !msg.message) return null;
    const m = msg.message;
    return m.extendedTextMessage?.contextInfo ||
           m.imageMessage?.contextInfo ||
           m.videoMessage?.contextInfo ||
           m.audioMessage?.contextInfo ||
           m.documentMessage?.contextInfo ||
           m.stickerMessage?.contextInfo ||
           m.interactiveResponseMessage?.contextInfo ||
           m.buttonsResponseMessage?.contextInfo ||
           m.templateButtonReplyMessage?.contextInfo ||
           m.listResponseMessage?.contextInfo ||
           m.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ||
           m.viewOnceMessage?.message?.extendedTextMessage?.contextInfo ||
           m.viewOnceMessageV2?.message?.extendedTextMessage?.contextInfo ||
           null;
}

/**
 * Unwrap ephemeral / viewOnce / document wrappers to get innermost message
 */
function unwrapMessage(msgObj) {
    if (!msgObj) return null;
    let curr = msgObj;
    let depth = 0;
    while (curr && depth < 5) {
        if (curr.ephemeralMessage?.message) {
            curr = curr.ephemeralMessage.message;
        } else if (curr.viewOnceMessage?.message) {
            curr = curr.viewOnceMessage.message;
        } else if (curr.viewOnceMessageV2?.message) {
            curr = curr.viewOnceMessageV2.message;
        } else if (curr.viewOnceMessageV2Extension?.message) {
            curr = curr.viewOnceMessageV2Extension.message;
        } else if (curr.documentWithCaptionMessage?.message) {
            curr = curr.documentWithCaptionMessage.message;
        } else {
            break;
        }
        depth++;
    }
    return curr;
}

/**
 * Detect a clean author / bot brand name from quoted content or sender
 */
function detectSenderBrand(rawMsg, ctx) {
    // 1. Check text content for known brand signatures
    const sampleText = [
        rawMsg?.conversation,
        rawMsg?.extendedTextMessage?.text,
        rawMsg?.imageMessage?.caption,
        rawMsg?.videoMessage?.caption,
        rawMsg?.documentMessage?.caption,
        rawMsg?.interactiveMessage?.body?.text,
        rawMsg?.interactiveMessage?.header?.title
    ].filter(Boolean).join(' ');

    if (/fam\s*ofc|famofc/i.test(sampleText)) return 'FAM OFC';
    if (/saqib|mr\s*saqib/i.test(sampleText)) return 'MR SAQIB';
    if (/h4k3r|hacker/i.test(sampleText)) return 'H4K3R';
    if (/alpha\s*md|alpha/i.test(sampleText)) return 'ALPHA';
    if (/proboy/i.test(sampleText)) return 'PROBOY';
    if (/cyber/i.test(sampleText)) return 'CYBER';

    // 2. Check pushName if present
    if (ctx?.pushName && typeof ctx.pushName === 'string' && ctx.pushName.trim()) {
        const pName = ctx.pushName.trim();
        if (pName.length <= 25) return pName;
    }

    // 3. Fallback to sender phone digits or default
    const sender = ctx?.participant || ctx?.remoteJid || '';
    const digits = sender.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (digits) {
        return `USER-${digits.slice(-4)}`;
    }

    return 'BOT';
}

/**
 * Handle .gitcode / .getcode: Dumps raw code into .js file
 */
async function handleGitCode(sock, from, msg, args = [], botData = {}) {
    try {
        const ctx = extractContextInfo(msg);
        const quotedMsg = ctx?.quotedMessage;

        if (!quotedMsg) {
            const guide =
`╭━━━〔 ⚡ *GETCODE / GITCODE* 〕━━━┈⊷
┃ ❌ *Koi message reply nahi kiya gaya!*
┃ 
┃ 💡 *Kaise use karein:*
┃ Kisi bhi bot ke response, menu, button
┃ message, lottie sticker ya media ko 
┃ *reply* karke *.gitcode* likhein!
┃ 
┃ 📦 Bot uska complete raw Baileys / WAMessage code
┃ nikal kar *.js* backup file bana dega.
┃ 
┃ 🔄 Baad me us *.js* file ko reply karke
┃ *.run* likhein to bot us message ko 
┃ dobara live chat me restore kar dega!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Powered by MR SAQIB MD*`;
            return await sock.sendMessage(from, { text: guide }, { quoted: msg });
        }

        // React processing
        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        // Unwrap innermost message structure
        const unwrapped = unwrapMessage(quotedMsg);
        const cleanPayload = JSON.parse(JSON.stringify(unwrapped));

        // Detect brand name
        const brandName = detectSenderBrand(cleanPayload, ctx);
        const cleanPrefix = brandName.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'bot';
        const timestamp = Date.now();
        const fileName = `${cleanPrefix}-menu-${timestamp}.js`;
        const displayName = brandName.toUpperCase();

        // Format backup file code
        const fileContent =
`/* ${displayName}_MENU_BACKUP_V2 */
module.exports = ${JSON.stringify({
  __famofcMenuBackup: 1,
  createdAt: new Date().toISOString(),
  relayMode: "proto-generate-v2",
  message: cleanPayload,
  additionalNodes: [],
  originalRemoteJid: from
}, null, 2)};
`;

        const caption = `✅ ${displayName} menu backup. Reply to this file and use .run to restore it.`;

        // Send as JavaScript file
        await sock.sendMessage(from, {
            document: Buffer.from(fileContent, 'utf8'),
            mimetype: 'application/javascript',
            fileName: fileName,
            caption: caption
        }, { quoted: msg });

        // React success
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

    } catch (err) {
        console.error('[handleGitCode Error]:', err);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, {
            text: `❌ *Code Extraction Failed:*\n${err.message || 'Unknown error'}`
        }, { quoted: msg });
    }
}

/**
 * Handle .viewcode / .showcode: Shows extracted code inline or as snippet
 */
async function handleViewCode(sock, from, msg, args = [], botData = {}) {
    try {
        const ctx = extractContextInfo(msg);
        const quotedMsg = ctx?.quotedMessage;

        if (!quotedMsg) {
            return await sock.sendMessage(from, {
                text: `⚠️ *Kisi message ko reply karke .viewcode likhein taake uska raw code screen par dikh sake!*`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        const unwrapped = unwrapMessage(quotedMsg);
        const cleanPayload = JSON.parse(JSON.stringify(unwrapped));
        const jsonStr = JSON.stringify(cleanPayload, null, 2);

        if (jsonStr.length <= 3500) {
            const replyText =
`╭━━━〔 📜 *RAW MESSAGE CODE* 〕━━━┈⊷
\`\`\`javascript
${jsonStr}
\`\`\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
💡 *Tip:* Is code ko .js file me save karne ke liye *.gitcode* use karein!`;
            await sock.sendMessage(from, { text: replyText }, { quoted: msg });
        } else {
            // Send as snippet file if too large
            const fileName = `code-snippet-${Date.now()}.json`;
            await sock.sendMessage(from, {
                document: Buffer.from(jsonStr, 'utf8'),
                mimetype: 'application/json',
                fileName: fileName,
                caption: `📄 *Raw Message Code* (${Math.round(jsonStr.length / 1024)} KB)`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (err) {
        console.error('[handleViewCode Error]:', err);
        await sock.sendMessage(from, { text: `❌ *View Code Error:* ${err.message}` }, { quoted: msg });
    }
}

/**
 * Handle .run / .restore: Executes/relays a replied .js backup file or raw JSON
 */
async function handleRunCode(sock, from, msg, args = [], botData = {}) {
    try {
        const ctx = extractContextInfo(msg);
        const quotedMsg = ctx?.quotedMessage;

        let codeString = '';

        // Check if replying to document message (.js or .json)
        const docMsg = quotedMsg?.documentMessage ||
                       quotedMsg?.documentWithCaptionMessage?.message?.documentMessage;

        if (docMsg) {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
            const stream = await downloadContentFromMessage(docMsg, 'document');
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            codeString = buffer.toString('utf8');
        } else if (quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text) {
            codeString = quotedMsg.conversation || quotedMsg.extendedTextMessage.text || '';
        } else if (args && args.length > 0) {
            codeString = args.join(' ');
        }

        if (!codeString || !codeString.trim()) {
            const guide =
`╭━━━〔 🚀 *RESTORE / RUN ENGINE* 〕━━━┈⊷
┃ ❌ *Koi file ya code provide nahi kiya gaya!*
┃ 
┃ 💡 *Kaise use karein:*
┃ 1. Kisi bhi message par *.gitcode* use karein.
┃ 2. Phir bot ki bheji hui *.js* file ko *reply*
┃    karke *.run* likhein!
┃ 
┃ ⚡ Bot us file ka raw message chat me live
┃ relay / restore kar dega!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Powered by MR SAQIB MD*`;
            return await sock.sendMessage(from, { text: guide }, { quoted: msg });
        }

        // Parse code payload safely
        let payload = null;

        // Try direct JSON first
        try {
            payload = JSON.parse(codeString);
        } catch (_) {
            // Evaluate JS module.exports in sandboxed VM
            try {
                const sandbox = {
                    module: { exports: {} },
                    exports: {},
                    Buffer: Buffer
                };
                vm.createContext(sandbox);
                vm.runInContext(codeString, sandbox, { timeout: 3000 });
                payload = sandbox.module.exports;
                if (!payload || Object.keys(payload).length === 0) {
                    payload = sandbox.exports;
                }
            } catch (evalErr) {
                return await sock.sendMessage(from, {
                    text: `❌ *Invalid Code / Syntax Error:*\n${evalErr.message}`
                }, { quoted: msg });
            }
        }

        if (!payload || typeof payload !== 'object') {
            return await sock.sendMessage(from, {
                text: `❌ *Payload error:* File me koi valid message object nahi mila.`
            }, { quoted: msg });
        }

        // Extract message to relay
        const msgToRelay = payload.message || payload;
        const additionalNodes = Array.isArray(payload.additionalNodes) ? payload.additionalNodes : [];

        // Generate rich Baileys message
        const richMessage = generateWAMessageFromContent(from, msgToRelay, {
            userJid: sock.user?.id || undefined
        });

        // Relay to WhatsApp
        await sock.relayMessage(from, richMessage.message, {
            messageId: richMessage.key.id,
            additionalNodes: additionalNodes
        });

        // React success
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

    } catch (err) {
        console.error('[handleRunCode Error]:', err);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, {
            text: `❌ *Restore / Run Error:*\n${err.message || 'Failed to relay message'}`
        }, { quoted: msg });
    }
}

module.exports = {
    handleGitCode,
    handleViewCode,
    handleRunCode
};
