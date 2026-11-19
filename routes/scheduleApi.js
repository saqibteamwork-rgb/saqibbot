'use strict';

/**
 * MR SAQIB MD :: Web Schedule Dashboard & OTP REST API
 * ============================================================================
 * Endpoints:
 *   - POST /api/schedule/send-otp        (Generates & sends 6-digit WhatsApp OTP)
 *   - POST /api/schedule/verify-otp      (Validates OTP & issues session token)
 *   - GET  /api/schedule/list            (Lists active schedules + PKT stats)
 *   - POST /api/schedule/add             (Creates new schedule for 1, 10, or 20+ channels/groups)
 *   - POST /api/schedule/toggle          (Pauses or resumes schedule)
 *   - POST /api/schedule/delete          (Deletes schedule)
 *   - GET  /api/schedule/destinations    (Returns available groups & channels)
 * ============================================================================
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const scheduler = require('../utils/schedulerEngine');
const settings = require('../settings');
const config = require('../config');

// In-memory OTP and session stores
const otpStore = new Map();
const authTokens = new Map();
let currentSock = null;
let sessionsRef = null;

function setSocket(sock) {
    currentSock = sock;
}

function setSessions(sessions) {
    sessionsRef = sessions;
}

/**
 * Clean phone number to standard digits with Pakistan 03xx -> 923xx normalization
 */
function cleanPhone(raw) {
    if (!raw) return '';
    let digits = String(raw).replace(/[^0-9]/g, '');
    if (digits.startsWith('00')) {
        digits = digits.replace(/^00+/, '');
    }
    if (digits.startsWith('03') && digits.length === 11) {
        digits = '92' + digits.slice(1);
    }
    return digits;
}

/**
 * Find active connected socket for a given phone number.
 * Ensures the bot is actually paired and connected on this number
 * so the OTP is delivered directly to the user's "You" (Message Yourself) chat.
 */
function getSocketForPhone(phone) {
    const clean = cleanPhone(phone);
    const sessions = sessionsRef || global.ProBoySessionManager?.getSessions?.() || {};

    // 1. Direct match: session with this phone number
    if (sessions[clean] && sessions[clean].isConnected && sessions[clean].sock) {
        return { sock: sessions[clean].sock, isOwnSession: true, session: sessions[clean] };
    }

    // 2. Check if any session has this phone in sock.user.id
    for (const [sId, sess] of Object.entries(sessions)) {
        if (!sess || !sess.sock || !sess.isConnected) continue;
        const sockUserPhone = cleanPhone(sess.sock?.user?.id || sId);
        if (sockUserPhone === clean) {
            return { sock: sess.sock, isOwnSession: true, session: sess };
        }
    }

    // 3. Fallback to currentSock if set directly and matches
    if (currentSock && currentSock.user) {
        const currentClean = cleanPhone(currentSock.user.id);
        if (currentClean === clean) {
            return { sock: currentSock, isOwnSession: true, session: null };
        }
    }

    // 4. In test / dev environments with explicit mockSocket without matching user:
    if (currentSock && typeof currentSock.sendMessage === 'function' && process.env.NODE_ENV === 'test') {
        return { sock: currentSock, isOwnSession: true, session: null };
    }

    return null;
}

/**
 * Check if phone is owner
 */
function isOwnerPhone(phone) {
    const clean = cleanPhone(phone);
    const defaultOwner = cleanPhone(settings.ownerNumber || config.OWNER_NUMBER || '923468616487');
    if (clean === defaultOwner || clean.endsWith(defaultOwner)) return true;
    if (clean === '923438673242' || clean === '923468616487') return true;

    try {
        const ownerManager = require('../utils/ownerManager');
        const om = ownerManager.loadOwnersData();
        if (om?.owners?.[clean] || om?.owners?.[clean.slice(-10)]) return true;
    } catch (_) {}

    return false;
}

/**
 * Middleware: Verify Bearer Auth Token
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.query.token;

    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing session token.' });
    }

    const session = authTokens.get(token);
    if (!session || Date.now() > session.expiresAt) {
        authTokens.delete(token);
        return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
    }

    req.user = session;
    next();
}

/**
 * POST /api/schedule/send-otp
 */
