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

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const mongoSync = require('./mongoSync');

const CLUSTER_SECRET = process.env.CLUSTER_SECRET || 'saqib_cluster_secure_mesh_2026';

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
    s22: 'https://saqibbot22-9318c2de0250.herokuapp.com',
    s23: 'https://saqibot23-1f4bec48d0f2.herokuapp.com',
    s25: 'https://saqibbot25-46c4cf949a77.herokuapp.com',
    s25b: 'https://saqibot25-0974df36edd8.herokuapp.com',
    s26: 'https://saqibot26-69a8011cc819.herokuapp.com',
    s27: 'https://saqibot27-1c1d295781fa.herokuapp.com',
    s28: 'https://saqibbot28-658e7de676c8.herokuapp.com',
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

/**
 * Broadcast an action payload to all other cluster nodes in parallel
 */
async function broadcastToCluster(action, payload = {}) {
    const currentNode = getCurrentNodeId();
    const promises = [];

    for (const [nodeId, baseUrl] of Object.entries(KNOWN_NODES)) {
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
                    timeout: (action === 'chfollow' || action === 'chunfollow' || action === 'chreact') ? 45000 : 8000,
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
            const { jid, serverId, emojiPool, customEmojis, hasCustomEmoji, emoji } = payload || {};
            if (!jid || !serverId) throw new Error('Missing channel reaction target parameters');

            // Asynchronously execute smooth rate-limited reactions in background
            setImmediate(() => {
                executeSmoothClusterReactions(jid, serverId, { emojiPool, customEmojis, hasCustomEmoji, emoji })
                    .catch(e => console.error('[Cluster Chreact Background Error]:', e.message));
            });

            return {
                nodeId: getCurrentNodeId(),
                queued: true,
                target: `${jid}/${serverId}`
            };
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

            for (const s of activeSocks.slice(0, 2)) {
                try {
                    if (typeof s.newsletterMetadata === 'function') {
                        const meta = await withTimeout(s.newsletterMetadata('invite', code), 3000);
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
    }, 5 * 60 * 1000); // Optimized to 5 minutes to prevent Mongo Atlas query hammering & RAM spikes
}

/**
 * Smooth Rate-Limited Queue for Cluster Reaction Execution
 * Paces reactions across all connected accounts on this node (800ms - 1300ms delay)
 * Includes 3.5s hard socket timeout so stuck Baileys requests never freeze the event loop.
 */
async function executeSmoothClusterReactions(jid, serverId, opts = {}) {
    const { emojiPool, customEmojis, hasCustomEmoji, emoji } = opts || {};
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
    const withTimeout = (promise, ms = 3500) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    ]);

    for (let i = 0; i < activeSocks.length; i++) {
        const s = activeSocks[i];
        if (!s) continue;
        const reactEmoji = pool[i % pool.length];

        try {
            // Ensure socket follows the channel so WhatsApp permits reaction
            if (typeof s.newsletterFollow === 'function') {
                await withTimeout(s.newsletterFollow(jid), 3000).catch(() => {});
            }
            if (typeof s.newsletterReactMessage === 'function') {
                await withTimeout(s.newsletterReactMessage(jid, String(serverId), reactEmoji), 3500);
                successCount++;
            }
        } catch (err) {
            // Safe fallback attempt
            try {
                if (typeof s.newsletterReactMessage === 'function') {
                    await withTimeout(s.newsletterReactMessage(jid, String(serverId), reactEmoji), 3000).catch(() => {});
                }
            } catch (_) {}
        }

        // Pacing delay (800ms to 1300ms randomized) between sockets to prevent WhatsApp 429 rate limit
        if (i < activeSocks.length - 1) {
            const jitterDelay = 800 + Math.floor(Math.random() * 500);
            await new Promise(r => setTimeout(r, jitterDelay));
        }
    }

    console.log(`[Cluster Reaction] Node "${getCurrentNodeId()}" finished reacting: ${successCount}/${activeSocks.length} accounts on post ${serverId}`);
    return { count: activeSocks.length, success: successCount };
}

/**
 * Fast parallel race to resolve channel invite code across all 28 cluster nodes.
 * Exits instantly as soon as ANY node responds with a valid JID!
 */
async function resolveChannelFromCluster(inviteCode) {
    if (!inviteCode) return { ok: false };
    const currentNode = getCurrentNodeId();

    return new Promise((resolve) => {
        let pending = 0;
        let resolved = false;

        for (const [nodeId, baseUrl] of Object.entries(KNOWN_NODES)) {
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
                if (data?.jid && !resolved) {
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
    broadcastToCluster,
    resolveChannelFromCluster,
    handleIncomingClusterAction,
    executeSmoothClusterReactions,
    ensureGlobalMenuPicOnDisk,
    startPeriodicClusterSync
};
