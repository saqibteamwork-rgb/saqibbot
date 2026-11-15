'use strict';

const os = require('os');
const settings = require('../settings');

async function pingCommand(sock, from, msg) {
    const start = Date.now();

    // Send instant reaction asynchronously in background (zero blocking delay!)
    sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

    const end = Date.now();
    const speedMs = Math.max(1, end - start);
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

    try {
        await sock.sendMessage(from, { text, contextInfo: channelContext }, { quoted: msg });
    } catch (err) {
        console.error('[pingCommand] Error sending ping:', err.message);
        await sock.sendMessage(from, { text }).catch(() => {});
    }
}

module.exports = pingCommand;
