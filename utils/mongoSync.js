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

const DB_NAME = 'mr_saqib_bot';
let client = null;
let db = null;
let isConnected = false;
let isConnecting = false;

// Debounce timers for background non-blocking pushes
const debounceTimers = new Map();

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
        { key: 'status_booster', file: path.join(DATA_DIR, 'status_booster.json') }
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

            if (cloudDoc && cloudDoc.payload) {
                // Cloud has data: update local file if cloud is newer or local is missing
                const cloudTime = cloudDoc.updatedAt || 0;
                const localStats = localExists ? fs.statSync(target.file) : null;
                const localTime = localStats ? localStats.mtimeMs : 0;

                if (!localExists || cloudTime >= localTime || !localData || Object.keys(localData).length === 0) {
                    fs.writeJsonSync(target.file, cloudDoc.payload, { spaces: 2 });
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
        database: DB_NAME
    };
}

module.exports = {
    initMongo,
    pushToMongo,
    pullFromMongo,
    getStatus
};
