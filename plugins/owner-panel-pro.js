const { cmd } = require('../arslan');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { isOwner, cleanNumber } = require('../lib/premium-check');
const { getUserConfigFromMongoDB } = require('../lib/database');

// ===========================================================
// 1. OWNERHUB — Full bot dashboard
// ===========================================================
cmd({
    pattern: 'ownerhub',
    alias: ['ohub', 'dashboard'],
    desc: 'Owner: Full bot dashboard',
    category: 'owner',
    react: '👑',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    let savedOwnerConfig = {};
    try { savedOwnerConfig = await getUserConfigFromMongoDB(String(ctx.botNumber || '')); } catch (_) {}
    const ownerDisplayName = savedOwnerConfig.OWNER_NAME || config.OWNER_NAME || 'AMAN HACKER';
    const ownerDisplayNumber = savedOwnerConfig.OWNER_DISPLAY_NUMBER || config.OWNER_DISPLAY_NUMBER || ctx.botNumber || 'Private';

    const sockets = global.activeSockets || new Map();
    const live = Array.from(sockets.keys()).filter(n => sockets.get(n)?.user);
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m_ = Math.floor((uptime % 3600) / 60);

    let totalCmds = 0;
    try {
        const events = require('../arslan');
        totalCmds = (events.commands || []).length;
    } catch {}

    return ctx.reply([
        '👑 *𝗔𝗠𝗔𝗡-𝐌𝐃 OWNER HUB*',
        '',
        '╭━━━━━━━━━━━━━━━━━⊷',
        '┃ *🖥️ SYSTEM*',
        `┃ ├ Uptime: *${d}d ${h}h ${m_}m*`,
        `┃ ├ RAM: *${(usedMem / 1073741824).toFixed(2)}/${(totalMem / 1073741824).toFixed(2)} GB*`,
        `┃ ├ Process: *${(mem.rss / 1048576).toFixed(0)} MB*`,
        `┃ ├ Platform: *${os.platform()} ${os.arch()}*`,
        `┃ ├ Node: *${process.version}*`,
        `┃ └ CPU Cores: *${os.cpus().length}*`,
        '╰━━━━━━━━━━━━━━━━━⊷',
        '',
        '╭━━━━━━━━━━━━━━━━━⊷',
        '┃ *📱 BOT*',
        `┃ ├ Active Sessions: *${live.length}*`,
        `┃ ├ Total Commands: *${totalCmds}*`,
        `┃ ├ Prefix: *${config.PREFIX}*`,
        `┃ ├ Mode: *${config.WORK_TYPE || 'public'}*`,
        `┃ └ Bot: *${config.BOT_NAME}*`,
        '╰━━━━━━━━━━━━━━━━━⊷',
        '',
        '╭━━━━━━━━━━━━━━━━━⊷',
        '┃ *👤 OWNER*',
        `┃ ├ Name: *${ownerDisplayName}*`,
        `┃ ├ Number: *${ownerDisplayNumber}*`,
        `┃ └ Total Owners: *${(config.OWNER_NUMBERS || []).length}*`,
        '╰━━━━━━━━━━━━━━━━━⊷'
    ].join('\n'));
});

// ===========================================================
// 2. BOTPAUSE — Bot ko pause karo
// ===========================================================
cmd({
    pattern: 'botpause',
    alias: ['pause'],
    desc: 'Owner: Bot ko pause karo',
    category: 'owner',
    react: '⏸️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    global.botPaused = true;
    return ctx.reply('⏸️ *Bot paused.*\n\nAb koi command nahi chalegi jab tak `.botresume` na karun.');
});

// ===========================================================
// 3. BOTRESUME — Bot ko resume karo
// ===========================================================
cmd({
    pattern: 'botresume',
    alias: ['resume'],
    desc: 'Owner: Bot ko resume karo',
    category: 'owner',
    react: '▶️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    global.botPaused = false;
    return ctx.reply('▶️ *Bot resumed.*\n\nAb sab commands normal chalengi.');
});

