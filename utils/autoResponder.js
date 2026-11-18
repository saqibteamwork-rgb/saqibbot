'use strict';

/**
 * MR SAQIB MD :: Custom Auto-Responder & Smart Trigger Engine
 * ============================================================================
 * Allows owner & authorized users to configure custom keyword/phrase triggers:
 *   .addreply <trigger> | <response>
 *   .delreply <trigger>
 *   .listreply
 *   .autoreply on / off
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'autoreply.json');

// In-memory state and anti-spam cooldown cache
let state = {
    globalEnabled: true,
    chats: {}, // jid -> { enabled: boolean }
    replies: []
};

const cooldowns = new Map(); // key: `${jid}:${triggerId}` -> timestamp

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const raw = fs.readFileSync(STATE_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            state = {
                globalEnabled: parsed.globalEnabled !== false,
                chats: parsed.chats || {},
                replies: Array.isArray(parsed.replies) ? parsed.replies : []
            };
        } else {
            // Seed with helpful friendly default triggers
            state = {
                globalEnabled: true,
                chats: {},
                replies: [
                    {
                        id: 'seed_salam',
                        trigger: 'salam',
                        response: 'Walaikum Assalam jani! Welcome to *MR SAQIB MD* ❤️\nType *.menu* for all commands.',
                        matchType: 'word',
                        hits: 0,
                        addedBy: 'MR SAQIB',
                        createdAt: Date.now()
                    },
                    {
                        id: 'seed_owner',
                        trigger: 'owner',
                        response: '👑 *MR SAQIB MD OWNER*\nName: Mr SAQIB\nNewsletter: https://whatsapp.com/channel/0029Vb4qJbC7Noa7UjO62V1i\nType *.owner* to view full contact card.',
                        matchType: 'word',
                        hits: 0,
                        addedBy: 'MR SAQIB',
                        createdAt: Date.now()
                    }
                ]
            };
            saveState();
        }
    } catch (e) {
        console.error('[AutoResponder Load Error]:', e.message);
    }
}

function saveState() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
        console.error('[AutoResponder Save Error]:', e.message);
    }
}

loadState();

/**
 * Checks whether auto-responder is active for a chat
 */
function isChatEnabled(jid) {
    if (!state.globalEnabled) return false;
    if (jid && state.chats[jid] && state.chats[jid].enabled === false) return false;
    return true;
}

/**
 * Sets enabled state for a specific chat or globally
 */
function setChatEnabled(jid, enabled) {
    if (!state.chats) state.chats = {};
    if (!state.chats[jid]) state.chats[jid] = {};
    state.chats[jid].enabled = Boolean(enabled);
    saveState();
}

function setGlobalEnabled(enabled) {
    state.globalEnabled = Boolean(enabled);
    saveState();
}

/**
 * Adds or updates a keyword trigger
 */
function addReply(trigger, response, addedBy = 'Owner', matchType = 'word') {
    const cleanTrigger = String(trigger || '').trim().toLowerCase();
    const cleanResponse = String(response || '').trim();

    if (!cleanTrigger || !cleanResponse) {
        throw new Error('Trigger aur response dono required hain!');
    }

    const existingIdx = state.replies.findIndex(r => r.trigger.toLowerCase() === cleanTrigger);
    const item = {
        id: existingIdx >= 0 ? state.replies[existingIdx].id : `reply_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        trigger: cleanTrigger,
        response: cleanResponse,
        matchType: matchType || 'word',
        hits: existingIdx >= 0 ? (state.replies[existingIdx].hits || 0) : 0,
        addedBy: String(addedBy || 'User'),
        updatedAt: Date.now()
    };

    if (existingIdx >= 0) {
        state.replies[existingIdx] = item;
    } else {
        state.replies.push(item);
    }

    saveState();
    return item;
}

/**
 * Deletes a keyword trigger by trigger name or index (1-based)
 */
function deleteReply(target) {
    const clean = String(target || '').trim().toLowerCase();
    let idx = -1;

    // Check if number
    const num = parseInt(clean, 10);
    if (!isNaN(num) && num >= 1 && num <= state.replies.length) {
        idx = num - 1;
    } else {
        idx = state.replies.findIndex(r => r.trigger.toLowerCase() === clean);
    }

    if (idx === -1) return null;
    const removed = state.replies.splice(idx, 1)[0];
    saveState();
    return removed;
}

/**
 * Gets all registered replies
 */
function getReplies() {
    return state.replies;
}

/**
 * Checks if incoming text matches any trigger and returns the response
 */
function findMatch(text) {
    if (!text || typeof text !== 'string') return null;
    const cleanText = text.trim().toLowerCase();
    if (!cleanText) return null;

    for (const item of state.replies) {
        const trig = item.trigger.toLowerCase();
        if (!trig) continue;

        let matched = false;
        if (item.matchType === 'exact') {
            matched = (cleanText === trig);
        } else {
            // Word boundary match (safe for single words or phrases)
            // Escapes regex specials
            const escaped = trig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(^|\\s|[.,!?;:])${escaped}($|\\s|[.,!?;:])`, 'i');
            matched = regex.test(cleanText);
        }

        if (matched) {
            return item;
        }
    }
    return null;
}

/**
 * Main message handler for Auto-Responder
 * Returns true if handled/replied, false otherwise
 */
async function handleMessage(sock, from, msg, text, isGroup = false, isMe = false) {
    // Strictly skip bot's own messages, status broadcasts, and newsletters
    if (isMe || !from || from === 'status@broadcast' || from.endsWith('@newsletter')) return false;

    // Check if autoresponder is active for this chat
    if (!isChatEnabled(from)) return false;

    // Do not trigger if text starts with command prefix (. ! / # ?)
    if (/^[.#!/?][a-zA-Z0-9]/.test(text.trim())) return false;

    const matchedItem = findMatch(text);
    if (!matchedItem) return false;

    // Anti-spam cooldown per chat per trigger (4 seconds)
    const cdKey = `${from}:${matchedItem.id}`;
    const lastTime = cooldowns.get(cdKey) || 0;
    const now = Date.now();
    if (now - lastTime < 4000) {
        return false;
    }
    cooldowns.set(cdKey, now);

    // Increment hit counter
    matchedItem.hits = (matchedItem.hits || 0) + 1;
    saveState();

    try {
        await sock.sendMessage(from, {
            text: matchedItem.response,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363431913895899@newsletter',
                    newsletterName: 'Mr SAQIB',
                    serverMessageId: 1
                }
            }
        }, { quoted: msg });
        return true;
    } catch (e) {
        console.error('[AutoResponder Send Error]:', e.message);
        return false;
    }
}

module.exports = {
    loadState,
    saveState,
    isChatEnabled,
    setChatEnabled,
    setGlobalEnabled,
    addReply,
    deleteReply,
    getReplies,
    findMatch,
    handleMessage,
    getState: () => state
};
