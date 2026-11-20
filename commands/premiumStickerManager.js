'use strict';

/**
 * MR SAQIB MD :: PREMIUM STICKER VAULT & DYNAMIC REACTION ENGINE
 * ============================================================================
 * Allows users to save ANY Premium/Lottie/Animated Sticker into numbered slots
 * (Slot 1 to 10) and react onto replied messages or send them with instant
 * shortcut commands:
 *   - .saveprem [1-10] / .sprem [1-10] : Save replied sticker into slot
 *   - .prs1, .prs2, ... .prs10         : React or send sticker from slot
 *   - .prem1, .prem2, ... .prem10      : Alternate shortcut
 *   - .prs list                        : View all saved slots
 *   - .prs del [1-10]                  : Clear a slot
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const {
    downloadContentFromMessage,
    jidNormalizedUser,
    generateWAMessageFromContent,
    proto
} = require('@whiskeysockets/baileys');

const {
    loadSavedStickers,
    extractUserIdentifiers,
    getUserRecord
} = require('./stickerReact');

const { getStickerSpec, buildStickerMessageObject } = require('./saqibLottie');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STICKERS_DIR = path.join(DATA_DIR, 'stickers');
const PREM_FILE = path.join(DATA_DIR, 'saved_premium_stickers.json');
const PREM_BAK_FILE = path.join(DATA_DIR, 'saved_premium_stickers.bak.json');

if (!fs.existsSync(STICKERS_DIR)) {
    try { fs.mkdirSync(STICKERS_DIR, { recursive: true }); } catch (_) {}
}

function toBase64(val) {
    if (!val) return '';
    if (Buffer.isBuffer(val)) return val.toString('base64');
    if (val instanceof Uint8Array) return Buffer.from(val).toString('base64');
    if (typeof val === 'string') return val;
    return '';
}

function ensureBuffer(val) {
    if (!val) return null;
    if (Buffer.isBuffer(val)) return val;
    if (val instanceof Uint8Array) return Buffer.from(val);
    if (typeof val === 'string') return Buffer.from(val, 'base64');
    return null;
}

async function streamToBuffer(stream) {
    let buffer = Buffer.alloc(0);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

/**
 * Loads persistent premium stickers store with backup recovery
 */
function loadPremiumStore() {
    try {
        if (fs.existsSync(PREM_FILE)) {
            const data = JSON.parse(fs.readFileSync(PREM_FILE, 'utf8'));
            if (data && typeof data === 'object') return data;
        }
    } catch (e1) {
        console.warn('[PremiumStickers] Main file load failed, attempting backup:', e1.message);
        try {
            if (fs.existsSync(PREM_BAK_FILE)) {
                const bak = JSON.parse(fs.readFileSync(PREM_BAK_FILE, 'utf8'));
                if (bak && typeof bak === 'object') return bak;
            }
        } catch (_) {}
    }
    return { _version: 1, users: {} };
}

/**
 * Saves store atomically with rotating backup
 */
function savePremiumStore(store) {
    try {
        const json = JSON.stringify(store || { _version: 1, users: {} }, null, 2);
        if (fs.existsSync(PREM_FILE)) {
            try { fs.copyFileSync(PREM_FILE, PREM_BAK_FILE); } catch (_) {}
        }
        fs.writeFileSync(PREM_FILE, json, 'utf8');
        return true;
    } catch (err) {
        console.error('[PremiumStickers] Save error:', err.message);
        return false;
    }
}

/**
 * Retrieves a user's premium slots record
 */
function getUserSlots(store, canonicalId) {
    if (!store.users) store.users = {};
    if (!store.users[canonicalId]) {
        store.users[canonicalId] = {
            canonicalId,
            slots: {},
            updatedAt: Date.now()
        };
    }
    return store.users[canonicalId];
}

/**
 * Deep search to extract stickerMessage from any possible WhatsApp wrapper
 */
