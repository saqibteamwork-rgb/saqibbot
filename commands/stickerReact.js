// commands/stickerReact.js
'use strict';

/**
 * MR SAQIB MD :: Sticker Saver & Multi-Sticker Reaction Engine (V2 User Isolated)
 * ============================================================================
 * Features:
 * - 100% User Personal Isolation:
 *   User A's saved stickers belong ONLY to User A.
 *   User B can NEVER access, react with, view, or delete User A's stickers!
 * - Zero Memory Loss:
 *   - Auto-resolves and links WhatsApp LID <-> Phone JID permanently.
 *   - Auto-merges stickers if user saved via LID and later messages via Phone.
 *   - Atomic disk writes with rolling backup recovery (.bak) prevents data wipe.
 *   - Per-user sticker naming (User A's .sts dog & User B's .sts dog never collide).
 * - Commands:
 *   - .sts <name>        : Save replied sticker to your personal collection
 *   - .sts list          : View your personal saved stickers
 *   - .sts del <name>    : Delete a sticker from your personal collection
 *   - .rs [count]        : React with your personal saved stickers (Auto Mixup/Combo!)
 *   - .rs <name> [count] : React with your specific saved sticker (e.g. .rs dog 5)
 *   - .rs10              : Quick 10x reaction using your personal saved stickers
 *   - .was [name]        : Single sticker reaction using your saved sticker
 * ============================================================================
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STICKERS_DIR = path.join(DATA_DIR, 'stickers');
const STICKERS_FILE = path.join(DATA_DIR, 'saved_stickers.json');
const STICKERS_BAK_FILE = path.join(DATA_DIR, 'saved_stickers.bak.json');

fs.ensureDirSync(STICKERS_DIR);

// In-memory group metadata cache (TTL: 5 minutes) to avoid socket flood
const groupMetaCache = new Map();
const GROUP_META_TTL_MS = 5 * 60 * 1000;

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
 * Migrates old flat schema to V2 User-Isolated schema without losing any existing stickers
 */
function migrateToV2(raw) {
    if (raw && raw._version === 2 && raw.users && typeof raw.users === 'object') {
        raw.identityMap = raw.identityMap || {};
        return raw;
    }

    console.log('[StickerStore] Migrating legacy sticker database to V2 User-Isolated format...');

    const store = {
        _version: 2,
        users: {},
        identityMap: {
            '251655740244113': '923468616487',
            '139028410163392': '923478936242'
        }
    };

    if (raw && typeof raw === 'object') {
        // Collect identity mappings from raw if any
        if (raw._userLatest && typeof raw._userLatest === 'object') {
            for (const [k, v] of Object.entries(raw._userLatest)) {
                if (/^\d+$/.test(k)) {
                    // valid user digit key
                }
            }
        }

        // Migrate each sticker into its owner's personal collection
        for (const [key, item] of Object.entries(raw)) {
            if (key.startsWith('_') || !item || typeof item !== 'object') continue;

            const digitsCandidate = (
                item.savedByDigits ||
                item.savedByPhone ||
                item.savedByLid ||
                item.savedBy ||
                ''
            ).replace(/[^0-9]/g, '');

            let ownerDigits = store.identityMap[digitsCandidate] || digitsCandidate || 'default';

            if (!store.users[ownerDigits]) {
                store.users[ownerDigits] = {
                    canonicalId: ownerDigits,
                    phone: item.savedByPhone || '',
                    lid: item.savedByLid || '',
                    latest: key,
                    stickers: {}
                };
            }

            store.users[ownerDigits].stickers[key] = {
                ...item,
                name: key,
                savedByDigits: ownerDigits
            };
            store.users[ownerDigits].latest = key;
        }
    }

    // Immediately persist migrated store
    persistStickers(store);
    console.log(`[StickerStore] Migration completed successfully. Loaded ${Object.keys(store.users).length} isolated user pools.`);
    return store;
}

/**
 * Loads sticker store with automatic corruption recovery from rolling backup
 */
