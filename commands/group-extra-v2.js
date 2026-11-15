'use strict';

/**
 * MR SAQIB MD :: Advanced Group & Channel Tools
 * ============================================================================
 * Commands:
 * - .listgc / .groups     : List all groups the bot is in
 * - .grouplogo / .glogo   : Get high-res picture of the group
 * - .invtag / .ghosttag   : Invisible / Ghost mention of all members
 * - .inspect / .chinspect : Inspect WhatsApp channel or group links
 * ============================================================================
 */

const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const settings = require('../settings');

function toSansBold(str) {
    return String(str || '').replace(/[A-Za-z0-9]/g, c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + code - 97);
        if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);
        return c;
    });
}

/**
 * .listgc / .groups - List all participating groups with member count & invite links
 */
async function listgcCommand(sock, from, msg, isOwner, isSessionOwner = false) {
    if (!isOwner && !isSessionOwner) {
        return await sock.sendMessage(from, { 
            text: "❌ *Sirf Bot Owner ya is session ka user groups ki list dekh sakta hai!*" 
        }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '🔎', key: msg.key } }).catch(() => {});

    try {
        const participatingGroups = await sock.groupFetchAllParticipating();
        const groups = Object.entries(participatingGroups || {})
            .filter(([jid]) => jid.endsWith('@g.us'))
            .sort((a, b) => String(a[1]?.subject || '').localeCompare(String(b[1]?.subject || '')));

        if (!groups.length) {
            return await sock.sendMessage(from, { text: "ℹ️ Bot kisi group mein shamil nahi hai." }, { quoted: msg });
        }

        // Fetch invite links in parallel with timeout
        const groupCards = await Promise.all(groups.map(async ([jid, g], idx) => {
            const subject = g.subject || 'Untitled Group';
            const count = (g.participants || []).length;
            let linkStr = '🔒 _Admin required for link_';

            try {
                const codePromise = sock.groupInviteCode(jid);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500));
                const code = await Promise.race([codePromise, timeoutPromise]);
                if (code) {
                    linkStr = `https://chat.whatsapp.com/${code}`;
                }
            } catch (_) {}

            return `${idx + 1}. 🏷️ *${subject}*\n   🆔 \`${jid}\`\n   👥 Members: *${count}*\n   🔗 Link: ${linkStr}\n`;
        }));

        let out = 
`╭━━━〔 ⚡ ${toSansBold('ALL PARTICIPATING GROUPS')} ⚡ 〕━━━┈⊷
┃ 📊 *Total Groups:* ${groups.length}
┃ 👑 *Bot:* ${toSansBold(settings.botName || 'MR SAQIB MD')}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` + groupCards.join('\n') + `\n⚡ *Powered by MR SAQIB MD*`;

        await sock.sendMessage(from, { text: out }, { quoted: msg });

    } catch (err) {
        console.error('[ListGC Error]:', err.message);
        await sock.sendMessage(from, { text: `❌ *Error fetching groups:*\n_${err.message}_` }, { quoted: msg });
    }
}

/**
 * .grouplogo / .glogo - Get HD picture of the group
 */
async function grouplogoCommand(sock, from, msg) {
    if (!from.endsWith('@g.us')) {
        return await sock.sendMessage(from, { text: "❌ *Ye command sirf groups mein use ho sakti hai!*" }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '🖼️', key: msg.key } }).catch(() => {});

    try {
        const { getProfilePictureUrl } = require('../utils/pfpFetcher');
        const pfpRes = await getProfilePictureUrl(sock, from);
        const pfpUrl = pfpRes?.url || null;
        if (!pfpUrl) {
            return await sock.sendMessage(from, { text: "❌ *Is group par koi profile picture nahi lagi hui!*" }, { quoted: msg });
        }

        const meta = await sock.groupMetadata(from).catch(() => ({}));
        await sock.sendMessage(from, {
            image: { url: pfpUrl },
            caption:
`╭━━━〔 ⚡ ${toSansBold('GROUP PROFILE PICTURE')} ⚡ 〕━━━┈⊷
┃ 🏷️ *Group:* ${meta.subject || 'Group'}
┃ 🆔 \`${from}\`
┃ 👑 *Bot:* ${toSansBold(settings.botName || 'MR SAQIB MD')}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });

    } catch (err) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${err.message}` }, { quoted: msg });
    }
}

/**
 * .invtag / .ghosttag - Invisible mention of all group members
 */
