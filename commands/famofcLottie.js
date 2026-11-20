'use strict';

/**
 * MR SAQIB MD :: FAMOFC PREMIUM LOTTIE ANIMATED STICKER ENGINE
 * ============================================================================
 * Official WhatsApp Vector Animated Lottie Sticker (application/was, isLottie: true)
 * 
 * Features:
 *  - Standalone Send (.famofc, .famsticker, .lottie2, .was2, .premiumsticker)
 *  - Quoted Reaction / Annotation (.famofc, .famreact on quoted message)
 *  - Save to Personal Collection (.famofc save [name])
 *  - Send to Target JID (.famofc <number>)
 *  - Technical Specs & Diagnostic Info (.famofc info)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const {
    jidNormalizedUser,
    generateWAMessageFromContent,
    proto
} = require('@whiskeysockets/baileys');

const {
    loadSavedStickers,
    saveSavedStickers,
    extractUserIdentifiers,
    getUserRecord
} = require('./stickerReact');

const BACKUP_PAYLOAD_PATH = path.join(__dirname, '../data/famofc_sticker_payload.js');
const LOCAL_WAS_FILE = path.join(__dirname, '../data/stickers/famofc_lottie.was');

/**
 * Static payload fallback extracted from FAMOFC_MENU_BACKUP_V2
 */
const DEFAULT_LOTTIE_DATA = {
    url: "https://mmg.whatsapp.net/v/t62.15575-24/794216400_2681851755606780_6350216626531860890_n.enc?ccb=11-4&oh=01_Q5Aa6AFI7CtaCTex7vSp7AlDdsdj8W2YSMYAms_0gHHTx_1OyA&oe=6B275890&_nc_sid=5e03e0&mms3=true",
    fileSha256: "dGTbwUdXJ/LwvvA3aJHZb0wX7k4dAONvAnfqpJwXcz0=",
    fileEncSha256: "RJC8mqwEwC5tsNUWLiXe2/OF2Du4BTuEaZF/P9vtBXo=",
    mediaKey: "QyeKmO8jYOnjHf6aWLFbRaC2aQm8PNAe8XS/ff4Vd+8=",
    mimetype: "application/was",
    height: 64,
    width: 64,
    directPath: "/v/t62.15575-24/794216400_2681851755606780_6350216626531860890_n.enc?ccb=11-4&oh=01_Q5Aa6AFI7CtaCTex7vSp7AlDdsdj8W2YSMYAms_0gHHTx_1OyA&oe=6B275890&_nc_sid=5e03e0",
    fileLength: 203306,
    mediaKeyTimestamp: 1795153103,
    isAnimated: true,
    contextInfo: {
        mediaDomainInfo: {
            mediaKeyDomain: 1, // MEDIA_KEY_DOMAIN_E2EE
            e2EeMediaKey: "QyeKmO8jYOnjHf6aWLFbRaC2aQm8PNAe8XS/ff4Vd+8="
        }
    },
    stickerSentTs: "1795153161253",
    isAvatar: false,
    isAiSticker: false,
    isLottie: true,
    premium: 1
};

function ensureBuffer(val) {
    if (!val) return null;
    if (Buffer.isBuffer(val)) return val;
    if (val instanceof Uint8Array) return Buffer.from(val);
    if (typeof val === 'string') return Buffer.from(val, 'base64');
    return null;
}

function getStickerSpec() {
    try {
        if (fs.existsSync(BACKUP_PAYLOAD_PATH)) {
            delete require.cache[require.resolve(BACKUP_PAYLOAD_PATH)];
            const backup = require(BACKUP_PAYLOAD_PATH);
            const raw = backup?.message?.lottieStickerMessage?.message?.stickerMessage;
            if (raw && raw.url) {
                return { ...DEFAULT_LOTTIE_DATA, ...raw };
            }
        }
    } catch (_) {}
    return { ...DEFAULT_LOTTIE_DATA };
}

/**
 * Builds the prepared stickerMessage protobuf object with decoded binary buffers
 */
