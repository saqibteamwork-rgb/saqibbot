'use strict';

/**
 * MR SAQIB MD :: WhatsApp Animated Lottie / Avatar / Custom Sticker Reaction Module
 * ============================================================================
 * Features:
 * - .was / .lottie / .asticker / .avatar :
 *   Reacts onto the replied message using WhatsApp native Sticker Annotation (associationType 11).
 *   Strictly uses the calling user's personal saved sticker or quoted sticker!
 *   Never leaks other users' stickers.
 * ============================================================================
 */

const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { loadSavedStickers, extractUserIdentifiers, getUserRecord } = require('./stickerReact');

function ensureBuffer(val) {
    if (!val) return null;
    if (Buffer.isBuffer(val)) return val;
    if (val instanceof Uint8Array) return Buffer.from(val);
    if (typeof val === 'string') return Buffer.from(val, 'base64');
    return null;
}

async function lottieCommand(sock, from, msg, args = []) {
    try {
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quoted = contextInfo?.quotedMessage;
        const stanzaId = contextInfo?.stanzaId;
        const participant = contextInfo?.participant;

        const isGroup = from.endsWith('@g.us');
        const myJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : '';
        const myLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : '';
        const quotedNorm = participant ? jidNormalizedUser(participant) : '';

        let isFromMe = false;
        if (quotedNorm) {
            if (quotedNorm === myJid || quotedNorm === myLid) {
                isFromMe = true;
            }
        } else if (!isGroup && msg.key.fromMe) {
            isFromMe = true;
        }

        let targetKey = null;
        if (stanzaId) {
            targetKey = {
                remoteJid: from,
                fromMe: isFromMe,
                id: stanzaId,
                ...(isGroup && quotedNorm ? { participant: quotedNorm } : {})
            };
        } else {
            targetKey = msg.key;
        }

        await sock.sendMessage(from, { react: { text: '✨', key: msg.key } }).catch(() => {});

        let stickerPayload = null;

        // 1. Quoted message is a sticker
        if (quoted?.stickerMessage) {
            const sm = quoted.stickerMessage;
            stickerPayload = {
                url: sm.url,
                fileSha256: ensureBuffer(sm.fileSha256),
                fileEncSha256: ensureBuffer(sm.fileEncSha256),
                mediaKey: ensureBuffer(sm.mediaKey),
                fileLength: sm.fileLength ? Number(sm.fileLength) : 134248,
                height: 512,
                width: 512,
                mimetype: sm.mimetype || 'image/webp',
                directPath: sm.directPath,
                isAnimated: !!sm.isAnimated,
                isAvatar: false,
                isLottie: false
            };
        } else {
            // 2. Load saved sticker strictly from caller's private personal pool
            const store = loadSavedStickers();
            const userIds = await extractUserIdentifiers(sock, from, msg, store);
            const userRecord = getUserRecord(store, userIds.canonicalId);
            const userStickers = userRecord.stickers || {};
            const myKeys = Object.keys(userStickers);

            const requestedKey = (args[0] || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
            let chosenKey = null;

            if (requestedKey) {
                chosenKey = myKeys.find(k => k.toLowerCase() === requestedKey);
                if (!chosenKey) {
                    return await sock.sendMessage(from, {
                        text: `❌ Sticker *"${requestedKey}"* aapke personal collection mein nahi mila!\n\n💡 Apne saved stickers dekhne ke liye likhein: *.sts list*`
                    }, { quoted: msg });
                }
            } else {
                if (myKeys.length > 0) {
                    chosenKey = userRecord.latest || myKeys[myKeys.length - 1];
                } else {
                    return await sock.sendMessage(from, {
                        text: `⚠️ *Aapke paas koi saved sticker nahi mila!*\n\n💡 Kisi bhi sticker ko reply karke likhein: *.sts*\nPhir *.was* karein!`
                    }, { quoted: msg });
                }
            }

            const s = chosenKey ? userStickers[chosenKey] : null;

            if (s && s.url) {
                stickerPayload = {
                    url: s.url,
                    fileSha256: ensureBuffer(s.fileSha256),
                    fileEncSha256: ensureBuffer(s.fileEncSha256),
                    mediaKey: ensureBuffer(s.mediaKey),
                    fileLength: s.fileLength || 134248,
                    height: 512,
                    width: 512,
                    mimetype: s.mimetype || 'image/webp',
                    directPath: s.directPath,
                    isAnimated: !!s.isAnimated,
                    isAvatar: false,
                    isLottie: false
                };
            }
        }

        if (!stickerPayload || !stickerPayload.url) {
            return await sock.sendMessage(from, {
                text: "⚠️ *Sticker load nahi ho saka!* Pehle kisi sticker ko reply karke `.sts` likhein."
            }, { quoted: msg });
        }

        const relayPayload = {
            messageContextInfo: {
                messageAssociation: {
                    associationType: 11, // STICKER_ANNOTATION
                    parentMessageKey: targetKey
                }
            },
            stickerMessage: stickerPayload
        };

        console.log(`[Lottie/WAS] Relaying personal sticker reaction onto message ${targetKey.id}...`);
        await sock.relayMessage(from, relayPayload, {});

    } catch (err) {
        console.error('[Sticker React Error]:', err);
        await sock.sendMessage(from, { 
            text: `❌ *Sticker React Error:* ${err.message}` 
        }, { quoted: msg }).catch(() => {});
    }
}

module.exports = {
    lottieCommand
};
