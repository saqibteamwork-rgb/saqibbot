'use strict';

/**
 * MR SAQIB MD :: COUPON CODE & PRO CHANNEL AUTO-REACT ENGINE
 * ============================================================================
 * Architecture:
 * 1. Master Owner can generate 6-digit coupon codes (.gencoupon / .addcoupon).
 * 2. Regular users redeem codes via .cc <6-digit-code>.
 * 3. Verified users get unlocked as "Coupon Pro".
 * 4. Coupon Pro users can set exactly 1 channel (.achr <link> [emojis]).
 * 5. Reactions on coupon channels come ONLY from the user's own connected bot session!
 * 6. Regular .arc multi-bot swarm is strictly reserved for Premium (max 3) & Owner (unlimited).
 * ============================================================================
 */

const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COUPONS_FILE = path.join(DATA_DIR, 'coupons.json');
fs.ensureDirSync(DATA_DIR);

let cachedData = null;

function normalizeDigits(raw) {
    if (!raw) return '';
    let d = String(raw).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (d.startsWith('03') && d.length === 11) d = '92' + d.slice(1);
    else if (d.startsWith('3') && d.length === 10) d = '92' + d;
    return d;
}

function loadCouponData() {
    if (cachedData) return cachedData;
    try {
        if (fs.existsSync(COUPONS_FILE)) {
            cachedData = fs.readJsonSync(COUPONS_FILE);
        }
    } catch (_) {}

    if (!cachedData || typeof cachedData !== 'object') {
        cachedData = {
            coupons: {},
            redeemedUsers: {},
            updatedAt: Date.now()
        };
    }
    if (!cachedData.coupons) cachedData.coupons = {};
    if (!cachedData.redeemedUsers) cachedData.redeemedUsers = {};
    return cachedData;
}

function saveCouponData(data) {
    try {
        data.updatedAt = Date.now();
        cachedData = data;
        fs.writeJsonSync(COUPONS_FILE, data, { spaces: 2 });

        try {
            const mongoSync = require('./mongoSync');
            if (typeof mongoSync.pushToMongo === 'function') {
                mongoSync.pushToMongo('coupons', data, 400);
            }
        } catch (_) {}
    } catch (e) {
        console.warn('[CouponManager Save Warning]:', e.message);
    }
}

/**
 * Generate a random 6-digit coupon code
 */
function generateRandomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Master Owner: Create or generate a coupon code
 */
function createCoupon({ code = null, maxUses = 1, validDays = 30, createdBy = '923286037243' } = {}) {
    const data = loadCouponData();
    let finalCode = code ? String(code).trim().toUpperCase() : generateRandomCode();

    // Ensure 6 digits if randomly generated
    if (!finalCode) finalCode = generateRandomCode();

    const now = Date.now();
    const expiresAt = validDays > 0 ? (now + validDays * 24 * 60 * 60 * 1000) : null;

    data.coupons[finalCode] = {
        code: finalCode,
        createdBy: normalizeDigits(createdBy) || '923286037243',
        createdAt: now,
        expiresAt: expiresAt,
        validDays: validDays,
        maxUses: Math.max(1, parseInt(maxUses, 10) || 1),
        usedCount: 0,
        usedBy: [],
        channelsLimit: 1,
        tier: 'coupon_pro'
    };

    saveCouponData(data);
    return data.coupons[finalCode];
}

/**
 * User: Redeem a 6-digit coupon code
 */
function redeemCoupon(rawCode, rawUserId) {
    const data = loadCouponData();
    const cleanCode = String(rawCode || '').trim().toUpperCase();
    const userId = normalizeDigits(rawUserId);

    if (!cleanCode) {
        return { success: false, reason: 'INVALID_CODE', message: 'Koi coupon code provide nahi kiya gaya.' };
    }
    if (!userId) {
        return { success: false, reason: 'INVALID_USER', message: 'User identity detect nahi ho saki.' };
    }

    const coupon = data.coupons[cleanCode];
    if (!coupon) {
        return { success: false, reason: 'NOT_FOUND', message: `Coupon code \`${cleanCode}\` mojood nahi hai ya galat hai.` };
    }

    // Check expiration
    if (coupon.expiresAt && Date.now() > coupon.expiresAt) {
        return { success: false, reason: 'EXPIRED', message: `Coupon code \`${cleanCode}\` expire ho chuka hai.` };
    }

    // Check max uses
    if (coupon.usedCount >= coupon.maxUses) {
        return { success: false, reason: 'MAX_USES_REACHED', message: `Coupon code \`${cleanCode}\` ki usage limit poori ho chuki hai.` };
    }

    // Check if user already used this specific coupon
    if (Array.isArray(coupon.usedBy) && coupon.usedBy.includes(userId)) {
        return { success: false, reason: 'ALREADY_USED', message: `Aap pehle hi coupon code \`${cleanCode}\` use kar chuke hain.` };
    }

    // Update coupon stats
    coupon.usedCount = (coupon.usedCount || 0) + 1;
    if (!Array.isArray(coupon.usedBy)) coupon.usedBy = [];
    coupon.usedBy.push(userId);

    // Existing channel preservation if user had previously configured channel
    const prevChannel = data.redeemedUsers[userId]?.channel || null;

    // Activate user
    data.redeemedUsers[userId] = {
        userId: userId,
        couponCode: cleanCode,
        redeemedAt: Date.now(),
        expiresAt: coupon.expiresAt || null,
        isActive: true,
        channel: prevChannel
    };

    saveCouponData(data);
    return {
        success: true,
        coupon: coupon,
        userProfile: data.redeemedUsers[userId],
        message: `Coupon code \`${cleanCode}\` successfully redeem ho gaya! Aapki 1-Channel Auto-React activation active hai.`
    };
}

