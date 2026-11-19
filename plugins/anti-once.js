const { cmd } = require("../command");
const config = require("../config");
const viewOnceManager = require('../utils/viewOnceManager');

cmd({
  pattern: "vv",
  alias: ["viewonce", 'retrive'],
  react: '🐳',
  desc: "Owner Only - retrieve quoted message back to user",
  category: "owner",
  filename: __filename
}, async (client, message, match, { from, isCreator, userConfig }) => {
  try {
    if (!isCreator) {
      return await client.sendMessage(from, {
        text: "*📛 This is an owner command.*"
      }, { quoted: message });
    }

    if (!match.quoted) {
      return await client.sendMessage(from, {
        text: "*🍁 Please reply to a view once message!*"
      }, { quoted: message });
    }

    const stanzaId = match.quoted?.id || match.quoted?.key?.id;
    const resolved = await viewOnceManager.resolveMedia({ quoted: match.quoted?.message, stanzaId, from, sock: client });
    let buffer = resolved?.buffer;
    let mtype = resolved?.mediaType ? `${resolved.mediaType}Message` : match.quoted.mtype;
    if (!buffer) {
      try { buffer = await match.quoted.download(); } catch (_) {}
    }

    if (!buffer || buffer.length === 0) {
      return await client.sendMessage(from, {
        text: "❌ Could not download View-Once media (media path missing or expired). Turn on `.autovv on` for automatic capture!"
      }, { quoted: message });
    }

    const originalCaption = match.quoted.text || resolved?.caption || '';
    const options = { quoted: message };

    // Get DESCRIPTION from userConfig if available, otherwise use config.DESCRIPTION
    const DESCRIPTION = userConfig?.DESCRIPTION || config.DESCRIPTION;

    let messageContent = {};
    switch (mtype) {
      case "imageMessage":
        messageContent = {
          image: buffer,
          caption: originalCaption ? `${originalCaption}\n\n> ${DESCRIPTION}` : `> ${DESCRIPTION}`,
          mimetype: match.quoted.mimetype || "image/jpeg"
        };
        break;
      case "videoMessage":
        messageContent = {
          video: buffer,
          caption: originalCaption ? `${originalCaption}\n\n> ${DESCRIPTION}` : `> ${DESCRIPTION}`,
          mimetype: match.quoted.mimetype || "video/mp4"
        };
        break;
      case "audioMessage":
        messageContent = {
          audio: buffer,
          mimetype: "audio/mp4",
          ptt: match.quoted.ptt || false
        };
        break;
      default:
        return await client.sendMessage(from, {
          text: "❌ Only image, video, and audio messages are supported"
        }, { quoted: message });
    }

    await client.sendMessage(from, messageContent, options);
  } catch (error) {
    console.error("vv Error:", error);
    await client.sendMessage(from, {
      text: "❌ Error fetching vv message:\n" + error.message
    }, { quoted: message });
  }
});

cmd({
  pattern: "vv2",
  alias: ["wah", "ohh", "oho", "🙂", "😂", "❤️", "💋", "🥵", "🌚", "😒", "nice", "ok"],
  desc: "Owner Only - retrieve quoted message back to user",
  category: "owner",
  filename: __filename
}, async (client, message, match, { from, isCreator, userConfig }) => {
  try {
    if (!isCreator) {
      return; // Simply return without any response if not owner
    }

    if (!match.quoted) {
      return await client.sendMessage(from, {
        text: "*🍁 Please reply to a view once message!*"
      }, { quoted: message });
    }

    const stanzaId = match.quoted?.id || match.quoted?.key?.id;
    const resolved = await viewOnceManager.resolveMedia({ quoted: match.quoted?.message, stanzaId, from, sock: client });
    let buffer = resolved?.buffer;
    let mtype = resolved?.mediaType ? `${resolved.mediaType}Message` : match.quoted.mtype;
    if (!buffer) {
      try { buffer = await match.quoted.download(); } catch (_) {}
    }

    if (!buffer || buffer.length === 0) {
      return await client.sendMessage(from, {
        text: "❌ Could not download View-Once media (media path missing or expired). Turn on `.autovv on` for automatic capture!"
      }, { quoted: message });
    }

    const originalCaption = match.quoted.text || resolved?.caption || '';
    const options = { quoted: message };

    // Get DESCRIPTION from userConfig if available, otherwise use config.DESCRIPTION
    const DESCRIPTION = userConfig?.DESCRIPTION || config.DESCRIPTION;

    let messageContent = {};
    switch (mtype) {
      case "imageMessage":
        messageContent = {
          image: buffer,
          caption: originalCaption ? `${originalCaption}\n\n> ${DESCRIPTION}` : `> ${DESCRIPTION}`,
          mimetype: match.quoted.mimetype || "image/jpeg"
        };
        break;
      case "videoMessage":
        messageContent = {
          video: buffer,
          caption: originalCaption ? `${originalCaption}\n\n> ${DESCRIPTION}` : `> ${DESCRIPTION}`,
          mimetype: match.quoted.mimetype || "video/mp4"
        };
        break;
      case "audioMessage":
        messageContent = {
          audio: buffer,
          mimetype: "audio/mp4",
          ptt: match.quoted.ptt || false
        };
        break;
      default:
        return await client.sendMessage(from, {
          text: "❌ Only image, video, and audio messages are supported"
        }, { quoted: message });
    }

    // Forward to user's DM
    await client.sendMessage(message.sender, messageContent, options);
  } catch (error) {
    console.error("vv Error:", error);
    await client.sendMessage(from, {
      text: "❌ Error fetching vv message:\n" + error.message
    }, { quoted: message });
  }
});
