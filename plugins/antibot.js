// AMAN-MD ANTIBOT — group me doosre bots ko rokta hai.
// .antibot on | off | kick | delete | status | check (kisi message par reply karke uska ID check karo)
//
// Kaise pehchanta hai: doosre bots ke message IDs ka pattern alag hota hai (Baileys wale bots
// "BAE5…" ya "3EB0…" se shuru hone wale lambe ID banate hain; asli phone/WhatsApp Web ke ID alag hote hain).
// Ye ek andaza (heuristic) hai, 100% nahi — isliye `.antibot check` se pehle test kar lo.
const { cmd } = require('../arslan');
const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'antibot.json');
fs.ensureDirSync(DATA_DIR);

let store = {};
try { if (fs.existsSync(DATA_FILE)) store = fs.readJsonSync(DATA_FILE) || {}; } catch (_) { store = {}; }
let saveTimer;
function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try { fs.writeJsonSync(DATA_FILE, store, { spaces: 2 }); } catch (e) { console.error('[ANTIBOT] save failed:', e.message); }
    }, 150);
}
function getCfg(jid) {
    if (!store[jid]) store[jid] = { enabled: false, action: 'kick' };
    const c = store[jid];
    if (!['kick', 'delete'].includes(c.action)) c.action = 'kick';
    return c;
}

// Doosre bot ke message ID ka pattern
function botIdReason(id) {
    const s = String(id || '');
    if (!s) return null;
    if (/^BAE5/i.test(s) && s.length === 16) return 'Baileys-style ID (BAE5…)';
    if (/^3EB0/i.test(s) && (s.length === 22 || s.length === 40)) return `Baileys-style ID (3EB0…, ${s.length} chars)`;
    return null;
}

const recentlyActed = new Map(); // same bot par baar baar action na ho

cmd({
    pattern: 'antibot',
    alias: ['antibots', 'botblock'],
    desc: 'Group me doosre bots ko block karo (on/off/kick/delete/status/check)',
    category: 'group',
    react: '🤖',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const { from, args, reply, isGroup, isAdmins, isOwner } = ctx;
    if (!isGroup) return reply('❌ Ye command sirf group me chalti hai.');
    const c = getCfg(from);
    const sub = String(args[0] || '').toLowerCase();

    if (!sub || sub === 'status') {
        return reply(
`🤖 *AMAN-MD ANTIBOT*

• Status: *${c.enabled ? 'ON ✅' : 'OFF ❌'}*
• Action: *${c.action === 'kick' ? 'DELETE + KICK' : 'SIRF DELETE'}*

*Commands*
• .antibot on / off
• .antibot kick  → bot ka message delete + bot ko group se nikalo
• .antibot delete  → sirf bot ka message delete
• .antibot check  → kisi message par reply karke likho, ID check hoga

⚠️ Bot ko group admin banana zaroori hai. Admins aur owner par ye lagu nahi hota.`);
    }

    if (sub === 'check') {
        const msg = mek.message || {};
        const inner = msg[Object.keys(msg)[0]] || {};
        const qid = (inner.contextInfo && inner.contextInfo.stanzaId) || '';
        if (!qid) return reply('↩️ Kisi message par reply karke `.antibot check` likho.');
        const why = botIdReason(qid);
        return reply(`🔎 *Message ID:* ${qid}\n📏 Length: ${qid.length}\n${why ? `🤖 *Bot lagta hai:* ${why}` : '👤 Normal user lagta hai (antibot ise nahi pakdega).'}`);
    }

    if (!isOwner && !isAdmins) return reply('❌ Sirf group admins antibot ki setting badal sakte hain.');

    if (sub === 'on' || sub === 'enable') {
        c.enabled = true; save();
        return reply(`✅ *Antibot ON.*\nAb is group me doosre bots ke messages ${c.action === 'kick' ? 'delete honge aur wo bot group se nikal diya jayega' : 'delete honge'}.\n⚠️ Bot ko group admin banana na bhoolo.`);
    }
    if (sub === 'off' || sub === 'disable') {
        c.enabled = false; save();
        return reply('✅ *Antibot OFF.*');
    }
    if (sub === 'kick' || sub === 'delete') {
        c.action = sub; c.enabled = true; save();
        return reply(sub === 'kick'
            ? '✅ *Antibot ON — DELETE + KICK.*\nBot ka message delete hoga aur bot group se nikal diya jayega.'
            : '✅ *Antibot ON — SIRF DELETE.*\nBot ke messages delete honge, bot group me rahega.');
    }
    return reply('❌ Use: `.antibot on|off|kick|delete|status|check`');
});

// Har group message par check (text ho ya media)
cmd({
    on: 'all',
    allowUnprefixedInGroups: true,
    dontAddCommandList: true,
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const { from, isGroup, sender, isAdmins, isOwner, isBotAdmins, isMe } = ctx;
    if (!isGroup || isMe || mek.key.fromMe) return;
    const c = store[from];
    if (!c || !c.enabled) return;
    if (isOwner || isAdmins) return;

    const reason = botIdReason(mek.key.id);
    if (!reason) return;
    if (!isBotAdmins) return; // admin nahi to kuch nahi kar sakte

    const user = sender || mek.key.participant || '';
    try { await conn.sendMessage(from, { delete: mek.key }); } catch (e) { console.error('[ANTIBOT] delete failed:', e.message); }

    if (c.action !== 'kick' || !user) return;
    const k = `${from}|${user}`;
    if (Date.now() - (recentlyActed.get(k) || 0) < 60000) return;
    recentlyActed.set(k, Date.now());
    if (recentlyActed.size > 300) recentlyActed.clear();

    try {
        await conn.groupParticipantsUpdate(from, [user], 'remove');
        await conn.sendMessage(from, {
            text: `🤖 @${String(user).split('@')[0]} bot lag raha tha (${reason}), isliye group se nikal diya gaya.\n🛡️ Is group me doosre bots allowed nahi.`,
            mentions: [user]
        });
    } catch (e) { console.error('[ANTIBOT] kick failed:', e.message); }
});
