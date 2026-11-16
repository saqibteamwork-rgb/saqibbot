'use strict';

/**
 * MR SAQIB MD :: ZERO MEMORY LOSS & PERSISTENT SETTINGS ENGINE
 * ============================================================================
 * Guarantees 100% preservation of all user configurations, permissions & settings:
 * 1. Owner Status (.ownadd) ➜ Never lost on disconnect/re-pair. Only Master Owner (.owndel) can revoke.
 * 2. Premium Status (.addpm) ➜ Never lost on disconnect/re-pair. Only .delpm or natural expiry can revoke.
 * 3. Feature Flags (.autotyping, .alwaysonline, .autoread, .statusseen, .statusreact, .autorecording)
 *    ➜ Automatically saved to MongoDB Atlas & disk per normalized phone number.
 *    ➜ When a user re-pairs (after 2 days, 4 days, or 10 days), ALL old settings auto-sync back instantly!
 * ============================================================================
 */

const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'user_profiles.json');

let cachedProfiles = null;

/**
 * Normalizes any phone number, JID, or LID into standard international digits
 * e.g. '03001234567' -> '923001234567', '923001234567:1@s.whatsapp.net' -> '923001234567'
 */
function normalizeCanonicalDigits(raw) {
    if (!raw) return '';
    let digits = String(raw).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (digits.startsWith('03') && digits.length === 11) {
        digits = '92' + digits.slice(1);
    } else if (digits.startsWith('3') && digits.length === 10) {
        digits = '92' + digits;
    }
    return digits;
}

/**
 * Loads all user profiles from disk or cache
 */
function loadProfiles() {
    try {
        if (cachedProfiles) return cachedProfiles;
        fs.ensureDirSync(DATA_DIR);
        if (fs.existsSync(PROFILES_FILE)) {
            cachedProfiles = fs.readJsonSync(PROFILES_FILE) || {};
        } else {
            cachedProfiles = {};
        }
        return cachedProfiles;
    } catch (_) {
        return {};
    }
}

/**
 * Persists user profiles to disk and pushes debounced to MongoDB Atlas cloud
 */
function saveProfiles(profiles) {
    try {
        cachedProfiles = profiles;
        fs.ensureDirSync(DATA_DIR);
        fs.writeJsonSync(PROFILES_FILE, profiles, { spaces: 2 });

        try {
            const mongoSync = require('./mongoSync');
            if (typeof mongoSync.pushToMongo === 'function') {
                mongoSync.pushToMongo('user_profiles', profiles, 500);
            }
        } catch (_) {}
    } catch (e) {
        console.error('[ZeroLossManager Save Error]:', e.message);
    }
}

/**
 * Retrieves saved persistent settings for a user by phone or ID
 */
function getUserSettings(phoneOrUserId) {
    if (!phoneOrUserId) return null;
    const canonical = normalizeCanonicalDigits(phoneOrUserId);
    if (!canonical) return null;

    const last10 = canonical.slice(-10);
    const localPak = canonical.startsWith('923') ? ('0' + canonical.slice(2)) : canonical;

    const profiles = loadProfiles();
    return profiles[canonical] || profiles[localPak] || (last10.length === 10 ? profiles[last10] : null) || profiles[phoneOrUserId] || null;
}

/**
 * Saves/updates user settings persistently
 */
function persistUserSettings(phoneOrUserId, settingsObj) {
    if (!phoneOrUserId || !settingsObj || typeof settingsObj !== 'object') return;
    const canonical = normalizeCanonicalDigits(phoneOrUserId);
    if (!canonical) return;

    const profiles = loadProfiles();
    const existing = profiles[canonical] || {};

    const merged = {
        ...existing,
        ...settingsObj,
        updatedAt: Date.now()
    };

    profiles[canonical] = merged;
    saveProfiles(profiles);
}

/**
 * Automatic Sync on Baileys Socket Open:
 * Restores all feature flags (autotyping, alwaysOnline, etc.) and ensures owner/premium link
 */
