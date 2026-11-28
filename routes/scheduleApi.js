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

// Multi-Node Cluster URLs for global WhatsApp delivery synchronization (24 Nodes)
const CLUSTER_NODES = [
    'https://web-production-08da5300.up.railway.app',
    'https://saqib-bot-v1-d3ecc6f0292e.herokuapp.com',
    'https://saqib-bot-s2-1cceb03e9698.herokuapp.com',
    'https://saqibbot3-bb2b46aa1cb4.herokuapp.com',
    'https://saqibot4-1469f73b3d77.herokuapp.com',
    'https://saqibbot5-5ffa090fe31f.herokuapp.com',
    'https://saqibot6-061b6d17645d.herokuapp.com',
    'https://saqibot7-b9d00e67a587.herokuapp.com',
    'https://saqibbot8-f10fafc8b934.herokuapp.com',
    'https://saqibbot9-bebb531508e3.herokuapp.com',
    'https://saqibot10-d27e9f3ad01e.herokuapp.com',
    'https://saqibbot11-815563078799.herokuapp.com',
    'https://saqibbot12-2fb338ff529a.herokuapp.com',
    'https://saqibot13-392b066b37a5.herokuapp.com',
    'https://saqibbot14-d84e8d59500a.herokuapp.com',
    'https://saqibbot16-b071c813d801.herokuapp.com',
    'https://saqibot17-a471970ef223.herokuapp.com',
    'https://saqibbot18-45854000f60b.herokuapp.com',
    'https://saqibbot19-bb306a89a5f4.herokuapp.com',
    'https://saqibbot20-317bb68e4db0.herokuapp.com',
    'https://saqibbot21-ac7859f5f0fb.herokuapp.com',
    'https://saqibot21-0b44cf00a75a.herokuapp.com',
    'https://saqibbot22-9318c2de0250.herokuapp.com',
    'https://saqibot23-1f4bec48d0f2.herokuapp.com',
    'https://saqibbot25-46c4cf949a77.herokuapp.com',
    'https://saqibot25-0974df36edd8.herokuapp.com',
    'https://saqibot26-69a8011cc819.herokuapp.com',
    'https://saqibot27-1c1d295781fa.herokuapp.com',
    'https://saqibbot28-658e7de676c8.herokuapp.com'
];

function setSocket(sock) {
    currentSock = sock;
}

function setSessions(sessions) {
    sessionsRef = sessions;
}

/**
 * Clean phone number to standard digits with Pakistan 03xx -> 923xx normalization.
 * Strips WhatsApp domain (@s.whatsapp.net) and device index (:25, :0, etc.)
 */
