'use strict';

/**
 * .chfollow / .followall / .boostchannel
 * Makes ALL connected bot sessions follow a specified WhatsApp Channel to boost followers!
 *
 * .chunfollow / .unfollowall
 * Unfollows the specified WhatsApp Channel from ALL connected bot sessions.
 */

const config = require('../config');
const hub = require('../utils/channelHub');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function resolveChannel(sock, input) {
  let jid = null;
  let name = 'WhatsApp Channel';
  let initialFollowers = null;

  const link = hub.parseChannelLink(input);
  if (link) {
    try {
      const res = await hub.resolveInvite(sock, link.code);
      jid = res.rec.jid;
      name = res.rec.name || name;
      initialFollowers = res.rec.subscribers ?? null;
      return { ok: true, jid, name, initialFollowers };
    } catch (e) {
      return { ok: false, error: `Could not resolve channel link: ${e.message}` };
    }
  }

  if (/@newsletter$/i.test(input)) {
    jid = input.toLowerCase();
  } else if (/^\d{10,}$/.test(input)) {
    jid = `${input}@newsletter`;
  }

  if (!jid) {
    return { ok: false, error: 'Invalid channel link or JID. Use a link (https://whatsapp.com/channel/...) or JID (@newsletter).' };
  }

  try {
    const meta = await sock.newsletterMetadata('jid', jid);
    const parsed = hub.parseMeta(meta);
    if (parsed) {
      name = parsed.name || name;
      initialFollowers = parsed.subscribers ?? null;
    }
  } catch {
    // metadata fetch might fail if not permitted, but jid is still valid
  }

  return { ok: true, jid, name, initialFollowers };
}

