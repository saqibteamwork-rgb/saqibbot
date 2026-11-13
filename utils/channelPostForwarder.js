'use strict';

/**
 * WhatsApp Channel Auto Post Link Forwarder (.arc Integrated)
 * ============================================================
 * Strictly monitors ONLY channels added via `.arc <channel_link>`.
 * When a new post arrives in an ARC-monitored channel:
 *   1. Constructs the official post link: https://whatsapp.com/channel/<invite>/<serverId>
 *   2. Uses the 03438673242 (923438673242) bot session itself to send
 *      ".chreact <post_link>" strictly into its own "You" (Self-Chat) inbox!
 *   3. Never triggers on random admin channels or sends from secondary numbers.
 */

const fs = require('fs-extra');
const path = require('path');
const hub = require('./channelHub');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'channel_forwarder.json');
const ARC_FILE = path.join(__dirname, '..', 'data', 'channel_arc.json');

// Global in-memory set to prevent duplicate forwards across all connected sessions
const sentPosts = new Set();
// Track message IDs sent by this forwarder so our own bot doesn't loop on them
const autoSentMsgIds = new Set();
// Cache for channel invite codes: jid -> inviteCode
const inviteCache = new Map();

function isAutoSentMessage(msgId) {
    if (!msgId) return false;
    return autoSentMsgIds.has(msgId);
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readJsonSync(CONFIG_FILE) || {};
            if (typeof data.enabled !== 'boolean') data.enabled = true;
            if (!data.targetJid) data.targetJid = '923438673242@s.whatsapp.net';
            if (!data.command) data.command = '.chreact';
            // Strictly disable autoAllAdminChannels so random admin channels never trigger
            data.autoAllAdminChannels = false;
            return data;
        }
    } catch (e) {
        console.error('[ChannelForwarder Load Error]:', e.message);
    }
    return {
        enabled: true,
        targetJid: '923438673242@s.whatsapp.net',
        command: '.chreact',
        autoAllAdminChannels: false
    };
}

function saveConfig(cfg) {
    try {
        cfg.autoAllAdminChannels = false;
        fs.ensureDirSync(path.dirname(CONFIG_FILE));
        fs.writeJsonSync(CONFIG_FILE, cfg, { spaces: 2 });
    } catch (e) {
        console.error('[ChannelForwarder Save Error]:', e.message);
    }
}

function loadArcChannelConf(channelJid) {
    try {
        if (fs.existsSync(ARC_FILE)) {
            const arcData = fs.readJsonSync(ARC_FILE) || {};
            if (arcData.enabled === false) return null;
            if (arcData.blocked && arcData.blocked[channelJid]) return null;
            let conf = arcData.channels && arcData.channels[channelJid];
            if (!conf && arcData.channels) {
                const chRec = typeof hub.getChannel === 'function' ? hub.getChannel(channelJid) : null;
                const chInvite = chRec?.invite || null;
                if (chInvite) {
                    conf = Object.values(arcData.channels).find(c =>
                        c && c.enabled !== false && (c.invite === chInvite || (c.link && c.link.includes(chInvite)))
                    );
                }
            }
            if (conf && conf.enabled !== false) return conf;
        }
    } catch {}
    return null;
}

/**
 * Finds the active Baileys socket belonging to the target number (e.g. 923438673242)
 * so the message is sent strictly from 923438673242 into its own "You" self-chat.
 */
function findTargetSelfSocket(primarySock, targetDigits) {
    const cleanTarget = String(targetDigits || '923438673242').replace(/[^0-9]/g, '');
    const last10 = cleanTarget.slice(-10);

    const allSocks = [];
    const addSock = (s) => {
        if (s && !allSocks.includes(s)) allSocks.push(s);
    };

    addSock(primarySock);
    try {
        if (typeof globalThis.ProBoySessionManager?.getActiveSocks === 'function') {
            const list = globalThis.ProBoySessionManager.getActiveSocks() || [];
            list.forEach(addSock);
        }
        if (typeof globalThis.ProBoySessionManager?.getSessions === 'function') {
            const sessObj = globalThis.ProBoySessionManager.getSessions() || {};
            for (const sVal of Object.values(sessObj)) {
                if (sVal?.sock) addSock(sVal.sock);
            }
        }
    } catch {}

    const getDigits = (s) => {
        const raw = s?.user?.id || s?.userId || hub.accountOf(s) || '';
        return String(raw).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    };

    for (const s of allSocks) {
        const d = getDigits(s);
        if (!d) continue;
        if (d === cleanTarget || (last10.length === 10 && d.endsWith(last10))) {
            return s;
        }
    }

    return null;
}