function cleanPhone(raw) {
    if (!raw) return '';
    let str = String(raw).split('@')[0].split(':')[0];
    let digits = str.replace(/[^0-9]/g, '');
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
 * 1. Checks if a session matching this exact phone number is connected (delivers to "You" chat).
 * 2. Checks currentSock direct match.
 * 3. Falls back to ANY active connected bot session on the server to send the OTP.
 * Returns null ONLY if the bot server is completely offline / not paired with any WhatsApp.
 */
function getSocketForPhone(phone) {
    const clean = cleanPhone(phone);
    const sessions = sessionsRef || global.ProBoySessionManager?.getSessions?.() || {};

    // 1. Exact match in sessions: session for this phone is active & connected
    for (const [key, sess] of Object.entries(sessions)) {
        if (!sess || !sess.sock || !sess.isConnected) continue;
        const keyClean = cleanPhone(key);
        const sockClean = cleanPhone(sess.sock?.user?.id || sess.userId || '');
        if (keyClean === clean || sockClean === clean) {
            return { sock: sess.sock, isOwnSession: true, session: sess };
        }
    }

    // 2. Direct match with currentSock
    if (currentSock && currentSock.user) {
        const currentClean = cleanPhone(currentSock.user.id);
        if (currentClean === clean) {
            return { sock: currentSock, isOwnSession: true, session: null };
        }
    }

    // STRICT: Return null if this phone does NOT have its own session on this server
    return null;
}

/**
 * Get any active connected socket capable of dispatching WhatsApp messages.
 */
function getAnyActiveSocket() {
    if (currentSock && typeof currentSock.sendMessage === 'function') {
        return currentSock;
    }
    const sessions = sessionsRef || global.ProBoySessionManager?.getSessions?.() || {};
    for (const sess of Object.values(sessions)) {
        if (sess && sess.sock && sess.isConnected && typeof sess.sock.sendMessage === 'function') {
            return sess.sock;
        }
    }
    const activeSocks = (typeof global.ProBoySessionManager?.getActiveSocks === 'function')
        ? global.ProBoySessionManager.getActiveSocks()
        : [];
    if (activeSocks.length > 0 && typeof activeSocks[0]?.sendMessage === 'function') {
        return activeSocks[0];
    }
    return null;
}

/**
 * Check if phone is owner
 */
function isOwnerPhone(phone) {
    const clean = cleanPhone(phone);
    if (clean === '923286037243' || clean.endsWith('3286037243')) return true;
    const defaultOwner = cleanPhone(settings.ownerNumber || config.OWNER_NUMBER || '923286037243');
    if (clean === defaultOwner || (defaultOwner && clean.endsWith(defaultOwner))) return true;

    try {
        const ownerManager = require('../utils/ownerManager');
        const om = ownerManager.loadOwnersData();
        if (om?.masterOwner === clean) return true;
        if (Array.isArray(om?.owners)) {
            if (om.owners.some((o) => {
                const od = cleanPhone(typeof o === 'string' ? o : o?.digits);
                return od && (od === clean || clean.endsWith(od.slice(-10)));
            })) return true;
        } else if (om?.owners?.[clean] || om?.owners?.[clean.slice(-10)]) {
            return true;
        }
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
            return res.status(400).json({ success: false, error: 'Sahi WhatsApp number darj karein (e.g. 923286037243).' });
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

        // 1. If this phone has its OWN active paired bot session on this server:
        // Message is sent from user's own bot to their own number -> Lands in "You" (Message Yourself) chat!
        const ownSockInfo = getSocketForPhone(phone);
        if (ownSockInfo && ownSockInfo.isOwnSession && ownSockInfo.sock && typeof ownSockInfo.sock.sendMessage === 'function') {
            try {
                await ownSockInfo.sock.sendMessage(targetJid, { text: otpMessage });
                return res.json({
                    success: true,
                    phone,
                    inYouChat: true,
                    message: `Verification code aapke WhatsApp "You" (Message Yourself) chat mein bhej diya gaya hai!`
                });
            } catch (ownErr) {
                console.warn('[ScheduleApi] Own socket send failed, checking cluster...', ownErr.message);
            }
        }

        // 2. Check sibling cluster nodes (Railway, s3, etc.) to see if user's OWN bot session is active there!
        const isClusterForward = Boolean(req.headers['x-cluster-forward']);
        if (!isClusterForward) {
            for (const nodeUrl of CLUSTER_NODES) {
                try {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), 3500);
                    const fwdRes = await fetch(`${nodeUrl}/api/schedule/send-otp`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-cluster-forward': 'true'
                        },
                        body: JSON.stringify({ phone }),
                        signal: ctrl.signal
                    });
                    clearTimeout(timer);
                    const fwdData = await fwdRes.json();
                    if (fwdData && fwdData.success && fwdData.inYouChat) {
                        return res.status(fwdRes.status).json(fwdData);
                    }
                } catch (_) {}
            }
        }

        // 3. STRICT RULE: NEVER deliver OTP from another user/bot!
        // If the number is NOT paired on this node OR any of the 11 cluster nodes:
        // Do NOT send an OTP from any foreign bot. Prompt user to pair their number first!
        return res.status(200).json({
            success: false,
            notPaired: true,
            phone,
            pairUrl: '/pair',
            message: `Aapka WhatsApp number (+${phone}) bot ke sath pair nahi hai! Pehle bot ko pair karein taake OTP aapke WhatsApp "You" (Message Yourself) chat mein aa sake!`
        });
    } catch (err) {
        console.error('[ScheduleApi send-otp Error]:', err.message);
        return res.status(500).json({ success: false, error: 'Server error sending OTP.' });
    }
});

/**
 * POST /api/schedule/verify-otp
 */
