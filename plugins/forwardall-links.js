// plugins/forwardall-links.js
// .forwardall <link ya text>   -> aap ke SAB groups + un SAB channels mein jin mein aap admin ho, ek ke baad ek bhej deta hai
// .forwardall (kisi message par reply)  -> wo message forward hota hai
// .forwardall stop             -> chalta hua forward rok do
//
// Channels: Baileys se wo channels khud utha leta hai jin mein aap OWNER/ADMIN ho.
//
// Safety: sirf isi (aap ke) account ke groups/channels mein jata hai, har bhejne ke beech 4-9 second ka random gap,
// announce-only groups jahan aap admin nahi wahan skip, ek run mein max 300 chats. Zyada tez / zyada groups = WhatsApp ban ka khatra.
// Env: FORWARDALL_DELAY_MIN / FORWARDALL_DELAY_MAX (ms), FORWARDALL_MAX

const { cmd } = require('../arslan');

const DELAY_MIN = Number(process.env.FORWARDALL_DELAY_MIN) || 4000;
const DELAY_MAX = Math.max(DELAY_MIN, Number(process.env.FORWARDALL_DELAY_MAX) || 9000);
const MAX_TARGETS = Number(process.env.FORWARDALL_MAX) || 300;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const botKey = (conn) => String((conn.user && conn.user.id) || 'default').split(':')[0].split('@')[0];
const bare = (jid) => String(jid || '').split('@')[0].split(':')[0];

// Channels jin mein aap admin/owner ho
async function adminChannels(conn) {
    const found = new Map();
    for (const fn of ['newsletterSubscribed', 'newsletterFetchAllParticipating', 'newsletterFetchAllSubscribe']) {
        if (typeof conn[fn] !== 'function') continue;
        try {
            const r = await conn[fn]();
            const list = Array.isArray(r) ? r : Object.values(r || {});
            for (const c of list) {
                const jid = c && (c.id || c.jid);
                const role = (c && ((c.viewer_metadata && c.viewer_metadata.role) || (c.viewerMetadata && c.viewerMetadata.role) || c.role)) || '';
                if (String(jid || '').endsWith('@newsletter') && (!role || /OWNER|ADMIN/i.test(String(role)))) {
                    found.set(jid, (c.thread_metadata && c.thread_metadata.name && c.thread_metadata.name.text) || c.name || jid);
                }
            }
            break;
        } catch (e) { console.warn(`[FORWARDALL] ${fn} failed:`, e && e.message); }
    }
    return found;
}

// Groups jahan aap bhej sakte ho (announce-only mein sirf admin)
async function sendableGroups(conn) {
    const chats = await conn.groupFetchAllParticipating();
    const me = [bare(conn.user && conn.user.id), bare(conn.user && conn.user.lid)].filter(Boolean);
    const ok = [];
    let skipped = 0;
    for (const [jid, g] of Object.entries(chats || {})) {
        if (g && g.announce) {
            const mine = (g.participants || []).find(p => me.includes(bare(p.id)) || me.includes(bare(p.lid)) || me.includes(bare(p.jid)));
            if (!(mine && mine.admin)) { skipped++; continue; }
        }
        ok.push(jid);
    }
    return { groups: ok, skipped };
}

const running = new Map();   // bot -> { stop: bool }

async function runForward(conn, from, payloadFor, targets, skipped) {
    const key = botKey(conn);
    const state = { stop: false };
    running.set(key, state);
    let sent = 0, failed = 0, i = 0;
    try {
        for (const t of targets) {
            if (state.stop) break;
            i++;
            try { await conn.sendMessage(t.jid, payloadFor()); sent++; }
            catch (e) { failed++; console.warn('[FORWARDALL] failed', t.jid, e && e.message); }
            if (i < targets.length && !state.stop) await sleep(DELAY_MIN + Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN + 1)));
        }
    } finally { running.delete(key); }
    const left = targets.length - i;
    const txt = `${state.stop ? '🛑 *Forward roka gaya*' : '✅ *Forward mukammal*'}\n\n📤 Sent: *${sent}*\n❌ Failed: *${failed}*` +
        (skipped ? `\n⏭️ Skipped (announce-only, admin nahi): *${skipped}*` : '') + (left > 0 && state.stop ? `\n⏸️ Baqi: *${left}*` : '');
    try { await conn.sendMessage(from, { text: txt }); } catch (_) {}
}

cmd({
    pattern: 'forwardall',
    alias: ['fwdall'],
    desc: 'Link/message ko apne sab groups aur admin channels mein bhejo',
    category: 'owner',
    use: '.forwardall <link>  |  reply + .forwardall  |  .forwardall stop',
    react: '↗️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const { from, args, isCreator, reply } = ctx;
    if (!isCreator) return reply('⛔ Sirf bot owner.');

    const first = String(args[0] || '').toLowerCase();
    if (first === 'stop' || first === 'cancel') {
        const st = running.get(botKey(conn));
        if (!st) return reply('ℹ️ Abhi koi forward nahi chal raha.');
        st.stop = true;
        return reply('🛑 Rok raha hoon… (agla message jaane ke baad ruk jayega)');
    }
    if (running.has(botKey(conn))) return reply('⏳ Pehle wala forward abhi chal raha hai. Rokne ke liye `.forwardall stop`');

    // kya bhejna hai: link/text ya reply kiya hua message
    const ctxInfo = mek.message && mek.message.extendedTextMessage && mek.message.extendedTextMessage.contextInfo;
    const quoted = ctxInfo && ctxInfo.quotedMessage;
    const text = args.join(' ').trim();
    let payloadFor;
    if (text) {
        payloadFor = () => ({ text });
    } else if (quoted) {
        const qkey = { remoteJid: from, id: ctxInfo.stanzaId, participant: ctxInfo.participant, fromMe: false };
        payloadFor = () => ({ forward: { key: qkey, message: quoted } });
    } else {
        return reply('❌ Aise use karo:\n`.forwardall <channel post link>`\nya kisi message par reply karke `.forwardall`\nRokne ke liye: `.forwardall stop`');
    }

    let groups = [], skipped = 0, channels = new Map();
    try { ({ groups, skipped } = await sendableGroups(conn)); } catch (e) { console.warn('[FORWARDALL] groups:', e && e.message); }
    try { channels = await adminChannels(conn); } catch (e) { console.warn('[FORWARDALL] channels:', e && e.message); }

    let targets = [...groups.map(jid => ({ jid, kind: 'group' })), ...[...channels.keys()].map(jid => ({ jid, kind: 'channel' }))];
    let capped = 0;
    if (targets.length > MAX_TARGETS) { capped = targets.length - MAX_TARGETS; targets = targets.slice(0, MAX_TARGETS); }
    if (!targets.length) return reply('❌ Koi group ya admin channel nahi mila.');

    const mins = Math.ceil(targets.length * ((DELAY_MIN + DELAY_MAX) / 2) / 60000);
    await reply(
        `📤 *Forward shuru*\n👥 Groups: *${groups.length}*\n📢 Channels (admin): *${channels.size}*\n⏱️ Andaza: ~*${mins}* minute\n` +
        (capped ? `⚠️ ${capped} chats limit ki wajah se chhod diye (max ${MAX_TARGETS}).\n` : '') +
        '\nRokne ke liye: `.forwardall stop`'
    );
    runForward(conn, from, payloadFor, targets, skipped).catch(e => console.error('[FORWARDALL]', e));   // background
});

module.exports = { adminChannels, sendableGroups };