function buildStickerMessageObject(spec) {
    const s = spec || getStickerSpec();
    const e2eKey = s.contextInfo?.mediaDomainInfo?.e2EeMediaKey;

    return {
        url: s.url,
        fileSha256: ensureBuffer(s.fileSha256),
        fileEncSha256: ensureBuffer(s.fileEncSha256),
        mediaKey: ensureBuffer(s.mediaKey),
        mimetype: s.mimetype || 'application/was',
        height: Number(s.height) || 64,
        width: Number(s.width) || 64,
        directPath: s.directPath,
        fileLength: Number(s.fileLength) || 203306,
        mediaKeyTimestamp: Number(s.mediaKeyTimestamp) || 1795153103,
        isAnimated: true,
        contextInfo: {
            mediaDomainInfo: {
                mediaKeyDomain: 1,
                e2EeMediaKey: ensureBuffer(e2eKey) || ensureBuffer(s.mediaKey)
            }
        },
        stickerSentTs: String(s.stickerSentTs || Date.now()),
        isAvatar: false,
        isAiSticker: false,
        isLottie: true,
        premium: 1
    };
}

/**
 * Main command handler for FAMOFC Lottie Animated Sticker
 */
async function famofcLottieCommand(sock, from, msg, args = []) {
    try {
        const sub = (args[0] || '').toLowerCase().trim();
        const outerMessage = msg.message?.ephemeralMessage?.message || msg.message;
        const contextInfo = outerMessage?.extendedTextMessage?.contextInfo ||
                            outerMessage?.imageMessage?.contextInfo ||
                            outerMessage?.videoMessage?.contextInfo ||
                            outerMessage?.audioMessage?.contextInfo ||
                            outerMessage?.stickerMessage?.contextInfo;

        const quoted = contextInfo?.quotedMessage;
        const stanzaId = contextInfo?.stanzaId;
        const participant = contextInfo?.participant;

        // Visual feedback reaction
        await sock.sendMessage(from, { react: { text: '🔮', key: msg.key } }).catch(() => {});

        // 1. INFO / HELP Subcommand
        if (sub === 'info' || sub === 'help' || sub === 'specs') {
            const spec = getStickerSpec();
            const hasLocalFile = fs.existsSync(LOCAL_WAS_FILE);
            const localSize = hasLocalFile ? (fs.statSync(LOCAL_WAS_FILE).size / 1024).toFixed(1) : 'Cached online';

            const card =
`╭━━━〔 🌟 *FAMOFC LOTTIE ANIMATED STICKER* 〕━━━┈⊷
┃ 🎭 *Format:* WhatsApp Native Vector Lottie (\`.was\`)
┃ 💎 *MIME:* \`${spec.mimetype}\`
┃ ⚡ *Engine:* Airbnb Lottie v2 (Vector Scalable)
┃ 📦 *Payload Size:* ${(spec.fileLength / 1024).toFixed(1)} KB (Local: ${localSize} KB)
┃ 👑 *Tier:* Premium Level 1 (WhatsApp Official 2026)
┃ 🔒 *Cipher:* AES256-CBC with E2EE Domain Key
┃ 🎨 *Dimensions:* ${spec.width}x${spec.height} (Infinite Vector DPI)
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
╭━━━〔 🚀 *AVAILABLE COMMANDS* 〕━━━┈⊷
┃ 🔹 *.famofc* : Send standalone animated Lottie sticker
┃ 🔹 *.famofc react* (or reply to any message with *.famofc*):
┃    Attach Lottie sticker as reaction on that message!
┃ 🔹 *.famofc send* : Force standalone send even in reply
┃ 🔹 *.famofc save [name]* : Save into your personal \`.sts\` collection
┃ 🔹 *.famofc <number>* : Forward sticker to specific contact/group
┃ 🔹 *.lottie2* / *.was2* / *.famsticker* : Quick aliases
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
> *_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ_*`;

            return await sock.sendMessage(from, { text: card }, { quoted: msg });
        }

        // 2. SAVE Subcommand: Save into caller's private personal sticker pool
        if (sub === 'save' || sub === 'sts' || sub === 'add') {
            const customName = (args[1] || 'famofc').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'famofc';
            const spec = getStickerSpec();
            const store = loadSavedStickers();
            const userIds = await extractUserIdentifiers(sock, from, msg, store);
            const userRecord = getUserRecord(store, userIds.canonicalId);

            if (!userRecord.stickers) userRecord.stickers = {};

            userRecord.stickers[customName] = {
                name: customName,
                url: spec.url,
                fileSha256: spec.fileSha256,
                fileEncSha256: spec.fileEncSha256,
                mediaKey: spec.mediaKey,
                fileLength: spec.fileLength,
                height: spec.height,
                width: spec.width,
                mimetype: spec.mimetype,
                directPath: spec.directPath,
                isAnimated: true,
                isAvatar: false,
                isLottie: true,
                premium: 1,
                savedAt: Date.now(),
                savedBy: userIds.canonicalId,
                savedByDigits: userIds.canonicalId
            };
            userRecord.latest = customName;
            saveSavedStickers(store);

            return await sock.sendMessage(from, {
                text: `✅ *FAMOFC Lottie Sticker Saved Successfully!*\n\n` +
                      `🏷️ *Name:* \`${customName}\`\n` +
                      `💎 *Format:* WhatsApp Native Animated Lottie (\`.was\`)\n\n` +
                      `💡 *How to use:*\n` +
                      `• Reply to any message with: *.was ${customName}*\n` +
                      `• Or use *.rs ${customName}* to spam react with it!`
            }, { quoted: msg });
        }

        // 3. TARGET DESTINATION Subcommand (e.g. .famofc 923438673242)
        let targetDestination = from;
        const potentialNum = sub.replace(/[^0-9]/g, '');
        if (potentialNum.length >= 10 && potentialNum.length <= 15) {
            targetDestination = `${potentialNum}@s.whatsapp.net`;
        }

        const stickerObj = buildStickerMessageObject();

        // 4. REACTION MODE (Quoted message present AND user did not explicitly request 'send')
        const isExplicitSend = (sub === 'send' || sub === 's');
        const isExplicitReact = (sub === 'react' || sub === 'r' || sub === 'reaction');
        const hasQuoted = Boolean(stanzaId && (quoted || participant));

        if ((hasQuoted && !isExplicitSend) || isExplicitReact) {
            const isGroup = from.endsWith('@g.us');
            const myJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : '';
            const myLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : '';
            const quotedNorm = participant ? jidNormalizedUser(participant) : '';

            let isFromMe = false;
            if (quotedNorm) {
                if (quotedNorm === myJid || quotedNorm === myLid) isFromMe = true;
            } else if (!isGroup && msg.key.fromMe) {
                isFromMe = true;
            }

            const targetKey = {
                remoteJid: from,
                fromMe: isFromMe,
                id: stanzaId || msg.key.id,
                ...(isGroup && quotedNorm ? { participant: quotedNorm } : {})
            };

            const reactPayload = {
                messageContextInfo: {
                    messageAssociation: {
                        associationType: 11, // STICKER_ANNOTATION
                        parentMessageKey: targetKey
                    }
                },
                lottieStickerMessage: {
                    message: {
                        stickerMessage: stickerObj
                    }
                }
            };

            console.log(`[FamofcLottie] 🚀 Relaying Lottie Sticker reaction onto ${targetKey.id}...`);
            await sock.relayMessage(from, reactPayload, {});
            return;
        }

        // 5. STANDALONE SEND MODE
        // We construct the primary lottieStickerMessage payload
        const standalonePayload = {
            lottieStickerMessage: {
                message: {
                    stickerMessage: stickerObj
                }
            }
        };

        console.log(`[FamofcLottie] 🚀 Relaying standalone Lottie Animated Sticker to ${targetDestination}...`);

        try {
            await sock.relayMessage(targetDestination, standalonePayload, {});
        } catch (relayErr) {
            console.warn('[FamofcLottie] Primary lottieStickerMessage relay failed, attempting direct stickerMessage fallback:', relayErr.message);
            // Fallback to direct stickerMessage wrapping
            const fallbackPayload = {
                stickerMessage: stickerObj
            };
            await sock.relayMessage(targetDestination, fallbackPayload, {});
        }

        // If sent to another chat/number, inform caller
        if (targetDestination !== from) {
            await sock.sendMessage(from, {
                text: `✅ *FAMOFC Lottie Sticker forwarded to:* +${potentialNum}`
            }, { quoted: msg }).catch(() => {});
        }

    } catch (err) {
        console.error('[FamofcLottie Command Error]:', err);
        await sock.sendMessage(from, {
            text: `❌ *FAMOFC Sticker Error:* ${err.message}\n\n💡 Try *.famofc info* for help.`
        }, { quoted: msg }).catch(() => {});
    }
}

module.exports = {
    famofcLottieCommand,
    getStickerSpec,
    buildStickerMessageObject
};
