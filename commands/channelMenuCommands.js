'use strict';

/**
 * MR SAQIB MD :: ADVANCED CHANNEL AUTO REACT & AUTO JOIN ENGINE
 * ============================================================================
 * Commands:
 * - .arc add <link> [emojis] [count] [delay=5s] <passcode>
 * - .arclist
 * - .arcdel <link>
 * - .arcstop <link|all>
 * - .arcstart <link|all>
 * - .chautojoin <link> / .autojoin <link> / .chjoin <link>
 * - .chreact, .chreactall, .chunreact
 * - .pollrand, .pollunvote, .pollvfix, .pollvinfo, .pollvote, .pollvstop
 * ============================================================================
 */

const fs = require('fs-extra');
const path = require('path');
const hub = require('../utils/channelHub');
const { 
  executeMultiSessionReaction, 
  executeMultiSessionChannelPollVote,
  extractQuotedPoll,
  getActiveSockets 
} = require('./chreact');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ARC_FILE = path.join(DATA_DIR, 'channel_arc.json');

fs.ensureDirSync(DATA_DIR);

function loadArcData() {
  try {
    if (fs.existsSync(ARC_FILE)) {
      const data = fs.readJsonSync(ARC_FILE) || {};
      if (!data.channels) data.channels = {};
      if (!data.blocked) data.blocked = {};
      if (typeof data.enabled !== 'boolean') data.enabled = true;
      if (!data.passcode) data.passcode = 'arc123';
      return data;
    }
  } catch (e) {
    console.error('[ARC Load Error]:', e.message);
  }
  return {
    enabled: true,
    locked: false,
    passcode: 'arc123',
    channels: {},      // { [jid]: { jid, name, link, emojis: ['❤️','🔥'], count: 3, delayMs: 5000, enabled: true, lastReactedId: '' } }
    blocked: {},       // { [jid]: true }
    defaultEmoji: '❤️'
  };
}

function saveArcData(data) {
  try {
    fs.writeJsonSync(ARC_FILE, data, { spaces: 2 });
  } catch (e) {
    console.error('[ARC Save Error]:', e.message);
  }
}

function parseDelay(str) {
  if (!str) return 5000;
  const num = parseInt(str.replace(/[^0-9]/g, ''), 10);
  if (isNaN(num) || num <= 0) return 5000;
  if (str.toLowerCase().includes('m')) return num * 60 * 1000;
  if (str.toLowerCase().includes('s')) return num * 1000;
  if (num < 100) return num * 1000; // e.g. 5 -> 5000ms
  return num;
}

function normalizeChannelInput(str) {
  if (!str) return null;
  const linkMatch = str.match(/whatsapp\.com\/channel\/([0-9A-Za-z_-]+)/i);
  if (linkMatch) return { code: linkMatch[1], raw: str };
  const jidMatch = str.match(/([0-9]+@newsletter)/i);
  if (jidMatch) return { jid: jidMatch[1], raw: str };
  if (/^[0-9]+$/.test(str.trim())) return { jid: `${str.trim()}@newsletter`, raw: str };
  return null;
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const withTimeout = (promise, ms = 6000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), ms))
]);
const arcReactedPosts = new Set();

/**
 * Automatically joins/follows a channel across ALL connected bot accounts (parallel & timeout-guarded)
 */
async function joinChannelAcrossAllSessions(primarySock, targetJid, inviteCode = null) {
  const uniqueSocks = getActiveSockets(primarySock);
  const results = [];

  await Promise.allSettled(uniqueSocks.map(async (s) => {
    const acct = hub.accountOf(s) || 'Session';
    try {
      if (typeof s.newsletterFollow === 'function') {
        await withTimeout(s.newsletterFollow(targetJid), 5000).catch(() => {});
      }
      if (typeof s.subscribeNewsletterUpdates === 'function') {
        await withTimeout(s.subscribeNewsletterUpdates(targetJid), 5000).catch(() => {});
      }
      results.push({ account: acct, success: true });
    } catch (e) {
      results.push({ account: acct, success: false, error: e.message });
    }
  }));

  return { uniqueSocks, results };
}

/**
 * Silently executes multi-session reactions on incoming newsletter posts
 * according to the channel's ARC configuration.
 */