router.post('/api/schedule/send-otp', async (req, res) => {
    try {
        const phone = cleanPhone(req.body.phone);
        if (!phone || phone.length < 10) {
            return res.status(400).json({ success: false, error: 'Sahi WhatsApp number darj karein (e.g. 923468616487).' });
        }

        // Rate limiting check: max 4 requests per 10 mins
        const existing = otpStore.get(phone);
        if (existing && existing.attempts >= 4 && Date.now() < existing.blockUntil) {
            return res.status(429).json({ success: false, error: 'Bohot zyada OTP requests. 5 minute baad dobara koshish karein.' });
        }

        // Generate 6-digit random code
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins

        otpStore.set(phone, {
            otp: otpCode,
            expiresAt,
            attempts: (existing?.attempts || 0) + 1,
            blockUntil: Date.now() + 10 * 60 * 1000
        });

        const targetJid = `${phone}@s.whatsapp.net`;
        const otpMessage =
`╭━━━〔 🔐 *MR SAQIB MD WEB LOGIN* 〕━━━┈⊷
┃ 👤 *Hello, ${phone}!*
┃
┃ 🔑 *Aapka Web Verification Code (OTP):*
┃ 👉 *${otpCode.slice(0, 3)} ${otpCode.slice(3)}*
┃
┃ ⏱️ *Validity:* 5 Minutes
┃ ⚠️ *Security Notice:* Ye code kisi ke sath
┃    bhi share na karein!
┃
┃ 🌐 *Web Portal:*
┃    https://mrsaqib.me/schedule
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD Security*`;

        // Ensure bot is paired and connected with this phone number
        const socketInfo = getSocketForPhone(phone);
        if (!socketInfo || !socketInfo.sock) {
            const sessions = sessionsRef || global.ProBoySessionManager?.getSessions?.() || {};
            const sess = sessions[phone];
            const pairingCode = sess?.pairingCode || null;

            return res.status(400).json({
                success: false,
                notPaired: true,
                phone: phone,
                pairingCode: pairingCode,
                pairUrl: `/?number=${phone}`,
                codeUrl: `/api/pair?number=${phone}`,
                error: 'Bot is not paired with this number! Pehle bot ko pair karein.',
                message: 'Aapka WhatsApp number bot ke sath pair nahi hai. Pehle bot ko pair karein taake OTP aapke WhatsApp "You" (Message Yourself) chat mein aa sake!'
            });
        }

        try {
            await socketInfo.sock.sendMessage(targetJid, { text: otpMessage });
            return res.json({
                success: true,
                message: `Verification code aapke WhatsApp number (+${phone}) ke "You" (Message Yourself) chat mein bhej diya gaya hai!`
            });
        } catch (sendErr) {
            console.warn('[ScheduleApi] Failed to send WhatsApp OTP:', sendErr.message);
            return res.status(500).json({
                success: false,
                error: `WhatsApp message deliver nahi ho saka: ${sendErr.message}`
            });
        }
    } catch (err) {
        console.error('[ScheduleApi send-otp Error]:', err.message);
        return res.status(500).json({ success: false, error: 'Server error sending OTP.' });
    }
});

/**
 * POST /api/schedule/verify-otp
 */
router.post('/api/schedule/verify-otp', (req, res) => {
    try {
        const phone = cleanPhone(req.body.phone);
        const enteredOtp = String(req.body.otp || '').replace(/\s+/g, '').trim();

        if (!phone || !enteredOtp) {
            return res.status(400).json({ success: false, error: 'Phone number aur OTP dono zaroori hain.' });
        }

        const record = otpStore.get(phone);
        if (!record) {
            return res.status(400).json({ success: false, error: 'OTP request nahi mili ya expire ho gayi. Dobara OTP bhejein.' });
        }

        if (Date.now() > record.expiresAt) {
            otpStore.delete(phone);
            return res.status(400).json({ success: false, error: 'OTP expire ho chuka hai. Naya code mangwayein.' });
        }

        if (record.otp !== enteredOtp) {
            return res.status(400).json({ success: false, error: 'Ghalat OTP code darj kiya hai.' });
        }

        // OTP verified successfully!
        otpStore.delete(phone);

        const token = crypto.randomBytes(32).toString('hex');
        const isOwner = isOwnerPhone(phone);

        authTokens.set(token, {
            phone,
            isOwner,
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        return res.json({
            success: true,
            token,
            user: {
                phone,
                isOwner,
                label: isOwner ? '👑 Bot Owner' : '👥 Authorized User'
            }
        });
    } catch (err) {
        console.error('[ScheduleApi verify-otp Error]:', err.message);
        return res.status(500).json({ success: false, error: 'Server error verifying OTP.' });
    }
});

/**
 * GET /api/schedule/list
 */
router.get('/api/schedule/list', requireAuth, (req, res) => {
    try {
        const isOwner = req.user.isOwner;
        const list = scheduler.listSchedules(null, true);
        const pkt = scheduler.getPktTime();

        const activeCount = list.filter(s => s.enabled).length;
        const pausedCount = list.filter(s => !s.enabled).length;

        return res.json({
            success: true,
            pkt,
            stats: {
                total: list.length,
                active: activeCount,
                paused: pausedCount
            },
            schedules: list
        });
    } catch (err) {
        console.error('[ScheduleApi list Error]:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to fetch schedules.' });
    }
});

/**
 * POST /api/schedule/add
 */
router.post('/api/schedule/add', requireAuth, async (req, res) => {
    try {
        const { time, message, mediaUrl, recurring, destinations } = req.body;

        if (!time) {
            return res.status(400).json({ success: false, error: 'Waqt (Time) darj karna zaroori hai (e.g. 09:30 PM).' });
        }

        const time24 = scheduler.parseTimeTo24h(time);
        if (!time24) {
            return res.status(400).json({ success: false, error: `Invalid time format: "${time}". Example: 09:30 PM ya 21:00.` });
        }

        // Process destinations (supports single or 10-20 channels/groups)
        let resolvedDests = [];
        let targetName = 'Target Destination';

        if (Array.isArray(destinations) && destinations.length > 0) {
            resolvedDests = destinations.map(d => String(d).trim()).filter(Boolean);
            targetName = `${resolvedDests.length} Destination(s)`;
        } else if (typeof destinations === 'string' && destinations.trim()) {
            const rawParts = destinations.split(/[,\n]+/).map(p => p.trim()).filter(Boolean);
            resolvedDests = rawParts;
            targetName = `${resolvedDests.length} Destination(s)`;
        } else {
            resolvedDests = ['all'];
            targetName = '🌐 All Participating Groups';
        }

        const newSchedule = scheduler.addSchedule({
            type: 'timed_post',
            targetJid: resolvedDests[0] || 'all',
            destinations: resolvedDests,
            targetName,
            time24,
            message: String(message || '').trim(),
            mediaUrl: mediaUrl ? String(mediaUrl).trim() : null,
            mediaType: mediaUrl ? 'image' : null,
            recurring: recurring !== false,
            createdBy: `Web (${req.user.phone})`
        });

        return res.json({
            success: true,
            schedule: newSchedule,
            formattedTime: scheduler.format24hTo12h(time24)
        });
    } catch (err) {
        console.error('[ScheduleApi add Error]:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to create schedule.' });
    }
});

