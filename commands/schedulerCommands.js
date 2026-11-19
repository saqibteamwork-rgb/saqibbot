'use strict';

/**
 * MR SAQIB MD :: Advanced Scheduler & Automation Commands
 * ============================================================================
 * Commands:
 *   - .autopost <time> | <message>
 *   - .autopost channel <time> | <message>
 *   - .groupschedule <close_time> | <open_time>
 *   - .dailycontent <on/off> [islamic|quote|tech]
 *   - .scheduletab / .schedulemenu / .schedules (Interactive Buttons Dashboard)
 *   - .delschedule <id>
 * ============================================================================
 */

const scheduler = require('../utils/schedulerEngine');
const settings = require('../settings');
const config = require('../config');

const channelBadge = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: settings.newsletterJid || '120363431913895899@newsletter',
        newsletterName: settings.channelName || 'Mr SAQIB',
        serverMessageId: 1
    }
};

/**
 * Check if sender is admin or owner
 */
async function verifyAdminOrOwner(sock, from, msg, isAdmin, isOwner) {
    if (isOwner) return true;
    if (isAdmin) return true;

    // Real-time fallback
    if (sock && typeof sock.groupMetadata === 'function' && from.endsWith('@g.us')) {
        try {
            const meta = await sock.groupMetadata(from).catch(() => null);
            const senderJid = msg.key.participant || msg.participant || (msg.key.fromMe ? sock.user?.id : '');
            const senderDigits = String(senderJid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            const isNowAdmin = meta?.participants?.some(p => {
                if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
                const pIdBare = String(p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                return Boolean(senderDigits && pIdBare === senderDigits);
            });
            if (isNowAdmin) return true;
        } catch (_) {}
    }
    return false;
}

/**
 * Command: .autopost <time> | <message>
 */
async function autopostCommand(sock, from, msg, isAdmin, isOwner, args = []) {
    const rawText = (args || []).join(' ').trim();
    if (!rawText) {
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 ⏱️ *MR SAQIB AUTO-POST SCHEDULER* 〕━━━┈⊷
┃ 💡 *Kaise Use Karein?*
┃
┃ ✦ *Group mein rozana post schedule karein:*
┃   👉 \`.autopost 09:00 PM | Subah Bakhair Dosto!\`
┃   👉 \`.autopost 08:30 AM | Daily Motivation Reminder\`
┃
┃ ✦ *Official Channel ke liye (Owner Only):*
┃   👉 \`.autopost channel 05:00 PM | New Update Dropping Tonight!\`
┃
┃ 🖼️ *Photo ke sath schedule karne ke liye:*
┃   Photo ko reply karke likhein:
┃   👉 \`.autopost 10:00 PM | Caption text here\`
┃
┃ 📋 *Manage karne ke liye:*
┃   👉 \`.scheduletab\` (View & Delete Buttons)
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD*`,
            contextInfo: channelBadge
        }, { quoted: msg });
    }

    let isChannelTarget = false;
    let targetJid = from;
    let contentToParse = rawText;

    if (rawText.toLowerCase().startsWith('channel ')) {
        if (!isOwner) {
            return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner Channel ke liye auto-post schedule kar sakta hai!*" }, { quoted: msg });
        }
        isChannelTarget = true;
        targetJid = settings.newsletterJid || config.newsletterJid || '120363431913895899@newsletter';
        contentToParse = rawText.substring(8).trim();
    } else {
        const hasPermission = await verifyAdminOrOwner(sock, from, msg, isAdmin, isOwner);
        if (!hasPermission) {
            return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ya Bot Owner ye schedule set kar sakta hai!*" }, { quoted: msg });
        }
    }

    const parts = contentToParse.split('|');
    if (parts.length < 2) {
        return await sock.sendMessage(from, {
            text: "❌ *Format Ghalat Hai!*\n\nSahi format: `.autopost <time> | <message>`\nMisal: `.autopost 09:30 PM | Assalam-o-Alaikum sabko!`"
        }, { quoted: msg });
    }

    const timeInput = parts[0].trim();
    const messageInput = parts.slice(1).join('|').trim();

    const time24 = scheduler.parseTimeTo24h(timeInput);
    if (!time24) {
        return await sock.sendMessage(from, {
            text: `❌ *Waqt (Time) Ghalat Hai: "${timeInput}"*\n\nSahi misal: \`09:00 PM\`, \`08:30 AM\`, \`21:00\`, ya \`07:15 AM\``
        }, { quoted: msg });
    }

    const formatted12 = scheduler.format24hTo12h(time24);
    const pktNow = scheduler.getPktTime();

    const newSchedule = scheduler.addSchedule({
        type: 'timed_post',
        targetJid,
        targetName: isChannelTarget ? 'WhatsApp Official Channel' : 'Current Group',
        time24,
        message: messageInput,
        recurring: true,
        createdBy: msg.pushName || (isOwner ? 'Owner' : 'Admin')
    });

    const successCard =
`╭━━━〔 ✅ *AUTO-POST SCHEDULED SUCCESSFULLY* 〕━━━┈⊷
┃ 🆔 *ID:* \`${newSchedule.id}\`
┃ ⏰ *Time:* *${formatted12}* (PKT Daily)
┃ 🎯 *Destination:* ${isChannelTarget ? "📢 Official Channel" : "👥 Current Group"}
┃ 📝 *Message:*
┃   "${messageInput}"
┃
┃ 🕒 *Current Time (PKT):* ${pktNow.time12}
┃ ✦ Har roz theek *${formatted12}* par bot khud post karega!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *Tip: .scheduletab likh kar active schedules manage karein.*`;

    return await sock.sendMessage(from, { text: successCard, contextInfo: channelBadge }, { quoted: msg });
}

