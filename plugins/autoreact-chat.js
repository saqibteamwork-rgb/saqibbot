// plugins/autoreact-chat.js
// Chat / group ke har message par (aapke apne aur dusron ke) automatic random emoji reaction.
//   .autoreact on   -> chalu
//   .autoreact off  -> band
//   .autoreact      -> abhi ki setting
// Alias: .autoreacts  .areact   (sirf owner)
// Setting data/autoreact.json mein save hoti hai (MongoDB ki zaroorat nahi).

const fs = require('fs');
const path = require('path');
const { cmd } = require('../arslan');

const FILE = path.join(__dirname, '..', 'data', 'autoreact.json');
const EMOJIS = ['❤️', '😍', '🔥', '👍', '😂', '🥰', '✨', '💯', '😎', '🤩', '🙏', '😊', '💖', '🎉'];
const COOLDOWN_MS = 0;         // 0 = har message par react. Busy group me spam lage to 2000-4000 kar do (ms)
const REACT_TO_COMMANDS = true; // true = .commands par bhi react (false = commands par nahi)

function loadAll() {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (_) { return {}; }
}
function saveAll(all) {
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
        return true;
    } catch (e) { console.error('[AUTOREACT] save failed:', e.message); return false; }
}

const botKey = (conn) => String((conn.user && conn.user.id) || 'default').split(':')[0].split('@')[0];
const isOn = (conn) => loadAll()[botKey(conn)] === true;
function setOn(conn, value) {
    const all = loadAll();
    all[botKey(conn)] = !!value;
    return saveAll(all);
}

const lastReact = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SKIP_TYPES = new Set(['reactionMessage', 'protocolMessage', 'senderKeyDistributionMessage', 'pollUpdateMessage', 'keepInChatMessage']);

// main.js har aane wale message par ise bulata hai
async function maybeAutoReact(conn, mek, info = {}) {
    try {
        if (!isOn(conn)) return;
        const from = mek.key.remoteJid || '';
        if (!from || from === 'status@broadcast' || from.endsWith('@newsletter') || from.endsWith('@broadcast')) return;
        // Aapke apne messages (phone se) par bhi react hoga. Sirf bot ke khud ke bheje hue messages
        // (bot-style ID: 3EB0… / BAE5…) par nahi, warna bot apne hi jawab par react karta rahega.
        if (mek.key.fromMe && /^(3EB0|BAE5)/i.test(String(mek.key.id || ''))) return;
        if (info.isCmd && !REACT_TO_COMMANDS) return;
        const type = info.type || Object.keys(mek.message || {})[0];
        if (!type || SKIP_TYPES.has(type)) return;

        if (COOLDOWN_MS > 0) {
            const now = Date.now();
            if (now - (lastReact.get(from) || 0) < COOLDOWN_MS) return;
            lastReact.set(from, now);
            if (lastReact.size > 500) lastReact.delete(lastReact.keys().next().value);
        }

        await sleep(400 + Math.floor(Math.random() * 900));
        const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
        await conn.sendMessage(from, { react: { text: emoji, key: mek.key } });
    } catch (e) {
        console.warn('[AUTOREACT]', e && e.message);
    }
}

cmd({
    pattern: 'autoreact',
    alias: ['autoreacts', 'areact'],
    desc: 'Har message par random emoji auto reaction on/off',
    category: 'settings',
    use: '.autoreact on | off',
    filename: __filename
}, async (conn, mek, m, { args, isCreator, reply }) => {
    if (!isCreator) return reply('*YEH COMMAND SIRF BOT OWNER KE LIYE HAI 😎*');
    const a0 = String(args[0] || '').toLowerCase();

    if (a0 === 'on' || a0 === 'true') {
        return setOn(conn, true) ? reply('✅ *AutoReact ON*\nAb har message par random emoji react hoga.') : reply('❌ Setting save nahi hui.');
    }
    if (a0 === 'off' || a0 === 'false') {
        return setOn(conn, false) ? reply('✅ *AutoReact OFF*') : reply('❌ Setting save nahi hui.');
    }
    return reply(`*AUTOREACT:* ${isOn(conn) ? 'ON ✅' : 'OFF ❌'}\n\n\`.autoreact on\`\n\`.autoreact off\``);
});

module.exports = { maybeAutoReact };