// ===========================================================
// 4. MAINTENANCE — Maintenance mode
// ===========================================================
cmd({
    pattern: 'maintenance',
    alias: ['maint'],
    desc: 'Owner: Maintenance mode on/off',
    category: 'owner',
    react: '🚧',
    use: '.maintenance on OR .maintenance off',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    const mode = (ctx.q || '').trim().toLowerCase();
    if (!['on', 'off'].includes(mode)) {
        return ctx.reply(`🚧 Current: *${global.maintenance ? 'ON' : 'OFF'}*\n\nUse: \`.maintenance on\` ya \`.maintenance off\``);
    }

    global.maintenance = mode === 'on';
    return ctx.reply(global.maintenance
        ? '🚧 *Maintenance ON*\n\nSirf owner commands chalengi.'
        : '✅ *Maintenance OFF*\n\nSab commands normal.'
    );
});

// ===========================================================
// 5. BOTNOTICE — Global notice set karo
// ===========================================================
cmd({
    pattern: 'botnotice',
    alias: ['setnotice', 'notice'],
    desc: 'Owner: Global notice set karo',
    category: 'owner',
    react: '📢',
    use: '.botnotice <text>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    const notice = (ctx.q || '').trim();
    if (!notice) {
        return ctx.reply(`📢 Current notice: *${global.botNotice || 'None'}*\n\nUse: \`.botnotice <text>\``);
    }

    if (notice === 'clear' || notice === 'off') {
        global.botNotice = null;
        return ctx.reply('📢 Notice cleared.');
    }

    global.botNotice = notice;
    return ctx.reply(`📢 *Notice set:*\n\n${notice}`);
});

// FORWARDALL ab plugins/forwardall-links.js mein hai

// ===========================================================
// 7. BROADCAST2 — Advanced broadcast (with delay)
// ===========================================================
cmd({
    pattern: 'broadcast2',
    alias: ['bc2'],
    desc: 'Owner: Advanced broadcast',
    category: 'owner',
    react: '📢',
    use: '.broadcast2 <message>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');
    if (!ctx.q) return ctx.reply('Use: `.broadcast2 <message>`');

    const sockets = global.activeSockets || new Map();
    if (!sockets.size) return ctx.reply('❌ Koi account nahi.');

    await ctx.reply(`📢 Broadcasting to *${sockets.size}* accounts…`);

    let sent = 0, failed = 0;
    for (const [number, sock] of sockets) {
        try {
            if (!sock?.user) { failed++; continue; }
            const chats = await sock.groupFetchAllParticipating();
            for (const jid of Object.keys(chats)) {
                try {
                    await sock.sendMessage(jid, { text: ctx.q });
                    sent++;
                    await new Promise(r => setTimeout(r, 1500));
                } catch { failed++; }
            }
        } catch { failed++; }
    }

    return ctx.reply(`✅ *Broadcast done.*\n\n📤 Sent: *${sent}*\n❌ Failed: *${failed}*`);
});

// ===========================================================
// 8. USERBAN — Kisi user ko ban karo
// ===========================================================
const bannedUsers = new Map();
cmd({
    pattern: 'userban',
    alias: ['banuser'],
    desc: 'Owner: User ko ban karo',
    category: 'owner',
    react: '🚫',
    use: '.userban 923XXXXXXXXX <reason>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    const parts = (ctx.q || '').split(/\s+/);
    const num = cleanNumber(parts.shift());
    const reason = parts.join(' ') || 'No reason';

    if (!num) return ctx.reply('Use: `.userban 923XXXXXXXXX <reason>`');

    bannedUsers.set(num, { reason, at: new Date() });
    return ctx.reply(`🚫 *+${num} banned.*\n\n📝 Reason: ${reason}`);
});

// ===========================================================
// 9. USERUNBAN — Unban
// ===========================================================
cmd({
    pattern: 'userunban',
    alias: ['unbanuser'],
    desc: 'Owner: User ko unban karo',
    category: 'owner',
    react: '✅',
    use: '.userunban 923XXXXXXXXX',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    const num = cleanNumber(ctx.q);
    if (!num) return ctx.reply('Use: `.userunban <number>`');

    bannedUsers.delete(num);
    return ctx.reply(`✅ *+${num} unbanned.*`);
});

// ===========================================================
// 10. BANLIST — Sab banned users
// ===========================================================
cmd({
    pattern: 'banlist',
    alias: ['bannedusers'],
    desc: 'Owner: Banned users ki list',
    category: 'owner',
    react: '📋',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    if (bannedUsers.size === 0) return ctx.reply('✅ Koi user banned nahi.');

    const lines = [...bannedUsers.entries()].map(([num, data], i) =>
        `${i + 1}. +${num}\n   📝 ${data.reason}`
    );

    return ctx.reply(`🚫 *BANNED USERS (${bannedUsers.size})*\n\n${lines.join('\n')}`);
});

