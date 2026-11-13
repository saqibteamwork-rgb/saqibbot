'use strict';

/**
 * MR SAQIB MD :: Master Owner & Co-Owner Management Engine (.ownadd / .owndel / .ownlist)
 * ========================================================================================
 * - Master Owner is strictly 03438673242 (923438673242).
 * - Only Master Owner (03438673242) can add or remove owners via .ownadd / .owndel.
 * - Supports adding owners via:
 *     1. Replying to a user's message: .ownadd
 *     2. Mentioning a user: .ownadd @user
 *     3. Providing a phone number: .ownadd 03001234567 / .ownadd 923001234567
 */

const fs = require('fs-extra');
const path = require('path');

const OWNERS_FILE = path.join(__dirname, '..', 'data', 'owners.json');
const MASTER_OWNER_DIGITS = '923438673242';
const MASTER_LAST10 = '3438673242';

// Deduplication set so multiple sessions in the same group don't send duplicate command replies
const handledOwnerCmdMsgIds = new Set();

function markCommandHandled(msgId) {
    if (!msgId) return false;
    if (handledOwnerCmdMsgIds.has(msgId)) return true;
    handledOwnerCmdMsgIds.add(msgId);
    if (handledOwnerCmdMsgIds.size > 1000) {
        handledOwnerCmdMsgIds.delete(handledOwnerCmdMsgIds.values().next().value);
    }
    return false;
}

function normalizePhoneDigits(raw) {
    if (!raw) return '';
    let d = String(raw).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('03') && d.length === 11) {
        d = '92' + d.slice(1);
    }
    return d;
}

