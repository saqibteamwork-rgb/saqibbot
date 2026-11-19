'use strict';

/**
 * MR SAQIB MD :: Advanced Scheduler & Automation Commands
 * ============================================================================
 * Commands:
 *   - .autopost <time> [destination: all|channel|link] [| <caption/message>]
 *     (Reply to Video, Photo, Audio, Document, or Text to schedule forwarding!)
 *   - .groupschedule <close_time> | <open_time>
 *   - .dailycontent <on/off> [islamic|quote|tech]
 *   - .scheduletab / .schedulemenu / .schedules (Interactive Buttons Dashboard)
 *   - .delschedule <id>
 *   - .toggleschedule <id>
 *   - .aipost <prompt> [| <time>] [| <destination>]
 *   - .aiimage <prompt>
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const scheduler = require('../utils/schedulerEngine');
const settings = require('../settings');
const config = require('../config');

const MEDIA_DIR = path.join(__dirname, '..', 'data', 'scheduled_media');

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
 * Downloads and saves quoted media to data/scheduled_media/<scheduleId>.<ext>
 */
async function extractQuotedMedia(quotedMsg, scheduleId) {
    if (!quotedMsg) return null;
    if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

    try {
        if (quotedMsg.videoMessage) {
            const stream = await downloadContentFromMessage(quotedMsg.videoMessage, 'video');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            const filePath = path.join(MEDIA_DIR, `${scheduleId}.mp4`);
            fs.writeFileSync(filePath, buffer);
            return {
                mediaType: 'video',
                mediaPath: filePath,
                caption: quotedMsg.videoMessage.caption || ''
            };
        } else if (quotedMsg.imageMessage) {
            const stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            const filePath = path.join(MEDIA_DIR, `${scheduleId}.jpg`);
            fs.writeFileSync(filePath, buffer);
            return {
                mediaType: 'image',
                mediaPath: filePath,
                caption: quotedMsg.imageMessage.caption || ''
            };
        } else if (quotedMsg.audioMessage) {
            const stream = await downloadContentFromMessage(quotedMsg.audioMessage, 'audio');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            const filePath = path.join(MEDIA_DIR, `${scheduleId}.mp3`);
            fs.writeFileSync(filePath, buffer);
            return {
                mediaType: 'audio',
                mediaPath: filePath,
                isPtt: Boolean(quotedMsg.audioMessage.ptt)
            };
        } else if (quotedMsg.documentMessage) {
            const stream = await downloadContentFromMessage(quotedMsg.documentMessage, 'document');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            const fileName = quotedMsg.documentMessage.fileName || `${scheduleId}.bin`;
            const filePath = path.join(MEDIA_DIR, `${scheduleId}_${fileName}`);
            fs.writeFileSync(filePath, buffer);
            return {
                mediaType: 'document',
                mediaPath: filePath,
                fileName,
                caption: quotedMsg.documentMessage.caption || ''
            };
        } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage?.text) {
            return {
                mediaType: 'text',
                quotedText: quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || ''
            };
        }
    } catch (e) {
        console.warn('[extractQuotedMedia Error]:', e.message);
    }
    return null;
}

/**
 * Resolves destination (all, channel, group link, or current chat)
 */