/**
 * Main listener called when a new post arrives in an .arc monitored channel
 */
async function handleNewsletterPost(sock, msg, passedArcConf = null) {
    const config = loadConfig();
    if (!config.enabled || !config.targetJid) return;

    const from = msg.key?.remoteJid;
    if (!from || !from.endsWith('@newsletter')) return;

    const serverId = msg.key?.server_id || msg.messageServerId || msg.newsletterServerId || msg.key?.serverId;
    if (!serverId) return;

    // Strictly verify this channel was added via .arc
    const arcConf = passedArcConf || loadArcChannelConf(from);
    if (!arcConf || arcConf.enabled === false) return;

    // Global synchronous deduplication so multiple sessions never send duplicate .chreact commands
    const postKey = `${from}:${serverId}`;
    if (sentPosts.has(postKey)) return;
    sentPosts.add(postKey);
    if (sentPosts.size > 2000) {
        sentPosts.delete(sentPosts.values().next().value);
    }

    let inviteCode = arcConf.invite || inviteCache.get(from) || null;
    let channelName = arcConf.name || 'WhatsApp Channel';

    // Extract invite code from saved link if present
    if (!inviteCode && arcConf.link) {
        const linkMatch = String(arcConf.link).match(/whatsapp\.com\/channel\/([0-9A-Za-z_-]+)/i);
        if (linkMatch) inviteCode = linkMatch[1];
    }

    // Try resolving invite code from channelHub cache
    if (!inviteCode) {
        try {
            if (typeof hub.ensureChannel === 'function') {
                const rec = hub.ensureChannel(from, 'observed');
                if (rec && rec.invite) inviteCode = rec.invite;
                if (rec && rec.name) channelName = rec.name;
            }
        } catch {}
    }

    // Fallback: query newsletterMetadata if invite code is still missing
    if (!inviteCode) {
        try {
            if (typeof sock.newsletterMetadata === 'function') {
                const meta = await sock.newsletterMetadata('jid', from).catch(() => null);
                if (meta) {
                    inviteCode = meta.invite || meta.code || (meta.thread_metadata?.invite) || inviteCode;
                    channelName = meta.name || channelName;
                    if (inviteCode) inviteCache.set(from, inviteCode);
                }
            }
        } catch (mErr) {
            console.warn('[ChannelForwarder Meta Error]:', mErr.message);
        }
    }

    if (!inviteCode) {
        console.warn(`[ChannelForwarder] Could not resolve invite code for ARC channel ${from} (serverId: ${serverId})`);
        return;
    }

    const postLink = `https://whatsapp.com/channel/${inviteCode}/${serverId}`;
    const cmdText = `${config.command || '.chreact'} ${postLink}`;

    const rawTarget = String(config.targetJid || '923438673242@s.whatsapp.net').trim();
    const isTargetGroup = rawTarget.endsWith('@g.us');
    let targetDestJid = rawTarget;

    if (!isTargetGroup && !rawTarget.includes('@')) {
        const d = rawTarget.replace(/[^0-9]/g, '') || '923438673242';
        targetDestJid = `${d}@s.whatsapp.net`;
    }

    // Prefer Master Owner (923438673242) socket; if target is a group and 923438673242 isn't connected, fallback to active sock
    const masterSock = findTargetSelfSocket(sock, '923438673242');
    const senderSock = isTargetGroup ? (masterSock || sock) : (findTargetSelfSocket(sock, targetDestJid.split('@')[0]) || masterSock);

    if (!senderSock) {
        console.log(`[ChannelForwarder] ℹ️ Target session for ${targetDestJid} is not connected; skipping .chreact send.`);
        return false;
    }

    try {
        console.log(`[ChannelForwarder] 📢 ARC Channel Post in "${channelName}"! Sending to ${targetDestJid}: ${cmdText}`);
        const sentMsg = await senderSock.sendMessage(targetDestJid, { text: cmdText });
        if (sentMsg?.key?.id) {
            autoSentMsgIds.add(sentMsg.key.id);
            if (autoSentMsgIds.size > 1000) {
                autoSentMsgIds.delete(autoSentMsgIds.values().next().value);
            }
        }

        // Directly trigger our own bot's .chreact command handler on the auto-sent message
        const cmdMsg = (sentMsg && sentMsg.key) ? sentMsg : {
            key: {
                remoteJid: targetDestJid,
                fromMe: true,
                id: sentMsg?.key?.id || `ARC_${serverId}_${Date.now()}`
            },
            message: { conversation: cmdText }
        };

        await new Promise(r => setTimeout(r, 1000));
        const { chreactCommand } = require('../commands/chreact');
        await chreactCommand(senderSock, targetDestJid, cmdMsg, [postLink], true, true);
        return true;
    } catch (sendErr) {
        console.error('[ChannelForwarder Send Error]:', sendErr.message);
        return false;
    }
}

