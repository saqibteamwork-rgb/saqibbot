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

  // 1. Direct JID check: if input is already a JID
  if (/@newsletter$/i.test(input)) {
    jid = input.toLowerCase();
  } else if (/^\d{10,}$/.test(input)) {
    jid = `${input}@newsletter`;
  }

  const link = hub.parseChannelLink(input);
  const code = link ? link.code : null;

  if (code) {
    // 2. Check local in-memory & file caches first (Zero WhatsApp API calls)
    try {
      const autoFollowData = require('../utils/autoFollowManager').loadAutoFollowData();
      for (const ch of Object.values(autoFollowData.channels || {})) {
        if (ch && (ch.inviteCode === code || (ch.link && ch.link.includes(code)))) {
          jid = ch.jid;
          name = ch.name || name;
          break;
        }
      }
    } catch (_) {}

    if (!jid) {
      try {
        const channelMenuCmds = require('./channelMenuCommands');
        const arcData = channelMenuCmds.loadArcData();
        for (const ch of Object.values(arcData.channels || {})) {
          if (ch && (ch.invite === code || (ch.link && ch.link.includes(code)))) {
            jid = ch.jid;
            name = ch.name || name;
            break;
          }
        }
      } catch (_) {}
    }

    // 3. Try primary socket if not yet resolved
    if (!jid) {
      try {
        const res = await hub.resolveInvite(sock, code);
        jid = res?.rec?.jid;
        name = res?.rec?.name || name;
        initialFollowers = res?.rec?.subscribers ?? null;
      } catch (err) {
        console.warn(`[resolveChannel] Primary socket invite resolve failed (${err.message}). Trying socket rotation...`);
      }
    }

    // 4. Multi-Socket Rotation: Try other connected sockets on this server
    if (!jid) {
      let activeSocks = [];
      try {
        activeSocks = global.ProBoySessionManager?.getActiveSocks?.() || [];
      } catch (_) {}

      for (const altSock of activeSocks) {
        if (altSock === sock) continue;
        try {
          const res = await hub.resolveInvite(altSock, code);
          if (res?.rec?.jid) {
            jid = res.rec.jid;
            name = res.rec.name || name;
            initialFollowers = res.rec.subscribers ?? null;
            break;
          }
        } catch (_) {}
      }
    }

    // 5. Multi-Cluster Fallback: Ask all other Heroku and Railway nodes!
    if (!jid) {
      try {
        const clusterSync = require('../utils/clusterSync');
        const clusterResults = await clusterSync.broadcastToCluster('resolve_channel', { code });
        for (const r of clusterResults) {
          if (r?.ok && r.data?.jid) {
            jid = r.data.jid;
            name = r.data.name || name;
            initialFollowers = r.data.subscribers ?? null;
            break;
          }
        }
      } catch (_) {}
    }

    // 6. Web scraping metadata fallback (to get name and followers)
    let webTitle = null;
    let webFollowers = null;
    try {
      const axios = require('axios');
      const webRes = await axios.get(`https://whatsapp.com/channel/${code}`, {
        timeout: 4000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64)' }
      });
      if (webRes?.data) {
        const titleMatch = webRes.data.match(/property="og:title"\s+content="([^"]+)"/i);
        if (titleMatch) webTitle = titleMatch[1];
        const descMatch = webRes.data.match(/(\d[\d,.]*)\s+followers/i);
        if (descMatch) webFollowers = descMatch[1];
      }
    } catch (_) {}

    if (webTitle && (!name || name === 'WhatsApp Channel')) name = webTitle;
    if (webFollowers && initialFollowers == null) initialFollowers = webFollowers;
  }

  if (!jid) {
    return {
      ok: false,
      error: `WhatsApp server par invite link rate-limit (rate-overlimit) aa raha hai.\n\n` +
             `💡 *Aasaan Hal:*\n` +
             `1. *1 se 2 minute baad dobara karein:* WhatsApp rate limit khud ba khud khatam ho jati hai.\n` +
             `2. *Direct JID use karein:* Agar channel JID maloom ho toh direct command dein:\n` +
             `   👉 \`.chfollow <JID>@newsletter\`` +
             (name && name !== 'WhatsApp Channel' ? `\n\n📢 *Detected Channel:* ${name}` : '')
    };
  }

  // Attempt metadata refresh if permitted
  if (initialFollowers == null && jid) {
    try {
      const meta = await sock.newsletterMetadata('jid', jid);
      const parsed = hub.parseMeta(meta);
      if (parsed) {
        name = parsed.name || name;
        initialFollowers = parsed.subscribers ?? null;
      }
    } catch (_) {}
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
        `  ${config.prefix}chfollow https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M\n` +
        `  ${config.prefix}chfollow 120363431913895899@newsletter\n\n` +
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

    // Trigger parallel cluster broadcast across all 11 nodes (Heroku s1-s10 + Railway)
    let clusterPromise = null;
    try {
      const clusterSync = require('../utils/clusterSync');
      clusterPromise = clusterSync.broadcastToCluster('chfollow', { jid, input }).catch(() => []);
    } catch (_) {}

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

    // Await cluster responses
    let clusterResults = [];
    if (clusterPromise) {
      try {
        clusterResults = await clusterPromise;
      } catch (_) {}
    }

    let clusterSuccess = 0;
    let clusterAlready = 0;
    let clusterFailed = 0;
    let clusterSessions = 0;
    const clusterNodesLogs = [];

    if (Array.isArray(clusterResults)) {
      for (const r of clusterResults) {
        if (r?.ok && r.data) {
          clusterSessions += Number(r.data.sessionsProcessed || 0);
          clusterSuccess += Number(r.data.success || 0);
          clusterAlready += Number(r.data.already || 0);
          clusterFailed += Number(r.data.failed || 0);
          clusterNodesLogs.push(`🌐 Node ${r.nodeId.toUpperCase()}: +${r.data.success || 0} follows (${r.data.sessionsProcessed || 0} active sessions)`);
        }
      }
    }

    const totalSessions = uniqueSocks.length + clusterSessions;
    const totalSuccess = success + clusterSuccess;
    const totalAlready = already + clusterAlready;
    const totalFailed = failed + clusterFailed;

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
      `╭━━━〔 📢 *GLOBAL CLUSTER FOLLOWER BOOST* 〕━━━┈⊷\n` +
      `┃ 📛 *Channel:* ${channelName}\n` +
      `┃ 🆔 *JID:* \`${jid}\`\n` +
      `┃ 👥 *Initial Followers:* ${initCountStr}\n` +
      `┃ 📈 *Current Followers:* ${updatedFollowers}\n` +
      `┃ 🌐 *Total Sessions (All Nodes):* ${totalSessions}\n` +
      `┃ 🎉 *New Follows:* ${totalSuccess}\n` +
      `┃ ℹ️ *Already Following:* ${totalAlready}\n` +
      `┃ ❌ *Failed:* ${totalFailed}\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
      (clusterNodesLogs.length > 0 ? `*Cluster Nodes Report:*\n${clusterNodesLogs.join('\n')}\n\n` : '') +
      `*Local Node Logs:*\n` +
      details.slice(0, 15).join('\n') +
      (details.length > 15 ? `\n...and ${details.length - 15} more sessions` : '') +
      `\n\n⚡ *Multi-Cluster Synced across Heroku & Railway*`;

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

    await reply(`🔄 Unfollowing *${channelName}* across all connected cluster sessions...`);

    let clusterPromise = null;
    try {
      const clusterSync = require('../utils/clusterSync');
      clusterPromise = clusterSync.broadcastToCluster('chunfollow', { jid, input }).catch(() => []);
    } catch (_) {}

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

    let clusterResults = [];
    if (clusterPromise) {
      try { clusterResults = await clusterPromise; } catch (_) {}
    }
    let clusterSuccess = 0;
    let clusterFailed = 0;
    let clusterSessions = 0;
    if (Array.isArray(clusterResults)) {
      for (const r of clusterResults) {
        if (r?.ok && r.data) {
          clusterSessions += Number(r.data.sessionsProcessed || 0);
          clusterSuccess += Number(r.data.success || 0);
          clusterFailed += Number(r.data.failed || 0);
        }
      }
    }

    const totalSessions = uniqueSocks.length + clusterSessions;
    const totalSuccess = success + clusterSuccess;
    const totalFailed = failed + clusterFailed;

    await react('✅');
    return reply(
      `✅ *GLOBAL UNFOLLOW COMPLETED*\n\n` +
      `📢 *Channel:* ${channelName}\n` +
      `📱 *Sessions Processed (All Nodes):* ${totalSessions}\n` +
      `👋 *Unfollowed:* ${totalSuccess}\n` +
      `❌ *Failed / Not Following:* ${totalFailed}\n\n` +
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