async function resolveDestination(rawDest, sock, currentJid, isOwner) {
    if (!rawDest) return { jid: currentJid, name: 'Current Chat', isAll: false, isChannel: false };
    const low = rawDest.toLowerCase().trim();

    if (low === 'all' || low === 'groups' || low === 'allgroups') {
        if (!isOwner) {
            return { error: "❌ *Sirf Bot Owner 'all' groups ke liye schedule kar sakta hai!*" };
        }
        return { jid: 'all', name: '🌐 All Participating Groups', isAll: true, isChannel: false };
    }

    if (low === 'channel' || low === 'ch' || low === 'newsletter') {
        if (!isOwner) {
            return { error: "❌ *Sirf Bot Owner Official Channel ke liye schedule kar sakta hai!*" };
        }
        const chJid = settings.newsletterJid || config.newsletterJid || '120363431913895899@newsletter';
        return { jid: chJid, name: '📢 Official WhatsApp Channel', isAll: false, isChannel: true };
    }

    // WhatsApp Group invite link: https://chat.whatsapp.com/ABC123xyz
    const linkMatch = rawDest.match(/chat\.whatsapp\.com\/([0-9A-Za-z_-]+)/i);
    if (linkMatch && sock && typeof sock.groupGetInviteInfo === 'function') {
        try {
            const inviteCode = linkMatch[1];
            const info = await sock.groupGetInviteInfo(inviteCode);
            if (info && info.id) {
                const gJid = info.id.includes('@') ? info.id : `${info.id}@g.us`;
                return { jid: gJid, name: info.subject || 'Target Group', isAll: false, isChannel: false };
            }
        } catch (e) {
            return { error: `❌ Group invite link open nahi ho saka: ${e.message}` };
        }
    }

    if (rawDest.endsWith('@g.us')) {
        return { jid: rawDest.trim(), name: 'Specific Group', isAll: false, isChannel: false };
    }

    return { jid: currentJid, name: 'Current Chat', isAll: false, isChannel: false };
}

/**
 * Command: .autopost
 * Supports replying to ANY Video, Image, Audio, Document, or Text message!
 */