function loadSavedStickers() {
    try {
        if (fs.existsSync(STICKERS_FILE)) {
            const data = fs.readJsonSync(STICKERS_FILE);
            if (data && typeof data === 'object') {
                return migrateToV2(data);
            }
        }
    } catch (e) {
        console.error('[StickerStore Load Error - Attempting recovery from backup]:', e.message);
        try {
            if (fs.existsSync(STICKERS_BAK_FILE)) {
                const bakData = fs.readJsonSync(STICKERS_BAK_FILE);
                if (bakData && typeof bakData === 'object') {
                    console.log('[StickerStore] Successfully recovered from backup file!');
                    return migrateToV2(bakData);
                }
            }
        } catch (bakErr) {
            console.error('[StickerStore Backup Recovery Failed]:', bakErr.message);
        }
    }

    return {
        _version: 2,
        users: {},
        identityMap: {
            '251655740244113': '923468616487',
            '139028410163392': '923478936242'
        }
    };
}

/**
 * Atomic persistent disk write:
 * 1. Creates backup of current good file
 * 2. Writes to temporary file
 * 3. Atomically moves temporary file to destination
 */
function persistStickers(store) {
    try {
        fs.ensureDirSync(DATA_DIR);

        // 1. Maintain rolling backup
        if (fs.existsSync(STICKERS_FILE)) {
            try {
                fs.copyFileSync(STICKERS_FILE, STICKERS_BAK_FILE);
            } catch (_) {}
        }

        // 2. Atomic write
        const tmpFile = path.join(DATA_DIR, `saved_stickers_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.tmp`);
        fs.writeJsonSync(tmpFile, store, { spaces: 2 });
        fs.moveSync(tmpFile, STICKERS_FILE, { overwrite: true });
    } catch (e) {
        console.error('[StickerStore Persist Error]:', e.message);
    }
}

/**
 * Extracts normalized user identity markers and resolves canonical user ID.
 * Links WhatsApp LID <-> Phone Number so stickers saved under LID are never lost.
 */
async function extractUserIdentifiers(sock, from, msg, store = null) {
    const rawSender = msg?.key?.participant || msg?.participant || (msg?.key?.fromMe ? sock?.user?.id : from) || '';
    let cleanRaw = String(rawSender).split(':')[0];
    let phoneJid = '';
    let lidJid = '';

    if (cleanRaw.endsWith('@lid')) {
        lidJid = cleanRaw;
    } else if (cleanRaw.endsWith('@s.whatsapp.net')) {
        phoneJid = cleanRaw;
    }

    if (msg?.key?.fromMe && sock?.user) {
        if (sock.user.id) phoneJid = jidNormalizedUser(sock.user.id);
        if (sock.user.lid) lidJid = jidNormalizedUser(sock.user.lid);
    }

    let phoneDigits = phoneJid ? phoneJid.split('@')[0].replace(/[^0-9]/g, '') : '';
    let lidDigits = lidJid ? lidJid.split('@')[0].replace(/[^0-9]/g, '') : '';
    let rawDigits = cleanRaw.split('@')[0].replace(/[^0-9]/g, '');

    // In group chats, inspect group metadata to link Phone JID <-> LID
    if (from && from.endsWith('@g.us') && sock?.groupMetadata) {
        try {
            const now = Date.now();
            let meta = groupMetaCache.get(from);
            if (!meta || (now - meta.cachedAt) > GROUP_META_TTL_MS) {
                const fresh = await sock.groupMetadata(from).catch(() => null);
                if (fresh) {
                    meta = { data: fresh, cachedAt: now };
                    groupMetaCache.set(from, meta);
                }
            }

            if (meta?.data?.participants) {
                for (const part of meta.data.participants) {
                    const pPhone = (part.id || '').split(':')[0].replace(/[^0-9]/g, '');
                    const pLid = (part.lid || '').split(':')[0].replace(/[^0-9]/g, '');

                    // Auto-record Phone <-> LID mapping into identity map
                    if (store && pPhone && pLid && pPhone !== pLid) {
                        store.identityMap[pLid] = pPhone;
                    }

                    // Check if this participant is the sender
                    const pRawId = (part.id || '').split(':')[0];
                    const pRawLid = (part.lid || '').split(':')[0];
                    if (
                        (pRawId && (pRawId === cleanRaw || pPhone === phoneDigits || pPhone === rawDigits)) ||
                        (pRawLid && (pRawLid === cleanRaw || pLid === lidDigits || pLid === rawDigits))
                    ) {
                        if (part.id) {
                            phoneJid = jidNormalizedUser(part.id);
                            phoneDigits = phoneJid.split('@')[0].replace(/[^0-9]/g, '');
                        }
                        if (part.lid) {
                            lidJid = jidNormalizedUser(part.lid);
                            lidDigits = lidJid.split('@')[0].replace(/[^0-9]/g, '');
                        }
                    }
                }
            }
        } catch (_) {}
    }

    // Resolve canonical user ID using persistent identity map
    const activeStore = store || loadSavedStickers();
    if (lidDigits && activeStore.identityMap?.[lidDigits]) {
        phoneDigits = phoneDigits || activeStore.identityMap[lidDigits];
    }
    if (phoneDigits && lidDigits && phoneDigits !== lidDigits && activeStore.identityMap) {
        activeStore.identityMap[lidDigits] = phoneDigits;
    }

    // Canonical ID is phone digits if known, otherwise LID digits or raw digits
    const canonicalId = phoneDigits || (lidDigits ? (activeStore.identityMap?.[lidDigits] || lidDigits) : rawDigits) || 'unknown';

    // Auto-merge: if user previously saved stickers under LID, merge into Phone ID account
    if (phoneDigits && lidDigits && phoneDigits !== lidDigits && activeStore.users) {
        if (activeStore.users[lidDigits] && !activeStore.users[phoneDigits]) {
            activeStore.users[phoneDigits] = {
                ...activeStore.users[lidDigits],
                canonicalId: phoneDigits,
                phone: phoneJid || `${phoneDigits}@s.whatsapp.net`
            };
            delete activeStore.users[lidDigits];
            persistStickers(activeStore);
        } else if (activeStore.users[lidDigits] && activeStore.users[phoneDigits]) {
            Object.assign(activeStore.users[phoneDigits].stickers, activeStore.users[lidDigits].stickers);
            delete activeStore.users[lidDigits];
            persistStickers(activeStore);
        }
    }

    const allIds = new Set(
        [cleanRaw, phoneJid, lidJid, phoneDigits, lidDigits, rawDigits, canonicalId]
            .filter(Boolean)
            .map(s => String(s).toLowerCase())
    );

    return {
        canonicalId,
        rawSender: cleanRaw,
        phoneJid,
        lidJid,
        phoneDigits,
        lidDigits,
        rawDigits,
        allIds
    };
}

