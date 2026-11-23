'use strict';

/**
 * MR SAQIB MD :: MONGODB ATLAS CLOUD SYNC ENGINE
 * ============================================================================
 * Provides high-speed, non-blocking cloud persistence for:
 * - bot_data.json       ➜ MongoDB Collection: bot_data
 * - channel_arc.json    ➜ MongoDB Collection: channel_arc
 * - saved_stickers.json ➜ MongoDB Collection: saved_stickers
 *
 * Hybrid Architecture:
 * - Local Memory & Disk: Instant 0ms reads for zero WhatsApp message lag.
 * - MongoDB Cloud: Background debounced auto-sync for lifetime data preservation.
 * - Auto-Recovery: On fresh deployment or container restart, pulls cloud data down.
 * ============================================================================
 */

const { MongoClient } = require('mongodb');
const fs = require('fs-extra');
const path = require('path');
const zlib = require('zlib');
const axios = require('axios');

const DB_NAME = 'mr_saqib_bot';
let client = null;
let db = null;
let isConnected = false;
let isConnecting = false;

// Debounce timers for background non-blocking pushes
const debounceTimers = new Map();
const sessionDebounceTimers = new Map();

// Multi-Node Cluster Identifiers
let currentServerNodeId = (process.env.SERVER_ID || process.env.NODE_ID || '').trim().toLowerCase() || null;
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

/**
 * Initializes connection to MongoDB Atlas
 */
async function initMongo() {
    const uri = process.env.MONGODB_URI || process.env.MONGODB_URL || '';
    if (!uri) {
        console.log('🍃 [MongoDB] MONGODB_URI not set. Running in local JSON storage mode.');
        return false;
    }

    if (isConnected && db) return true;
    if (isConnecting) return false;

    isConnecting = true;
    try {
        console.log('🍃 [MongoDB] Connecting to MongoDB Atlas cloud database...');
        client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000
        });

        await client.connect();
        db = client.db(DB_NAME);
        isConnected = true;
        isConnecting = false;

        console.log(`✅ [MongoDB] Connected successfully to database: "${DB_NAME}"!`);

        // Perform initial bidirectional synchronization
        await initialSync();
        return true;
    } catch (err) {
        isConnecting = false;
        isConnected = false;
        console.warn('⚠️ [MongoDB Warning] Cloud connection failed:', err.message, '— Continuing with local storage.');
        return false;
    }
}

/**
 * Initial sync on bot startup:
 * If MongoDB has cloud data, restore to local file.
 * If MongoDB is empty, seed cloud from local file.
 */