async function syncOnConnection(sock, userId, botData, saveBotDataFn) {
    try {
        if (!sock?.user?.id && !userId) return;

        const phoneRaw = sock?.user?.id || userId;
        const canonical = normalizeCanonicalDigits(phoneRaw);
        if (!canonical) return;

        const last10 = canonical.slice(-10);
        const localPak = canonical.startsWith('923') ? ('0' + canonical.slice(2)) : canonical;

        const profiles = loadProfiles();

        // 1. Look up saved profile in local user_profiles
        let saved = profiles[canonical] || profiles[localPak] || (last10.length === 10 ? profiles[last10] : null) || profiles[userId];

        // 2. If not found locally, query MongoDB Atlas cloud
        if (!saved) {
            try {
                const mongoSync = require('./mongoSync');
                if (typeof mongoSync.pullFromMongo === 'function') {
                    const cloudProfiles = await mongoSync.pullFromMongo('user_profiles');
                    if (cloudProfiles && typeof cloudProfiles === 'object') {
                        saved = cloudProfiles[canonical] || cloudProfiles[localPak] || (last10.length === 10 ? cloudProfiles[last10] : null) || cloudProfiles[userId];
                        if (saved) {
                            profiles[canonical] = saved;
                            saveProfiles(profiles);
                        }
                    }
                }
            } catch (_) {}
        }

        // 3. Fallback to existing botData.statusSettings if available
        if (!saved && botData?.statusSettings) {
            saved = botData.statusSettings[canonical] ||
                    botData.statusSettings[localPak] ||
                    (last10.length === 10 ? botData.statusSettings[last10] : null) ||
                    botData.statusSettings[userId];
        }

        if (!saved) {
            saved = {
                autoStatus: false,
                autoSeen: false,
                autoLike: false,
                autoDownload: false,
                autoTyping: false,
                autoRecording: false,
                alwaysOnline: false,
                autoRead: false,
                isPublic: false,
                system: 1,
                updatedAt: Date.now()
            };
        }

        // Standardize booleans
        saved.autoStatus = Boolean(saved.autoStatus);
        saved.autoSeen = Boolean(saved.autoSeen);
        saved.autoLike = Boolean(saved.autoLike);
        saved.autoDownload = Boolean(saved.autoDownload);
        saved.autoTyping = Boolean(saved.autoTyping);
        saved.autoRecording = Boolean(saved.autoRecording);
        saved.alwaysOnline = Boolean(saved.alwaysOnline);
        saved.autoRead = Boolean(saved.autoRead);

        // Store into persistent user_profiles
        profiles[canonical] = saved;
        saveProfiles(profiles);

        // 4. Link memory reference in botData.statusSettings across all key aliases
        if (!botData.statusSettings) botData.statusSettings = {};
        botData.statusSettings[canonical] = saved;
        botData.statusSettings[localPak] = saved;
        if (last10.length === 10) botData.statusSettings[last10] = saved;
        if (userId) botData.statusSettings[userId] = saved;

        if (typeof saveBotDataFn === 'function') {
            saveBotDataFn();
        }

        // 5. Apply presence updates immediately
        if (saved.alwaysOnline && sock && typeof sock.sendPresenceUpdate === 'function') {
            try {
                await sock.sendPresenceUpdate('available');
            } catch (_) {}
        }

        // 6. Ensure owners_data is refreshed from MongoDB Atlas cloud
        try {
            const mongoSync = require('./mongoSync');
            if (typeof mongoSync.pullFromMongo === 'function') {
                const cloudOwners = await mongoSync.pullFromMongo('owners_data');
                if (cloudOwners && Array.isArray(cloudOwners.owners)) {
                    const ownerManager = require('./ownerManager');
                    const localOwners = ownerManager.loadOwnersData();
                    if ((cloudOwners.updatedAt || 0) > (localOwners.updatedAt || 0)) {
                        ownerManager.saveOwnersData(cloudOwners);
                    }
                }
            }
        } catch (_) {}

        // 7. Register session identity with ownerManager to preserve Owner / Premium mappings
        try {
            const ownerManager = require('./ownerManager');
            if (typeof ownerManager.registerSessionIdentity === 'function') {
                ownerManager.registerSessionIdentity(sock);
            }
        } catch (_) {}

        console.log(`✨ [Zero Memory Loss] Restored & Synced settings for +${canonical}: autoTyping=${saved.autoTyping}, alwaysOnline=${saved.alwaysOnline}, autoRead=${saved.autoRead}, autoLike=${saved.autoLike}`);
        return saved;
    } catch (err) {
        console.error('[ZeroLossManager Error]:', err.message);
    }
}

module.exports = {
    normalizeCanonicalDigits,
    loadProfiles,
    saveProfiles,
    getUserSettings,
    persistUserSettings,
    syncOnConnection
};