/**
 * Command: .groupschedule <close_time> | <open_time> (or 'off')
 */
async function groupscheduleCommand(sock, from, msg, isAdmin, isOwner, args = []) {
    if (!from.endsWith('@g.us')) {
        return await sock.sendMessage(from, { text: "❌ Yeh command sirf WhatsApp groups mein kaam karti hai." }, { quoted: msg });
    }

    const hasPermission = await verifyAdminOrOwner(sock, from, msg, isAdmin, isOwner);
    if (!hasPermission) {
        return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ya Bot Owner group auto-timer set kar sakta hai!*" }, { quoted: msg });
    }

    const raw = (args || []).join(' ').trim();
    if (!raw) {
        const active = scheduler.listSchedules(from, isOwner).find(s => s.type === 'group_mute_unmute');
        const statusText = active && active.enabled
            ? `🟢 *ENABLED:*\n🔒 *Night Close:* ${scheduler.format24hTo12h(active.time24)}\n🔓 *Morning Open:* ${scheduler.format24hTo12h(active.openTime24)}`
            : `🔴 *DISABLED*`;

        return await sock.sendMessage(from, {
            text:
`╭━━━〔 🛡️ *SMART GROUP AUTO-TIMER* 〕━━━┈⊷
┃ 📊 *Current Status:*
┃ ${statusText}
┃
┃ 💡 *Kaise Use Karein?*
┃ ✦ *Auto-Close & Open Set Karein:*
┃   👉 \`.groupschedule 11:00 PM | 07:00 AM\`
┃   (Raat 11 baje close aur subah 7 baje open)
┃
┃ ✦ *Disable / Band Karne Ke Liye:*
┃   👉 \`.groupschedule off\`
┃
┃ ⚠️ *Note:* Bot ka group mein *Admin* hona zaroori hai!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD*`,
            contextInfo: channelBadge
        }, { quoted: msg });
    }

    if (raw.toLowerCase() === 'off' || raw.toLowerCase() === 'disable') {
        const existing = scheduler.listSchedules(from, isOwner).find(s => s.type === 'group_mute_unmute');
        if (existing) {
            scheduler.removeSchedule(existing.id, from, isOwner);
        }
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 🛡️ *GROUP AUTO-TIMER DISABLED* 〕━━━┈⊷
┃ 🔴 Group auto-close aur auto-open timer band kar diya gaya hai.
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`,
            contextInfo: channelBadge
        }, { quoted: msg });
    }

    const parts = raw.split('|');
    if (parts.length < 2) {
        return await sock.sendMessage(from, {
            text: "❌ *Format Ghalat Hai!*\n\nSahi format: `.groupschedule <close_time> | <open_time>`\nMisal: `.groupschedule 11:30 PM | 07:00 AM`"
        }, { quoted: msg });
    }

    const close24 = scheduler.parseTimeTo24h(parts[0].trim());
    const open24 = scheduler.parseTimeTo24h(parts[1].trim());

    if (!close24 || !open24) {
        return await sock.sendMessage(from, {
            text: "❌ *Waqt (Time) Ghalat Hai!*\n\nDono time sahi format mein likhein jaise:\n`.groupschedule 11:00 PM | 07:00 AM`"
        }, { quoted: msg });
    }

    const newSchedule = scheduler.addSchedule({
        type: 'group_mute_unmute',
        targetJid: from,
        targetName: 'Group Chat',
        time24: close24,
        openTime24: open24,
        recurring: true,
        createdBy: msg.pushName || 'Admin'
    });

    const confirmText =
`╭━━━〔 🛡️ *GROUP AUTO-TIMER ACTIVATED* 〕━━━┈⊷
┃ 🆔 *ID:* \`${newSchedule.id}\`
┃ 🌙 *Auto-Close (Mute):* *${scheduler.format24hTo12h(close24)}* (PKT)
┃ ☀️ *Auto-Open (Unmute):* *${scheduler.format24hTo12h(open24)}* (PKT)
┃
┃ ✦ Rozana raat ko group chat khud ba khud band
┃   ho jayegi aur subah foran open ho jayegi!
┃ ✦ Bot auto-announcement card bhi send karega!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD*`;

    return await sock.sendMessage(from, { text: confirmText, contextInfo: channelBadge }, { quoted: msg });
}

/**
 * Command: .dailycontent <on/off> [islamic|quote|tech]
 */
async function dailycontentCommand(sock, from, msg, isAdmin, isOwner, args = []) {
    const hasPermission = await verifyAdminOrOwner(sock, from, msg, isAdmin, isOwner);
    if (!hasPermission) {
        return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ya Bot Owner daily drops set kar sakta hai!*" }, { quoted: msg });
    }

    const action = String(args[0] || '').toLowerCase().trim();
    const category = String(args[1] || 'islamic').toLowerCase().trim();

    if (!action || (action !== 'on' && action !== 'off')) {
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 🕌 *DAILY AUTOMATED CONTENT DROPS* 〕━━━┈⊷
┃ 💡 *Kaise On Karein?*
┃
┃ ✦ *Islamic Drops (Daily Ayat / Hadith with Urdu Translation):*
┃   👉 \`.dailycontent on islamic\`
┃
┃ ✦ *Motivational Quotes (Life & Success Motivation):*
┃   👉 \`.dailycontent on quote\`
┃
┃ ✦ *Daily Tech Tips (Security & AI Hacks):*
┃   👉 \`.dailycontent on tech\`
┃
┃ ✦ *Band Karne Ke Liye:*
┃   👉 \`.dailycontent off\`
┃
┃ ⏰ Subah theek *07:00 AM (PKT)* par automated drop aayega!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD*`,
            contextInfo: channelBadge
        }, { quoted: msg });
    }

    if (action === 'off') {
        const existing = scheduler.listSchedules(from, isOwner).find(s => s.type === 'daily_drop');
        if (existing) {
            scheduler.removeSchedule(existing.id, from, isOwner);
        }
        return await sock.sendMessage(from, {
            text: "🔴 *Daily automated content drop band kar diya gaya hai.*",
            contextInfo: channelBadge
        }, { quoted: msg });
    }

    const validCat = ['islamic', 'quote', 'tech'].includes(category) ? category : 'islamic';

    const newSchedule = scheduler.addSchedule({
        type: 'daily_drop',
        targetJid: from,
        targetName: 'Group Chat',
        time24: '07:00', // 7:00 AM PKT
        category: validCat,
        recurring: true,
        createdBy: msg.pushName || 'Admin'
    });

    return await sock.sendMessage(from, {
        text:
`╭━━━〔 🌟 *DAILY CONTENT DROP ACTIVATED* 〕━━━┈⊷
┃ 🆔 *ID:* \`${newSchedule.id}\`
┃ 📚 *Topic:* *${validCat.toUpperCase()}*
┃ ⏰ *Time:* *07:00 AM* (PKT Daily)
┃
┃ ✦ Bot har roz subah theek 7 baje authentic
┃   ${validCat} post automatically drop karega!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD*`,
        contextInfo: channelBadge
    }, { quoted: msg });
}

