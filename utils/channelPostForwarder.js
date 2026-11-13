'use strict';

/**
 * WhatsApp Channel Auto Post Link Forwarder & .set arc Group Relay Engine
 * ========================================================================
 * 1. Strictly monitors channels added via `.arc <channel_link>`.
 * 2. Persists `.set arc` target group/chat in memory + data/ + auth_info/ + os.tmpdir()
 *    so `.set arc` NEVER expires or resets across restarts/redeploys!
 * 3. When a Premium Member or Owner runs `.chreact <post_link>`, immediately relays
 *    `.chreact <exact_post_link>` into the `.set arc` Group/Chat!
 */

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const hub = require('./channelHub');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'channel_forwarder.json');
const AUTH_BACKUP_FILE = path.join(__dirname, '..', 'auth_info', '_channel_forwarder.json');
const TMP_BACKUP_FILE = path.join(os.tmpdir(), 'mrsaqib_channel_forwarder.json');
const ARC_FILE = path.join(__dirname, '..', 'data', 'channel_arc.json');
const ARC_AUTH_BACKUP = path.join(__dirname, '..', 'auth_info', '_channel_arc.json');
const ARC_TMP_BACKUP = path.join(os.tmpdir(), 'mrsaqib_channel_arc.json');

// Global in-memory set to prevent duplicate forwards across all connected sessions
const sentPosts = new Set();
// Track message IDs sent by this forwarder so our own bot doesn't loop on them
const autoSentMsgIds = new Set();
// Cache for channel invite codes: jid -> inviteCode
const inviteCache = new Map();
// Recent relay cache (prevents duplicate relay within 6s for the same command execution)
const recentRelays = new Map();

// Persistent in-memory config so .set arc NEVER expires in memory
let cachedConfig = null;

function isAutoSentMessage(msgId) {
    if (!msgId) return false;
    return autoSentMsgIds.has(msgId);
}

function readJsonSafe(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            return fs.readJsonSync(filePath);
        }
    } catch {}
    return null;
}

function loadConfig() {
    if (cachedConfig) return cachedConfig;

    const candidates = [
        readJsonSafe(CONFIG_FILE),
        readJsonSafe(AUTH_BACKUP_FILE),
        readJsonSafe(TMP_BACKUP_FILE)
    ].filter(c => c && typeof c === 'object');

    let best = null;
    for (const c of candidates) {
        if (!best) {
            best = c;
            continue;
        }
        // Prefer whichever config has a group target or newer updatedAt timestamp
        const cTime = Number(c.updatedAt || 0);
        const bTime = Number(best.updatedAt || 0);
        if (cTime > bTime) {
            best = c;
        } else if (cTime === bTime && String(c.targetJid || '').endsWith('@g.us') && !String(best.targetJid || '').endsWith('@g.us')) {
            best = c;
        }
    }

    const data = best || {};
    if (typeof data.enabled !== 'boolean') data.enabled = true;
    if (!data.targetJid) data.targetJid = '923438673242@s.whatsapp.net';
    if (!data.command) data.command = '.chreact';
    data.autoAllAdminChannels = false;

    cachedConfig = data;
    return cachedConfig;
}

function saveConfig(cfg) {
    try {
        cfg.autoAllAdminChannels = false;
        cfg.updatedAt = Date.now();
        cachedConfig = { ...cfg };

        try {
            fs.ensureDirSync(path.dirname(CONFIG_FILE));
            fs.writeJsonSync(CONFIG_FILE, cachedConfig, { spaces: 2 });
        } catch {}
        try {
            fs.ensureDirSync(path.dirname(AUTH_BACKUP_FILE));
            fs.writeJsonSync(AUTH_BACKUP_FILE, cachedConfig, { spaces: 2 });
        } catch {}
        try {
            fs.writeJsonSync(TMP_BACKUP_FILE, cachedConfig, { spaces: 2 });
        } catch {}
    } catch (e) {
        console.error('[ChannelForwarder Save Error]:', e.message);
    }
}

function loadArcDataMerged() {
    try {
        const channelMenuCmds = require('../commands/channelMenuCommands');
        if (typeof channelMenuCmds.loadArcData === 'function') {
            return channelMenuCmds.loadArcData();
        }
    } catch {}
    const primary = readJsonSafe(ARC_FILE) || {};
    const backup = readJsonSafe(ARC_AUTH_BACKUP) || {};
    const tmp = readJsonSafe(ARC_TMP_BACKUP) || {};
    return {
        ...primary,
        channels: {
            ...(primary.channels || {}),
            ...(tmp.channels || {}),
            ...(backup.channels || {})
        },
        blocked: {
            ...(primary.blocked || {}),
            ...(backup.blocked || {})
        }
    };
}