// ===========================================================
// 11. SESSIONS — Sab connected accounts detail
// ===========================================================
cmd({
    pattern: 'sessions',
    alias: ['allsessions'],
    desc: 'Owner: Sab active sessions',
    category: 'owner',
    react: '📱',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    const sockets = global.activeSockets || new Map();
    if (!sockets.size) return ctx.reply('❌ Koi session nahi.');

    const lines = [];
    let i = 1;
    for (const [num, sock] of sockets) {
        const status = sock?.user ? '🟢' : '🔴';
        lines.push(`${i}. ${status} *+${num}*`);
        i++;
        if (i > 30) break;
    }

    const total = sockets.size;
    const live = Array.from(sockets.values()).filter(s => s?.user).length;

    return ctx.reply([
        `📱 *ACTIVE SESSIONS*`,
        '',
        `👥 Total: *${total}*`,
        `🟢 Online: *${live}*`,
        `🔴 Offline: *${total - live}*`,
        '',
        lines.join('\n'),
        total > 30 ? `\n… aur ${total - 30} more` : ''
    ].join('\n'));
});

// ===========================================================
// 12. KILLALL — Sab sessions disconnect
// ===========================================================
cmd({
    pattern: 'killall',
    alias: ['disconnectall'],
    desc: 'Owner: Sab sessions disconnect',
    category: 'owner',
    react: '💀',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    const sockets = global.activeSockets || new Map();
    if (!sockets.size) return ctx.reply('❌ Koi session nahi.');

    await ctx.reply(`💀 Disconnecting *${sockets.size}* sessions…`);

    let count = 0;
    for (const [num, sock] of sockets) {
        try {
            if (sock?.ws) sock.ws.close();
            if (sock?.ev) sock.ev.removeAllListeners();
            count++;
        } catch {}
    }

    global.activeSockets = new Map();
    return ctx.reply(`💀 *${count}* sessions disconnected.`);
});

// ===========================================================
// 13. LOGS — Recent logs
// ===========================================================
cmd({
    pattern: 'logs',
    alias: ['log'],
    desc: 'Owner: Recent logs',
    category: 'owner',
    react: '📜',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) return ctx.reply('❌ Logs folder nahi hai.');

    const files = fs.readdirSync(logDir).sort().reverse().slice(0, 5);
    if (!files.length) return ctx.reply('❌ Koi log nahi.');

    const lines = files.map(f => {
        const stat = fs.statSync(path.join(logDir, f));
        return `• ${f} (${(stat.size / 1024).toFixed(2)} KB)`;
    });

    return ctx.reply(`📜 *Recent Logs*\n\n${lines.join('\n')}`);
});

// ===========================================================
// 14. EVAL2 — Safe eval
// ===========================================================
cmd({
    pattern: 'eval2',
    alias: ['exec2'],
    desc: 'Owner: JS code run (safe)',
    category: 'owner',
    react: '⚡',
    use: '.eval2 return 1+1',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');
    if (!ctx.q) return ctx.reply('Use: `.eval2 <code>`');

    try {
        let result = await eval(`(async () => { ${ctx.q} })()`);
        if (typeof result !== 'string') result = JSON.stringify(result, null, 2);
        if (result.length > 3000) result = result.slice(0, 3000) + '…';
        return ctx.reply('⚡ *Result:*\n```\n' + result + '\n```');
    } catch (e) {
        return ctx.reply('❌ Error:\n```\n' + e.message + '\n```');
    }
});

// ===========================================================
// 15. MEMORY — Memory details
// ===========================================================
cmd({
    pattern: 'memory',
    alias: ['ram'],
    desc: 'Owner: RAM usage',
    category: 'owner',
    react: '💾',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    const mem = process.memoryUsage();
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return ctx.reply([
        '💾 *MEMORY USAGE*',
        '',
        `┃ System:`,
        `┃ ├ Total: *${(total / 1073741824).toFixed(2)} GB*`,
        `┃ ├ Used: *${(used / 1073741824).toFixed(2)} GB*`,
        `┃ └ Free: *${(free / 1073741824).toFixed(2)} GB*`,
        '',
        `┃ Process:`,
        `┃ ├ RSS: *${(mem.rss / 1048576).toFixed(2)} MB*`,
        `┃ ├ Heap Total: *${(mem.heapTotal / 1048576).toFixed(2)} MB*`,
        `┃ ├ Heap Used: *${(mem.heapUsed / 1048576).toFixed(2)} MB*`,
        `┃ └ External: *${(mem.external / 1048576).toFixed(2)} MB*`
    ].join('\n'));
});

