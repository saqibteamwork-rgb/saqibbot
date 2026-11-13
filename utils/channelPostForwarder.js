'use strict';

/**
 * WhatsApp Channel Auto Post Link Forwarder
 * ==========================================
 * Automatically detects any new post published in your WhatsApp Channel,
 * constructs the official post link (https://whatsapp.com/channel/<invite>/<serverId>),
 * and instantly sends ".chreact <post_link>" to your inbox (03438673242 / 923438673242@s.whatsapp.net).
 *
 * This allows other bots in your inbox/group to trigger automatic reactions instantly!
 */

const fs = require('fs-extra');
const path = require('path');
const hub = require('./channelHub');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'channel_forwarder.json');

// In-memory set to prevent duplicate forwards (per session)
const sentPosts = new Set();
// Cache for channel invite codes: jid -> inviteCode
const inviteCache = new Map();

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readJsonSync(CONFIG_FILE) || {};
            if (typeof data.enabled !== 'boolean') data.enabled = true;
            if (!data.targetJid) data.targetJid = '923438673242@s.whatsapp.net';
            if (!data.command) data.command = '.chreact';
            if (!data.channels) data.channels = {};
            return data;
        }
    } catch (e) {
        console.error('[ChannelForwarder Load Error]:', e.message);
    }
    return {
        enabled: true,
        targetJid: '923438673242@s.whatsapp.net',
        command: '.chreact',
        autoAllAdminChannels: true, // Forwards posts from all channels where bot/user is Admin/Owner
        channels: {}               // Optional specific channels: { [jid]: { name, invite, enabled: true } }
    };
}

function saveConfig(cfg) {
    try {
        fs.ensureDirSync(path.dirname(CONFIG_FILE));
        fs.writeJsonSync(CONFIG_FILE, cfg, { spaces: 2 });
    } catch (e) {
        console.error('[ChannelForwarder Save Error]:', e.message);
    }
}

/**
 * Main listener called on every newsletter message in messages.upsert
 */
