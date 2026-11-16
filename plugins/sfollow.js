// plugins/sfollow.js
// .sfollow   <channel-link>  — every connected session follows the channel
// .sunfollow <channel-link>  — every connected session unfollows it
// (newsletterFollow / newsletterUnfollow are real WhatsApp channel calls.)

const { cmd } = require('../arslan');
const config = require('../config');
const reactor = require('../lib/reactor');

const withTimeout = (p, ms, label) => {
    let t;
    return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label + ' timeout')), ms); })]).finally(() => clearTimeout(t));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = base => base + Math.floor(Math.random() * base);   // base .. 2*base

async function run(kind, conn, mek, m, ctx) {
    const P = config.PREFIX || '.';
    const follow = kind === 'follow';
    const name = follow ? 'sfollow' : 'sunfollow';
    const q = (ctx.q || '').trim();
    const link = q.split(/\s+/).find(p => /whatsapp\.com\/channel\//i.test(p));

    if (!link) {
        const st = reactor.getConnectedSockets().length;
        return ctx.reply(
`${follow ? '➕' : '➖'} *${name.toUpperCase()} — All Sessions ${follow ? 'Follow' : 'Unfollow'}*

📌 Usage:
${P}${name} <channel-link>

Misal:
${P}${name} https://whatsapp.com/channel/0029VbBTSK1EquiWrUt5uV1I

🟢 Connected sessions: *${st}*
${follow ? `➖ Unfollow karne ke liye: ${P}sunfollow <link>` : `➕ Follow karne ke liye: ${P}sfollow <link>`}`
        );
    }

    const wait = reactor.massCooldown('f:' + ctx.from, 60000);
    if (wait) return ctx.reply(`⏳ ${wait} second baad dobara chalayein (account safety ke liye).`);

    const sessions = reactor.getConnectedSockets();
    if (!sessions.length) return ctx.reply('❌ Koi connected session nahi mila.');

    // find the channel JID (try this session first, then the others)
    let resolved = await reactor.resolveChannelLink(conn, link);
    if (!resolved.ok) {
        for (const s of sessions) {
            if (s.sock === conn) continue;
            resolved = await reactor.resolveChannelLink(s.sock, link);
            if (resolved.ok) break;
        }
    }
    if (!resolved.ok) return ctx.reply(`❌ Channel nahi mila: ${resolved.error}`);
    const jid = resolved.channelJid;

    const mins = Math.max(1, Math.round((sessions.length * 3) / 60));
    await ctx.reply(`⏳ *${follow ? 'Following' : 'Unfollowing'}...*\n👥 Sessions: ${sessions.length}\n📡 Channel: ${jid}\n🕒 Takriban ${mins} minute lagenge (sessions ke beech gap rakha hai).`);

    let ok = 0, already = 0, failed = 0;
    const errors = {};
    for (let i = 0; i < sessions.length; i++) {
        const { sock } = sessions[i];
        const fn = follow ? sock.newsletterFollow : sock.newsletterUnfollow;
        try {
            if (typeof fn !== 'function') throw new Error('not supported in this Baileys version');
            await withTimeout(fn.call(sock, jid), 20000, follow ? 'follow' : 'unfollow');
            ok++;
        } catch (e) {
            const msg = String(e.message || e);
            if (/already|subscribed|exist|not.?following|not.?a.?subscriber|no.?such/i.test(msg)) already++;
            else { failed++; const k = msg.slice(0, 60); errors[k] = (errors[k] || 0) + 1; }
        }
        if (i < sessions.length - 1) await sleep(jitter(1500));   // 1.5–3 s between sessions
    }

    let out =
`✅ *${name.toUpperCase()} DONE*

📡 Channel: ${jid}
👥 Sessions: ${sessions.length}
✅ ${follow ? 'Followed' : 'Unfollowed'}: ${ok}
↩️ ${follow ? 'Pehle se follow' : 'Pehle se unfollow'}: ${already}
❌ Failed: ${failed}`;
    if (failed) {
        const top = Object.entries(errors).slice(0, 3).map(([k, v]) => `• ${k} (${v})`).join('\n');
        out += `\n\n⚠️ Fail reasons:\n${top}`;
    }
    return ctx.reply(out);
}

for (const [pattern, alias, kind, react] of [
    ['sfollow', ['followall', 'allfollow', 'sessionfollow', 'massfollow', 'mf', 'bulkfollow'], 'follow', '➕'],
    ['sunfollow', ['unfollowall', 'allunfollow', 'sessionunfollow', 'massunfollow', 'muf', 'bulkunfollow'], 'unfollow', '➖']
]) {
    cmd({
        pattern,
        alias,
        desc: kind === 'follow' ? 'All sessions follow a channel' : 'All sessions unfollow a channel',
        category: 'general',
        react,
        use: `.${pattern} <channel-link>`,
        filename: __filename
    }, async (conn, mek, m, ctx) => {
        try { return await run(kind, conn, mek, m, ctx); }
        catch (e) { return ctx.reply(`⚠️ ${pattern} error: ` + String(e.message || e).slice(0, 200)); }
    });
}

console.log('[MR SAQIB MD] .sfollow / .sunfollow loaded');
