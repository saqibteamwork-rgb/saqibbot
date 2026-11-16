// lib/antidelete.js
// Anti-delete: jab koi "delete for everyone" kare to bot recover karke bhej deta hai.
//   .antidelete on   -> usi chat mein alert + wapas message
//   .antidelete dm   -> sirf aap (owner) ke apne DM mein
//   .antidelete off  -> band
// Setting data/antidelete.json mein (MongoDB ki zaroorat nahi), har bot number ki apni.
// NOTE: sirf wahi messages recover hote hain jo bot ne online rehte hue dekhe (har chat ke aakhri 200 messages).

const fs = require('fs');
const path = require('path');
const config = require('../config');

const FILE = path.join(__dirname, '..', 'data', 'antidelete.json');
const botKey = conn => String((conn && conn.user && conn.user.id) || 'default').split(':')[0].split('@')[0];

function loadAll() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (_) { return {}; } }
function getMode(conn) {
    const m = loadAll()[botKey(conn)];
    return m === 'on' || m === 'dm' ? m : 'off';
}
function setMode(conn, mode) {
    try {
        const all = loadAll();
        all[botKey(conn)] = mode;
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
        return true;
    } catch (e) { console.error('[ANTIDELETE] save failed:', e.message); return false; }
}

const handled = new Set();

const isRevokeUpdate = (upd) => {
    if (!upd) return false;
    if (upd.messageStubType === 1 || upd.messageStubType === 'REVOKE') return true;          // Baileys: WAMessageStubType.REVOKE
    const pm = upd.message && upd.message.protocolMessage;
    return !!(pm && (pm.type === 0 || pm.type === 'REVOKE'));
};

function plainText(msg) {
    const m = (msg && msg.message) || {};
    return m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) ||
        (m.imageMessage && m.imageMessage.caption) || (m.videoMessage && m.videoMessage.caption) || '';
}

const handleAntidelete = async (conn, updates, store) => {
    const mode = getMode(conn);
    if (mode === 'off' || !store) return;

    for (const u of updates || []) {
        try {
            if (!u || !u.key || !isRevokeUpdate(u.update)) continue;
            const chatId = u.key.remoteJid;
            if (!chatId || chatId === 'status@broadcast' || chatId.endsWith('@newsletter')) continue;
            const dedupe = chatId + '|' + u.key.id;
            if (handled.has(dedupe)) continue;
            handled.add(dedupe);
            if (handled.size > 1000) handled.delete(handled.values().next().value);

            const orig = await store.loadMessage(chatId, u.key.id);
            if (!orig || !orig.message || orig.key.fromMe) continue;            // dekha hi nahi / apna hi message

            const sender = orig.key.participant || orig.participant || chatId;
            const senderNum = String(sender).split('@')[0].split(':')[0];
            const isGroup = chatId.endsWith('@g.us');
            const ownerJid = String(conn.user.id).split(':')[0].split('@')[0] + '@s.whatsapp.net';
            const target = mode === 'dm' ? ownerJid : chatId;

            const where = isGroup ? `\n💬 *Group:* ${chatId.split('@')[0]}` : '';
            const alertText = `🚫 *ANTI-DELETE* 🚫\n👤 *User:* @${senderNum}${where}\n📅 *Date:* ${new Date().toLocaleString()}\n> ${config.BOT_FOOTER || ''}`;
            await conn.sendMessage(target, { text: alertText, mentions: [sender] });
            try {
                await conn.sendMessage(target, { forward: orig }, target === chatId ? { quoted: orig } : {});
            } catch (e) {
                const t = plainText(orig);
                if (t) await conn.sendMessage(target, { text: `📝 ${t}` });
                else console.warn('[ANTIDELETE] forward failed:', e && e.message);
            }
        } catch (e) { console.error('Antidelete Error:', e && e.message); }
    }
};

module.exports = { handleAntidelete, getMode, setMode, isRevokeUpdate };