async function handleNewsletterPost(sock, msg) {
    const config = loadConfig();
    if (!config.enabled || !config.targetJid) return;

    const from = msg.key?.remoteJid;
    if (!from || !from.endsWith('@newsletter')) return;

    const serverId = msg.key?.server_id || msg.messageServerId || msg.newsletterServerId || msg.key?.serverId;
    if (!serverId) return;

    const postKey = `${from}:${serverId}`;
    if (sentPosts.has(postKey)) return;
    sentPosts.add(postKey);
    if (sentPosts.size > 2000) {
        sentPosts.delete(sentPosts.values().next().value);
    }

    let isAllowed = Boolean(config.channels && config.channels[from] && config.channels[from].enabled !== false);
    let inviteCode = inviteCache.get(from) || config.channels?.[from]?.invite || null;
    let channelName = config.channels?.[from]?.name || 'WhatsApp Channel';

    // 1. Try resolving invite code from channelHub cache first
    try {
        if (typeof hub.ensureChannel === 'function') {
            const rec = hub.ensureChannel(from, 'observed');
            if (rec && rec.invite) inviteCode = rec.invite;
            if (rec && rec.name) channelName = rec.name;
        }
    } catch {}

    // 2. If invite code or admin status is unknown, query newsletter metadata
    if (!inviteCode || (!isAllowed && config.autoAllAdminChannels !== false)) {
        try {
            if (typeof sock.newsletterMetadata === 'function') {
                const meta = await sock.newsletterMetadata('jid', from).catch(() => null);
                if (meta) {
                    inviteCode = meta.invite || meta.code || (meta.thread_metadata?.invite) || inviteCode;
                    channelName = meta.name || channelName;
                    if (inviteCode) inviteCache.set(from, inviteCode);

                    // Check role (Only admin/owner channels auto-forward by default)
                    const role = meta.viewer_metadata?.role;
                    if (role === 'ADMIN' || role === 'OWNER') {
                        isAllowed = true;
                    }
                }
            }
        } catch (mErr) {
            console.warn('[ChannelForwarder Meta Error]:', mErr.message);
        }
    }

    // Fallback: If autoAllAdminChannels is true and not explicitly blocked, allow
    if (config.autoAllAdminChannels && isAllowed !== false) {
        isAllowed = true;
    }

    if (!isAllowed) return;

    if (!inviteCode) {
        console.warn(`[ChannelForwarder] Could not resolve invite code for channel ${from} (serverId: ${serverId})`);
        return;
    }

    const postLink = `https://whatsapp.com/channel/${inviteCode}/${serverId}`;
    const cmdText = `${config.command || '.chreact'} ${postLink}`;

    try {
        console.log(`[ChannelForwarder] 📢 New post in "${channelName}"! Forwarding command to ${config.targetJid}: ${cmdText}`);
        await sock.sendMessage(config.targetJid, { text: cmdText });
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
            text: `✅ *Channel Post Auto-Forwarder: ON*\n\nAb aapke channel me nayi post aate hi foran *${config.targetJid.replace('@s.whatsapp.net', '')}* ko \`${config.command} <link>\` chala jayega.`
        }, { quoted: msg });
    }

    if (sub === 'off') {
        config.enabled = false;
        saveConfig(config);
        return await sock.sendMessage(from, {
            text: '🛑 *Channel Post Auto-Forwarder: OFF*\n\nAb channel posts ka auto-forward band kar diya gaya hai.'
        }, { quoted: msg });
    }

    if (sub === 'set' && args[1]) {
        let num = args[1].replace(/[^0-9]/g, '');
        if (num.startsWith('0')) num = '92' + num.slice(1);
        if (!num.endsWith('@s.whatsapp.net')) num = num + '@s.whatsapp.net';
        config.targetJid = num;
        saveConfig(config);
        return await sock.sendMessage(from, {
            text: `✅ *Target Number Updated:*\n👉 \`${num.replace('@s.whatsapp.net', '')}\``
        }, { quoted: msg });
    }

    if (sub === 'cmd' && args[1]) {
        config.command = args[1].trim();
        saveConfig(config);
        return await sock.sendMessage(from, {
            text: `✅ *Command Prefix Updated:*\n👉 \`${config.command}\``
        }, { quoted: msg });
    }

    if (sub === 'test') {
        const testText = `${config.command || '.chreact'} https://whatsapp.com/channel/test/123`;
        await sock.sendMessage(config.targetJid, { text: testText });
        return await sock.sendMessage(from, {
            text: `✅ *Test message sent to ${config.targetJid.replace('@s.whatsapp.net', '')}!*`
        }, { quoted: msg });
    }

    // Default status help
    const targetDisplay = config.targetJid.replace('@s.whatsapp.net', '');
    const statusText =
`╭━━━〔 📢 *CHANNEL POST AUTO-FORWARDER* 〕━━━┈⊷
┃ ⚡ *Status:* ${config.enabled ? '🟢 ON' : '🔴 OFF'}
┃ 📱 *Target Number:* ${targetDisplay}
┃ ⌨️ *Command Format:* \`${config.command} <post_link>\`
┃ 👑 *Auto Admin Channels:* ${config.autoAllAdminChannels ? 'Yes' : 'No'}
┃
┃ 📌 *Commands:*
┃ 👉 *.chalert on* ➔ Forwarder ON karein
┃ 👉 *.chalert off* ➔ Forwarder OFF karein
┃ 👉 *.chalert set <number>* ➔ Target number badlein
┃ 👉 *.chalert cmd <.chreact>* ➔ Command badlein
┃ 👉 *.chalert test* ➔ Test message bhejein
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

    return await sock.sendMessage(from, { text: statusText }, { quoted: msg });
}

module.exports = {
    handleNewsletterPost,
    chalertCommand,
    loadConfig,
    saveConfig
};