async function invtagCommand(sock, from, msg, isAdmin, isOwner) {
    if (!from.endsWith('@g.us')) {
        return await sock.sendMessage(from, { text: "❌ *Ye command sirf groups mein use ho sakti hai!*" }, { quoted: msg });
    }
    if (!isAdmin && !isOwner) {
        return await sock.sendMessage(from, { text: "❌ *Sirf group admins ya bot owner invtag use kar sakte hain!*" }, { quoted: msg });
    }

    try {
        const groupMeta = await sock.groupMetadata(from);
        const members = (groupMeta.participants || []).map(p => p.id);

        await sock.relayMessage(from, {
            albumMessage: {
                contextInfo: {
                    mentionedJid: members
                }
            }
        }, {});

        await sock.sendMessage(from, { react: { text: '👻', key: msg.key } }).catch(() => {});

    } catch (err) {
        console.error('[InvTag Error]:', err.message);
        await sock.sendMessage(from, { text: `❌ *Ghost tag failed:* ${err.message}` }, { quoted: msg });
    }
}

/**
 * .inspect - Inspect WhatsApp channel or group invite
 */
async function inspectCommand(sock, from, msg, args = []) {
    const text = args.join(' ').trim() || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '';

    if (!text) {
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 ⚡ ${toSansBold('LINK INSPECTOR')} ⚡ 〕━━━┈⊷
┃ 🔍 *Usage:* Channel ya Group link inspect karein:
┃
┃ 👉 *.inspect https://whatsapp.com/channel/0029VbAnF9Q9hXFERv7Stc2v*
┃ 👉 *.inspect https://chat.whatsapp.com/ABC123XYZ*
┃
┃ 🛡️ *Powered by MR SAQIB MD*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } }).catch(() => {});

    // Case 1: WhatsApp Channel
    if (text.includes('whatsapp.com/channel/')) {
        let code = text.split('whatsapp.com/channel/')[1];
        code = code.split(' ')[0].split('\n')[0].split('/')[0].trim();

        try {
            const meta = await sock.newsletterMetadata('invite', code);
            const verified = meta.verification === 'VERIFIED';
            const subs = meta.subscribers ? Number(meta.subscribers).toLocaleString() : 'N/A';
            const name = meta.name || 'Untitled Channel';
            const desc = meta.description || 'No description';
            const jid = meta.id || 'N/A';
            const preview = meta.preview;

            let card =
`╭━━━〔 ⚡ ${toSansBold('CHANNEL INSPECTION')} ⚡ 〕━━━┈⊷
┃ 📢 *Name:* *${name}* ${verified ? '✅ Verified' : ''}
┃ 🆔 *JID:* \`${jid}\`
┃ 👥 *Subscribers:* ${subs}
┃ 🔗 *Invite Code:* \`${code}\`
┃ 📝 *Description:*
┃ ${desc.slice(0, 300)}
┃ 👑 *Bot:* ${toSansBold(settings.botName || 'MR SAQIB MD')}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

            if (preview) {
                await sock.sendMessage(from, { image: { url: preview }, caption: card }, { quoted: msg });
            } else {
                await sock.sendMessage(from, { text: card }, { quoted: msg });
            }
            return;
        } catch (err) {
            return await sock.sendMessage(from, { text: `❌ *Channel Inspection Failed:*\n_${err.message}_` }, { quoted: msg });
        }
    }

    // Case 2: WhatsApp Group Invite
    if (text.includes('chat.whatsapp.com/')) {
        let code = text.split('chat.whatsapp.com/')[1];
        code = code.split(' ')[0].split('\n')[0].split('/')[0].trim();

        try {
            const info = await sock.groupGetInviteInfo(code);
            const size = info.size || (info.participants || []).length || 'N/A';
            const card =
`╭━━━〔 ⚡ ${toSansBold('GROUP INVITE INSPECTION')} ⚡ 〕━━━┈⊷
┃ 🏷️ *Group:* *${info.subject || 'N/A'}*
┃ 🆔 *JID:* \`${info.id || 'N/A'}@g.us\`
┃ 👥 *Members:* ${size}
┃ 👑 *Owner:* +${(info.owner || '').replace(/\D/g, '')}
┃ 📅 *Creation Date:* ${info.creation ? new Date(info.creation * 1000).toLocaleDateString() : 'N/A'}
┃ 📝 *Description:*
┃ ${(info.desc || 'No description').slice(0, 300)}
┃ 👑 *Bot:* ${toSansBold(settings.botName || 'MR SAQIB MD')}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

            await sock.sendMessage(from, { text: card }, { quoted: msg });
            return;
        } catch (err) {
            return await sock.sendMessage(from, { text: `❌ *Group Invite Failed:*\n_${err.message}_` }, { quoted: msg });
        }
    }

    await sock.sendMessage(from, { text: "❌ *Invalid link!* Please provide a WhatsApp channel or group invite link." }, { quoted: msg });
}

module.exports = {
    listgcCommand,
    grouplogoCommand,
    invtagCommand,
    inspectCommand
};