/**
 * Command: .scheduletab / .schedulemenu / .schedules
 * Interactive Native WhatsApp Button Dashboard
 */
async function scheduleMenuCommand(sock, from, msg, isAdmin, isOwner, args = []) {
    const list = scheduler.listSchedules(from.endsWith('@g.us') ? from : null, isOwner);
    const pktNow = scheduler.getPktTime();

    let listText = '';
    if (!list.length) {
        listText = "ℹ️ *Koi bhi active schedule nahi mila.*\nNaya schedule banane ke liye `.autopost` ya `.groupschedule` likhein.";
    } else {
        listText = list.map((s, idx) => {
            const timeStr = scheduler.format24hTo12h(s.time24);
            const statusIcon = s.enabled ? "🟢 Active" : "⏸️ Paused";
            if (s.type === 'timed_post') {
                return `*${idx + 1}.* 📢 *Auto-Post* (${statusIcon})\n   ⏰ ${timeStr} | 🆔 \`${s.id}\`\n   📝 "${s.message.length > 35 ? s.message.substring(0, 32) + '...' : s.message}"`;
            } else if (s.type === 'group_mute_unmute') {
                return `*${idx + 1}.* 🛡️ *Group Timer* (${statusIcon})\n   🔒 Close: ${timeStr} ➜ 🔓 Open: ${scheduler.format24hTo12h(s.openTime24)}\n   🆔 \`${s.id}\``;
            } else if (s.type === 'daily_drop') {
                return `*${idx + 1}.* 🕌 *Daily Drop (${s.category?.toUpperCase()})* (${statusIcon})\n   ⏰ ${timeStr} | 🆔 \`${s.id}\``;
            }
            return `*${idx + 1}.* ⏱️ ${s.id} (${timeStr})`;
        }).join('\n\n');
    }

    const bodyText =
`╭━━━〔 ⏱️ *AUTOMATION DASHBOARD* 〕━━━┈⊷
┃ 🕒 *PKT Time:* ${pktNow.time12} (${pktNow.dateStr})
┃ 📊 *Total Schedules:* ${list.length}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

${listText}

─────────────────────────
💡 *Quick Actions:*
• Schedule delete karne ke liye: \`.delschedule <ID>\`
• Pause/Resume karne ke liye: \`.toggleschedule <ID>\`
• Naya post lagane ke liye: \`.autopost <time> | <msg>\``;

    // Send as Native Interactive Buttons if possible
    try {
        const baileys = require('@whiskeysockets/baileys');
        const { proto, generateWAMessageFromContent } = baileys;
        const IM = proto.Message.InteractiveMessage;

        const buttons = [
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '⏱️ Auto-Post Guide',
                    id: '.autopost'
                })
            },
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '🛡️ Group Timer',
                    id: '.groupschedule'
                })
            },
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '🕌 Daily Content',
                    id: '.dailycontent'
                })
            }
        ];

        // If items exist, add a quick delete button for the first item
        if (list.length > 0) {
            buttons.push({
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: `❌ Del 1st (${list[0].id.slice(-4)})`,
                    id: `.delschedule ${list[0].id}`
                })
            });
        }

        const interactive = IM.create({
            header: IM.Header.create({
                title: 'MR SAQIB MD Automation Suite',
                hasMediaAttachment: false
            }),
            body: IM.Body.create({ text: bodyText }),
            footer: IM.Footer.create({ text: 'Powered By MR SAQIB MD' }),
            nativeFlowMessage: IM.NativeFlowMessage.create({
                buttons,
                messageVersion: 1
            })
        });

        const additionalNodes = [
            {
                tag: 'biz',
                attrs: {},
                content: [
                    {
                        tag: 'interactive',
                        attrs: { type: 'native_flow', v: '1' },
                        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                    }
                ]
            }
        ];

        const waMsg = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: interactive
                }
            }
        }, { userJid: sock.user?.id, quoted: msg });

        await sock.relayMessage(from, waMsg.message, {
            messageId: waMsg.key.id,
            additionalNodes
        });
        return true;
    } catch (_) {
        // Fallback to text message
        return await sock.sendMessage(from, { text: bodyText, contextInfo: channelBadge }, { quoted: msg });
    }
}

