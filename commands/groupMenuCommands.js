'use strict';

/**
 * MR SAQIB MD :: GROUP MENU COMMAND SUITE
 * ============================================================================
 * Implements all 41 Group Commands:
 * .accept, .acceptall, .add, .creategroup, .del, .demote, .demoteall,
 * .end, .gcfrwrd, .gcjid, .goodbye, .groupdesc, .groupinfo, .grouplink,
 * .hidetag, .join, .joinrequest, .kick, .leave, .listadmins, .lock,
 * .membercount, .out, .promote, .promoteall, .r, .randommember, .reject,
 * .rejectall, .requests, .revokelink, .rtest, .setgdesc, .setgname,
 * .setgoodbye, .setgrouppfp, .setwelcome, .tagadmins, .tagall, .unlock,
 * .welcome
 * ============================================================================
 */

const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

function cleanJid(jid) {
    if (!jid) return '';
    return jid.split(':')[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
}

function getTargetUser(msg, args = []) {
    const context = msg.message?.extendedTextMessage?.contextInfo;
    if (context?.mentionedJid && context.mentionedJid.length > 0) {
        return context.mentionedJid[0];
    }
    if (context?.participant) {
        return context.participant;
    }
    const rawNumber = (args[0] || '').replace(/[^0-9]/g, '');
    if (rawNumber && rawNumber.length >= 7) {
        return `${rawNumber}@s.whatsapp.net`;
    }
    return null;
}

async function streamToBuffer(stream) {
    let buffer = Buffer.alloc(0);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

// 1. .accept - Accept pending join request
async function acceptCommand(sock, from, msg, isAdmin, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ye command use kar sakta hai!*" }, { quoted: msg });

    try {
        const requests = await sock.groupRequestParticipantsList(from).catch(() => []);
        if (!requests || requests.length === 0) {
            return await sock.sendMessage(from, { text: "ℹ️ *Is group mein koi pending join request nahi hai!*" }, { quoted: msg });
        }

        const target = getTargetUser(msg, args);
        let targetJid = null;

        if (target) {
            const found = requests.find(r => r.jid.includes(target.split('@')[0]));
            if (found) targetJid = found.jid;
        }

        if (!targetJid) {
            targetJid = requests[0].jid; // Accept oldest/latest
        }

        await sock.groupRequestParticipantsUpdate(from, [targetJid], 'approve');
        await sock.sendMessage(from, {
            text: `✅ *Join request accept kar li gayi:* @${targetJid.split('@')[0]}`,
            mentions: [targetJid]
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 2. .acceptall - Accept all pending join requests
async function acceptallCommand(sock, from, msg, isAdmin) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ye command use kar sakta hai!*" }, { quoted: msg });

    try {
        const requests = await sock.groupRequestParticipantsList(from).catch(() => []);
        if (!requests || requests.length === 0) {
            return await sock.sendMessage(from, { text: "ℹ️ *Koi pending join request nahi mili!*" }, { quoted: msg });
        }

        const jids = requests.map(r => r.jid);
        await sock.groupRequestParticipantsUpdate(from, jids, 'approve');
        await sock.sendMessage(from, {
            text: `✅ *Tamam (${jids.length}) pending join requests accept kar li gayin!*`
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 3. .add - Add user to group
async function addCommand(sock, from, msg, isAdmin, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin kisi ko add kar sakta hai!*" }, { quoted: msg });

    const raw = args.join(' ').replace(/[^0-9]/g, '');
    if (!raw || raw.length < 8) {
        return await sock.sendMessage(from, { text: "❌ *Usage:* `.add 923xxxxxxxxx`" }, { quoted: msg });
    }

    const targetJid = `${raw}@s.whatsapp.net`;
    try {
        const res = await sock.groupParticipantsUpdate(from, [targetJid], 'add');
        const status = res?.[0]?.status;
        if (status === '403') {
            const code = await sock.groupInviteCode(from).catch(() => '');
            if (code) {
                await sock.sendMessage(targetJid, {
                    text: `👋 Assalam-o-Alaikum! Aapko is group mein add karne ki koshish ki gayi thi lekin aapki privacy settings ki wajah se direct add nahi ho sake. Join karne ke liye is link par click karein:\nhttps://chat.whatsapp.com/${code}`
                }).catch(() => {});
            }
            return await sock.sendMessage(from, { text: `⚠️ User @${raw} ki privacy settings ki wajah se invite link bhej diya gaya hai!`, mentions: [targetJid] }, { quoted: msg });
        }
        await sock.sendMessage(from, { text: `✅ User @${raw} group mein add ho gaya!`, mentions: [targetJid] }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Add Error:* ${e.message}` }, { quoted: msg });
    }
}

// 4. .creategroup - Create a new group
async function creategroupCommand(sock, from, msg, isOwner, args = []) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner naya group bana sakta hai!*" }, { quoted: msg });
    const name = args.join(' ').trim();
    if (!name) return await sock.sendMessage(from, { text: "❌ *Usage:* `.creategroup <Group Name>`" }, { quoted: msg });

    try {
        const me = sock.user?.id ? cleanJid(sock.user.id) : '';
        const group = await sock.groupCreate(name, [me]);
        const invite = await sock.groupInviteCode(group.id).catch(() => '');
        await sock.sendMessage(from, {
            text: `╭━━━〔 👥 *GROUP CREATED* 〕━━━┈⊷\n┃ 🏷️ *Name:* ${name}\n┃ 🆔 \`${group.id}\`\n┃ 🔗 https://chat.whatsapp.com/${invite}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 5. .del / .delete - Delete replied message for everyone
async function delCommand(sock, from, msg, isAdmin) {
    if (from.endsWith('@g.us') && !isAdmin) {
        return await sock.sendMessage(from, { text: "❌ *Sirf Group Admins aur Owner doosron ke messages delete kar sakte hain!*" }, { quoted: msg });
    }

    const context = msg.message?.extendedTextMessage?.contextInfo;
    const stanzaId = context?.stanzaId;
    const participant = context?.participant;

    if (!stanzaId) {
        return await sock.sendMessage(from, { text: "❌ *Jis message ko delete karna hai usko reply karke .del likhein!*" }, { quoted: msg });
    }

    const botPhone = (sock.user?.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const botLid = (sock.user?.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const partDigits = participant ? participant.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
    const isFromMe = (botPhone && partDigits === botPhone) || (botLid && partDigits === botLid);

    try {
        const key = {
            remoteJid: from,
            fromMe: isFromMe,
            id: stanzaId,
            ...(from.endsWith('@g.us') && participant ? { participant } : {})
        };
        await sock.sendMessage(from, { delete: key });
        // Clean up the .del command message as well
        await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
    } catch (e) {
        console.error('[delCommand Error]:', e.message);
        await sock.sendMessage(from, { text: `❌ *Delete Error:* ${e.message}` }, { quoted: msg });
    }
}

// 6. .demote - Demote an admin
async function demoteSingleCommand(sock, from, msg, isAdmin, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin demote kar sakta hai!*" }, { quoted: msg });

    const target = getTargetUser(msg, args);
    if (!target) return await sock.sendMessage(from, { text: "❌ *User ko tag karein ya uske message ko reply karein!*" }, { quoted: msg });

    try {
        await sock.groupParticipantsUpdate(from, [target], 'demote');
        await sock.sendMessage(from, { text: `🔻 @${target.split('@')[0]} ko admin se demote kar diya gaya!`, mentions: [target] }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 7. .demoteall - Demote all admins except bot and creator
async function demoteallCommand(sock, from, msg, isOwner) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner / Group Creator ye command chala sakta hai!*" }, { quoted: msg });

    try {
        const metadata = await sock.groupMetadata(from);
        const botPhone = (sock.user?.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const botLid = (sock.user?.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const admins = metadata.participants.filter(p => {
            const isAdmin = p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin;
            if (!isAdmin) return false;
            const pIdDigits = (p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            const pLidDigits = (p.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            const isBot = (botPhone && (pIdDigits === botPhone || pLidDigits === botPhone)) ||
                          (botLid && (pIdDigits === botLid || pLidDigits === botLid));
            return !isBot;
        });

        if (!admins.length) return await sock.sendMessage(from, { text: "ℹ️ *Demote karne ke liye koi admin nahi hai!*" }, { quoted: msg });

        const jids = admins.map(a => a.id);
        await sock.groupParticipantsUpdate(from, jids, 'demote');
        await sock.sendMessage(from, { text: `🔻 *Tamam (${jids.length}) admins ko demote kar diya gaya!*` }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 8. .end - Close/mute group chat (announcement mode: only admins can message)
async function endCommand(sock, from, msg, isAdmin) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ye command use kar sakta hai!*" }, { quoted: msg });

    try {
        await sock.groupSettingUpdate(from, 'announcement');
        await sock.sendMessage(from, { text: "🔒 *Group Close Kar Diya Gaya Hai!*\n_Ab sirf Admins message bhej sakte hain._" }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 9. .gcfrwrd - Forward replied message to all or target groups
async function gcfrwrdCommand(sock, from, msg, isOwner, args = []) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner ye command use kar sakta hai!*" }, { quoted: msg });
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
        return await sock.sendMessage(from, { text: "❌ *Jis message ko forward karna hai use reply karke `.gcfrwrd` likhein!*" }, { quoted: msg });
    }

    try {
        const groups = await sock.groupFetchAllParticipating();
        const gids = Object.keys(groups || {});
        let count = 0;
        for (const gid of gids) {
            try {
                await sock.sendMessage(gid, { forward: msg.message.extendedTextMessage.contextInfo.quotedMessage });
                count++;
                await new Promise(r => setTimeout(r, 600));
            } catch {}
        }
        await sock.sendMessage(from, { text: `✅ *Message ${count}/${gids.length} groups mein forward ho gaya!*` }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Forward Error:* ${e.message}` }, { quoted: msg });
    }
}

// 10. .gcjid - Send current group JID
async function gcjidCommand(sock, from, msg) {
    if (!from.endsWith('@g.us')) {
        return await sock.sendMessage(from, { text: `🆔 *Current JID:* \`${from}\`` }, { quoted: msg });
    }
    const meta = await sock.groupMetadata(from).catch(() => ({}));
    await sock.sendMessage(from, {
        text: `╭━━━〔 👥 *GROUP JID* 〕━━━┈⊷\n┃ 🏷️ *Group:* ${meta.subject || 'Group'}\n┃ 🆔 \`${from}\`\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
}

// 11. .goodbye - Toggle goodbye message
async function goodbyeToggleCommand(sock, from, msg, isAdmin, botData, saveBotData, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ye command use kar sakta hai!*" }, { quoted: msg });

    if (!botData.welcomeGoodbye) botData.welcomeGoodbye = {};
    if (!botData.welcomeGoodbye[from]) botData.welcomeGoodbye[from] = {};

    const action = (args[0] || '').toLowerCase();
    if (action === 'on') {
        botData.welcomeGoodbye[from].goodbye = true;
        saveBotData();
        return await sock.sendMessage(from, { text: "✅ *Goodbye message ENABLE ho gaya!*" }, { quoted: msg });
    } else if (action === 'off') {
        botData.welcomeGoodbye[from].goodbye = false;
        saveBotData();
        return await sock.sendMessage(from, { text: "❌ *Goodbye message DISABLE ho gaya!*" }, { quoted: msg });
    }

    const current = botData.welcomeGoodbye[from].goodbye ? 'Enabled' : 'Disabled';
    await sock.sendMessage(from, {
        text: `╭━━━〔 👋 *GOODBYE STATUS* 〕━━━┈⊷\n┃ 📊 *Status:* ${current}\n┃ 💡 *Toggle:* \`.goodbye on\` ya \`.goodbye off\`\n┃ ✏️ *Custom Msg:* \`.setgoodbye <message>\`\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
}

// 12. .groupdesc - View current group description
async function groupdescCommand(sock, from, msg) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    try {
        const meta = await sock.groupMetadata(from);
        const desc = meta.desc || 'No description set.';
        await sock.sendMessage(from, {
            text: `╭━━━〔 📝 *GROUP DESCRIPTION* 〕━━━┈⊷\n┃ 🏷️ *Group:* ${meta.subject}\n┃\n${desc}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 13. .groupinfo - Full group metadata
async function groupinfoCommand(sock, from, msg) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    try {
        const meta = await sock.groupMetadata(from);
        const admins = meta.participants.filter(p => p.admin || p.isAdmin);
        const createdDate = meta.creation ? new Date(meta.creation * 1000).toLocaleString() : 'N/A';
        const owner = meta.owner ? `@${meta.owner.split('@')[0]}` : 'N/A';

        const text =
`╭━━━〔 👥 *GROUP INFORMATION* 〕━━━┈⊷
┃ 🏷️ *Name:* ${meta.subject}
┃ 🆔 *JID:* \`${meta.id}\`
┃ 👑 *Owner:* ${owner}
┃ 📅 *Created:* ${createdDate}
┃ 👥 *Total Members:* ${meta.participants.length}
┃ 🛡️ *Admins Count:* ${admins.length}
┃ 🔒 *Chat Mode:* ${meta.announce ? 'Only Admins Can Message' : 'Everyone Can Message'}
┃ ⚙️ *Edit Info:* ${meta.restrict ? 'Only Admins' : 'All Members'}
┃ 🚪 *Approval Mode:* ${meta.joinApprovalMode ? 'Active (Requires Admin Approval)' : 'Disabled (Direct Join)'}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

        await sock.sendMessage(from, { text, mentions: meta.owner ? [meta.owner] : [] }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 14. .grouplink - Get group invite link
async function grouplinkCommand(sock, from, msg, isAdmin) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin link nikal sakta hai!*" }, { quoted: msg });

    try {
        const code = await sock.groupInviteCode(from);
        await sock.sendMessage(from, {
            text: `╭━━━〔 🔗 *GROUP INVITE LINK* 〕━━━┈⊷\n┃ 👉 https://chat.whatsapp.com/${code}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: "❌ *Link lene ke liye bot ka Group Admin hona zaroori hai!*" }, { quoted: msg });
    }
}

// 15. .join - Join group via link
async function joinCommand(sock, from, msg, isOwner, args = []) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner ye command use kar sakta hai!*" }, { quoted: msg });
    const link = args.join(' ').trim();
    const codeMatch = link.match(/chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/);
    if (!codeMatch) return await sock.sendMessage(from, { text: "❌ *Usage:* `.join https://chat.whatsapp.com/xxxx`" }, { quoted: msg });

    try {
        const code = codeMatch[1];
        const res = await sock.groupAcceptInvite(code);
        await sock.sendMessage(from, { text: `✅ *Successfully group join kar liya!* (JID: \`${res}\`)` }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Join Failed:* ${e.message}` }, { quoted: msg });
    }
}

// 16. .joinrequest - Toggle join approval requirement
async function joinrequestCommand(sock, from, msg, isAdmin, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ye setting change kar sakta hai!*" }, { quoted: msg });

    const action = (args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(action)) {
        return await sock.sendMessage(from, { text: "❌ *Usage:* `.joinrequest on` ya `.joinrequest off`" }, { quoted: msg });
    }

    try {
        await sock.groupJoinApprovalMode(from, action);
        await sock.sendMessage(from, {
            text: `✅ *Join Approval Mode:* *${action.toUpperCase()}* kar diya gaya!`
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 17. .leave / .left / .out - Bot leaves current group
async function leaveCommand(sock, from, msg, isAllowed) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAllowed) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner ya is session ka user bot ko leave karwa sakta hai!*" }, { quoted: msg });

    try {
        await sock.sendMessage(from, { text: "👋 *Allah Hafiz! Bot is leaving the group...*" }, { quoted: msg });
        await new Promise(r => setTimeout(r, 1000));
        await sock.groupLeave(from);
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 17b. .leftall / .leaveall / .outall - Bot leaves ALL participating groups
async function leftallCommand(sock, from, msg, isAllowed) {
    if (!isAllowed) {
        return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner sabhi groups leave karwa sakta hai!*" }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

    try {
        const participating = await sock.groupFetchAllParticipating();
        const groups = Object.keys(participating || {}).filter(jid => jid.endsWith('@g.us'));

        if (!groups.length) {
            return await sock.sendMessage(from, { text: "ℹ️ Bot kisi bhi group mein shamil nahi hai." }, { quoted: msg });
        }

        await sock.sendMessage(from, { 
            text: `⚠️ *Leaving all ${groups.length} groups in progress...*` 
        }, { quoted: msg });

        let leftCount = 0;
        for (const jid of groups) {
            try {
                if (jid === from) continue; // leave current chat last
                await sock.groupLeave(jid);
                leftCount++;
                await new Promise(r => setTimeout(r, 500));
            } catch (err) {
                console.error(`[LeftAll Error on ${jid}]:`, err.message);
            }
        }

        if (groups.includes(from)) {
            try {
                await sock.sendMessage(from, { text: `👋 *Left ${leftCount} other groups. Leaving this group now. Allah Hafiz!*` });
                await new Promise(r => setTimeout(r, 1000));
                await sock.groupLeave(from);
                leftCount++;
            } catch (_) {}
        } else {
            await sock.sendMessage(from, {
                text: `╭━━━〔 🚪 *LEFT ALL GROUPS* 〕━━━┈⊷\n` +
                      `┃ ✅ *Successfully Left:* ${leftCount} / ${groups.length} groups\n` +
                      `┃ 👑 *Action by:* Bot Owner\n` +
                      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
            }, { quoted: msg });
        }
    } catch (e) {
        console.error('[LeftAll Error]:', e.message);
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 18. .listadmins - Show all admins
async function listadminsCommand(sock, from, msg) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    try {
        const meta = await sock.groupMetadata(from);
        const admins = meta.participants.filter(p => p.admin || p.isAdmin);
        let text = `╭━━━〔 👑 *GROUP ADMINS (${admins.length})* 〕━━━┈⊷\n`;
        admins.forEach((a, i) => {
            const role = a.admin === 'superadmin' ? '👑 Creator' : '⭐ Admin';
            text += `┃ ${i + 1}. @${a.id.split('@')[0]} ➜ _${role}_\n`;
        });
        text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;
        await sock.sendMessage(from, { text, mentions: admins.map(a => a.id) }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 19. .lock - Lock group settings (only admins can edit group info)
async function lockCommand(sock, from, msg, isAdmin) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin lock kar sakta hai!*" }, { quoted: msg });

    try {
        await sock.groupSettingUpdate(from, 'locked');
        await sock.sendMessage(from, { text: "🔒 *Group Settings Locked!*\n_Ab sirf admins group ki info/icon edit kar sakte hain._" }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 20. .membercount - Show total members
async function membercountCommand(sock, from, msg) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    try {
        const meta = await sock.groupMetadata(from);
        await sock.sendMessage(from, {
            text: `👥 *Total Members:* *${meta.participants.length}* members in *${meta.subject}*`
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 21. .promote - Promote single user
async function promoteSingleCommand(sock, from, msg, isAdmin, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin promote kar sakta hai!*" }, { quoted: msg });

    const target = getTargetUser(msg, args);
    if (!target) return await sock.sendMessage(from, { text: "❌ *User ko tag karein ya uske message ko reply karein!*" }, { quoted: msg });

    try {
        await sock.groupParticipantsUpdate(from, [target], 'promote');
        await sock.sendMessage(from, { text: `👑 @${target.split('@')[0]} ko Group Admin bana diya gaya!`, mentions: [target] }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 22. .promoteall - Promote all members
async function promoteallCommand(sock, from, msg, isOwner) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner ye command use kar sakta hai!*" }, { quoted: msg });

    try {
        const meta = await sock.groupMetadata(from);
        const nonAdmins = meta.participants.filter(p => !p.admin && !p.isAdmin);
        if (!nonAdmins.length) return await sock.sendMessage(from, { text: "ℹ️ *Tamam members pehle se hi admins hain!*" }, { quoted: msg });

        const jids = nonAdmins.map(p => p.id);
        await sock.groupParticipantsUpdate(from, jids, 'promote');
        await sock.sendMessage(from, { text: `👑 *Tamam (${jids.length}) members ko admin bana diya gaya!*` }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 23. .r - React or quick reply
async function rCommand(sock, from, msg, args = []) {
    const emojis = ['❤️', '🔥', '⚡', '✨', '👑', '💯', '👏', '😂', '😎'];
    const emoji = args[0] || emojis[Math.floor(Math.random() * emojis.length)];
    const targetKey = msg.message?.extendedTextMessage?.contextInfo?.stanzaId ? {
        remoteJid: from,
        id: msg.message.extendedTextMessage.contextInfo.stanzaId
    } : msg.key;

    await sock.sendMessage(from, { react: { text: emoji, key: targetKey } }).catch(() => {});
}

// 24. .randommember - Pick random member
async function randommemberCommand(sock, from, msg) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    try {
        const meta = await sock.groupMetadata(from);
        const members = meta.participants || [];
        if (!members.length) return;
        const random = members[Math.floor(Math.random() * members.length)];
        await sock.sendMessage(from, {
            text: `🎲 *Lucky Member Selected:* @${random.id.split('@')[0]}!`,
            mentions: [random.id]
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 25. .reject - Reject pending request
async function rejectCommand(sock, from, msg, isAdmin, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin reject kar sakta hai!*" }, { quoted: msg });

    try {
        const requests = await sock.groupRequestParticipantsList(from).catch(() => []);
        if (!requests || requests.length === 0) {
            return await sock.sendMessage(from, { text: "ℹ️ *Koi pending request nahi hai!*" }, { quoted: msg });
        }

        const target = getTargetUser(msg, args);
        let targetJid = null;
        if (target) {
            const found = requests.find(r => r.jid.includes(target.split('@')[0]));
            if (found) targetJid = found.jid;
        }
        if (!targetJid) targetJid = requests[0].jid;

        await sock.groupRequestParticipantsUpdate(from, [targetJid], 'reject');
        await sock.sendMessage(from, {
            text: `❌ *Join request reject kar di gayi:* @${targetJid.split('@')[0]}`,
            mentions: [targetJid]
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 26. .rejectall - Reject all requests
async function rejectallCommand(sock, from, msg, isAdmin) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin reject kar sakta hai!*" }, { quoted: msg });

    try {
        const requests = await sock.groupRequestParticipantsList(from).catch(() => []);
        if (!requests || requests.length === 0) {
            return await sock.sendMessage(from, { text: "ℹ️ *Koi pending request nahi hai!*" }, { quoted: msg });
        }

        const jids = requests.map(r => r.jid);
        await sock.groupRequestParticipantsUpdate(from, jids, 'reject');
        await sock.sendMessage(from, {
            text: `❌ *Tamam (${jids.length}) pending join requests reject kar di gayin!*`
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 27. .requests - List pending requests
async function requestsCommand(sock, from, msg, isAdmin) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin dekh sakta hai!*" }, { quoted: msg });

    try {
        const requests = await sock.groupRequestParticipantsList(from).catch(() => []);
        if (!requests || requests.length === 0) {
            return await sock.sendMessage(from, { text: "ℹ️ *Is group mein koi pending join request nahi hai!*" }, { quoted: msg });
        }

        let text = `╭━━━〔 📥 *PENDING REQUESTS (${requests.length})* 〕━━━┈⊷\n`;
        requests.forEach((r, idx) => {
            text += `┃ ${idx + 1}. @${r.jid.split('@')[0]}\n`;
        });
        text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n💡 *.acceptall* ya *.rejectall* se approve/reject karein!`;
        await sock.sendMessage(from, { text, mentions: requests.map(r => r.jid) }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 28. .revokelink - Reset invite link
async function revokelinkCommand(sock, from, msg, isAdmin) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin link revoke kar sakta hai!*" }, { quoted: msg });

    try {
        const newCode = await sock.groupRevokeInvite(from);
        await sock.sendMessage(from, {
            text: `✅ *Group Link Revoke Ho Gaya! Naya Link:*\nhttps://chat.whatsapp.com/${newCode}`
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 29. .rtest - Test reaction speed
async function rtestCommand(sock, from, msg) {
    const start = Date.now();
    await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});
    const diff = Date.now() - start;
    await sock.sendMessage(from, { text: `⚡ *Reaction Speed:* ${diff}ms` }, { quoted: msg });
}

// 30. .setgdesc - Set group description
async function setgdescCommand(sock, from, msg, isAdmin, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin description change kar sakta hai!*" }, { quoted: msg });

    const desc = args.join(' ').trim();
    if (!desc) return await sock.sendMessage(from, { text: "❌ *Usage:* `.setgdesc <New Description>`" }, { quoted: msg });

    try {
        await sock.groupUpdateDescription(from, desc);
        await sock.sendMessage(from, { text: "✅ *Group Description successfully update ho gaya!*" }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 31. .setgname - Set group name
async function setgnameCommand(sock, from, msg, isAdmin, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin group name change kar sakta hai!*" }, { quoted: msg });

    const name = args.join(' ').trim();
    if (!name) return await sock.sendMessage(from, { text: "❌ *Usage:* `.setgname <New Name>`" }, { quoted: msg });

    try {
        await sock.groupUpdateSubject(from, name);
        await sock.sendMessage(from, { text: `✅ *Group Name successfully change ho gaya:* *${name}*` }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 32. .setgoodbye - Set custom goodbye message
async function setgoodbyeCommand(sock, from, msg, isAdmin, botData, saveBotData, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ye setting change kar sakta hai!*" }, { quoted: msg });

    const text = args.join(' ').trim();
    if (!text) return await sock.sendMessage(from, { text: "❌ *Usage:* `.setgoodbye Goodbye @user from @group!`" }, { quoted: msg });

    if (!botData.welcomeGoodbye) botData.welcomeGoodbye = {};
    if (!botData.welcomeGoodbye[from]) botData.welcomeGoodbye[from] = {};
    botData.welcomeGoodbye[from].goodbyeText = text;
    botData.welcomeGoodbye[from].goodbye = true;
    saveBotData();

    await sock.sendMessage(from, { text: `✅ *Custom Goodbye message save ho gaya!*\n\n"${text}"` }, { quoted: msg });
}

// 33. .setwelcome - Set custom welcome message
async function setwelcomeCommand(sock, from, msg, isAdmin, botData, saveBotData, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ye setting change kar sakta hai!*" }, { quoted: msg });

    const text = args.join(' ').trim();
    if (!text) return await sock.sendMessage(from, { text: "❌ *Usage:* `.setwelcome Welcome @user to @group!`" }, { quoted: msg });

    if (!botData.welcomeGoodbye) botData.welcomeGoodbye = {};
    if (!botData.welcomeGoodbye[from]) botData.welcomeGoodbye[from] = {};
    botData.welcomeGoodbye[from].welcomeText = text;
    botData.welcomeGoodbye[from].welcome = true;
    saveBotData();

    await sock.sendMessage(from, { text: `✅ *Custom Welcome message save ho gaya!*\n\n"${text}"` }, { quoted: msg });
}

// 34. .setgrouppfp - Set group profile photo by replying to an image
async function setgrouppfpCommand(sock, from, msg, isAdmin) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin icon change kar sakta hai!*" }, { quoted: msg });

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const img = quoted?.imageMessage || msg.message?.imageMessage;

    if (!img) {
        return await sock.sendMessage(from, { text: "❌ *Kisi image ko reply karein aur `.setgrouppfp` likhein!*" }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
        const stream = await downloadContentFromMessage(img, 'image');
        const buffer = await streamToBuffer(stream);
        await sock.updateProfilePicture(from, buffer);
        await sock.sendMessage(from, { text: "✅ *Group icon successfully update ho gaya!*" }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 35. .tagadmins - Tag all admins
async function tagadminsCommand(sock, from, msg, isAdmin, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin tagadmins use kar sakta hai!*" }, { quoted: msg });

    try {
        const meta = await sock.groupMetadata(from);
        const admins = meta.participants.filter(p => p.admin || p.isAdmin);
        const customMsg = args.join(' ').trim() || 'Attention Admins!';

        let text = `╭━━━〔 👑 *ATTENTION ADMINS* 〕━━━┈⊷\n┃ 💬 *Message:* ${customMsg}\n┃\n`;
        admins.forEach(a => {
            text += `┃ ➣ @${a.id.split('@')[0]}\n`;
        });
        text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

        await sock.sendMessage(from, { text, mentions: admins.map(a => a.id) });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 36. .unlock - Unlock group settings (all members can edit group info)
async function unlockCommand(sock, from, msg, isAdmin) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin unlock kar sakta hai!*" }, { quoted: msg });

    try {
        await sock.groupSettingUpdate(from, 'unlocked');
        await sock.sendMessage(from, { text: "🔓 *Group Settings Unlocked!*\n_Ab tamam members group ki info/icon edit kar sakte hain._" }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
    }
}

// 37. .welcome - Toggle welcome message
async function welcomeToggleCommand(sock, from, msg, isAdmin, botData, saveBotData, args = []) {
    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
    if (!isAdmin) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ye setting change kar sakta hai!*" }, { quoted: msg });

    if (!botData.welcomeGoodbye) botData.welcomeGoodbye = {};
    if (!botData.welcomeGoodbye[from]) botData.welcomeGoodbye[from] = {};

    const action = (args[0] || '').toLowerCase();
    if (action === 'on') {
        botData.welcomeGoodbye[from].welcome = true;
        saveBotData();
        return await sock.sendMessage(from, { text: "✅ *Welcome message ENABLE ho gaya!*" }, { quoted: msg });
    } else if (action === 'off') {
        botData.welcomeGoodbye[from].welcome = false;
        saveBotData();
        return await sock.sendMessage(from, { text: "❌ *Welcome message DISABLE ho gaya!*" }, { quoted: msg });
    }

    const current = botData.welcomeGoodbye[from].welcome ? 'Enabled' : 'Disabled';
    await sock.sendMessage(from, {
        text: `╭━━━〔 🎉 *WELCOME STATUS* 〕━━━┈⊷\n┃ 📊 *Status:* ${current}\n┃ 💡 *Toggle:* \`.welcome on\` ya \`.welcome off\`\n┃ ✏️ *Custom Msg:* \`.setwelcome <message>\`\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
}

module.exports = {
    acceptCommand,
    acceptallCommand,
    addCommand,
    creategroupCommand,
    delCommand,
    demoteSingleCommand,
    demoteallCommand,
    endCommand,
    gcfrwrdCommand,
    gcjidCommand,
    goodbyeToggleCommand,
    groupdescCommand,
    groupinfoCommand,
    grouplinkCommand,
    joinCommand,
    joinrequestCommand,
    leaveCommand,
    leftallCommand,
    listadminsCommand,
    lockCommand,
    membercountCommand,
    promoteSingleCommand,
    promoteallCommand,
    rCommand,
    randommemberCommand,
    rejectCommand,
    rejectallCommand,
    requestsCommand,
    revokelinkCommand,
    rtestCommand,
    setgdescCommand,
    setgnameCommand,
    setgoodbyeCommand,
    setgrouppfpCommand,
    setwelcomeCommand,
    tagadminsCommand,
    unlockCommand,
    welcomeToggleCommand
};