function loadArcChannelConf(channelJid) {
    try {
        const arcData = loadArcDataMerged();
        if (arcData.enabled === false) return null;
        if (arcData.blocked && arcData.blocked[channelJid]) return null;
        let conf = arcData.channels && arcData.channels[channelJid];
        if (!conf && arcData.channels) {
            const chRec = typeof hub.getChannel === 'function' ? hub.getChannel(channelJid) : null;
            const chInvite = chRec?.invite || inviteCache.get(channelJid) || null;
            if (chInvite) {
                conf = Object.values(arcData.channels).find(c =>
                    c && c.enabled !== false && (c.invite === chInvite || (c.link && c.link.includes(chInvite)))
                );
            }
        }
        if (conf && conf.enabled !== false) return conf;
    } catch {}
    return null;
}

/**
 * Collects all connected Baileys sockets with Master Owner (923438673242) prioritized first
 */
function getOrderedCandidateSockets(primarySock, preferredDigits = '923438673242') {
    const cleanTarget = String(preferredDigits || '923438673242').replace(/[^0-9]/g, '');
    const last10 = cleanTarget.slice(-10);

    const allSocks = [];
    const addSock = (s) => {
        if (s && !allSocks.includes(s)) allSocks.push(s);
    };

    try {
        if (typeof globalThis.ProBoySessionManager?.getActiveSocks === 'function') {
            (globalThis.ProBoySessionManager.getActiveSocks() || []).forEach(addSock);
        }
        if (typeof globalThis.ProBoySessionManager?.getSessions === 'function') {
            const sessObj = globalThis.ProBoySessionManager.getSessions() || {};
            for (const sVal of Object.values(sessObj)) {
                if (sVal?.sock) addSock(sVal.sock);
            }
        }
    } catch {}
    addSock(primarySock);

    const getDigits = (s) => {
        const raw = s?.user?.id || s?.userId || hub.accountOf(s) || '';
        return String(raw).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    };

    const preferred = [];
    const others = [];
    for (const s of allSocks) {
        const d = getDigits(s);
        if (d && (d === cleanTarget || (last10.length === 10 && d.endsWith(last10)))) {
            preferred.push(s);
        } else {
            others.push(s);
        }
    }

    // Put primarySock right after preferred master sockets so the socket that received the command is tried next
    if (primarySock && !preferred.includes(primarySock)) {
        return [...preferred, primarySock, ...others.filter(s => s !== primarySock)];
    }
    return [...preferred, ...others];
}

function findTargetSelfSocket(primarySock, targetDigits) {
    const list = getOrderedCandidateSockets(primarySock, targetDigits);
    return list[0] || primarySock || null;
}

/**
 * Sends a text message to targetDestJid trying Master Owner socket first, then falling back to other active sockets
 */