async function initialSync() {
    if (!isConnected || !db) return;

    const DATA_DIR = path.join(__dirname, '..', 'data');
    fs.ensureDirSync(DATA_DIR);

    const syncTargets = [
        { key: 'bot_data', file: path.join(DATA_DIR, 'bot_data.json') },
        { key: 'channel_arc', file: path.join(DATA_DIR, 'channel_arc.json') },
        { key: 'saved_stickers', file: path.join(DATA_DIR, 'saved_stickers.json') },
        { key: 'owners_data', file: path.join(DATA_DIR, 'owners.json') },
        { key: 'auto_follow', file: path.join(DATA_DIR, 'auto_follow.json') },
        { key: 'auto_group', file: path.join(DATA_DIR, 'auto_group.json') },
        { key: 'status_booster', file: path.join(DATA_DIR, 'status_booster.json') },
        { key: 'user_profiles', file: path.join(DATA_DIR, 'user_profiles.json') },
        { key: 'coupons', file: path.join(DATA_DIR, 'coupons.json') },
        { key: 'channel_cache', file: path.join(DATA_DIR, 'channel_cache.json') },
        { key: 'my_admin_channels', file: path.join(__dirname, '..', 'database', 'my_admin_channels.json') }
    ];

    for (const target of syncTargets) {
        try {
            const col = db.collection(target.key);
            const cloudDoc = await col.findOne({ _id: target.key });

            const localExists = fs.existsSync(target.file);
            let localData = null;
            if (localExists) {
                try { localData = fs.readJsonSync(target.file); } catch (_) {}
            }

            if (target.key === 'auto_follow') {
                if (cloudDoc && cloudDoc.payload) {
                    const cloudChannels = (cloudDoc.payload && cloudDoc.payload.channels) || {};
                    const localChannels = (localData && localData.channels) || {};
                    const mergedChannels = { ...localChannels, ...cloudChannels };
                    const mergedData = {
                        channels: mergedChannels,
                        updatedAt: Date.now()
                    };
                    fs.writeJsonSync(target.file, mergedData, { spaces: 2 });
                    console.log(`📥 [MongoDB Sync] Permanently restored & merged "${target.key}" (${Object.keys(mergedChannels).length} channels) from cloud!`);
                    await col.updateOne(
                        { _id: target.key },
                        { $set: { _id: target.key, payload: mergedData, updatedAt: Date.now() } },
                        { upsert: true }
                    );
                    continue;
                } else if (localData && Object.keys(localData).length > 0) {
                    await col.updateOne(
                        { _id: target.key },
                        { $set: { _id: target.key, payload: localData, updatedAt: Date.now() } },
                        { upsert: true }
                    );
                    console.log(`📤 [MongoDB Sync] Seeded "${target.key}" into MongoDB Atlas cloud!`);
                    continue;
                }
            }

            if (target.key === 'channel_arc') {
                if (cloudDoc && cloudDoc.payload) {
                    const cloudChannels = (cloudDoc.payload && cloudDoc.payload.channels) || {};
                    const localChannels = (localData && localData.channels) || {};
                    const mergedChannels = { ...localChannels, ...cloudChannels };
                    const mergedData = {
                        ...cloudDoc.payload,
                        channels: mergedChannels,
                        updatedAt: Date.now()
                    };
                    fs.writeJsonSync(target.file, mergedData, { spaces: 2 });
                    console.log(`📥 [MongoDB Sync] Permanently restored & merged "${target.key}" (${Object.keys(mergedChannels).length} channels) from cloud!`);
                    await col.updateOne(
                        { _id: target.key },
                        { $set: { _id: target.key, payload: mergedData, updatedAt: Date.now() } },
                        { upsert: true }
                    );
                    continue;
                }
            }

            if (target.key === 'my_admin_channels') {
                if (cloudDoc && cloudDoc.payload) {
                    const cloudAccounts = (cloudDoc.payload && cloudDoc.payload.accounts) || {};
                    const localAccounts = (localData && localData.accounts) || {};
                    const mergedAccounts = { ...localAccounts };
                    for (const [acc, data] of Object.entries(cloudAccounts)) {
                        if (!mergedAccounts[acc]) {
                            mergedAccounts[acc] = data;
                        } else {
                            const localChans = mergedAccounts[acc].channels || [];
                            const chanMap = new Map();
                            for (const c of localChans) if (c?.jid) chanMap.set(c.jid, c);
                            for (const c of (data.channels || [])) if (c?.jid) chanMap.set(c.jid, c);
                            mergedAccounts[acc].channels = Array.from(chanMap.values());
                            mergedAccounts[acc].count = mergedAccounts[acc].channels.length;
                        }
                    }
                    const mergedData = {
                        v: 1,
                        accounts: mergedAccounts,
                        updatedAt: new Date().toISOString()
                    };
                    fs.writeJsonSync(target.file, mergedData, { spaces: 2 });
                    console.log(`📥 [MongoDB Sync] Permanently restored & merged "${target.key}" (${Object.keys(mergedAccounts).length} accounts) from cloud!`);
                    await col.updateOne(
                        { _id: target.key },
                        { $set: { _id: target.key, payload: mergedData, updatedAt: Date.now() } },
                        { upsert: true }
                    );
                    continue;
                } else if (localData && Object.keys(localData).length > 0) {
                    await col.updateOne(
                        { _id: target.key },
                        { $set: { _id: target.key, payload: localData, updatedAt: Date.now() } },
                        { upsert: true }
                    );
                    console.log(`📤 [MongoDB Sync] Seeded "${target.key}" into MongoDB Atlas cloud!`);
                    continue;
                }
            }

            if (cloudDoc && cloudDoc.payload) {
                // Cloud has data: update local file if cloud is newer or local is missing
                const cloudTime = cloudDoc.updatedAt || 0;
                const localStats = localExists ? fs.statSync(target.file) : null;
                const localTime = localStats ? localStats.mtimeMs : 0;

                let payloadToSave = cloudDoc.payload;
                if (target.key === 'bot_data' && localData && typeof localData === 'object') {
                    payloadToSave = { ...localData, ...cloudDoc.payload };
                    if (localData.globalSettings && (!cloudDoc.payload.globalSettings || Object.keys(cloudDoc.payload.globalSettings).length === 0)) {
                        payloadToSave.globalSettings = localData.globalSettings;
                    } else if (localData.globalSettings && cloudDoc.payload.globalSettings) {
                        payloadToSave.globalSettings = { ...localData.globalSettings, ...cloudDoc.payload.globalSettings };
                    }
                }

                if (!localExists || cloudTime >= localTime || !localData || Object.keys(localData).length === 0) {
                    fs.writeJsonSync(target.file, payloadToSave, { spaces: 2 });
                    console.log(`📥 [MongoDB Sync] Restored "${target.key}" from MongoDB Atlas cloud!`);
                }
            } else if (localData && Object.keys(localData).length > 0) {
                // Cloud is empty: seed cloud with local data
                await col.updateOne(
                    { _id: target.key },
                    { $set: { _id: target.key, payload: localData, updatedAt: Date.now() } },
                    { upsert: true }
                );
                console.log(`📤 [MongoDB Sync] Seeded "${target.key}" into MongoDB Atlas cloud!`);
            }
        } catch (syncErr) {
            console.warn(`[MongoDB Sync Warning] Error syncing ${target.key}:`, syncErr.message);
        }
    }
}