// Deduplication set for .set arc so multiple sessions in a group don't send duplicate replies
const handledSetArcMsgIds = new Set();

/**
 * Command: .set arc / .setarc
 * Sets the current chat or group as the target destination where `.chreact <post_link>` is automatically sent!
 */
async function setArcTargetCommand(sock, from, msg, isOwner, args = [], groupMetadata = null) {
    const msgId = msg?.key?.id;
    if (msgId) {
        if (handledSetArcMsgIds.has(msgId)) return;
        handledSetArcMsgIds.add(msgId);
        if (handledSetArcMsgIds.size > 1000) {
            handledSetArcMsgIds.delete(handledSetArcMsgIds.values().next().value);
        }
    }

    if (!isOwner) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🔒 *OWNER ONLY COMMAND* 〕━━━┈⊷\n` +
                  `┃ ❌ *Access Denied!*\n` +
                  `┃ Ye command sirf Bot Owner\n` +
                  `┃ (*03438673242*) run kar sakta hai!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const config = loadConfig();
    const sub = (args[0] || '').toLowerCase().trim();

    if (['inbox', 'you', 'self', 'me', 'reset', 'default'].includes(sub)) {
        config.enabled = true;
        config.targetJid = '923438673242@s.whatsapp.net';
        config.targetName = '03438673242 (You / Self-Inbox)';
        saveConfig(config);

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🎯 *ARC TARGET RESET TO INBOX* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Active & Connected\n` +
                  `┃ 📲 *Target:* *03438673242 (You / Inbox)*\n` +
                  `┃ ⌨️ *Auto Command:* \`${config.command || '.chreact'} <post_link>\`\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    }

    const isGroup = from.endsWith('@g.us');
    let targetLabel = from.replace('@s.whatsapp.net', '');
    if (isGroup) {
        targetLabel = groupMetadata?.subject || 'WhatsApp Group';
    } else if (from.startsWith('923438673242')) {
        targetLabel = '03438673242 (You / Inbox)';
    }

    config.enabled = true;
    config.targetJid = from;
    config.targetName = targetLabel;
    saveConfig(config);

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

    return await sock.sendMessage(from, {
        text: `╭━━━〔 🎯 *ARC TARGET CHAT SET* 〕━━━┈⊷\n` +
              `┃ ✅ *Status:* Active & Linked\n` +
              `┃ 📍 *Target ${isGroup ? 'Group' : 'Chat'}:* *${targetLabel}*\n` +
              `┃ 🆔 *JID:* \`${from}\`\n` +
              `┃ ⌨️ *Auto Command:* \`${config.command || '.chreact'} <post_link>\`\n` +
              `┃ 👑 *Set By:* Bot Owner\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `💡 *Ab jab bhi aapke \`.arc\` channel me koi post hogi:*\n` +
              `👉 \`${config.command || '.chreact'} <post_link>\` automatic isi ${isGroup ? 'Group' : 'Chat'} me send hoga aur saare bots se auto-react lag jayega!\n\n` +
              `🔄 *Wapis Inbox (You) me karne ke liye:* \`.set arc inbox\`\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
}

/**
 * Command: .chalert / .chforward
 * Manage the auto post forwarder settings
 */
async function chalertCommand(sock, from, msg, isOwner, args = []) {
    if (!isOwner) {
        return await sock.sendMessage(from, { text: '❌ Sirf Bot Owner is command ko use kar sakta hai.' }, { quoted: msg });
    }

    const config = loadConfig();
    const sub = (args[0] || '').toLowerCase().trim();

    if (sub === 'on') {
        config.enabled = true;
        saveConfig(config);
        return await sock.sendMessage(from, {
            text: `✅ *Channel Post Self-Inbox (.chreact): ON*\n\nAb \`.arc <link>\` me add kiye gaye channels me nayi post aate hi *${config.targetJid.replace('@s.whatsapp.net', '')} (You)* me \`${config.command} <link>\` send ho jayega.`
        }, { quoted: msg });
    }

    if (sub === 'off') {
        config.enabled = false;
        saveConfig(config);
        return await sock.sendMessage(from, {
            text: '🛑 *Channel Post Self-Inbox (.chreact): OFF*'
        }, { quoted: msg });
    }

    if (sub === 'set' && args[1]) {
        let num = args[1].replace(/[^0-9]/g, '');
        if (num.startsWith('0')) num = '92' + num.slice(1);
        if (!num.endsWith('@s.whatsapp.net')) num = num + '@s.whatsapp.net';
        config.targetJid = num;
        saveConfig(config);
        return await sock.sendMessage(from, {
            text: `✅ *Target Self-Chat Number Updated:*\n👉 \`${num.replace('@s.whatsapp.net', '')}\``
        }, { quoted: msg });
    }

    if (sub === 'cmd' && args[1]) {
        config.command = args[1].trim();
        saveConfig(config);
        return await sock.sendMessage(from, {
            text: `✅ *Command Prefix Updated:*\n👉 \`${config.command}\``
        }, { quoted: msg });
    }

    const targetDisplay = config.targetJid.replace('@s.whatsapp.net', '');
    const statusText =
