// plugins/svotes.js
// .svotes — bot se connected SAB sessions channel poll par vote karein
// Option: 1 / 2 / 3 ...  ya  A / B / C ...  ya  option ka naam

const { cmd } = require('../arslan');
const config = require('../config');
const voter = require('../lib/pollvoter');
const reactor = require('../lib/reactor');

cmd({
    pattern: 'svotes',
    alias: ['svote', 'allvote', 'sessionvotes', 'votesall', 'massvote', 'autovote'],
    desc: 'All connected sessions vote on a channel poll (1/2, A/B or name)',
    category: 'general',
    react: '🗳️',
    use: '.svotes <channel-poll-link> <1|2|A|B|name>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        return await handle(conn, mek, m, ctx);
    } catch (e) {
        return ctx.reply('⚠️ svotes error: ' + String(e.message || e).slice(0, 200));
    }
});

async function handle(conn, mek, m, ctx) {
    const P = config.PREFIX || '.';
    const q = (ctx.q || '').trim();

    if (!q) {
        const st = reactor.getAccountStats();
        return ctx.reply(
`🗳️ *SVOTES — All Sessions Vote*

📌 *Usage:*
${P}svotes <poll-link> 1        → sab sessions option 1
${P}svotes <poll-link> B        → sab sessions option B (2nd)
${P}svotes <poll-link> Ali      → option ka naam
${P}svotes <poll-link> 1 2      → sessions 1 aur 2 mein baant diye jayenge
${P}svotes <poll-link> A follow → pehle channel follow, phir vote
${P}svotes <poll-link> list     → poll ke options dekho

💡 1/2/3 ya A/B/C = poll ki tarteeb (pehla, doosra...)
💡 Agar bot options na padh paye to option ka *poora naam* likho

🟢 Connected sessions: *${st.total}*`
        );
    }

    const parts = q.split(/\s+/);
    const link = parts.find(p => /whatsapp\.com\/channel\//i.test(p));
    if (!link) return ctx.reply('❌ Valid channel poll link do.\nMisal: https://whatsapp.com/channel/XXXX/123');

    let rest = parts.filter(p => p !== link);
    const follow = rest.some(p => /^follow$/i.test(p));
    rest = rest.filter(p => !/^follow$/i.test(p));
    const wantList = rest.length === 1 && /^(list|options|opts)$/i.test(rest[0]);

    const sessions = reactor.getConnectedSockets();
    if (!sessions.length) return ctx.reply('❌ Koi connected session nahi mila.');
    { const w = reactor.massCooldown('v:' + ctx.from); if (w) return ctx.reply(`⏳ ${w} second baad dobara chalayein (account safety ke liye).`); }
    await ctx.reply('🔎 Poll dhoond raha hoon...');

    // resolve channel (try this session first, then the others)
    let resolved = await voter.resolveChannelLink(conn, link);
    if (!resolved.ok) {
        for (const s of sessions) {
            if (s.sock === conn) continue;
            resolved = await voter.resolveChannelLink(s.sock, link);
            if (resolved.ok) break;
        }
    }
    if (!resolved.ok) return ctx.reply(`❌ Channel resolve nahi hua: ${resolved.error}`);
    if (!resolved.serverId) return ctx.reply('❌ Link mein post number nahi hai.\nPoll *post* ka link do (…/channel/XXXX/123).');

    // read poll options (needed for 1/2/A/B)
    let poll = await voter.fetchPollOptions(conn, resolved.channelJid, resolved.serverId);
    if (!poll) {
        for (const s of sessions) {
            if (s.sock === conn) continue;
            poll = await voter.fetchPollOptions(s.sock, resolved.channelJid, resolved.serverId);
            if (poll) break;
        }
    }
    const options = poll ? poll.options : null;

    if (wantList) {
        if (!options) return ctx.reply('⚠️ Poll ke options padh nahi paya. Option ka poora naam likh kar vote karo.');
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return ctx.reply(
`📊 *POLL OPTIONS*${poll.name ? `\n❓ ${poll.name}` : ''}

${options.map((o, i) => `${i + 1} / ${letters[i] || '-'}  →  ${o}`).join('\n')}

Vote: ${P}svotes <link> 1`
        );
    }

    if (!rest.length) return ctx.reply(`❌ Option batao: 1, 2, A, B ya naam.\nMisal: ${P}svotes ${link} 1`);

    // Build the list of options to vote for
    let picks = [];
    if (options) {
        // each token = 1/2/A/B/name ; fall back to the whole text as one name
        for (const tok of rest) {
            const hit = voter.pickOption(tok, options);
            if (hit && !picks.includes(hit)) picks.push(hit);
        }
        if (!picks.length) {
            const whole = voter.pickOption(rest.join(' '), options);
            if (whole) picks.push(whole);
        }
        if (!picks.length) {
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            return ctx.reply(`❌ Ye option poll mein nahi mila.\n\n${options.map((o, i) => `${i + 1} / ${letters[i] || '-'}  →  ${o}`).join('\n')}`);
        }
    } else {
        // options unknown: only a real name can work (hash is made from the name)
        if (rest.every(t => /^(\d+|[a-z])$/i.test(t))) {
            return ctx.reply('⚠️ Poll ke options padh nahi paya, is liye 1/2/A/B nahi chalega.\nOption ka *poora naam* likho.\nMisal: ' + `${P}svotes ${link} Ali`);
        }
        picks = [rest.join(' ').replace(/^["']|["']$/g, '')];
    }

    await ctx.reply(
`⏳ *Voting...*
👥 Sessions: ${sessions.length}
🎯 Poll: #${resolved.serverId}
✅ Option: ${picks.join(' | ')}`
    );

    const res = await voter.voteAllSessions(resolved.channelJid, resolved.serverId, picks, { follow });

    if (!res.ok) {
        const why = Object.keys(res.errors || {})[0] || res.error || 'unknown';
        if (/not available/i.test(why)) {
            return ctx.reply(
`❌ *Channel poll par vote nahi ja sakta.*

🔧 Wajah: bot ki WhatsApp library (Baileys 7.0.0-rc14) mein channel poll vote bhejne ka tareeqa maujood hi nahi.

⚠️ Pehle jo "Success" aata tha wo galat tha: request chali jati thi lekin vote count nahi hota tha (aap ke screenshot mein poll 0 hi raha). Is ghalti ke liye maazrat.

✅ *Jo asal mein kaam karta hai:*
• ${P}sreacts <channel-post-link> ❤️ 🔥  → saare sessions reaction lagate hain
• Group mein reply karke ${P}sreacts sticker ❤️`
            );
        }
        return ctx.reply(`❌ Kisi session se vote nahi hua.\nReason: ${why}\n\n💡 Channel follow nahi kiya to \`${P}svotes <link> ${rest[0]} follow\` try karo.`);
    }

    const used = Object.entries(res.used).map(([o, n]) => `${o} ×${n}`).join('\n');
    let out =
`✅ *SVOTES DONE*

📡 Poll: #${resolved.serverId}
👥 Sessions: ${res.total}
✅ Success: ${res.success}
❌ Failed: ${res.failed}

${used}\n\n⚙️ Method: ${Object.entries(res.methods || {}).map(([k, v]) => k + ' ×' + v).join(', ') || '-'}\n\nℹ️ Success ka matlab: vote ki request bhej di gayi. Asal count poll mein khud check karein.`;
    if (res.failed) {
        const top = Object.entries(res.errors).slice(0, 2).map(([k, v]) => `• ${k} (${v})`).join('\n');
        out += `\n\n⚠️ Fail reasons:\n${top}`;
    }
    return ctx.reply(out);
}

console.log('[AMAN Mini Bot] .svotes loaded');