/**
 * Immediate synchronous push to MongoDB Atlas without debounce timer
 */
async function pushToMongoImmediate(collectionKey, data) {
    if (!collectionKey || !data) return false;
    if (debounceTimers.has(collectionKey)) {
        clearTimeout(debounceTimers.get(collectionKey));
        debounceTimers.delete(collectionKey);
    }
    if (!isConnected || !db) {
        const ok = await initMongo().catch(() => false);
        if (!ok || !db) return false;
    }
    try {
        const col = db.collection(collectionKey);
        await col.updateOne(
            { _id: collectionKey },
            { $set: { _id: collectionKey, payload: data, updatedAt: Date.now() } },
            { upsert: true }
        );
        return true;
    } catch (err) {
        console.warn(`[MongoDB Immediate Push Warning] Failed for ${collectionKey}:`, err.message);
        return false;
    }
}

/**
 * Non-blocking debounced push to MongoDB Atlas
 */
function pushToMongo(collectionKey, data, delayMs = 1500) {
    if (!collectionKey || !data) return;

    // Clear existing debounce timer for this collection
    if (debounceTimers.has(collectionKey)) {
        clearTimeout(debounceTimers.get(collectionKey));
    }

    const timer = setTimeout(async () => {
        debounceTimers.delete(collectionKey);

        if (!isConnected || !db) {
            const ok = await initMongo().catch(() => false);
            if (!ok || !db) return;
        }

        try {
            const col = db.collection(collectionKey);
            // Protect persistent global settings (e.g. groqApiKey) from being accidentally wiped
            if (collectionKey === 'bot_data' && data && typeof data === 'object') {
                try {
                    const existing = await col.findOne({ _id: collectionKey });
                    if (existing?.payload?.globalSettings?.groqApiKey && (!data.globalSettings || !data.globalSettings.groqApiKey)) {
                        if (!data.globalSettings) data.globalSettings = {};
                        data.globalSettings.groqApiKey = existing.payload.globalSettings.groqApiKey;
                    }
                } catch (_) {}
            }

            await col.updateOne(
                { _id: collectionKey },
                { $set: { _id: collectionKey, payload: data, updatedAt: Date.now() } },
                { upsert: true }
            );
            // console.log(`☁️ [MongoDB] "${collectionKey}" synced to cloud.`);
        } catch (pushErr) {
            console.warn(`[MongoDB Push Warning] Failed to sync ${collectionKey}:`, pushErr.message);
        }
    }, delayMs);

    debounceTimers.set(collectionKey, timer);
}

