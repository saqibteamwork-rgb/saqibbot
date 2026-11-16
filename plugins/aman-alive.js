const { cmd, commands } = require('../arslan');
const config = require('../config');

cmd({
    pattern: "alive",
    alias: ["status", "live"],
    desc: "Check uptime and system status",
    category: "main",
    react: "👑",
    filename: __filename
},
async (conn, mek, m, { from, reply }) => {
    try {
        const totalCmds = commands.length;
        const uptime = () => {
            let sec = process.uptime();
            let h = Math.floor(sec / 3600);
            let m = Math.floor((sec % 3600) / 60);
            let s = Math.floor(sec % 60);
            return `${h}h ${m}m ${s}s`;
        };

        const status = `
        *${config.BOT_NAME || 'AMAN Mini Bot'} is online 🤗♥️*
*┏────〘 INFO 〙───⊷*
*┃👑 MODE :❯ ${(config.WORK_TYPE || 'public').toUpperCase()}*
*┃👑 OWNER :❯ Private*
*┃👑 PREFIX :❯ ❮ ${config.PREFIX || '.'} ❯*
*┃👑 VERSION :❯ 2.4.0*
*┃👑 TOTAL CMNDS :❯ ❮ ${totalCmds} ❯*
*┃👑 UPTIME :❯ ${uptime()}*
*┗──────────────⊷*
*👑 ${config.BOT_NAME || 'AMAN Mini Bot'} 👑*`;

        await conn.sendMessage(from, { text: status }, { quoted: mek });

    } catch (e) {
        console.error("Error in alive command:", e);
        reply(`An error occurred: ${e.message}`);
    }
});
