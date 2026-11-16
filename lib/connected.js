// lib/connected.js — "CONNECTED" message ka text (bot connect hone par owner ko jata hai)
const fs = require('fs');
const path = require('path');

const sans = (t) => String(t).replace(/[A-Za-z0-9]/g, (c) => {
    const k = c.charCodeAt(0);
    if (k >= 65 && k <= 90) return String.fromCodePoint(0x1D5D4 + k - 65);   // 𝗔-𝗭
    if (k >= 97 && k <= 122) return String.fromCodePoint(0x1D5EE + k - 97);  // 𝗮-𝘇
    return String.fromCodePoint(0x1D7CE + k - 48);                            // 𝟎-𝟗
});

function version() {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version || ''; } catch (_) { return ''; }
}

function uptime() {
    const s = Math.floor(process.uptime());
    return `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m ${s % 60}s`;
}

function buildConnectedText({ prefix, mode, totalCommands, owner }) {
    const L = [
        '╭━〔 𝗔𝗠𝗔𝗡 𝗧𝗘𝗖𝗛 𝗠𝗗 〕━┈⊷',
        `┃ 👑 𝗢𝘄𝗻𝗲𝗿: ${owner || '𝗔𝗠𝗔𝗡 𝗨𝗟𝗟𝗔𝗛'}`,
        '┃ 🟢 𝗦𝘁𝗮𝘁𝘂𝘀: 𝗖𝗼𝗻𝗻𝗲𝗰𝘁𝗲𝗱',
        '┃ ⚙️ 𝗦𝘆𝘀𝘁𝗲𝗺: 𝗔𝗰𝘁𝗶𝘃𝗲',
        '┃ 🌐 𝗦𝗲𝗿𝘃𝗲𝗿: 𝗥𝘂𝗻𝗻𝗶𝗻𝗴',
        '┃ 🔥 𝗠𝗼𝗱𝘂𝗹𝗲𝘀: 𝗔𝗰𝘁𝗶𝘃𝗲',
        '┃ 📱 𝗕𝗮𝗶𝗹𝗲𝘆𝘀: 𝗠𝘂𝗹𝘁𝗶 𝗗𝗲𝘃𝗶𝗰𝗲',
        `┃ ⏳ 𝗨𝗽𝘁𝗶𝗺𝗲: ${sans(uptime())}`,
        `┃ 🔑 𝗣𝗿𝗲𝗳𝗶𝘅: [ ${prefix} ]`,
        `┃ 🛡️ 𝗠𝗼𝗱𝗲: ${sans(String(mode || 'public').toUpperCase())}`,
        `┃ 📂 𝗧𝗼𝘁𝗮𝗹 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀: ${sans(totalCommands)}`,
        `┃ 📦 𝗩𝗲𝗿𝘀𝗶𝗼𝗻: ${sans(version())}`,
        '┣┳━━━━━━━━━━━━━━━━┈⊷',
        '┃┣➤𝙲𝙻𝙸𝙲𝙺 𝐂𝐚𝐭𝐞𝐠𝐨𝐫𝐢𝐞𝐬 𝙱𝚄𝚃𝚃𝙾𝙽',
        '┃┗➤𝚂𝙴𝙴 𝙱𝙾𝚃 𝙰𝙻𝙻 𝐂𝐚𝐭𝐞𝐠𝐨𝐫𝐢𝐞𝐬',
        '┣┓',
        '┃┣➤𝙵𝙾𝙻𝙻𝙾𝚆 𝙾𝙵𝙵𝙸𝙲𝙰𝙻 𝐂𝐡𝐚𝐧𝐧𝐚𝐥',
        '┃┗➤𝙵𝙾𝚁 𝐁𝐨𝐭 𝙰𝙻𝙻 𝙽𝙴𝚆 𝚄𝙿𝙳𝙰𝚃𝙴𝚂',
        '┗━━━━━━━━━━━━━━━━━┈⊷'
    ];
    return L.join('\n');
}

module.exports = { buildConnectedText };