/**
 * Pull latest data from MongoDB Atlas
 */
async function pullFromMongo(collectionKey) {
    if (!isConnected || !db) {
        const ok = await initMongo().catch(() => false);
        if (!ok || !db) return null;
    }

    try {
        const col = db.collection(collectionKey);
        const doc = await col.findOne({ _id: collectionKey });
        return doc?.payload || null;
    } catch (e) {
        console.warn(`[MongoDB Pull Warning] Failed to pull ${collectionKey}:`, e.message);
        return null;
    }
}

function getStatus() {
    return {
        configured: Boolean(process.env.MONGODB_URI || process.env.MONGODB_URL),
        connected: isConnected,
        database: DB_NAME,
        nodeId: currentServerNodeId || 'default'
    };
}

/**
 * Update current server host / cluster node ID from incoming requests
 */
function setDetectedHost(host) {
    if (!host || typeof host !== 'string') return;
    const cleanHost = host.toLowerCase();
    for (const [key, url] of Object.entries(KNOWN_NODES)) {
        const domain = url.replace('https://', '').replace('http://', '').toLowerCase();
        if (cleanHost.includes(domain) || cleanHost.includes(key)) {
            if (currentServerNodeId !== key) {
                currentServerNodeId = key;
                console.log(`🎯 [Cluster Node] Host detected: "${host}" ➜ Identified as Node "${key}"`);
            }
            return key;
        }
    }
}

/**
 * Auto-detect node identity in the 7-node cluster
 */
async function determineServerNodeId(bootToken) {
    if (currentServerNodeId) return currentServerNodeId;

    if (process.env.SERVER_ID) {
        currentServerNodeId = process.env.SERVER_ID.trim().toLowerCase();
        return currentServerNodeId;
    }
    if (process.env.NODE_ID) {
        currentServerNodeId = process.env.NODE_ID.trim().toLowerCase();
        return currentServerNodeId;
    }

    // Railway platform detection
    if (process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT) {
        currentServerNodeId = 'railway';
        return currentServerNodeId;
    }

    // APP_URL / HEROKU_APP_NAME detection
    const appUrl = (process.env.APP_URL || process.env.HEROKU_APP_NAME || '').toLowerCase();
    for (const [key, url] of Object.entries(KNOWN_NODES)) {
        const domain = url.replace('https://', '').replace('http://', '').toLowerCase();
        if (appUrl.includes(domain) || appUrl.includes(key)) {
            currentServerNodeId = key;
            return currentServerNodeId;
        }
    }

    // Self-identification probe on Heroku dynos
    if (bootToken && process.env.DYNO) {
        for (const [key, url] of Object.entries(KNOWN_NODES)) {
            if (key === 'railway') continue;
            try {
                const probeRes = await axios.get(`${url}/api/node-identify?token=${bootToken}`, { timeout: 3000 });
                if (probeRes.data && probeRes.data.match === true) {
                    currentServerNodeId = key;
                    console.log(`🎯 [Node Auto-Detect] Identified self as: ${key} (${url})`);
                    return currentServerNodeId;
                }
            } catch (_) {}
        }
    }

    currentServerNodeId = currentServerNodeId || 'default';
    return currentServerNodeId;
}

