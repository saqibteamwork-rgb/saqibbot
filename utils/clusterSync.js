'use strict';

/**
 * MR SAQIB MD :: MULTI-SERVER CLUSTER MESH SYNCHRONIZER
 * ============================================================================
 * Synchronizes actions and data in real-time across all 11 bot nodes:
 * - Railway (Master/Hub)
 * - Heroku Dynos s1 through s10 (Cluster Workers)
 *
 * Capabilities:
 * 1. Broadcasts .chfollow across all 11 servers simultaneously (Mass Follow).
 * 2. Broadcasts .chunfollow across all 11 servers.
 * 3. Broadcasts .setmenupic -g (Base64 image sync across all ephemeral dynos).
 * 4. Broadcasts Auto-Follow (.afc) & ARC Auto-Reacts (.achr) configuration updates.
 * 5. Background periodic sync to pull latest MongoDB changes without restart.
 * ============================================================================
 */

const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const mongoSync = require('./mongoSync');

const CLUSTER_SECRET = process.env.CLUSTER_SECRET || 'saqib_cluster_secure_mesh_2026';
const recentClusterDispatches = new Map();
const recentClusterExecutions = new Map();

function markClusterDedup(map, key, ttlMs = 15000) {
    if (!key) return false;
    const now = Date.now();
    for (const [k, ts] of map.entries()) {
        if (now - ts > ttlMs) map.delete(k);
    }
    const prev = map.get(key);
    if (prev && (now - prev) < ttlMs) return true;
    if (map.size >= 300) {
        map.delete(map.keys().next().value);
    }
    map.set(key, now);
    return false;
}

const withClusterTimeout = (promise, ms = 3500) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
]);

const KNOWN_NODES = {
    s1: 'https://saqib-bot-v1-d3ecc6f0292e.herokuapp.com',
    s2: 'https://saqib-bot-s2-1cceb03e9698.herokuapp.com',
    s3: 'https://saqibbot3-bb2b46aa1cb4.herokuapp.com',
    s4: 'https://saqibot4-1469f73b3d77.herokuapp.com',
    s5: 'https://saqibbot5-5ffa090fe31f.herokuapp.com',
    s6: 'https://saqibot6-061b6d17645d.herokuapp.com',
    s7: 'https://saqibot7-b9d00e67a587.herokuapp.com',
    s8: 'https://saqibbot8-f10fafc8b934.herokuapp.com',
    s9: 'https://saqibbot9-bebb531508e3.herokuapp.com',
    s10: 'https://saqibot10-d27e9f3ad01e.herokuapp.com',
    s11: 'https://saqibbot11-815563078799.herokuapp.com',
    s12: 'https://saqibbot12-2fb338ff529a.herokuapp.com',
    s13: 'https://saqibot13-392b066b37a5.herokuapp.com',
    s14: 'https://saqibbot14-d84e8d59500a.herokuapp.com',
    s16: 'https://saqibbot16-b071c813d801.herokuapp.com',
    s17: 'https://saqibot17-a471970ef223.herokuapp.com',
    s18: 'https://saqibbot18-45854000f60b.herokuapp.com',
    s19: 'https://saqibbot19-bb306a89a5f4.herokuapp.com',
    s20: 'https://saqibbot20-317bb68e4db0.herokuapp.com',
    s21: 'https://saqibbot21-ac7859f5f0fb.herokuapp.com',
    s21b: 'https://saqibot21-0b44cf00a75a.herokuapp.com',
    s22: 'https://saqibbot22-9318c2de0250.herokuapp.com',
    s23: 'https://saqibot23-1f4bec48d0f2.herokuapp.com',
    s25: 'https://saqibbot25-46c4cf949a77.herokuapp.com',
    s25b: 'https://saqibot25-0974df36edd8.herokuapp.com',
    s26: 'https://saqibot26-69a8011cc819.herokuapp.com',
    s27: 'https://saqibot27-1c1d295781fa.herokuapp.com',
    s28: 'https://saqibbot28-658e7de676c8.herokuapp.com',
    s29: 'https://saqibot29-94eae3596692.herokuapp.com',
    s30: 'https://saqibot30-e89854c3fef2.herokuapp.com',
    s32: 'https://saqibot32-daa98fd51f65.herokuapp.com',
    s33: 'https://saqibot33-454998cdc49b.herokuapp.com',
    s34: 'https://saqibot34-88b9afd45ae5.herokuapp.com',
    s35: 'https://saqibot35-b5a65594dc78.herokuapp.com',
    s36: 'https://saqibot36-822da6a7cddd.herokuapp.com',
    s37: 'https://saqibot37-46d3819a472c.herokuapp.com',
    s38: 'https://saqibot38-520caade1fd3.herokuapp.com',
    s39: 'https://saqibot39-6fa296b89e98.herokuapp.com',
    s40: 'https://saqibot40-d19a79bf6170.herokuapp.com',
    s41: 'https://saqibbot41-fd5991fd6038.herokuapp.com',
    s42: 'https://saqibbot42-18e1d04afef3.herokuapp.com',
    s43: 'https://saqibot43-4ac9ae252f6b.herokuapp.com',
    s44: 'https://saqibobot44-6379b396e027.herokuapp.com',
    s45: 'https://saqibot45-4fee2ad8369c.herokuapp.com',
    s46: 'https://saqibbt46-3c399938d5a6.herokuapp.com',
    s47: 'https://saqibot47-6f2e03e874fc.herokuapp.com',
    s48: 'https://saqibot48-ac004fb8d44b.herokuapp.com',
    s49: 'https://saqibot49-e792da7c6864.herokuapp.com',
    s50: 'https://saqibot50-d29d71852e9a.herokuapp.com',
    railway: 'https://web-production-08da5300.up.railway.app'
};