function extractStickerFromMsg(msg) {
    if (!msg) return null;

    let outer = msg.message?.ephemeralMessage?.message ||
                msg.message?.viewOnceMessage?.message ||
                msg.message?.viewOnceMessageV2?.message ||
                msg.message?.documentWithCaptionMessage?.message ||
                msg.message;

    // Check quoted message first (if replying)
    const contextInfo = outer?.extendedTextMessage?.contextInfo ||
                        outer?.stickerMessage?.contextInfo ||
                        outer?.imageMessage?.contextInfo ||
                        outer?.videoMessage?.contextInfo;

    const quoted = contextInfo?.quotedMessage?.ephemeralMessage?.message ||
                   contextInfo?.quotedMessage?.viewOnceMessage?.message ||
                   contextInfo?.quotedMessage?.viewOnceMessageV2?.message ||
                   contextInfo?.quotedMessage?.documentWithCaptionMessage?.message ||
                   contextInfo?.quotedMessage;

    if (quoted) {
        if (quoted.lottieStickerMessage?.message?.stickerMessage) {
            return {
                sticker: quoted.lottieStickerMessage.message.stickerMessage,
                isLottie: true,
                source: 'quoted_lottie'
            };
        }
        if (quoted.stickerMessage) {
            const sm = quoted.stickerMessage;
            const isLottie = Boolean(sm.isLottie || sm.mimetype === 'application/was');
            return {
                sticker: sm,
                isLottie,
                source: 'quoted_sticker'
            };
        }
    }

    // Direct message
    if (outer?.lottieStickerMessage?.message?.stickerMessage) {
        return {
            sticker: outer.lottieStickerMessage.message.stickerMessage,
            isLottie: true,
            source: 'direct_lottie'
        };
    }
    if (outer?.stickerMessage) {
        const sm = outer.stickerMessage;
        const isLottie = Boolean(sm.isLottie || sm.mimetype === 'application/was');
        return {
            sticker: sm,
            isLottie,
            source: 'direct_sticker'
        };
    }

    return null;
}

/**
 * SAVE PREMIUM STICKER COMMAND
 * Usage: .saveprem [1-10]  (Reply to any sticker)
 */
