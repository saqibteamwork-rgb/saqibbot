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

/**
 * Extracts all emoji characters and tokens from a string.
 * Supports:
 * - Comma-separated: "🥺,😭,🤧" or "❤️,🔥,👍"
 * - Space-separated: "🥺 😭 🤧"
 * - Concatenated: "🥺😭🤧"
 */
function extractReactionEmojis(str) {
    if (!str || typeof str !== 'string') return [];
    const clean = str.trim();
    if (!clean) return [];

    const tokens = clean.split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
    const result = [];

    for (const token of tokens) {
        if (!token) continue;
        try {
            const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
            const graphemes = [...seg.segment(token)]
                .map(s => s.segment)
                .filter(g => /(\p{Extended_Pictographic}|[\u2000-\u3300])/u.test(g));

            if (graphemes.length > 0) {
                result.push(...graphemes);
                continue;
            }
        } catch {}

        if (/(\p{Extended_Pictographic}|[\u2000-\u3300])/u.test(token)) {
            result.push(token);
        }
    }

    return result;
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
    if (!data.targetJid || data.targetJid === '120363000000000001@g.us' || data.targetJid.includes('923420580154') || data.targetJid.includes('923438673242') || data.targetJid.includes('923286037243') || ['inbox', 'you'].includes(String(data.targetJid).toLowerCase())) {
        data.targetJid = null;
        data.targetName = null;
        data.isExplicitlySet = false;
    } else {
        data.isExplicitlySet = Boolean(data.targetJid && data.targetJid.endsWith('@g.us'));
    }
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
 * Returns channel-specific target if set, otherwise falls back to global default target.
 * STRICT RULE: Only routes to explicitly set groups; never leaks to "You"/inbox or random chats.
 */
function resolveEffectiveTarget(channelJid = null, inviteCode = null) {
    const config = loadConfig();
    const chTarget = getChannelTarget(channelJid, inviteCode);
    const rawTarget = chTarget?.targetJid || (config.isExplicitlySet ? config.targetJid : null);
    const targetName = chTarget?.targetName || (config.isExplicitlySet ? config.targetName : null) || rawTarget;

    const isTargetGroup = Boolean(rawTarget && rawTarget.endsWith('@g.us'));
    const isInbox = Boolean(rawTarget && (rawTarget.includes('923420580154') || rawTarget.includes('923438673242') || rawTarget.includes('923286037243') || ['inbox', 'you', 'self', 'me'].includes(String(rawTarget).toLowerCase())));
    const hasValidTarget = Boolean(rawTarget && isTargetGroup && !isInbox);

    return {
        targetDestJid: rawTarget,
        targetName,
        isTargetGroup,
        isCustomRoute: Boolean(chTarget?.targetJid),
        hasValidTarget
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
function getOrderedCandidateSockets(primarySock, preferredDigits = '923286037243') {
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
async function sendWithFallbackSockets(primarySock, targetDestJid, textContent, preferredDigits = '923286037243') {
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

    // 🚫 STRICT HISTORICAL POST GUARD:
    // Only forward and react to LIVE fresh posts (< 90 seconds old). Never forward old/past posts!
    const postTimestamp = msg?.messageTimestamp ? (Number(msg.messageTimestamp) * 1000) : 0;
    if (postTimestamp > 0) {
        const postAgeMs = Date.now() - postTimestamp;
        if (postAgeMs > 90000 || postAgeMs < -30000) {
            return false;
        }
        const sockConnectedAt = sock?._connectedAt || 0;
        if (sockConnectedAt > 0 && postTimestamp < (sockConnectedAt - 15000)) {
            return false;
        }
    }

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

    // Extract configured emojis from arcConf (memory-persistent)
    let emojiPart = '';
    if (Array.isArray(arcConf.emojis) && arcConf.emojis.length > 0) {
        emojiPart = arcConf.emojis.join(',');
    } else if (arcConf.emoji) {
        emojiPart = arcConf.emoji;
    }

    const postLink = `https://whatsapp.com/channel/${inviteCode}/${serverId}`;
    const cmdText = emojiPart
        ? `${config.command || '.chreact'} ${postLink} ${emojiPart}`
        : `${config.command || '.chreact'} ${postLink}`;

    // Resolve channel-specific target group/chat or fallback to default
    const { targetDestJid, targetName, isTargetGroup, isCustomRoute, hasValidTarget } = resolveEffectiveTarget(from, inviteCode);

    // STRICT USER RULE: Only send post link command if target was EXPLICITLY set via .set arc to a group!
    // NEVER send to "You" / personal inbox or random unconfigured chat!
    if (!hasValidTarget || !targetDestJid || !isTargetGroup) {
        console.log(`[ChannelForwarder] ⏭️ Skipped sending post link for "${channelName}": No explicit .set arc group configured. (Will NOT send to inbox/you).`);
        return true;
    }

    // Also mark in recentRelays so chreactCommand doesn't re-relay this same auto-post
    recentRelays.set(`${targetDestJid}|${postLink}|${emojiPart}`, Date.now());

    try {
        console.log(`[ChannelForwarder] 📢 Sending ARC Post in "${channelName}" to "${targetName}" (${targetDestJid})! Command: "${cmdText}" | Route: ${isCustomRoute ? '🎯 Custom' : '🌐 Default'}`);

        const preferredDigits = isTargetGroup ? (config.senderAccount || '923286037243') : targetDestJid.split('@')[0];
        const { sentMsg, usedSock } = await sendWithFallbackSockets(sock, targetDestJid, cmdText, preferredDigits);
        if (!usedSock) {
            console.error(`[ChannelForwarder] ❌ Could not send to ${targetDestJid}: No active socket available!`);
            return false;
        }

        if (sentMsg?.key?.id) {
            autoSentMsgIds.add(sentMsg.key.id);
            if (autoSentMsgIds.size > 1000) {
                autoSentMsgIds.delete(autoSentMsgIds.values().next().value);
            }
        }

        console.log(`[ChannelForwarder] ✅ Successfully sent "${cmdText}" to ${targetDestJid}!`);

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
        const cmdArgs = emojiPart ? [postLink, emojiPart] : [postLink];
        await chreactCommand(usedSock, targetDestJid, cmdMsg, cmdArgs, true, true, true);
        return true;
    } catch (sendErr) {
        console.error('[ChannelForwarder Send Error]:', sendErr.message);
        return false;
    }
}

// Deduplication set for .set arc and .unset arc so multiple sessions in a group don't send duplicate replies
const handledSetArcMsgIds = new Set();

/**
 * Command: .delset arc / .unset arc / .resetset arc / .set arc del
 * Removes / unlinks .set arc target routing!
 *
 * Supports:
 * 1) In Group A: `.delset arc` or `.set arc del` ➔ Unlinks Group A from receiving .chreact links!
 * 2) `.delset arc <channel_link>` ➔ Removes target routing for that specific channel!
 * 3) `.delset arc all` ➔ Clears all targets completely!
 */
async function unsetArcTargetCommand(sock, from, msg, isOwner, args = [], groupMetadata = null) {
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
                  `┃ Ye command sirf Bot Owner ya\n` +
                  `┃ Premium Members run kar sakte hain!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const config = loadConfig();
    let cleanArgs = [...args];
    if (cleanArgs[0] && ['arc', 'set', 'target', 'autochreact', 'chreact'].includes(cleanArgs[0].toLowerCase())) {
        cleanArgs = cleanArgs.slice(1);
    }

    const firstSub = (cleanArgs[0] || '').toLowerCase().trim();

    // 1. .delset arc all / .unset arc all (Clear Everything)
    if (['all', 'full', 'global', 'everything'].includes(firstSub)) {
        config.targetJid = null;
        config.targetName = null;
        config.isExplicitlySet = false;
        config.channelTargets = {};
        saveConfig(config);

        try {
            const channelMenuCmds = require('../commands/channelMenuCommands');
            const liveArcData = channelMenuCmds.loadArcData();
            if (liveArcData?.channels) {
                for (const ch of Object.values(liveArcData.channels)) {
                    if (ch) {
                        delete ch.targetJid;
                        delete ch.targetName;
                        delete ch.targetUpdatedAt;
                    }
                }
                channelMenuCmds.saveArcData(liveArcData);
            }
        } catch (_) {}

        await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🗑️ *ALL ARC TARGETS REMOVED* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Sabhi Groups & Chats se Target Khatam!\n` +
                  `┃ 🚫 *Result:* Ab kisi bhi chat ya group me .chreact post link nahi jayega.\n` +
                  `┃ 💡 *Tip:* Jab dobara link bhejna ho, kisi group me ja kar \`.set arc\` likhein.\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    // 2. .delset arc <channel_link> (Specific Channel Route Removal)
    const parsedChannel = cleanArgs[0] ? parseChannelInput(cleanArgs[0]) : null;
    if (parsedChannel) {
        const arcData = loadArcDataMerged();
        let targetChannelJid = parsedChannel.jid || null;
        let inviteCode = parsedChannel.code || null;
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

        if (config.channelTargets) {
            if (targetChannelJid) delete config.channelTargets[targetChannelJid];
            if (inviteCode) delete config.channelTargets[inviteCode];
            saveConfig(config);
        }

        try {
            const channelMenuCmds = require('../commands/channelMenuCommands');
            const liveArcData = channelMenuCmds.loadArcData();
            if (targetChannelJid && liveArcData.channels?.[targetChannelJid]) {
                delete liveArcData.channels[targetChannelJid].targetJid;
                delete liveArcData.channels[targetChannelJid].targetName;
                delete liveArcData.channels[targetChannelJid].targetUpdatedAt;
                channelMenuCmds.saveArcData(liveArcData);
            }
        } catch (_) {}

        await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🗑️ *CHANNEL ARC TARGET REMOVED* 〕━━━┈⊷\n` +
                  `┃ 📢 *Channel:* *${channelName}*\n` +
                  `┃ 🆔 *JID:* \`${targetChannelJid}\`\n` +
                  `┃ ✅ *Status:* Is channel ka target route successfully khatam kar diya gaya!\n` +
                  `┃ 🚫 *Result:* Is channel ki posts ab kisi chat me nahi bheji jayengi.\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    // 3. .delset arc (run inside the current chat/group to unlink THIS chat)
    let unlinkedCount = 0;
    const currentJid = from;
    const isGroup = from.endsWith('@g.us');
    const chatTitle = isGroup ? (groupMetadata?.subject || 'This Group') : 'This Chat';

    // Clear global target if it was this chat
    if (config.targetJid === currentJid) {
        config.targetJid = null;
        config.targetName = null;
        config.isExplicitlySet = false;
        unlinkedCount++;
    }

    // Clear from channelTargets
    if (config.channelTargets && typeof config.channelTargets === 'object') {
        for (const [k, v] of Object.entries(config.channelTargets)) {
            if (v && v.targetJid === currentJid) {
                delete config.channelTargets[k];
                unlinkedCount++;
            }
        }
    }

    // Clear from channel_arc.json
    try {
        const channelMenuCmds = require('../commands/channelMenuCommands');
        const liveArcData = channelMenuCmds.loadArcData();
        if (liveArcData?.channels) {
            for (const ch of Object.values(liveArcData.channels)) {
                if (ch && ch.targetJid === currentJid) {
                    delete ch.targetJid;
                    delete ch.targetName;
                    delete ch.targetUpdatedAt;
                    unlinkedCount++;
                }
            }
            channelMenuCmds.saveArcData(liveArcData);
        }
    } catch (_) {}

    saveConfig(config);

    await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});
    return await sock.sendMessage(from, {
        text: `╭━━━〔 🗑️ *ARC TARGET UNLINKED FROM THIS CHAT* 〕━━━┈⊷\n` +
              `┃ ✅ *Status:* Successfully Removed!\n` +
              `┃ 📍 *Chat:* *${chatTitle}*\n` +
              `┃ 🆔 *Chat JID:* \`${currentJid}\`\n` +
              `┃ 🚫 *Result:* Ab *${chatTitle}* me koi .chreact post link nahi aayega!\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `💡 *Agar dobara link bhejna ho:* Isi group me \`.set arc\` likhein.`
    }, { quoted: msg });
}

/**
 * Command: .set arc / .setarc
 * Sets target destination where `.chreact <post_link>` is automatically sent!
 *
 * Supports:
 * 1) `.set arc <channel_link>` (inside Group A) ➔ Routes Channel 1 to Group A!
 * 2) `.set arc <channel_link> <group_link_or_jid>` ➔ Routes Channel to specified group!
 * 3) `.set arc` (alone) ➔ Sets default fallback target to current chat/group!
 * 4) `.set arc list` ➔ Shows full overview of all channel routes!
 * 5) `.set arc del` / `.set arc unset` ➔ Unlinks current chat from receiving links!
 * 6) `.set arc del <channel_link>` ➔ Removes route for that channel!
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
                  `┃ Ye command sirf *Bot Owner* ya\n` +
                  `┃ *Premium Members* run kar sakte hain!\n` +
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

    // If user ran .set arc del / .set arc unset / .set arc off / .set arc clear / .set arc reset:
    if (['del', 'delete', 'remove', 'rm', 'unset', 'clear', 'off', 'reset'].includes(firstSub)) {
        return await unsetArcTargetCommand(sock, from, msg, isOwner, cleanArgs.slice(1), groupMetadata);
    }

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
                   `👉 Route hatane ke liye: \`.delset arc\` ya \`.set arc del\`\n` +
                   `👉 Sabhi routes hatane ke liye: \`.delset arc all\``;

        await sock.sendMessage(from, { react: { text: '📋', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, { text: msgText }, { quoted: msg });
    }

    // -------------------------------------------------------------------------
    // 2. Check for Channel Input in args or Quoted Message
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

        let customEmojisFromArg = null;
        if (targetArg) {
            const ems = extractReactionEmojis(targetArg);
            if (ems.length > 0) {
                customEmojisFromArg = ems;
                targetArg = targetArg.replace(/[\p{Extended_Pictographic}\u2000-\u3300,]+/gu, ' ').trim();
            }
        }

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
                destJid = '923286037243@s.whatsapp.net';
                destLabel = 'Owner (You / Inbox)';
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
            } else if (from.startsWith('923286037243') || from.startsWith('923438673242') || from.startsWith('923420580154')) {
                destLabel = 'Owner (You / Inbox)';
            } else {
                destLabel = from.replace('@s.whatsapp.net', '');
            }
        }

        const currentSockDigits = String(sock?.user?.id || hub.accountOf(sock) || '923286037243').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
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
            senderAccount: currentSockDigits || '923286037243',
            updatedAt: now
        };
        config.channelTargets[targetChannelJid] = targetEntry;
        if (inviteCode) {
            config.channelTargets[inviteCode] = { ...targetEntry };
        }
        saveConfig(config);

        // 2. Also register in channel_arc.json & save across disk backups
        let activeEmojis = ['❤️', '🔥', '👍', '😍', '👏'];
        try {
            const channelMenuCmds = require('../commands/channelMenuCommands');
            const liveArcData = channelMenuCmds.loadArcData();
            if (!liveArcData.channels) liveArcData.channels = {};

            if (liveArcData.channels[targetChannelJid]) {
                liveArcData.channels[targetChannelJid].targetJid = destJid;
                liveArcData.channels[targetChannelJid].targetName = destLabel;
                liveArcData.channels[targetChannelJid].targetUpdatedAt = now;
                if (customEmojisFromArg && customEmojisFromArg.length > 0) {
                    liveArcData.channels[targetChannelJid].emojis = customEmojisFromArg;
                }
                activeEmojis = liveArcData.channels[targetChannelJid].emojis || activeEmojis;
            } else {
                activeEmojis = (customEmojisFromArg && customEmojisFromArg.length > 0) ? customEmojisFromArg : activeEmojis;
                const canonicalLink = inviteCode ? `https://whatsapp.com/channel/${inviteCode}` : rawChannelInput;
                liveArcData.channels[targetChannelJid] = {
                    jid: targetChannelJid,
                    name: channelName,
                    invite: inviteCode,
                    link: canonicalLink,
                    emojis: activeEmojis,
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

        const emojiDisplay = (activeEmojis && activeEmojis.length > 0) ? activeEmojis.join(' ') : '❤️ 🔥 👍';
        const autoCmdExample = activeEmojis && activeEmojis.length > 0 ? `${config.command || '.chreact'} <post_link> ${activeEmojis.join(',')}` : `${config.command || '.chreact'} <post_link>`;

        return await sock.sendMessage(from, {
            text: `╭━━━〔 🎯 *CHANNEL ARC TARGET LINKED* 〕━━━┈⊷\n` +
                  `┃ ✅ *Status:* Active & Permanently Mapped\n` +
                  `┃ 📢 *Channel:* *${channelName}*\n` +
                  `┃ 🆔 *Channel JID:* \`${targetChannelJid}\`\n` +
                  `┃ 📍 *Forward Target:* *${destLabel}*\n` +
                  `┃ 📬 *Target JID:* \`${destJid}\`\n` +
                  `┃ ✨ *Auto Emojis:* ${emojiDisplay}\n` +
                  `┃ ⌨️ *Auto Command:* \`${autoCmdExample}\`\n` +
                  `┃ 👑 *Set By:* Bot Owner\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `💡 *Automatic Routing:* Ab jab bhi *"${channelName}"* me nayi post aayegi:\n` +
                  `👉 \`${autoCmdExample}\` automatic isi *${destLabel}* me aayega aur tamam bots inhi emojis se react karenge!\n\n` +
                  `🔄 *Kisi aur channel ko kisi aur group me set karne ke liye:*\n` +
                  `👉 Us group me ja kar: \`.set arc <channel_link> [emojis]\` run karein.\n\n` +
                  `📋 *Sabhi routes dekhne ke liye:* \`.set arc list\`\n` +
                  `🗑️ *Route khatam karne ke liye:* \`.set arc reset ${targetChannelJid}\`\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    }

    // -------------------------------------------------------------------------
    // 6. GLOBAL DEFAULT TARGET CONFIGURATION (.set arc without channel link)
    // -------------------------------------------------------------------------
    const isGroup = from.endsWith('@g.us');
    let targetLabel = from.replace('@s.whatsapp.net', '');
    if (isGroup) {
        targetLabel = groupMetadata?.subject || 'WhatsApp Group';
    } else if (from.startsWith('923286037243') || from.startsWith('923438673242') || from.startsWith('923420580154')) {
        targetLabel = 'Owner (You / Inbox)';
    }

    const currentSockDigits = String(sock?.user?.id || hub.accountOf(sock) || '923286037243').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');

    config.enabled = true;
    config.targetJid = from;
    config.targetName = targetLabel;
    config.senderAccount = currentSockDigits || '923286037243';
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
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
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

        // If no target group is configured, or command was already sent inside target group, no need to relay
        if (!targetDestJid || originFrom === targetDestJid) return null;

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

        // Determine emojis to include in relayed command
        let emojiPart = '';
        if (Array.isArray(targetInfo.customEmojis) && targetInfo.customEmojis.length > 0) {
            emojiPart = targetInfo.customEmojis.join(',');
        } else if (targetInfo.hasCustomEmoji && targetInfo.emoji) {
            emojiPart = targetInfo.emoji;
        } else {
            // Fallback: Check if the channel has .arc emojis configured
            try {
                const arcConf = targetInfo.jid ? loadArcChannelConf(targetInfo.jid) : null;
                if (Array.isArray(arcConf?.emojis) && arcConf.emojis.length > 0) {
                    emojiPart = arcConf.emojis.join(',');
                } else if (arcConf?.emoji) {
                    emojiPart = arcConf.emoji;
                }
            } catch {}
        }

        // Prevent duplicate relay for the same target + link within 6 seconds
        const relayKey = `${targetDestJid}|${postLink}|${emojiPart}`;
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

        const cmdText = emojiPart
            ? `${config.command || '.chreact'} ${postLink} ${emojiPart}`
            : `${config.command || '.chreact'} ${postLink}`;
        const preferredDigits = config.senderAccount || '923286037243';

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

        // If no target group is configured, or command was already sent inside target group, no need to relay
        if (!targetDestJid || originFrom === targetDestJid) return null;

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
        const preferredDigits = config.senderAccount || '923286037243';

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
    unsetArcTargetCommand,
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
