'use strict';

/**
 * .cfch - Directly forward/post any media or text to a specified WhatsApp Channel.
 *
 * Supports:
 * - Voice Notes (PTT)
 * - Audio
 * - Images (with caption)
 * - Videos / GIFs (with caption)
 * - Documents (PDF, APK, zip, etc. with filename)
 * - Stickers
 * - Text / Links
 *
 * Usage:
 *   Reply to any message with:
 *     .cfch <channel link or @newsletter JID> [optional custom caption]
 *   Or send directly:
 *     .cfch <channel link or @newsletter JID> <your text message>
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../config');
const hub = require('../utils/channelHub');

module.exports = {
  name: 'cfch',
  aliases: ['cpost', 'chpost', 'postch', 'forwardch', 'fwdch', 'chdirect'],
  category: 'channels',
  description: 'Directly forward or post any media (voice, image, video, audio, doc, sticker, text) to a specified WhatsApp Channel',
  usage: `${config.prefix || '.'}cfch <channel link or jid> [optional caption]`,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    const { reply, react, from } = extra;
    const isAllowed = extra.isOwner || extra.isSessionOwner || extra.isSudo || msg?.key?.fromMe;
    if (!isAllowed) {
      return reply('❌ *Access Denied:*\nSirf Bot Owner ya is session ka paired user hi channel mein post kar sakta hai.');
    }

    // Identify channel link / JID from args
    const channelRegex = /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{8,})/i;
    let channelInput = null;
    let captionOverride = null;

    const channelArgIdx = args.findIndex(a => channelRegex.test(a) || /@newsletter$/i.test(a) || /^\d{10,}$/.test(a));
    if (channelArgIdx !== -1) {
      channelInput = args[channelArgIdx];
      const remaining = [...args.slice(0, channelArgIdx), ...args.slice(channelArgIdx + 1)];
      captionOverride = remaining.join(' ').trim() || null;
    } else if (args.length > 0) {
      channelInput = args[0];
      captionOverride = args.slice(1).join(' ').trim() || null;
    }

    if (!channelInput) {
      return reply(
        `╭━━━〔 📢 *CHANNEL DIRECT POST (.cfch)* 〕━━━┈⊷\n` +
        `┃ 📌 *Tarika-e-Istemal (Usage):*\n` +
        `┃ 👉 Kisi bhi Voice Note, Image, Video, Audio,\n` +
        `┃    Document, Sticker ya Text ko *REPLY* karein:\n` +
        `┃    *${config.prefix || '.'}cfch <channel_link>*\n` +
        `┃\n` +
        `┃ 📝 *Optional New Caption:*\n` +
        `┃    *${config.prefix || '.'}cfch <channel_link> Aapka naya caption*\n` +
        `┃\n` +
        `┃ 💬 *Direct Text Post:*\n` +
        `┃    *${config.prefix || '.'}cfch <channel_link> Aapka text message*\n` +
        `┃\n` +
        `┃ 💡 *Example:*\n` +
        `┃ ${config.prefix || '.'}cfch https://whatsapp.com/channel/0029Va... Subah Bakhair!\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
        `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
      );
    }

    let targetJid = null;
    let channelName = 'WhatsApp Channel';

    const linkParsed = hub.parseChannelLink(channelInput);
    if (linkParsed?.code) {
      await react('⏳');
      try {
        const res = await hub.resolveInvite(sock, linkParsed.code);
        targetJid = res.rec?.jid || res.meta?.jid;
        channelName = res.rec?.name || res.meta?.name || channelName;
      } catch (err) {
        await react('❌');
        return reply(`❌ *Channel Link Resolve Failed:*\nLink galat hai ya channel nahi mila.\n\nError: ${err.message}`);
      }
    } else if (/@newsletter$/i.test(channelInput)) {
      targetJid = channelInput.toLowerCase();
    } else if (/^\d{8,}$/.test(channelInput)) {
      targetJid = `${channelInput}@newsletter`;
    }

    if (!targetJid) {
      await react('❌');
      return reply(`❌ *Invalid Channel Link:*\nSahi WhatsApp Channel link ya @newsletter JID dein.`);
    }

    // Try to get fresh channel metadata if name is default
    try {
      const meta = await sock.newsletterMetadata('jid', targetJid);
      const parsedMeta = hub.parseMeta(meta);
      if (parsedMeta?.name) channelName = parsedMeta.name;
    } catch {}

    const content = extra?.utils?.getMessageContent ? extra.utils.getMessageContent(msg) : msg.message;
    const ctx = content?.extendedTextMessage?.contextInfo || content?.conversation?.contextInfo || null;
    const quoted = ctx?.quotedMessage;

    let post = null;
    let tmpFile = null;

    if (quoted) {
      const d = hub.describeContent(quoted);
      if (!d || d.unsupported) {
        await react('❌');
        return reply(`❌ Ye message format channel par post nahi ho sakta (Supported: Voice, Audio, Image, Video, Document, Sticker, Text).`);
      }
      post = { ...d };
      if (captionOverride) {
        if (post.type === 'conversation' || post.type === 'extendedTextMessage') {
          post.text = captionOverride;
        } else {
          post.caption = captionOverride;
        }
      }

      if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(post.type)) {
        await react('⏳');
        // Primary media download
        let saved = await hub.saveMedia(sock, { remoteJid: from, id: ctx.stanzaId, participant: ctx.participant }, quoted, `cfch_${Date.now()}`);

        // Fallback media download if needed
        if (!saved?.path) {
          try {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const unwrapQuoted = hub.unwrap(quoted);
            const rawMedia = unwrapQuoted?.[post.type];
            if (rawMedia) {
              const downloadType = post.type === 'stickerMessage' ? 'sticker' : post.type.replace('Message', '');
              const stream = await downloadContentFromMessage(rawMedia, downloadType);
              let buffer = Buffer.from([]);
              for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
              if (buffer && buffer.length) {
                const ext = post.type === 'stickerMessage' ? 'webp' :
                            post.type === 'imageMessage' ? 'jpg' :
                            post.type === 'videoMessage' ? 'mp4' :
                            post.type === 'audioMessage' ? (post.mime?.includes('ogg') ? 'ogg' : 'mp3') :
                            (post.fileName?.split('.').pop() || 'bin');
                const fallbackFile = path.join(hub.MEDIA_DIR || os.tmpdir(), `${Date.now()}_cfch.${ext}`);
                fs.writeFileSync(fallbackFile, buffer);
                saved = { path: fallbackFile };
              }
            }
          } catch (e) {
            console.error('[cfch download fallback]', e);
          }
        }

        if (!saved?.path) {
          await react('❌');
          return reply(`❌ Media download fail ho gaya. File bohot bari ho sakti hai ya WhatsApp par expire ho chuki hai.`);
        }
        tmpFile = saved.path;
      }
    } else {
      // Direct message with media attachment
      const d = hub.describeContent(msg.message);
      if (d && !d.unsupported && ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(d.type)) {
        post = { ...d };
        if (captionOverride) post.caption = captionOverride;
        await react('⏳');
        let saved = await hub.saveMedia(sock, { remoteJid: from, id: msg.key.id, participant: msg.key.participant }, msg.message, `cfch_${Date.now()}`);
        if (!saved?.path) {
          try {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const unwrapMsg = hub.unwrap(msg.message);
            const rawMedia = unwrapMsg?.[post.type];
            if (rawMedia) {
              const downloadType = post.type === 'stickerMessage' ? 'sticker' : post.type.replace('Message', '');
              const stream = await downloadContentFromMessage(rawMedia, downloadType);
              let buffer = Buffer.from([]);
              for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
              if (buffer && buffer.length) {
                const ext = post.type === 'stickerMessage' ? 'webp' :
                            post.type === 'imageMessage' ? 'jpg' :
                            post.type === 'videoMessage' ? 'mp4' :
                            post.type === 'audioMessage' ? (post.mime?.includes('ogg') ? 'ogg' : 'mp3') :
                            (post.fileName?.split('.').pop() || 'bin');
                const fallbackFile = path.join(hub.MEDIA_DIR || os.tmpdir(), `${Date.now()}_cfch.${ext}`);
                fs.writeFileSync(fallbackFile, buffer);
                saved = { path: fallbackFile };
              }
            }
          } catch (e) {}
        }
        if (!saved?.path) {
          await react('❌');
          return reply(`❌ Media download fail ho gaya.`);
        }
        tmpFile = saved.path;
      } else if (captionOverride) {
        post = { type: 'conversation', text: captionOverride };
      } else {
        await react('❌');
        return reply(
          `ℹ️ *Koi media ya text nahi mila!*\n\n` +
          `👉 Kisi Voice Note, Image, Video, Audio, Document ya Sticker ko reply karke likhein:\n` +
          `*${config.prefix || '.'}cfch ${channelInput}*\n\n` +
          `👉 Ya direct text post karein:\n` +
          `*${config.prefix || '.'}cfch ${channelInput} Aapka message*`
        );
      }
    }

    try {
      await react('⏳');
      hub.registerSock(sock);

      const res = await hub.postToChannel(sock, targetJid, post, tmpFile, { fwd: null });

      if (!res.ok) {
        await react('❌');
        return reply(
          `╭━━━〔 ❌ *CHANNEL POST FAILED* 〕━━━┈⊷\n` +
          `┃ ⚠️ *Error:* ${res.error || 'Unknown Error'}\n` +
          `┃ 📢 *Target:* ${channelName}\n` +
          `┃\n` +
          `┃ 💡 *Wajah (Possible Reason):*\n` +
          `┃ 1. Aapka ye WhatsApp number is channel ka\n` +
          `┃    *Admin ya Owner* nahi hai.\n` +
          `┃ 2. WhatsApp ne channel par media allow nahi kiya.\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        );
      }

      await react('✅');
      const prettyType = post.type === 'audioMessage' ? (post.ptt ? '🎙️ VOICE NOTE' : '🎵 AUDIO') :
                         post.type === 'imageMessage' ? '🖼️ IMAGE' :
                         post.type === 'videoMessage' ? (post.gif ? '🎞️ GIF' : '🎥 VIDEO') :
                         post.type === 'documentMessage' ? '📄 DOCUMENT' :
                         post.type === 'stickerMessage' ? '🏷️ STICKER' : '📝 TEXT';

      const serverIdLine = res.serverId ? `\n┃ 📌 *Post ID:* #${res.serverId}` : '';
      const captionLine = post.caption ? `\n┃ 💬 *Caption:* ${post.caption.slice(0, 80)}${post.caption.length > 80 ? '...' : ''}` : '';
      const textLine = post.text && post.type !== 'audioMessage' ? `\n┃ 💬 *Text:* ${post.text.slice(0, 80)}${post.text.length > 80 ? '...' : ''}` : '';

      return reply(
        `╭━━━〔 📢 *CHANNEL POST SUCCESSFUL* 〕━━━┈⊷\n` +
        `┃ ✅ *Direct Channel Post Sent!*\n` +
        `┃ 📢 *Channel:* ${channelName}\n` +
        `┃ 🆔 \`${targetJid}\`\n` +
        `┃ 📁 *Type:* ${prettyType}${serverIdLine}${captionLine}${textLine}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
        `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
      );
    } catch (e) {
      console.error('[cfch]', e);
      await react('❌');
      return reply(`❌ Error posting to channel: ${e.message}`);
    } finally {
      if (tmpFile && fs.existsSync(tmpFile)) {
        try { fs.unlinkSync(tmpFile); } catch {}
      }
    }
  },

  cfchCommand: async function (sock, from, msg, args, isOwner, isAdmin, botData, saveBotData, isSessionOwner = false) {
    const extra = {
      from,
      sender: msg.key.participant || from,
      isGroup: from.endsWith('@g.us'),
      isOwner,
      isAdmin,
      isSessionOwner,
      isSudo: isOwner || isAdmin || isSessionOwner,
      database: {
        getGlobalSetting: (key) => (botData ? botData[key] : null),
        setGlobalSetting: (key, val) => {
          if (botData) botData[key] = val;
          if (typeof saveBotData === 'function') saveBotData();
        }
      },
      reply: (text) => sock.sendMessage(from, { text: typeof text === 'string' ? text : JSON.stringify(text) }, { quoted: msg }),
      react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
    };
    return module.exports.execute(sock, msg, args, extra);
  }
};