async function savePremiumCommand(sock, from, msg, args = []) {
    try {
        const store = loadPremiumStore();
        const userIds = await extractUserIdentifiers(sock, from, msg);
        const userRec = getUserSlots(store, userIds.canonicalId);

        const sub = (args[0] || '').toLowerCase().trim();

        // 1. LIST SLOTS
        if (sub === 'list' || sub === 'ls' || sub === 'all') {
            return await listPremiumSlots(sock, from, msg, userRec);
        }

        // 2. DELETE SLOT
        if (sub === 'del' || sub === 'delete' || sub === 'rm') {
            const slotToDel = parseInt(args[1] || '', 10);
            if (!slotToDel || slotToDel < 1 || slotToDel > 10) {
                return await sock.sendMessage(from, {
                    text: "❌ *Slot number batayein delete karne ke liye! (1-10)*\n\nExample: `.saveprem del 2` ya `.prs del 2`"
                }, { quoted: msg });
            }

            if (userRec.slots[slotToDel]) {
                const s = userRec.slots[slotToDel];
                if (s.localFile) {
                    try { fs.unlinkSync(path.join(STICKERS_DIR, s.localFile)); } catch (_) {}
                }
                delete userRec.slots[slotToDel];
                savePremiumStore(store);
                await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});
                return await sock.sendMessage(from, {
                    text: `✅ *Slot ${slotToDel} se sticker delete kar diya gaya!*`
                }, { quoted: msg });
            } else {
                return await sock.sendMessage(from, {
                    text: `⚠️ *Slot ${slotToDel} pehle se khali hai!*`
                }, { quoted: msg });
            }
        }

        // 3. EXTRACT STICKER FROM QUOTED / DIRECT
        const extracted = extractStickerFromMsg(msg);
        if (!extracted || !extracted.sticker) {
            return await sock.sendMessage(from, {
                text:
`╭━━━〔 💎 *SAVE PREMIUM STICKER* 〕━━━┈⊷
┃ 📌 *Sticker Save Karne Ka Tarika:*
┃ 1️⃣ Kisi bhi Animated / Premium / Lottie sticker ko *Reply* karein.
┃ 2️⃣ Type karein: *.saveprem [1-10]*
┃    Examples:
┃    • *.saveprem 1*  ➜ Slot 1 mein save karega
┃    • *.saveprem 2*  ➜ Slot 2 mein save karega
┃    • *.saveprem*    ➜ Agli khali slot mein save karega
┃
┃ ⚡ *React Karne Ka Tarika:*
┃    Kisi bhi message ko reply karke likhein:
┃    👉 *.prs1*  ya  *.prem1*  ➜ Slot 1 react hoga!
┃    👉 *.prs2*  ya  *.prem2*  ➜ Slot 2 react hoga!
┃    👉 *.prs3*  ya  *.prem3*  ➜ Slot 3 react hoga!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
> *_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ_*`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        const st = extracted.sticker;
        const isLottie = Boolean(extracted.isLottie || st.isLottie || st.mimetype === 'application/was');

        // Determine target slot (1 to 10)
        let targetSlot = parseInt(args[0] || '', 10);
        if (!targetSlot || isNaN(targetSlot) || targetSlot < 1 || targetSlot > 10) {
            // Auto pick next available slot or default to 1
            for (let i = 1; i <= 10; i++) {
                if (!userRec.slots[i]) {
                    targetSlot = i;
                    break;
                }
            }
            if (!targetSlot) targetSlot = 1; // overwrite slot 1 if all full
        }

        // Download local copy for offline durability
        let stickerBuffer = null;
        try {
            const stream = await downloadContentFromMessage(st, 'sticker');
            stickerBuffer = await streamToBuffer(stream);
        } catch (dlErr) {
            console.warn('[PremiumStickers] Download warning:', dlErr.message);
        }

        const ext = isLottie ? 'was' : 'webp';
        const localFileName = `prem_${userIds.canonicalId}_slot${targetSlot}.${ext}`;
        const localFilePath = path.join(STICKERS_DIR, localFileName);

        if (stickerBuffer && stickerBuffer.length > 0) {
            try { await fs.promises.writeFile(localFilePath, stickerBuffer); } catch (_) {}
        }

        const finalFileLength = st.fileLength ? Number(st.fileLength) : (stickerBuffer?.length || 203306);
        const e2eKey = st.contextInfo?.mediaDomainInfo?.e2EeMediaKey || st.mediaKey;

        // Store slot metadata
        userRec.slots[targetSlot] = {
            slot: targetSlot,
            url: st.url || '',
            fileSha256: toBase64(st.fileSha256),
            fileEncSha256: toBase64(st.fileEncSha256),
            mediaKey: toBase64(st.mediaKey),
            fileLength: finalFileLength,
            height: Number(st.height) || (isLottie ? 64 : 512),
            width: Number(st.width) || (isLottie ? 64 : 512),
            mimetype: st.mimetype || (isLottie ? 'application/was' : 'image/webp'),
            directPath: st.directPath || '',
            isAnimated: Boolean(st.isAnimated),
            isLottie: Boolean(isLottie),
            isAvatar: Boolean(st.isAvatar),
            premium: Number(st.premium || 1),
            mediaKeyTimestamp: Number(st.mediaKeyTimestamp) || Math.floor(Date.now() / 1000),
            contextInfo: {
                mediaDomainInfo: {
                    mediaKeyDomain: 1,
                    e2EeMediaKey: toBase64(e2eKey)
                }
            },
            stickerSentTs: String(st.stickerSentTs || Date.now()),
            localFile: localFileName,
            savedAt: Date.now()
        };

        userRec.updatedAt = Date.now();
        savePremiumStore(store);

        await sock.sendMessage(from, { react: { text: '💎', key: msg.key } }).catch(() => {});

        const typeBadge = isLottie ? '🔮 Lottie Vector (.was)' : st.isAnimated ? '✨ Animated Sticker' : '🖼️ Static Sticker';

        return await sock.sendMessage(from, {
            text:
`╭━━━〔 💎 *PREMIUM STICKER SAVED TO SLOT ${targetSlot}!* 〕━━━┈⊷
┃ 🔢 *Slot Number:* [ *Slot ${targetSlot}* ]
┃ 🎭 *Sticker Type:* ${typeBadge}
┃ 📦 *Size:* ${(finalFileLength / 1024).toFixed(1)} KB
┃ 👤 *Saved For:* You (100% Private to your account)
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

💡 *Ab kaise react karein?*
👉 Kisi bhi message ko reply karke likhein:
   *• .prs${targetSlot}*  ya  *• .prem${targetSlot}*
   ➜ *Ye sticker foran us message par react ho jayega!*

👉 Standalone bhejney ke liye:
   *• .prs${targetSlot} send*`
        }, { quoted: msg });

    } catch (err) {
        console.error('[savePremiumCommand Error]:', err);
        await sock.sendMessage(from, {
            text: `❌ *Error saving premium sticker:* ${err.message}`
        }, { quoted: msg }).catch(() => {});
    }
}

/**
 * LIST SAVED SLOTS FOR CALLER
 */
async function listPremiumSlots(sock, from, msg, userRec) {
    const slots = userRec?.slots || {};
    let text = `╭━━━〔 💎 *AAPKE SAVED PREMIUM STICKERS* 〕━━━┈⊷\n`;

    let totalSaved = 0;
    for (let i = 1; i <= 10; i++) {
        const item = slots[i];
        if (item) {
            totalSaved++;
            const t = item.isLottie ? '🔮 Lottie (.was)' : item.isAnimated ? '✨ Animated' : '🖼️ Static';
            text += `┃ 🔹 *Slot ${i}:* [ ${t} ] ➜ \`.prs${i}\`\n`;
        } else if (i === 1) {
            // Slot 1 defaults to Mr Saqib Official Lottie if not saved yet
            text += `┃ 🔹 *Slot 1:* [ 👑 Default Saqib Lottie ] ➜ \`.prs1\`\n`;
            totalSaved++;
        } else {
            text += `┃ ▫️ *Slot ${i}:* _Khali (Use .saveprem ${i})_\n`;
        }
    }

    text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n`;
    text += `💡 *Commands Guide:*\n`;
    text += `👉 *.prs1* tak *.prs10* ➜ Message par sticker react karein\n`;
    text += `👉 *.prem1* tak *.prem10* ➜ Shortcut alias\n`;
    text += `👉 *.saveprem <1-10>* ➜ Reply karke new sticker save karein\n`;
    text += `👉 *.prs del <1-10>* ➜ Slot clear karein`;

    return await sock.sendMessage(from, { text }, { quoted: msg });
}

/**
 * REACT OR SEND STICKER FROM SLOT (1 to 10)
 * Triggered by: .prs1, .prs2, ... .prs10, .prem1, ... .prem10
 * Or .prs <slot>, .prem <slot>
 */
async function reactPremiumCommand(sock, from, msg, args = [], commandName = 'prs1') {
    try {
        const cmd = (commandName || 'prs1').toLowerCase();
        const store = loadPremiumStore();
        const userIds = await extractUserIdentifiers(sock, from, msg);
        const userRec = getUserSlots(store, userIds.canonicalId);

        // 1. Check for list or delete subcommands (e.g. .prs list, .prs del 2)
        const sub = (args[0] || '').toLowerCase().trim();
        if (sub === 'list' || sub === 'ls' || sub === 'all') {
            return await listPremiumSlots(sock, from, msg, userRec);
        }
        if (sub === 'del' || sub === 'delete' || sub === 'rm') {
            const slotToDel = parseInt(args[1] || '', 10);
            if (slotToDel && userRec.slots[slotToDel]) {
                delete userRec.slots[slotToDel];
                savePremiumStore(store);
                await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});
                return await sock.sendMessage(from, {
                    text: `✅ *Slot ${slotToDel} se sticker delete kar diya gaya!*`
                }, { quoted: msg });
            }
        }

        // 2. Determine slot number
        let slot = null;
        const match = cmd.match(/^(?:prs|prem)(\d+)$/);
        if (match) {
            slot = parseInt(match[1], 10);
        } else {
            const numArg = parseInt(args[0] || '', 10);
            if (numArg && numArg >= 1 && numArg <= 10) {
                slot = numArg;
            }
        }

        if (!slot) slot = 1; // Default to slot 1

        let item = userRec.slots[slot];

        // Slot 1 Default Fallback: If caller has not saved slot 1 yet, provide the built-in Saqib Lottie sticker!
        if (!item && slot === 1) {
            const spec = getStickerSpec();
            item = {
                slot: 1,
                url: spec.url,
                fileSha256: spec.fileSha256,
                fileEncSha256: spec.fileEncSha256,
                mediaKey: spec.mediaKey,
                fileLength: spec.fileLength,
                height: spec.height,
                width: spec.width,
                mimetype: spec.mimetype || 'application/was',
                directPath: spec.directPath,
                isAnimated: true,
                isLottie: true,
                premium: 1,
                contextInfo: {
                    mediaDomainInfo: {
                        mediaKeyDomain: 1,
                        e2EeMediaKey: spec.mediaKey
                    }
                },
                stickerSentTs: String(spec.stickerSentTs || Date.now())
            };
        }

        if (!item) {
            return await sock.sendMessage(from, {
                text: `❌ *Slot ${slot} mein koi sticker save nahi hai!*\n\n` +
                      `💡 *Save karne ke liye:*\n` +
                      `Kisi bhi sticker ko *Reply* karein aur likhein:\n` +
                      `👉 *.saveprem ${slot}*`
            }, { quoted: msg });
        }

        // Context check: Quoted message vs Standalone
        const outerMessage = msg.message?.ephemeralMessage?.message || msg.message;
        const contextInfo = outerMessage?.extendedTextMessage?.contextInfo ||
                            outerMessage?.imageMessage?.contextInfo ||
                            outerMessage?.videoMessage?.contextInfo ||
                            outerMessage?.audioMessage?.contextInfo ||
                            outerMessage?.stickerMessage?.contextInfo;

        const quoted = contextInfo?.quotedMessage;
        const stanzaId = contextInfo?.stanzaId;
        const participant = contextInfo?.participant;

        const isExplicitSend = args.some(a => String(a).toLowerCase() === 'send' || String(a).toLowerCase() === 's');
        const hasQuoted = Boolean(stanzaId && (quoted || participant));

        // Reaction reaction emoji feedback
        await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

        const isLottie = Boolean(item.isLottie || item.mimetype === 'application/was');
        const e2eKey = item.contextInfo?.mediaDomainInfo?.e2EeMediaKey || item.mediaKey;

        const stickerObj = {
            url: item.url,
            fileSha256: ensureBuffer(item.fileSha256),
            fileEncSha256: ensureBuffer(item.fileEncSha256),
            mediaKey: ensureBuffer(item.mediaKey),
            mimetype: item.mimetype || (isLottie ? 'application/was' : 'image/webp'),
            height: Number(item.height) || (isLottie ? 64 : 512),
            width: Number(item.width) || (isLottie ? 64 : 512),
            directPath: item.directPath,
            fileLength: Number(item.fileLength) || 203306,
            mediaKeyTimestamp: Number(item.mediaKeyTimestamp) || 1795153103,
            isAnimated: Boolean(item.isAnimated),
            isLottie: Boolean(isLottie),
            isAvatar: Boolean(item.isAvatar),
            premium: Number(item.premium || 1),
            contextInfo: {
                mediaDomainInfo: {
                    mediaKeyDomain: 1,
                    e2EeMediaKey: ensureBuffer(e2eKey) || ensureBuffer(item.mediaKey)
                }
            },
            stickerSentTs: String(item.stickerSentTs || Date.now())
        };

        // ===== 1. REACTION MODE (Quoted message present & not explicit send) =====
        if (hasQuoted && !isExplicitSend) {
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

            const reactPayload = isLottie ? {
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
            } : {
                messageContextInfo: {
                    messageAssociation: {
                        associationType: 11, // STICKER_ANNOTATION
                        parentMessageKey: targetKey
                    }
                },
                stickerMessage: stickerObj
            };

            console.log(`[PremiumStickers] 🚀 Relaying Slot ${slot} sticker reaction onto ${targetKey.id}...`);

            try {
                await sock.relayMessage(from, reactPayload, {});
            } catch (err1) {
                console.warn(`[PremiumStickers] Primary reaction relay failed, trying fallback:`, err1.message);
                const fallbackReact = {
                    messageContextInfo: {
                        messageAssociation: {
                            associationType: 11,
                            parentMessageKey: targetKey
                        }
                    },
                    stickerMessage: stickerObj
                };
                await sock.relayMessage(from, fallbackReact, {});
            }
            return;
        }

        // ===== 2. STANDALONE SEND MODE =====
        const standalonePayload = isLottie ? {
            lottieStickerMessage: {
                message: {
                    stickerMessage: stickerObj
                }
            }
        } : {
            stickerMessage: stickerObj
        };

        console.log(`[PremiumStickers] 🚀 Relaying Slot ${slot} standalone sticker to ${from}...`);

        try {
            await sock.relayMessage(from, standalonePayload, {});
        } catch (relayErr) {
            console.warn('[PremiumStickers] Standalone relay failed, trying direct stickerMessage:', relayErr.message);
            await sock.relayMessage(from, { stickerMessage: stickerObj }, {});
        }

    } catch (err) {
        console.error('[reactPremiumCommand Error]:', err);
        await sock.sendMessage(from, {
            text: `❌ *Sticker Error:* ${err.message}`
        }, { quoted: msg }).catch(() => {});
    }
}

module.exports = {
    savePremiumCommand,
    reactPremiumCommand,
    loadPremiumStore,
    savePremiumStore,
    getUserSlots,
    extractStickerFromMsg
};
