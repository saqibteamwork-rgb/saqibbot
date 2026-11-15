'use strict';

const os = require('os');
const settings = require('../settings');

async function pingCommand(sock, from, msg) {
    const start = Date.now();

    // Send instant reaction asynchronously (ultra-fast non-blocking)
    sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

    // Latency calculation from message receipt to response generation
    const speedMs = Math.max(1, Date.now() - (msg.messageTimestamp ? (msg.messageTimestamp * 1000) : start) > 0 && Date.now() - (msg.messageTimestamp * 1000) < 5000 ? Date.now() - (msg.messageTimestamp * 1000) : (Date.now() - start));
    const speedSec = (speedMs / 1000).toFixed(3);

    const channelContext = {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: settings.newsletterJid || '120363421389121979@newsletter',
            newsletterName: settings.botName || 'MR SAQIB MD',
            serverMessageId: 1
        }
    };

    const text = 
`╭━━━〔 ⚡ *${settings.botName || 'MR SAQIB MD'} ULTRA-SONIC SPEED* 〕━━━┈⊷
┃ 🚀 *Response Speed:* ${speedMs}ms (${speedSec}s)
┃ ⚡ *Engine:* Ultra-Sonic V8 Performance Engine
┃ 🟢 *Server Status:* 100% Online & Lightning Fast
┃ 👑 *Owner:* ${settings.ownerName || 'MR SAQIB'}
┃ ⚙️ *Platform:* Node.js (${process.version})
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

    await sock.sendMessage(from, { text, contextInfo: channelContext }, { quoted: msg });
}

module.exports = pingCommand;