router.post('/api/schedule/verify-otp', async (req, res) => {
    try {
        const phone = cleanPhone(req.body.phone);
        const enteredOtp = String(req.body.otp || '').replace(/\s+/g, '').trim();

        if (!phone || !enteredOtp) {
            return res.status(400).json({ success: false, error: 'Phone number aur OTP dono zaroori hain.' });
        }

        // Direct Owner Bypass for emergency/instant access
        if (isOwnerPhone(phone) && (enteredOtp === 'password123' || enteredOtp === '834036')) {
            const token = crypto.randomBytes(32).toString('hex');
            authTokens.set(token, {
                phone,
                isOwner: true,
                expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
            });
            return res.json({
                success: true,
                token,
                user: {
                    phone,
                    isOwner: true,
                    label: '👑 Bot Owner'
                }
            });
        }

        const record = otpStore.get(phone);
        if (!record) {
            // Check sibling cluster nodes for verification
            for (const nodeUrl of CLUSTER_NODES) {
                try {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), 3500);
                    const fwdRes = await fetch(`${nodeUrl}/api/schedule/verify-otp`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone, otp: enteredOtp }),
                        signal: ctrl.signal
                    });
                    clearTimeout(timer);
                    const fwdData = await fwdRes.json();
                    if (fwdData && fwdData.success && fwdData.token) {
                        authTokens.set(fwdData.token, {
                            phone,
                            isOwner: isOwnerPhone(phone),
                            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
                        });
                        return res.json(fwdData);
                    }
                } catch (_) {}
            }
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
 * GET /api/schedule/debug-vo
 * Diagnostic endpoint for inspecting real-time View-Once cache & event logs
 */
router.get('/api/schedule/debug-vo', (req, res) => {
    try {
        const vom = require('../utils/viewOnceManager');
        res.json(vom.getDebugStatus ? vom.getDebugStatus() : { status: 'vom loaded' });
    } catch (e) {
        res.json({ error: e.message });
    }
});

/**
 * GET /api/schedule/probe-session
 * Checks if THIS specific node currently holds an active paired socket for phone.
 * Does NOT forward to siblings. Used by Parallel Ping Discovery across 11 nodes.
 */
router.get('/api/schedule/probe-session', (req, res) => {
    const phone = cleanPhone(req.query.phone || req.query.number);
    if (!phone) {
        return res.status(400).json({ success: false, error: 'Phone number required.' });
    }

    const clean = phone;
    const sessions = sessionsRef || global.ProBoySessionManager?.getSessions?.() || {};

    // 1. Check exact session in sessions map
    for (const [key, sess] of Object.entries(sessions)) {
        if (!sess || !sess.sock || !sess.isConnected) continue;
        const keyClean = cleanPhone(key);
        const sockClean = cleanPhone(sess.sock?.user?.id || sess.userId || '');
        if (keyClean === clean || sockClean === clean) {
            return res.json({
                success: true,
                hasSession: true,
                phone,
                userId: sess.userId || key,
                nodeId: process.env.SERVER_ID || process.env.NODE_ID || (process.env.DYNO ? 'heroku' : 'railway')
            });
        }
    }

    // 2. Check direct match on currentSock
    if (currentSock && currentSock.user) {
        const currentClean = cleanPhone(currentSock.user.id);
        if (currentClean === clean) {
            return res.json({
                success: true,
                hasSession: true,
                phone,
                userId: currentClean,
                nodeId: process.env.SERVER_ID || process.env.NODE_ID || (process.env.DYNO ? 'heroku' : 'railway')
            });
        }
    }

    return res.json({
        success: true,
        hasSession: false,
        phone
    });
});

/**
 * GET /api/schedule/pair-status
 * Checks if a number is paired & connected, or returns active pairing code
 */
router.get('/api/schedule/pair-status', async (req, res) => {
    const phone = cleanPhone(req.query.phone || req.query.number);
    if (!phone) {
        return res.status(400).json({ success: false, error: 'Phone number required.' });
    }

    const sockInfo = getSocketForPhone(phone);
    if (sockInfo && sockInfo.sock) {
        return res.json({
            success: true,
            phone,
            isConnected: true,
            pairingCode: null,
            isInitializing: false
        });
    }

    // Check sibling cluster nodes
    for (const nodeUrl of CLUSTER_NODES) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 2000);
            const r = await fetch(`${nodeUrl}/api/schedule/pair-status?phone=${encodeURIComponent(phone)}`, {
                signal: ctrl.signal
            });
            clearTimeout(timer);
            const d = await r.json();
            if (d && d.success && d.isConnected) {
                return res.json(d);
            }
        } catch (_) {}
    }

    const sessions = sessionsRef || global.ProBoySessionManager?.getSessions?.() || {};
    const sess = sessions[phone];

    return res.json({
        success: true,
        phone,
        isConnected: false,
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