async function executeArcAutoReaction(primarySock, channelJid, serverId, conf) {
  if (!channelJid || !serverId || !conf) return;
  const postKey = `${channelJid}:${serverId}`;
  if (arcReactedPosts.has(postKey)) return;
  arcReactedPosts.add(postKey);

  if (arcReactedPosts.size > 500) {
    const firstKey = arcReactedPosts.values().next().value;
    arcReactedPosts.delete(firstKey);
  }

  // Delay if configured (default: 1500ms)
  const delayMs = conf.delayMs || 1500;
  if (delayMs > 0) {
    await sleep(delayMs);
  }

  const uniqueSocks = getActiveSockets(primarySock);
  const emojis = (Array.isArray(conf.emojis) && conf.emojis.length > 0)
    ? conf.emojis
    : (conf.emoji ? [conf.emoji] : ['❤️', '🔥', '👍', '😍', '👏']);

  const targetCount = (conf.count && conf.count > 0)
    ? Math.min(conf.count, uniqueSocks.length)
    : uniqueSocks.length;

  console.log(`[ARC Auto-React] ⚡ Channel: ${conf.name || channelJid} | Post ID: ${serverId} | Sessions: ${targetCount} | Emojis: ${emojis.join(' ')}`);

  let successCount = 0;
  for (let i = 0; i < targetCount; i++) {
    const s = uniqueSocks[i];
    const emoji = emojis[i % emojis.length];
    try {
      if (typeof s.newsletterFollow === 'function') {
        await withTimeout(s.newsletterFollow(channelJid), 4000).catch(() => {});
      }
      if (typeof s.newsletterReactMessage === 'function') {
        await withTimeout(s.newsletterReactMessage(channelJid, String(serverId), emoji), 5000);
        successCount++;
      }
    } catch (e) {
      console.error(`[ARC Reaction Error] Session ${hub.accountOf(s)} failed:`, e.message);
    }
    if (i < targetCount - 1) {
      await sleep(250);
    }
  }

  console.log(`[ARC Auto-React] ✅ Done: ${successCount}/${targetCount} reacted on post ${serverId}`);
}

