const { cmd } = require('../command');
const config = require('../config');

cmd({
  pattern: "owner",
  alias: ["developer", "creator", "dev"],
  desc: "Get owner details",
  category: "main",
  react: "👑",
  filename: __filename
}, async (sock, m, msg, { from, userConfig }) => {
  try {
    const OWNER_NAME = userConfig?.OWNER_NAME || config.OWNER_NAME || "Muhammad Saqib";
    const CHANNEL_LINK = config.channelLink || "https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M";
    const WEBSITE = config.websiteUrl || "https://mrsaqib.me";

    await sock.sendPresenceUpdate("composing", from);

    const text =
`╭━━━〔 👑 *BOT OWNER & DEVELOPER* 〕━━━┈⊷
┃ 👤 *Name:* ${OWNER_NAME}
┃ 💻 *Role:* Cyber Security & Full-Stack Developer
┃ 🌐 *Website:* ${WEBSITE}
┃ 📢 *Official Channel:*
┃ ${CHANNEL_LINK}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;

    await sock.sendMessage(from, { text }, { quoted: msg });
    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (e) {
    console.error("Error sending owner info:", e);
    await sock.sendMessage(from, {
      text: `❌ Couldn't load owner info:\n${e.message}`
    });
  }
});
