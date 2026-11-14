'use strict';

/**
 * WhatsApp Channel Auto Post Link Forwarder & .set arc Group Relay Engine
 * ========================================================================
 * 1. Strictly monitors channels added via `.arc <channel_link>`.
 * 2. Per-Channel Target Routing:
 *    - Running `.set arc <channel_link>` in Group A routes Channel 1 to Group A!
 *    - Running `.set arc <channel_link_2>` in Group B routes Channel 2 to Group B!
 *    - Running `.set arc <channel_link> <group_link_or_jid>` routes channel to specified group!
 *    - Running `.set arc` alone sets the global default target group/chat.
 * 3. ZERO MEMORY LOSS:
 *    - Targets are permanently persisted across 6 locations:
 *      data/channel_forwarder.json, auth_info/_channel_forwarder.json, os.tmpdir(),
 *      data/channel_arc.json, auth_info/_channel_arc.json, os.tmpdir().
 * 4. Silently relays .chreact and .chvote to the assigned channel target group!
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

function parseChannelInput(str) {
    if (!str || typeof str !== 'string') return null;
    const clean = str.trim();
    const linkMatch = clean.match(/whatsapp\.com\/channel\/([0-9A-Za-z_-]+)/i);
    if (linkMatch) return { code: linkMatch[1], raw: clean };
    const jidMatch = clean.match(/([0-9]+@newsletter)/i);
    if (jidMatch) return { jid: jidMatch[1], raw: clean };
    if (/^[0-9]{10,25}$/.test(clean)) return { jid: `${clean}@newsletter`, raw: clean };
    return null;
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

function loadConfig() {
    if (cachedConfig) return cachedConfig;

    const candidates = [
        readJsonSafe(CONFIG_FILE),
        readJsonSafe(AUTH_BACKUP_FILE),
        readJsonSafe(TMP_BACKUP_FILE)
    ].filter(c => c && typeof c === 'object');

    let best = null;
    const mergedTargets = {};

    for (const c of candidates) {
        if (!best) {
            best = { ...c };
        } else {
            const cTime = Number(c.updatedAt || 0);
            const bTime = Number(best.updatedAt || 0);
            if (cTime > bTime) {
                best = { ...c };
            } else if (cTime === bTime && String(c.targetJid || '').endsWith('@g.us') && !String(best.targetJid || '').endsWith('@g.us')) {
                best = { ...c };
            }
        }
        if (c.channelTargets && typeof c.channelTargets === 'object') {
            for (const [chKey, tObj] of Object.entries(c.channelTargets)) {
                if (tObj && typeof tObj === 'object' && tObj.targetJid) {
                    if (!mergedTargets[chKey] || Number(tObj.updatedAt || 0) >= Number(mergedTargets[chKey].updatedAt || 0)) {
                        mergedTargets[chKey] = { ...tObj };
                    }
                }
            }
        }
    }

    const data = best || {};
    if (typeof data.enabled !== 'boolean') data.enabled = true;
    if (!data.targetJid) data.targetJid = '923438673242@s.whatsapp.net';
    if (!data.command) data.command = '.chreact';
    data.autoAllAdminChannels = false;
    data.channelTargets = {
        ...mergedTargets,
        ...(data.channelTargets || {})
    };

    // Also sync targets from channel_arc.json if any channel has targetJid
    try {
        const arcData = loadArcDataMerged();
        if (arcData?.channels) {
            for (const [chJid, chConf] of Object.entries(arcData.channels)) {
                if (chConf?.targetJid) {
                    const existing = data.channelTargets[chJid] || (chConf.invite ? data.channelTargets[chConf.invite] : null);
                    if (!existing || Number(chConf.targetUpdatedAt || 0) >= Number(existing.updatedAt || 0)) {
                        const tEntry = {
                            channelJid: chJid,
                            channelName: chConf.name || 'WhatsApp Channel',
                            invite: chConf.invite || null,
                            targetJid: chConf.targetJid,
                            targetName: chConf.targetName || chConf.targetJid,
                            updatedAt: Number(chConf.targetUpdatedAt || chConf.addedAt || Date.now())
                        };
                        data.channelTargets[chJid] = tEntry;
                        if (chConf.invite) data.channelTargets[chConf.invite] = tEntry;
                    }
                }
            }
        }
    } catch {}

    cachedConfig = data;
    return cachedConfig;
}

function saveConfig(cfg) {
    try {
        cfg.autoAllAdminChannels = false;
        cfg.updatedAt = Date.now();
        if (!cfg.channelTargets || typeof cfg.channelTargets !== 'object') {
            cfg.channelTargets = {};
        }
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
 * Gets configured target for a specific channel (checks arcData + channel_forwarder.json)
 */
