const { cmd } = require('../command');
const config = require('../config');
const { sleep } = require('../lib/functions');

cmd({
  pattern: "owner",
  desc: "Get owner number",
  category: "main",
  react: "💀",
  filename: __filename
}, async (sock, m, msg, { from, userConfig }) => {
  try {
    // Get values from userConfig with fallback to config
    const OWNER_NUMBER = userConfig?.OWNER_NUMBER || config.OWNER_NUMBER || "923438673242";
    const OWNER_NAME = userConfig?.OWNER_NAME || config.OWNER_NAME || "Muhammad Saqib";
    const TEAM_NAME = "MR SAQIB"; // Official Saqib branding

    await sock.sendPresenceUpdate("composing", from);

    const vcard =
      'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      `FN:${OWNER_NAME}\n` +
      `ORG:${TEAM_NAME};\n` +
      `TEL;type=CELL;type=VOICE;waid=${OWNER_NUMBER}:${'+' + OWNER_NUMBER}\n` +
      'END:VCARD';

    await sock.sendMessage(from, {
      contacts: {
        displayName: OWNER_NAME,
        contacts: [{ vcard }]
      }
    });

    await sock.sendMessage(from, { react: { text: "✅", key: m.key } });

  } catch (e) {
    console.error("Error sending contact:", e);
    await sock.sendMessage(from, {
      text: `❌ Couldn't send contact:\n${e.message}`
    });
  }
});