`╭━━━〔 📢 *ARC SELF-INBOX FORWARDER* 〕━━━┈⊷
┃ ⚡ *Status:* ${config.enabled ? '🟢 ON' : '🔴 OFF'}
┃ 📱 *Self-Chat (You):* ${targetDisplay}
┃ ⌨️ *Command Format:* \`${config.command} <post_link>\`
┃ 🎯 *Mode:* Only \`.arc\` Added Channels
┃
┃ 📌 *Commands:*
┃ 👉 *.arc <channel_link>* ➔ Channel add karein
┃ 👉 *.del arc <channel_link>* ➔ Channel remove karein
┃ 👉 *.chalert on / off* ➔ Forwarder toggle karein
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

    return await sock.sendMessage(from, { text: statusText }, { quoted: msg });
}

/**
 * Silently relays a Premium Member's .chreact <post_link> command from Master Owner (03438673242)
 * into the configured .set arc Group/Chat so all bots in that group react to the user's post!
 */
async function relayChreactToArcTarget(sock, originFrom, resolved) {
    try {
        const config = loadConfig();
        const rawTarget = String(config.targetJid || '923438673242@s.whatsapp.net').trim();
        const isTargetGroup = rawTarget.endsWith('@g.us');
        const targetDestJid = (!isTargetGroup && !rawTarget.includes('@'))
            ? `${rawTarget.replace(/[^0-9]/g, '') || '923438673242'}@s.whatsapp.net`
            : rawTarget;

        // If the command was already sent inside the target group/chat, no need to relay again
        if (originFrom === targetDestJid) return null;

        let inviteCode = resolved.code || inviteCache.get(resolved.jid) || null;
        if (!inviteCode && resolved.jid) {
            try {
                const arcConf = loadArcChannelConf(resolved.jid);
                if (arcConf?.invite) inviteCode = arcConf.invite;
                else if (arcConf?.link) {
                    const m = String(arcConf.link).match(/whatsapp\.com\/channel\/([0-9A-Za-z_-]+)/i);
                    if (m) inviteCode = m[1];
                }
            } catch {}
        }
        if (!inviteCode && resolved.jid) {
            try {
                const cached = (typeof hub.listChannels === 'function' ? hub.listChannels() : []).find(c => c && c.jid === resolved.jid);
                if (cached?.invite) inviteCode = cached.invite;
            } catch {}
        }

        if (!inviteCode || !resolved.serverId) return null;

        const postLink = `https://whatsapp.com/channel/${inviteCode}/${resolved.serverId}`;
        const cmdText = `${config.command || '.chreact'} ${postLink}`;

        const masterSock = findTargetSelfSocket(sock, '923438673242');
        const senderSock = masterSock || sock;
        if (!senderSock) return null;

        const sentMsg = await senderSock.sendMessage(targetDestJid, { text: cmdText });
        const sentId = sentMsg?.key?.id || null;
        if (sentId) {
            autoSentMsgIds.add(sentId);
            if (autoSentMsgIds.size > 1000) {
                autoSentMsgIds.delete(autoSentMsgIds.values().next().value);
            }
        }
        return sentId;
    } catch (err) {
        console.error('[RelayChreact Error]:', err.message);
        return null;
    }
}

module.exports = {
    handleNewsletterPost,
    setArcTargetCommand,
    relayChreactToArcTarget,
    chalertCommand,
    isAutoSentMessage,
    loadConfig,
    saveConfig
};
