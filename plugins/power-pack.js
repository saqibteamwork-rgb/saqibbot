const { cmd } = require('../arslan');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');

function cleanNumber(value) {
    let number = String(value || '').replace(/\D/g, '');
    if (number.startsWith('0')) number = `${config.DEFAULT_COUNTRY_CODE}${number.slice(1)}`;
    return number;
}

function isOwner(ctx) {
    return Boolean(ctx && (ctx.isOwner || ctx.isCreator || ctx.isMe)) ||
        Boolean(cleanNumber(ctx?.senderNumber) && cleanNumber(ctx.senderNumber) === cleanNumber(config.OWNER_NUMBER));
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
}

// ===========================================================
// 1. WEATHER — Kisi bhi sheher ka mausam
// ===========================================================
cmd({
    pattern: 'weather',
    alias: ['mausam', 'temp'],
    desc: 'Kisi sheher ka mausam dekho',
    category: 'tools',
    react: '🌤️',
    use: '.weather Lahore',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: *.weather <city>*');
    try {
        const r = await axios.get(`https://wttr.in/${encodeURIComponent(ctx.q)}?format=j1`, { timeout: 10000 });
        const c = r.data.current_condition[0];
        const area = r.data.nearest_area[0];
        return ctx.reply([
            `🌤️ *Weather — ${area.areaName[0].value}*`,
            '',
            `🌡️ Temp: *${c.temp_C}°C* (feels ${c.FeelsLikeC}°C)`,
            `☁️ Condition: *${c.weatherDesc[0].value}*`,
            `💧 Humidity: *${c.humidity}%*`,
            `💨 Wind: *${c.windspeedKmph} km/h*`,
            `👁️ Visibility: *${c.visibility} km*`
        ].join('\n'));
    } catch (e) {
        return ctx.reply('❌ Weather fetch fail. City name check karo.');
    }
});

// ===========================================================
// 2. IP LOOKUP — IP address ki info
// ===========================================================
cmd({
    pattern: 'iplookup',
    alias: ['ipinfo', 'myip'],
    desc: 'IP address ki location aur info',
    category: 'tools',
    react: '🌐',
    use: '.iplookup 8.8.8.8',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const ip = ctx.q || '';
    try {
        const r = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 10000 });
        const d = r.data;
        if (d.status !== 'success') return ctx.reply('❌ Invalid IP ya lookup fail.');
        return ctx.reply([
            `🌐 *IP Info — ${d.query}*`,
            '',
            `🌍 Country: *${d.country}* (${d.countryCode})`,
            `🏙️ City: *${d.city}*`,
            `📍 Region: *${d.regionName}*`,
            `📮 ZIP: *${d.zip || 'N/A'}*`,
            `📡 ISP: *${d.isp}*`,
            `🕐 Timezone: *${d.timezone}*`,
            `🗺️ Lat/Lon: *${d.lat}, ${d.lon}*`
        ].join('\n'));
    } catch (e) {
        return ctx.reply('❌ IP lookup fail: ' + e.message);
    }
});

// ===========================================================
// 3. SHORTURL — Long URL ko short karo
// ===========================================================
cmd({
    pattern: 'shorturl',
    alias: ['shorten', 'tinyurl'],
    desc: 'URL ko short karo',
    category: 'tools',
    react: '🔗',
    use: '.shorturl https://example.com/very/long/url',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: *.shorturl <url>*');
    try {
        const r = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(ctx.q)}`, { timeout: 10000 });
        return ctx.reply(`🔗 *Short URL:*\n${r.data}`);
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 4. TRANSLATE — Text ko translate karo
// ===========================================================
cmd({
    pattern: 'translate',
    alias: ['trt', 'tr'],
    desc: 'Text ko kisi bhi language me translate karo',
    category: 'tools',
    react: '🌍',
    use: '.translate ur|en Hello world',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const parts = (ctx.q || '').split(' ');
    const lang = parts.shift();
    const text = parts.join(' ');
    if (!lang || !text) return ctx.reply('Use: *.translate ur|en|hi <text>*');
    try {
        const r = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`, { timeout: 10000 });
        const translated = r.data[0].map(x => x[0]).join('');
        return ctx.reply(`🌍 *Translated (${lang}):*\n${translated}`);
    } catch (e) { return ctx.reply('❌ Translate fail.'); }
});