function extractLidDigits(raw) {
    if (!raw) return '';
    const str = String(raw);
    if (!str.includes('@lid')) return '';
    return str.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

function loadOwnersData() {
    try {
        if (fs.existsSync(OWNERS_FILE)) {
            const data = fs.readJsonSync(OWNERS_FILE) || {};
            if (!Array.isArray(data.owners)) data.owners = [];
            if (!Array.isArray(data.masterLids)) data.masterLids = [];
            return data;
        }
    } catch (e) {
        console.error('[OwnerManager Load Error]:', e.message);
    }
    return {
        masterOwner: MASTER_OWNER_DIGITS,
        masterLids: [],
        owners: []
    };
}

function saveOwnersData(data) {
    try {
        fs.ensureDirSync(path.dirname(OWNERS_FILE));
        fs.writeJsonSync(OWNERS_FILE, data, { spaces: 2 });
    } catch (e) {
        console.error('[OwnerManager Save Error]:', e.message);
    }
}

/**
 * Automatically records the LID of Master Owner or any registered owner when their session connects
 */
function registerSessionIdentity(sock) {
    try {
        const userId = sock?.user?.id || '';
        const userLid = sock?.user?.lid || '';
        const phoneDigits = normalizePhoneDigits(userId);
        const lidDigits = extractLidDigits(userLid) || String(userLid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

        if (!phoneDigits || !lidDigits) return;

        const data = loadOwnersData();
        let changed = false;

        if (phoneDigits === MASTER_OWNER_DIGITS || phoneDigits.endsWith(MASTER_LAST10)) {
            if (!data.masterLids.includes(lidDigits)) {
                data.masterLids.push(lidDigits);
                changed = true;
            }
        }

        const ownerEntry = data.owners.find(o =>
            o && (o.digits === phoneDigits || (o.digits && phoneDigits.endsWith(o.digits.slice(-10))))
        );
        if (ownerEntry && ownerEntry.lid !== lidDigits) {
            ownerEntry.lid = lidDigits;
            changed = true;
        }

        if (changed) saveOwnersData(data);
    } catch {}
}

/**
 * Checks if the sender is the Master Owner (03438673242)
 */
function checkIsMasterOwner({ senderDigits, resolvedPhone, senderLid, resolvedLid, isMe, botNumberDigits }) {
    const cleanSender = normalizePhoneDigits(senderDigits);
    const cleanResolved = normalizePhoneDigits(resolvedPhone);
    const cleanBot = normalizePhoneDigits(botNumberDigits);

    if (cleanSender === MASTER_OWNER_DIGITS || (cleanSender.length >= 10 && cleanSender.endsWith(MASTER_LAST10))) {
        return true;
    }
    if (cleanResolved === MASTER_OWNER_DIGITS || (cleanResolved.length >= 10 && cleanResolved.endsWith(MASTER_LAST10))) {
        return true;
    }
    if (isMe && (cleanBot === MASTER_OWNER_DIGITS || (cleanBot.length >= 10 && cleanBot.endsWith(MASTER_LAST10)))) {
        return true;
    }

    const data = loadOwnersData();
    const checkLid = String(senderLid || resolvedLid || '').replace(/[^0-9]/g, '');
    if (checkLid && Array.isArray(data.masterLids) && data.masterLids.includes(checkLid)) {
        return true;
    }

    return false;
}

/**
 * Checks if the sender is either Master Owner (03438673242) OR added via .ownadd
 */
function checkIsOwner(ctx) {
    if (checkIsMasterOwner(ctx)) return true;

    const cleanSender = normalizePhoneDigits(ctx.senderDigits);
    const cleanResolved = normalizePhoneDigits(ctx.resolvedPhone);
    const cleanBot = normalizePhoneDigits(ctx.botNumberDigits);
    const checkLid = String(ctx.senderLid || ctx.resolvedLid || '').replace(/[^0-9]/g, '');

    const data = loadOwnersData();
    for (const o of (data.owners || [])) {
        if (!o) continue;
        const oDigits = normalizePhoneDigits(o.digits);
        const oLast10 = oDigits.length >= 10 ? oDigits.slice(-10) : '';

        if (oDigits) {
            if (cleanSender && (cleanSender === oDigits || (oLast10 && cleanSender.endsWith(oLast10)))) return true;
            if (cleanResolved && (cleanResolved === oDigits || (oLast10 && cleanResolved.endsWith(oLast10)))) return true;
            if (ctx.isMe && cleanBot && (cleanBot === oDigits || (oLast10 && cleanBot.endsWith(oLast10)))) return true;
        }
        if (o.lid && checkLid && o.lid === checkLid) {
            return true;
        }
        if (o.lid && cleanSender && o.lid === cleanSender) {
            return true;
        }
    }

    return false;
}

/**
 * Extracts target user (digits, lid, jid, display) from reply, @mention, or phone number argument
 */
function extractTargetUser(msg, args = [], groupMetadata = null) {
    const mContent = msg?.message?.ephemeralMessage?.message ||
                     msg?.message?.viewOnceMessage?.message ||
                     msg?.message?.viewOnceMessageV2?.message ||
                     msg?.message || {};
    const ctx = mContent?.extendedTextMessage?.contextInfo ||
                mContent?.imageMessage?.contextInfo ||
                mContent?.videoMessage?.contextInfo ||
                msg?.message?.extendedTextMessage?.contextInfo || {};

    let rawTargetJid = null;

    // 1. Mentioned user (@mention)
    if (Array.isArray(ctx.mentionedJid) && ctx.mentionedJid.length > 0) {
        rawTargetJid = ctx.mentionedJid[0];
    }
    // 2. Quoted / Replied message participant
    else if (ctx.participant) {
        rawTargetJid = ctx.participant;
    }

    let digits = '';
    let lid = '';

    if (rawTargetJid) {
        if (String(rawTargetJid).includes('@lid')) {
            lid = extractLidDigits(rawTargetJid);
        } else {
            digits = normalizePhoneDigits(rawTargetJid);
        }

        // Try resolving both phone and LID from groupMetadata if in a group
        if (groupMetadata && Array.isArray(groupMetadata.participants)) {
            const baseTarget = String(rawTargetJid).split(':')[0];
            const part = groupMetadata.participants.find(p => {
                const pId = String(p.id || '').split(':')[0];
                const pLid = String(p.lid || '').split(':')[0];
                return (pId && pId === baseTarget) || (pLid && pLid === baseTarget);
            });
            if (part) {
                if (part.id && String(part.id).includes('@s.whatsapp.net')) {
                    digits = normalizePhoneDigits(part.id);
                }
                if (part.lid) {
                    lid = String(part.lid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                }
            }
        }
    }

    // 3. Fallback or override from args phone number (e.g. .ownadd 03001234567)
    if (!digits && args.length > 0) {
        const rawArg = args.join(' ').replace(/@/g, '').trim();
        const candidate = normalizePhoneDigits(rawArg);
        if (candidate.length >= 10 && candidate.length <= 15) {
            digits = candidate;
            if (groupMetadata && Array.isArray(groupMetadata.participants)) {
                const last10 = digits.slice(-10);
                const part = groupMetadata.participants.find(p => {
                    const pDigits = normalizePhoneDigits(p.id);
                    return pDigits === digits || (last10 && pDigits.endsWith(last10));
                });
                if (part?.lid) {
                    lid = String(part.lid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                }
            }
        }
    }

    if (!digits && !lid) return null;

    const jid = digits ? `${digits}@s.whatsapp.net` : `${lid}@lid`;
    const display = digits ? `+${digits}` : `LID:${lid}`;

    return { digits: digits || null, lid: lid || null, jid, display };
}

/**
 * Command: .ownadd [number | @mention | reply]
 * Strictly executable ONLY by Master Owner 03438673242
 */
async function ownaddCommand(sock, from, msg, isMasterOwner, args = [], groupMetadata = null) {
    if (markCommandHandled(msg?.key?.id)) return;

    if (!isMasterOwner) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🔒 *MASTER OWNER ONLY* 〕━━━┈⊷\n` +
                  `┃ ❌ *Access Denied!*\n` +
                  `┃ Ye command sirf Master Owner\n` +
                  `┃ (*03438673242*) run kar sakta hai!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const target = extractTargetUser(msg, args, groupMetadata);
    if (!target) {
        return await sock.sendMessage(from, {
            text: `╭━━━〔 👑 *ADD BOT OWNER (.ownadd)* 〕━━━┈⊷\n` +
                  `┃ 📌 *Kaise Add Karein:*\n` +
                  `┃ 1️⃣ Kisi ke message par *Reply* kar ke:\n` +
                  `┃    👉 \`.ownadd\`\n` +
                  `┃ 2️⃣ Group me *Mention* kar ke:\n` +
                  `┃    👉 \`.ownadd @user\`\n` +
                  `┃ 3️⃣ *Number* likh kar:\n` +
                  `┃    👉 \`.ownadd 03001234567\`\n` +
                  `┃\n` +
                  `┃ 🗑️ *Remove:* \`.owndel <number/@user/reply>\`\n` +
                  `┃ 📋 *List:* \`.ownlist\`\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const data = loadOwnersData();
    const existing = data.owners.find(o =>
        (target.digits && o.digits === target.digits) ||
        (target.lid && o.lid === target.lid)
    );

    if (existing) {
        if (target.digits && !existing.digits) existing.digits = target.digits;
        if (target.lid && !existing.lid) existing.lid = target.lid;
        saveOwnersData(data);
    } else {
        data.owners.push({
            digits: target.digits,
            lid: target.lid,
            jid: target.jid,
            addedBy: MASTER_OWNER_DIGITS,
            addedAt: Date.now()
        });
        saveOwnersData(data);
    }

    await sock.sendMessage(from, { react: { text: '👑', key: msg.key } }).catch(() => {});

    const mentionList = target.jid ? [target.jid] : [];
    const tagDisplay = target.digits ? `@${target.digits}` : target.display;

    return await sock.sendMessage(from, {
        text: `╭━━━〔 👑 *NEW BOT OWNER ADDED* 〕━━━┈⊷\n` +
              `┃ ✅ *Status:* Successfully Promoted\n` +
              `┃ 👤 *User:* ${tagDisplay}\n` +
              `┃ 🆔 *ID:* \`${target.digits || target.lid}\`\n` +
              `┃ 🛡️ *Role:* Co-Owner (Full Command Access)\n` +
              `┃ 👑 *Added By:* Master Owner (03438673242)\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`,
        mentions: mentionList
    }, { quoted: msg });
}

/**
 * Command: .owndel / .delown [number | @mention | reply]
 * Strictly executable ONLY by Master Owner 03438673242
 */
async function owndelCommand(sock, from, msg, isMasterOwner, args = [], groupMetadata = null) {
    if (markCommandHandled(msg?.key?.id)) return;

    if (!isMasterOwner) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `❌ *Access Denied!* Sirf Master Owner (*03438673242*) owner remove kar sakta hai.`
        }, { quoted: msg });
    }

    const target = extractTargetUser(msg, args, groupMetadata);
    if (!target) {
        return await sock.sendMessage(from, {
            text: `❌ *Usage:* Kisi message par reply kar ke \`.owndel\` likhein, ya \`.owndel @user\` / \`.owndel 03001234567\` likhein!`
        }, { quoted: msg });
    }

    const data = loadOwnersData();
    const beforeCount = data.owners.length;
    data.owners = data.owners.filter(o => {
        if (target.digits && o.digits === target.digits) return false;
        if (target.lid && o.lid === target.lid) return false;
        return true;
    });

    if (data.owners.length === beforeCount) {
        return await sock.sendMessage(from, {
            text: `ℹ️ *Ye user Owner list me mojood nahi hai!*`
        }, { quoted: msg });
    }

    saveOwnersData(data);
    await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});

    return await sock.sendMessage(from, {
        text: `╭━━━〔 🗑️ *BOT OWNER REMOVED* 〕━━━┈⊷\n` +
              `┃ 👤 *Removed:* ${target.display}\n` +
              `┃ 🔒 *Status:* Owner Access Revoked\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
}

/**
 * Command: .ownlist / .owners
 */
async function ownlistCommand(sock, from, msg, isOwner) {
    if (markCommandHandled(msg?.key?.id)) return;
    if (!isOwner) {
        return await sock.sendMessage(from, { text: `❌ *Sirf Bot Owner ye list dekh sakta hai!*` }, { quoted: msg });
    }

    const data = loadOwnersData();
    let listText = `┃ 👑 *1. +923438673242* (Master Owner)\n`;
    data.owners.forEach((o, i) => {
        const label = o.digits ? `+${o.digits}` : `LID:${o.lid}`;
        listText += `┃ 🛡️ *${i + 2}. ${label}* (Co-Owner)\n`;
    });

    return await sock.sendMessage(from, {
        text: `╭━━━〔 👑 *AUTHORIZED BOT OWNERS* 〕━━━┈⊷\n` +
              `${listText}` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
}

module.exports = {
    MASTER_OWNER_DIGITS,
    markCommandHandled,
    normalizePhoneDigits,
    loadOwnersData,
    saveOwnersData,
    registerSessionIdentity,
    checkIsMasterOwner,
    checkIsOwner,
    ownaddCommand,
    owndelCommand,
    ownlistCommand
};
