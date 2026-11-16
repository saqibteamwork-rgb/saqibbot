// plugins/chpoll.js
// CHPOLL — vote on WhatsApp channel polls (Baileys direct)

const { cmd } = require('../arslan');
const voter = require('../lib/pollvoter');

// ═══════════════════════════════════════════
//  .chpoll — vote from one account
// ═══════════════════════════════════════════
cmd({
    pattern: 'chpoll',
    alias: ['cpoll', 'pollvote', 'channelpoll'],
    desc: 'Vote on a WhatsApp channel poll',
    category: 'general',
    react: '🗳️',
    filename: __filename
},
async (conn, mek, m, { args, reply }) => {
    try {
        if (args.length < 2) {
            return reply(
`🗳️ *CHPOLL — Channel Poll Vote*

📌 *Usage:* .chpoll <link> <option>

📖 *Examples:*
.chpoll https://whatsapp.com/channel/0029VbBTSK1EquiWrUt5uV1I/1673 "Yes"
.chpoll https://whatsapp.com/channel/0029VbBTSK1EquiWrUt5uV1I/1673 "Option A"

💡 Option name wahi likho jo poll mein hai
🔗 Baileys direct — no API key`
            );
        }

        const link = args[0];
        const option = args.slice(1).join(' ').replace(/^["']|["']$/g, '');

        if (!link.includes('whatsapp.com/channel/')) {
            return reply('❌ *Invalid channel link!*');
        }

        await reply(`🗳️ *Voting...*\n📡 \`...${link.split('/').slice(-2).join('/')}\`\n✅ Option: *${option}*`);

        const resolved = await voter.resolveChannelLink(conn, link);
        if (!resolved.ok || !resolved.serverId) {
            return reply(`❌ *Resolve failed:* ${resolved.error || 'missing serverId'}`);
        }

        const result = await voter.voteOneAccount(
            conn,
            resolved.channelJid,
            resolved.serverId,
            option
        );

        if (result.ok) {
            return reply(
`✅ *VOTE SENT*
📡 Channel : \`${resolved.channelJid.split('@')[0].slice(0, 20)}...\`
🎯 Poll    : #${resolved.serverId}
✅ Option  : *${option}*
🔧 Method  : \`${result.method}\``
            );
        } else {
            return reply(`⚠️ *Failed:* ${result.error}`);
        }

    } catch (err) {
        return reply(`❌ ${err.message}`);
    }
});

// ═══════════════════════════════════════════
//  .masspoll — all accounts vote
// ═══════════════════════════════════════════
cmd({
    pattern: 'masspoll',
    alias: ['mpoll', 'bulkvote', 'voteall'],
    desc: 'Vote on channel poll from ALL connected accounts',
    category: 'general',
    react: '⚡',
    filename: __filename
},
async (conn, mek, m, { from, args, reply }) => {
    try {
        if (args.length < 2) {
            const stats = voter.getAccountStats();
            return reply(
`⚡ *MASSPOLL — Multi-Account Vote*

📊 Connected: \`${stats.total}\` accounts

📌 *Usage:* .masspoll <link> <option>

📖 *Example:*
.masspoll https://whatsapp.com/channel/0029VbBTSK1EquiWrUt5uV1I/1673 "Yes"

💡 Saare accounts se vote karega
📈 Max votes = ${stats.total}`
            );
        }

        const link = args[0];
        const option = args.slice(1).join(' ').replace(/^["']|["']$/g, '');

        if (!link.includes('whatsapp.com/channel/')) {
            return reply('❌ *Invalid channel link!*');
        }

        const stats = voter.getAccountStats();
        if (stats.total === 0) {
            return reply('❌ *Koi account connected nahi.*');
        }

        await reply(
`⚡ *MASSPOLL*
📊 Accounts: \`${stats.total}\`
✅ Option  : *${option}*
⚡ Voting...`
        );

        const resolved = await voter.resolveChannelLink(conn, link);
        if (!resolved.ok || !resolved.serverId) {
            return reply(`❌ *Resolve failed:* ${resolved.error || 'missing serverId'}`);
        }

        let lastPct = 0;
        const result = await voter.massVote(
            resolved.channelJid,
            resolved.serverId,
            option,
            (done, total, success, failed) => {
                const pct = Math.floor((done / total) * 100);
                if (pct >= lastPct + 25) {
                    lastPct = pct;
                    conn.sendMessage(from, {
                        text: `⏳ ${pct}% — ✅ ${success} ❌ ${failed}`
                    }).catch(() => {});
                }
            }
        );

        if (result.ok) {
            const methodBreakdown = result.methods
                ? Object.entries(result.methods).map(([k, v]) => `${k}: ${v}`).join(', ')
                : 'n/a';
            return reply(
`✅ *MASSPOLL COMPLETE*
📡 Channel : \`${resolved.channelJid.split('@')[0].slice(0, 20)}...\`
🎯 Poll    : #${resolved.serverId}
✅ Option  : *${option}*
📊 Total   : \`${result.total}\`
✅ Success : \`${result.success}\`
❌ Failed  : \`${result.failed}\`
🔧 Methods : \`${methodBreakdown}\``
            );
        } else {
            return reply(`⚠️ *Failed:* ${result.error}`);
        }

    } catch (err) {
        return reply(`❌ ${err.message}`);
    }
});

// ═══════════════════════════════════════════
//  .pollstats — connected accounts
// ═══════════════════════════════════════════
cmd({
    pattern: 'pollstats',
    alias: ['votestats'],
    desc: 'Show connected accounts for poll voting',
    category: 'general',
    react: '📊',
    filename: __filename
},
async (conn, mek, m, { reply }) => {
    const stats = voter.getAccountStats();
    return reply(
`📊 *POLL VOTE STATS*

🔢 Active accounts: \`${stats.total}\`
📈 Max votes/poll: \`${stats.total}\`

${stats.numbers.length ? stats.numbers.map((n, i) => `${i + 1}. \`${n.slice(0, 4)}***${n.slice(-2)}\``).join('\n') : '_(none connected)_'}`
    );
});