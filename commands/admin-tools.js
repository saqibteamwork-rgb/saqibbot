// commands/admin-tools.js - Broadcast, Stats, Backup, Block/Unblock
const fs = require('fs-extra');
const path = require('path');

async function broadcastCommand(sock, from, msg, isOwner, args) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ Only the bot owner can use this command." }, { quoted: msg });
    const text = args.join(' ');
    if (!text) return await sock.sendMessage(from, { text: "❌ Usage: .broadcast <message>" }, { quoted: msg });

    try {
        const groups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        let sent = 0;
        for (const gid of groupIds) {
            try {
                await sock.sendMessage(gid, { text: `📢 *BROADCAST*\n\n${text}` });
                sent++;
                await new Promise(r => setTimeout(r, 800));
            } catch (e) {}
        }
        await sock.sendMessage(from, { text: `✅ Broadcast sent to ${sent}/${groupIds.length} groups.` }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: "❌ Broadcast failed: " + e.message }, { quoted: msg });
    }
}

async function statsCommand(sock, from, msg, botData, startTime) {
    const uptimeMs = Date.now() - startTime;
    const hours = Math.floor(uptimeMs / 3600000);
    const mins = Math.floor((uptimeMs % 3600000) / 60000);
    let groupCount = 0;
    try {
        const groups = await sock.groupFetchAllParticipating();
        groupCount = Object.keys(groups).length;
    } catch (e) {}

    const text =
        `📊 *BOT STATISTICS*\n\n` +
        `⏱️ Uptime: ${hours}h ${mins}m\n` +
        `👥 Groups Connected: ${groupCount}\n` +
        `🤖 Total Registered Sessions: ${botData.registeredBots?.length || botData.totalBots || 0}\n` +
        `🔗 Antilink Groups: ${Object.keys(botData.antilinkGroups || {}).length}\n` +
        `🛡️ Antispam Groups: ${Object.keys(botData.antispamGroups || {}).length}`;

    await sock.sendMessage(from, { text }, { quoted: msg });
}

async function backupCommand(sock, from, msg, isOwner) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ Only the bot owner can use this command." }, { quoted: msg });
    const dataFile = path.join(process.cwd(), 'data', 'bot_data.json');
    try {
        if (!fs.existsSync(dataFile)) return await sock.sendMessage(from, { text: "❌ No data file found yet." }, { quoted: msg });
        const buffer = await fs.readFile(dataFile);
        await sock.sendMessage(from, {
            document: buffer,
            fileName: `backup_${Date.now()}.json`,
            mimetype: 'application/json',
            caption: "✅ Bot data backup"
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: "❌ Backup failed: " + e.message }, { quoted: msg });
    }
}

function getTarget(msg) {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    return mentioned || quoted || null;
}

async function blockCommand(sock, from, msg, isOwner, botData, saveBotData) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ Only the bot owner can use this command." }, { quoted: msg });
    const target = getTarget(msg);
    if (!target) return await sock.sendMessage(from, { text: "❌ Reply to or tag the user you want to block." }, { quoted: msg });
    try {
        await sock.updateBlockStatus(target, "block");
        if (!botData.blockedUsers) botData.blockedUsers = {};
        botData.blockedUsers[target] = true;
        saveBotData();
        await sock.sendMessage(from, { text: `🚫 Blocked @${target.split('@')[0]}`, mentions: [target] }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: "❌ Failed to block: " + e.message }, { quoted: msg });
    }
}

async function unblockCommand(sock, from, msg, isOwner, botData, saveBotData) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ Only the bot owner can use this command." }, { quoted: msg });
    const target = getTarget(msg);
    if (!target) return await sock.sendMessage(from, { text: "❌ Reply to or tag the user you want to unblock." }, { quoted: msg });
    try {
        await sock.updateBlockStatus(target, "unblock");
        if (botData.blockedUsers) delete botData.blockedUsers[target];
        saveBotData();
        await sock.sendMessage(from, { text: `✅ Unblocked @${target.split('@')[0]}`, mentions: [target] }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: "❌ Failed to unblock: " + e.message }, { quoted: msg });
    }
}

function normalizePhoneDigits(raw) {
    if (!raw) return '';
    let n = String(raw).replace(/[^0-9]/g, '');
    if (n.startsWith('00')) n = n.slice(2);
    else if (n.startsWith('0')) n = '92' + n.slice(1);
    else if (n.startsWith('3') && n.length === 10) n = '92' + n;
    return n;
}

/**
 * .reportblock <number> | <details> - Single-account WhatsApp Block + Support Report combo
 * Only executes WhatsApp block on caller's own paired session (isSessionOwner || isOwner).
 */