function getChannelTarget(channelJid, inviteCode = null) {
    const config = loadConfig();
    if (!config.enabled) return null;

    if (channelJid) {
        try {
            const arcConf = loadArcChannelConf(channelJid);
            if (arcConf?.targetJid) {
                return {
                    targetJid: arcConf.targetJid,
                    targetName: arcConf.targetName || arcConf.targetJid
                };
            }
        } catch {}
    }

    if (config.channelTargets) {
        const entry = (channelJid && config.channelTargets[channelJid]) ||
                      (inviteCode && config.channelTargets[inviteCode]);
        if (entry?.targetJid) {
            return {
                targetJid: entry.targetJid,
                targetName: entry.targetName || entry.targetJid
            };
        }
    }

    return null;
}

/**
 * Resolves effective target destination for a channel post or relay:
 * Returns channel-specific target if set, otherwise falls back to global default target
 */
function resolveEffectiveTarget(channelJid = null, inviteCode = null) {
    const config = loadConfig();
    const chTarget = getChannelTarget(channelJid, inviteCode);
    const rawTarget = chTarget?.targetJid || config.targetJid || '923438673242@s.whatsapp.net';
    const targetName = chTarget?.targetName || config.targetName || rawTarget;

    const isTargetGroup = rawTarget.endsWith('@g.us');
    let targetDestJid = rawTarget;
    if (!isTargetGroup && !rawTarget.includes('@')) {
        const d = rawTarget.replace(/[^0-9]/g, '') || '923438673242';
        targetDestJid = `${d}@s.whatsapp.net`;
    }

    return {
        targetDestJid,
        targetName,
        isTargetGroup,
        isCustomRoute: Boolean(chTarget)
    };
}

/**
 * Removes custom target mapping for a channel so it reverts to default
 */