async function autopostCommand(sock, from, msg, isAdmin, isOwner, args = []) {
    const rawArgs = (args || []).join(' ').trim();
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!rawArgs && !quotedMsg) {
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 ⏱️ *MR SAQIB AUTO-POST & MEDIA SCHEDULER* 〕━━━┈⊷
┃ 💡 *Kaise Use Karein?*
┃
┃ 📹 *Video ya Photo Schedule Karne Ka Asaan Tareeqa:*
┃   Kisi bhi Video ya Photo ko *Reply* karein aur likhein:
┃   👉 \`.autopost 09:30 PM all\` (Sare groups mein post hoga)
┃   👉 \`.autopost 05:00 PM channel\` (Official Channel mein jayega)
┃   👉 \`.autopost 10:00 PM https://chat.whatsapp.com/... \`
┃   👉 \`.autopost 09:00 PM\` (Current group mein jayega)
┃
┃ 📝 *Caption Badalne Ke Liye:*
┃   👉 \`.autopost 09:30 PM all | Check out this video!\`
┃
┃ 💬 *Bina Media Ke Normal Text Post:*
┃   👉 \`.autopost 08:00 AM | all | Subah Bakhair Dosto!\`
┃   👉 \`.autopost 09:00 PM | Subah Bakhair!\`
┃
┃ 🤖 *AI Post Generator:*
┃   👉 \`.aipost write jummah mubarak post | 08:00 AM | all\`
┃
┃ 📋 *Manage karne ke liye:*
┃   👉 \`.scheduletab\` (View & Delete Dashboard)
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD*`,
            contextInfo: channelBadge
        }, { quoted: msg });
    }

    // Permission check
    const hasPermission = await verifyAdminOrOwner(sock, from, msg, isAdmin, isOwner);
    if (!hasPermission) {
        return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ya Bot Owner auto-post schedule kar sakta hai!*" }, { quoted: msg });
    }

    // Parse time, destination, and message
    let timeInput = '';
    let destInput = '';
    let messageInput = '';

    const parts = rawArgs.split('|').map(p => p.trim());

    if (parts.length >= 3) {
        timeInput = parts[0];
        destInput = parts[1];
        messageInput = parts.slice(2).join('|').trim();
    } else if (parts.length === 2) {
        // Could be "<time> | <message>" or "<time> <dest> | <message>"
        const firstSegmentTokens = parts[0].split(/\s+/);
        // Check if first token + am/pm forms time
        const maybeTime = parts[0];
        if (scheduler.parseTimeTo24h(maybeTime)) {
            timeInput = maybeTime;
            messageInput = parts[1];
        } else if (scheduler.parseTimeTo24h(firstSegmentTokens.slice(0, 2).join(' '))) {
            timeInput = firstSegmentTokens.slice(0, 2).join(' ');
            destInput = firstSegmentTokens.slice(2).join(' ');
            messageInput = parts[1];
        } else if (scheduler.parseTimeTo24h(firstSegmentTokens[0])) {
            timeInput = firstSegmentTokens[0];
            destInput = firstSegmentTokens.slice(1).join(' ');
            messageInput = parts[1];
        } else {
            timeInput = parts[0];
            messageInput = parts[1];
        }
    } else {
        // Single segment e.g. "09:00 PM all" or "09:00 PM channel" or "21:00"
        const tokens = rawArgs.split(/\s+/);
        if (tokens.length >= 3 && (tokens[1].toLowerCase() === 'am' || tokens[1].toLowerCase() === 'pm')) {
            timeInput = `${tokens[0]} ${tokens[1]}`;
            destInput = tokens[2] || '';
            messageInput = tokens.slice(3).join(' ');
        } else if (tokens.length >= 2 && scheduler.parseTimeTo24h(tokens[0])) {
            timeInput = tokens[0];
            destInput = tokens[1] || '';
            messageInput = tokens.slice(2).join(' ');
        } else if (tokens.length >= 2 && (tokens[1].toLowerCase() === 'am' || tokens[1].toLowerCase() === 'pm')) {
            timeInput = `${tokens[0]} ${tokens[1]}`;
        } else {
            timeInput = tokens[0];
        }
    }

    const time24 = scheduler.parseTimeTo24h(timeInput);
    if (!time24) {
        return await sock.sendMessage(from, {
            text: `❌ *Waqt (Time) Ghalat Hai: "${timeInput || 'Khali'}"*\n\nSahi misal: \`09:30 PM\`, \`08:00 AM\`, \`21:00\`\nCommand misal:\n\`.autopost 09:30 PM all\` (Kisi photo/video ko reply karke)`
        }, { quoted: msg });
    }

    // Resolve Destination
    const dest = await resolveDestination(destInput, sock, from, isOwner);
    if (dest.error) {
        return await sock.sendMessage(from, { text: dest.error }, { quoted: msg });
    }

    const scheduleId = `SCH_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let mediaObj = null;

    // Extract quoted media if user replied to any media
    if (quotedMsg) {
        mediaObj = await extractQuotedMedia(quotedMsg, scheduleId);
    }

    // Determine final message text
    let finalMessage = messageInput;
    if (!finalMessage && mediaObj?.caption) {
        finalMessage = mediaObj.caption;
    } else if (!finalMessage && mediaObj?.quotedText) {
        finalMessage = mediaObj.quotedText;
    }

    const formatted12 = scheduler.format24hTo12h(time24);
    const pktNow = scheduler.getPktTime();

    const newSchedule = scheduler.addSchedule({
        id: scheduleId,
        type: 'timed_post',
        targetJid: dest.jid,
        targetName: dest.name,
        time24,
        message: finalMessage,
        mediaType: mediaObj?.mediaType || null,
        mediaPath: mediaObj?.mediaPath || null,
        fileName: mediaObj?.fileName || null,
        isPtt: Boolean(mediaObj?.isPtt),
        recurring: true,
        createdBy: msg.pushName || (isOwner ? 'Owner' : 'Admin')
    });

    const mediaLabel = mediaObj?.mediaType
        ? (mediaObj.mediaType === 'video' ? '🎥 Video Attached' : (mediaObj.mediaType === 'image' ? '🖼️ Photo Attached' : (mediaObj.mediaType === 'audio' ? '🎵 Audio Attached' : '📄 Document Attached')))
        : '📝 Text Message';

    const successCard =
`╭━━━〔 ✅ *AUTO-POST SCHEDULED SUCCESSFULLY* 〕━━━┈⊷
┃ 🆔 *ID:* \`${newSchedule.id}\`
┃ ⏰ *Time:* *${formatted12}* (PKT Daily)
┃ 🎯 *Destination:* *${dest.name}*
┃ 📦 *Attachment:* ${mediaLabel}
${finalMessage ? `┃ 💬 *Message:* "${finalMessage.length > 40 ? finalMessage.substring(0, 37) + '...' : finalMessage}"\n` : ''}┃
┃ 🕒 *Current Time (PKT):* ${pktNow.time12}
┃ ✦ Theek *${formatted12}* par bot automatically post kar dega!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *Tip: .scheduletab likh kar active schedules manage karein.*`;

    return await sock.sendMessage(from, { text: successCard, contextInfo: channelBadge }, { quoted: msg });
}

