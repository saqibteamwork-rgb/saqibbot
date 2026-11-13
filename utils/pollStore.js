'use strict';

/**
 * ProBoy-MD / MR SAQIB MD :: Persistent WhatsApp Poll Store
 * Stores poll creation messages and their encryption keys (messageSecret)
 * for both in-chat polls (groups/DMs) and WhatsApp Channels (newsletters).
 */

const fs = require('fs');
const path = require('path');

const POLLS_FILE = path.join(__dirname, '..', 'data', 'polls.json');
const pollMap = new Map();

// Seed known channel poll 1432 for instant resolution
const KNOWN_SEEDS = [
    {
        id: '1432',
        serverId: '1432',
        remoteJid: '120363426969260431@newsletter',
        name: 'Hi',
        options: ['Assalamualaikum', 'Ws'],
        selectableOptionsCount: 1,
        timestamp: Date.now()
    }
];

// Load existing polls from disk
function loadPolls() {
    try {
        // First insert known seeds
        for (const item of KNOWN_SEEDS) {
            pollMap.set(item.id, item);
            pollMap.set(`${item.remoteJid}/${item.serverId}`, item);
        }

        if (fs.existsSync(POLLS_FILE)) {
            const data = JSON.parse(fs.readFileSync(POLLS_FILE, 'utf8'));
            for (const item of data) {
                if (item && item.id) {
                    pollMap.set(item.id, item);
                    if (item.serverId) {
                        pollMap.set(String(item.serverId), item);
                    }
                    if (item.remoteJid && item.serverId) {
                        pollMap.set(`${item.remoteJid}/${item.serverId}`, item);
                    }
                }
            }
            console.log(`[PollStore] Loaded ${pollMap.size} cached polls from disk.`);
        }
    } catch (err) {
        console.error('[PollStore] Failed to load polls:', err.message);
    }
}

// Save polls to disk (debounced)
let saveTimeout = null;
function persistPolls() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        try {
            const items = Array.from(new Set(pollMap.values())).slice(-500); // keep last 500 polls
            fs.writeFileSync(POLLS_FILE, JSON.stringify(items, null, 2));
        } catch (err) {
            console.error('[PollStore] Failed to persist polls:', err.message);
        }
    }, 1500);
}

// Universal helper to extract poll question & options from any WhatsApp message or newsletter poll snapshot
function extractPollFromMessageObject(m, depth = 0) {
    if (!m || typeof m !== 'object' || depth > 5) return null;

    // 1. Check direct PollCreationMessage variants (options: [{ optionName }])
    const directCandidates = [
        m.pollCreationMessage,
        m.pollCreationMessageV2,
        m.pollCreationMessageV3,
        m.pollCreationMessageV5,
        m.pollCreationMessageV4?.message?.pollCreationMessage,
        m.pollCreationMessageV4?.message?.pollCreationMessageV2,
        m.pollCreationMessageV4?.message?.pollCreationMessageV3,
        m.pollCreationMessageV4?.message?.pollCreationMessageV5,
        m.pollCreationOptionImageMessage?.message?.pollCreationMessage,
        m.pollCreationOptionImageMessage?.message?.pollCreationMessageV2,
        m.pollCreationOptionImageMessage?.message?.pollCreationMessageV3,
        m.pollCreationOptionImageMessage?.message?.pollCreationMessageV5
    ];

    for (const c of directCandidates) {
        if (c && Array.isArray(c.options) && c.options.length > 0) {
            const options = c.options.map(opt => typeof opt === 'string' ? opt : (opt?.optionName || '')).filter(Boolean);
            if (options.length > 0) {
                return {
                    name: c.name || 'Poll',
                    options,
                    selectableOptionsCount: c.selectableOptionsCount || 1
                };
            }
        }
    }

    // 2. Check Newsletter / Channel PollResultSnapshotMessage variants (pollVotes: [{ optionName, optionVoteCount }])
    const snapshotCandidates = [
        m.pollResultSnapshotMessage,
        m.pollResultSnapshotMessageV3,
        m.pollCreationMessageV4?.message?.pollResultSnapshotMessage,
        m.pollCreationMessageV4?.message?.pollResultSnapshotMessageV3
    ];

    for (const s of snapshotCandidates) {
        if (s && Array.isArray(s.pollVotes) && s.pollVotes.length > 0) {
            const options = s.pollVotes.map(v => typeof v === 'string' ? v : (v?.optionName || '')).filter(Boolean);
            if (options.length > 0) {
                return {
                    name: s.name || 'Channel Poll',
                    options,
                    selectableOptionsCount: 1
                };
            }
        }
    }

    // 3. Check if m itself has options or pollVotes
    if (Array.isArray(m.options) && m.options.length > 0) {
        const options = m.options.map(opt => typeof opt === 'string' ? opt : (opt?.optionName || '')).filter(Boolean);
        if (options.length > 0) {
            return { name: m.name || 'Poll', options, selectableOptionsCount: m.selectableOptionsCount || 1 };
        }
    }
    if (Array.isArray(m.pollVotes) && m.pollVotes.length > 0) {
        const options = m.pollVotes.map(v => typeof v === 'string' ? v : (v?.optionName || '')).filter(Boolean);
        if (options.length > 0) {
            return { name: m.name || 'Channel Poll', options, selectableOptionsCount: 1 };
        }
    }

    // 4. Unwrap FutureProof / Ephemeral / ViewOnce / Edited wrappers recursively
    const wrappers = [
        m.ephemeralMessage?.message,
        m.viewOnceMessage?.message,
        m.viewOnceMessageV2?.message,
        m.viewOnceMessageV2Extension?.message,
        m.documentWithCaptionMessage?.message,
        m.editedMessage?.message,
        m.associatedChildMessage?.message,
        m.pollCreationMessageV4?.message,
        m.pollCreationOptionImageMessage?.message,
        m.message
    ];
    for (const w of wrappers) {
        if (w && typeof w === 'object' && w !== m) {
            const found = extractPollFromMessageObject(w, depth + 1);
            if (found) return found;
        }
    }

    return null;
}