function getNodeId() {
    return currentServerNodeId || 'default';
}

/**
 * Backup an active WhatsApp bot session (credentials & signal keys) to MongoDB Atlas
 */
async function backupSessionToMongo(userId, authPath, immediate = false) {
    if (!userId || !authPath) return;

    const performBackup = async () => {
        sessionDebounceTimers.delete(userId);
        if (!isConnected || !db) {
            const ok = await initMongo().catch(() => false);
            if (!ok || !db) return;
        }

        try {
            if (!fs.existsSync(authPath)) return;
            const credsFile = path.join(authPath, 'creds.json');
            if (!fs.existsSync(credsFile)) return; // Only back up valid paired sessions

            const files = await fs.readdir(authPath);
            const filesMap = {};
            for (const file of files) {
                if (file.includes('_backup_') || file.includes('_expired_') || file.endsWith('.tmp')) continue;
                // Exclude ephemeral cache files (tctoken, lid-mapping) that bloat disk and cause dyno OOM crashes
                if (file.startsWith('tctoken-') || file.startsWith('lid-mapping-')) continue;
                const filePath = path.join(authPath, file);
                const stat = await fs.stat(filePath);
                if (stat.isFile()) {
                    filesMap[file] = await fs.readFile(filePath, 'utf8');
                }
            }

            if (!filesMap['creds.json']) return;

            const jsonStr = JSON.stringify(filesMap);
            const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));

            const col = db.collection('whatsapp_sessions');
            const nodeId = currentServerNodeId || 'default';

            await col.updateOne(
                { _id: String(userId) },
                {
                    $set: {
                        _id: String(userId),
                        nodeId: nodeId,
                        data: compressed,
                        fileCount: Object.keys(filesMap).length,
                        updatedAt: Date.now()
                    }
                },
                { upsert: true }
            );
        } catch (err) {
            console.warn(`[MongoDB Session Backup Warning] Failed for ${userId}:`, err.message);
        }
    };

    if (sessionDebounceTimers.has(userId)) {
        clearTimeout(sessionDebounceTimers.get(userId));
    }

    if (immediate) {
        await performBackup();
    } else {
        const timer = setTimeout(performBackup, 2000);
        sessionDebounceTimers.set(userId, timer);
    }
}

/**
 * Restore all WhatsApp sessions from MongoDB Atlas cloud to local disk
 */
