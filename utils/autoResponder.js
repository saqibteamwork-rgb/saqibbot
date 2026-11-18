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
            const rawReplies = Array.isArray(parsed.replies) ? parsed.replies : [];
            // Strictly exclude any seed_ triggers so no unwanted triggers persist
            const cleanReplies = rawReplies.filter(r => !String(r.id || '').startsWith('seed_') && r.trigger !== 'owner' && r.trigger !== 'salam');
            state = {
                globalEnabled: parsed.globalEnabled !== false,
                chats: parsed.chats || {},
                replies: cleanReplies
            };
        } else {
            // Fresh state: Start completely clean with zero unwanted default triggers
            state = {
                globalEnabled: true,
                chats: {},
                replies: []
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
function addReply(trigger, response, addedBy = 'Owner', matchType = 'exact') {
    const cleanTrigger = String(trigger || '').trim().toLowerCase().replace(/^[\s.,!?;:~`'"*#_-]+|[\s.,!?;:~`'"*#_-]+$/g, '');
    const cleanResponse = String(response || '').trim();

    if (!cleanTrigger || !cleanResponse) {
        throw new Error('Trigger aur response dono required hain!');
    }

    const existingIdx = state.replies.findIndex(r => r.trigger.toLowerCase() === cleanTrigger);
    const item = {
        id: existingIdx >= 0 ? state.replies[existingIdx].id : `reply_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        trigger: cleanTrigger,
        response: cleanResponse,
        matchType: matchType || 'exact',
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
 * Clears all custom auto-replies
 */
function clearAllReplies() {
    const count = state.replies.length;
    state.replies = [];
    saveState();
    return count;
}

/**
 * Deletes a keyword trigger by trigger name or index (1-based), or clears all
 */
function deleteReply(target) {
    const clean = String(target || '').trim().toLowerCase();
    if (!clean) return null;
    if (clean === 'all' || clean === 'clear' || clean === 'reset') {
        const count = clearAllReplies();
        return { count, all: true };
    }
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
 * Checks if incoming text matches any trigger and returns the response.
 * Strictly prevents triggering on long normal conversation sentences!
 */
function findMatch(text) {
    if (!text || typeof text !== 'string') return null;
    const rawClean = text.trim().toLowerCase();
    const cleanText = rawClean.replace(/^[\s.,!?;:~`'"*#_-]+|[\s.,!?;:~`'"*#_-]+$/g, '').trim();
    if (!cleanText) return null;

    const words = cleanText.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    for (const item of state.replies) {
        const trig = String(item.trigger || '').trim().toLowerCase().replace(/^[\s.,!?;:~`'"*#_-]+|[\s.,!?;:~`'"*#_-]+$/g, '').trim();
        if (!trig) continue;

        let matched = false;

        // Exact match (highest priority): whole message text equals the trigger
        if (cleanText === trig) {
            matched = true;
        } else if (item.matchType === 'word') {
            // SAFE WORD MATCH:
            // NEVER match if the message is a long sentence/conversation (more than 3 words)
            // This prevents normal chatting messages from accidentally triggering!
            if (wordCount <= 3) {
                const escaped = trig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(^|\\s)${escaped}($|\\s)`, 'i');
                matched = regex.test(cleanText);
            }
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
    clearAllReplies,
    addReply,
    deleteReply,
    getReplies,
    findMatch,
    handleMessage,
    getState: () => state
};