// ===========================================================
// 16. CPUINFO — CPU details
// ===========================================================
cmd({
    pattern: 'cpuinfo',
    alias: ['cpu'],
    desc: 'Owner: CPU info',
    category: 'owner',
    react: '⚙️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    const cpus = os.cpus();
    return ctx.reply([
        '⚙️ *CPU INFO*',
        '',
        `🖥️ Model: *${cpus[0]?.model || 'N/A'}*`,
        `📊 Cores: *${cpus.length}*`,
        `⚡ Speed: *${cpus[0]?.speed} MHz*`,
        `🌐 Platform: *${os.platform()}*`,
        `📦 Arch: *${os.arch()}*`,
        `⏱ Uptime: *${Math.floor(os.uptime() / 3600)}h*`,
        '',
        `💡 Load Avg: *${os.loadavg().map(l => l.toFixed(2)).join(', ')}*`
    ].join('\n'));
});

// ===========================================================
// 17. SENDTO — Kisi ko custom message
// ===========================================================
cmd({
    pattern: 'sendto',
    alias: ['msgto'],
    desc: 'Owner: Kisi ko DM bhejo',
    category: 'owner',
    react: '📤',
    use: '.sendto 923XXXXXXXXX <message>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    const parts = (ctx.q || '').split(/\s+/);
    const num = cleanNumber(parts.shift());
    const msg = parts.join(' ');

    if (!num || !msg) return ctx.reply('Use: `.sendto 923XXXXXXXXX <message>`');

    try {
        await conn.sendMessage(num + '@s.whatsapp.net', { text: msg });
        return ctx.reply(`✅ Message sent to +${num}`);
    } catch (e) {
        return ctx.reply('❌ ' + e.message);
    }
});

// ===========================================================
// 18. USAGESTATS — Command usage stats
// ===========================================================
cmd({
    pattern: 'usagestats',
    alias: ['cmdstats'],
    desc: 'Owner: Bot usage stats',
    category: 'owner',
    react: '📊',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    let events;
    try { events = require('../arslan'); } catch { return ctx.reply('❌ Events load fail.'); }

    const commands = events.commands || [];
    const cats = {};
    commands.forEach(c => {
        const cat = c.category || 'misc';
        cats[cat] = (cats[cat] || 0) + 1;
    });

    const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const lines = sorted.slice(0, 15).map(([cat, count]) => `• ${cat}: *${count}*`);

    return ctx.reply([
        '📊 *COMMAND STATS*',
        '',
        `📌 Total Commands: *${commands.length}*`,
        `📂 Categories: *${sorted.length}*`,
        '',
        '*Top Categories:*',
        lines.join('\n')
    ].join('\n'));
});

// ===========================================================
// 19. PREFIX — Prefix change
// ===========================================================
cmd({
    pattern: 'setprefix',
    alias: ['changeprefix'],
    desc: 'Owner: Bot prefix change',
    category: 'owner',
    react: '🔧',
    use: '.setprefix !',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    const newPrefix = (ctx.q || '').trim();
    if (!newPrefix || newPrefix.length > 3) {
        return ctx.reply(`🔧 Current: *${config.PREFIX}*\n\nUse: \`.setprefix <1-3 chars>\``);
    }

    try {
        const configPath = path.join(__dirname, '..', 'config.js');
        let content = fs.readFileSync(configPath, 'utf8');
        content = content.replace(/PREFIX:\s*process\.env\.PREFIX\s*\|\|\s*["'][^"']*["']/, `PREFIX: process.env.PREFIX || "${newPrefix}"`);
        fs.writeFileSync(configPath, content);
        return ctx.reply(`🔧 *Prefix changed to:* ${newPrefix}\n\n⚠️ Restart karo: \`.restart\``);
    } catch (e) {
        return ctx.reply('❌ ' + e.message);
    }
});

// ===========================================================
// 20. RESTART — Bot restart
// ===========================================================
cmd({
    pattern: 'restart',
    alias: ['reboot'],
    desc: 'Owner: Bot restart',
    category: 'owner',
    react: '🔄',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    await ctx.reply('🔄 *Restarting bot in 3 seconds…*');
    setTimeout(() => process.exit(0), 3000);
});