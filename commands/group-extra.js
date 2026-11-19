// commands/group-extra.js
// Warn, Mute, Welcome/Goodbye, Promote/Demote, Group Settings, Antispam, AntiAdmin, AdminInform
const settings = require('../settings');
const ownerManager = require('../utils/ownerManager');

// Deduplication map to prevent double-firing of participant updates (stub vs listener)
const recentParticipantEvents = new Map();
function isDuplicateParticipantEvent(from, action, participants) {
    const key = `${from}:${action}:${(participants || []).slice().sort().join(',')}`;
    const now = Date.now();
    const last = recentParticipantEvents.get(key);
    if (last && (now - last) < 4000) {
        return true;
    }
    recentParticipantEvents.set(key, now);
    if (recentParticipantEvents.size > 200) {
        for (const [k, v] of recentParticipantEvents.entries()) {
            if (now - v > 10000) recentParticipantEvents.delete(k);
        }
    }
    return false;
}

function normalizeJid(jid) {
    if (!jid) return null;
    const str = String(jid).trim();
    if (!str) return null;
    if (str.includes('@s.whatsapp.net') || str.includes('@lid') || str.includes('@g.us')) {
        const parts = str.split('@');
        const user = parts[0].split(':')[0];
        return `${user}@${parts[1]}`;
    }
    const digits = str.replace(/[^0-9]/g, '');
    if (digits.length >= 7) {
        return `${digits}@s.whatsapp.net`;
    }
    return null;
}

function getTarget(msg, args) {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    return mentioned || quoted || null;
}