/**
 * Check if a user is an active Coupon Pro
 */
function isCouponPro(rawUserId) {
    const userId = normalizeDigits(rawUserId);
    if (!userId) return false;
    const data = loadCouponData();
    const user = data.redeemedUsers[userId];
    if (!user || !user.isActive) return false;

    // Expiry check
    if (user.expiresAt && Date.now() > user.expiresAt) {
        user.isActive = false;
        saveCouponData(data);
        return false;
    }
    return true;
}

/**
 * Get coupon profile for a user
 */
function getCouponUser(rawUserId) {
    const userId = normalizeDigits(rawUserId);
    if (!userId) return null;
    const data = loadCouponData();
    return data.redeemedUsers[userId] || null;
}

/**
 * Set the single channel for a Coupon Pro user
 */
function setCouponChannel(rawUserId, { jid, link = '', name = '', emojis = ['❤️', '🔥', '👍', '✨'] }) {
    const userId = normalizeDigits(rawUserId);
    if (!userId) return { success: false, message: 'Invalid user ID' };

    const data = loadCouponData();
    if (!data.redeemedUsers[userId] || !data.redeemedUsers[userId].isActive) {
        return { success: false, message: 'Aapke paas active coupon nahi hai. Pehle `.cc <6-digit-code>` redeem karein!' };
    }

    const cleanEmojis = Array.isArray(emojis) && emojis.length > 0 ? emojis : ['❤️', '🔥', '👍', '✨'];

    data.redeemedUsers[userId].channel = {
        jid: String(jid).trim(),
        link: String(link || '').trim(),
        name: String(name || 'WhatsApp Channel').trim(),
        emojis: cleanEmojis,
        addedAt: Date.now(),
        totalReacted: 0
    };

    saveCouponData(data);
    return {
        success: true,
        channel: data.redeemedUsers[userId].channel,
        message: `Channel successfully set ho gaya! Limit: 1/1 Channel. Sirf aapka apna bot is par react karega.`
    };
}

/**
 * Remove the channel for a Coupon Pro user
 */
function removeCouponChannel(rawUserId) {
    const userId = normalizeDigits(rawUserId);
    if (!userId) return { success: false, message: 'Invalid user ID' };

    const data = loadCouponData();
    if (!data.redeemedUsers[userId]) {
        return { success: false, message: 'Koi coupon profile nahi mili.' };
    }

    data.redeemedUsers[userId].channel = null;
    saveCouponData(data);
    return { success: true, message: 'Aapka 1-channel auto-react remove kar diya gaya hai.' };
}

/**
 * Find which coupon users have registered this channel JID
 */
function getUsersForChannel(channelJid) {
    if (!channelJid) return [];
    const data = loadCouponData();
    const cleanJid = String(channelJid).trim();
    const matches = [];

    for (const [uId, uData] of Object.entries(data.redeemedUsers || {})) {
        if (!uData || !uData.isActive || !uData.channel) continue;
        if (uData.channel.jid === cleanJid) {
            matches.push({
                userId: uId,
                emojis: uData.channel.emojis || ['❤️', '🔥'],
                channelName: uData.channel.name || 'Channel'
            });
        }
    }
    return matches;
}

/**
 * Master Owner: List all coupons
 */
function listCoupons() {
    const data = loadCouponData();
    const couponsList = Object.values(data.coupons || {});
    const activeUsersList = Object.values(data.redeemedUsers || {}).filter(u => u && u.isActive);
    return {
        coupons: couponsList,
        activeUsers: activeUsersList,
        totalCoupons: couponsList.length,
        totalRedeemedUsers: activeUsersList.length
    };
}

/**
 * Master Owner: Delete/Revoke a coupon
 */
function deleteCoupon(rawCode) {
    const data = loadCouponData();
    const cleanCode = String(rawCode || '').trim().toUpperCase();
    if (!data.coupons[cleanCode]) {
        return { success: false, message: `Coupon code \`${cleanCode}\` nahi mila.` };
    }
    delete data.coupons[cleanCode];
    saveCouponData(data);
    return { success: true, message: `Coupon code \`${cleanCode}\` successfully delete ho gaya.` };
}

module.exports = {
    loadCouponData,
    saveCouponData,
    generateRandomCode,
    createCoupon,
    redeemCoupon,
    isCouponPro,
    getCouponUser,
    setCouponChannel,
    removeCouponChannel,
    getUsersForChannel,
    listCoupons,
    deleteCoupon,
    normalizeDigits
};