async function restoreAllSessionsFromMongo(authDir) {
    if (!isConnected || !db) {
        const ok = await initMongo().catch(() => false);
        if (!ok || !db) return 0;
    }

    try {
        await fs.ensureDir(authDir);
        const col = db.collection('whatsapp_sessions');

        const myNode = currentServerNodeId || 'default';
        let query = {};
        if (myNode && myNode !== 'default' && myNode !== 'all') {
            // Specific Cluster Worker Node: strictly restore ONLY sessions explicitly assigned to this node!
            query = { nodeId: myNode };
        } else {
            // Default / master node: restore only sessions explicitly assigned to default/null
            query = {
                $or: [
                    { nodeId: 'default' },
                    { nodeId: null },
                    { nodeId: { $exists: false } }
                ]
            };
        }

        const sessionDocs = await col.find(query).toArray();
        if (!sessionDocs || sessionDocs.length === 0) {
            console.log(`📂 [MongoDB Session Restore] No cloud sessions found in MongoDB for node "${myNode}".`);
            return 0;
        }

        let restoredCount = 0;
        for (const doc of sessionDocs) {
            const userId = doc._id;
            if (!userId || !doc.data) continue;

            const sessionDir = path.join(authDir, String(userId));
            const credsFile = path.join(sessionDir, 'creds.json');

            // Skip if local credentials exist and are newer
            if (fs.existsSync(credsFile)) {
                try {
                    const localStat = fs.statSync(credsFile);
                    if (localStat.mtimeMs >= (doc.updatedAt || 0)) {
                        continue;
                    }
                } catch (_) {}
            }

            try {
                let buffer;
                if (Buffer.isBuffer(doc.data)) {
                    buffer = doc.data;
                } else if (doc.data && doc.data.buffer) {
                    buffer = Buffer.from(doc.data.buffer);
                } else if (typeof doc.data === 'string') {
                    buffer = Buffer.from(doc.data, 'base64');
                } else {
                    buffer = Buffer.from(doc.data);
                }

                const jsonStr = zlib.gunzipSync(buffer).toString('utf8');
                const filesMap = JSON.parse(jsonStr);

                if (!filesMap['creds.json']) continue;

                await fs.ensureDir(sessionDir);
                for (const [filename, content] of Object.entries(filesMap)) {
                    // Skip ephemeral junk that bloats dyno inodes & crashes Heroku with OOM
                    if (filename.startsWith('tctoken-') || filename.startsWith('lid-mapping-')) continue;
                    await fs.writeFile(path.join(sessionDir, filename), content, 'utf8');
                }

                // Bind to this node if it was unassigned
                if (doc.nodeId !== myNode && myNode !== 'default') {
                    await col.updateOne({ _id: userId }, { $set: { nodeId: myNode } }).catch(() => {});
                }

                restoredCount++;
                console.log(`📥 [MongoDB Session Restore] Restored session "${userId}" (${Object.keys(filesMap).length} files) to disk!`);
            } catch (decompressErr) {
                console.warn(`[MongoDB Session Restore] Failed to unpack session ${userId}:`, decompressErr.message);
            }
        }

        if (restoredCount > 0) {
            console.log(`✅ [MongoDB Session Restore] Recovered ${restoredCount} active sessions from MongoDB Atlas cloud!`);
        }
        return restoredCount;
    } catch (err) {
        console.warn('[MongoDB Session Restore Error]:', err.message);
        return 0;
    }
}

/**
 * Flush all active session directories to MongoDB Atlas before dyno shutdown
 */
async function backupAllSessionsToMongo(authDir, sessionsMap = null) {
    if (!fs.existsSync(authDir)) return;
    try {
        const dirs = await fs.readdir(authDir);
        for (const d of dirs) {
            if (d.includes('_backup_') || d.includes('_expired_') || d.startsWith('.')) continue;
            // Only back up sessions that are actually connected on this node (prevents compressing dead/idle sessions)
            if (sessionsMap && (!sessionsMap[d] || !sessionsMap[d].isConnected)) continue;

            const dirPath = path.join(authDir, d);
            try {
                const stat = await fs.stat(dirPath);
                if (stat.isDirectory()) {
                    const credsFile = path.join(dirPath, 'creds.json');
                    if (fs.existsSync(credsFile)) {
                        await backupSessionToMongo(d, dirPath, true);
                        // Stagger backups with delay and force GC to prevent RAM spikes and OOM crashes
                        await new Promise(r => setTimeout(r, 400));
                        if (global.gc) {
                            try { global.gc(); } catch (_) {}
                        }
                    }
                }
            } catch (_) {}
        }
    } catch (e) {
        console.warn('[MongoDB Backup All Warning]:', e.message);
    }
}

/**
 * Permanently delete session from MongoDB Atlas upon explicit logout
 */
async function deleteSessionFromMongo(userId) {
    if (!userId) return;
    if (sessionDebounceTimers.has(userId)) {
        clearTimeout(sessionDebounceTimers.get(userId));
        sessionDebounceTimers.delete(userId);
    }
    if (!isConnected || !db) {
        const ok = await initMongo().catch(() => false);
        if (!ok || !db) return;
    }
    try {
        const col = db.collection('whatsapp_sessions');
        await col.deleteOne({ _id: String(userId) });
        console.log(`🗑️ [MongoDB] Deleted session "${userId}" from cloud.`);
    } catch (e) {
        console.warn(`[MongoDB Delete Session Warning] Error for ${userId}:`, e.message);
    }
}