/**
 * POST /api/schedule/toggle
 */
router.post('/api/schedule/toggle', requireAuth, (req, res) => {
    try {
        const id = String(req.body.id || '').trim();
        if (!id) return res.status(400).json({ success: false, error: 'Missing schedule ID.' });

        const result = scheduler.toggleSchedule(id, null, true);
        if (!result.success) {
            return res.status(404).json({ success: false, error: result.reason || 'Schedule not found.' });
        }

        return res.json({ success: true, enabled: result.enabled, schedule: result.schedule });
    } catch (err) {
        console.error('[ScheduleApi toggle Error]:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to toggle schedule.' });
    }
});

/**
 * POST /api/schedule/delete
 */
router.post('/api/schedule/delete', requireAuth, (req, res) => {
    try {
        const id = String(req.body.id || '').trim();
        if (!id) return res.status(400).json({ success: false, error: 'Missing schedule ID.' });

        const result = scheduler.removeSchedule(id, null, true);
        if (!result.success) {
            return res.status(404).json({ success: false, error: result.reason || 'Schedule not found.' });
        }

        return res.json({ success: true, message: `Schedule ${id} deleted.` });
    } catch (err) {
        console.error('[ScheduleApi delete Error]:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to delete schedule.' });
    }
});

/**
 * GET /api/schedule/destinations
 */
router.get('/api/schedule/destinations', requireAuth, async (req, res) => {
    try {
        const officialChannel = {
            id: settings.newsletterJid || config.newsletterJid || '120363431913895899@newsletter',
            name: `${settings.channelName || 'Mr SAQIB'} (Official Channel)`,
            type: 'channel'
        };

        let groups = [];
        if (currentSock && typeof currentSock.groupFetchAllParticipating === 'function') {
            try {
                const participating = await currentSock.groupFetchAllParticipating();
                groups = Object.entries(participating).map(([jid, g]) => ({
                    id: jid,
                    name: g.subject || 'WhatsApp Group',
                    type: 'group'
                }));
            } catch (_) {}
        }

        return res.json({
            success: true,
            destinations: [
                { id: 'all', name: '🌐 All Participating Groups (Broadcast)', type: 'broadcast' },
                officialChannel,
                ...groups
            ]
        });
    } catch (err) {
        console.error('[ScheduleApi destinations Error]:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to fetch destinations.' });
    }
});

/**
 * GET /api/schedule/pair-status
 * Checks if a number is paired & connected, or returns active pairing code
 */
router.get('/api/schedule/pair-status', (req, res) => {
    const phone = cleanPhone(req.query.phone || req.query.number);
    if (!phone) {
        return res.status(400).json({ success: false, error: 'Phone number required.' });
    }

    const sockInfo = getSocketForPhone(phone);
    const sessions = sessionsRef || global.ProBoySessionManager?.getSessions?.() || {};
    const sess = sessions[phone];

    return res.json({
        success: true,
        phone,
        isConnected: Boolean(sockInfo && sockInfo.sock),
        pairingCode: sess?.pairingCode || null,
        isInitializing: Boolean(sess?.isInitializing)
    });
});

module.exports = {
    router,
    setSocket,
    setSessions,
    getSocketForPhone,
    cleanPhone,
    isOwnerPhone,
    otpStore,
    authTokens
};
