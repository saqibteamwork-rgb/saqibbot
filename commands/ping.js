'use strict';

const os = require('os');
const settings = require('../settings');
const { getEffectiveProfile } = require('./customProfile');

async function pingCommand(sock, from, msg, session = null, botData = null) {
    const start = Date.now();

    // Send instant reaction asynchronously in background (zero blocking delay!)
    sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

    const end = Date.now();
    const speedMs = Math.max(1, end - start);
    const speedSec = (speedMs / 1000).toFixed(3);

    const userId = session?.userId;
    const profile = getEffectiveProfile(botData, userId);
    const effectiveBotName = profile.botName;
    const effectiveOwnerName = profile.ownerName;

    const channelContext = {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: settings.newsletterJid || '120363421389121979@newsletter',
            newsletterName: effectiveBotName || settings.botName || 'MR SAQIB MD',
            serverMessageId: 1
        }
    };

    const text = 
`╭━━━〔 ⚡ *${effectiveBotName} ULTRA-SONIC SPEED* 〕━━━┈⊷
┃ 🚀 *Response Speed:* ${speedMs}ms (${speedSec}s)
┃ ⚡ *Engine:* Ultra-Sonic V8 Performance Engine
┃ 🟢 *Server Status:* 100% Online & Lightning Fast
┃ 👑 *Owner:* ${effectiveOwnerName}
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