const DATA_DIR = path.join(__dirname, '..', 'data');
const MENU_PICS_DIR = path.join(DATA_DIR, 'menu_pics');

/**
 * Get current server's node ID to avoid sending webhook to self
 */
function getCurrentNodeId() {
    return mongoSync.getNodeId() || 'default';
}

function getTargetPool() {
    return KNOWN_NODES;
}

/**
 * Broadcast an action payload to all other cluster nodes in parallel
 */
async function broadcastToCluster(action, payload = {}) {
    if (action === 'chreact' || action === 'chvote') {
        const targetId = payload?.jid || payload?.code || '';
        const extra = action === 'chvote'
            ? (payload?.optHashHex || payload?.selectedOptionName || payload?.optionIndexOrName || '1')
            : '';
        const dedupeKey = `${action}:${targetId}:${payload?.serverId || ''}:${extra}`;
        if (markClusterDedup(recentClusterDispatches, dedupeKey, 12000)) {
            return [{ ok: true, deduplicated: true }];
        }
    }

    const currentNode = getCurrentNodeId();
    const promises = [];
    const targetPool = getTargetPool();

    for (const [nodeId, baseUrl] of Object.entries(targetPool)) {
        if (nodeId === currentNode) continue; // Skip self

        promises.push(
            axios.post(
                `${baseUrl}/api/cluster-action`,
                {
                    action,
                    fromNode: currentNode,
                    secret: CLUSTER_SECRET,
                    payload,
                    timestamp: Date.now()
                },
                {
                    timeout: (action === 'chfollow' || action === 'chunfollow' || action === 'chreact' || action === 'chvote') ? 45000 : 8000,
                    headers: {
                        'x-cluster-secret': CLUSTER_SECRET,
                        'Content-Type': 'application/json'
                    }
                }
            ).then(res => ({
                nodeId,
                ok: true,
                data: res.data
            })).catch(err => ({
                nodeId,
                ok: false,
                error: err.response?.data?.error || err.message
            }))
        );
    }

    const results = await Promise.allSettled(promises);
    return results.map(r => r.value || { ok: false, error: 'Unknown' });
}

/**
 * Handle incoming cluster action received from another node
 */
