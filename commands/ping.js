'use strict';

const os = require('os');
const settings = require('../settings');

// Pre-frozen context info (zero allocation in V8 garbage collector)
const PING_CHANNEL_CONTEXT = Object.freeze({
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: settings.newsletterJid || '120363421389121979@newsletter',
        newsletterName: settings.botName || 'MR SAQIB MD',
        serverMessageId: 1
    }
});

async function pingCommand(sock, from, msg) {
    const start = Date.now();

    // Send instant reaction asynchronously in background (zero blocking delay!)
    sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

    // Latency calculation from message arrival to response generation
    const msgTime = (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : (msg.messageTimestamp?.low || 0)) * 1000;
    const diff = (msgTime > 0 && start - msgTime >= 0 && start - msgTime < 10000)
        ? (start - msgTime)
        : Math.max(1, Date.now() - start);
    const speedMs = Math.max(1, diff);
    const speedSec = (speedMs / 1000).toFixed(3);

    const text = 
`╭━━━〔 ⚡ *${settings.botName || 'MR SAQIB MD'} ULTRA-SONIC SPEED* 〕━━━┈⊷
┃ 🚀 *Response Speed:* ${speedMs}ms (${speedSec}s)
┃ ⚡ *Engine:* Ultra-Sonic V8 Performance Engine
┃ 🟢 *Server Status:* 100% Online & Lightning Fast
┃ 👑 *Owner:* ${settings.ownerName || 'MR SAQIB'}
┃ ⚙️ *Platform:* Node.js (${process.version})
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

    await sock.sendMessage(from, { text, contextInfo: PING_CHANNEL_CONTEXT }, { quoted: msg });
}

module.exports = pingCommand;
