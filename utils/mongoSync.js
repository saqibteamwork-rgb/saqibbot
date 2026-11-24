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
 * Recycles stale/broken MongoDB Atlas TLS sockets on SSL or network errors
 */
function handleMongoError(err) {
    if (!err) return;
    const msg = String(err.message || err);
    if (
        msg.includes('SSL') ||
        msg.includes('ssl') ||
        msg.includes('TLS') ||
        msg.includes('topology') ||
        msg.includes('closed') ||
        msg.includes('network') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('alert number 80')
    ) {
        isConnected = false;
        isConnecting = false;
        try { client?.close?.(); } catch (_) {}
        client = null;
        db = null;
    }
}

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
            connectTimeoutMS: 10000,
            maxIdleTimeMS: 30000,
            socketTimeoutMS: 45000,
            maxPoolSize: 20
        });

        await client.connect();
        db = client.db(DB_NAME);
        isConnected = true;
        isConnecting = false;

        console.log(`✅ [MongoDB] Connected successfully to database: "${DB_NAME}"!`);

        // Run general collection synchronization in background so bot sessions restore immediately without delay!
        initialSync().catch(err => console.warn('[Background initialSync Warning]:', err.message));

        // Clean up any orphan temporary QR sessions from whatsapp_sessions cloud collection in background
        db.collection('whatsapp_sessions').deleteMany({ _id: { $regex: '^qr_' } }).catch(() => {});

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

    const queryTimeout = (prom, ms = 4000) => Promise.race([
        prom,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout after ' + ms + 'ms')), ms))
    ]);

    for (const target of syncTargets) {
        try {
            const col = db.collection(target.key);
            const cloudDoc = await queryTimeout(col.findOne({ _id: target.key }), 4000).catch(err => {
                console.warn(`[MongoDB Sync Warning] Fast skip on ${target.key}:`, err.message);
                return null;
            });

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
                    continue;
                } else if (localData && Object.keys(localData).length > 0) {
                    await queryTimeout(col.updateOne(
                        { _id: target.key },
                        { $set: { _id: target.key, payload: localData, updatedAt: Date.now() } },
                        { upsert: true }
                    ), 4000).catch(() => {});
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
                    continue;
                } else if (localData && Object.keys(localData).length > 0) {
                    await queryTimeout(col.updateOne(
                        { _id: target.key },
                        { $set: { _id: target.key, payload: localData, updatedAt: Date.now() } },
                        { upsert: true }
                    ), 4000).catch(() => {});
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
                await queryTimeout(col.updateOne(
                    { _id: target.key },
                    { $set: { _id: target.key, payload: localData, updatedAt: Date.now() } },
                    { upsert: true }
                ), 4000).catch(() => {});
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
        handleMongoError(err);
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
            handleMongoError(pushErr);
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
        handleMongoError(e);
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

    // Fast parallel self-identification probe on Heroku dynos (500ms max)
    if (bootToken && process.env.DYNO) {
        const probePromises = Object.entries(KNOWN_NODES)
            .filter(([k]) => k !== 'railway')
            .map(([key, url]) =>
                axios.get(`${url}/api/node-identify?token=${bootToken}`, { timeout: 2500 })
                    .then(res => {
                        if (res.data && res.data.match === true) return key;
                        throw new Error('no match');
                    })
            );
        try {
            const matchedKey = await Promise.any(probePromises);
            if (matchedKey) {
                currentServerNodeId = matchedKey;
                console.log(`🎯 [Node Auto-Detect] Identified self as: ${matchedKey}`);
                return currentServerNodeId;
            }
        } catch (_) {}
    }

    currentServerNodeId = currentServerNodeId || 'default';
    return currentServerNodeId;
}

function getNodeId() {
    return currentServerNodeId || 'default';
}

/**
 * Ultra-Lean Baileys Session Filter:
 * Keeps ONLY the ~18-22 essential files required for 100% stable connection:
 * - creds.json (Mandatory login credentials - zero logout)
 * - app-state-sync-key-* (Account sync & anti-logout keys)
 * - Latest 5 pre-key-*.json (New incoming message handshake)
 * - Latest 5 sender-key-*.json (Group decryption keys)
 * - Latest 2 sender-key-memory-*.json
 * - Latest 3 session-*.json (Signal ratchets)
 * - Latest 3 identity-*.json
 */
function filterUltraLeanSessionFiles(filenames) {
    const creds = filenames.filter(f => f === 'creds.json');
    const appState = filenames.filter(f => f.startsWith('app-state-sync-key-'));
    
    // Sort numbered pre-keys descending and take top 5
    const preKeys = filenames.filter(f => f.startsWith('pre-key-')).sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
        return numB - numA;
    }).slice(0, 5);

    // Group sender keys: take top 5
    const senderKeys = filenames.filter(f => f.startsWith('sender-key-') && !f.startsWith('sender-key-memory-')).slice(0, 5);
    const senderKeyMemories = filenames.filter(f => f.startsWith('sender-key-memory-')).slice(0, 2);

    // Individual chat ratchet sessions: take top 3
    const chatSessions = filenames.filter(f => f.startsWith('session-')).slice(0, 3);

    // Identity keys: take top 3
    const identityKeys = filenames.filter(f => f.startsWith('identity-')).slice(0, 3);

    return new Set([
        ...creds,
        ...appState,
        ...preKeys,
        ...senderKeys,
        ...senderKeyMemories,
        ...chatSessions,
        ...identityKeys
    ]);
}