/**
 * Command: .delschedule <id>
 */
async function delScheduleCommand(sock, from, msg, isAdmin, isOwner, args = []) {
    const id = String(args[0] || '').trim();
    if (!id) {
        return await sock.sendMessage(from, { text: "❌ Schedule ID provide karein.\nMisal: `.delschedule SCH_17000000_abc`" }, { quoted: msg });
    }

    const res = scheduler.removeSchedule(id, from, isOwner);
    if (!res.success) {
        return await sock.sendMessage(from, { text: `❌ ${res.reason || 'Schedule delete nahi ho saka.'}` }, { quoted: msg });
    }

    return await sock.sendMessage(from, {
        text: `✅ *Schedule \`${id}\` kamyabi se delete kar diya gaya hai!*`,
        contextInfo: channelBadge
    }, { quoted: msg });
}

/**
 * Command: .toggleschedule <id>
 */
async function toggleScheduleCommand(sock, from, msg, isAdmin, isOwner, args = []) {
    const id = String(args[0] || '').trim();
    if (!id) {
        return await sock.sendMessage(from, { text: "❌ Schedule ID provide karein.\nMisal: `.toggleschedule SCH_17000000_abc`" }, { quoted: msg });
    }

    const res = scheduler.toggleSchedule(id, from, isOwner);
    if (!res.success) {
        return await sock.sendMessage(from, { text: `❌ ${res.reason || 'Schedule toggle nahi ho saka.'}` }, { quoted: msg });
    }

    return await sock.sendMessage(from, {
        text: `✅ *Schedule \`${id}\` ab ${res.enabled ? "🟢 RESUMED (Active)" : "⏸️ PAUSED"} hai.*`,
        contextInfo: channelBadge
    }, { quoted: msg });
}

module.exports = {
    autopostCommand,
    groupscheduleCommand,
    dailycontentCommand,
    scheduleMenuCommand,
    delScheduleCommand,
    toggleScheduleCommand
};
