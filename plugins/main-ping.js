const { cmd } = require('../command');
const pingCommand = require('../commands/ping');

cmd({
    pattern: "ping",
    alias: ["speed", "pong", "latency", "p"],
    use: '.ping',
    desc: "Check bot response time",
    category: "main",
    react: "⚡",
    filename: __filename
},
async (conn, mek, m, { from, sender }) => {
    try {
        await pingCommand(conn, from, mek);
    } catch (e) {
        console.error("Error in ping command:", e);
    }
});