async function handleIncomingClusterAction(body, appLocals = {}) {
    const { action, secret, payload, fromNode } = body || {};

    if (!secret || secret !== CLUSTER_SECRET) {
        throw new Error('Unauthorized cluster secret');
    }

    // console.log(`🛰️ [Cluster Action] Received "${action}" from Node "${fromNode}"`);

    switch (action) {
        case 'chfollow': {
            const { jid } = payload || {};
            if (!jid) throw new Error('Missing channel JID');

            let activeSocks = [];
            try {
                activeSocks = global.ProBoySessionManager?.getActiveSocks?.() || [];
            } catch (_) {}

            let success = 0;
            let already = 0;
            let failed = 0;

            for (let i = 0; i < activeSocks.length; i++) {
                const s = activeSocks[i];
                let isFollowed = false;
                let isAlready = false;

                // Smart Retry Engine: Try up to 2 times with backoff
                for (let attempt = 1; attempt <= 2; attempt++) {
                    try {
                        if (typeof s.newsletterFollow === 'function') {
                            await s.newsletterFollow(jid);
                            isFollowed = true;
                            break;
                        }
                    } catch (err) {
                        const msg = String(err?.message || err).toLowerCase();
                        if (
                            msg.includes('409') ||
                            msg.includes('already') ||
                            msg.includes('conflict') ||
                            msg.includes('subscribed') ||
                            msg.includes('duplicate') ||
                            msg.includes('member')
                        ) {
                            isAlready = true;
                            break;
                        }
                        if (attempt < 2) {
                            await new Promise(r => setTimeout(r, 1200));
                        }
                    }
                }

                if (isFollowed) {
                    success++;
                } else if (isAlready) {
                    already++;
                } else {
                    failed++;
                }

                // Smooth delay between sessions to prevent rate-limit
                if (i < activeSocks.length - 1) {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            return {
                nodeId: getCurrentNodeId(),
                sessionsProcessed: activeSocks.length,
                success,
                already,
                failed
            };
        }

        case 'chunfollow': {
            const { jid } = payload || {};
            if (!jid) throw new Error('Missing channel JID');

            let activeSocks = [];
            try {
                activeSocks = global.ProBoySessionManager?.getActiveSocks?.() || [];
            } catch (_) {}

            let success = 0;
            let failed = 0;

            for (let i = 0; i < activeSocks.length; i++) {
                const s = activeSocks[i];
                let isDone = false;

                for (let attempt = 1; attempt <= 2; attempt++) {
                    try {
                        if (typeof s.newsletterUnfollow === 'function') {
                            await s.newsletterUnfollow(jid);
                            isDone = true;
                            break;
                        }
                    } catch (err) {
                        if (attempt < 2) {
                            await new Promise(r => setTimeout(r, 1200));
                        }
                    }
                }

                if (isDone) success++;
                else failed++;

                if (i < activeSocks.length - 1) {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            return {
                nodeId: getCurrentNodeId(),
                sessionsProcessed: activeSocks.length,
                success,
                failed
            };
        }

        case 'chreact': {
            const { jid, code, serverId, emojiPool, customEmojis, hasCustomEmoji, emoji } = payload || {};
            if ((!jid && !code) || !serverId) throw new Error('Missing channel reaction target parameters');

            setImmediate(() => {
                executeSmoothClusterReactions(jid, serverId, { code, emojiPool, customEmojis, hasCustomEmoji, emoji })
                    .catch(e => console.error('[Cluster Chreact Background Error]:', e.message));
            });

            return {
                nodeId: getCurrentNodeId(),
                queued: true,
                target: `${jid || code}/${serverId}`
            };
        }

        case 'chvote': {
            const { jid, code, serverId, optionIndexOrName, selectedOptionName, optionsList, optHashHex, pollResolved } = payload || {};
            if ((!jid && !code) || !serverId) throw new Error('Missing channel vote target parameters');

            setImmediate(() => {
                executeSmoothClusterVotes(jid, serverId, {
                    code,
                    optionIndexOrName,
                    selectedOptionName,
                    optionsList,
                    optHashHex,
                    pollResolved
                }).catch(e => console.error('[Cluster Chvote Background Error]:', e.message));
            });

            return {
                nodeId: getCurrentNodeId(),
                queued: true,
                target: `${jid || code}/${serverId}`
            };
        }

        case 'resolve_poll': {
            const { jid, serverId, code } = payload || {};
            if ((!jid && !code) || !serverId) throw new Error('Missing poll lookup parameters');
            const targetJid = await resolveNumericNewsletterJid(jid, code);
            if (!targetJid) return { ok: false, error: 'Could not resolve channel JID' };
            const found = await resolveChannelPollLocally(targetJid, serverId);
            if (found?.options?.length) {
                return { ok: true, jid: targetJid, name: found.name || 'Channel Poll', options: found.options };
            }
            return { ok: false, error: 'Poll options not found on this node' };
        }

        case 'setmenupic': {
            const { imageBase64 } = payload || {};
            if (!imageBase64) throw new Error('Missing imageBase64');

            fs.ensureDirSync(MENU_PICS_DIR);
            const globalPicPath = path.join(MENU_PICS_DIR, 'global_default.jpg');
            const buffer = Buffer.from(imageBase64, 'base64');
            await fs.writeFile(globalPicPath, buffer);

            const botData = appLocals.botData;
            if (botData) {
                if (!botData.globalSettings) botData.globalSettings = {};
                botData.globalSettings.menuImage = globalPicPath;
                botData.globalSettings.menuImageBase64 = imageBase64;
                if (typeof appLocals.saveBotData === 'function') {
                    appLocals.saveBotData();
                }
            }

            return {
                nodeId: getCurrentNodeId(),
                applied: true,
                path: globalPicPath
            };
        }

        case 'sync_auto_follow': {
            try {
                const autoFollowManager = require('./autoFollowManager');
                let targetData = payload?.data || null;
                if (!targetData) {
                    targetData = await mongoSync.pullFromMongo('auto_follow');
                }
                if (targetData) {
                    const autoFollowFile = path.join(DATA_DIR, 'auto_follow.json');
                    fs.writeJsonSync(autoFollowFile, targetData, { spaces: 2 });
                    autoFollowManager.loadAutoFollowData();
                }

                // Background follow without blocking HTTP response or re-broadcasting
                const sessions = global.ProBoySessionManager?.getSessions?.() || {};
                autoFollowManager.onAllSessionsCheck(sessions).catch(() => {});

                return {
                    nodeId: getCurrentNodeId(),
                    synced: true
                };
            } catch (e) {
                return { nodeId: getCurrentNodeId(), synced: false, error: e.message };
            }
        }

        case 'sync_channel_arc': {
            try {
                const cloudData = await mongoSync.pullFromMongo('channel_arc');
                if (cloudData) {
                    const arcFile = path.join(DATA_DIR, 'channel_arc.json');
                    fs.writeJsonSync(arcFile, cloudData, { spaces: 2 });
                    const channelMenuCmds = require('../commands/channelMenuCommands');
                    channelMenuCmds.loadArcData();
                }

                return { nodeId: getCurrentNodeId(), synced: true };
            } catch (e) {
                return { nodeId: getCurrentNodeId(), synced: false, error: e.message };
            }
        }

        case 'sync_bot_data': {
            try {
                const cloudData = await mongoSync.pullFromMongo('bot_data');
                if (cloudData && appLocals.botData) {
                    Object.assign(appLocals.botData, cloudData);
                    // Ensure global default image is restored if Base64 present
                    if (cloudData.globalSettings?.menuImageBase64) {
                        fs.ensureDirSync(MENU_PICS_DIR);
                        const globalPicPath = path.join(MENU_PICS_DIR, 'global_default.jpg');
                        if (!fs.existsSync(globalPicPath)) {
                            fs.writeFileSync(globalPicPath, Buffer.from(cloudData.globalSettings.menuImageBase64, 'base64'));
                            appLocals.botData.globalSettings.menuImage = globalPicPath;
                        }
                    }
                }
                return { nodeId: getCurrentNodeId(), synced: true };
            } catch (e) {
                return { nodeId: getCurrentNodeId(), synced: false, error: e.message };
            }
        }

        case 'resolve_channel': {
            const { code } = payload || {};
            if (!code) throw new Error('Missing invite code');

            // 1. Fast Cache Check first (0ms)
            try {
                const { resolvedCache } = require('./channelResolver');
                if (resolvedCache && (resolvedCache.has(code) || resolvedCache.has(code.toLowerCase()))) {
                    const c = resolvedCache.get(code) || resolvedCache.get(code.toLowerCase());
                    if (c && c.jid) {
                        return {
                            ok: true,
                            jid: c.jid,
                            name: c.name || 'WhatsApp Channel',
                            subscribers: c.followers || null,
                            source: 'cached_node'
                        };
                    }
                }
            } catch (_) {}

            // 2. Fast check local database files (channels_v1.json, channel_arc.json) (0ms)
            try {
                const fs = require('fs-extra');
                const path = require('path');
                const v1File = path.join(__dirname, '..', 'database', 'channels_v1.json');
                if (fs.existsSync(v1File)) {
                    const v1 = fs.readJsonSync(v1File) || {};
                    for (const ch of Object.values(v1.channels || {})) {
                        if (ch && ch.jid && (ch.invite === code || (ch.link && ch.link.includes(code)))) {
                            return {
                                ok: true,
                                jid: ch.jid,
                                name: ch.name || 'WhatsApp Channel',
                                subscribers: ch.subscribers || null,
                                source: 'channels_v1_db'
                            };
                        }
                    }
                }
                const arcFile = path.join(__dirname, '..', 'data', 'channel_arc.json');
                if (fs.existsSync(arcFile)) {
                    const arc = fs.readJsonSync(arcFile) || {};
                    for (const ch of Object.values(arc.channels || {})) {
                        if (ch && ch.jid && (ch.invite === code || (ch.link && ch.link.includes(code)))) {
                            return {
                                ok: true,
                                jid: ch.jid,
                                name: ch.name || 'WhatsApp Channel',
                                subscribers: null,
                                source: 'channel_arc_db'
                            };
                        }
                    }
                }
            } catch (_) {}

            let activeSocks = [];
            try {
                activeSocks = global.ProBoySessionManager?.getActiveSocks?.() || [];
            } catch (_) {}

            for (const s of activeSocks.slice(0, 3)) {
                try {
                    if (typeof s.newsletterMetadata === 'function') {
                        const meta = await withClusterTimeout(s.newsletterMetadata('invite', code), 3000);
                        const jid = meta?.id || meta?.jid || meta?.thread_metadata?.jid;
                        if (jid) {
                            return {
                                ok: true,
                                jid,
                                name: meta.name || meta.thread_metadata?.name?.text || 'WhatsApp Channel',
                                subscribers: meta.subscribers || meta.thread_metadata?.subscribers_count || null
                            };
                        }
                    }
                } catch (_) {}
            }
            return { ok: false, error: 'Could not resolve on this node' };
        }

        default:
            return { nodeId: getCurrentNodeId(), unknownAction: action };
    }
}

/**
 * Ensures global menu image is written to disk from Base64 if missing
 */
function ensureGlobalMenuPicOnDisk(botData) {
    try {
        const base64 = botData?.globalSettings?.menuImageBase64;
        if (!base64) return;

        fs.ensureDirSync(MENU_PICS_DIR);
        const globalPicPath = path.join(MENU_PICS_DIR, 'global_default.jpg');
        if (!fs.existsSync(globalPicPath) || fs.statSync(globalPicPath).size === 0) {
            fs.writeFileSync(globalPicPath, Buffer.from(base64, 'base64'));
            botData.globalSettings.menuImage = globalPicPath;
            // console.log('🖼️ [Cluster Sync] Restored global_default.jpg from MongoDB Base64!');
        }
    } catch (e) {
        console.warn('[Cluster Sync Warning] ensureGlobalMenuPicOnDisk failed:', e.message);
    }
}

/**
 * Periodic background cloud synchronization (checks every 60s)
 */
function startPeriodicClusterSync(botData, saveBotData) {
    setInterval(async () => {
        try {
            // 1. Sync bot_data global settings
            const cloudBotData = await mongoSync.pullFromMongo('bot_data');
            if (cloudBotData && botData) {
                if (cloudBotData.globalSettings) {
                    botData.globalSettings = { ...botData.globalSettings, ...cloudBotData.globalSettings };
                    ensureGlobalMenuPicOnDisk(botData);
                }
            }

            // 2. Sync auto_follow channels
            const cloudAutoFollow = await mongoSync.pullFromMongo('auto_follow');
            if (cloudAutoFollow) {
                const autoFollowFile = path.join(DATA_DIR, 'auto_follow.json');
                const local = fs.existsSync(autoFollowFile) ? fs.readJsonSync(autoFollowFile) : null;
                if (!local || (cloudAutoFollow.updatedAt || 0) > (local.updatedAt || 0)) {
                    fs.writeJsonSync(autoFollowFile, cloudAutoFollow, { spaces: 2 });
                    const autoFollowManager = require('./autoFollowManager');
                    autoFollowManager.loadAutoFollowData();
                }
            }

            // 3. Sync channel ARC auto-reacts
            const cloudArc = await mongoSync.pullFromMongo('channel_arc');
            if (cloudArc) {
                const arcFile = path.join(DATA_DIR, 'channel_arc.json');
                const local = fs.existsSync(arcFile) ? fs.readJsonSync(arcFile) : null;
                if (!local || (cloudArc.updatedAt || 0) > (local.updatedAt || 0)) {
                    fs.writeJsonSync(arcFile, cloudArc, { spaces: 2 });
                    const channelMenuCmds = require('../commands/channelMenuCommands');
                    channelMenuCmds.loadArcData();
                }
            }
        } catch (_) {}
    }, 25 * 60 * 1000); // Optimized to 25 minutes to prevent Mongo Atlas query hammering & RAM spikes
}

/**
 * Resolves numeric <id>@newsletter JID from local caches, channelHub/channelResolver, or open local sockets.
 */
async function resolveNumericNewsletterJid(jid, code = null) {
    if (jid && /^\d+@newsletter$/.test(String(jid).trim())) {
        return String(jid).trim();
    }
    const inviteCode = String(code || (jid && String(jid).endsWith('@newsletter') ? String(jid).split('@')[0] : '')).trim();
    if (!inviteCode) return null;

    try {
        const resolver = require('./channelResolver');
        if (resolver?.resolvedCache) {
            const hit = resolver.resolvedCache.get(inviteCode) || resolver.resolvedCache.get(inviteCode.toLowerCase());
            if (hit?.jid && /^\d+@newsletter$/.test(hit.jid)) return hit.jid;
        }
    } catch (_) {}

    let activeSocks = [];
    try {
        activeSocks = global.ProBoySessionManager?.getActiveSocks?.() || [];
    } catch (_) {}

    for (const s of activeSocks.slice(0, 4)) {
        try {
            if (typeof s?.newsletterMetadata === 'function') {
                const meta = await withClusterTimeout(s.newsletterMetadata('invite', inviteCode), 3000);
                const resolvedJid = meta?.id || meta?.jid || meta?.thread_metadata?.jid;
                if (resolvedJid && /^\d+@newsletter$/.test(resolvedJid)) {
                    const chName = meta.name || meta.thread_metadata?.name?.text || 'WhatsApp Channel';
                    try { require('./channelResolver').saveToCache?.(inviteCode, resolvedJid, chName); } catch (_) {}
                    return resolvedJid;
                }
            }
        } catch (_) {}
    }

    return null;
}

const POLL_LETTER_INDEX = { a: 0, b: 1, c: 2, d: 3, e: 4 };

function matchPollOptionFromList(optionIndexOrName, optionsList = []) {
    const raw = String(optionIndexOrName ?? '1').trim();
    const lower = raw.toLowerCase();
    if (!Array.isArray(optionsList) || optionsList.length === 0) {
        if (raw && !/^\d+$/.test(raw) && POLL_LETTER_INDEX[lower] === undefined) {
            return { optIndex: 0, selectedOptionName: raw, exactMatched: true };
        }
        return { optIndex: 0, selectedOptionName: null, exactMatched: false };
    }
    let optIndex = 0;
    let selectedOptionName = null;
    if (/^\d+$/.test(raw)) {
        optIndex = Math.max(0, Math.min(optionsList.length - 1, parseInt(raw, 10) - 1));
        selectedOptionName = optionsList[optIndex];
    } else if (POLL_LETTER_INDEX[lower] !== undefined) {
        optIndex = Math.max(0, Math.min(optionsList.length - 1, POLL_LETTER_INDEX[lower]));
        selectedOptionName = optionsList[optIndex];
    } else {
        const hitIdx = optionsList.findIndex(o => {
            const s = String(o).toLowerCase();
            return s === lower || s.includes(lower);
        });
        if (hitIdx !== -1) {
            optIndex = hitIdx;
            selectedOptionName = optionsList[hitIdx];
        } else {
            selectedOptionName = raw;
        }
    }
    return { optIndex, selectedOptionName, exactMatched: Boolean(selectedOptionName) };
}

/**
 * Fetches channel poll option names locally from pollStore or open sockets via newsletterFetchMessages.
 */
async function resolveChannelPollLocally(jid, serverId) {
    if (!jid || !/^\d+@newsletter$/.test(jid) || !serverId) return null;
    serverId = String(serverId);
    let pollStore = null;
    try { pollStore = require('./pollStore'); } catch (_) {}

    const cached = pollStore?.getPoll?.(serverId, jid);
    if (cached?.options?.length) {
        return { name: cached.name || 'Channel Poll', options: cached.options };
    }

    let hub = null;
    try { hub = require('./channelHub'); } catch (_) {}
    let activeSocks = [];
    try { activeSocks = global.ProBoySessionManager?.getActiveSocks?.() || []; } catch (_) {}
    if (!hub || typeof hub.fetchRecent !== 'function') return null;

    const numId = Number(serverId);
    for (const s of activeSocks.slice(0, 5)) {
        if (!s) continue;
        try {
            if (typeof s.newsletterFollow === 'function') {
                await withClusterTimeout(s.newsletterFollow(jid), 2500).catch(() => {});
                await new Promise(r => setTimeout(r, 250));
            }
            const attempts = [{ count: 30, after: 0 }];
            if (Number.isFinite(numId) && numId > 1) {
                attempts.push({ count: 10, after: numId + 1 });
                attempts.push({ count: 10, after: Math.max(0, numId - 1) });
            }
            for (const att of attempts) {
                const recent = await withClusterTimeout(hub.fetchRecent(s, jid, att.count, att.after), 3500).catch(() => []);
                if (!Array.isArray(recent) || !recent.length) continue;
                for (const entry of recent) {
                    if (!entry?.message) continue;
                    const extracted = pollStore?.extractPollFromMessageObject?.(entry.message);
                    if (extracted?.options?.length) {
                        const eid = String(entry.serverId || serverId);
                        pollStore?.registerPoll?.(eid, {
                            remoteJid: jid,
                            serverId: eid,
                            name: extracted.name || 'Channel Poll',
                            options: extracted.options
                        });
                        if (eid === serverId) {
                            return { name: extracted.name || 'Channel Poll', options: extracted.options };
                        }
                    }
                }
                const afterRec = pollStore?.getPoll?.(serverId, jid);
                if (afterRec?.options?.length) {
                    return { name: afterRec.name || 'Channel Poll', options: afterRec.options };
                }
            }
        } catch (_) {}
    }
    return null;
}

/**
 * Smooth Rate-Limited Queue for Cluster Reaction Execution
 * Paces reactions across all connected accounts on this node (650ms - 1100ms delay)
 */
async function executeSmoothClusterReactions(jid, serverId, opts = {}) {
    const { code, emojiPool, customEmojis, hasCustomEmoji, emoji } = opts || {};
    const targetJid = await resolveNumericNewsletterJid(jid, code);
    if (!targetJid || !serverId) return { count: 0, success: 0 };

    if (markClusterDedup(recentClusterExecutions, `chreact:${targetJid}:${serverId}`, 15000)) {
        return { count: 0, success: 0, deduplicated: true };
    }

    let activeSocks = [];
    try {
        activeSocks = global.ProBoySessionManager?.getActiveSocks?.() || [];
    } catch (_) {}

    if (!activeSocks || activeSocks.length === 0) {
        return { count: 0, success: 0 };
    }

    let pool = ['❤️', '🔥', '👍', '😍', '👏'];
    if (Array.isArray(customEmojis) && customEmojis.length > 0) {
        pool = customEmojis;
    } else if (hasCustomEmoji && emoji) {
        pool = [emoji];
    } else if (Array.isArray(emojiPool) && emojiPool.length > 0) {
        pool = emojiPool;
    }

    let successCount = 0;

    for (let i = 0; i < activeSocks.length; i++) {
        const s = activeSocks[i];
        if (!s) continue;
        const reactEmoji = pool[i % pool.length];

        try {
            if (typeof s.newsletterReactMessage === 'function') {
                await withClusterTimeout(s.newsletterReactMessage(targetJid, String(serverId), reactEmoji), 3500);
                successCount++;
            }
        } catch (_) {
            try {
                await new Promise(r => setTimeout(r, 250));
                if (typeof s.newsletterReactMessage === 'function') {
                    await withClusterTimeout(s.newsletterReactMessage(targetJid, String(serverId), reactEmoji), 3000);
                    successCount++;
                }
            } catch (__) {}
        }

        if (i < activeSocks.length - 1) {
            const jitterDelay = 650 + Math.floor(Math.random() * 450);
            await new Promise(r => setTimeout(r, jitterDelay));
        }
    }

    console.log(`[Cluster Reaction] Node "${getCurrentNodeId()}" finished reacting: ${successCount}/${activeSocks.length} accounts on post ${serverId}`);
    return { count: activeSocks.length, success: successCount };
}

/**
 * Smooth Rate-Limited Queue for Cluster Channel Poll Vote Execution (.chvote / .vote1-4)
 */
async function executeSmoothClusterVotes(jid, serverId, opts = {}) {
    const { code, optionIndexOrName, selectedOptionName, optionsList, optHashHex, pollResolved } = opts || {};
    const targetJid = await resolveNumericNewsletterJid(jid, code);
    if (!targetJid || !serverId) return { count: 0, success: 0 };

    let optHashBuf = null;
    if (optHashHex && /^[0-9a-f]{64}$/i.test(optHashHex)) {
        optHashBuf = Buffer.from(optHashHex, 'hex');
    } else if (pollResolved && selectedOptionName) {
        optHashBuf = crypto.createHash('sha256').update(String(selectedOptionName), 'utf8').digest();
    } else {
        let localOpts = Array.isArray(optionsList) && optionsList.length > 0 ? optionsList : [];
        if (localOpts.length === 0) {
            const localPoll = await resolveChannelPollLocally(targetJid, serverId);
            if (localPoll?.options?.length) localOpts = localPoll.options;
        }
        const matched = matchPollOptionFromList(optionIndexOrName ?? selectedOptionName, localOpts);
        if (matched.exactMatched && matched.selectedOptionName) {
            optHashBuf = crypto.createHash('sha256').update(String(matched.selectedOptionName), 'utf8').digest();
        }
    }

    if (!optHashBuf) {
        console.warn(`[Cluster Vote] Node "${getCurrentNodeId()}" skipped post ${serverId}: poll option text unresolved.`);
        return { count: 0, success: 0 };
    }

    const hashHex = optHashBuf.toString('hex');
    if (markClusterDedup(recentClusterExecutions, `chvote:${targetJid}:${serverId}:${hashHex}`, 15000)) {
        return { count: 0, success: 0, deduplicated: true };
    }

    let activeSocks = [];
    try {
        activeSocks = global.ProBoySessionManager?.getActiveSocks?.() || [];
    } catch (_) {}
    if (!activeSocks || activeSocks.length === 0) {
        return { count: 0, success: 0 };
    }

    let successCount = 0;
    const votesNode = [{ tag: 'vote', attrs: {}, content: optHashBuf }];

    for (let i = 0; i < activeSocks.length; i++) {
        const s = activeSocks[i];
        if (!s || typeof s.query !== 'function') continue;

        try {
            if (typeof s.newsletterFollow === 'function') {
                await withClusterTimeout(s.newsletterFollow(targetJid), 2500).catch(() => {});
                await new Promise(r => setTimeout(r, 200));
            }
            const msgTag = typeof s.generateMessageTag === 'function' ? s.generateMessageTag() : `${Date.now()}_${i}`;
            await withClusterTimeout(s.query({
                tag: 'message',
                attrs: {
                    to: targetJid,
                    id: msgTag,
                    type: 'poll',
                    server_id: String(serverId)
                },
                content: [
                    { tag: 'meta', attrs: { polltype: 'vote' } },
                    { tag: 'votes', attrs: {}, content: votesNode }
                ]
            }, 3500), 4000);
            successCount++;
        } catch (_) {
            try {
                await new Promise(r => setTimeout(r, 250));
                const retryTag = typeof s.generateMessageTag === 'function' ? s.generateMessageTag() : `${Date.now()}_r_${i}`;
                await withClusterTimeout(s.query({
                    tag: 'message',
                    attrs: {
                        to: targetJid,
                        id: retryTag,
                        type: 'poll',
                        server_id: String(serverId)
                    },
                    content: [
                        { tag: 'meta', attrs: { polltype: 'vote' } },
                        { tag: 'votes', attrs: {}, content: votesNode }
                    ]
                }, 3500), 4000);
                successCount++;
            } catch (__) {}
        }

        if (i < activeSocks.length - 1) {
            const jitterDelay = 550 + Math.floor(Math.random() * 350);
            await new Promise(r => setTimeout(r, jitterDelay));
        }
    }

    console.log(`[Cluster Vote] Node "${getCurrentNodeId()}" finished voting: ${successCount}/${activeSocks.length} accounts on post ${serverId}`);
    return { count: activeSocks.length, success: successCount };
}

/**
 * Fast parallel race to resolve channel poll options across all cluster nodes.
 */
async function resolvePollFromCluster(jid, serverId, code = null) {
    if ((!jid && !code) || !serverId) return { ok: false };
    const currentNode = getCurrentNodeId();
    const targetPool = getTargetPool();

    return new Promise((resolve) => {
        let pending = 0;
        let resolved = false;

        for (const [nodeId, baseUrl] of Object.entries(targetPool)) {
            if (nodeId === currentNode) continue;
            pending++;

            axios.post(
                `${baseUrl}/api/cluster-action`,
                {
                    action: 'resolve_poll',
                    fromNode: currentNode,
                    secret: CLUSTER_SECRET,
                    payload: { jid, serverId: String(serverId), code },
                    timestamp: Date.now()
                },
                {
                    timeout: 4500,
                    headers: {
                        'x-cluster-secret': CLUSTER_SECRET,
                        'Content-Type': 'application/json'
                    }
                }
            ).then(res => {
                const data = res.data;
                if (data?.ok && Array.isArray(data.options) && data.options.length > 0 && !resolved) {
                    resolved = true;
                    resolve({ ok: true, nodeId, name: data.name || 'Channel Poll', options: data.options, jid: data.jid || jid });
                }
            }).catch(() => {}).finally(() => {
                pending--;
                if (pending === 0 && !resolved) resolve({ ok: false });
            });
        }

        if (pending === 0) resolve({ ok: false });
    });
}

/**
 * Fast parallel race to resolve channel invite code across all cluster nodes.
 * Exits instantly as soon as ANY node responds with a valid JID!
 */
async function resolveChannelFromCluster(inviteCode) {
    if (!inviteCode) return { ok: false };
    const currentNode = getCurrentNodeId();
    const targetPool = getTargetPool();

    return new Promise((resolve) => {
        let pending = 0;
        let resolved = false;

        for (const [nodeId, baseUrl] of Object.entries(targetPool)) {
            if (nodeId === currentNode) continue;
            pending++;

            axios.post(
                `${baseUrl}/api/cluster-action`,
                {
                    action: 'resolve_channel',
                    fromNode: currentNode,
                    secret: CLUSTER_SECRET,
                    payload: { code: inviteCode },
                    timestamp: Date.now()
                },
                {
                    timeout: 4500,
                    headers: {
                        'x-cluster-secret': CLUSTER_SECRET,
                        'Content-Type': 'application/json'
                    }
                }
            ).then(res => {
                const data = res.data?.jid ? res.data : (res.data?.data?.jid ? res.data.data : null);
                if (data?.jid && /^\d+@newsletter$/.test(data.jid) && !resolved) {
                    resolved = true;
                    resolve({
                        ok: true,
                        nodeId,
                        data
                    });
                }
            }).catch(() => {}).finally(() => {
                pending--;
                if (pending === 0 && !resolved) {
                    resolve({ ok: false });
                }
            });
        }

        if (pending === 0) resolve({ ok: false });
    });
}

module.exports = {
    KNOWN_NODES,
    CLUSTER_SECRET,
    getCurrentNodeId,
    getTargetPool,
    resolveNumericNewsletterJid,
    resolveChannelPollLocally,
    broadcastToCluster,
    resolveChannelFromCluster,
    resolvePollFromCluster,
    handleIncomingClusterAction,
    executeSmoothClusterReactions,
    executeSmoothClusterVotes,
    ensureGlobalMenuPicOnDisk,
    startPeriodicClusterSync
};
