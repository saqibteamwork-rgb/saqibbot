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
const lastVaultWriteMap = new Map(); // userId -> timestamp (prevent Vault bloat & WiredTiger fragmentation)

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

const pullCache = new Map(); // collectionKey -> { data, cachedAt }

/**
 * Pull latest data from MongoDB Atlas with 60s in-memory cache to prevent Atlas TLS spam
 */
async function pullFromMongo(collectionKey, forceFresh = false) {
    const now = Date.now();
    if (!forceFresh && pullCache.has(collectionKey)) {
        const entry = pullCache.get(collectionKey);
        if (now - entry.cachedAt < 60000) {
            return entry.data;
        }
    }

    if (!isConnected || !db) {
        const ok = await initMongo().catch(() => false);
        if (!ok || !db) return pullCache.get(collectionKey)?.data || null;
    }

    try {
        const col = db.collection(collectionKey);
        const doc = await col.findOne({ _id: collectionKey });
        const payload = doc?.payload || null;
        if (payload) {
            pullCache.set(collectionKey, { data: payload, cachedAt: now });
        }
        return payload;
    } catch (e) {
        handleMongoError(e);
        console.warn(`[MongoDB Pull Warning] Failed to pull ${collectionKey}:`, e.message);
        return pullCache.get(collectionKey)?.data || null;
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
                const wasUnknown = !currentServerNodeId || currentServerNodeId === 'default';
                currentServerNodeId = key;
                console.log(`🎯 [Cluster Node] Host detected: "${host}" ➜ Identified as Node "${key}"`);
                if (wasUnknown && global.ProBoySessionManager) {
                    const sessCount = Object.keys(global.ProBoySessionManager.getSessions?.() || {}).length;
                    if (sessCount === 0 && typeof restoreAllSessionsFromMongo === 'function') {
                        restoreAllSessionsFromMongo(path.join(__dirname, '..', 'auth_info'))
                            .then(() => global.ProBoySessionManager?.loadExistingSessions?.())
                            .catch(() => {});
                    }
                }
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
                axios.get(`${url}/api/node-identify?token=${bootToken}`, { timeout: 6000 })
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
 * Keeps the essential files required for 100% stable connection and Signal ratchet decryption:
 * - creds.json (Mandatory login credentials - zero logout)
 * - app-state-sync-key-* (Account sync & anti-logout keys)
 * - Numbered pre-key-*.json (New incoming message handshake)
 * - sender-key-*.json (Group decryption keys)
 * - session-*.json (Signal ratchets - essential for 1-on-1 chats and decryption)
 * - identity-*.json
 */
function filterUltraLeanSessionFiles(filenames) {
    const creds = filenames.filter(f => f === 'creds.json');
    const appState = filenames.filter(f => f.startsWith('app-state-sync-key-'));
    
    // Sort numbered pre-keys descending and take top 60 (standard Baileys pool)
    const preKeys = filenames.filter(f => f.startsWith('pre-key-')).sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
        return numB - numA;
    }).slice(0, 60);

    // Group sender keys: keep up to 120 groups
    const senderKeys = filenames.filter(f => f.startsWith('sender-key-') && !f.startsWith('sender-key-memory-')).slice(0, 120);
    const senderKeyMemories = filenames.filter(f => f.startsWith('sender-key-memory-')).slice(0, 15);

    // Individual chat ratchet sessions: keep up to 120 chats (CRITICAL: Never limit to 3! Limiting to 3 causes Bad MAC & decryption failure)
    const chatSessions = filenames.filter(f => f.startsWith('session-')).slice(0, 120);

    // Identity keys: take top 60
    const identityKeys = filenames.filter(f => f.startsWith('identity-')).slice(0, 60);

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
async function backupSessionToMongo(userId, authPath, immediate = false, forceVault = false) {
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
            const now = Date.now();

            await col.updateOne(
                { _id: String(userId) },
                {
                    $set: {
                        _id: String(userId),
                        nodeId: nodeId,
                        data: compressed,
                        fileCount: Object.keys(filesMap).length,
                        isConnected: true,
                        updatedAt: now
                    }
                },
                { upsert: true }
            );

            // 🛡️ Anti-Logout Vault Snapshot: Single compact in-place upsert per user (creds + app-state keys only, throttled to every 2h unless forced)
            // Avoids insert+delete WiredTiger fragmentation that previously filled Atlas 512MB quota!
            const lastVault = lastVaultWriteMap.get(String(userId)) || 0;
            if (forceVault || (now - lastVault > 2 * 3600 * 1000)) {
                try {
                    const leanVaultMap = { 'creds.json': filesMap['creds.json'] };
                    for (const [k, v] of Object.entries(filesMap)) {
                        if (k.startsWith('app-state-sync-key-')) leanVaultMap[k] = v;
                    }
                    const leanVaultGz = zlib.gzipSync(Buffer.from(JSON.stringify(leanVaultMap), 'utf8'));
                    const vaultCol = db.collection('whatsapp_sessions_vault');
                    await vaultCol.updateOne(
                        { _id: String(userId) },
                        {
                            $set: {
                                _id: String(userId),
                                userId: String(userId),
                                nodeId: nodeId,
                                data: leanVaultGz,
                                fileCount: Object.keys(leanVaultMap).length,
                                timestamp: now
                            }
                        },
                        { upsert: true }
                    );
                    lastVaultWriteMap.set(String(userId), now);
                } catch (_) {}
            }
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
        const timer = setTimeout(performBackup, 6000);
        sessionDebounceTimers.set(userId, timer);
    }
}