async function reportBlockCommand(sock, from, msg, canModifyBlockList, botData, saveBotData, args = []) {
    const rawText = (args || []).join(' ').trim();
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption || '';
    const replyOrMentionJid = getTarget(msg);

    let targetDigits = '';
    let blockJid = null;
    let details = '';

    if (rawText.includes('|')) {
        const pipeParts = rawText.split('|').map(s => s.trim());
        const numCand = normalizePhoneDigits(pipeParts[0]);
        if (numCand.length >= 10 && numCand.length <= 15) {
            targetDigits = numCand;
            blockJid = `${numCand}@s.whatsapp.net`;
            details = pipeParts.slice(1).join(' | ').trim();
        } else {
            details = rawText;
        }
    } else if (rawText) {
        const numMatch = rawText.match(/(?:\+?\d[\d\s-]{8,16}\d)/);
        if (numMatch) {
            const cleaned = normalizePhoneDigits(numMatch[0]);
            if (cleaned.length >= 10 && cleaned.length <= 15) {
                targetDigits = cleaned;
                blockJid = `${cleaned}@s.whatsapp.net`;
                details = rawText.replace(numMatch[0], '').trim();
            } else {
                details = rawText;
            }
        } else {
            details = rawText;
        }
    }

    if (!blockJid && replyOrMentionJid) {
        blockJid = replyOrMentionJid.includes('@') ? replyOrMentionJid : `${replyOrMentionJid}@s.whatsapp.net`;
        if (blockJid.endsWith('@s.whatsapp.net')) {
            targetDigits = blockJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        } else if (blockJid.endsWith('@lid')) {
            try {
                const { resolvePhoneNumberFromLid } = require('./pair');
                if (typeof resolvePhoneNumberFromLid === 'function') {
                    const pn = await resolvePhoneNumberFromLid(sock, blockJid);
                    if (pn) {
                        targetDigits = pn;
                        blockJid = `${pn}@s.whatsapp.net`;
                    }
                }
            } catch (_) {}
        }
    }

    if (!targetDigits && !blockJid) {
        return await sock.sendMessage(from, {
            text:
                `🛡️ *REPORT & BLOCK COMBO (.reportblock)*\n\n` +
                `Usage:\n` +
                `• *.reportblock 923XXXXXXXXX | Scam / Fraud details*\n` +
                `• Ya scammer ke message par reply karke *.reportblock Scam details* likhein\n\n` +
                `⚡ Yeh aapke apne paired number se scammer ko *WhatsApp par Block* karta hai aur WhatsApp Support ko bhejne ke liye formal *Email Report Draft* banata hai.`
        }, { quoted: msg });
    }

    const ownDigits = String(sock?.user?.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (ownDigits && targetDigits && ownDigits === targetDigits) {
        return await sock.sendMessage(from, { text: '❌ Aap apna khud ka paired number report/block nahi kar sakte.' }, { quoted: msg });
    }

    const finalDetails = (details || quotedText || 'Fraud / scam activity and abusive behavior on WhatsApp.').slice(0, 600);
    const displayNum = targetDigits ? `+${targetDigits}` : blockJid.split('@')[0];

    let blockStatusLine = 'ℹ️ *WhatsApp Block:* Skipped (sirf paired account owner apni blocklist update kar sakta hai)';
    if (canModifyBlockList && blockJid) {
        try {
            const blockTarget = blockJid.endsWith('@lid') && targetDigits ? `${targetDigits}@s.whatsapp.net` : blockJid;
            await sock.updateBlockStatus(blockTarget, 'block');
            if (!botData.blockedUsers) botData.blockedUsers = {};
            botData.blockedUsers[blockTarget] = true;
            if (typeof saveBotData === 'function') saveBotData();
            blockStatusLine = `🚫 *WhatsApp Block:* Done (${displayNum} blocked on your paired account)`;
        } catch (err) {
            blockStatusLine = `⚠️ *WhatsApp Block Failed:* ${err.message}`;
        }
    }

    const emailDraft =
        `To: WhatsApp Trust & Safety Team\n` +
        `Subject: Urgent Scam & Fraud Report - ${displayNum}\n` +
        `Date: ${new Date().toDateString()}\n\n` +
        `Dear WhatsApp Support Team,\n\n` +
        `I am reporting WhatsApp account ${displayNum} for scam/fraudulent activity.\n` +
        `Reporter Number: ${ownDigits ? `+${ownDigits}` : 'Paired User'}\n` +
        `Incident Details: ${finalDetails}\n\n` +
        `Please review this account and take appropriate enforcement action under WhatsApp Terms of Service.\n\n` +
        `Note: Chat screenshots and evidence are preserved on my device.`;

    const cardText =
        `╭━━━〔 🛡️ *SCAM REPORT & BLOCK* 〕━━━┈⊷\n` +
        `┃ 🎯 *Target:* ${displayNum}\n` +
        `┃ ${blockStatusLine}\n` +
        `┃ 📧 *Report Email:* report@support.whatsapp.com\n` +
        `┃ 📧 *Abuse Email:* abuse@support.whatsapp.com\n` +
        `┃ ⚖️ *FIA Helpline (PK):* 1991\n` +
        `┃ 📱 *Manual App Report:* Chat Open > ⋮ > More > Report\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
        `📄 *READY SUPPORT EMAIL DRAFT (Copy & Email):*\n` +
        `\`\`\`\n${emailDraft}\n\`\`\``;

    let sentInteractive = false;
    try {
        const { proto, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
        const IM = proto.Message.InteractiveMessage;
        const buttons = [
            {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: '📋 Copy Support Report',
                    copy_code: emailDraft
                })
            },
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: '📘 WhatsApp Report Guide',
                    url: 'https://faq.whatsapp.com/1142481766359885',
                    merchant_url: 'https://faq.whatsapp.com/1142481766359885'
                })
            }
        ];

        const interactive = IM.create({
            header: IM.Header.create({ title: '🛡️ Report & Block Complete', hasMediaAttachment: false }),
            body: IM.Body.create({ text: cardText }),
            footer: IM.Footer.create({ text: '🚀 Paired Account Action + Trust & Safety Draft' }),
            nativeFlowMessage: IM.NativeFlowMessage.create({ buttons, messageVersion: 1 })
        });
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
            additionalNodes: [{
                tag: 'biz',
                attrs: {},
                content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }]
            }]
        });
        sentInteractive = true;
    } catch (_) {}

    if (!sentInteractive) {
        await sock.sendMessage(from, { text: cardText }, { quoted: msg });
    }
}

module.exports = { broadcastCommand, statsCommand, backupCommand, blockCommand, unblockCommand, reportBlockCommand };
