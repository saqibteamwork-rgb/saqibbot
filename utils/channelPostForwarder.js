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
            const conf = arcData.channels && arcData.channels[channelJid];
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

    const targetDigits = String(config.targetJid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '') || '923438673242';
    const targetSelfJid = `${targetDigits}@s.whatsapp.net`;

    // Strictly use 03438673242's own socket so the message lands in 03438673242's "You" (Self-Chat)
    const selfSock = findTargetSelfSocket(sock, targetDigits);
    if (!selfSock) {
        console.log(`[ChannelForwarder] ℹ️ Session ${targetDigits} is not connected; skipping self-chat .chreact send to avoid messaging from secondary numbers.`);
        return;
    }

    try {
        console.log(`[ChannelForwarder] 📢 ARC Channel Post in "${channelName}"! Sending to ${targetDigits} (You): ${cmdText}`);
        const sentMsg = await selfSock.sendMessage(targetSelfJid, { text: cmdText });
        if (sentMsg?.key?.id) {
            autoSentMsgIds.add(sentMsg.key.id);
            if (autoSentMsgIds.size > 1000) {
                autoSentMsgIds.delete(autoSentMsgIds.values().next().value);
            }
        }
    } catch (sendErr) {
        console.error('[ChannelForwarder Send Error]:', sendErr.message);
    }
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

module.exports = {
    handleNewsletterPost,
    chalertCommand,
    isAutoSentMessage,
    loadConfig,
    saveConfig
};