// ===========================================================
// 5. WIKI — Wikipedia summary
// ===========================================================
cmd({
    pattern: 'wiki',
    alias: ['wikipedia', 'search'],
    desc: 'Wikipedia pe kuch bhi search karo',
    category: 'tools',
    react: '📚',
    use: '.wiki Pakistan',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: *.wiki <topic>*');
    try {
        const r = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(ctx.q)}`, { timeout: 10000 });
        return ctx.reply([
            `📚 *${r.data.title}*`,
            '',
            r.data.extract,
            '',
            r.data.content_urls?.desktop?.page || ''
        ].join('\n'));
    } catch (e) { return ctx.reply('❌ Topic nahi mila.'); }
});

// ===========================================================
// 6. QRCODE — Text/URL ka QR code
// ===========================================================
cmd({
    pattern: 'qrcode',
    alias: ['qr'],
    desc: 'Text ka QR code banao',
    category: 'tools',
    react: '📱',
    use: '.qrcode Hello World',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: *.qrcode <text>*');
    try {
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(ctx.q)}`;
        await conn.sendMessage(ctx.from, { image: { url }, caption: `📱 QR Code:\n${ctx.q.slice(0, 100)}` }, { quoted: mek });
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 7. PASSWORD — Strong password generator
// ===========================================================
cmd({
    pattern: 'genpass',
    alias: ['password', 'passgen'],
    desc: 'Strong random password banao',
    category: 'tools',
    react: '🔐',
    use: '.genpass 16',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const len = Math.min(64, Math.max(8, parseInt(ctx.q) || 16));
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
    let pass = '';
    for (let i = 0; i < len; i++) pass += chars[crypto.randomInt(chars.length)];
    return ctx.reply(`🔐 *Generated Password (${len} chars):*\n\`${pass}\``);
});

// ===========================================================
// 8. TIMER — Countdown timer
// ===========================================================
cmd({
    pattern: 'timer',
    alias: ['countdown'],
    desc: 'Timer set karo (seconds)',
    category: 'tools',
    react: '⏱️',
    use: '.timer 10',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const sec = Math.min(300, Math.max(1, parseInt(ctx.q) || 10));
    await ctx.reply(`⏱️ Timer started for *${sec}s*…`);
    setTimeout(() => {
        conn.sendMessage(ctx.from, { text: `⏰ *Time up!* (${sec} seconds)` }, { quoted: mek });
    }, sec * 1000);
});

// ===========================================================
// 9. REMINDER — Reminder set karo
// ===========================================================
cmd({
    pattern: 'remind',
    alias: ['reminder'],
    desc: 'Reminder set karo',
    category: 'tools',
    react: '⏰',
    use: '.remind 5m Meeting',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const parts = (ctx.q || '').split(' ');
    const time = parts.shift();
    const msg = parts.join(' ');
    if (!time || !msg) return ctx.reply('Use: *.remind 5m|30s|2h <message>*');
    const m1 = time.match(/^(\d+)(s|m|h)$/i);
    if (!m1) return ctx.reply('Time format: 30s, 5m, 2h');
    const val = parseInt(m1[1]);
    const unit = m1[2].toLowerCase();
    const ms = unit === 's' ? val * 1000 : unit === 'm' ? val * 60000 : val * 3600000;
    if (ms > 86400000) return ctx.reply('Max 24 hours.');
    await ctx.reply(`⏰ Reminder set: *${time}* baad yaad dilaunga.`);
    setTimeout(() => {
        conn.sendMessage(ctx.from, { text: `⏰ *REMINDER:*\n${msg}` }, { quoted: mek });
    }, ms);
});

// ===========================================================
// 10. BINARY — Text to binary / binary to text
// ===========================================================
cmd({
    pattern: 'binary',
    alias: ['tobin', 'frombin'],
    desc: 'Text ↔ Binary convert',
    category: 'tools',
    react: '💻',
    use: '.binary Hello  OR  .binary 01001000',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.q) return ctx.reply('Use: *.binary <text>*');
    const input = ctx.q.trim();
    if (/^[01\s]+$/.test(input)) {
        const bin = input.replace(/\s/g, '');
        const text = bin.match(/.{8}/g).map(b => String.fromCharCode(parseInt(b, 2))).join('');
        return ctx.reply(`💻 *Decoded:*\n${text}`);
    }
    const out = input.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
    return ctx.reply(`💻 *Binary:*\n${out}`);
});

// ===========================================================
// 11. BASE64 — Encode / Decode
// ===========================================================
cmd({
    pattern: 'base64',
    alias: ['b64', 'encode'],
    desc: 'Base64 encode/decode',
    category: 'tools',
    react: '🔢',
    use: '.base64 encode Hello  OR  .base64 decode SGVsbG8=',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const parts = (ctx.q || '').split(' ');
    const mode = (parts.shift() || '').toLowerCase();
    const text = parts.join(' ');
    if (!mode || !text) return ctx.reply('Use: *.base64 encode|decode <text>*');
    try {
        if (mode === 'encode') return ctx.reply(Buffer.from(text).toString('base64'));
        if (mode === 'decode') return ctx.reply(Buffer.from(text, 'base64').toString('utf8'));
        return ctx.reply('Mode: encode ya decode');
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 12. UPTIME — Bot uptime detail
// ===========================================================
cmd({
    pattern: 'uptime',
    alias: ['runtime'],
    desc: 'Bot kitni der se chal raha',
    category: 'general',
    react: '⏱️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const s = process.uptime();
    const mem = process.memoryUsage();
    return ctx.reply([
        '⏱️ *Bot Uptime*',
        '',
        `🕐 Uptime: *${formatUptime(s)}*`,
        `📊 Seconds: *${Math.floor(s)}*`,
        `💾 RAM: *${formatBytes(mem.rss)}*`,
        `🖥️ Platform: *${os.platform()} ${os.arch()}*`,
        `⚙️ Node: *${process.version}*`,
        `👑 Owner contact: *Private*`
    ].join('\n'));
});

// ===========================================================
// 13. SERVERINFO — Server details
// ===========================================================
cmd({
    pattern: 'serverinfo',
    alias: ['sysinfo', 'host'],
    desc: 'Server ki info',
    category: 'owner',
    react: '🖥️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');
    const mem = process.memoryUsage();
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return ctx.reply([
        '🖥️ *Server Info*',
        '',
        `🖥️ Platform: *${os.platform()} ${os.arch()}*`,
        `⚙️ Node: *${process.version}*`,
        `🧠 CPU: *${os.cpus()[0]?.model || 'N/A'}*`,
        `💾 RAM: *${formatBytes(used)} / ${formatBytes(total)}* (${((used/total)*100).toFixed(1)}%)`,
        `📊 Process RAM: *${formatBytes(mem.rss)}*`,
        `⏱️ Uptime: *${formatUptime(process.uptime())}*`,
        `📁 CWD: *${process.cwd()}*`,
        `👥 Active sessions: *${(global.activeSockets?.size || 0)}*`
    ].join('\n'));
});

// ===========================================================
// 14. SAY — Bot kisi ke naam se msg bheje
// ===========================================================
cmd({
    pattern: 'say',
    alias: ['tell', 'msg'],
    desc: 'Kisi ko msg bhejo bot ke through',
    category: 'owner',
    react: '💬',
    use: '.say <number> <message>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');
    const parts = (ctx.q || '').split(' ');
    const num = cleanNumber(parts.shift());
    const msg = parts.join(' ');
    if (!num || !msg) return ctx.reply('Use: *.say <number> <message>*');
    try {
        await conn.sendMessage(num + '@s.whatsapp.net', { text: msg });
        return ctx.reply('✅ Message sent.');
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// FORWARDALL ab plugins/forwardall-links.js mein hai

// ===========================================================
// 16. LOCKGROUP — Group lock (sirf admins bolen)
// ===========================================================
cmd({
    pattern: 'lockgroup',
    alias: ['lock'],
    desc: 'Owner: Group ko lock karo',
    category: 'owner',
    react: '🔒',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    try {
        await conn.groupSettingUpdate(ctx.from, 'announcement');
        return ctx.reply('🔒 Group locked. Sirf admins bol sakte hain.');
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 17. UNLOCKGROUP — Group unlock
// ===========================================================
cmd({
    pattern: 'unlockgroup',
    alias: ['unlock'],
    desc: 'Owner: Group ko unlock karo',
    category: 'owner',
    react: '🔓',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    try {
        await conn.groupSettingUpdate(ctx.from, 'not_announcement');
        return ctx.reply('🔓 Group unlocked. Sab bol sakte hain.');
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 18. SETDESC — Group description set karo
// ===========================================================
cmd({
    pattern: 'setdesc',
    alias: ['gdesc'],
    desc: 'Owner: Group description change',
    category: 'owner',
    react: '📝',
    use: '.setdesc <new description>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    if (!ctx.q) return ctx.reply('Use: *.setdesc <text>*');
    try {
        await conn.groupUpdateDescription(ctx.from, ctx.q);
        return ctx.reply('✅ Description updated.');
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 19. SETNAME — Group name change
// ===========================================================
cmd({
    pattern: 'setname',
    alias: ['gname'],
    desc: 'Owner: Group ka naam change',
    category: 'owner',
    react: '✏️',
    use: '.setname <new name>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');
    if (!ctx.isGroup) return ctx.reply('❌ Group only.');
    if (!ctx.q) return ctx.reply('Use: *.setname <name>*');
    try {
        await conn.groupUpdateSubject(ctx.from, ctx.q);
        return ctx.reply('✅ Group name updated.');
    } catch (e) { return ctx.reply('❌ ' + e.message); }
});

// ===========================================================
// 20. USERINFO — Kisi user ki info
// ===========================================================
cmd({
    pattern: 'userinfo',
    alias: ['whois', 'info'],
    desc: 'Kisi user ki WhatsApp info',
    category: 'general',
    react: '👤',
    use: '.userinfo @user (ya reply)',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mentioned = mek.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0] || mek.message?.extendedTextMessage?.contextInfo?.participant || ctx.sender;
    const num = target.split('@')[0];
    const [status] = await conn.fetchStatus(target).catch(() => [{}]);
    let pp = '';
    try { pp = await conn.profilePictureUrl(target, 'image'); } catch {}

    const text = [
        '👤 *User Info*',
        '',
        `📱 Number: *+${num}*`,
        `💬 About: *${status?.status || 'N/A'}*`,
        `🕐 Set at: *${status?.setAt ? new Date(status.setAt).toLocaleString() : 'N/A'}*`,
        `🖼️ Profile Pic: *${pp ? 'Available' : 'Hidden'}*`
    ].join('\n');

    if (pp) {
        await conn.sendMessage(ctx.from, { image: { url: pp }, caption: text }, { quoted: mek });
    } else {
        await ctx.reply(text);
    }
});