function removeChannelTarget(channelJid, inviteCode = null) {
    const config = loadConfig();
    let changed = false;
    if (config.channelTargets) {
        if (channelJid && config.channelTargets[channelJid]) {
            delete config.channelTargets[channelJid];
            changed = true;
        }
        if (inviteCode && config.channelTargets[inviteCode]) {
            delete config.channelTargets[inviteCode];
            changed = true;
        }
    }
    if (changed) {
        saveConfig(config);
    }
    return changed;
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

    if (primarySock && !preferred.includes(primarySock)) {
        return [...preferred, primarySock, ...others.filter(s => s !== primarySock)];
    }
    return [...preferred, ...others];
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
    if (!config.enabled) return false;

    const from = msg.key?.remoteJid;
    if (!from || !from.endsWith('@newsletter')) return false;

    const serverId = msg.key?.server_id || msg.messageServerId || msg.newsletterServerId || msg.key?.serverId;
    if (!serverId) return false;

    // Strictly verify this channel was added via .arc
    const arcConf = passedArcConf || loadArcChannelConf(from);
    if (!arcConf || arcConf.enabled === false) return false;

    // Global synchronous deduplication so multiple sessions never send duplicate .chreact commands
    const postKey = `${from}:${serverId}`;
    if (sentPosts.has(postKey)) return false;
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
        return false;
    }

    const postLink = `https://whatsapp.com/channel/${inviteCode}/${serverId}`;
    const cmdText = `${config.command || '.chreact'} ${postLink}`;

    // Resolve channel-specific target group/chat or fallback to default
    const { targetDestJid, targetName, isTargetGroup, isCustomRoute } = resolveEffectiveTarget(from, inviteCode);

    // Also mark in recentRelays so chreactCommand doesn't re-relay this same auto-post
    recentRelays.set(`${targetDestJid}|${postLink}`, Date.now());

    try {
        console.log(`[ChannelForwarder] 📢 ARC Post in "${channelName}"! Route: ${isCustomRoute ? '🎯 Custom' : '🌐 Default'} ➔ Sending to "${targetName}" (${targetDestJid}): ${cmdText}`);
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
 * Sets target destination where `.chreact <post_link>` is automatically sent!
 *
 * Supports:
 * 1) `.set arc <channel_link>` (inside Group A) ➔ Routes Channel 1 to Group A!
 * 2) `.set arc <channel_link> <group_link_or_jid>` ➔ Routes Channel to specified group!
 * 3) `.set arc` (alone) ➔ Sets default fallback target to current chat/group!
 * 4) `.set arc list` ➔ Shows full overview of all channel routes!
 * 5) `.set arc reset <channel_link>` ➔ Removes custom route for that channel!
 * 6) `.set arc inbox` ➔ Resets default fallback target to Owner Inbox!
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
        try {
            const ownerManager = require('./ownerManager');
            if (await ownerManager.verifyPremiumOrOwnerAsync(sock, msg, from, groupMetadata)) {
                isOwner = true;
            }
        } catch {}
    }

    if (!isOwner) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🔒 *OWNER ONLY COMMAND* 〕━━━┈⊷\n` +
                  `┃ ❌ *Access Denied!*\n` +
                  `┃ Ye command sirf Bot Owner\n` +
                  `┃ (*03438673242*) ya Premium Members\n` +
                  `┃ run kar sakte hain!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const config = loadConfig();

    // Clean up args (remove accidental repeated 'arc' or 'set' keywords)
    let cleanArgs = [...args];
    if (cleanArgs[0] && ['arc', 'set', 'autochreact', 'chreact'].includes(cleanArgs[0].toLowerCase())) {
        cleanArgs = cleanArgs.slice(1);
    }

    const firstSub = (cleanArgs[0] || '').toLowerCase().trim();

    // -------------------------------------------------------------------------
    // 1. .set arc list / .set arc status / .set arc routes
    // -------------------------------------------------------------------------
    if (['list', 'ls', 'status', 'info', 'routes', 'all'].includes(firstSub) && cleanArgs.length === 1) {
        const arcData = loadArcDataMerged();
        const chTargets = config.channelTargets || {};
        const entries = Object.entries(arcData.channels || {});

        let msgText = `╭━━━〔 🎯 *ARC TARGET ROUTING OVERVIEW* 〕━━━┈⊷\n` +
                      `┃ ⚡ *Status:* ${config.enabled ? '🟢 Active (ON)' : '🔴 Stopped (OFF)'}\n` +
                      `┃ 📍 *Default Target:* *${config.targetName || config.targetJid}*\n` +
                      `┃ 🆔 *Default JID:* \`${config.targetJid}\`\n` +
                      `┃ ⌨️ *Auto Command:* \`${config.command || '.chreact'} <post_link>\`\n` +
                      `┃ 📺 *Total Channels:* ${entries.length}\n`;

        const routedChannels = [];
        const defaultChannels = [];

        for (const [jid, ch] of entries) {
            const ct = (chTargets && (chTargets[jid] || (ch.invite && chTargets[ch.invite]))) || null;
            const targetJid = ch.targetJid || ct?.targetJid || null;
            const targetName = ch.targetName || ct?.targetName || (targetJid ? (targetJid.endsWith('@g.us') ? 'WhatsApp Group' : 'Private Chat') : null);

            if (targetJid && targetJid !== config.targetJid) {
                routedChannels.push({
                    name: ch.name || 'WhatsApp Channel',
                    jid,
                    invite: ch.invite,
                    targetJid,
                    targetName
                });
            } else {
                defaultChannels.push({
                    name: ch.name || 'WhatsApp Channel',
                    jid,
                    invite: ch.invite
                });
            }
        }

        if (routedChannels.length > 0) {
            msgText += `┃\n┃ 🎯 *Custom Routed Channels (${routedChannels.length}):*\n`;
            routedChannels.forEach((rc, i) => {
                msgText += `┃ ${i + 1}. *${rc.name}*\n` +
                           `┃    📢 Channel: \`${rc.jid}\`\n` +
                           `┃    📍 Target: *${rc.targetName}*\n` +
                           `┃    📬 JID: \`${rc.targetJid}\`\n`;
            });
        }

        if (defaultChannels.length > 0) {
            msgText += `┃\n┃ 🌐 *Default Forwarding Channels (${defaultChannels.length}):*\n`;
            defaultChannels.forEach((dc) => {
                msgText += `┃ • *${dc.name}* ➔ Default Target\n`;
            });
        }

        msgText += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                   `💡 *Guide:*\n` +
                   `👉 Group me likhein: \`.set arc <channel_link>\` ➔ Channel us group me map ho jayega!\n` +
                   `👉 Route hatane ke liye: \`.set arc reset <channel_link>\`\n` +
                   `👉 Default reset ke liye: \`.set arc inbox\``;

        await sock.sendMessage(from, { react: { text: '📋', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, { text: msgText }, { quoted: msg });
    }

    // -------------------------------------------------------------------------
    // 2. .set arc reset <channel_link> / .set arc del <channel_link>
    // -------------------------------------------------------------------------
    if (['del', 'delete', 'remove', 'rm', 'reset'].includes(firstSub) && cleanArgs[1]) {
        const norm = parseChannelInput(cleanArgs[1]);
        const arcData = loadArcDataMerged();
        let targetChannelJid = norm?.jid || null;
        let inviteCode = norm?.code || null;
        let channelName = 'WhatsApp Channel';

        if (inviteCode && !targetChannelJid && arcData.channels) {
            const found = Object.values(arcData.channels).find(c =>
                c && (c.invite === inviteCode || (c.link && c.link.includes(inviteCode))) && c.jid
            );
            if (found) {
                targetChannelJid = found.jid;
                if (found.name) channelName = found.name;
            }
        }
        if (!targetChannelJid && inviteCode) targetChannelJid = `${inviteCode}@newsletter`;
        if (targetChannelJid && arcData.channels?.[targetChannelJid]?.name) {
            channelName = arcData.channels[targetChannelJid].name;
        }

        let removed = false;
        if (config.channelTargets) {
            if (targetChannelJid && config.channelTargets[targetChannelJid]) {
                delete config.channelTargets[targetChannelJid];
                removed = true;
            }
            if (inviteCode && config.channelTargets[inviteCode]) {
                delete config.channelTargets[inviteCode];
                removed = true;
            }
            if (removed) saveConfig(config);
        }

        try {
            const channelMenuCmds = require('../commands/channelMenuCommands');
            const liveArcData = channelMenuCmds.loadArcData();
            if (targetChannelJid && liveArcData.channels?.[targetChannelJid]?.targetJid) {
                delete liveArcData.channels[targetChannelJid].targetJid;
                delete liveArcData.channels[targetChannelJid].targetName;
                delete liveArcData.channels[targetChannelJid].targetUpdatedAt;
                channelMenuCmds.saveArcData(liveArcData);
                removed = true;
            }
        } catch {}

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🔄 *CHANNEL TARGET ROUTE RESET* 〕━━━┈⊷\n` +
                  `┃ 📢 *Channel:* *${channelName}*\n` +
                  `┃ 🆔 *JID:* \`${targetChannelJid || cleanArgs[1]}\`\n` +
                  `┃ 📍 *Status:* Custom target route remove ho gaya!\n` +
                  `┃ 🌐 *Now Forwarding to:* Default Target (*${config.targetName || config.targetJid}*)\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    // -------------------------------------------------------------------------
    // 3. .set arc inbox / .set arc default (Global Default Reset)
    // -------------------------------------------------------------------------
    if (['inbox', 'you', 'self', 'me', 'default'].includes(firstSub) || (firstSub === 'reset' && cleanArgs.length === 1)) {
        config.enabled = true;
        config.targetJid = '923438673242@s.whatsapp.net';
        config.targetName = '03438673242 (You / Self-Inbox)';
        config.senderAccount = '923438673242';
        saveConfig(config);

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🎯 *DEFAULT ARC TARGET RESET TO INBOX* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Active & Connected (Permanent)\n` +
                  `┃ 📲 *Target:* *03438673242 (You / Inbox)*\n` +
                  `┃ ⌨️ *Auto Command:* \`${config.command || '.chreact'} <post_link>\`\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    }

    // -------------------------------------------------------------------------
    // 4. Check for Channel Input in args or Quoted Message
    // -------------------------------------------------------------------------
    let rawChannelInput = null;
    let targetArg = null;

    for (let i = 0; i < cleanArgs.length; i++) {
        const item = cleanArgs[i];
        if (parseChannelInput(item)) {
            rawChannelInput = item;
            const rest = cleanArgs.filter((_, idx) => idx !== i);
            if (rest.length > 0) {
                targetArg = rest.join(' ').trim();
            }
            break;
        }
    }

    // If channel wasn't passed in args, check if the user quoted a channel post or link
    if (!rawChannelInput) {
        const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
        const fwdNewsletter = msg?.message?.extendedTextMessage?.contextInfo?.forwardedNewsletterMessageInfo;
        if (fwdNewsletter?.newsletterJid) {
            rawChannelInput = fwdNewsletter.newsletterJid;
        } else if (quotedText) {
            const m = quotedText.match(/https?:\/\/(?:www\.)?whatsapp\.com\/channel\/[0-9A-Za-z_-]+/i);
            if (m) rawChannelInput = m[0];
        }
        if (rawChannelInput && cleanArgs.length > 0) {
            targetArg = cleanArgs.join(' ').trim();
        }
    }

    // -------------------------------------------------------------------------
    // 5. PER-CHANNEL TARGET CONFIGURATION (.set arc <channel_link> [target])
    // -------------------------------------------------------------------------
    if (rawChannelInput) {
        const norm = parseChannelInput(rawChannelInput);
        let targetChannelJid = norm?.jid || null;
        let inviteCode = norm?.code || null;
        let channelName = 'WhatsApp Channel';

        const arcData = loadArcDataMerged();

        // 1. Resolve channel from existing ARC data
        if (inviteCode && !targetChannelJid && arcData.channels) {
            const existing = Object.values(arcData.channels).find(c =>
                c && (c.invite === inviteCode || (c.link && c.link.includes(inviteCode))) && c.jid
            );
            if (existing) {
                targetChannelJid = existing.jid;
                if (existing.name) channelName = existing.name;
            }
        }

        // 2. Resolve from hub cache
        if (!targetChannelJid && inviteCode) {
            const cached = (typeof hub.listChannels === 'function' ? hub.listChannels() : []).find(c =>
                c && (c.invite === inviteCode || (c.link && c.link.includes(inviteCode))) && c.jid
            );
            if (cached) {
                targetChannelJid = cached.jid;
                if (cached.name) channelName = cached.name;
            }
        }

        // 3. Resolve from WhatsApp API
        if (inviteCode && (!targetChannelJid || channelName === 'WhatsApp Channel')) {
            try {
                if (typeof sock.newsletterMetadata === 'function') {
                    const rawMeta = await sock.newsletterMetadata('invite', inviteCode).catch(() => null);
                    const parsedMeta = (typeof hub.parseMeta === 'function' ? hub.parseMeta(rawMeta) : null) || rawMeta;
                    if (parsedMeta?.jid || parsedMeta?.id) {
                        targetChannelJid = parsedMeta.jid || parsedMeta.id;
                        const n = parsedMeta.name || rawMeta?.thread_metadata?.name?.text;
                        if (n) channelName = n;
                    }
                }
            } catch {}
        }

        if (!targetChannelJid && inviteCode) {
            targetChannelJid = `${inviteCode}@newsletter`;
        }

        if (targetChannelJid && arcData.channels?.[targetChannelJid]?.name) {
            channelName = arcData.channels[targetChannelJid].name;
        }

        // Determine destination chat/group
        let destJid = from;
        let destLabel = from.endsWith('@g.us') ? (groupMetadata?.subject || 'WhatsApp Group') : 'Current Chat';

        if (targetArg) {
            const groupInviteMatch = targetArg.match(/chat\.whatsapp\.com\/([0-9A-Za-z_-]+)/i);
            if (groupInviteMatch) {
                const gCode = groupInviteMatch[1];
                try {
                    if (typeof sock.groupGetInviteInfo === 'function') {
                        const gInfo = await sock.groupGetInviteInfo(gCode);
                        if (gInfo?.id) {
                            destJid = gInfo.id.includes('@') ? gInfo.id : `${gInfo.id}@g.us`;
                            destLabel = gInfo.subject || 'WhatsApp Group';
                        }
                    }
                } catch (gErr) {
                    console.warn('[SetArcTarget] Group invite lookup failed:', gErr.message);
                }
            } else if (targetArg.includes('@g.us')) {
                const jidM = targetArg.match(/([0-9]+@g\.us)/i);
                if (jidM) {
                    destJid = jidM[1];
                    try {
                        const gMeta = await sock.groupMetadata(destJid).catch(() => null);
                        if (gMeta?.subject) destLabel = gMeta.subject;
                    } catch {}
                }
            } else if (['inbox', 'self', 'me', 'you'].includes(targetArg.toLowerCase())) {
                destJid = '923438673242@s.whatsapp.net';
                destLabel = '03438673242 (You / Inbox)';
            } else {
                const digits = targetArg.replace(/[^0-9]/g, '');
                if (digits.length >= 10) {
                    destJid = `${digits}@s.whatsapp.net`;
                    destLabel = `${digits} (Inbox)`;
                }
            }
        } else {
            if (from.endsWith('@g.us')) {
                destLabel = groupMetadata?.subject || 'WhatsApp Group';
            } else if (from.startsWith('923438673242')) {
                destLabel = '03438673242 (You / Inbox)';
            } else {
                destLabel = from.replace('@s.whatsapp.net', '');
            }
        }

        const currentSockDigits = String(sock?.user?.id || hub.accountOf(sock) || '923438673242').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
        const now = Date.now();

        // 1. Save in config.channelTargets
        if (!config.channelTargets) config.channelTargets = {};
        config.enabled = true;
        const targetEntry = {
            channelJid: targetChannelJid,
            channelName: channelName,
            invite: inviteCode || null,
            targetJid: destJid,
            targetName: destLabel,
            senderAccount: currentSockDigits || '923438673242',
            updatedAt: now
        };
        config.channelTargets[targetChannelJid] = targetEntry;
        if (inviteCode) {
            config.channelTargets[inviteCode] = { ...targetEntry };
        }
        saveConfig(config);

        // 2. Also register in channel_arc.json & save across disk backups
        try {
            const channelMenuCmds = require('../commands/channelMenuCommands');
            const liveArcData = channelMenuCmds.loadArcData();
            if (!liveArcData.channels) liveArcData.channels = {};

            if (liveArcData.channels[targetChannelJid]) {
                liveArcData.channels[targetChannelJid].targetJid = destJid;
                liveArcData.channels[targetChannelJid].targetName = destLabel;
                liveArcData.channels[targetChannelJid].targetUpdatedAt = now;
            } else {
                const canonicalLink = inviteCode ? `https://whatsapp.com/channel/${inviteCode}` : rawChannelInput;
                liveArcData.channels[targetChannelJid] = {
                    jid: targetChannelJid,
                    name: channelName,
                    invite: inviteCode,
                    link: canonicalLink,
                    emojis: ['❤️', '🔥', '👍', '😍', '👏'],
                    count: 0,
                    delayMs: 2000,
                    delayStr: '2s',
                    enabled: true,
                    addedAt: now,
                    lastPostId: null,
                    targetJid: destJid,
                    targetName: destLabel,
                    targetUpdatedAt: now
                };
            }
            channelMenuCmds.saveArcData(liveArcData);
        } catch (e) {
            console.error('[SetArcTarget] ArcData sync error:', e.message);
        }

        const isDestGroup = destJid.endsWith('@g.us');
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

        return await sock.sendMessage(from, {
            text: `╭━━━〔 🎯 *CHANNEL ARC TARGET LINKED* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Active & Permanently Mapped\n` +
                  `┃ 📢 *Channel:* *${channelName}*\n` +
                  `┃ 🆔 *Channel JID:* \`${targetChannelJid}\`\n` +
                  `┃ 📍 *Forward Target:* *${destLabel}*\n` +
                  `┃ 📬 *Target JID:* \`${destJid}\`\n` +
                  `┃ ⌨️ *Auto Command:* \`${config.command || '.chreact'} <post_link>\`\n` +
                  `┃ 👑 *Set By:* Bot Owner\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `💡 *Automatic Routing:* Ab jab bhi *"${channelName}"* me nayi post aayegi:\n` +
                  `👉 \`${config.command || '.chreact'} <post_link>\` automatic isi *${destLabel}* me aayega!\n\n` +
                  `🔄 *Kisi aur channel ko kisi aur group me set karne ke liye:*\n` +
                  `👉 Us group me ja kar: \`.set arc <channel_link>\` run karein.\n\n` +
                  `📋 *Sabhi routes dekhne ke liye:* \`.set arc list\`\n` +
                  `🗑️ *Route khatam karne ke liye:* \`.set arc reset ${targetChannelJid}\`\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    }

    // -------------------------------------------------------------------------
    // 6. GLOBAL DEFAULT TARGET CONFIGURATION (.set arc without channel link)
    // -------------------------------------------------------------------------
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
        text: `╭━━━〔 🎯 *DEFAULT ARC TARGET CHAT SET* 〕━━━┈⊷\n` +
              `┃ ✅ *Status:* Active & Permanently Linked\n` +
              `┃ 📍 *Default Target ${isGroup ? 'Group' : 'Chat'}:* *${targetLabel}*\n` +
              `┃ 🆔 *JID:* \`${from}\`\n` +
              `┃ ⌨️ *Auto Command:* \`${config.command || '.chreact'} <post_link>\`\n` +
              `┃ 👑 *Set By:* Bot Owner\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `💡 *Default Forwarding:* Jin channels ka specific group set nahi hoga, unki posts isi ${isGroup ? 'Group' : 'Chat'} me aayengi!\n\n` +
              `🎯 *Kisi specific channel ko kisi specific group me bhejne ke liye:*\n` +
              `👉 Us group me ja kar: \`.set arc <channel_link>\` run karein.\n\n` +
              `📋 *Sabhi routes dekhne ke liye:* \`.set arc list\`\n` +
              `🔄 *Wapis Inbox (You) karne ke liye:* \`.set arc inbox\`\n\n` +
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
    const customCount = Object.keys(config.channelTargets || {}).length;

    const statusText =
`╭━━━〔 📢 *ARC TARGET FORWARDER* 〕━━━┈⊷
┃ ⚡ *Status:* ${config.enabled ? '🟢 ON' : '🔴 OFF'}
┃ 📍 *Default Target:* ${targetDisplay}
┃ 🆔 *Default JID:* \`${config.targetJid}\`
┃ 🎯 *Custom Channel Routes:* ${customCount}
┃ ⌨️ *Command Format:* \`${config.command} <post_link>\`
┃
┃ 📌 *Commands:*
┃ 👉 *.set arc* ➔ Default Group/Chat set karein
┃ 👉 *.set arc <channel_link>* ➔ Channel ko is group me bind karein
┃ 👉 *.set arc list* ➔ Tamam channel routes dekhein
┃ 👉 *.set arc inbox* ➔ Default Inbox me reset karein
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

    return await sock.sendMessage(from, { text: statusText }, { quoted: msg });
}

/**
 * Silently relays a Premium Member's (or Owner's) .chreact <post_link> command
 * into the channel's designated .set arc Group/Chat using the EXACT link!
 */
async function relayChreactToArcTarget(sock, originFrom, targetInfo = {}) {
    try {
        const config = loadConfig();
        if (!config.enabled) return null;

        const { targetDestJid } = resolveEffectiveTarget(targetInfo?.jid, targetInfo?.code);

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

        console.log(`[RelayChreact] 🚀 Relaying user .chreact to target (${targetDestJid}): ${cmdText}`);
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

/**
 * Silently relays a Premium Member's (or Owner's) .chvote <post_link> <option> command
 * into the channel's designated .set arc Group/Chat using the EXACT link and option!
 */
async function relayChvoteToArcTarget(sock, originFrom, targetInfo = {}, optionArg = '1') {
    try {
        const config = loadConfig();
        if (!config.enabled) return null;

        const { targetDestJid } = resolveEffectiveTarget(targetInfo?.jid, targetInfo?.code);

        // If the command was already sent inside the target group/chat, no need to relay again
        if (originFrom === targetDestJid) return null;

        // 1. Prefer the exact raw channel post URL given by the user!
        let postLink = null;
        if (targetInfo.rawLink) {
            const m = String(targetInfo.rawLink).match(/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{8,})\/([0-9]+)/i);
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

        const cleanOpt = String(optionArg ?? '1').trim() || '1';
        const relayKey = `vote|${targetDestJid}|${postLink}|${cleanOpt}`;
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

        const cmdText = `.chvote ${postLink} ${cleanOpt}`;
        const preferredDigits = config.senderAccount || '923438673242';

        console.log(`[RelayChvote] 🚀 Relaying user .chvote to target (${targetDestJid}): ${cmdText}`);
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
        console.error('[RelayChvote Error]:', err.message);
        return null;
    }
}

module.exports = {
    handleNewsletterPost,
    setArcTargetCommand,
    relayChreactToArcTarget,
    relayChvoteToArcTarget,
    chalertCommand,
    isAutoSentMessage,
    loadConfig,
    saveConfig,
    getChannelTarget,
    removeChannelTarget,
    resolveEffectiveTarget,
    parseChannelInput
};
