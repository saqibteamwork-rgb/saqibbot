'use strict';

/**
 * MR SAQIB MD :: ADVANCED GROUP LOCK & SETTINGS CONTROLLER
 * ============================================================================
 * Handles group message locking/unlocking and settings protection with
 * 100% reliable real-time admin detection across modern WhatsApp LIDs and Phone JIDs.
 * 
 * Commands:
 *  - .lock / .lockgroup / .glock   : Lock group chat (Admins only) + Settings
 *  - .unlock / .unlockgroup / .gunlock : Unlock group chat + Settings for all
 *  - .close / .gclose              : Close group chat (Admins only message)
 *  - .open / .gopen                : Open group chat (All members message)
 * ============================================================================
 */

const { jidNormalizedUser } = require('@whiskeysockets/baileys');

/**
 * Normalizes any JID / LID into pure numeric digits
 */
function toDigits(val) {
    if (!val) return '';
    return String(val).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

/**
 * Comprehensive real-time group & admin resolver
 */
async function resolveGroupAdminContext(sock, from, msg, isOwner = false) {
    if (!from || !from.endsWith('@g.us')) {
        return { isGroup: false };
    }

    // Always fetch fresh metadata to avoid stale cache issues when admins are newly promoted
    let metadata = null;
    try {
        metadata = await sock.groupMetadata(from);
    } catch (err) {
        console.warn('[GroupLock] groupMetadata fetch failed:', err.message);
    }

    const participants = metadata?.participants || [];

    // Collect all possible candidate digits for the SENDER
    const senderCandidates = new Set();
    const rawSender = msg?.key?.participant || msg?.participant || '';
    const senderAlt = msg?.key?.participantAlt || '';
    const ctxSender = msg?.message?.extendedTextMessage?.contextInfo?.participant || '';

    [rawSender, senderAlt, ctxSender].forEach(s => {
        const d = toDigits(s);
        if (d) senderCandidates.add(d);
    });

    // Cross-check persistent identity map for known LID <-> Phone resolutions
    try {
        const { loadSavedStickers } = require('./stickerReact');
        const st = loadSavedStickers();
        if (st?.identityMap) {
            for (const cand of Array.from(senderCandidates)) {
                if (st.identityMap[cand]) {
                    const mapped = toDigits(st.identityMap[cand]);
                    if (mapped) senderCandidates.add(mapped);
                }
            }
        }
    } catch (_) {}

    // Check if sender is an Admin in the group (or Owner, or fromMe)
    let isSenderAdmin = Boolean(isOwner || msg?.key?.fromMe);
    if (!isSenderAdmin) {
        for (const p of participants) {
            if (!p || (p.admin !== 'admin' && p.admin !== 'superadmin')) continue;
            const pId = toDigits(p.id);
            const pPn = toDigits(p.phoneNumber);
            const pLid = toDigits(p.lid);

            if ((pId && senderCandidates.has(pId)) ||
                (pPn && senderCandidates.has(pPn)) ||
                (pLid && senderCandidates.has(pLid))) {
                isSenderAdmin = true;
                break;
            }
        }
    }

    // Collect all possible candidate digits for the BOT
    const botCandidates = new Set();
    const botId = sock.user?.id || '';
    const botLid = sock.user?.lid || '';
    const botPn = sock.user?.phoneNumber || '';

    [botId, botLid, botPn].forEach(b => {
        const d = toDigits(b);
        if (d) botCandidates.add(d);
    });

    // Check if BOT is an Admin in the group
    let isBotAdmin = false;
    for (const p of participants) {
        if (!p || (p.admin !== 'admin' && p.admin !== 'superadmin')) continue;
        const pId = toDigits(p.id);
        const pPn = toDigits(p.phoneNumber);
        const pLid = toDigits(p.lid);

        if ((pId && botCandidates.has(pId)) ||
            (pPn && botCandidates.has(pPn)) ||
            (pLid && botCandidates.has(pLid))) {
            isBotAdmin = true;
            break;
        }
    }

    const senderDisplayDigits = toDigits(rawSender) || 'Admin';
    const senderJid = rawSender.includes('@') ? rawSender : `${senderDisplayDigits}@s.whatsapp.net`;

    return {
        isGroup: true,
        metadata,
        participants,
        isSenderAdmin,
        isBotAdmin,
        senderDisplayDigits,
        senderJid
    };
}

/**
 * .lock / .lockgroup / .glock
 * Locks both group chat (announcement) and group settings (locked)
 */
async function lockGroupCommand(sock, from, msg, isOwner = false, args = []) {
    try {
        const ctx = await resolveGroupAdminContext(sock, from, msg, isOwner);

        if (!ctx.isGroup) {
            return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
        }

        if (!ctx.isSenderAdmin) {
            return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin lock kar sakta hai!*" }, { quoted: msg });
        }

        if (!ctx.isBotAdmin) {
            return await sock.sendMessage(from, {
                text: "❌ *Command execute karne ke liye Bot ka Group Admin hona zaroori hai!*\n\n💡 _Pehle bot ko group admin banayein, phir command dein._"
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '🔒', key: msg.key } }).catch(() => {});

        const sub = (args[0] || '').toLowerCase().trim();
        let announcementUpdated = false;
        let settingsUpdated = false;

        // Mode 1: .lock info / .lock settings -> only lock settings
        if (sub === 'info' || sub === 'settings' || sub === 'desc') {
            try {
                await sock.groupSettingUpdate(from, 'locked');
                settingsUpdated = true;
            } catch (e) {
                console.warn('[LockGroup] locked update failed:', e.message);
            }
            return await sock.sendMessage(from, {
                text: `🔒 *Group Settings Locked!*\n_Ab sirf Group Admins group ka name/icon/description edit kar sakte hain._\n\n👤 *By:* @${ctx.senderDisplayDigits}`,
                mentions: [ctx.senderJid]
            }, { quoted: msg });
        }

        // Mode 2: .lock msg / .lock chat -> only lock messages
        if (sub === 'msg' || sub === 'chat' || sub === 'messages') {
            try {
                await sock.groupSettingUpdate(from, 'announcement');
                announcementUpdated = true;
            } catch (e) {
                console.warn('[LockGroup] announcement update failed:', e.message);
            }
            return await sock.sendMessage(from, {
                text: `🔒 *Group Chat Closed / Muted!*\n_Ab sirf Group Admins messages send kar sakte hain._\n\n👤 *By:* @${ctx.senderDisplayDigits}\n💡 *Open karne ke liye:* \`.unlock\` ya \`.open\``,
                mentions: [ctx.senderJid]
            }, { quoted: msg });
        }

        // Default Mode: Lock BOTH (Chat Messages + Settings)
        try {
            await sock.groupSettingUpdate(from, 'announcement');
            announcementUpdated = true;
        } catch (e) {
            console.warn('[LockGroup] announcement update failed:', e.message);
        }

        try {
            await sock.groupSettingUpdate(from, 'locked');
            settingsUpdated = true;
        } catch (e) {
            console.warn('[LockGroup] locked update failed:', e.message);
        }

        if (!announcementUpdated && !settingsUpdated) {
            return await sock.sendMessage(from, {
                text: "❌ *WhatsApp ne group settings update nahi kiye.*\n_Check karein ke Bot ke paas Admin rights maujood hain ya nahi._"
            }, { quoted: msg });
        }

        const card =
`╭━━━〔 🔒 *GROUP LOCKED SUCCESSFULLY* 〕━━━┈⊷
┃ 💬 *Messages:* Admins Only (Chat Closed)
┃ ⚙️ *Settings:* Admins Only (Locked)
┃ 👤 *Locked By:* @${ctx.senderDisplayDigits}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
💡 *Dobara open karne ke liye:* Type *.unlock* ya *.open*
> *_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ_*`;

        return await sock.sendMessage(from, { text: card, mentions: [ctx.senderJid] }, { quoted: msg });

    } catch (err) {
        console.error('[lockGroupCommand Error]:', err);
        await sock.sendMessage(from, { text: `❌ *Error:* ${err.message}` }, { quoted: msg }).catch(() => {});
    }
}

/**
 * .unlock / .unlockgroup / .gunlock
 * Unlocks both group chat (not_announcement) and group settings (unlocked)
 */
async function unlockGroupCommand(sock, from, msg, isOwner = false, args = []) {
    try {
        const ctx = await resolveGroupAdminContext(sock, from, msg, isOwner);

        if (!ctx.isGroup) {
            return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
        }

        if (!ctx.isSenderAdmin) {
            return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin unlock kar sakta hai!*" }, { quoted: msg });
        }

        if (!ctx.isBotAdmin) {
            return await sock.sendMessage(from, {
                text: "❌ *Command execute karne ke liye Bot ka Group Admin hona zaroori hai!*\n\n💡 _Pehle bot ko group admin banayein, phir command dein._"
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '🔓', key: msg.key } }).catch(() => {});

        const sub = (args[0] || '').toLowerCase().trim();
        let announcementUpdated = false;
        let settingsUpdated = false;

        // Mode 1: .unlock info / .unlock settings -> only unlock settings
        if (sub === 'info' || sub === 'settings' || sub === 'desc') {
            try {
                await sock.groupSettingUpdate(from, 'unlocked');
                settingsUpdated = true;
            } catch (e) {
                console.warn('[UnlockGroup] unlocked update failed:', e.message);
            }
            return await sock.sendMessage(from, {
                text: `🔓 *Group Settings Unlocked!*\n_Ab tamam members group ka info/icon change kar sakte hain._\n\n👤 *By:* @${ctx.senderDisplayDigits}`,
                mentions: [ctx.senderJid]
            }, { quoted: msg });
        }

        // Mode 2: .unlock msg / .unlock chat -> only unlock messages
        if (sub === 'msg' || sub === 'chat' || sub === 'messages') {
            try {
                await sock.groupSettingUpdate(from, 'not_announcement');
                announcementUpdated = true;
            } catch (e) {
                console.warn('[UnlockGroup] not_announcement update failed:', e.message);
            }
            return await sock.sendMessage(from, {
                text: `🔓 *Group Chat Opened!*\n_Ab sabhi members messages send kar sakte hain._\n\n👤 *By:* @${ctx.senderDisplayDigits}\n💡 *Lock karne ke liye:* \`.lock\` ya \`.close\``,
                mentions: [ctx.senderJid]
            }, { quoted: msg });
        }

        // Default Mode: Unlock BOTH (Chat Messages + Settings)
        try {
            await sock.groupSettingUpdate(from, 'not_announcement');
            announcementUpdated = true;
        } catch (e) {
            console.warn('[UnlockGroup] not_announcement update failed:', e.message);
        }

        try {
            await sock.groupSettingUpdate(from, 'unlocked');
            settingsUpdated = true;
        } catch (e) {
            console.warn('[UnlockGroup] unlocked update failed:', e.message);
        }

        if (!announcementUpdated && !settingsUpdated) {
            return await sock.sendMessage(from, {
                text: "❌ *WhatsApp ne group settings update nahi kiye.*\n_Check karein ke Bot ke paas Admin rights maujood hain ya nahi._"
            }, { quoted: msg });
        }

        const card =
`╭━━━〔 🔓 *GROUP UNLOCKED SUCCESSFULLY* 〕━━━┈⊷
┃ 💬 *Messages:* All Members (Chat Open)
┃ ⚙️ *Settings:* All Members (Unlocked)
┃ 👤 *Unlocked By:* @${ctx.senderDisplayDigits}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
💡 *Dobara lock karne ke liye:* Type *.lock* ya *.close*
> *_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ_*`;

        return await sock.sendMessage(from, { text: card, mentions: [ctx.senderJid] }, { quoted: msg });

    } catch (err) {
        console.error('[unlockGroupCommand Error]:', err);
        await sock.sendMessage(from, { text: `❌ *Error:* ${err.message}` }, { quoted: msg }).catch(() => {});
    }
}

/**
 * .close / .gclose
 * Closes group messages (only admins can message)
 */
async function closeGroupCommand(sock, from, msg, isOwner = false) {
    return await lockGroupCommand(sock, from, msg, isOwner, ['chat']);
}

/**
 * .open / .gopen
 * Opens group messages (all members can message)
 */
async function openGroupCommand(sock, from, msg, isOwner = false) {
    return await unlockGroupCommand(sock, from, msg, isOwner, ['chat']);
}

module.exports = {
    lockGroupCommand,
    unlockGroupCommand,
    closeGroupCommand,
    openGroupCommand,
    resolveGroupAdminContext
};