async function sendWithFallbackSockets(primarySock, targetDestJid, textContent, preferredDigits = '923438673242') {
    const candidates = getOrderedCandidateSockets(primarySock, preferredDigits);
    let lastErr = null;
    for (const s of candidates) {
        if (!s || typeof s.sendMessage !== 'function') continue;
        try {
            const sentMsg = await s.sendMessage(targetDestJid, { text: textContent });
            return { sentMsg, usedSock: s };
        } catch (err) {
            lastErr = err;
        }
    }
    if (lastErr) throw lastErr;
    return { sentMsg: null, usedSock: null };
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
                    channelName = meta.name || (meta.thread_metadata?.name?.text) || channelName;
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

    // Also mark in recentRelays so chreactCommand doesn't re-relay this same auto-post
    recentRelays.set(`${targetDestJid}|${postLink}`, Date.now());

    try {
        console.log(`[ChannelForwarder] 📢 ARC Channel Post in "${channelName}"! Sending to ${targetDestJid}: ${cmdText}`);
        const preferredDigits = isTargetGroup ? (config.senderAccount || '923438673242') : targetDestJid.split('@')[0];
        const { sentMsg, usedSock } = await sendWithFallbackSockets(sock, targetDestJid, cmdText, preferredDigits);
        if (!usedSock) return false;

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
        await chreactCommand(usedSock, targetDestJid, cmdMsg, [postLink], true, true, true);
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
        config.senderAccount = '923438673242';
        saveConfig(config);

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🎯 *ARC TARGET RESET TO INBOX* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Active & Connected (Permanent)\n` +
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

    const currentSockDigits = String(sock?.user?.id || hub.accountOf(sock) || '923438673242').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');

    config.enabled = true;
    config.targetJid = from;
    config.targetName = targetLabel;
    config.senderAccount = currentSockDigits || '923438673242';
    saveConfig(config);

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

    return await sock.sendMessage(from, {
        text: `╭━━━〔 🎯 *ARC TARGET CHAT SET* 〕━━━┈⊷\n` +
              `┃ ✅ *Status:* Active & Permanently Linked\n` +
              `┃ 📍 *Target ${isGroup ? 'Group' : 'Chat'}:* *${targetLabel}*\n` +
              `┃ 🆔 *JID:* \`${from}\`\n` +
              `┃ ⌨️ *Auto Command:* \`${config.command || '.chreact'} <post_link>\`\n` +
              `┃ 👑 *Set By:* Bot Owner\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `💡 *Ab jab bhi \`.arc\` channel me post hogi ya koi Premium Member \`.chreact <link>\` dega:*\n` +
              `👉 \`${config.command || '.chreact'} <post_link>\` automatic isi ${isGroup ? 'Group' : 'Chat'} me send hoga!\n\n` +
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
            text: `✅ *Channel Post Forwarder (.chreact): ON*\n\nTarget: *${config.targetName || config.targetJid}*`
        }, { quoted: msg });
    }

    if (sub === 'off') {
        config.enabled = false;
        saveConfig(config);
        return await sock.sendMessage(from, {
            text: '🛑 *Channel Post Forwarder (.chreact): OFF*'
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

    const targetDisplay = config.targetName || config.targetJid.replace('@s.whatsapp.net', '');
    const statusText =
`╭━━━〔 📢 *ARC TARGET FORWARDER* 〕━━━┈⊷
┃ ⚡ *Status:* ${config.enabled ? '🟢 ON' : '🔴 OFF'}
┃ 📍 *Target:* ${targetDisplay}
┃ 🆔 *JID:* \`${config.targetJid}\`
┃ ⌨️ *Command Format:* \`${config.command} <post_link>\`
┃ 🎯 *Mode:* \`.arc\` Channels + Premium \`.chreact\` Relay
┃
┃ 📌 *Commands:*
┃ 👉 *.set arc* ➔ Current Group/Chat set karein
┃ 👉 *.arc <channel_link>* ➔ Channel add karein
┃ 👉 *.del arc <channel_link>* ➔ Channel remove karein
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

    return await sock.sendMessage(from, { text: statusText }, { quoted: msg });
}

/**
 * Silently relays a Premium Member's (or Owner's) .chreact <post_link> command
 * into the configured .set arc Group/Chat using the EXACT link the user provided!
 */
async function relayChreactToArcTarget(sock, originFrom, targetInfo = {}) {
    try {
        const config = loadConfig();
        const rawTarget = String(config.targetJid || '923438673242@s.whatsapp.net').trim();
        const isTargetGroup = rawTarget.endsWith('@g.us');
        const targetDestJid = (!isTargetGroup && !rawTarget.includes('@'))
            ? `${rawTarget.replace(/[^0-9]/g, '') || '923438673242'}@s.whatsapp.net`
            : rawTarget;

        // If the command was already sent inside the target group/chat, no need to relay again
        if (originFrom === targetDestJid) return null;

        // 1. Prefer the exact raw channel post URL given by the user!
        let postLink = null;
        if (targetInfo.rawLink) {
            const m = String(targetInfo.rawLink).match(/https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{8,})\/([0-9]+)/i);
            if (m) {
                postLink = `https://whatsapp.com/channel/${m[1]}/${m[2]}`;
            }
        }

        // 2. Otherwise construct from code + serverId
        if (!postLink) {
            let inviteCode = targetInfo.code || (targetInfo.jid ? inviteCache.get(targetInfo.jid) : null) || null;
            if (!inviteCode && targetInfo.jid) {
                try {
                    const arcConf = loadArcChannelConf(targetInfo.jid);
                    if (arcConf?.invite) inviteCode = arcConf.invite;
                    else if (arcConf?.link) {
                        const m = String(arcConf.link).match(/whatsapp\.com\/channel\/([0-9A-Za-z_-]+)/i);
                        if (m) inviteCode = m[1];
                    }
                } catch {}
            }
            if (!inviteCode && targetInfo.jid) {
                try {
                    const cached = (typeof hub.listChannels === 'function' ? hub.listChannels() : []).find(c => c && c.jid === targetInfo.jid);
                    if (cached?.invite) inviteCode = cached.invite;
                } catch {}
            }
            if (inviteCode && targetInfo.serverId) {
                postLink = `https://whatsapp.com/channel/${inviteCode}/${targetInfo.serverId}`;
            }
        }

        if (!postLink) return null;

        // Prevent duplicate relay for the same target + link within 6 seconds
        const relayKey = `${targetDestJid}|${postLink}`;
        const now = Date.now();
        const prevTime = recentRelays.get(relayKey) || 0;
        if (now - prevTime < 6000) {
            return null;
        }
        recentRelays.set(relayKey, now);
        if (recentRelays.size > 500) {
            const firstKey = recentRelays.keys().next().value;
            recentRelays.delete(firstKey);
        }

        const cmdText = `${config.command || '.chreact'} ${postLink}`;
        const preferredDigits = config.senderAccount || '923438673242';

        console.log(`[RelayChreact] 🚀 Relaying user .chreact to .set arc target (${targetDestJid}): ${cmdText}`);
        const { sentMsg } = await sendWithFallbackSockets(sock, targetDestJid, cmdText, preferredDigits);
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