/**
 * Retrieve all registered active sessions across all cluster nodes from MongoDB Atlas
 */
async function getAllClusterSessions() {
    if (!isConnected || !db) {
        const ok = await initMongo().catch(() => false);
        if (!ok || !db) return [];
    }
    try {
        const col = db.collection('whatsapp_sessions');
        return await col.find({}, { projection: { _id: 1, nodeId: 1, updatedAt: 1 } }).toArray();
    } catch (_) {
        return [];
    }
}

/**
 * ═════════════════════════════════════════════════════════
 * DISTRIBUTED SESSION LEADER ELECTION LOCK
 * Guarantees ONLY ONE server node connects to WhatsApp at a time.
 * Prevents Code 440 flapping, socket wars, and zombie state across 26 nodes!
 * ═════════════════════════════════════════════════════════
 */
async function acquireSessionLock(userId, instanceId) {
    if (!userId || !instanceId) return true;
    if (!isConnected || !db) {
        const ok = await initMongo().catch(() => false);
        if (!ok || !db) return true; // Fail open if MongoDB is unreachable
    }
    try {
        const col = db.collection('session_locks');
        const now = Date.now();
        const staleThreshold = now - 45000; // 45s heartbeat timeout

        // Atomic check & claim:
        // Claim lock if:
        // 1. Lock already belongs to this instanceId
        // 2. OR current lock heartbeat is older than 45s (previous holder died or slept)
        const result = await col.findOneAndUpdate(
            {
                _id: String(userId),
                $or: [
                    { lockedBy: instanceId },
                    { heartbeat: { $lt: staleThreshold } }
                ]
            },
            {
                $set: {
                    lockedBy: instanceId,
                    nodeId: currentServerNodeId || 'default',
                    heartbeat: now,
                    updatedAt: now
                }
            },
            { returnDocument: 'after' }
        );

        if (result && (result.lockedBy === instanceId || result.value?.lockedBy === instanceId)) {
            return true;
        }

        // Try inserting fresh lock if doc does not exist
        try {
            await col.insertOne({
                _id: String(userId),
                lockedBy: instanceId,
                nodeId: currentServerNodeId || 'default',
                heartbeat: now,
                updatedAt: now
            });
            return true;
        } catch (insertErr) {
            // Duplicate key: another instance holds an active lock
            const existing = await col.findOne({ _id: String(userId) });
            if (existing && existing.lockedBy !== instanceId && (now - (existing.heartbeat || 0)) < 45000) {
                return false; // Locked by another healthy living node
            }
            return true;
        }
    } catch (e) {
        console.warn(`[Session Lock Warning] acquireSessionLock error for ${userId}:`, e.message);
        return true;
    }
}

async function renewSessionLock(userId, instanceId) {
    if (!userId || !instanceId || !isConnected || !db) return;
    try {
        const col = db.collection('session_locks');
        await col.updateOne(
            { _id: String(userId), lockedBy: instanceId },
            { $set: { heartbeat: Date.now() } }
        );
    } catch (_) {}
}

async function releaseSessionLock(userId, instanceId) {
    if (!userId || !instanceId || !isConnected || !db) return;
    try {
        const col = db.collection('session_locks');
        await col.deleteOne({ _id: String(userId), lockedBy: instanceId });
    } catch (_) {}
}

module.exports = {
    initMongo,
    getDb: () => db,
    pushToMongo,
    pushToMongoImmediate,
    pullFromMongo,
    getStatus,
    setDetectedHost,
    determineServerNodeId,
    getNodeId,
    backupSessionToMongo,
    restoreAllSessionsFromMongo,
    backupAllSessionsToMongo,
    deleteSessionFromMongo,
    getAllClusterSessions,
    acquireSessionLock,
    renewSessionLock,
    releaseSessionLock
};