/**
 * Command: .aipost <prompt> [| <time>] [| <destination>]
 * Generates an aesthetic, engaging post using AI and optionally schedules it directly!
 */
async function aipostCommand(sock, from, msg, isAdmin, isOwner, args = []) {
    const raw = (args || []).join(' ').trim();
    if (!raw) {
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 🤖 *AI POST GENERATOR & AUTO-SCHEDULER* 〕━━━┈⊷
┃ 💡 *Kaise Use Karein?*
┃
┃ ✦ *Instant Achi Post Generate Karein:*
┃   👉 \`.aipost write an amazing Islamic Jummah Mubarak reminder\`
┃   👉 \`.aipost daily motivation thought for students\`
┃   👉 \`.aipost professional WhatsApp group rules notice\`
┃
┃ ✦ *Generate Karke Direct Schedule Karein:*
┃   👉 \`.aipost write daily tech security tip | 08:00 AM | all\`
┃   👉 \`.aipost motivational thought | 09:00 PM | channel\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD AI*`,
            contextInfo: channelBadge
        }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } }).catch(() => {});

    const parts = raw.split('|').map(p => p.trim());
    const promptTopic = parts[0];
    const timeInput = parts[1] || null;
    const destInput = parts[2] || null;

    let aiGeneratedPost = '';
    try {
        const fullPrompt =
`You are an expert content creator for WhatsApp communities.
Generate an engaging, beautiful, aesthetic WhatsApp post in Roman Urdu and Urdu/English about:
"${promptTopic}".
Include appropriate emojis, an aesthetic curved header box e.g. ╭━━━〔 ... 〕━━━┈⊷, structured bullet points, and a nice moral or takeaway.
Do not output markdown code blocks. Keep it authentic, clean, and ready to post on WhatsApp!`;

        const apiUrl = `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}`;
        const res = await axios.get(apiUrl, { timeout: 15000 });
        aiGeneratedPost = String(res.data || '').trim();
    } catch (e) {
        aiGeneratedPost =
`╭━━━〔 🌟 *SPECIAL POST: ${promptTopic.toUpperCase()}* 〕━━━┈⊷
┃
┃ ✨ "${promptTopic}" ke hawale se aik ahem pegham:
┃ ✦ Har mushkil ke baad aasaani aati hai.
┃ ✦ Apne waqt aur qabliyat ko behtar se behtar banayein.
┃
┃ 🤲 Dua: Allah Pak sabko kamyabi aur sakoon ata farmaye!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD*`;
    }

    // If time was specified, schedule it directly!
    if (timeInput) {
        const time24 = scheduler.parseTimeTo24h(timeInput);
        if (time24) {
            const hasPermission = await verifyAdminOrOwner(sock, from, msg, isAdmin, isOwner);
            if (!hasPermission) {
                return await sock.sendMessage(from, { text: "❌ *Sirf Group Admin ya Bot Owner schedule kar sakta hai!*" }, { quoted: msg });
            }

            const dest = await resolveDestination(destInput, sock, from, isOwner);
            if (dest.error) {
                return await sock.sendMessage(from, { text: dest.error }, { quoted: msg });
            }

            const scheduleId = `SCH_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            scheduler.addSchedule({
                id: scheduleId,
                type: 'timed_post',
                targetJid: dest.jid,
                targetName: dest.name,
                time24,
                message: aiGeneratedPost,
                recurring: true,
                createdBy: msg.pushName || 'AI AutoPost'
            });

            const confirmCard =
`╭━━━〔 🤖 *AI POST GENERATED & SCHEDULED!* 〕━━━┈⊷
┃ 🆔 *ID:* \`${scheduleId}\`
┃ ⏰ *Time:* *${scheduler.format24hTo12h(time24)}* (PKT Daily)
┃ 🎯 *Destination:* *${dest.name}*
┃ 
┃ 📝 *Generated Post Preview:*
┃ ─────────────────────────
${aiGeneratedPost.substring(0, 180)}...
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *Tip: .scheduletab likh kar active schedules dekhein.*`;

            return await sock.sendMessage(from, { text: confirmCard, contextInfo: channelBadge }, { quoted: msg });
        }
    }

    // If not scheduled, send the generated post with interactive buttons to schedule it
    try {
        const baileys = require('@whiskeysockets/baileys');
        const { proto, generateWAMessageFromContent } = baileys;
        const IM = proto.Message.InteractiveMessage;

        const buttons = [
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '⏱️ Schedule (All Groups)',
                    id: `.autopost 09:00 AM all | ${aiGeneratedPost.substring(0, 50)}`
                })
            },
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '📢 Schedule (Channel)',
                    id: `.autopost 05:00 PM channel | ${aiGeneratedPost.substring(0, 50)}`
                })
            }
        ];

        const interactive = IM.create({
            header: IM.Header.create({ title: 'MR SAQIB MD AI Post Creator', hasMediaAttachment: false }),
            body: IM.Body.create({ text: aiGeneratedPost }),
            footer: IM.Footer.create({ text: 'Powered By MR SAQIB MD AI' }),
            nativeFlowMessage: IM.NativeFlowMessage.create({ buttons, messageVersion: 1 })
        });

        const additionalNodes = [
            {
                tag: 'biz',
                attrs: {},
                content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }]
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

        await sock.relayMessage(from, waMsg.message, { messageId: waMsg.key.id, additionalNodes });
        return true;
    } catch (_) {
        return await sock.sendMessage(from, { text: aiGeneratedPost, contextInfo: channelBadge }, { quoted: msg });
    }
}

