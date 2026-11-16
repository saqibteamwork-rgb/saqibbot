const { cmd } = require('../arslan');
const config = require('../config');

cmd({
  pattern: 'ping',
  desc: 'Check the bot response time',
  category: 'main',
  react: '👑',
  filename: __filename
}, async (conn, mek, m, { from, reply }) => {
  try {
    const sentAt = Number(mek.messageTimestamp) * 1000;
    const latency = Number.isFinite(sentAt) && sentAt > 0
      ? Math.max(0, Date.now() - sentAt)
      : null;
    return await conn.sendMessage(from, {
      text: `⚡ *${config.BOT_NAME || 'AMAN Mini Bot'} PING*\n\n🏓 Response time: *${latency === null ? 'unavailable' : `${latency} ms`}*`
    }, { quoted: mek });
  } catch (e) {
    console.error('Ping Error:', e.code || 'request error');
    return reply('*Ping failed — try again.*');
  }
});