/**
 * Backup an active WhatsApp bot session (credentials & signal keys) to MongoDB Atlas
 */
async function backupSessionToMongo(userId, authPath, immediate = false) {
    if (!userId || !authPath || String(userId).startsWith('qr_')) return;

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
            const allowedFiles = filterUltraLeanSessionFiles(files);
            const filesMap = {};

            for (const file of files) {
                if (!allowedFiles.has(file)) continue;
                if (file.includes('_backup_') || file.includes('_expired_') || file.endsWith('.tmp')) continue;

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

            // 🛡️ Anti-Logout Vault Snapshot: Maintain rolling 3 healthy backups per session in MongoDB
            try {
                const vaultCol = db.collection('whatsapp_sessions_vault');
                await vaultCol.insertOne({
                    userId: String(userId),
                    nodeId: nodeId,
                    data: compressed,
                    fileCount: Object.keys(filesMap).length,
                    timestamp: Date.now()
                });
                const oldSnapshots = await vaultCol.find({ userId: String(userId) }).sort({ timestamp: -1 }).toArray();
                if (oldSnapshots.length > 3) {
                    const toDelete = oldSnapshots.slice(3).map(s => s._id);
                    await vaultCol.deleteMany({ _id: { $in: toDelete } });
                }
            } catch (_) {}
        } catch (err) {
            handleMongoError(err);
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
 * Auto-recover a damaged or 401 session from the rolling Session Vault in MongoDB
 */
async function restoreSessionFromVault(userId, sessionDir) {
    if (!userId || !sessionDir) return false;
    if (!isConnected || !db) {
        const ok = await initMongo().catch(() => false);
        if (!ok || !db) return false;
    }
    try {
        const vaultCol = db.collection('whatsapp_sessions_vault');
        const snapshots = await vaultCol.find({ userId: String(userId) }).sort({ timestamp: -1 }).limit(3).toArray();
        if (!snapshots || snapshots.length === 0) return false;

        for (const snap of snapshots) {
            try {
                let buffer;
                if (Buffer.isBuffer(snap.data)) {
                    buffer = snap.data;
                } else if (snap.data && snap.data.buffer) {
                    buffer = Buffer.from(snap.data.buffer);
                } else if (typeof snap.data === 'string') {
                    buffer = Buffer.from(snap.data, 'base64');
                } else {
                    buffer = Buffer.from(snap.data);
                }

                const jsonStr = zlib.gunzipSync(buffer).toString('utf8');
                const filesMap = JSON.parse(jsonStr);
                if (!filesMap['creds.json']) continue;

                await fs.ensureDir(sessionDir);
                const allowedFiles = filterUltraLeanSessionFiles(Object.keys(filesMap));
                for (const [filename, content] of Object.entries(filesMap)) {
                    if (!allowedFiles.has(filename)) continue;
                    if (filename.startsWith('tctoken-') || filename.startsWith('lid-mapping-') || filename.endsWith('.tmp')) continue;
                    await fs.writeFile(path.join(sessionDir, filename), content, 'utf8');
                }
                console.log(`🛡️ [Session Vault] Auto-recovered session "${userId}" from healthy vault snapshot (${new Date(snap.timestamp).toISOString()})!`);
                return true;
            } catch (snapErr) {
                console.warn(`[Session Vault] Snapshot unpack error for ${userId}:`, snapErr.message);
            }
        }
        return false;
    } catch (e) {
        console.warn(`[Session Vault Error] Failed for ${userId}:`, e.message);
        return false;
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
            // Specific Cluster Worker Node: strictly restore ONLY sessions explicitly assigned to this node,
            // or if node is s1, also support sessions marked default/null
            if (myNode === 's1') {
                query = {
                    $or: [
                        { nodeId: 's1' },
                        { nodeId: 'default' },
                        { nodeId: null },
                        { nodeId: { $exists: false } }
                    ]
                };
            } else {
                query = { nodeId: myNode };
            }
        } else {
            // Local machine / standalone: only restore unassigned or local sessions, NEVER s1 or other cluster nodes!
            query = {
                $or: [
                    { nodeId: 'local' },
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

        // 1. Identify Owner Numbers to ALWAYS prioritize first
        let ownerNumbers = ['923438673242', '923468616487', '923420580154'];
        try {
            const settings = require('../settings');
            const config = require('../config');
            if (settings?.ownerNumber) ownerNumbers.push(String(settings.ownerNumber).replace(/[^0-9]/g, ''));
            if (config?.OWNER_NUMBER) ownerNumbers.push(String(config.OWNER_NUMBER).replace(/[^0-9]/g, ''));
        } catch (_) {}
        ownerNumbers = [...new Set(ownerNumbers.filter(Boolean))];

        // 2. Filter: Strictly Owner Numbers (03438673242, 03468616487) + Recent 6-Hour Sessions Only!
        const sixHoursMs = 6 * 60 * 60 * 1000;
        const now = Date.now();
        const validCandidates = sessionDocs.filter(doc => {
            const isOwner = ownerNumbers.includes(String(doc._id));
            if (isOwner) return true; // Owner numbers (03438673242, 03468616487) are ALWAYS restored!
            // For regular users: strictly only sessions updated/active within the last 6 hours with valid credentials
            const isRecent = (now - (doc.updatedAt || 0)) < sixHoursMs;
            const hasFiles = (doc.fileCount || 0) > 1;
            return isRecent && hasFiles;
        });

        // 3. Smart Sort:
        // Priority #1: Owner numbers first
        // Priority #2: Most recently updated sessions (updatedAt descending)
        validCandidates.sort((a, b) => {
            const aIsOwner = ownerNumbers.includes(String(a._id));
            const bIsOwner = ownerNumbers.includes(String(b._id));
            if (aIsOwner && !bIsOwner) return -1;
            if (!aIsOwner && bIsOwner) return 1;
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });

        // 4. ULTRA SPEED RESTORE LIMIT:
        // Accommodates all owner numbers plus all recent 6-hour paired bots on this node
        const maxSessions = parseInt(process.env.MAX_SESSIONS || (process.env.DYNO ? '5' : '10'), 10);
        const restoreLimit = Math.max(maxSessions, 5) + ownerNumbers.length;
        const targetDocs = validCandidates.slice(0, restoreLimit);

        console.log(`⚡ [MongoDB Session Restore] Fast-Boot: Restoring all ${targetDocs.length} valid sessions (Owners + Recent 6h) for node "${myNode}" with Ultra-Lean (~25 files each)...`);

        let restoredCount = 0;
        for (const doc of targetDocs) {
            const userId = doc._id;
            if (!userId || !doc.data || String(userId).startsWith('qr_')) continue;

            const sessionDir = path.join(authDir, String(userId));
            const credsFile = path.join(sessionDir, 'creds.json');

            // Skip if local credentials exist and are newer
            if (fs.existsSync(credsFile)) {
                try {
                    const localStat = fs.statSync(credsFile);
                    if (localStat.mtimeMs >= (doc.updatedAt || 0)) {
                        restoredCount++;
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

                // Ultra-Lean filter: keep only ~25-30 essential files per session
                const allowedFiles = filterUltraLeanSessionFiles(Object.keys(filesMap));

                await fs.ensureDir(sessionDir);
                let writtenFiles = 0;
                for (const [filename, content] of Object.entries(filesMap)) {
                    if (!allowedFiles.has(filename)) continue;
                    // Skip ephemeral junk that bloats dyno inodes & crashes Heroku with OOM
                    if (filename.startsWith('tctoken-') || filename.startsWith('lid-mapping-') || filename.endsWith('.tmp')) continue;

                    await fs.writeFile(path.join(sessionDir, filename), content, 'utf8');
                    writtenFiles++;
                }

                // Bind to this node if it was unassigned
                if (doc.nodeId !== myNode && myNode !== 'default') {
                    await col.updateOne({ _id: userId }, { $set: { nodeId: myNode } }).catch(() => {});
                }

                restoredCount++;
                console.log(`📥 [MongoDB Session Restore] Restored session "${userId}" (${writtenFiles} files - Ultra-Lean) in ~5ms!`);
            } catch (decompressErr) {
                console.warn(`[MongoDB Session Restore] Failed to unpack session ${userId}:`, decompressErr.message);
            }
        }

        if (restoredCount > 0) {
            console.log(`✅ [MongoDB Session Restore] Recovered ${restoredCount} active sessions in ~1 second! Fast-Boot ready.`);
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
/**
 * Backup all WhatsApp sessions to MongoDB Atlas
 * @param {string} authDir - Path to auth_info directory
 * @param {Object} [sessionsMap=null] - Optional live sessions map
 * @param {boolean} [forceAll=false] - When true (e.g. Heroku SIGTERM 24-hr dyno cycle), backs up all sessions with creds.json unconditionally
 */
async function backupAllSessionsToMongo(authDir, sessionsMap = null, forceAll = false) {
    if (!fs.existsSync(authDir)) return;
    try {
        const dirs = await fs.readdir(authDir);
        for (const d of dirs) {
            if (d.includes('_backup_') || d.includes('_expired_') || d.startsWith('.')) continue;
            // On graceful shutdown or forceAll, backup every session that has creds.json!
            if (!forceAll && sessionsMap && (!sessionsMap[d] || !sessionsMap[d].isConnected)) continue;

            const dirPath = path.join(authDir, d);
            try {
                const stat = await fs.stat(dirPath);
                if (stat.isDirectory()) {
                    const credsFile = path.join(dirPath, 'creds.json');
                    if (fs.existsSync(credsFile)) {
                        await backupSessionToMongo(d, dirPath, true);
                        // Stagger backups with delay and force GC to prevent RAM spikes and OOM crashes
                        await new Promise(r => setTimeout(r, 200));
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
        const myNode = currentServerNodeId || 'default';
        const sameNodeStale = now - 5000; // 5s threshold for same node restart!
        const crossNodeStale = now - 25000; // 25s threshold for cross-node failover

        // Atomic check & claim:
        // Claim lock if:
        // 1. Lock already belongs to this instanceId
        // 2. OR lock belongs to the SAME server node after 5s reboot rollover
        // 3. OR current lock heartbeat is older than 25s
        const result = await col.findOneAndUpdate(
            {
                _id: String(userId),
                $or: [
                    { lockedBy: instanceId },
                    { nodeId: myNode, heartbeat: { $lt: sameNodeStale } },
                    { heartbeat: { $lt: crossNodeStale } }
                ]
            },
            {
                $set: {
                    lockedBy: instanceId,
                    nodeId: myNode,
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
                nodeId: myNode,
                heartbeat: now,
                updatedAt: now
            });
            return true;
        } catch (insertErr) {
            // Duplicate key: another instance holds an active lock
            const existing = await col.findOne({ _id: String(userId) });
            if (existing && existing.lockedBy !== instanceId) {
                const threshold = (existing.nodeId === myNode) ? 5000 : 25000;
                if ((now - (existing.heartbeat || 0)) < threshold) {
                    return false; // Actively held by another healthy node
                }
                // Lock expired: claim immediately
                await col.updateOne(
                    { _id: String(userId) },
                    {
                        $set: {
                            lockedBy: instanceId,
                            nodeId: myNode,
                            heartbeat: now,
                            updatedAt: now
                        }
                    }
                );
                return true;
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
    restoreSessionFromVault,
    getAllClusterSessions,
    acquireSessionLock,
    renewSessionLock,
    releaseSessionLock
};