/**
 * Retrieves the isolated user record from the store
 */
function getUserRecord(store, canonicalId) {
    if (!store.users) store.users = {};
    if (!store.users[canonicalId]) {
        store.users[canonicalId] = {
            canonicalId,
            stickers: {},
            latest: null
        };
    }
    return store.users[canonicalId];
}

/**
 * Returns sticker keys belonging strictly to the specified user
 */
function getUserStickers(storeOrStickers, userIdsOrCanonicalId) {
    let canonicalId = null;
    if (typeof userIdsOrCanonicalId === 'string') {
        canonicalId = userIdsOrCanonicalId;
    } else if (userIdsOrCanonicalId?.canonicalId) {
        canonicalId = userIdsOrCanonicalId.canonicalId;
    }

    // If passed a V2 store object
    if (storeOrStickers?.users) {
        if (canonicalId && storeOrStickers.users[canonicalId]?.stickers) {
            return Object.keys(storeOrStickers.users[canonicalId].stickers);
        }
        // If userIds has allIds set, try matching
        if (userIdsOrCanonicalId?.allIds) {
            for (const id of userIdsOrCanonicalId.allIds) {
                if (storeOrStickers.users[id]?.stickers) {
                    return Object.keys(storeOrStickers.users[id].stickers);
                }
            }
        }
        return [];
    }

    // Fallback if raw stickers object was passed
    if (storeOrStickers && typeof storeOrStickers === 'object') {
        const keys = Object.keys(storeOrStickers).filter(k => !k.startsWith('_'));
        if (!userIdsOrCanonicalId) return keys;
        return keys.filter(k => isStickerOwnedByUser(storeOrStickers[k], userIdsOrCanonicalId));
    }

    return [];
}

/**
 * Checks if a specific sticker item belongs to a user
 */
function isStickerOwnedByUser(s, userIds) {
    if (!s) return false;
    const sDigits = (s.savedByDigits || s.savedByPhone || s.savedByLid || s.savedBy || '').replace(/[^0-9]/g, '');
    if (!sDigits) return false;

    if (typeof userIds === 'string') {
        return sDigits === userIds.replace(/[^0-9]/g, '');
    }

    if (userIds?.canonicalId && sDigits === userIds.canonicalId) {
        return true;
    }

    if (userIds?.allIds && userIds.allIds.has(sDigits)) {
        return true;
    }

    return false;
}

