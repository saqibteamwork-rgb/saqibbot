// lib/pollvoter.js
// Channel poll voting via Baileys — no external API
// Uses pollUpdateMessage (standard WhatsApp protocol)

const crypto = require('crypto');
const { delay, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

const CONFIG = {
    VOTE_DELAY_MS: 2500,
    JITTER_MS: 1000,
    MAX_ACCOUNTS: 500
};

function jitter(base) {
    return base + (Math.random() * 2 - 1) * base * 0.5;
}

// every network call must answer within a limit, otherwise the command would hang silently
function withTimeout(promise, ms, label) {
    let t;
    const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error((label || 'request') + ' timeout')), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// ═══════════════════════════════════════════
//  RESOLVE CHANNEL LINK
// ═══════════════════════════════════════════
async function resolveChannelLink(sock, link) {
    try {
        const m = String(link).match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)(?:\/(\d+))?/);
        if (!m) return { ok: false, error: 'invalid link' };

        const inviteCode = m[1];
        const serverId = m[2] || null;

        let channelJid = null;
        try {
            const meta = await withTimeout(sock.newsletterMetadata('invite', inviteCode), 12000, 'channel lookup');
            channelJid = meta?.id || meta?.jid || null;
        } catch (e) { return { ok: false, error: e.message }; }

        if (!channelJid) return { ok: false, error: 'channel JID not resolved' };
        return { ok: true, channelJid, serverId, inviteCode };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// ═══════════════════════════════════════════
//  OPTION HASH — WhatsApp poll ke liye
//  SHA-256 of option name (base64)
// ═══════════════════════════════════════════
function hashOption(optionName) {
    return crypto.createHash('sha256')
        .update(String(optionName))
        .digest();
}

// ═══════════════════════════════════════════
//  METHOD 1 — newsletterSendPollVote (if available)
// ═══════════════════════════════════════════
async function voteViaNewsletterAPI(sock, channelJid, pollServerId, optionName) {
    if (typeof sock.newsletterSendPollVote !== 'function') {
        return { ok: false, error: 'newsletterSendPollVote not available' };
    }
    try {
        await sock.newsletterSendPollVote(
            channelJid,
            String(pollServerId),
            [hashOption(optionName)]
        );
        return { ok: true, method: 'newsletter-api' };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// ═══════════════════════════════════════════
//  METHOD 2 — pollUpdateMessage via relayMessage
// ═══════════════════════════════════════════
async function voteViaPollUpdate(sock, channelJid, pollServerId, optionName) {
    try {
        const pollKey = {
            remoteJid: channelJid,
            fromMe: false,
            id: String(pollServerId)
        };

        const pollUpdate = {
            pollUpdateMessage: {
                pollCreationMessageKey: pollKey,
                vote: {
                    selectedOptions: [hashOption(optionName)]
                },
                senderTimestampMs: Date.now()
            }
        };

        const msg = generateWAMessageFromContent(
            channelJid,
            proto.Message.fromObject(pollUpdate),
            { userJid: channelJid }
        );

        await sock.relayMessage(channelJid, msg.message, {
            messageId: msg.key.id,
            additionalNodes: [
                {
                    tag: 'meta',
                    attrs: { polltype: 'snapshot' },
                    content: [{
                        tag: 'snapshot',
                        attrs: {
                            poll_creation_message_key: JSON.stringify(pollKey),
                            selected_options: JSON.stringify([hashOption(optionName).toString('base64')])
                        }
                    }]
                }
            ]
        });

        return { ok: true, method: 'poll-update' };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// ═══════════════════════════════════════════
//  METHOD 3 — sendMessage with poll update (regular chats)
// ═══════════════════════════════════════════
async function voteViaSendMessage(sock, channelJid, pollServerId, optionName) {
    try {
        await sock.sendMessage(channelJid, {
            pollUpdate: {
                pollCreationMessageKey: {
                    remoteJid: channelJid,
                    fromMe: false,
                    id: String(pollServerId)
                },
                vote: {
                    selectedOptions: [hashOption(optionName)]
                }
            }
        });
        return { ok: true, method: 'send-message' };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// ═══════════════════════════════════════════
//  UNIFIED — try all methods
// ═══════════════════════════════════════════
async function voteOneAccount(sock, channelJid, pollServerId, optionName) {
    const errs = [];
    // Only a real, native method is allowed. The old relay/sendMessage guesses were invented
    // (fake 'snapshot' nodes, selectedOptions field that does not exist): the server never
    // counted those votes even though the call 'succeeded'. They are no longer used.
    for (const fn of [voteViaNewsletterAPI]) {
        try {
            const r = await withTimeout(fn(sock, channelJid, pollServerId, optionName), 15000, fn.name);
            if (r.ok) return r;
            errs.push(r.error);
        } catch (e) { errs.push(e.message); }
    }
    return { ok: false, error: errs.filter(Boolean).slice(-1)[0] || 'vote failed', all: errs };
}

// ═══════════════════════════════════════════
//  MASS VOTE — all connected accounts
// ═══════════════════════════════════════════
async function massVote(channelJid, pollServerId, optionName, onProgress) {
    const activeSockets = global.activeSockets;
    if (!activeSockets || typeof activeSockets.forEach !== 'function') {
        return { ok: false, error: 'no active sockets' };
    }

    const sockets = [];
    activeSockets.forEach((sock, number) => {
        if (sock && sock.user && sock.user.id) sockets.push({ number, sock });
    });

    if (!sockets.length) return { ok: false, error: 'no connected accounts' };

    const limited = sockets.slice(0, CONFIG.MAX_ACCOUNTS);
    let success = 0, failed = 0;
    const methods = {};

    for (let i = 0; i < limited.length; i++) {
        const { sock } = limited[i];
        const r = await voteOneAccount(sock, channelJid, pollServerId, optionName);
        if (r.ok) {
            success++;
            methods[r.method] = (methods[r.method] || 0) + 1;
        } else {
            failed++;
        }
        if (onProgress) onProgress(i + 1, limited.length, success, failed);
        await delay(jitter(CONFIG.VOTE_DELAY_MS));
    }

    return { ok: success > 0, total: limited.length, success, failed, methods };
}

// ═══════════════════════════════════════════
//  POLL OPTIONS LOOKUP (so 1 / 2 / A / B work)
// ═══════════════════════════════════════════
function digOptions(node, depth = 0) {
    if (!node || depth > 8) return null;
    if (Array.isArray(node)) {
        for (const x of node) { const r = digOptions(x, depth + 1); if (r) return r; }
        return null;
    }
    if (typeof node !== 'object') return null;
    const poll = node.pollCreationMessage || node.pollCreationMessageV2 || node.pollCreationMessageV3 || node.pollCreation;
    if (poll && Array.isArray(poll.options)) {
        const names = poll.options.map(o => (typeof o === 'string' ? o : o.optionName || o.name)).filter(Boolean);
        if (names.length) return { name: poll.name || '', options: names };
    }
    for (const k of Object.keys(node)) {
        const r = digOptions(node[k], depth + 1);
        if (r) return r;
    }
    return null;
}

async function fetchPollOptions(sock, channelJid, serverId) {
    if (typeof sock.newsletterFetchMessages !== 'function') return null;
    const target = Number(serverId);
    const tries = [
        () => sock.newsletterFetchMessages('jid', channelJid, 50, target - 1),
        () => sock.newsletterFetchMessages(channelJid, 50, 0, target - 1),
        () => sock.newsletterFetchMessages('jid', channelJid, 50)
    ];
    for (const t of tries) {
        try {
            const res = await withTimeout(t(), 8000, 'poll fetch');
            const list = Array.isArray(res) ? res : (res?.messages || res?.nodes || [res]);
            const hit = list.find(x => String(x?.server_id || x?.serverId || x?.id || x?.attrs?.server_id) === String(serverId));
            const found = digOptions(hit || list);
            if (found) return found;
        } catch (_) { /* try next signature */ }
    }
    return null;
}

// "1" / "a" / "B" / "option name" -> real option name
function pickOption(choice, options) {
    const c = String(choice || '').trim().replace(/^["']|["']$/g, '');
    if (!c) return null;
    if (options && options.length) {
        const byName = options.find(o => o.toLowerCase() === c.toLowerCase());
        if (byName) return byName;
        let idx = -1;
        if (/^\d+$/.test(c)) idx = parseInt(c, 10) - 1;
        else if (/^[a-z]$/i.test(c)) idx = c.toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length) return options[idx];
        const partial = options.find(o => o.toLowerCase().includes(c.toLowerCase()));
        if (partial) return partial;
        return null;
    }
    return c; // options unknown: treat as the option name itself
}

// ═══════════════════════════════════════════
//  ALL SESSIONS VOTE (same option or split across options)
// ═══════════════════════════════════════════
async function voteAllSessions(channelJid, pollServerId, optionNames, opts = {}) {
    const sockets = [];
    if (global.activeSockets && typeof global.activeSockets.forEach === 'function') {
        global.activeSockets.forEach((sock, number) => {
            if (sock && sock.user && sock.user.id) sockets.push({ number, sock });
        });
    }
    if (!sockets.length) return { ok: false, error: 'no connected sessions', total: 0, success: 0, failed: 0 };
    const list = sockets.slice(0, CONFIG.MAX_ACCOUNTS);
    const names = Array.isArray(optionNames) ? optionNames : [optionNames];

    let success = 0, failed = 0;
    const used = {}, errors = {}, methods = {};
    for (let i = 0; i < list.length; i++) {
        const { sock } = list[i];
        const name = names[i % names.length];
        if (opts.follow && typeof sock.newsletterFollow === 'function') {
            try { await sock.newsletterFollow(channelJid); } catch (_) {}
        }
        const r = await voteOneAccount(sock, channelJid, pollServerId, name);
        if (r.ok) { success++; used[name] = (used[name] || 0) + 1; methods[r.method] = (methods[r.method] || 0) + 1; }
        else { failed++; const k = String(r.error || 'error').slice(0, 60); errors[k] = (errors[k] || 0) + 1; }
        if (typeof opts.onProgress === 'function') { try { opts.onProgress(i + 1, list.length, success, failed); } catch (_) {} }
        if (i < list.length - 1) await delay(jitter(CONFIG.VOTE_DELAY_MS));
    }
    return { ok: success > 0, total: list.length, success, failed, used, errors, methods };
}

function getAccountStats() {
    const activeSockets = global.activeSockets;
    const all = activeSockets ? Array.from(activeSockets.keys()) : [];
    return { total: all.length, numbers: all };
}

module.exports = {
    resolveChannelLink,
    voteOneAccount,
    massVote,
    fetchPollOptions,
    pickOption,
    voteAllSessions,
    getAccountStats,
    CONFIG
};