// 1. .arc [add | list | del | stop | on | off] - Main Controller
async function arcCommand(sock, from, msg, isOwner, args = []) {
  const data = loadArcData();
  const subCmd = (args[0] || '').toLowerCase();

  // Show list if: .arc list
  if (subCmd === 'list' || subCmd === 'ls') {
    return await arclistCommand(sock, from, msg);
  }

  // Delete if: .arc del <link>
  if (subCmd === 'del' || subCmd === 'delete' || subCmd === 'remove' || subCmd === 'rm') {
    return await arcdelCommand(sock, from, msg, isOwner, args.slice(1));
  }

  // Stop if: .arc stop [link|all]
  if (subCmd === 'stop' || subCmd === 'pause') {
    return await arcstopCommand(sock, from, msg, isOwner, args.slice(1));
  }

  // Start if: .arc start [link|all]
  if (subCmd === 'start' || subCmd === 'resume') {
    return await arcstartCommand(sock, from, msg, isOwner, args.slice(1));
  }

  // Global toggle: .arc on / .arc off
  if (subCmd === 'on') {
    data.enabled = true;
    saveArcData(data);
    return await sock.sendMessage(from, { text: "✅ *Auto Channel Reaction (ARC) ENABLE ho gaya!*" }, { quoted: msg });
  }
  if (subCmd === 'off') {
    data.enabled = false;
    saveArcData(data);
    return await sock.sendMessage(from, { text: "🛑 *Auto Channel Reaction (ARC) DISABLE ho gaya!*" }, { quoted: msg });
  }

  // ---------------------------------------------------------------------------
  // .arc <link> OR .arc add <link> [emojis] [count] [delay=3s]
  // ---------------------------------------------------------------------------
  if (subCmd === 'add' || (args[0] && normalizeChannelInput(args[0]) !== null)) {
    if (!isOwner) {
      return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner channels add kar sakta hai!*" }, { quoted: msg });
    }

    if (data.locked) {
      return await sock.sendMessage(from, { text: "🔒 *ARC settings locked hain! Pehle `.arcunlock` karein.*" }, { quoted: msg });
    }

    // Shift arguments if user typed `.arc add ...` vs `.arc <link> ...`
    const rawParams = subCmd === 'add' ? args.slice(1) : args;
    const rawLink = rawParams[0];

    if (!rawLink) {
      return await sock.sendMessage(from, {
        text:
`╭━━━〔 📌 *ARC USAGE GUIDE* 〕━━━┈⊷
┃ 👉 *.arc <channel_link>*
┃ 👉 *.del arc <channel_link>*
┃
┃ 📋 *Examples:*
┃ • \`.arc https://whatsapp.com/channel/0029Va...\`
┃ • \`.del arc https://whatsapp.com/channel/0029Va...\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
      }, { quoted: msg });
    }

    const norm = normalizeChannelInput(rawLink);
    if (!norm) {
      return await sock.sendMessage(from, { text: "❌ *Invalid channel link ya JID!*" }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

    let targetJid = norm.jid;
    let channelName = 'WhatsApp Channel';
    let inviteCode = norm.code || null;

    // Extract link preview metadata if attached by WhatsApp client
    const extMsg = msg?.message?.extendedTextMessage || msg?.message?.ephemeralMessage?.message?.extendedTextMessage || {};
    const previewTitle = extMsg?.title || extMsg?.contextInfo?.forwardedNewsletterMessageInfo?.newsletterName || null;
    const previewJid = extMsg?.contextInfo?.forwardedNewsletterMessageInfo?.newsletterJid || null;
    if (previewTitle && typeof previewTitle === 'string') {
      channelName = previewTitle.replace(/\s*\|\s*WhatsApp Channel$/i, '').trim() || channelName;
    }
    if (!targetJid && previewJid && String(previewJid).endsWith('@newsletter')) {
      targetJid = previewJid;
    }

    // 1. Check local caches first for 0ms instant resolution (ARC list, channels_v1.json, my_admin_channels.json)
    if (norm.code && !targetJid) {
      try {
        const existingArc = Object.values(data.channels || {}).find(c =>
          c && (c.invite === norm.code || (c.link && c.link.includes(norm.code))) && c.jid && !c.jid.startsWith(norm.code)
        );
        if (existingArc) {
          targetJid = existingArc.jid;
          if (existingArc.name && existingArc.name !== 'WhatsApp Channel') channelName = existingArc.name;
        }
      } catch {}
    }

    if (norm.code && !targetJid) {
      try {
        const cachedList = typeof hub.listChannels === 'function' ? hub.listChannels() : [];
        const cached = cachedList.find(c => c && (c.invite === norm.code || (c.link && c.link.includes(norm.code))) && c.jid);
        if (cached) {
          targetJid = cached.jid;
          if (cached.name) channelName = cached.name;
        }
      } catch {}
    }

    if (norm.code && !targetJid) {
      try {
        if (typeof hub.readAdminFile === 'function') {
          const adminDoc = hub.readAdminFile() || {};
          for (const acc of Object.values(adminDoc.accounts || {})) {
            const found = (acc.channels || []).find(c =>
              c && (c.invite === norm.code || (c.link && c.link.includes(norm.code))) && c.jid
            );
            if (found) {
              targetJid = found.jid;
              if (found.name) channelName = found.name;
              break;
            }
          }
        }
      } catch {}
    }

    // 2. ONLY if still not resolved from local cache, try fast sync + single 2.5s metadata lookup
    if (norm.code && !targetJid) {
      try {
        if (typeof hub.syncMyChannels === 'function') {
          await withTimeout(hub.syncMyChannels(sock, { force: true }), 2500);
          const syncedList = typeof hub.listChannels === 'function' ? hub.listChannels() : [];
          const synced = syncedList.find(c => c && (c.invite === norm.code || (c.link && c.link.includes(norm.code))) && c.jid);
          if (synced) {
            targetJid = synced.jid;
            if (synced.name) channelName = synced.name;
          }
        }
      } catch {}

      if (!targetJid) {
        try {
          if (typeof sock.newsletterMetadata === 'function') {
            const rawMeta = await withTimeout(sock.newsletterMetadata('invite', norm.code), 2500);
            const parsedMeta = (typeof hub.parseMeta === 'function' ? hub.parseMeta(rawMeta) : null) || rawMeta;
            if (parsedMeta?.jid || parsedMeta?.id) {
              targetJid = parsedMeta.jid || parsedMeta.id;
              const n = parsedMeta.name || rawMeta?.thread_metadata?.name?.text;
              if (typeof n === 'string' && n) channelName = n;
              inviteCode = parsedMeta.invite || rawMeta?.thread_metadata?.invite || inviteCode;
            }
          }
        } catch {}
      }

      // Guaranteed instant fallback so .arc never gets stuck or fails if WhatsApp GraphQL invite lookup times out
      if (!targetJid) {
        targetJid = `${norm.code}@newsletter`;
      }
    } else if (targetJid && (!inviteCode || channelName === 'WhatsApp Channel')) {
      try {
        const cachedList = typeof hub.listChannels === 'function' ? hub.listChannels() : [];
        const cached = cachedList.find(c => c && c.jid === targetJid);
        if (cached) {
          if (cached.name && channelName === 'WhatsApp Channel') channelName = cached.name;
          if (cached.invite && !inviteCode) inviteCode = cached.invite;
        }
      } catch {}
    }

    if (!targetJid) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
      return await sock.sendMessage(from, { text: "❌ *Channel resolve nahi ho saka!*" }, { quoted: msg });
    }

    // Parse options: emojis, count, delay
    let emojisArg = rawParams[1] || '❤️,🔥,👍,😍,👏';
    let countArg = rawParams[2] || 'all';
    let delayArg = rawParams[3] || '2s';

    // Handle shifting if a param was skipped
    if (emojisArg && (emojisArg.endsWith('s') || /^[0-9]+$/.test(emojisArg))) {
      countArg = emojisArg;
      emojisArg = '❤️,🔥,👍,😍,👏';
    }

    const emojisList = emojisArg.split(/[\s,]+/).filter(Boolean);
    const delayMs = parseDelay(delayArg);
    const count = (countArg.toLowerCase() === 'all' || isNaN(parseInt(countArg, 10))) ? 0 : parseInt(countArg, 10);

    // Save ARC Channel data immediately so nothing blocks confirmation!
    data.enabled = true;
    if (data.blocked && data.blocked[targetJid]) {
      delete data.blocked[targetJid];
    }
    if (!data.channels) data.channels = {};
    const canonicalLink = inviteCode ? `https://whatsapp.com/channel/${inviteCode}` : rawLink;
    data.channels[targetJid] = {
      jid: targetJid,
      name: channelName,
      invite: inviteCode,
      link: canonicalLink,
      emojis: emojisList.length > 0 ? emojisList : ['❤️', '🔥', '👍', '😍', '👏'],
      count: count,
      delayMs: delayMs,
      delayStr: `${Math.round(delayMs / 1000)}s`,
      enabled: true,
      addedAt: Date.now(),
      lastPostId: null
    };

    saveArcData(data);

    const totalSessions = getActiveSockets(sock).length;

    // Immediately react ✅ and send confirmation message!
    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

    await sock.sendMessage(from, {
      text:
`╭━━━〔 ✅ *CHANNEL AUTO-REACT ADDED* 〕━━━┈⊷
┃ 📢 *Channel:* *${channelName}*
┃ 🆔 *JID:* \`${targetJid}\`
┃ ✨ *Emojis:* ${emojisList.join(' ')}
┃ 👥 *Active Sessions:* ${totalSessions} Bot Accounts
┃ 📲 *Self-Inbox (.chreact):* 03438673242 (You)
┃ 🟢 *Status:* Active & Monitoring
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

💡 *Ab is channel me jab bhi koi post hogi:*
1️⃣ Ye bot khud bhi auto-react karega
2️⃣ *03438673242 (You)* inbox me \`.chreact <post_link>\` send hoga taake dusre bots se bhi auto reacts jayein!

🗑️ *Remove karne ke liye:*
👉 \`.del arc ${canonicalLink}\``
    }, { quoted: msg });

    // Auto Follow/Join across all connected bot accounts in background (non-blocking)
    joinChannelAcrossAllSessions(sock, targetJid, inviteCode).catch(() => {});
    return;
  }

  // Default Status Dashboard
  const status = data.enabled ? '🟢 Active' : '🔴 Stopped';
  const count = Object.keys(data.channels || {}).length;
  const text =
`╭━━━〔 📢 *AUTO CHANNEL REACTION (ARC)* 〕━━━┈⊷
┃ 📊 *Global Status:* ${status}
┃ 🔒 *Lock:* ${data.locked ? 'Locked' : 'Unlocked'}
┃ 📺 *Monitored Channels:* ${count}
┃ 🚫 *Blocked Channels:* ${Object.keys(data.blocked || {}).length}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

📌 *Usage:*
👉 *.arc <channel_link>* ➔ Channel auto-react me add karein
👉 *.del arc <channel_link>* ➔ Channel auto-react se remove karein
👉 *.arclist* ➔ Added channels ki list dekhein`;

  await sock.sendMessage(from, { text }, { quoted: msg });
}

// 2. .arclist - List all monitored channels
async function arclistCommand(sock, from, msg) {
  const data = loadArcData();
  const entries = Object.entries(data.channels || {});

  if (!entries.length) {
    return await sock.sendMessage(from, {
      text:
`╭━━━〔 📢 *ARC MONITORED CHANNELS* 〕━━━┈⊷
┃ 📭 Abhi tak koi channel ARC mein shamil nahi hai.
┃
┃ 💡 *Add Karne Ka Tarika:*
┃ 👉 \`.arc add <channel_link> ❤️,🔥 3 5s\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
  }

  let text = `╭━━━〔 📢 *ARC MONITORED CHANNELS (${entries.length})* 〕━━━┈⊷\n`;
  entries.forEach(([jid, c], idx) => {
    const state = c.enabled ? '🟢 Active' : '🔴 Paused';
    const emojis = (c.emojis || []).join(' ') || '❤️';
    const delay = c.delayStr || `${Math.round((c.delayMs || 5000) / 1000)}s`;
    const count = c.count === 0 ? 'All Sessions' : `${c.count}x`;

    text += `┃\n`;
    text += `┃ ${idx + 1}. *${c.name || 'Channel'}* (${state})\n`;
    text += `┃    🆔 \`${jid}\`\n`;
    text += `┃    ✨ React: ${emojis} | 🔢 ${count} | ⏳ ${delay}\n`;
  });
  text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n`;
  text += `💡 *Commands:* \`.arcdel <jid>\`  |  \`.arcstop <jid|all>\`  |  \`.arcstart <jid|all>\``;

  await sock.sendMessage(from, { text }, { quoted: msg });
}

// 3. .del arc <link|jid> / .arcdel <link|jid> / .delarc <link|jid> - Delete channel from ARC
async function arcdelCommand(sock, from, msg, isOwner, args = []) {
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner delete kar sakta hai!*" }, { quoted: msg });

  const raw = args[0] || '';
  if (!raw) return await sock.sendMessage(from, { text: "❌ *Usage:* `.del arc <channel_link>` ya `.arcdel <channel_link>`" }, { quoted: msg });

  const norm = normalizeChannelInput(raw);
  const data = loadArcData();
  let targetJid = norm?.jid;

  // 1. Direct match by saved invite code or link in data.channels
  if (!targetJid && norm?.code && data.channels) {
    const byInvite = Object.keys(data.channels).find(k => {
      const c = data.channels[k];
      return c && (c.invite === norm.code || (c.link && c.link.includes(norm.code)));
    });
    if (byInvite) targetJid = byInvite;
  }

  // 2. Fallback: resolve via newsletterMetadata with timeout
  if (!targetJid && norm?.code) {
    try {
      if (typeof sock.newsletterMetadata === 'function') {
        const rawMeta = await withTimeout(sock.newsletterMetadata('invite', norm.code), 5000);
        const parsedMeta = (typeof hub.parseMeta === 'function' ? hub.parseMeta(rawMeta) : null) || rawMeta;
        if (parsedMeta?.jid || parsedMeta?.id) {
          targetJid = parsedMeta.jid || parsedMeta.id;
        }
      }
    } catch {}
  }
  if (!targetJid) targetJid = raw;

  if (!data.channels?.[targetJid]) {
    // Try search by name, link, invite, or partial jid
    const foundKey = Object.keys(data.channels || {}).find(k => {
      const c = data.channels[k] || {};
      return k.includes(targetJid) ||
        (norm?.code && (c.invite === norm.code || (c.link && c.link.includes(norm.code)))) ||
        (c.link && c.link.toLowerCase().includes(raw.toLowerCase())) ||
        (c.name && c.name.toLowerCase().includes(raw.toLowerCase()));
    });
    if (foundKey) targetJid = foundKey;
  }

  if (!data.channels?.[targetJid]) {
    return await sock.sendMessage(from, { text: `ℹ️ *Ye channel ARC (Auto-React) list mein nahi mila!*` }, { quoted: msg });
  }

  const name = data.channels[targetJid].name || targetJid;
  delete data.channels[targetJid];
  saveArcData(data);

  await sock.sendMessage(from, {
    text: `✅ *Channel "${name}" successfully Auto-React (.arc) list se remove kar diya gaya hai!*\n\n🛑 Ab is channel ki posts par auto-react ya .chreact link send nahi hoga.`
  }, { quoted: msg });
}

// 4. .arcstop <link|all> - Stop auto-reaction
async function arcstopCommand(sock, from, msg, isOwner, args = []) {
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner ye command use kar sakta hai!*" }, { quoted: msg });

  const target = (args[0] || '').toLowerCase();
  const data = loadArcData();

  if (!target || target === 'all') {
    data.enabled = false;
    Object.keys(data.channels || {}).forEach(k => { data.channels[k].enabled = false; });
    saveArcData(data);
    return await sock.sendMessage(from, {
      text: "🛑 *ARC STOPPED!* Tamam channels par auto-reaction band kar diya gaya hai."
    }, { quoted: msg });
  }

  const norm = normalizeChannelInput(target);
  let targetJid = norm?.jid || target;

  if (norm?.code) {
    try {
      const meta = await sock.newsletterMetadata('invite', norm.code);
      targetJid = meta.id;
    } catch {}
  }

  if (data.channels?.[targetJid]) {
    data.channels[targetJid].enabled = false;
    saveArcData(data);
    return await sock.sendMessage(from, {
      text: `🛑 *Channel "${data.channels[targetJid].name || targetJid}" auto-reaction PAUSE kar diya gaya!*`
    }, { quoted: msg });
  }

  return await sock.sendMessage(from, { text: `❌ *Channel \`${targetJid}\` nahi mila!*` }, { quoted: msg });
}

// 5. .arcstart <link|all> - Resume auto-reaction
async function arcstartCommand(sock, from, msg, isOwner, args = []) {
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner ye command use kar sakta hai!*" }, { quoted: msg });

  const target = (args[0] || '').toLowerCase();
  const data = loadArcData();

  if (!target || target === 'all') {
    data.enabled = true;
    Object.keys(data.channels || {}).forEach(k => { data.channels[k].enabled = true; });
    saveArcData(data);
    return await sock.sendMessage(from, {
      text: "🟢 *ARC RESUMED!* Tamam channels par auto-reaction shuru ho gaya hai."
    }, { quoted: msg });
  }

  const norm = normalizeChannelInput(target);
  let targetJid = norm?.jid || target;
  if (norm?.code) {
    try {
      const meta = await sock.newsletterMetadata('invite', norm.code);
      targetJid = meta.id;
    } catch {}
  }

  if (data.channels?.[targetJid]) {
    data.channels[targetJid].enabled = true;
    data.enabled = true;
    saveArcData(data);
    return await sock.sendMessage(from, {
      text: `🟢 *Channel "${data.channels[targetJid].name || targetJid}" auto-reaction RESUME ho gaya!*`
    }, { quoted: msg });
  }

  return await sock.sendMessage(from, { text: `❌ *Channel \`${targetJid}\` nahi mila!*` }, { quoted: msg });
}

// 6. .chautojoin / .autojoin / .chjoin - Auto Join Channel Across All Accounts
async function chautojoinCommand(sock, from, msg, isOwner, args = []) {
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner channel auto-join kar sakta hai!*" }, { quoted: msg });

  const rawLink = args[0] || '';
  if (!rawLink) {
    return await sock.sendMessage(from, {
      text: "❌ *Usage:* `.chautojoin <channel_link>`\n_Tamam connected bot accounts se channel ko follow/join karega!_"
    }, { quoted: msg });
  }

  const norm = normalizeChannelInput(rawLink);
  if (!norm) return await sock.sendMessage(from, { text: "❌ *Invalid channel link!*" }, { quoted: msg });

  await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

  let targetJid = norm.jid;
  let channelName = 'WhatsApp Channel';
  let inviteCode = norm.code || null;

  if (norm.code) {
    try {
      const meta = await sock.newsletterMetadata('invite', norm.code);
      targetJid = meta.id;
      channelName = meta.name || channelName;
    } catch (e) {
      return await sock.sendMessage(from, { text: `❌ *Channel resolve nahi hua:* ${e.message}` }, { quoted: msg });
    }
  }

  const { uniqueSocks, results } = await joinChannelAcrossAllSessions(sock, targetJid, inviteCode);

  let successCount = 0;
  let summary = '';
  results.forEach((r, idx) => {
    if (r.success) {
      successCount++;
      summary += `┃ ${idx + 1}. +${r.account} ➜ ✅ Followed\n`;
    } else {
      summary += `┃ ${idx + 1}. +${r.account} ➜ ⚠️ ${r.error || 'Failed'}\n`;
    }
  });

  await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

  return await sock.sendMessage(from, {
    text:
`╭━━━〔 📢 *CHANNEL AUTO-JOIN COMPLETED* 〕━━━┈⊷
┃ 🏷️ *Channel:* *${channelName}*
┃ 🆔 *JID:* \`${targetJid}\`
┃ 👥 *Total Sessions:* ${uniqueSocks.length}
┃ ✅ *Successful Joins:* ${successCount}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n
${summary}\n⚡ *Ab tamam accounts is channel ke active followers hain!*`
  }, { quoted: msg });
}

// 7. .arcblock
async function arcblockCommand(sock, from, msg, isOwner, args = []) {
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner ye command use kar sakta hai!*" }, { quoted: msg });
  const raw = args[0] || '';
  const norm = normalizeChannelInput(raw);
  if (!norm) return await sock.sendMessage(from, { text: "❌ *Usage:* `.arcblock <channel_link/jid>`" }, { quoted: msg });

  const data = loadArcData();
  let jid = norm.jid;
  if (norm.code) {
    try {
      const meta = await sock.newsletterMetadata('invite', norm.code);
      jid = meta.id;
    } catch {}
  }
  if (!jid) return await sock.sendMessage(from, { text: "❌ *Channel resolve nahi ho saka!*" }, { quoted: msg });

  if (!data.blocked) data.blocked = {};
  data.blocked[jid] = true;
  if (data.channels?.[jid]) delete data.channels[jid];
  saveArcData(data);

  await sock.sendMessage(from, { text: `🚫 *Channel block kar diya gaya:* \`${jid}\`` }, { quoted: msg });
}

// 8. .arcblocklist
async function arcblocklistCommand(sock, from, msg, isOwner) {
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner ye command use kar sakta hai!*" }, { quoted: msg });
  const data = loadArcData();
  const list = Object.keys(data.blocked || {});
  if (!list.length) return await sock.sendMessage(from, { text: "ℹ️ *Koi channel blocked nahi hai.*" }, { quoted: msg });

  let text = `╭━━━〔 🚫 *BLOCKED CHANNELS (${list.length})* 〕━━━┈⊷\n`;
  list.forEach((j, i) => { text += `┃ ${i + 1}. \`${j}\`\n`; });
  text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;
  await sock.sendMessage(from, { text }, { quoted: msg });
}

// 9. .arclock
async function arclockCommand(sock, from, msg, isOwner) {
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner lock kar sakta hai!*" }, { quoted: msg });
  const data = loadArcData();
  data.locked = true;
  saveArcData(data);
  await sock.sendMessage(from, { text: "🔒 *ARC settings locked kar di gayin! Ab koi changes nahi kar sakta.*" }, { quoted: msg });
}

// 10. .arclocklist
async function arclocklistCommand(sock, from, msg) {
  const data = loadArcData();
  await sock.sendMessage(from, {
    text: `╭━━━〔 🔒 *ARC LOCK STATUS* 〕━━━┈⊷\n┃ 🛡️ *Locked:* ${data.locked ? 'YES (Protected)' : 'NO (Unlocked)'}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
  }, { quoted: msg });
}

// 11. .arcprem
async function arcpremCommand(sock, from, msg, isOwner, args = []) {
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner VIP mode set kar sakta hai!*" }, { quoted: msg });
  const raw = args[0] || '';
  const norm = normalizeChannelInput(raw);
  if (!norm) return await sock.sendMessage(from, { text: "❌ *Usage:* `.arcprem <channel_jid/link>`" }, { quoted: msg });

  const data = loadArcData();
  let jid = norm.jid;
  if (norm.code) {
    try {
      const meta = await sock.newsletterMetadata('invite', norm.code);
      jid = meta.id;
    } catch {}
  }
  if (!jid) return await sock.sendMessage(from, { text: "❌ *Channel resolve nahi hua!*" }, { quoted: msg });

  if (!data.channels) data.channels = {};
  if (!data.channels[jid]) {
    data.channels[jid] = { jid, emojis: ['🔥', '❤️'], count: 0, delayMs: 2000, enabled: true, premium: true, addedAt: Date.now() };
  } else {
    data.channels[jid].premium = true;
    data.channels[jid].delayMs = 2000;
  }
  saveArcData(data);

  await sock.sendMessage(from, { text: `⭐ *Channel VIP / Premium ARC mein set ho gaya:* \`${jid}\`` }, { quoted: msg });
}

// 12. .arcpremiumlist
async function arcpremiumlistCommand(sock, from, msg) {
  const data = loadArcData();
  const prems = Object.entries(data.channels || {}).filter(([_, c]) => c.premium);
  if (!prems.length) return await sock.sendMessage(from, { text: "ℹ️ *Koi VIP / Premium channel set nahi hai.*" }, { quoted: msg });

  let text = `╭━━━〔 ⭐ *VIP ARC CHANNELS (${prems.length})* 〕━━━┈⊷\n`;
  prems.forEach(([j, c], i) => {
    text += `┃ ${i + 1}. \`${j}\` ➜ ${(c.emojis || ['🔥']).join(' ')}\n`;
  });
  text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;
  await sock.sendMessage(from, { text }, { quoted: msg });
}

// 13. .arcremoveall
async function arcremoveallCommand(sock, from, msg, isOwner) {
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner clear kar sakta hai!*" }, { quoted: msg });
  const data = loadArcData();
  const count = Object.keys(data.channels || {}).length;
  data.channels = {};
  saveArcData(data);
  await sock.sendMessage(from, { text: `🗑️ *Tamam (${count}) ARC channels remove kar diye gaye!*` }, { quoted: msg });
}

// 14. .arcunblock
async function arcunblockCommand(sock, from, msg, isOwner, args = []) {
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner unblock kar sakta hai!*" }, { quoted: msg });
  const raw = args[0] || '';
  const norm = normalizeChannelInput(raw);
  if (!norm) return await sock.sendMessage(from, { text: "❌ *Usage:* `.arcunblock <channel_jid/link>`" }, { quoted: msg });

  const data = loadArcData();
  let jid = norm.jid || (norm.code ? `${norm.code}@newsletter` : raw);
  if (data.blocked?.[jid]) {
    delete data.blocked[jid];
    saveArcData(data);
    return await sock.sendMessage(from, { text: `✅ *Channel unblock kar diya gaya:* \`${jid}\`` }, { quoted: msg });
  }
  await sock.sendMessage(from, { text: `ℹ️ *Channel blocked list mein nahi tha.*` }, { quoted: msg });
}

// 15. .arcunlock
async function arcunlockCommand(sock, from, msg, isOwner) {
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner unlock kar sakta hai!*" }, { quoted: msg });
  const data = loadArcData();
  data.locked = false;
  saveArcData(data);
  await sock.sendMessage(from, { text: "🔓 *ARC settings UNLOCKED! Ab modifications allow hain.*" }, { quoted: msg });
}

// 16. .chreactall - React to multiple recent posts in a channel
async function chreactallCommand(sock, from, msg, args = []) {
  if (!args[0]) {
    return await sock.sendMessage(from, { text: "❌ *Usage:* `.chreactall <channel_link> [emoji]`" }, { quoted: msg });
  }

  const rawLink = args[0];
  const emoji = args[1] || '🔥';

  try {
    const target = await hub.resolveTarget(sock, rawLink);
    if (!target?.jid) {
      return await sock.sendMessage(from, { text: "❌ *Channel link resolve nahi ho saka!*" }, { quoted: msg });
    }

    await sock.sendMessage(from, {
      text: `⏳ *Channel ${target.channelName || target.jid} ke recent posts par multi-session reaction lagaya ja raha hai...*`
    }, { quoted: msg });

    const recent = await hub.fetchRecent(sock, target.jid, 5).catch(() => []);
    if (!recent || !recent.length) {
      return await sock.sendMessage(from, { text: "❌ *Channel ke recent messages nahi mile!*" }, { quoted: msg });
    }

    let reacted = 0;
    for (const post of recent) {
      if (post.serverId) {
        await executeMultiSessionReaction(sock, from, msg, {
          jid: target.jid,
          serverId: String(post.serverId),
          channelName: target.channelName
        }, emoji).catch(() => {});
        reacted++;
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    await sock.sendMessage(from, {
      text: `✅ *Tamam ${reacted} posts par '${emoji}' react complete ho gaya!*`
    }, { quoted: msg });

  } catch (e) {
    await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
  }
}

// 17. .chunreact - Remove reaction from channel post
async function chunreactCommand(sock, from, msg, args = []) {
  if (!args[0]) {
    return await sock.sendMessage(from, { text: "❌ *Usage:* `.chunreact <channel_post_link>`" }, { quoted: msg });
  }

  try {
    const target = await hub.resolveTarget(sock, args[0]);
    if (!target?.jid || !target?.serverId) {
      return await sock.sendMessage(from, { text: "❌ *Valid channel post link provide karein!*" }, { quoted: msg });
    }

    await executeMultiSessionReaction(sock, from, msg, target, '');
  } catch (e) {
    await sock.sendMessage(from, { text: `❌ *Error:* ${e.message}` }, { quoted: msg });
  }
}

// 18. .pollrand - Cast random vote on quoted poll
async function pollrandCommand(sock, from, msg) {
  const quoted = extractQuotedPoll(msg);
  if (!quoted) {
    return await sock.sendMessage(from, { text: "❌ *Kisi Poll ko reply karke `.pollrand` likhein!*" }, { quoted: msg });
  }

  const optCount = quoted.options?.length || 2;
  const randomChoice = Math.floor(Math.random() * optCount);
  const chosenName = quoted.options[randomChoice] || `Option ${randomChoice + 1}`;

  if (quoted.isChannel) {
    return await executeMultiSessionChannelPollVote(sock, from, msg, {
      jid: quoted.newsletterJid,
      serverId: quoted.serverMessageId,
      channelName: quoted.channelName || 'Channel Poll',
      pollInfo: quoted
    }, randomChoice);
  }

  const { voteChatPoll } = require('./chreact');
  if (typeof voteChatPoll === 'function') {
    return await voteChatPoll(sock, from, msg, quoted, randomChoice);
  }

  await sock.sendMessage(from, { text: `🎲 *Random Vote selected:* *${chosenName}*` }, { quoted: msg });
}

// 19. .pollunvote - Remove vote from poll
async function pollunvoteCommand(sock, from, msg) {
  const quoted = extractQuotedPoll(msg);
  if (!quoted) {
    return await sock.sendMessage(from, { text: "❌ *Kisi Poll ko reply karke `.pollunvote` likhein!*" }, { quoted: msg });
  }

  if (quoted.isChannel) {
    const uniqueSocks = getActiveSockets(sock);
    for (const s of uniqueSocks) {
      try {
        const messageId = typeof s.generateMessageTag === 'function' ? s.generateMessageTag() : `${Date.now()}`;
        await s.query({
          tag: 'message',
          attrs: {
            to: quoted.newsletterJid,
            id: messageId,
            type: 'poll',
            server_id: String(quoted.serverMessageId)
          },
          content: [
            { tag: 'meta', attrs: { polltype: 'vote' } },
            { tag: 'votes', attrs: {}, content: [] }
          ]
        });
      } catch {}
    }
    return await sock.sendMessage(from, { text: "✅ *Channel poll se vote remove kar diya gaya!*" }, { quoted: msg });
  }

  await sock.sendMessage(from, { text: "ℹ️ *Chat poll se unvote karne ke liye poll par dobara tap karein.*" }, { quoted: msg });
}

// 20. .pollvfix - Fix and repair poll keys
async function pollvfixCommand(sock, from, msg) {
  const pollStore = require('../utils/pollStore');
  const count = pollStore?.clearAll ? pollStore.clearAll() : 0;
  await sock.sendMessage(from, {
    text: `🔧 *Poll keys and cache have been refreshed! Total cleaned records:* ${count || 'Done'}`
  }, { quoted: msg });
}

// 21. .pollvinfo - Inspect poll question, options, voter count
async function pollvinfoCommand(sock, from, msg) {
  const quoted = extractQuotedPoll(msg);
  if (!quoted) {
    return await sock.sendMessage(from, { text: "❌ *Kisi Poll ko reply karke `.pollvinfo` likhein!*" }, { quoted: msg });
  }

  let text =
`╭━━━〔 📊 *POLL INFORMATION* 〕━━━┈⊷
┃ ❓ *Question:* *${quoted.name}*
┃ 📺 *Type:* ${quoted.isChannel ? '📢 Channel Poll' : '💬 Chat Poll'}
┃ 🔢 *Options Count:* ${quoted.options.length}
`;
  quoted.options.forEach((opt, idx) => {
    text += `┃    ${idx + 1}. *${opt}*\n`;
  });
  if (quoted.serverMessageId) text += `┃ 🆔 *Server ID:* \`${quoted.serverMessageId}\`\n`;
  if (quoted.newsletterJid) text += `┃ 📢 *Channel:* \`${quoted.newsletterJid}\`\n`;
  text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

  await sock.sendMessage(from, { text }, { quoted: msg });
}

// 22. .pollvote - General poll voting
async function pollvoteCommand(sock, from, msg, args = []) {
  const quoted = extractQuotedPoll(msg);
  if (!quoted) {
    return await sock.sendMessage(from, { text: "❌ *Jis poll par vote karna hai use reply karein:*\n👉 `.pollvote 1` ya `.pollvote OptionName`" }, { quoted: msg });
  }

  const optionArg = args.join(' ').trim() || '1';

  if (quoted.isChannel) {
    return await executeMultiSessionChannelPollVote(sock, from, msg, {
      jid: quoted.newsletterJid,
      serverId: quoted.serverMessageId,
      channelName: quoted.channelName || 'Channel Poll',
      pollInfo: quoted
    }, optionArg);
  }

  const { voteChatPoll } = require('./chreact');
  if (typeof voteChatPoll === 'function') {
    return await voteChatPoll(sock, from, msg, quoted, optionArg);
  }

  await sock.sendMessage(from, { text: "❌ *Chat poll vote handler unavailable.*" }, { quoted: msg });
}

// 23. .pollvstop - Stop poll booster
async function pollvstopCommand(sock, from, msg, isOwner) {
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner stop kar sakta hai!*" }, { quoted: msg });
  globalThis.pollVotingCancelled = true;
  await sock.sendMessage(from, { text: "🛑 *Poll vote boosting process stopped!*" }, { quoted: msg });
}

module.exports = {
  loadArcData,
  saveArcData,
  arcCommand,
  arclistCommand,
  arcdelCommand,
  arcstopCommand,
  arcstartCommand,
  chautojoinCommand,
  arcblockCommand,
  arcblocklistCommand,
  arclockCommand,
  arclocklistCommand,
  arcpremCommand,
  arcpremiumlistCommand,
  arcremoveallCommand,
  arcunblockCommand,
  arcunlockCommand,
  chreactallCommand,
  chunreactCommand,
  pollrandCommand,
  pollunvoteCommand,
  pollvfixCommand,
  pollvinfoCommand,
  pollvoteCommand,
  pollvstopCommand,
  executeArcAutoReaction
};