/**
 * Command: .aiimage <prompt>
 * Generates an instant HD image ready to be scheduled or forwarded!
 */
async function aiimageCommand(sock, from, msg, isAdmin, isOwner, args = []) {
    const prompt = (args || []).join(' ').trim();
    if (!prompt) {
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 🎨 *AI IMAGE & BANNER GENERATOR* 〕━━━┈⊷
┃ 💡 *Kaise Use Karein?*
┃ 👉 \`.aiimage neon glowing tiger in cyber city\`
┃ 👉 \`.aiimage beautiful Islamic calligraphy banner\`
┃ 👉 \`.aiimage aesthetic nature wallpaper 4k\`
┃
┃ ✦ Image aane ke baad usko *Reply* karke likhein:
┃   👉 \`.autopost 09:30 PM all\` (Sare groups mein auto post hoga!)
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD*`,
            contextInfo: channelBadge
        }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } }).catch(() => {});

    try {
        const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1080&nologo=true`;
        const caption =
`╭━━━〔 🎨 *AI ART GENERATED* 〕━━━┈⊷
┃ 🧠 *Prompt:* ${prompt}
┃
┃ 💡 *Is photo ko schedule karne ke liye:*
┃    Is photo ko reply karke likhein:
┃    👉 \`.autopost 09:00 PM all\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD*`;

        await sock.sendMessage(from, {
            image: { url: imgUrl },
            caption,
            contextInfo: channelBadge
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Image generation failed: ${e.message}` }, { quoted: msg });
    }
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
            const mediaTag = s.mediaType ? ` [${s.mediaType.toUpperCase()}]` : '';
            if (s.type === 'timed_post') {
                return `*${idx + 1}.* 📢 *Auto-Post${mediaTag}* (${statusIcon})\n   ⏰ ${timeStr} ➜ 🎯 ${s.targetName || 'Chat'}\n   🆔 \`${s.id}\`${s.message ? `\n   📝 "${s.message.length > 30 ? s.message.substring(0, 27) + '...' : s.message}"` : ''}`;
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
• Video/Photo schedule karne ke liye: Video ko reply karke \`.autopost 09:00 PM all\``;

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
                    display_text: '🤖 AI Post Generator',
                    id: '.aipost'
                })
            },
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: '🛡️ Group Timer',
                    id: '.groupschedule'
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
    toggleScheduleCommand,
    aipostCommand,
    aiimageCommand,
    resolveDestination,
    extractQuotedMedia
};