/**
 * Auto-recover a damaged or 401 session from the Session Vault (or primary session store) in MongoDB
 */
async function restoreSessionFromVault(userId, sessionDir) {
    if (!userId || !sessionDir) return false;
    if (!isConnected || !db) {
        const ok = await initMongo().catch(() => false);
        if (!ok || !db) return false;
    }
    try {
        const vaultCol = db.collection('whatsapp_sessions_vault');
        const snapshots = await vaultCol.find({
            $or: [{ _id: String(userId) }, { userId: String(userId) }]
        }).sort({ timestamp: -1 }).limit(3).toArray();

        // Fallback to primary whatsapp_sessions doc if vault has no snapshot yet
        if (!snapshots || snapshots.length === 0) {
            const primaryDoc = await db.collection('whatsapp_sessions').findOne({ _id: String(userId) });
            if (primaryDoc && primaryDoc.data) {
                snapshots.push({ data: primaryDoc.data, timestamp: primaryDoc.updatedAt || Date.now() });
            }
        }
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
                console.log(`🛡️ [Session Vault] Auto-recovered session "${userId}" from healthy snapshot (${new Date(snap.timestamp || Date.now()).toISOString()})!`);
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

        // 1. Identify Owner Numbers to ALWAYS prioritize first in sorting
        let ownerNumbers = ['923438673242', '923468616487', '923420580154'];
        try {
            const settings = require('../settings');
            const config = require('../config');
            if (settings?.ownerNumber) ownerNumbers.push(String(settings.ownerNumber).replace(/[^0-9]/g, ''));
            if (config?.OWNER_NUMBER) ownerNumbers.push(String(config.OWNER_NUMBER).replace(/[^0-9]/g, ''));
        } catch (_) {}
        ownerNumbers = [...new Set(ownerNumbers.filter(Boolean))];

        const myNode = currentServerNodeId || 'default';
        const isHerokuOrCloud = Boolean(process.env.DYNO || process.env.SERVER_ID || process.env.NODE_ID || process.env.RAILWAY_STATIC_URL);
        let query = {};
        if (myNode && myNode !== 'default' && myNode !== 'all') {
            // Specific Cluster Worker Node: strictly restore ONLY sessions explicitly assigned to this node!
            // This guarantees zero duplicate logins and zero Code 440 collisions across cluster dynos.
            query = { nodeId: myNode };
        } else if (isHerokuOrCloud) {
            query = {
                $or: [
                    { nodeId: 'default' },
                    { nodeId: null },
                    { nodeId: { $exists: false } }
                ]
            };
        } else {
            // Local machine / standalone: only restore sessions tagged as 'local', NEVER steal cluster cloud node sessions!
            query = { nodeId: 'local' };
        }

        // 1. Fetch metadata only (exclude heavy binary .data) to eliminate RAM bloat & speed up dyno boot 10x!
        const candidateMeta = (await col.find(query, {
            projection: { _id: 1, updatedAt: 1, fileCount: 1, nodeId: 1 }
        }).toArray()) || [];

        if (candidateMeta.length === 0) {
            console.log(`📂 [MongoDB Session Restore] No direct sessions found for node "${myNode}" — checking orphan pool...`);
        }

        // 2. Filter: Strictly Owner Numbers (ALWAYS restored) + Sessions updated within last 30 days!
        const maxSessionAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days retention
        const now = Date.now();
        const validCandidates = candidateMeta.filter(doc => {
            const isOwner = ownerNumbers.includes(String(doc._id));
            if (isOwner) return true; // Owner numbers are ALWAYS restored!
            // For regular users: strictly validate session age (30 days) and presence of credentials
            const isRecent = (now - (doc.updatedAt || 0)) < maxSessionAgeMs;
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
        // Default 10 bots per dyno (override via MAX_SESSIONS) so paired sessions stay connected without dropping.
        const maxSessions = parseInt(process.env.MAX_SESSIONS || '10', 10);
        const targetMeta = validCandidates.slice(0, maxSessions);

        // 4.5 ORPHAN RESCUE: If this cloud dyno still has low session count (< 5), adopt live unassigned or stranded recent sessions!
        const orphanFillCap = Math.min(maxSessions, 5);
        if (targetMeta.length < orphanFillCap && myNode && myNode !== 'default' && myNode !== 'all' && myNode !== 'local') {
            try {
                const slotsLeft = orphanFillCap - targetMeta.length;
                const alreadyPicked = new Set(targetMeta.map(d => String(d._id)));
                const staleCutoff = now - 15 * 60 * 1000; // Not updated in last 15 mins (stranded by dead/full dyno)
                const recentCutoff = now - 8 * 3600 * 1000; // Active in last 8h only (avoid reviving old logged-out ghosts)

                const locksCol = db.collection('session_locks');
                const activeLocks = await locksCol.find({ heartbeat: { $gte: now - 10 * 60 * 1000 } }, { projection: { _id: 1 } }).toArray();
                const lockedIds = new Set(activeLocks.map(l => String(l._id)));

                const orphanMeta = await col.find({
                    fileCount: { $gt: 1 },
                    isConnected: { $ne: false },
                    $or: [
                        { nodeId: { $in: ['default', null] } },
                        { nodeId: { $exists: false } },
                        { updatedAt: { $gte: recentCutoff, $lt: staleCutoff } }
                    ]
                }, { projection: { _id: 1, updatedAt: 1, fileCount: 1, nodeId: 1 } }).toArray();

                const rescuePool = orphanMeta
                    .filter(d => !alreadyPicked.has(String(d._id)) && !lockedIds.has(String(d._id)))
                    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                    .slice(0, slotsLeft);

                if (rescuePool.length > 0) {
                    const rescueIds = rescuePool.map(r => String(r._id));
                    // Atomically claim nodeId so parallel booting dynos never rescue the same orphan
                    await col.updateMany({ _id: { $in: rescueIds } }, { $set: { nodeId: myNode } }).catch(() => {});
                    console.log(`🚑 [Cluster Orphan Rescue] Node "${myNode}" has ${slotsLeft} spare slot(s) — rescuing ${rescuePool.length} stranded session(s):`, rescueIds.join(', '));
                    for (const r of rescuePool) targetMeta.push(r);
                }
            } catch (rescueErr) {
                console.warn('[Cluster Orphan Rescue Warning]:', rescueErr.message);
            }
        }

        if (targetMeta.length === 0) {
            console.log(`📂 [MongoDB Session Restore] No valid active candidates for node "${myNode}".`);
            return 0;
        }

        // Fetch ONLY the actual gzip data for the selected top sessions (strictly protects 512MB RAM)
        const targetIds = targetMeta.map(d => d._id);
        const targetDocs = await col.find({ _id: { $in: targetIds } }).toArray();

        console.log(`⚡ [MongoDB Session Restore] Fast-Boot: Restoring all ${targetDocs.length} valid sessions (Owners + 30-day active) for node "${myNode}" with Ultra-Lean (~25 files each)...`);

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
 * Safely delete session from MongoDB Atlas upon explicit admin unpair.
 * If forceExplicit is false (e.g. transient disconnect), credentials are preserved in cloud.
 */
async function deleteSessionFromMongo(userId, forceExplicit = false) {
    if (!userId) return;
    const protectedOwners = ['923438673242', '923468616487', '923420580154'];
    if (protectedOwners.includes(String(userId))) {
        console.warn(`🛡️ [MongoDB Delete Guard] Refusing to delete protected owner session "${userId}" from cloud!`);
        return;
    }
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
        if (forceExplicit) {
            await col.deleteOne({ _id: String(userId) });
            console.log(`🗑️ [MongoDB] Explicitly deleted session "${userId}" from cloud.`);
        } else {
            // Soft-disconnect: Preserve credentials so session is not lost!
            await col.updateOne(
                { _id: String(userId) },
                { $set: { isConnected: false, disconnectedAt: Date.now(), lastStatus: 'disconnected' } }
            );
            console.log(`🛡️ [MongoDB] Preserved credentials for session "${userId}" (marked disconnected).`);
        }
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
        const sameNodeStale = now - 15000; // 15s threshold for same node restart!
        const crossNodeStale = now - 60000; // 60s threshold for cross-node failover (4x safety margin for 15s renewal)

        // Atomic check & claim:
        // Claim lock if:
        // 1. Lock already belongs to this instanceId
        // 2. OR lock belongs to the SAME server node after 15s reboot rollover
        // 3. OR current lock heartbeat is older than 60s
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
                const threshold = (existing.nodeId === myNode) ? 15000 : 60000;
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

async function isSessionLockedByOtherNode(userId, instanceId) {
    if (!userId || !instanceId || !isConnected || !db) return false;
    try {
        const col = db.collection('session_locks');
        const existing = await col.findOne({ _id: String(userId) });
        if (!existing || existing.lockedBy === instanceId) return false;
        const now = Date.now();
        const myNode = currentServerNodeId || 'default';
        const threshold = (existing.nodeId === myNode) ? 15000 : 60000;
        return ((now - (existing.heartbeat || 0)) < threshold);
    } catch (_) {
        return false;
    }
}

async function releaseSessionLock(userId, instanceId) {
    if (!userId || !instanceId || !isConnected || !db) return;
    try {
        const col = db.collection('session_locks');
        await col.deleteOne({ _id: String(userId), lockedBy: instanceId });
    } catch (_) {}
}

/**
 * Inspect MongoDB Atlas database and collection storage stats (for diagnosing 512MB quota)
 */
async function getAtlasStats() {
    if (!isConnected || !db) {
        const ok = await initMongo().catch(() => false);
        if (!ok || !db) return { error: 'MongoDB not connected' };
    }
    const admin = client.db().admin();
    const dbsInfo = await admin.listDatabases();
    const collections = [];
    const cols = await db.listCollections().toArray();
    for (const c of cols) {
        try {
            const st = await db.command({ collStats: c.name });
            collections.push({
                name: c.name,
                count: st.count,
                dataMB: Number((st.size / 1048576).toFixed(2)),
                storageMB: Number((st.storageSize / 1048576).toFixed(2)),
                indexMB: Number(((st.totalIndexSize || 0) / 1048576).toFixed(2))
            });
        } catch (_) {}
    }
    collections.sort((a, b) => (b.storageMB + b.indexMB) - (a.storageMB + a.indexMB));
    return {
        totalClusterMB: Number((dbsInfo.totalSize / 1048576).toFixed(2)),
        databases: dbsInfo.databases.map(d => ({
            name: d.name,
            sizeMB: Number((d.sizeOnDisk / 1048576).toFixed(2))
        })),
        collections
    };
}

/**
 * Safely reclaim MongoDB Atlas 512MB quota bloat without deleting active user sessions:
 * 1. Deduplicates & compacts whatsapp_sessions_vault (keeps 1 lean creds+appstate doc per user, deletes legacy multi-doc copies)
 * 2. Strips ephemeral tctoken/lid-mapping junk from bloated whatsapp_sessions docs (fileCount > 350) while preserving creds.json
 * 3. Removes orphan/unpaired qr_ or empty (fileCount <= 1, >2 days old) placeholders
 * 4. Drops sample_mflix ONLY if dropSample=true is explicitly passed
 */
async function cleanupAtlasBloat(options = {}) {
    if (!isConnected || !db) {
        const ok = await initMongo().catch(() => false);
        if (!ok || !db) return { error: 'MongoDB not connected' };
    }
    const report = { vaultRemoved: 0, vaultCompacted: 0, sessionsTrimmed: 0, emptyDocsRemoved: 0, ownersPruned: false, sampleDropped: false, errors: [] };

    try {
        if (options.dropSample) {
            try {
                const admin = client.db().admin();
                const dbsInfo = await admin.listDatabases();
                if (dbsInfo.databases.some(d => d.name === 'sample_mflix')) {
                    await client.db('sample_mflix').dropDatabase();
                    report.sampleDropped = true;
                }
            } catch (e) { report.errors.push('dropSample: ' + e.message); }
        }

        // 1. Clean & deduplicate whatsapp_sessions_vault (legacy ObjectId multi-snapshots bloat storage up to 80+ MB!)
        try {
            const vaultCol = db.collection('whatsapp_sessions_vault');
            if (options.resetVault) {
                // Fast drop + rebuild: frees 100% of fragmented WiredTiger vault storage immediately!
                const res = await vaultCol.deleteMany({});
                report.vaultRemoved = res.deletedCount || 0;
                try { await vaultCol.drop(); } catch (_) {}
            } else {
                const allVaultMeta = await vaultCol.find({}, { projection: { _id: 1, userId: 1, timestamp: 1 } }).toArray();
                const bestByUser = new Map();
                const duplicateIds = [];
                for (const doc of allVaultMeta) {
                    const uid = String(doc.userId || doc._id || '');
                    if (!uid || uid.startsWith('qr_')) { duplicateIds.push(doc._id); continue; }
                    const prev = bestByUser.get(uid);
                    if (!prev || (doc.timestamp || 0) > (prev.timestamp || 0)) {
                        if (prev) duplicateIds.push(prev._id);
                        bestByUser.set(uid, doc);
                    } else {
                        duplicateIds.push(doc._id);
                    }
                }
                if (duplicateIds.length > 0) {
                    const delRes = await vaultCol.deleteMany({ _id: { $in: duplicateIds } });
                    report.vaultRemoved += delRes.deletedCount || 0;
                }
            }
        } catch (e) { report.errors.push('vault: ' + e.message); }

        // 2. Remove dead placeholder docs (qr_ or fileCount <= 1 older than 2 days)
        try {
            const sessCol = db.collection('whatsapp_sessions');
            const cutoff = Date.now() - 2 * 24 * 3600 * 1000;
            const deadRes = await sessCol.deleteMany({
                $or: [
                    { _id: /^qr_/ },
                    { fileCount: { $lte: 1 }, updatedAt: { $lt: cutoff } }
                ]
            });
            report.emptyDocsRemoved = deadRes.deletedCount || 0;

            // Optionally purge stale sessions > 45 days (never owners)
            if (options.purgeExpiredDays) {
                const expCutoff = Date.now() - Number(options.purgeExpiredDays) * 24 * 3600 * 1000;
                const expRes = await sessCol.deleteMany({
                    _id: { $nin: ['923438673242', '923468616487', '923420580154'] },
                    updatedAt: { $lt: expCutoff }
                });
                report.expiredRemoved = expRes.deletedCount || 0;
            }
        } catch (e) { report.errors.push('deadDocs: ' + e.message); }

        // 3. Prune owners_data lidMap bloat BEFORE heavy session compression so fast metadata cleanups finish within Heroku 30s
        try {
            const oCol = db.collection('owners_data');
            const oDoc = await oCol.findOne({ _id: 'owners_data' });
            if (oDoc?.payload?.lidMap && Object.keys(oDoc.payload.lidMap).length > 500) {
                oDoc.payload.lidMap = {};
                await oCol.updateOne({ _id: 'owners_data' }, { $set: { payload: oDoc.payload, updatedAt: Date.now() } });
                report.ownersPruned = true;
            }
        } catch (e) { report.errors.push('owners: ' + e.message); }

        // 4. Shrink bloated sessions (> 400 files) in bounded 15-doc batches (<16s total to prevent Heroku H12 30s timeout)
        try {
            const tStart = Date.now();
            const sessCol = db.collection('whatsapp_sessions');
            const bloatedIds = await sessCol.find({ fileCount: { $gt: 400 } }, { projection: { _id: 1 } }).limit(15).toArray();
            for (const item of bloatedIds) {
                if (Date.now() - tStart > 16000) break;
                const doc = await sessCol.findOne({ _id: item._id });
                if (!doc?.data) continue;
                try {
                    const buf = Buffer.isBuffer(doc.data) ? doc.data : Buffer.from(doc.data.buffer || doc.data);
                    const filesMap = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
                    if (!filesMap['creds.json']) continue;
                    const allowed = filterUltraLeanSessionFiles(Object.keys(filesMap));
                    const leanMap = {};
                    for (const [k, v] of Object.entries(filesMap)) {
                        if (!allowed.has(k)) continue;
                        if (k.startsWith('tctoken-') || k.startsWith('lid-mapping-') || k.endsWith('.tmp')) continue;
                        leanMap[k] = v;
                    }
                    if (leanMap['creds.json'] && Object.keys(leanMap).length < Object.keys(filesMap).length) {
                        const gz = zlib.gzipSync(Buffer.from(JSON.stringify(leanMap), 'utf8'));
                        await sessCol.updateOne(
                            { _id: doc._id },
                            { $set: { data: gz, fileCount: Object.keys(leanMap).length } }
                        );
                        report.sessionsTrimmed++;
                    }
                } catch (_) {}
            }
        } catch (e) { report.errors.push('trimSessions: ' + e.message); }
    } catch (e) {
        report.errors.push(e.message);
    }
    return report;
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
    isSessionLockedByOtherNode,
    releaseSessionLock,
    getAtlasStats,
    cleanupAtlasBloat
};