/**
 * .sts / .savesticker / .ss
 * Saves replied sticker into caller's private personal sticker pool
 */
async function saveStickerCommand(sock, from, msg, args = []) {
    try {
        const rawArgs = (args || []).map(a => String(a).trim()).filter(Boolean);
        const firstArg = (rawArgs[0] || '').toLowerCase();

        const store = loadSavedStickers();
        const userIds = await extractUserIdentifiers(sock, from, msg, store);
        const userRecord = getUserRecord(store, userIds.canonicalId);
        userRecord.phone = userIds.phoneJid || userRecord.phone || '';
        userRecord.lid = userIds.lidJid || userRecord.lid || '';

        // 1. LIST MY STICKERS (.sts list)
        if (['list', 'all', 'ls', 'my'].includes(firstArg)) {
            const myStickerKeys = Object.keys(userRecord.stickers || {});

            if (myStickerKeys.length === 0) {
                return await sock.sendMessage(from, {
                    text:
`╭━━━〔 💾 *SAVED STICKERS MANAGER* 〕━━━┈⊷
┃ 📭 *Aapke personal collection mein abhi koi sticker nahi hai.*
┃
┃ 💡 *Sticker Save Karne Ka Tarika:*
┃ 1️⃣ Kisi bhi sticker ko *Reply* karein.
┃ 2️⃣ Type karein: *.sts <name>*  (e.g. *.sts dog* ya sirf *.sts*)
┃ 3️⃣ Phir message ko reply karke likhein: *.rs 5*
┃    ➜ *Aapke apne stickers react honge!*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
                }, { quoted: msg });
            }

            let listText = `╭━━━〔 💾 *AAPKE PERSONAL STICKERS* 〕━━━┈⊷\n`;
            listText += `┃ 👤 *Total Stickers:* ${myStickerKeys.length}\n`;
            listText += `┃\n`;
            myStickerKeys.forEach((k, idx) => {
                const s = userRecord.stickers[k];
                const typeLabel = s.isAnimated ? 'Animated' : 'Static';
                listText += `┃  ${idx + 1}. *${k}* ➜ _${typeLabel}_\n`;
            });
            listText += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n`;
            listText += `💡 *React Karne Ke Tareeqay:*\n`;
            listText += `👉 *.rs 5*  _(Aapke apne ${myStickerKeys.length} stickers ka Mixup combo!)_\n`;
            listText += `👉 *.rs 10*  _(10 bar aapke stickers ka combo react)_\n`;
            const sampleKey = myStickerKeys[0];
            listText += `👉 *.rs ${sampleKey} 5*  _(Sirf ${sampleKey} react hoga)_\n`;
            listText += `👉 *.was*  _(Single sticker reaction)_\n`;
            listText += `👉 *.sts del ${sampleKey}*  _(Sticker delete karne ke liye)_`;

            return await sock.sendMessage(from, { text: listText }, { quoted: msg });
        }

        // 2. DELETE STICKER (.sts del <name>)
        if (['del', 'delete', 'remove', 'rm'].includes(firstArg)) {
            const targetName = (rawArgs[1] || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
            if (!targetName) {
                return await sock.sendMessage(from, {
                    text: "❌ *Usage:* `.sts del <sticker_name>`\n\n💡 Example: `.sts del dog`"
                }, { quoted: msg });
            }

            if (!userRecord.stickers || !userRecord.stickers[targetName]) {
                return await sock.sendMessage(from, {
                    text: `❌ Sticker *"${targetName}"* aapke personal collection mein nahi mila.\n\n💡 Apne saved stickers dekhne ke liye likhein: *.sts list*`
                }, { quoted: msg });
            }

            // Remove local file if present
            const localFile = userRecord.stickers[targetName].localFile;
            if (localFile) {
                try {
                    await fs.remove(path.join(STICKERS_DIR, localFile));
                } catch (_) {}
            }

            delete userRecord.stickers[targetName];
            if (userRecord.latest === targetName) {
                const remaining = Object.keys(userRecord.stickers);
                userRecord.latest = remaining[remaining.length - 1] || null;
            }

            persistStickers(store);

            await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});
            return await sock.sendMessage(from, {
                text: `✅ Sticker *"${targetName}"* aapke personal collection se kamyabi se delete ho gaya!`
            }, { quoted: msg });
        }

        // 3. SAVE STICKER (.sts [name])
        let quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted?.ephemeralMessage?.message) quoted = quoted.ephemeralMessage.message;
        if (quoted?.viewOnceMessage?.message) quoted = quoted.viewOnceMessage.message;
        if (quoted?.viewOnceMessageV2?.message) quoted = quoted.viewOnceMessageV2.message;
        if (quoted?.documentWithCaptionMessage?.message) quoted = quoted.documentWithCaptionMessage.message;

        const targetSticker = quoted?.stickerMessage || msg.message?.stickerMessage;

        if (!targetSticker) {
            return await sock.sendMessage(from, {
                text:
`╭━━━〔 💾 *SAVE STICKER ENGINE* 〕━━━┈⊷
┃ 📌 *Sticker Save Karne Ka Tarika:*
┃ 1️⃣ Apne phone ke kisi bhi sticker ko *Reply* karein.
┃ 2️⃣ Type karein: *.sts <name>*
┃    Example: *.sts dog* ya *.sts fire* ya sirf *.sts*
┃
┃ 🔒 *100% Personal & Private:*
┃    Jo sticker aap save karenge wo sirf *Aapke*
┃    inbox aur account se react hoga (.rs).
┃    Kisi doosre user ko nahi dikhega!
┃
┃ 📋 *Commands:*
┃ 👉 *.sts list* ➜ Aapke saved stickers
┃ 👉 *.sts del <name>* ➜ Sticker delete karein
┃ 👉 *.rs 5* ➜ Apne stickers react karein
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        // Clean sticker name (alphanumeric, underscore, hyphen)
        let stickerName = (rawArgs[0] || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');

        // Auto-generate name personal to this user if not provided
        if (!stickerName) {
            const userExistingCount = Object.keys(userRecord.stickers || {}).length;
            let counter = userExistingCount + 1;
            while (userRecord.stickers && userRecord.stickers[`stk_${counter}`]) {
                counter++;
            }
            stickerName = `stk_${counter}`;
        }

        // Download media into buffer
        let stickerBuffer = null;
        try {
            const stream = await downloadContentFromMessage(targetSticker, 'sticker');
            stickerBuffer = await streamToBuffer(stream);
        } catch (dlErr) {
            console.warn('[StickerDownload Warning]:', dlErr.message);
        }

        const localFileName = `${userIds.canonicalId}_${stickerName}.webp`;
        const localFilePath = path.join(STICKERS_DIR, localFileName);

        if (stickerBuffer && stickerBuffer.length > 0) {
            try {
                await fs.writeFile(localFilePath, stickerBuffer);
            } catch (wErr) {
                console.warn('[StickerFile Write Warning]:', wErr.message);
            }
        }

        const finalFileLength = targetSticker.fileLength ? Number(targetSticker.fileLength) : (stickerBuffer?.length || 134248);

        // Save isolated to this user's record
        userRecord.stickers[stickerName] = {
            name: stickerName,
            url: targetSticker.url || '',
            fileSha256: toBase64(targetSticker.fileSha256),
            fileEncSha256: toBase64(targetSticker.fileEncSha256),
            mediaKey: toBase64(targetSticker.mediaKey),
            fileLength: finalFileLength,
            height: 512,
            width: 512,
            mimetype: targetSticker.mimetype || 'image/webp',
            directPath: targetSticker.directPath || '',
            isAnimated: !!targetSticker.isAnimated,
            isAvatar: !!targetSticker.isAvatar,
            isLottie: !!targetSticker.isLottie,
            savedAt: Date.now(),
            localFile: localFileName,
            savedByDigits: userIds.canonicalId,
            savedByPhone: userIds.phoneJid || '',
            savedByLid: userIds.lidJid || '',
            savedByPushName: msg.pushName || ''
        };

        userRecord.latest = stickerName;
        persistStickers(store);

        const myTotal = Object.keys(userRecord.stickers).length;

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

        return await sock.sendMessage(from, {
            text:
`╭━━━〔 ✅ *STICKER SAVED TO YOUR PERSONAL POOL!* 〕━━━┈⊷
┃ 🏷️ *Name:* ${stickerName}
┃ ✨ *Type:* ${targetSticker.isAnimated ? 'Animated' : 'Static'}
┃ 👤 *Aapke Total Saved Stickers:* ${myTotal} Stickers
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

💡 *Ab kisi bhi message ko reply karke likhein:*
👉 *.rs 5*  _(Aapke save kiye hue ${myTotal} stickers ka Mixup/Combo react hoga!)_
👉 *.rs 10*  _(10 bar Mixup combo reaction)_
👉 *.rs ${stickerName} 5*  _(Sirf ${stickerName} react hoga)_
👉 *.was*  _(Single sticker reaction)_`
        }, { quoted: msg });

    } catch (e) {
        console.error('[saveStickerCommand Error]:', e);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
}

/**
 * .rs / .rs10 / .sreact
 * Sends WhatsApp native sticker reaction (associationType: 11) onto replied message.
 * Strict User Isolation:
 * - Uses ONLY the calling sender's personal stickers!
 * - Never reacts with other users' stickers.
 * - Supports mixup combos across user's collection or specific sticker repeat.
 */
async function repeatReactCommand(sock, from, msg, args = [], commandName = 'rs') {
    try {
        const rawArgs = (args || []).map(a => String(a).trim()).filter(Boolean);
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const stanzaId = contextInfo?.stanzaId;
        const participant = contextInfo?.participant;
        const quotedMsgContent = contextInfo?.quotedMessage;

        if (!stanzaId) {
            return await sock.sendMessage(from, {
                text:
`╭━━━〔 ⚡ *STICKER REACTION (.rs)* 〕━━━┈⊷
┃ ⚠️ *Jis message par sticker react karna hai,*
┃    *us message ko Reply karein!*
┃
┃ 📌 *Syntax:*
┃ 👉 *.rs 5*  _(Aapke apne saved stickers ka Mixup/Combo react)_
┃ 👉 *.rs 10*  _(10 bar aapke stickers ka combo react)_
┃ 👉 *.rs <name> <times>*  _(e.g. *.rs dog 5* - Sirf ek sticker)_
┃ 👉 *.was*  _(Single sticker reaction)_
┃
┃ 💡 *Saved stickers dekhne ke liye:* *.sts list*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
            }, { quoted: msg });
        }

        // Determine repeat count
        let count = 5; // default 5
        let specifiedName = null;

        const numInCmd = commandName.replace(/[^0-9]/g, '');
        if (numInCmd) {
            count = parseInt(numInCmd, 10);
        }

        for (const arg of rawArgs) {
            const num = parseInt(arg, 10);
            if (!isNaN(num) && num > 0) {
                count = num;
            } else if (!specifiedName) {
                specifiedName = arg.toLowerCase().replace(/[^a-z0-9_-]/g, '');
            }
        }

        // Safety cap: min 1, max 20
        if (count < 1) count = 1;
        if (count > 20) count = 20;

        const isGroup = from.endsWith('@g.us');
        const myJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : '';
        const myLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : '';
        const quotedNorm = participant ? jidNormalizedUser(participant) : '';

        // Detect if the replied message was sent by the bot
        let isFromMe = false;
        if (quotedNorm) {
            if (quotedNorm === myJid || quotedNorm === myLid) {
                isFromMe = true;
            }
        } else if (!isGroup && msg.key.fromMe) {
            isFromMe = true;
        }

        let isMixupMode = false;
        let poolPayloads = [];

        // 1. Quoted message itself is a sticker!
        if (quotedMsgContent?.stickerMessage && !specifiedName) {
            const sm = quotedMsgContent.stickerMessage;
            const stickerPayload = {
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
            poolPayloads = [stickerPayload];
        } else {
            // 2. Load strictly from calling user's personal isolated sticker pool
            const store = loadSavedStickers();
            const userIds = await extractUserIdentifiers(sock, from, msg, store);
            const userRecord = getUserRecord(store, userIds.canonicalId);
            const userStickers = userRecord.stickers || {};
            const myKeys = Object.keys(userStickers);

            // Case A: User has not saved any personal stickers
            if (myKeys.length === 0) {
                return await sock.sendMessage(from, {
                    text:
`╭━━━〔 ⚠️ *NO PERSONAL STICKERS SAVED* 〕━━━┈⊷
┃ 👤 *Aapne abhi tak apna koi sticker save nahi kiya!*
┃
┃ 💡 *Apna Sticker Save Kaise Karein:*
┃ 1️⃣ Apne phone ke kisi bhi sticker ko *Reply* karein.
┃ 2️⃣ Type karein: *.sts*  (ya *.sts <name>*)
┃ 3️⃣ Phir message ko reply karke likhein: *.rs 5*
┃    ➜ *Aapke apne save kiye hue stickers react honge!*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
                }, { quoted: msg });
            }

            // Case B: User specifically requested a sticker name (e.g. .rs dog 5)
            if (specifiedName && !['my', 'mine', 'me', 'mix', 'combo', 'random', 'all'].includes(specifiedName)) {
                let matchedKey = myKeys.find(k => k.toLowerCase() === specifiedName);

                if (!matchedKey) {
                    return await sock.sendMessage(from, {
                        text:
`❌ Sticker *"${specifiedName}"* aapke personal collection mein nahi mila!

💡 *Aapke apne stickers dekhne ke liye:* *.sts list*
👉 *Apne tamam stickers ka combo react karne ke liye:* *.rs 5*`
                    }, { quoted: msg });
                }

                const s = userStickers[matchedKey];
                poolPayloads = [{
                    url: s.url || '',
                    fileSha256: ensureBuffer(s.fileSha256),
                    fileEncSha256: ensureBuffer(s.fileEncSha256),
                    mediaKey: ensureBuffer(s.mediaKey),
                    fileLength: s.fileLength || 134248,
                    height: 512,
                    width: 512,
                    mimetype: s.mimetype || 'image/webp',
                    directPath: s.directPath || '',
                    isAnimated: !!s.isAnimated,
                    isAvatar: false,
                    isLottie: false
                }];
            } else {
                // Case C: Personal Mixup/Combo across calling user's own stickers
                isMixupMode = myKeys.length > 1;
                for (const k of myKeys) {
                    const s = userStickers[k];
                    if (s && (s.url || s.fileSha256)) {
                        poolPayloads.push({
                            url: s.url || '',
                            fileSha256: ensureBuffer(s.fileSha256),
                            fileEncSha256: ensureBuffer(s.fileEncSha256),
                            mediaKey: ensureBuffer(s.mediaKey),
                            fileLength: s.fileLength || 134248,
                            height: 512,
                            width: 512,
                            mimetype: s.mimetype || 'image/webp',
                            directPath: s.directPath || '',
                            isAnimated: !!s.isAnimated,
                            isAvatar: false,
                            isLottie: false
                        });
                    }
                }
            }
        }

        if (!poolPayloads || poolPayloads.length === 0) {
            return await sock.sendMessage(from, {
                text:
`⚠️ *Koi valid sticker nahi mila!*
💡 Pehle kisi sticker ko reply karke *.sts* likhein, phir *.rs 5* karein.`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

        console.log(`[StickerReact] Relaying ${count}x sticker reaction (Pool: ${poolPayloads.length}, Mixup: ${isMixupMode}) on message: ${stanzaId}...`);

        const targetKey = {
            remoteJid: from,
            fromMe: isFromMe,
            id: stanzaId,
            ...(isGroup && quotedNorm ? { participant: quotedNorm } : {})
        };

        // Send sticker reactions cleanly cycling through the mixup pool
        for (let i = 0; i < count; i++) {
            const currentPayload = poolPayloads[i % poolPayloads.length];
            if (!currentPayload) continue;

            try {
                await sock.relayMessage(from, {
                    messageContextInfo: {
                        messageAssociation: {
                            associationType: 11, // STICKER_ANNOTATION
                            parentMessageKey: targetKey
                        }
                    },
                    stickerMessage: currentPayload
                }, {});
            } catch (sendErr) {
                console.error(`[StickerReact Relay Error ${i + 1}]:`, sendErr.message);
            }

            if (i < count - 1) {
                await new Promise(r => setTimeout(r, 260));
            }
        }

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

    } catch (e) {
        console.error('[repeatReactCommand Error]:', e);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
}

module.exports = {
    saveStickerCommand,
    repeatReactCommand,
    loadSavedStickers,
    persistStickers,
    extractUserIdentifiers,
    isStickerOwnedByUser,
    getUserStickers,
    getUserRecord
};