// Save poll message from incoming upsert or channel fetch
function savePollMessage(msg) {
    if (!msg || !msg.message || !msg.key) return null;

    const mContent = msg.message.ephemeralMessage?.message 
        || msg.message.viewOnceMessage?.message 
        || msg.message.viewOnceMessageV2?.message 
        || msg.message.documentWithCaptionMessage?.message 
        || msg.message;

    const extracted = extractPollFromMessageObject(msg.message);
    if (!extracted || !extracted.options || !extracted.options.length) return null;

    const rawSecret = mContent?.messageContextInfo?.messageSecret 
        || msg.message?.messageContextInfo?.messageSecret;

    let secretBase64 = null;
    if (rawSecret) {
        secretBase64 = Buffer.isBuffer(rawSecret) ? rawSecret.toString('base64') : Buffer.from(rawSecret).toString('base64');
    }

    const options = extracted.options;
    const isNewsletter = String(msg.key.remoteJid || '').endsWith('@newsletter');
    const serverId = msg.key.server_id
        || msg.server_id
        || msg.messageServerId
        || msg.newsletterServerId
        || (isNewsletter && /^\d+$/.test(String(msg.key.id || '')) ? String(msg.key.id) : null);
    const msgId = msg.key.id || (serverId ? String(serverId) : null);

    if (!msgId) return null;

    const record = {
        id: msgId,
        serverId: serverId ? String(serverId) : null,
        remoteJid: msg.key.remoteJid,
        participant: msg.key.participant || msg.participant || msg.key.remoteJid,
        fromMe: Boolean(msg.key.fromMe),
        name: extracted.name || 'Poll',
        options,
        selectableOptionsCount: extracted.selectableOptionsCount || 1,
        secretBase64,
        timestamp: Date.now()
    };

    pollMap.set(msgId, record);
    if (serverId) {
        pollMap.set(String(serverId), record);
        if (record.remoteJid) {
            pollMap.set(`${record.remoteJid}/${serverId}`, record);
        }
    }
    persistPolls();
    console.log(`[PollStore] 🗳️ Saved poll "${record.name}" (${record.id}) - Options: [${options.join(', ')}]`);
    return record;
}

// Manual register or cache a poll
function registerPoll(id, data) {
    if (!id || !data) return;
    const record = {
        id: String(id),
        serverId: data.serverId ? String(data.serverId) : String(id),
        remoteJid: data.remoteJid || null,
        name: data.name || 'Poll',
        options: data.options || [],
        timestamp: Date.now()
    };
    pollMap.set(String(id), record);
    if (record.remoteJid && record.serverId) {
        pollMap.set(`${record.remoteJid}/${record.serverId}`, record);
    }
    persistPolls();
    return record;
}

// Retrieve poll by message ID, server ID, or JID/serverId
function getPoll(pollId, jid = null) {
    if (!pollId) return null;
    let record = null;
    if (jid) {
        record = pollMap.get(`${jid}/${pollId}`);
    }
    if (!record) {
        record = pollMap.get(String(pollId));
    }
    if (!record) return null;

    return {
        ...record,
        secret: record.secretBase64 ? Buffer.from(record.secretBase64, 'base64') : null
    };
}

loadPolls();

module.exports = {
    extractPollFromMessageObject,
    savePollMessage,
    registerPoll,
    getPoll,
    pollMap
};
