// plugins/massfollow.js
// MR SAQIB MD — Mass channel follow (all connected accounts)

const { cmd } = require('../arslan');

// ═══════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════
const CONFIG = {
    DELAY_MS: 3000,             // har account ke beech delay
    JITTER_MS: 1000,            // random jitter
    MAX_ACCOUNTS: 500           // safety cap
};

function jitter(base) {
    return base + (Math.random() * 2 - 1) * base * 0.5;
}

function extractInviteCode(link) {
    const m = String(link).match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)/);
    return m ? m[1] : null;
}

function getAllActiveSockets() {
    const list = [];
    const active = global.activeSockets;
    if (!active || typeof active.forEach !== 'function') return list;
    active.forEach((sock, number) => {
        if (sock && sock.user && sock.user.id) {
            list.push({ number, sock });
        }
    });
    return list;
}

// (.massfollow / .massunfollow now live in plugins/sfollow.js — same names, with cooldown + safer delays)

// ═══════════════════════════════════════════
//  .followstats — account count check
// ═══════════════════════════════════════════
cmd({
    pattern: 'followstats',
    alias: ['fstats', 'mystats'],
    desc: 'Show connected accounts for mass follow',
    category: 'general',
    react: '📊',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const { reply } = ctx;
    if (!ctx?.isMasterOwner) {
        return reply('🔒 *MASTER OWNER ONLY!*\nSirf Master Owner hi `.followstats` check kar sakta hai.');
    }
    const sockets = getAllActiveSockets();
    const numbers = sockets.map(s => s.number);
    return reply(
`📊 *MASS FOLLOW STATS*

🔢 Active accounts: \`${sockets.length}\`
📈 Max per channel: \`${sockets.length}\`

${numbers.length ? numbers.map((n, i) => `${i+1}. \`${n.slice(0,4)}***${n.slice(-2)}\``).join('\n') : '_(none connected)_'}`
    );
});

console.log('[MR SAQIB MD] Mass follow commands loaded');