// ---------- WARN ----------
async function warnCommand(sock, from, msg, isAdmin, botData, saveBotData) {
    if (!isAdmin || !from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ Only admin can use this command in groups." }, { quoted: msg });
    const target = getTarget(msg);
    if (!target) return await sock.sendMessage(from, { text: "❌ Reply to or tag the user you want to warn." }, { quoted: msg });

    if (!botData.warnings) botData.warnings = {};
    if (!botData.warnings[from]) botData.warnings[from] = {};
    botData.warnings[from][target] = (botData.warnings[from][target] || 0) + 1;
    const count = botData.warnings[from][target];
    saveBotData();

    if (count >= 3) {
        try {
            await sock.sendMessage(from, { text: `⚠️ @${target.split('@')[0]} reached 3 warnings. Removing...`, mentions: [target] }, { quoted: msg });
            await sock.groupParticipantsUpdate(from, [target], "remove");
            botData.warnings[from][target] = 0;
            saveBotData();
        } catch (e) {
            await sock.sendMessage(from, { text: "❌ Reached 3 warnings but I couldn't remove (need admin)." }, { quoted: msg });
        }
    } else {
        await sock.sendMessage(from, { text: `⚠️ @${target.split('@')[0]} warned (${count}/3)`, mentions: [target] }, { quoted: msg });
    }
}

async function unwarnCommand(sock, from, msg, isAdmin, botData, saveBotData) {
    if (!isAdmin || !from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ Only admin can use this command in groups." }, { quoted: msg });
    const target = getTarget(msg);
    if (!target) return await sock.sendMessage(from, { text: "❌ Reply to or tag the user." }, { quoted: msg });

    if (!botData.warnings || !botData.warnings[from] || !botData.warnings[from][target]) {
        return await sock.sendMessage(from, { text: "ℹ️ This user has no warnings." }, { quoted: msg });
    }
    botData.warnings[from][target] = Math.max(0, botData.warnings[from][target] - 1);
    saveBotData();
    await sock.sendMessage(from, { text: `✅ Warning removed. Now: ${botData.warnings[from][target]}/3`, mentions: [target] }, { quoted: msg });
}

// ---------- MUTE / CLOSE GROUP ----------
async function muteCommand(sock, from, msg, isAdmin, botData, saveBotData) {
    if (!isAdmin || !from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ye command use kar sakta hai!*" }, { quoted: msg });
    const target = getTarget(msg);
    if (!target) {
        // Group mute / Close group (admin only)
        try {
            await sock.groupSettingUpdate(from, 'announcement');
            return await sock.sendMessage(from, { 
                text: "🔒 *Group Close / Mute Kar Diya Gaya Hai!*\n\n_Ab sirf Group Admins hi messages send kar sakte hain._\n_Dobara open karne ke liye *.open* ya *.unmute* likhein._" 
            }, { quoted: msg });
        } catch (e) {
            return await sock.sendMessage(from, { text: `❌ Group mute karne ke liye Bot ka Group Admin hona zaroori hai!` }, { quoted: msg });
        }
    }

    if (!botData.mutedUsers) botData.mutedUsers = {};
    if (!botData.mutedUsers[from]) botData.mutedUsers[from] = {};
    botData.mutedUsers[from][target] = true;
    saveBotData();
    await sock.sendMessage(from, { text: `🔇 @${target.split('@')[0]} has been muted in this group.`, mentions: [target] }, { quoted: msg });
}

// ---------- UNMUTE / OPEN GROUP ----------
async function unmuteCommand(sock, from, msg, isAdmin, botData, saveBotData) {
    if (!isAdmin || !from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ye command use kar sakta hai!*" }, { quoted: msg });
    const target = getTarget(msg);
    if (!target) {
        // Group unmute / Open group (all members can send)
        try {
            await sock.groupSettingUpdate(from, 'not_announcement');
            return await sock.sendMessage(from, { 
                text: "🔓 *Group Open / Unmute Kar Diya Gaya Hai!*\n\n_Ab sabhi members messages send kar sakte hain._\n_Admins only karne ke liye *.close* ya *.mute* likhein._" 
            }, { quoted: msg });
        } catch (e) {
            return await sock.sendMessage(from, { text: `❌ Group unmute karne ke liye Bot ka Group Admin hona zaroori hai!` }, { quoted: msg });
        }
    }

    if (botData.mutedUsers?.[from]) {
        delete botData.mutedUsers[from][target];
        saveBotData();
    }
    await sock.sendMessage(from, { text: `🔊 @${target.split('@')[0]} has been unmuted.`, mentions: [target] }, { quoted: msg });
}

// Called from index.js main message loop to enforce mute
async function handleMuteCheck(sock, from, sender, msg, botData) {
    if (!from.endsWith('@g.us')) return false;
    if (botData.mutedUsers?.[from]?.[sender]) {
        try { await sock.sendMessage(from, { delete: msg.key }); } catch (e) {}
        return true;
    }
    return false;
}

// ---------- WELCOME / GOODBYE ----------
const { generateWelcomeCard, fetchUserPfpBuffer } = require('../utils/welcomeCard');

// Prevent duplicate welcome/goodbye card bursts when multiple events arrive simultaneously
const recentWelcomeCache = new Map();

async function welcomeCommand(sock, from, msg, isAdmin, botData, saveBotData, args) {
    if (!isAdmin || !from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ Only admin can use this command in groups." }, { quoted: msg });
    if (!botData.welcomeGoodbye) botData.welcomeGoodbye = {};
    if (!botData.welcomeGoodbye[from]) botData.welcomeGoodbye[from] = {};

    const rawArgs = (args || []).map(a => String(a).toLowerCase());
    const wantsTest = rawArgs.includes('test') || rawArgs[0] === 'test';
    const wantsOn = rawArgs.includes('on') || rawArgs[0] === 'on';
    const wantsOff = rawArgs.includes('off') || rawArgs[0] === 'off';
    const wantsSet = rawArgs[0] === 'set';

    if (wantsOff && !wantsTest) {
        botData.welcomeGoodbye[from].welcome = false;
        saveBotData();
        return await sock.sendMessage(from, { text: "❌ *Welcome messages disabled!*" }, { quoted: msg });
    }

    if (wantsOn) {
        botData.welcomeGoodbye[from].welcome = true;
        saveBotData();
        if (!wantsTest) {
            return await sock.sendMessage(from, { 
                text: "✅ *Glowing Welcome Card enabled!*\n\nNaye members join hone par unki WhatsApp DP ke sath stylish Glowing Card auto-send hoga.\n💡 *Test karne ke liye type karein:* `.welcome test`" 
            }, { quoted: msg });
        }
    }

    if (wantsTest) {
        // Send a live test welcome card to the group immediately
        await sock.sendMessage(from, { react: { text: '✨', key: msg.key } }).catch(() => {});
        try {
            const isMe = msg.key?.fromMe;
            let senderJid = msg.key?.participant || msg.participant;
            if (!senderJid || isMe) {
                senderJid = sock.user?.id ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : (msg.key?.participant || msg.participant || from);
            }
            if (senderJid && senderJid.endsWith('@g.us')) {
                senderJid = sock.user?.id ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : senderJid;
            }

            let rawNumber = String(senderJid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            let phoneJid = `${rawNumber}@s.whatsapp.net`;
            let lidJid = senderJid.endsWith('@lid') ? senderJid : null;

            // Fast group metadata query with 3s fallback
            let memberCount = 1;
            let groupSubject = 'Our Group';
            let gmeta = null;
            try {
                const metaPromise = sock.groupMetadata(from);
                const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 3000));
                gmeta = await Promise.race([metaPromise, timeoutPromise]);
                if (gmeta) {
                    memberCount = (gmeta.participants || []).length || 1;
                    groupSubject = gmeta.subject || groupSubject;

                    // Match sender in participants to resolve LID <-> Phone
                    const part = gmeta.participants.find(p => 
                        (p.id && (p.id === senderJid || p.id.split('@')[0].split(':')[0] === rawNumber)) ||
                        (p.lid && (p.lid === senderJid || p.lid.split('@')[0].split(':')[0] === rawNumber))
                    );
                    if (part) {
                        if (part.id) {
                            phoneJid = part.id.split('@')[0].split(':')[0] + '@s.whatsapp.net';
                            rawNumber = phoneJid.split('@')[0].replace(/[^0-9]/g, '');
                        }
                        if (part.lid) {
                            lidJid = part.lid.split('@')[0].split(':')[0] + '@lid';
                        }
                    }
                }
            } catch {}

            const targetCandidates = [phoneJid, lidJid, senderJid].filter(Boolean);
            const avatarBuffer = await fetchUserPfpBuffer(sock, targetCandidates);
            const cardBuffer = await generateWelcomeCard(avatarBuffer, {
                type: 'WELCOME',
                memberNumber: memberCount,
                groupName: groupSubject
            });

            const userTag = `@${rawNumber}`;
            const caption =
`╔════════════════════════════════╗
  ✨ 𝓦𝓔𝓛𝓒𝓞𝓜𝓔 ✨
╚════════════════════════════════╝

👋 *Assalam-o-Alaikum* ${userTag}!
🎉 Welcome to *${groupSubject}*!

👥 *Member:* #${memberCount}
📜 *Rules:* Follow the group rules and have fun!

⚡ *Powered by MR SAQIB MD*`;

            const mentionJids = [...new Set([phoneJid, senderJid, cleanJid = `${rawNumber}@s.whatsapp.net`])].filter(Boolean);

            await sock.sendMessage(from, {
                image: cardBuffer,
                caption: caption,
                mentions: mentionJids
            }, { quoted: msg });

        } catch (err) {
            console.error('[Test Welcome Error]:', err);
            await sock.sendMessage(from, { text: `❌ Test welcome failed: ${err.message}` }, { quoted: msg });
        }
    } else if (wantsSet) {
        const customMsg = args.slice(1).join(' ');
        if (!customMsg) return await sock.sendMessage(from, { text: "❌ Usage: .welcome set <message> (use {user} for mention, {group} for group name)" }, { quoted: msg });
        botData.welcomeGoodbye[from].welcomeMsg = customMsg;
        saveBotData();
        await sock.sendMessage(from, { text: "✅ Custom welcome message set!" }, { quoted: msg });
    } else if (!wantsOn && !wantsOff) {
        const status = botData.welcomeGoodbye[from]?.welcome ? "🟢 ENABLED" : "🔴 DISABLED";
        await sock.sendMessage(from, { 
            text: 
`╭━━━〔 ⚡ *WELCOME SYSTEM* ⚡ 〕━━━┈⊷
┃ 📊 *Current Status:* ${status}
┃
┃ 📸 *Commands:*
┃ 👉 *.welcome on*    — Enable Stylish DP Welcome Card
┃ 👉 *.welcome off*   — Disable Welcome
┃ 👉 *.welcome test*  — Test Card Right Now!
┃ 👉 *.welcome set <text>* — Custom text
┃
┃ ✨ *Features:*
┃ ✦ Member ki actual profile picture automatically circular frame mein aayegi!
┃ ✦ Glowing neon ring & Member # count!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }
}

async function goodbyeCommand(sock, from, msg, isAdmin, botData, saveBotData, args) {
    if (!isAdmin || !from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ Only admin can use this command in groups." }, { quoted: msg });
    if (!botData.welcomeGoodbye) botData.welcomeGoodbye = {};
    if (!botData.welcomeGoodbye[from]) botData.welcomeGoodbye[from] = {};

    const rawArgs = (args || []).map(a => String(a).toLowerCase());
    const wantsTest = rawArgs.includes('test') || rawArgs[0] === 'test';
    const wantsOn = rawArgs.includes('on') || rawArgs[0] === 'on';
    const wantsOff = rawArgs.includes('off') || rawArgs[0] === 'off';
    const wantsSet = rawArgs[0] === 'set';

    if (wantsOff && !wantsTest) {
        botData.welcomeGoodbye[from].goodbye = false;
        saveBotData();
        return await sock.sendMessage(from, { text: "❌ *Goodbye messages disabled!*" }, { quoted: msg });
    }

    if (wantsOn) {
        botData.welcomeGoodbye[from].goodbye = true;
        saveBotData();
        if (!wantsTest) {
            return await sock.sendMessage(from, { text: "✅ *Glowing Goodbye Card enabled!*" }, { quoted: msg });
        }
    }

    if (wantsTest) {
        await sock.sendMessage(from, { react: { text: '🥀', key: msg.key } }).catch(() => {});
        try {
            let senderJid = msg.key.participant || msg.participant || (msg.key.fromMe ? sock?.user?.id : '') || msg.key.remoteJid || '';
            let rawNumber = String(senderJid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            let phoneJid = rawNumber ? `${rawNumber}@s.whatsapp.net` : '';
            let lidJid = '';
            if (String(senderJid).endsWith('@lid')) {
                lidJid = String(senderJid).split(':')[0] + '@lid';
            }

            let memberCount = 1;
            let groupSubject = 'Our Group';
            try {
                const metaPromise = sock.groupMetadata(from);
                const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 2500));
                const gmeta = await Promise.race([metaPromise, timeoutPromise]);
                if (gmeta) {
                    memberCount = (gmeta.participants || []).length || 1;
                    groupSubject = gmeta.subject || groupSubject;

                    // Match participant to resolve phone JID & LID
                    const part = (gmeta.participants || []).find(p => 
                        p.id === senderJid || 
                        p.lid === senderJid ||
                        p.id?.startsWith(rawNumber) ||
                        p.lid?.startsWith(rawNumber)
                    );
                    if (part) {
                        if (part.id) {
                            phoneJid = part.id.split('@')[0].split(':')[0] + '@s.whatsapp.net';
                            rawNumber = phoneJid.split('@')[0].replace(/[^0-9]/g, '');
                        }
                        if (part.lid) {
                            lidJid = part.lid.split('@')[0].split(':')[0] + '@lid';
                        }
                    }
                }
            } catch {}

            const targetCandidates = [phoneJid, lidJid, senderJid].filter(Boolean);
            const avatarBuffer = await fetchUserPfpBuffer(sock, targetCandidates);
            const cardBuffer = await generateWelcomeCard(avatarBuffer, {
                type: 'GOODBYE',
                memberNumber: memberCount,
                groupName: groupSubject
            });

            const userTag = `@${rawNumber}`;
            const caption =
`╔════════════════════════════════╗
  🥀 𝓖𝓞𝓞𝓓𝓑𝓨𝓔 🥀
╚════════════════════════════════╝

👋 *Goodbye* ${userTag}!
We will miss you in *${groupSubject}*!

⚡ *Powered by MR SAQIB MD*`;

            const mentionJids = [...new Set([phoneJid, lidJid, senderJid])].filter(Boolean);

            await sock.sendMessage(from, {
                image: cardBuffer,
                caption: caption,
                mentions: mentionJids
            }, { quoted: msg });

        } catch (err) {
            console.error('[Test Goodbye Error]:', err);
            await sock.sendMessage(from, { text: `❌ Test goodbye failed: ${err.message}` }, { quoted: msg });
        }
    } else if (wantsSet) {
        const customMsg = args.slice(1).join(' ');
        if (!customMsg) return await sock.sendMessage(from, { text: "❌ Usage: .goodbye set <message> (use {user} for mention)" }, { quoted: msg });
        botData.welcomeGoodbye[from].goodbyeMsg = customMsg;
        saveBotData();
        await sock.sendMessage(from, { text: "✅ Custom goodbye message set!" }, { quoted: msg });
    } else if (!wantsOn && !wantsOff) {
        const status = botData.welcomeGoodbye[from]?.goodbye ? "🟢 ENABLED (Auto Goodbye Active)" : "🔴 DISABLED";
        await sock.sendMessage(from, { 
            text: 
`╭━━━〔 🥀 *GOODBYE SYSTEM* 🥀 〕━━━┈⊷
┃ 📊 *Current Status:* ${status}
┃
┃ 📸 *Commands:*
┃ 👉 *.goodbye on*    — Enable Stylish DP Goodbye Card
┃ 👉 *.goodbye off*   — Disable Goodbye
┃ 👉 *.goodbye test*  — Test Card Right Now!
┃ 👉 *.goodbye set <text>* — Custom text
┃
┃ ✨ *Features:*
┃ ✦ Member ki actual profile picture automatically card mein aayegi!
┃ ✦ Auto tag & farewell message!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }
}

// Called from group-participants.update listener & messages.upsert stub events in index.js
async function handleGroupParticipantsUpdate(sock, update, botData, saveBotData) {
    try {
        const { id: from, participants, action, author } = update;
        if (!from || !from.endsWith('@g.us')) return;

        // ========== PROMOTE & DEMOTE EVENTS (Anti-Admin & Admin Inform) ==========
        if (action === 'promote' || action === 'demote') {
            // Deduplicate promote/demote events that can fire concurrently from socket listener and stub message
            if (isDuplicateParticipantEvent(from, action, participants)) return;

            const authorJid = author || '';
            const authorDigits = authorJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

            const botPhone = sock.user?.id ? sock.user.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
            const botLid = sock.user?.lid ? sock.user.lid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';

            // Group metadata
            let groupSubject = 'Our Group';
            let gmeta = null;
            try {
                const metaPromise = sock.groupMetadata(from);
                const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 6000));
                gmeta = await Promise.race([metaPromise, timeoutPromise]);
                if (gmeta && gmeta.subject) groupSubject = gmeta.subject;
            } catch (_) {}

            const rawCreatorJid = gmeta?.owner || gmeta?.subjectOwner || gmeta?.participants?.find(p => p.admin === 'superadmin')?.id || '';
            const groupCreator = rawCreatorJid ? rawCreatorJid.split('@')[0].replace(/[^0-9]/g, '') : '';
            const masterOwner = '923438673242';
            const defaultOwner = settings.ownerNumber ? settings.ownerNumber.replace(/[^0-9]/g, '') : '';

            let ownersList = [];
            try {
                const omData = ownerManager.loadOwnersData();
                ownersList = Object.keys(omData?.owners || {});
            } catch (_) {}

            const isAuthorizedPromoter = Boolean(
                (authorDigits && authorDigits === masterOwner) ||
                (authorDigits && defaultOwner && authorDigits.endsWith(defaultOwner)) ||
                (authorDigits && (authorDigits === botPhone || authorDigits === botLid)) ||
                (authorDigits && groupCreator && authorDigits === groupCreator) ||
                (authorDigits && ownersList.includes(authorDigits))
            );

            const timeStr = new Date().toLocaleString('en-PK', {
                timeZone: 'Asia/Karachi',
                dateStyle: 'medium',
                timeStyle: 'medium'
            });

            const channelBadge = {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: settings.newsletterJid || '120363431913895899@newsletter',
                    newsletterName: settings.channelName || 'Mr SAQIB',
                    serverMessageId: -1
                }
            };

            // ========== ACTION: PROMOTE ==========
            if (action === 'promote') {
                const isAntiAdminActive = Boolean(botData.antiAdminGroups?.[from]);

                // Check Anti-Admin Trigger: unauthorized promote
                if (isAntiAdminActive && !isAuthorizedPromoter && authorJid) {
                    console.log(`[AntiAdmin Triggered] Group: ${from} | Unauthorized promote by: ${authorJid}`);

                    // 1. Demote newly promoted members
                    for (const p of participants) {
                        try {
                            await sock.groupParticipantsUpdate(from, [p], 'demote').catch(() => {});
                        } catch (_) {}
                    }

                    // 2. Demote the rogue admin who promoted them
                    try {
                        await sock.groupParticipantsUpdate(from, [authorJid], 'demote').catch(() => {});
                    } catch (_) {}

                    // 3. Send Security Notice
                    const promotedTags = participants.map(p => {
                        const num = String(p).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        return `@${num}`;
                    }).join(', ');

                    const mentionJids = [authorJid, ...participants].filter(Boolean);

                    const alertText = 
`╭━━━〔 🛡️ *ANTI-ADMIN PROTECTION TRIGGERED* 〕━━━┈⊷
┃ 🚨 *UNAUTHORIZED PROMOTION DETECTED & BLOCKED!*
┃
┃ 🚫 *Admin Jisne Banaya:* @${authorDigits}
┃    └ *Action:* Admin Se Hata Diya Gaya (Demoted ❌)
┃
┃ 👤 *Naya Banne Wala:* ${promotedTags}
┃    └ *Action:* Admin Se Hata Diya Gaya (Demoted ❌)
┃
┃ ⚠️ *Warning:* Is group me sirf Bot Owner / Creator
┃    ko naya Admin banane ki ijazat hai!
┃ ⏰ *Time:* ${timeStr}
┃ 🏷️ *Group:* ${groupSubject}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ*`;

                    await sock.sendMessage(from, {
                        text: alertText,
                        mentions: mentionJids,
                        contextInfo: { ...channelBadge, mentions: mentionJids }
                    }).catch(() => {});

                    return; // Prevent standard promote notification
                }

                // Normal Promote Notification (Admin Inform)
                const isAdminInformActive = botData.adminInformGroups?.[from] !== false; // Default ON
                if (isAdminInformActive) {
                    for (const p of participants) {
                        const targetNum = String(p).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        const targetTag = `@${targetNum}`;
                        const authorTag = authorDigits ? `@${authorDigits}` : 'Group Admin';
                        const targetJid = normalizeJid(p) || (targetNum ? `${targetNum}@s.whatsapp.net` : null);
                        const normAuthorJid = normalizeJid(authorJid) || (authorDigits ? `${authorDigits}@s.whatsapp.net` : null);
                        const mentionJids = [normAuthorJid, targetJid].filter(Boolean);

                        const text = 
`╭━━━〔 👑 *ADMIN PROMOTION ALERT* 〕━━━┈⊷
┃ 🎖️ *New Admin:* ${targetTag}
┃ 📱 *Number:* +${targetNum}
┃ 👑 *Promoted By:* ${authorTag}
┃ ⏰ *Time:* ${timeStr}
┃ 🏷️ *Group:* ${groupSubject}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ*`;

                        await sock.sendMessage(from, {
                            text,
                            mentions: mentionJids,
                            contextInfo: { ...channelBadge, mentions: mentionJids }
                        }).catch(() => {});
                    }
                }
                return;
            }

            // ========== ACTION: DEMOTE ==========
            if (action === 'demote') {
                for (const p of participants) {
                    const targetNum = String(p).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                    const isBotDemoted = (targetNum === botPhone || targetNum === botLid || (sock.user?.id && p === sock.user.id));

                    const authorTag = authorDigits ? `@${authorDigits}` : 'Admin';
                    const targetJid = normalizeJid(p) || (targetNum ? `${targetNum}@s.whatsapp.net` : null);
                    const normAuthorJid = normalizeJid(authorJid) || (authorDigits ? `${authorDigits}@s.whatsapp.net` : null);
                    const mentionJids = [normAuthorJid, targetJid].filter(Boolean);

                    if (isBotDemoted) {
                        // Special Bot Demote Self-Defense Notice
                        const angryText = 
`╭━━━〔 🚨 *BOT DEMOTED ALERT!* 🚨 〕━━━┈⊷
┃ ⚠️ *ATTENTION ALL MEMBERS & ADMINS!*
┃
┃ 😠 ${authorTag} *Aapne mujhe Admin se kyun hataya?!*
┃
┃ 🛡️ *Bot ke baghair Group Security (Anti-Link,*
┃    *Anti-Spam, Auto-Delete, Auto-Protect)*
┃    *kaam nahi karegi!*
┃
┃ ⚡ *Fauran mujhe dobara Admin banayein taake*
┃    *group mehfooz rahe!*
┃
┃ 👤 *Demoted By:* ${authorTag}
┃ ⏰ *Time:* ${timeStr}
┃ 🏷️ *Group:* ${groupSubject}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ*`;

                        await sock.sendMessage(from, {
                            text: angryText,
                            mentions: mentionJids,
                            contextInfo: { ...channelBadge, mentions: mentionJids }
                        }).catch(() => {});

                    } else {
                        // Normal Admin Demoted Notice
                        const isAdminInformActive = botData.adminInformGroups?.[from] !== false; // Default ON
                        if (isAdminInformActive) {
                            const demoteText = 
`╭━━━〔 ⚠️ *ADMIN DEMOTION ALERT* 〕━━━┈⊷
┃ 📉 *Demoted Member:* @${targetNum}
┃ 📱 *Number:* +${targetNum}
┃ 👤 *Demoted By:* ${authorTag}
┃ ⏰ *Time:* ${timeStr}
┃ 🏷️ *Group:* ${groupSubject}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ*`;

                            await sock.sendMessage(from, {
                                text: demoteText,
                                mentions: mentionJids,
                                contextInfo: { ...channelBadge, mentions: mentionJids }
                            }).catch(() => {});
                        }
                    }
                }
                return;
            }
        }

        // ========== WELCOME & GOODBYE CARDS ==========
        const cfg = botData.welcomeGoodbye?.[from];
        if (!cfg) return;

        const isAdd = ['add', 'invite', 'join'].includes(action);
        const isRemove = ['remove', 'leave'].includes(action);

        if (!isAdd && !isRemove) return;
        if (isAdd && !cfg.welcome) return;
        if (isRemove && !cfg.goodbye) return;

        let memberCount = 1;
        let groupSubject = 'Our Group';
        let gmeta = null;
        try {
            const metaPromise = sock.groupMetadata(from);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 2500));
            gmeta = await Promise.race([metaPromise, timeoutPromise]);
            if (gmeta) {
                memberCount = (gmeta.participants || []).length || 1;
                groupSubject = gmeta.subject || groupSubject;
            }
        } catch {}

        for (const p of participants) {
            const rawJid = typeof p === 'string' ? p : (p?.id || p?.jid);
            if (!rawJid) continue;

            let rawNumber = String(rawJid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            let phoneJid = `${rawNumber}@s.whatsapp.net`;
            let lidJid = rawJid.endsWith('@lid') ? rawJid : null;

            // Match member in groupMetadata to resolve Phone <-> LID
            if (gmeta && gmeta.participants) {
                const part = gmeta.participants.find(m => 
                    (m.id && (m.id === rawJid || m.id.split('@')[0].split(':')[0] === rawNumber)) ||
                    (m.lid && (m.lid === rawJid || m.lid.split('@')[0].split(':')[0] === rawNumber))
                );
                if (part) {
                    if (part.id) {
                        phoneJid = part.id.split('@')[0].split(':')[0] + '@s.whatsapp.net';
                        rawNumber = phoneJid.split('@')[0].replace(/[^0-9]/g, '');
                    }
                    if (part.lid) {
                        lidJid = part.lid.split('@')[0].split(':')[0] + '@lid';
                    }
                }
            }

            const tag = `@${rawNumber}`;
            const targetCandidates = [phoneJid, lidJid, rawJid].filter(Boolean);

            // Debounce: prevent duplicate welcome/goodbye cards to same user within 15 seconds
            const cacheKey = `${from}_${rawNumber}_${isAdd ? 'add' : 'remove'}`;
            const lastSent = recentWelcomeCache.get(cacheKey) || 0;
            if (Date.now() - lastSent < 15000) {
                continue;
            }
            recentWelcomeCache.set(cacheKey, Date.now());

            console.log(`[Welcome/Goodbye Action] Group: ${from} | Action: ${isAdd ? 'WELCOME' : 'GOODBYE'} | User: ${phoneJid} (LID: ${lidJid || 'none'})`);

            if (isAdd && cfg.welcome) {
                try {
                    const avatarBuffer = await fetchUserPfpBuffer(sock, targetCandidates);
                    const cardBuffer = await generateWelcomeCard(avatarBuffer, {
                        type: 'WELCOME',
                        memberNumber: memberCount,
                        groupName: groupSubject
                    });

                    const caption = cfg.welcomeMsg 
                        ? cfg.welcomeMsg.replace(/\{user\}/gi, tag).replace(/\{group\}/gi, groupSubject)
                        : 
`╔════════════════════════════════╗
  ✨ 𝓦𝓔𝓛𝓒𝓞𝓜𝓔 ✨
╚════════════════════════════════╝

👋 *Assalam-o-Alaikum* ${tag}!
🎉 Welcome to *${groupSubject}*!

👥 *Member:* #${memberCount}
📜 *Rules:* Follow the group rules and respect members!

⚡ *Powered by MR SAQIB MD*`;

                    const mentionJids = [...new Set([phoneJid, lidJid, rawJid])].filter(Boolean);

                    await sock.sendMessage(from, {
                        image: cardBuffer,
                        caption: caption,
                        mentions: mentionJids
                    });
                } catch (cardErr) {
                    console.error('[Welcome Card Error]:', cardErr.message);
                    const template = cfg.welcomeMsg || `👋 Welcome {user} to *${groupSubject}*!`;
                    await sock.sendMessage(from, { text: template.replace(/\{user\}/gi, tag), mentions: [phoneJid] });
                }
            } else if (isRemove && cfg.goodbye) {
                try {
                    const avatarBuffer = await fetchUserPfpBuffer(sock, targetCandidates);
                    const cardBuffer = await generateWelcomeCard(avatarBuffer, {
                        type: 'GOODBYE',
                        memberNumber: memberCount,
                        groupName: groupSubject
                    });

                    const customGoodbye = cfg.goodbyeMsg || cfg.goodbyeText;
                    const caption = customGoodbye
                        ? customGoodbye.replace(/\{user\}/gi, tag).replace(/\{group\}/gi, groupSubject)
                        :
`╔════════════════════════════════╗
  🥀 𝓖𝓞𝓞𝓓𝓑𝓨𝓔 🥀
╚════════════════════════════════╝

👋 *Goodbye* ${tag}!
We will miss you in *${groupSubject}*!

⚡ *Powered by MR SAQIB MD*`;

                    const mentionJids = [...new Set([phoneJid, lidJid, rawJid])].filter(Boolean);

                    await sock.sendMessage(from, {
                        image: cardBuffer,
                        caption: caption,
                        mentions: mentionJids
                    });
                } catch (cardErr) {
                    console.error('[Goodbye Card Error]:', cardErr.message);
                    const template = cfg.goodbyeMsg || cfg.goodbyeText || `👋 Goodbye {user}, take care!`;
                    await sock.sendMessage(from, { text: template.replace(/\{user\}/gi, tag), mentions: [phoneJid] });
                }
            }
        }
    } catch (e) {
        console.error('Welcome/Goodbye Error:', e);
    }
}

// ---------- PROMOTE / DEMOTE ----------
async function promoteCommand(sock, from, msg, isAdmin) {
    if (!isAdmin || !from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ Only admin can use this command in groups." }, { quoted: msg });
    const target = getTarget(msg);
    if (!target) return await sock.sendMessage(from, { text: "❌ Reply to or tag the user you want to promote." }, { quoted: msg });
    try {
        await sock.groupParticipantsUpdate(from, [target], "promote");
        await sock.sendMessage(from, { text: `✅ @${target.split('@')[0]} is now an admin.`, mentions: [target] }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: "❌ Failed to promote. Make sure I am an admin." }, { quoted: msg });
    }
}

async function demoteCommand(sock, from, msg, isAdmin) {
    if (!isAdmin || !from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ Only admin can use this command in groups." }, { quoted: msg });
    const target = getTarget(msg);
    if (!target) return await sock.sendMessage(from, { text: "❌ Reply to or tag the user you want to demote." }, { quoted: msg });
    try {
        await sock.groupParticipantsUpdate(from, [target], "demote");
        await sock.sendMessage(from, { text: `✅ @${target.split('@')[0]} is no longer an admin.`, mentions: [target] }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: "❌ Failed to demote. Make sure I am an admin." }, { quoted: msg });
    }
}

// ---------- GROUP SETTINGS ----------
async function groupsettingsCommand(sock, from, msg, isAdmin, botData) {
    if (!isAdmin || !from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ Only admin can use this command in groups." }, { quoted: msg });
    const on = (v) => v ? '✅' : '❌';
    const text =
        `⚙️ *Group Settings*\n\n` +
        `🔗 Antilink: ${botData.antilinkGroups?.[from] ? on(true) + ' (' + botData.antilinkGroups[from] + ')' : on(false)}\n` +
        `🛡️ Antispam: ${on(botData.antispamGroups?.[from])}\n` +
        `📛 Antistatus: ${on(botData.antiStatusGroups?.[from])}\n` +
        `👋 Welcome: ${on(botData.welcomeGoodbye?.[from]?.welcome)}\n` +
        `🚪 Goodbye: ${on(botData.welcomeGoodbye?.[from]?.goodbye)}\n` +
        `🚫 Kick-Offline: ${on(botData.kickOffline?.[from])}`;
    await sock.sendMessage(from, { text }, { quoted: msg });
}

// ---------- ANTISPAM ----------
const spamTracker = {};

async function antispamCommand(sock, from, msg, isAdmin, botData, saveBotData, args) {
    if (!isAdmin || !from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ Only admin can use this command in groups." }, { quoted: msg });
    if (!botData.antispamGroups) botData.antispamGroups = {};
    const action = args[0]?.toLowerCase();
    if (action === 'on') {
        botData.antispamGroups[from] = true;
        saveBotData();
        await sock.sendMessage(from, { text: "✅ Antispam Enabled! (max 6 messages / 10 sec)" }, { quoted: msg });
    } else if (action === 'off') {
        botData.antispamGroups[from] = false;
        saveBotData();
        await sock.sendMessage(from, { text: "❌ Antispam Disabled!" }, { quoted: msg });
    } else {
        await sock.sendMessage(from, { text: "❌ Usage: .antispam [on/off]" }, { quoted: msg });
    }
}

// Called from index.js main message loop
async function handleAntispam(sock, from, sender, msg, botData, isAdmin) {
    if (!from.endsWith('@g.us') || isAdmin || !botData.antispamGroups?.[from]) return false;
    const key = from + '_' + sender;
    const now = Date.now();
    if (!spamTracker[key]) spamTracker[key] = [];
    spamTracker[key] = spamTracker[key].filter(t => now - t < 10000);
    spamTracker[key].push(now);

    if (spamTracker[key].length > 6) {
        try {
            await sock.sendMessage(from, { delete: msg.key });
            await sock.sendMessage(from, { text: `⚠️ @${sender.split('@')[0]} please slow down (spam detected).`, mentions: [sender] });
        } catch (e) {}
        return true;
    }
    return false;
}

async function resetwarnCommand(sock, from, msg, isAdmin, botData, saveBotData) {
    if (!isAdmin || !from.endsWith('@g.us')) return await sock.sendMessage(from, { text: "❌ Only admin can use this command in groups." }, { quoted: msg });
    const target = getTarget(msg);
    if (!target) return await sock.sendMessage(from, { text: "❌ Reply to or tag the user to reset warnings." }, { quoted: msg });

    if (botData.warnings?.[from]?.[target]) {
        botData.warnings[from][target] = 0;
        saveBotData();
    }
    await sock.sendMessage(from, { text: `✅ Warnings reset to 0 for @${target.split('@')[0]}`, mentions: [target] }, { quoted: msg });
}

// Export group contacts as .vcf file
async function vcfCommand(sock, from, msg, isAdmin) {
    try {
        if (!from.endsWith('@g.us')) {
            return await sock.sendMessage(from, { text: "❌ Yeh command sirf WhatsApp groups me kaam karti hai." }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '📇', key: msg.key } }).catch(() => {});

        const metadata = await sock.groupMetadata(from);
        const participants = metadata.participants || [];

        let vcfData = '';
        participants.forEach((p, idx) => {
            const num = p.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            if (num) {
                vcfData += `BEGIN:VCARD\nVERSION:3.0\nFN:${metadata.subject || 'Group'} Member ${idx + 1}\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD\n`;
            }
        });

        const vcfBuffer = Buffer.from(vcfData, 'utf8');
        const cleanName = (metadata.subject || 'Group_Contacts').replace(/[^a-zA-Z0-9_-]/g, '_');

        await sock.sendMessage(from, {
            document: vcfBuffer,
            mimetype: 'text/vcard',
            fileName: `${cleanName}_Contacts.vcf`,
            caption: `╭━━━〔 📇 *GROUP VCF EXPORTER* 〕━━━┈⊷\n┃ 👥 *Total Contacts:* ${participants.length}\n┃ 📂 *Group:* ${metadata.subject}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n💡 *Tip:* File open karke direct contacts save karein!`
        }, { quoted: msg });

    } catch (e) {
        await sock.sendMessage(from, { text: `❌ VCF export error: ${e.message}` }, { quoted: msg });
    }
}

// Create WhatsApp interactive poll
async function pollCommand(sock, from, msg, args = []) {
    try {
        const raw = args.join(' ');
        if (!raw.includes('|')) {
            return await sock.sendMessage(from, {
                text: "❌ *Usage:* `.poll Question | Option 1 | Option 2 | Option 3`\n_Example: .poll Match kaun jeetega? | Pakistan | India_"
            }, { quoted: msg });
        }

        const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
        const question = parts[0];
        const options = parts.slice(1);

        if (options.length < 2) {
            return await sock.sendMessage(from, { text: "❌ Poll ke liye kam se kam 2 options dena zaroori hain." }, { quoted: msg });
        }

        await sock.sendMessage(from, {
            poll: {
                name: `📊 ${question}`,
                values: options.slice(0, 12),
                selectableCount: 1
            }
        });

    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Poll error: ${e.message}` }, { quoted: msg });
    }
}

// Active members / group info
async function onlineCommand(sock, from, msg) {
    try {
        if (!from.endsWith('@g.us')) {
            return await sock.sendMessage(from, { text: "❌ Sirf group me kaam karta hai." }, { quoted: msg });
        }

        const metadata = await sock.groupMetadata(from);
        const total = metadata.participants?.length || 0;
        const admins = metadata.participants?.filter(p => p.admin || p.isAdmin)?.length || 0;

        const text = 
`╭━━━〔 👥 *GROUP ACTIVE STATS* 〕━━━┈⊷
┃ 🏷️ *Group:* ${metadata.subject}
┃ 👥 *Total Members:* ${total}
┃ 👑 *Admins:* ${admins}
┃ 🛡️ *Restrict:* ${metadata.restrict ? 'Admins Only' : 'Everyone'}
┃ 💬 *Announce:* ${metadata.announce ? 'Only Admins Can Send' : 'All Members Can Send'}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;

        await sock.sendMessage(from, { text }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
}

// ---------- ANTI-ADMIN PROTECTION ----------
async function antiadminCommand(sock, from, msg, isAdmin, isOwner, botData, saveBotData, args) {
    if (!from.endsWith('@g.us')) {
        return await sock.sendMessage(from, { text: "❌ Yeh command sirf groups mein kaam karti hai." }, { quoted: msg });
    }

    // Real-time verification: check directly with WhatsApp in case user was promoted after pairing
    if (!isAdmin && !isOwner) {
        try {
            const meta = await sock.groupMetadata(from).catch(() => null);
            const senderJid = msg.key.participant || msg.participant || (msg.key.fromMe ? sock.user?.id : '') || '';
            const senderDigits = String(senderJid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            const isNowAdmin = meta?.participants?.some(p => {
                if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
                const pIdBare = String(p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                const pPnBare = String(p.phoneNumber || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                const pLidBare = String(p.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                return Boolean(senderDigits && (pIdBare === senderDigits || pPnBare === senderDigits || pLidBare === senderDigits));
            });
            if (isNowAdmin) {
                isAdmin = true;
            }
        } catch (_) {}
    }

    if (!isAdmin && !isOwner) {
        return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ya Bot Owner ye setting change kar sakta hai!*" }, { quoted: msg });
    }

    if (!botData.antiAdminGroups) botData.antiAdminGroups = {};

    const rawArgs = (args || []).map(a => String(a).toLowerCase().trim());
    const action = rawArgs[0];

    const channelBadge = {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: settings.newsletterJid || '120363431913895899@newsletter',
            newsletterName: settings.channelName || 'Mr SAQIB',
            serverMessageId: -1
        }
    };

    if (action === 'on' || action === 'enable' || action === '1') {
        botData.antiAdminGroups[from] = true;
        if (typeof saveBotData === 'function') saveBotData();

        // Check if bot itself is an admin in this group
        let isBotAdmin = false;
        try {
            const meta = await sock.groupMetadata(from).catch(() => null);
            const botPhone = (sock.user?.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            const botLid = (sock.user?.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            isBotAdmin = meta?.participants?.some(p => {
                if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
                const pIdBare = String(p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                const pPnBare = String(p.phoneNumber || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                const pLidBare = String(p.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                return Boolean(
                    (botPhone && (pIdBare === botPhone || pPnBare === botPhone)) ||
                    (botLid && (pLidBare === botLid || pIdBare === botLid))
                );
            });
        } catch (_) {}

        const botWarning = !isBotAdmin 
            ? `\n\n⚠️ *DHYAN DEIN:* Bot abhi is group mein *Admin* nahi hai!\n👉 *Anti-Admin Protection* ke unauthorized admin ko demote karne ke liye Bot ko group mein *Admin* banana zaroori hai.`
            : `\n\n🛡️ *Bot Admin Status:* Connected & Active (Bot is Admin ✅)`;

        return await sock.sendMessage(from, {
            text: 
`╭━━━〔 🛡️ *ANTI-ADMIN PROTECTION ENABLED* 〕━━━┈⊷
┃ 🟢 *Status:* ACTIVE & PROTECTED
┃
┃ 💡 *Kaise Kaam Karta Hai?*
┃ ✦ Agar koi unauthorized Admin kisi ko bhi Admin banayega,
┃   to bot foran:
┃   1. Naye banne wale ko Admin se hata dega (Demote)!
┃   2. Jis Admin ne usay banaya usay bhi hata dega (Demote)!
┃
┃ 👑 *Allowed:* Sirf Bot Owner / Group Creator ko
┃    Admin banane ki ijazat hai.
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷${botWarning}

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ*`,
            contextInfo: channelBadge
        }, { quoted: msg });
    } else if (action === 'off' || action === 'disable' || action === '0') {
        delete botData.antiAdminGroups[from];
        if (typeof saveBotData === 'function') saveBotData();
        return await sock.sendMessage(from, {
            text: 
`╭━━━〔 🛡️ *ANTI-ADMIN PROTECTION DISABLED* 〕━━━┈⊷
┃ 🔴 *Status:* INACTIVE
┃ ℹ️ Ab koi bhi admin kisi doosre member ko admin bana sakta hai.
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ*`,
            contextInfo: channelBadge
        }, { quoted: msg });
    } else {
        const isEnabled = Boolean(botData.antiAdminGroups[from]);
        return await sock.sendMessage(from, {
            text: 
`╭━━━〔 🛡️ *ANTI-ADMIN PROTECTION* 〕━━━┈⊷
┃ 📊 *Current Status:* ${isEnabled ? "🟢 ENABLED (Protected)" : "🔴 DISABLED"}
┃
┃ ⚙️ *Commands:*
┃ 👉 *.antiadmin on*   — Protection On Karein
┃ 👉 *.antiadmin off*  — Protection Off Karein
┃
┃ 💡 *Detail:*
┃ Jab Anti-Admin ON hoga aur koi admin kisi ko
┃ admin banayega to dono ko admin se hata diya jayega!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ*`,
            contextInfo: channelBadge
        }, { quoted: msg });
    }
}

// ---------- ADMIN INFORM NOTIFICATIONS ----------
async function admininformCommand(sock, from, msg, isAdmin, isOwner, botData, saveBotData, args) {
    if (!from.endsWith('@g.us')) {
        return await sock.sendMessage(from, { text: "❌ Yeh command sirf groups mein kaam karti hai." }, { quoted: msg });
    }

    // Dynamic real-time admin detection fallback (ensures newly promoted admins are recognized instantly)
    if (!isAdmin && !isOwner && sock && typeof sock.groupMetadata === 'function') {
        try {
            const meta = await sock.groupMetadata(from).catch(() => null);
            const senderJid = msg.key.participant || msg.participant || (msg.key.fromMe ? sock.user?.id : '');
            const senderDigits = String(senderJid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            const isNowAdmin = meta?.participants?.some(p => {
                if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
                const pIdBare = String(p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                const pPnBare = String(p.phoneNumber || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                const pLidBare = String(p.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                return Boolean(senderDigits && (pIdBare === senderDigits || pPnBare === senderDigits || pLidBare === senderDigits));
            });
            if (isNowAdmin) {
                isAdmin = true;
            }
        } catch (_) {}
    }

    if (!isAdmin && !isOwner) {
        return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ya Bot Owner ye setting change kar sakta hai!*" }, { quoted: msg });
    }

    if (!botData.adminInformGroups) botData.adminInformGroups = {};

    const rawArgs = (args || []).map(a => String(a).toLowerCase().trim());
    const action = rawArgs[0];

    const channelBadge = {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: settings.newsletterJid || '120363431913895899@newsletter',
            newsletterName: settings.channelName || 'Mr SAQIB',
            serverMessageId: -1
        }
    };

    if (action === 'on' || action === 'enable' || action === '1') {
        botData.adminInformGroups[from] = true;
        if (typeof saveBotData === 'function') saveBotData();
        return await sock.sendMessage(from, {
            text: 
`╭━━━〔 📢 *ADMIN INFORM NOTIFICATIONS ENABLED* 〕━━━┈⊷
┃ 🟢 *Status:* ACTIVE
┃
┃ ✦ Group me jab bhi koi Admin kisi ko Admin banayega
┃   ya kisi ko Admin se hatayega, bot time aur dono
┃   ke numbers ke sath foran alert bhejega!
┃ ✦ Agar bot ko koi admin se hatayega to bot mention
┃   karke dobara admin lagane ka boleyga!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ*`,
            contextInfo: channelBadge
        }, { quoted: msg });
    } else if (action === 'off' || action === 'disable' || action === '0') {
        botData.adminInformGroups[from] = false;
        if (typeof saveBotData === 'function') saveBotData();
        return await sock.sendMessage(from, {
            text: 
`╭━━━〔 📢 *ADMIN INFORM NOTIFICATIONS DISABLED* 〕━━━┈⊷
┃ 🔴 *Status:* DISABLED
┃ ℹ️ Promote / Demote notifications group me nahi aayengi.
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ*`,
            contextInfo: channelBadge
        }, { quoted: msg });
    } else {
        const isEnabled = botData.adminInformGroups[from] !== false; // Default ON
        return await sock.sendMessage(from, {
            text: 
`╭━━━〔 📢 *ADMIN INFORM SYSTEM* 〕━━━┈⊷
┃ 📊 *Current Status:* ${isEnabled ? "🟢 ENABLED" : "🔴 DISABLED"}
┃
┃ ⚙️ *Commands:*
┃ 👉 *.admininform on*   — Alerts On Karein
┃ 👉 *.admininform off*  — Alerts Off Karein
┃
┃ 💡 *Features:*
┃ ✦ Kisne kisko admin banaya (With Time & Tag)
┃ ✦ Kisne kisko admin se hataya (With Time & Tag)
┃ ✦ Bot ko hatane par bot ka instant angry reaction & alert!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ*`,
            contextInfo: channelBadge
        }, { quoted: msg });
    }
}

module.exports = {
    warnCommand, unwarnCommand, resetwarnCommand,
    muteCommand, unmuteCommand, handleMuteCheck,
    welcomeCommand, goodbyeCommand, handleGroupParticipantsUpdate,
    promoteCommand, demoteCommand,
    groupsettingsCommand,
    antispamCommand, handleAntispam,
    vcfCommand, pollCommand, onlineCommand,
    antiadminCommand, admininformCommand
};