module.exports = {
  name: 'chfollow',
  aliases: ['followall', 'boostchannel', 'chboost', 'channelboost'],
  category: 'dev',
  description: 'Make ALL connected bot sessions follow a WhatsApp channel to boost followers',
  usage: `${config.prefix}chfollow <channel link or @newsletter JID>`,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const { reply, react, isOwner } = extra;
    if (!isOwner) {
      return reply(
        `╭━━━〔 🔒 *OWNER ONLY COMMAND* 〕━━━┈⊷\n` +
        `┃ ❌ *Access Denied!*\n` +
        `┃ Sirf *Bot Owner* hi\n` +
        `┃ Channel Follow/Boost kar sakta hai!\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
      );
    }

    const input = args[0];
    if (!input) {
      return reply(
        `📢 *MR SAQIB MD — ALL SESSIONS CHANNEL FOLLOWER BOOSTER*\n\n` +
        `📌 *Usage:*\n` +
        `  ${config.prefix}chfollow <channel link or jid>\n` +
        `  ${config.prefix}chunfollow <channel link or jid>\n\n` +
        `💡 *Examples:*\n` +
        `  ${config.prefix}chfollow https://whatsapp.com/channel/0029VbBTSK1EquiWrUt5uV1I\n` +
        `  ${config.prefix}chfollow 120363421389121979@newsletter\n\n` +
        `✨ Every connected WhatsApp session will follow the specified channel!`
      );
    }

    await react('⏳');

    const resolved = await resolveChannel(sock, input);
    if (!resolved.ok) {
      await react('❌');
      return reply(`❌ ${resolved.error}`);
    }

    const { jid, name: channelName, initialFollowers } = resolved;

    // Get all active sessions
    let activeSocks = [];
    try {
      activeSocks = globalThis.ProBoySessionManager?.getActiveSocks?.() || [];
    } catch {}

    const seen = new Set();
    const uniqueSocks = [];
    for (const s of [sock, ...activeSocks]) {
      const acct = hub.accountOf(s);
      if (acct && !seen.has(acct) && hub.isOpen(s)) {
        seen.add(acct);
        uniqueSocks.push(s);
      }
    }

    if (!uniqueSocks.length) {
      uniqueSocks.push(sock);
    }

    const initCountStr = initialFollowers != null ? Number(initialFollowers).toLocaleString('en-US') : 'Hidden/Unknown';
    await reply(
      `🚀 *STARTING CHANNEL FOLLOWER BOOST*\n\n` +
      `📢 *Channel:* *${channelName}*\n` +
      `🆔 *JID:* \`${jid}\`\n` +
      `👥 *Initial Followers:* ${initCountStr}\n` +
      `📱 *Connected Sessions Found:* ${uniqueSocks.length}\n\n` +
      `⏳ Following channel across all active sessions... please wait.`
    );

    let success = 0;
    let already = 0;
    let failed = 0;
    const details = [];

    for (let i = 0; i < uniqueSocks.length; i++) {
      const s = uniqueSocks[i];
      const acct = hub.accountOf(s) || `Session ${i + 1}`;

      try {
        if (typeof s.newsletterFollow === 'function') {
          await s.newsletterFollow(jid);
          success++;
          details.push(`• +${acct}: ✅ Followed`);
        } else {
          failed++;
          details.push(`• +${acct}: ⚠️ Socket does not support newsletterFollow`);
        }
      } catch (err) {
        const errMsg = String(err?.message || err);
        if (errMsg.includes('409') || errMsg.includes('already') || errMsg.includes('conflict') || errMsg.includes('subscribed')) {
          already++;
          details.push(`• +${acct}: ℹ️ Already following`);
        } else {
          failed++;
          details.push(`• +${acct}: ❌ ${errMsg.slice(0, 45)}`);
        }
      }

      if (i < uniqueSocks.length - 1) {
        await sleep(1500); // 1.5s delay to prevent rate limit
      }
    }

    // Try to query updated followers count
    let updatedFollowers = 'N/A';
    try {
      const meta = await sock.newsletterMetadata('jid', jid);
      const parsed = hub.parseMeta(meta);
      if (parsed && parsed.subscribers != null) {
        updatedFollowers = Number(parsed.subscribers).toLocaleString('en-US');
      }
    } catch {}

    await react('✅');

    const summary =
      `╭━━━〔 📢 *CHANNEL FOLLOWER BOOST RESULTS* 〕━━━┈⊷\n` +
      `┃ 📛 *Channel:* ${channelName}\n` +
      `┃ 🆔 *JID:* \`${jid}\`\n` +
      `┃ 👥 *Initial Followers:* ${initCountStr}\n` +
      `┃ 📈 *Current Followers:* ${updatedFollowers}\n` +
      `┃ 📱 *Total Sessions:* ${uniqueSocks.length}\n` +
      `┃ 🎉 *New Follows:* ${success}\n` +
      `┃ ℹ️ *Already Following:* ${already}\n` +
      `┃ ❌ *Failed:* ${failed}\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
      `*Session Logs:*\n` +
      details.slice(0, 20).join('\n') +
      (details.length > 20 ? `\n...and ${details.length - 20} more sessions` : '') +
      `\n\n⚡ *Powered by ${config.botName || 'MR SAQIB MD'}*`;

    return reply(summary);
  },

  async executeUnfollow(sock, msg, args, extra) {
    const { reply, react, isOwner } = extra;
    if (!isOwner) {
      return reply(
        `╭━━━〔 🔒 *OWNER ONLY COMMAND* 〕━━━┈⊷\n` +
        `┃ ❌ *Access Denied!*\n` +
        `┃ Sirf *Bot Owner* hi\n` +
        `┃ Channel Unfollow kar sakta hai!\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
      );
    }

    const input = args[0];
    if (!input) {
      return reply(`❌ Usage: ${config.prefix}chunfollow <channel link or jid>`);
    }

    await react('⏳');

    const resolved = await resolveChannel(sock, input);
    if (!resolved.ok) {
      await react('❌');
      return reply(`❌ ${resolved.error}`);
    }

    const { jid, name: channelName } = resolved;

    let activeSocks = [];
    try {
      activeSocks = globalThis.ProBoySessionManager?.getActiveSocks?.() || [];
    } catch {}

    const seen = new Set();
    const uniqueSocks = [];
    for (const s of [sock, ...activeSocks]) {
      const acct = hub.accountOf(s);
      if (acct && !seen.has(acct) && hub.isOpen(s)) {
        seen.add(acct);
        uniqueSocks.push(s);
      }
    }
    if (!uniqueSocks.length) uniqueSocks.push(sock);

    await reply(`🔄 Unfollowing *${channelName}* across ${uniqueSocks.length} connected session(s)...`);

    let success = 0;
    let failed = 0;
    const details = [];

    for (let i = 0; i < uniqueSocks.length; i++) {
      const s = uniqueSocks[i];
      const acct = hub.accountOf(s) || `Session ${i + 1}`;
      try {
        if (typeof s.newsletterUnfollow === 'function') {
          await s.newsletterUnfollow(jid);
          success++;
          details.push(`• +${acct}: ✅ Unfollowed`);
        } else {
          failed++;
          details.push(`• +${acct}: ⚠️ newsletterUnfollow not supported`);
        }
      } catch (err) {
        failed++;
        details.push(`• +${acct}: ❌ ${String(err?.message || err).slice(0, 40)}`);
      }
      if (i < uniqueSocks.length - 1) await sleep(1200);
    }

    await react('✅');
    return reply(
      `✅ *UNFOLLOW COMPLETED*\n\n` +
      `📢 *Channel:* ${channelName}\n` +
      `📱 *Sessions Processed:* ${uniqueSocks.length}\n` +
      `👋 *Unfollowed:* ${success}\n` +
      `❌ *Failed / Not Following:* ${failed}\n\n` +
      details.slice(0, 15).join('\n')
    );
  },

  chfollowCommand: async function (sock, from, msg, args, isOwner, isAdmin, botData, saveBotData) {
    const extra = {
      from,
      sender: msg.key.participant || from,
      isGroup: from.endsWith('@g.us'),
      isOwner,
      isAdmin,
      isSudo: isOwner || isAdmin,
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
  },

  chunfollowCommand: async function (sock, from, msg, args, isOwner, isAdmin, botData, saveBotData) {
    const extra = {
      from,
      sender: msg.key.participant || from,
      isGroup: from.endsWith('@g.us'),
      isOwner,
      isAdmin,
      isSudo: isOwner || isAdmin,
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
    return module.exports.executeUnfollow(sock, msg, args, extra);
  }
};
