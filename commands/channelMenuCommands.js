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
const os = require('os');
const hub = require('../utils/channelHub');
const { 
  executeMultiSessionReaction, 
  executeMultiSessionChannelPollVote,
  extractQuotedPoll,
  getActiveSockets 
} = require('./chreact');

const DATA_DIR = path.join(__dirname, '..', 'data');
const AUTH_DIR = path.join(__dirname, '..', 'auth_info');
const ARC_FILE = path.join(DATA_DIR, 'channel_arc.json');
const BACKUP_ARC_FILE = path.join(AUTH_DIR, '_channel_arc.json');
const TMP_ARC_FILE = path.join(os.tmpdir(), 'mrsaqib_channel_arc.json');

fs.ensureDirSync(DATA_DIR);

// In-memory singleton so .arc channels NEVER get lost or reset during runtime
let cachedArcData = null;

function loadArcData() {
  if (cachedArcData && typeof cachedArcData === 'object') {
    if (!cachedArcData.channels) cachedArcData.channels = {};
    if (!cachedArcData.blocked) cachedArcData.blocked = {};
    if (!cachedArcData.deletedChannels) cachedArcData.deletedChannels = {};
    return cachedArcData;
  }

  const merged = {
    enabled: true,
    locked: false,
    passcode: 'arc123',
    channels: {},
    blocked: {},
    deletedChannels: {},
    defaultEmoji: '❤️'
  };

  // Read from all persistence locations so git pulls or container restarts never wipe .arc channels
  const filesToRead = [ARC_FILE, TMP_ARC_FILE, BACKUP_ARC_FILE];
  for (const file of filesToRead) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readJsonSync(file);
        if (raw && typeof raw === 'object') {
          if (typeof raw.enabled === 'boolean') merged.enabled = raw.enabled;
          if (typeof raw.locked === 'boolean') merged.locked = raw.locked;
          if (raw.passcode) merged.passcode = raw.passcode;
          if (raw.defaultEmoji) merged.defaultEmoji = raw.defaultEmoji;
          if (raw.blocked && typeof raw.blocked === 'object') {
            Object.assign(merged.blocked, raw.blocked);
          }
          if (raw.deletedChannels && typeof raw.deletedChannels === 'object') {
            for (const [delKey, delTs] of Object.entries(raw.deletedChannels)) {
              merged.deletedChannels[delKey] = Math.max(merged.deletedChannels[delKey] || 0, Number(delTs) || 1);
            }
          }
          if (raw.channels && typeof raw.channels === 'object') {
            for (const [k, ch] of Object.entries(raw.channels)) {
              if (!ch || typeof ch !== 'object') continue;
              const existing = merged.channels[k];
              if (!existing || (Number(ch.addedAt || 0) >= Number(existing.addedAt || 0))) {
                merged.channels[k] = { ...existing, ...ch };
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[ARC Load Error]:', e.message);
    }
  }

  // Filter out any channel that was explicitly deleted after it was added
  for (const [k, ch] of Object.entries(merged.channels)) {
    const delTs = Math.max(
      merged.deletedChannels[k] || 0,
      (ch.invite && merged.deletedChannels[ch.invite]) || 0
    );
    if (delTs > 0 && delTs >= Number(ch.addedAt || 0)) {
      delete merged.channels[k];
    }
  }

  // Cross-sync custom target routes from channel_forwarder.json for zero memory loss
  try {
    const fwdFile = path.join(DATA_DIR, 'channel_forwarder.json');
    if (fs.existsSync(fwdFile)) {
      const fwdCfg = fs.readJsonSync(fwdFile);
      if (fwdCfg?.channelTargets && typeof fwdCfg.channelTargets === 'object') {
        for (const [chKey, ct] of Object.entries(fwdCfg.channelTargets)) {
          if (ct?.targetJid && merged.channels[chKey]) {
            if (!merged.channels[chKey].targetJid || Number(ct.updatedAt || 0) >= Number(merged.channels[chKey].targetUpdatedAt || 0)) {
              merged.channels[chKey].targetJid = ct.targetJid;
              merged.channels[chKey].targetName = ct.targetName || ct.targetJid;
              merged.channels[chKey].targetUpdatedAt = ct.updatedAt || Date.now();
            }
          }
        }
      }
    }
  } catch {}

  cachedArcData = merged;
  return cachedArcData;
}

function saveArcData(data) {
  if (!data || typeof data !== 'object') return;
  if (!data.channels) data.channels = {};
  if (!data.blocked) data.blocked = {};
  if (!data.deletedChannels) data.deletedChannels = {};

  // Memory Leak Prevention: prune deletedChannels older than 7 days
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(data.deletedChannels)) {
    if (typeof v === 'number' && v < weekAgo) {
      delete data.deletedChannels[k];
    }
  }

  cachedArcData = data;

  for (const file of [ARC_FILE, BACKUP_ARC_FILE, TMP_ARC_FILE]) {
    try {
      fs.ensureDirSync(path.dirname(file));
      fs.writeJsonSync(file, data, { spaces: 2 });
    } catch (e) {
      // Ignore write error on secondary location
    }
  }

  try {
    const mongoSync = require('../utils/mongoSync');
    mongoSync.pushToMongo('channel_arc', data);
    const clusterSync = require('../utils/clusterSync');
    clusterSync.broadcastToCluster('sync_channel_arc', {}).catch(() => {});
  } catch (_) {}
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

/**
 * Extracts all emoji characters and tokens from a string.
 * Supports:
 * - Comma-separated: "🥺,😭,🤧" or "❤️,🔥,👍"
 * - Space-separated: "🥺 😭 🤧"
 * - Concatenated: "🥺😭🤧"
 */
function extractReactionEmojis(str) {
  if (!str || typeof str !== 'string') return [];
  const clean = str.trim();
  if (!clean) return [];

  const tokens = clean.split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
  const result = [];

  for (const token of tokens) {
    if (!token) continue;
    try {
      const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
      const graphemes = [...seg.segment(token)]
        .map(s => s.segment)
        .filter(g => /(\p{Extended_Pictographic}|[\u2000-\u3300])/u.test(g));

      if (graphemes.length > 0) {
        result.push(...graphemes);
        continue;
      }
    } catch {}

    if (/(\p{Extended_Pictographic}|[\u2000-\u3300])/u.test(token)) {
      result.push(token);
    }
  }

  return result;
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

  // Check if channel was added by a premium user whose subscription has expired!
  if (conf.addedBy) {
    try {
      const ownerManager = require('../utils/ownerManager');
      const ownersData = ownerManager.loadOwnersData();
      const pDigits = String(conf.addedBy).replace(/[^0-9]/g, '');
      const isMaster = pDigits === ownerManager.MASTER_OWNER_DIGITS || pDigits.endsWith(ownerManager.MASTER_LAST10);
      if (!isMaster) {
        const isOwnerAcc = (ownersData.owners || []).some(o => o.digits && (o.digits === pDigits || o.digits.endsWith(pDigits)));
        if (!isOwnerAcc) {
          const pm = (ownersData.premium || []).find(p => p.digits && (p.digits === pDigits || p.digits.endsWith(pDigits)));
          if (!pm || (pm.expiresAt && pm.expiresAt <= Date.now())) {
            // Subscription expired: skip reacting!
            return;
          }
        }
      }
    } catch (_) {}
  }

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

/**
 * Continuous Keep-Alive & Fallback Poller for .arc Channels:
 * 1) Renews WhatsApp's 300-second `subscribeNewsletterUpdates` lease every 2 minutes so live events NEVER expire!
 * 2) Every 25 seconds, heals any temporary invite-based JID (`0029Va...@newsletter` -> `120363...@newsletter`)
 *    and polls `fetchRecent` so even if a live WebSocket event was missed, `.chreact <link>` and auto-reactions fire!
 */
let lastKnownPrimarySock = null;
function ensureArcKeepAlive(primarySock) {
  if (primarySock) lastKnownPrimarySock = primarySock;
  if (globalThis.__arcKeepAliveStarted) return;
  globalThis.__arcKeepAliveStarted = true;

  // 1. Renew subscribeNewsletterUpdates every 2 minutes (120,000ms) — before WhatsApp's 300s duration expires!
  const renewTimer = setInterval(async () => {
    try {
      const data = loadArcData();
      if (!data.enabled || !data.channels) return;
      const socks = getActiveSockets(lastKnownPrimarySock);
      if (!socks.length) return;

      for (const [chJid, conf] of Object.entries(data.channels)) {
        if (!conf || conf.enabled === false || data.blocked?.[chJid]) continue;
        if (!/^\d+@newsletter$/.test(chJid)) continue;
        for (const s of socks) {
          try {
            if (typeof s.subscribeNewsletterUpdates === 'function') {
              await withTimeout(s.subscribeNewsletterUpdates(chJid), 4000).catch(() => {});
            }
          } catch {}
        }
      }
    } catch {}
  }, 120 * 1000);
  if (typeof renewTimer.unref === 'function') renewTimer.unref();

  // 2. Periodic Fallback (Every 5 minutes, lightweight): Heal invite-code JIDs & catch any missed posts
  const pollTimer = setInterval(async () => {
    try {
      const data = loadArcData();
      if (!data.enabled || !data.channels) return;
      const socks = getActiveSockets(lastKnownPrimarySock);
      if (!socks.length) return;

      let dirty = false;
      const entries = Object.entries(data.channels);

      for (const [keyJid, conf] of entries) {
        if (!conf || conf.enabled === false || data.blocked?.[keyJid]) continue;
        let activeJid = keyJid;

        // Step A: If keyJid is a temporary invite code (not numeric 120363...@newsletter), resolve it
        if (!/^\d+@newsletter$/.test(activeJid)) {
          const code = conf.invite || activeJid.replace(/@newsletter$/i, '');
          let resolvedJid = null;
          let resolvedName = null;

          // Check channelHub cache first
          try {
            const cachedList = typeof hub.listChannels === 'function' ? hub.listChannels() : [];
            const found = cachedList.find(c => c && (c.invite === code || (c.link && c.link.includes(code))) && /^\d+@newsletter$/.test(c.jid || ''));
            if (found) {
              resolvedJid = found.jid;
              resolvedName = found.name;
            }
          } catch {}

          // Try newsletterMetadata across active sockets
          if (!resolvedJid && code) {
            for (const s of socks) {
              if (typeof s.newsletterMetadata !== 'function') continue;
              try {
                const rawMeta = await withTimeout(s.newsletterMetadata('invite', code), 3500);
                const parsedMeta = (typeof hub.parseMeta === 'function' ? hub.parseMeta(rawMeta) : null) || rawMeta;
                const candidate = parsedMeta?.jid || parsedMeta?.id;
                if (candidate && /^\d+@newsletter$/.test(candidate)) {
                  resolvedJid = candidate;
                  resolvedName = parsedMeta?.name || rawMeta?.thread_metadata?.name?.text || null;
                  break;
                }
              } catch {}
            }
          }

          if (resolvedJid && /^\d+@newsletter$/.test(resolvedJid)) {
            conf.jid = resolvedJid;
            if (resolvedName && (!conf.name || conf.name === 'WhatsApp Channel')) {
              conf.name = resolvedName;
            }
            data.channels[resolvedJid] = conf;
            delete data.channels[keyJid];
            activeJid = resolvedJid;
            dirty = true;
          } else {
            continue;
          }
        }

        // Step B: Poll recent posts on primary socket only (never spam all sockets)
        let recentPosts = [];
        const primary = socks[0];
        if (primary) {
          try {
            const posts = await withTimeout(hub.fetchRecent(primary, activeJid, 3, 0), 4000);
            if (Array.isArray(posts) && posts.length > 0) {
              recentPosts = posts;
            }
          } catch {}
        }

        if (recentPosts.length > 0) {
          // Sort by numeric serverId ascending
          const sorted = recentPosts
            .filter(p => p && p.serverId && !isNaN(Number(p.serverId)))
            .sort((a, b) => Number(a.serverId) - Number(b.serverId));

          if (sorted.length > 0) {
            const newest = sorted[sorted.length - 1];
            const newestId = String(newest.serverId);

            if (!conf.lastPostId) {
              // Baseline initialization: record newest ID so reactions ONLY trigger on FUTURE new posts!
              conf.lastPostId = newestId;
              dirty = true;
              // Never trigger reactions on historical past posts
            } else if (Number(newestId) > Number(conf.lastPostId)) {
              const postTimeMs = newest.timestamp ? Number(newest.timestamp) * 1000 : 0;
              const postAgeMs = Date.now() - postTimeMs;
              conf.lastPostId = newestId;
              dirty = true;

              // Strictly verify the post is fresh/live (under 2 minutes old)
              if (postTimeMs <= 0 || (postAgeMs >= -30000 && postAgeMs <= 120000)) {
                const fwd = require('../utils/channelPostForwarder');
                const syntheticMsg = { key: { remoteJid: activeJid, id: newestId, server_id: newestId }, messageServerId: newestId, messageTimestamp: newest.timestamp };
                fwd.handleNewsletterPost(socks[0], syntheticMsg, conf).catch(() => {});
                executeArcAutoReaction(socks[0], activeJid, newestId, conf).catch(() => {});
              }
            }
          }
        }
      }

      if (dirty) {
        saveArcData(data);
      }
    } catch {}
  }, 25 * 60 * 1000);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();
}

const handledArcMsgIds = new Set();
function isDuplicateArcMsg(msg) {
  const id = msg?.key?.id;
  if (!id) return false;
  if (handledArcMsgIds.has(id)) return true;
  handledArcMsgIds.add(id);
  if (handledArcMsgIds.size > 1000) {
    handledArcMsgIds.delete(handledArcMsgIds.values().next().value);
  }
  return false;
}

// 1. .arc [add | list | del | stop | on | off] - Main Controller
async function arcCommand(sock, from, msg, isOwner, args = [], groupMetadata = null) {
  if (isDuplicateArcMsg(msg)) return;
  const data = loadArcData();
  const subCmd = (args[0] || '').toLowerCase();

  // Set target group/chat if: .arc set [inbox]
  if (subCmd === 'set') {
    const fwd = require('../utils/channelPostForwarder');
    return await fwd.setArcTargetCommand(sock, from, msg, isOwner, args.slice(1), groupMetadata);
  }

  // Show list if: .arc list
  if (subCmd === 'list' || subCmd === 'ls') {
    return await arclistCommand(sock, from, msg);
  }

  // Delete if: .arc del <link>
  if (subCmd === 'del' || subCmd === 'delete' || subCmd === 'remove' || subCmd === 'rm') {
    return await arcdelCommand(sock, from, msg, isOwner, args.slice(1), true);
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
    const ownerManager = require('../utils/ownerManager');
    const isMasterOwner = ownerManager.checkIsMasterOwner({ sock, msg, from, groupMetadata });
    let isPermitted = isMasterOwner || isOwner;

    if (!isPermitted) {
      try {
        if (await ownerManager.verifyPremiumOrOwnerAsync(sock, msg, from, groupMetadata)) {
          isPermitted = true;
        }
      } catch {}
    }

    if (!isPermitted) {
      return await sock.sendMessage(from, {
        text: `╭━━━〔 💎 *PREMIUM ACCESS REQUIRED* 〕━━━┈⊷\n` +
              `┃ ❌ *Access Denied!*\n` +
              `┃ Ye command sirf *Bot Owner* ya\n` +
              `┃ *Premium Members* use kar sakte hain!\n` +
              `┃\n` +
              `┃ 👑 *Premium Access ke liye:*\n` +
              `┃ 👉 Official Channel visit karein:\n` +
              `┃ 📢 ${config.channelLink || 'https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M'}\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
      }, { quoted: msg });
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

    // Sender identity extraction
    const isMe = Boolean(msg?.key?.fromMe);
    const rawSender = msg?.key?.participant || msg?.participant || (isMe ? sock?.user?.id : from) || '';
    const senderDigits = String(rawSender).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

    // Limit Check: Maximum 3 channels for Premium Users (Master Owner has unlimited)
    if (!isMasterOwner) {
      const allChannels = Object.values(data.channels || {});
      const userOwnedChannels = allChannels.filter(c => {
        if (!c) return false;
        const cAddedBy = String(c.addedBy || '').replace(/[^0-9]/g, '');
        return senderDigits && cAddedBy && (cAddedBy === senderDigits || cAddedBy.endsWith(senderDigits) || senderDigits.endsWith(cAddedBy));
      });

      // Check if channel is already added by this user (if so, it is an update, NOT a new channel!)
      const isAlreadyAdded = userOwnedChannels.some(c =>
        (norm.jid && c.jid === norm.jid) ||
        (norm.code && (c.invite === norm.code || (c.link && c.link.includes(norm.code))))
      );

      if (!isAlreadyAdded && userOwnedChannels.length >= 3) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
          text:
`╭━━━〔 ⚠️ *MAXIMUM LIMIT REACHED* 〕━━━┈⊷
┃ ❌ *Auto-React Limit: Max 3 Channels*
┃
┃ Premium Members aik waqt me zyada se zyada
┃ *3 Channels* par auto-react laga sakte hain!
┃
┃ 📊 *Aapka Quota:* ${userOwnedChannels.length}/3 Channels Full
┃
┃ 💡 *Naya channel lagane ke liye:*
┃ Pehle kisi purane channel ko remove karein:
┃ 👉 \`.del arc <channel_link>\`
┃
┃ 📋 *Aapke Channels:* \`.arclist\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
`> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
      }
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

    // 2. ONLY if still not resolved from local cache, try fast subscribed lookup + multi-socket metadata lookup
    if (norm.code && !targetJid) {
      try {
        if (typeof hub.fetchSubscribed === 'function') {
          const subbed = await withTimeout(hub.fetchSubscribed(sock), 2000).catch(() => []);
          const foundSub = (subbed || []).find(c => c && (c.invite === norm.code || (c.link && c.link.includes(norm.code))) && c.jid);
          if (foundSub) {
            targetJid = foundSub.jid;
            if (foundSub.name) channelName = foundSub.name;
          }
        }
      } catch {}

      if (!targetJid) {
        const candidateSocks = getActiveSockets(sock);
        for (const s of candidateSocks) {
          if (typeof s?.newsletterMetadata !== 'function') continue;
          try {
            const rawMeta = await withTimeout(s.newsletterMetadata('invite', norm.code), 2500);
            const parsedMeta = (typeof hub.parseMeta === 'function' ? hub.parseMeta(rawMeta) : null) || rawMeta;
            if (parsedMeta?.jid || parsedMeta?.id) {
              targetJid = parsedMeta.jid || parsedMeta.id;
              const n = parsedMeta.name || rawMeta?.thread_metadata?.name?.text;
              if (typeof n === 'string' && n) channelName = n;
              inviteCode = parsedMeta.invite || rawMeta?.thread_metadata?.invite || inviteCode;
              break;
            }
          } catch {}
        }
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

    // Parse options: emojis, count, delay (supports "🥺,😭,🤧", "🥺 😭 🤧", etc.)
    let rawOptionsStr = rawParams.slice(1).join(' ').trim();
    let emojisList = [];
    let count = 0;
    let delayMs = 2000;

    const foundEmojis = extractReactionEmojis(rawOptionsStr);
    if (foundEmojis.length > 0) {
      emojisList = foundEmojis;
      rawOptionsStr = rawOptionsStr.replace(/[\p{Extended_Pictographic}\u2000-\u3300,]+/gu, ' ').trim();
    }

    const remainingTokens = rawOptionsStr.split(/\s+/).filter(Boolean);
    for (const t of remainingTokens) {
      if (/^[0-9]+[sm]?$/i.test(t)) {
        if (t.toLowerCase().endsWith('s') || t.toLowerCase().endsWith('m') || parseInt(t, 10) > 100) {
          delayMs = parseDelay(t);
        } else if (count === 0) {
          count = parseInt(t, 10);
        }
      } else if (t.toLowerCase() === 'all') {
        count = 0;
      }
    }

    if (emojisList.length === 0) {
      emojisList = ['❤️', '🔥', '👍', '😍', '👏'];
    }

    // Save ARC Channel data immediately so nothing blocks confirmation!
    data.enabled = true;
    if (data.blocked && data.blocked[targetJid]) {
      delete data.blocked[targetJid];
    }
    if (data.deletedChannels) {
      delete data.deletedChannels[targetJid];
      if (inviteCode) delete data.deletedChannels[inviteCode];
    }
    if (!data.channels) data.channels = {};
    const canonicalLink = inviteCode ? `https://whatsapp.com/channel/${inviteCode}` : rawLink;
    let senderName = msg?.pushName || '';
    if (!senderName || senderName === 'User') {
      senderName = isMasterOwner ? 'MR SAQIB' : (senderDigits ? `+${senderDigits}` : 'Admin');
    }
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
      addedBy: senderDigits || rawSender || '923438673242',
      addedByName: senderName,
      lastPostId: null
    };

    saveArcData(data);
    ensureArcKeepAlive(sock);

    const totalSessions = Math.max(getActiveSockets(sock).length, 1);

    // Immediately react ✅ and send confirmation message!
    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

    let quotaLine = '';
    if (!isMasterOwner) {
      const allChannels = Object.values(data.channels || {});
      const myCount = allChannels.filter(c => {
        const cAddedBy = String(c?.addedBy || '').replace(/[^0-9]/g, '');
        return senderDigits && cAddedBy && (cAddedBy === senderDigits || cAddedBy.endsWith(senderDigits) || senderDigits.endsWith(cAddedBy));
      }).length;
      quotaLine = `\n┃ 📊 *Usage Quota:* ${myCount}/3 Channels Used`;
    }

    await sock.sendMessage(from, {
      text:
`╭━━━〔 ✅ *CHANNEL AUTO-REACT ADDED* 〕━━━┈⊷
┃ 📢 *Channel:* *${channelName}*
┃ 🆔 *JID:* \`${targetJid}\`
┃ ✨ *Emojis:* ${emojisList.join(' ')}
┃ 🖥️ *Servers:* All ${totalSessions} Cloud Servers
┃ 🟢 *Status:* Active & Monitoring${quotaLine}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

💡 *Ab is channel me jab bhi koi post hogi:*
⚡ Tamam connected servers se automatic reactions lag jayenge!

🗑️ *Remove Karne Ke Liye:*
👉 \`.del arc ${canonicalLink}\`

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
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

/**
 * Resolves the Adder's Name & Number with Rank Badge. Never returns 'Unknown'!
 */
function formatAdderDisplay(c, ownersData = null) {
  if (!ownersData) {
    try {
      const ownerManager = require('../utils/ownerManager');
      ownersData = ownerManager.loadOwnersData();
    } catch {
      ownersData = { owners: [], premium: [] };
    }
  }

  const masterDigits = '923438673242';
  const rawAddedBy = c?.addedBy ? String(c.addedBy).trim() : '';
  const digits = rawAddedBy.replace(/[^0-9]/g, '') || masterDigits;
  const isMaster = (digits === masterDigits || digits.endsWith('3438673242'));

  let name = c?.addedByName || '';
  if (!name || name === 'User') {
    if (isMaster) {
      name = 'MR SAQIB';
    } else {
      const isCoOwner = (ownersData.owners || []).find(o => {
        const oDig = String(o.digits || '').replace(/[^0-9]/g, '');
        return oDig && (oDig === digits || oDig.endsWith(digits.slice(-10)));
      });
      if (isCoOwner) {
        name = isCoOwner.name || 'Co-Owner';
      } else {
        const pm = (ownersData.premium || []).find(p => {
          const pDig = String(p.digits || '').replace(/[^0-9]/g, '');
          return pDig && (pDig === digits || pDig.endsWith(digits.slice(-10)));
        });
        if (pm) {
          name = pm.name || 'Premium Member';
        } else {
          name = 'Admin';
        }
      }
    }
  }

  if (isMaster) {
    return `👑 ${name} (+${digits})`;
  }

  const isCoOwner = (ownersData.owners || []).some(o => {
    const oDig = String(o.digits || '').replace(/[^0-9]/g, '');
    return oDig && (oDig === digits || oDig.endsWith(digits.slice(-10)));
  });
  if (isCoOwner) return `🛡️ ${name} (+${digits})`;

  const pm = (ownersData.premium || []).find(p => {
    const pDig = String(p.digits || '').replace(/[^0-9]/g, '');
    return pDig && (pDig === digits || pDig.endsWith(digits.slice(-10)));
  });
  if (pm) {
    const isExpired = pm.expiresAt && pm.expiresAt <= Date.now();
    return isExpired ? `⚠️ ${name} (+${digits}) [Expired]` : `💎 ${name} (+${digits})`;
  }

  return `👤 ${name} (+${digits})`;
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

  const rawSender = msg?.key?.participant || msg?.participant || (msg?.key?.fromMe ? sock?.user?.id : from) || '';
  const senderDigits = String(rawSender).replace(/[^0-9]/g, '');

  let text = `╭━━━〔 📢 *ARC MONITORED CHANNELS (${entries.length})* 〕━━━┈⊷\n`;
  entries.forEach(([jid, c], idx) => {
    const state = c.enabled ? '🟢 Active' : '🔴 Paused';
    const emojis = (c.emojis || []).join(' ') || '❤️';
    const delay = c.delayStr || `${Math.round((c.delayMs || 5000) / 1000)}s`;
    const count = c.count === 0 ? 'All Sessions' : `${c.count}x`;

    const targetLabel = c.targetName || (c.targetJid ? (c.targetJid.endsWith('@g.us') ? 'WhatsApp Group' : 'Custom Chat') : null);
    const targetDisplay = targetLabel ? `🎯 Target: *${targetLabel}*` : '🎯 Target: Default (Inbox / Group)';
    const addedInfo = `\n┃    👤 Added By: ${formatAdderDisplay(c)}`;

    text += `┃\n`;
    text += `┃ ${idx + 1}. *${c.name || 'Channel'}* (${state})\n`;
    text += `┃    🆔 \`${jid}\`\n`;
    text += `┃    ${targetDisplay}\n`;
    text += `┃    ✨ React: ${emojis} | 🔢 ${count} | ⏳ ${delay}${addedInfo}\n`;
  });

  const myChannelsCount = entries.filter(([_, c]) => {
    const cAddedBy = String(c?.addedBy || '').replace(/[^0-9]/g, '');
    return senderDigits && cAddedBy && (cAddedBy === senderDigits || cAddedBy.endsWith(senderDigits) || senderDigits.endsWith(cAddedBy));
  }).length;

  text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n`;
  text += `📊 *Aapka Quota:* ${myChannelsCount}/3 Channels Used (Premium Limit: 3)\n`;
  text += `💡 *Commands:* \`.arc <link>\` | \`.del arc <link>\``;

  await sock.sendMessage(from, { text }, { quoted: msg });
}

// 3. .del arc <link|jid> / .arcdel <link|jid> / .delarc <link|jid> - Delete channel from ARC
async function arcdelCommand(sock, from, msg, isOwner, args = [], skipDedupe = false) {
  if (!skipDedupe && isDuplicateArcMsg(msg)) return;
  if (!isOwner) {
    try {
      const ownerManager = require('../utils/ownerManager');
      if (await ownerManager.verifyPremiumOrOwnerAsync(sock, msg, from)) {
        isOwner = true;
      }
    } catch {}
  }
  if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner ya Premium Member delete kar sakta hai!*" }, { quoted: msg });

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
  const delInvite = data.channels[targetJid].invite || norm?.code || null;
  if (!data.deletedChannels) data.deletedChannels = {};
  data.deletedChannels[targetJid] = Date.now();
  if (delInvite) data.deletedChannels[delInvite] = Date.now();
  delete data.channels[targetJid];
  saveArcData(data);

  try {
    const fwd = require('../utils/channelPostForwarder');
    if (typeof fwd.removeChannelTarget === 'function') {
      fwd.removeChannelTarget(targetJid, delInvite);
    }
  } catch {}

  await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});

  await sock.sendMessage(from, {
    text: `✅ *Channel "${name}" successfully Auto-React (.arc) list se remove kar diya gaya hai!*`
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
  if (!data.deletedChannels) data.deletedChannels = {};
  for (const [k, ch] of Object.entries(data.channels || {})) {
    data.deletedChannels[k] = Date.now();
    if (ch?.invite) data.deletedChannels[ch.invite] = Date.now();
  }
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

/**
 * Command: .chstatus / .arcstatus / .channelstatus / .chinfo / .channelscheck
 * Strictly executable ONLY by Bot Owner / Master Owner (03438673242)
 * Comprehensive master dashboard showing:
 * 1. All Auto-React Channels (.arc / channel_arc.json)
 * 2. All Auto-Forward Settings & Custom Channel Routes (.set arc / channel_forwarder.json)
 * 3. All Auto-Follow Channels (.afc / auto_follow.json)
 */
async function chstatusCommand(sock, from, msg, isOwner) {
  if (!isOwner) {
    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
    return await sock.sendMessage(from, {
      text: `╭━━━〔 🔒 *BOT OWNER ONLY* 〕━━━┈⊷\n` +
            `┃ ❌ *Access Denied!*\n` +
            `┃ Sirf *Bot Owner* hi ye\n` +
            `┃ status dashboard check kar sakta hai!\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
  }

  await sock.sendMessage(from, { react: { text: '📊', key: msg.key } }).catch(() => {});

  // 1. Gather Auto-React (ARC) Data
  const arcData = loadArcData();
  const arcEntries = Object.entries(arcData.channels || {});
  const totalArc = arcEntries.length;
  const activeArc = arcEntries.filter(([_, c]) => c && c.enabled !== false && c.active !== false).length;
  const pausedArc = totalArc - activeArc;

  // Load owner data to identify who added each channel
  let ownersData = { owners: [], premium: [] };
  try {
    const ownerManager = require('../utils/ownerManager');
    ownersData = ownerManager.loadOwnersData();
  } catch {}

  let arcSection = '';
  if (totalArc === 0) {
    arcSection = `┃ 📭 Koi channel Auto-React me add nahi hai.\n┃ 👉 Add karne ke liye: \`.arc <channel_link>\`\n`;
  } else {
    // Show max 25 channels in dashboard to prevent message truncation
    const displayEntries = arcEntries.slice(0, 25);
    displayEntries.forEach(([jid, c], idx) => {
      const state = (c.enabled !== false && c.active !== false) ? '🟢 Active' : '⏸️ Paused';
      const emojis = (c.emojis || []).join(' ') || '❤️';
      const delay = c.delayStr || `${Math.round((c.delayMs || 5000) / 1000)}s`;
      const adder = formatAdderDisplay(c, ownersData);
      const link = c.link ? `\n┃    🔗 ${c.link}` : '';
      const targetRoute = c.targetName ? `\n┃    🎯 Forward: *${c.targetName}*` : '';

      arcSection += `┃\n`;
      arcSection += `┃ ${idx + 1}. *${c.name || 'WhatsApp Channel'}* (${state})\n`;
      arcSection += `┃    🆔 \`${jid}\`${link}\n`;
      arcSection += `┃    👤 Added By: ${adder}\n`;
      arcSection += `┃    ✨ React: ${emojis} | ⏳ Delay: ${delay}${targetRoute}\n`;
    });

    if (arcEntries.length > 25) {
      arcSection += `┃\n┃ ➕ *... aur ${arcEntries.length - 25} mazeed channels (.arclist se dekhein)*\n`;
    }
  }

  // 2. Gather Auto-Forward (.set arc) Data
  let fwdConfig = null;
  try {
    const fwd = require('../utils/channelPostForwarder');
    fwdConfig = fwd.loadConfig();
  } catch {
    const fwdFile = path.join(DATA_DIR, 'channel_forwarder.json');
    if (fs.existsSync(fwdFile)) {
      try { fwdConfig = fs.readJsonSync(fwdFile); } catch {}
    }
  }
  fwdConfig = fwdConfig || { enabled: true, targetJid: '923438673242@s.whatsapp.net', channelTargets: {} };

  const fwdState = fwdConfig.enabled !== false ? '🟢 Active (Relaying)' : '🔴 Disabled';
  let defaultTargetDisplay = fwdConfig.targetName || fwdConfig.targetJid || 'Master Owner DM';
  if (String(defaultTargetDisplay).endsWith('@g.us')) defaultTargetDisplay = 'WhatsApp Group';

  let customTargetsList = '';
  const seenCustomTargets = new Set();
  const uniqueCustom = [];
  for (const [key, ct] of Object.entries(fwdConfig.channelTargets || {})) {
    if (!ct || !ct.targetJid) continue;
    const uniqKey = `${ct.channelJid || key}->${ct.targetJid}`;
    if (!seenCustomTargets.has(uniqKey)) {
      seenCustomTargets.add(uniqKey);
      uniqueCustom.push(ct);
    }
  }

  if (uniqueCustom.length > 0) {
    customTargetsList += `┃ 📌 *Custom Per-Channel Forward Routes (${uniqueCustom.length}):*\n`;
    uniqueCustom.forEach((ct, i) => {
      customTargetsList += `┃    ${i + 1}. *${ct.channelName || 'Channel'}* ➔ *${ct.targetName || ct.targetJid}*\n`;
    });
  } else {
    customTargetsList += `┃ ℹ️ Tamam channels default target (*${defaultTargetDisplay}*) par forward hote hain.\n`;
  }

  // 3. Gather Auto-Follow Data (.afc / auto_follow.json)
  let afChannels = [];
  try {
    const afm = require('../utils/autoFollowManager');
    const afData = afm.loadAutoFollowData();
    afChannels = Object.values(afData.channels || {});
  } catch {}

  let afSection = '';
  if (afChannels.length === 0) {
    afSection = `┃ 📭 Koi channel Auto-Follow me set nahi hai.\n┃ 👉 Add karne ke liye: \`.afc <channel_link>\`\n`;
  } else {
    afChannels.slice(0, 15).forEach((ch, idx) => {
      afSection += `┃ ${idx + 1}. *${ch.name || 'WhatsApp Channel'}*\n`;
      afSection += `┃    🆔 \`${ch.jid || 'N/A'}\`\n`;
    });
    if (afChannels.length > 15) {
      afSection += `┃ ➕ *... aur ${afChannels.length - 15} mazeed channels (.afclist se dekhein)*\n`;
    }
  }

  const activeSessions = Math.max(getActiveSockets(sock).length, 1);

  const fullText =
`╭━━━〔 👑 *CHANNELS & AUTOMATION DASHBOARD* 〕━━━┈⊷
┃ 👑 *Master Controller:* MR SAQIB
┃ 🖥️ *Active Bot Sessions:* ${activeSessions} Cloud Servers
┃ 📊 *Auto-React (ARC):* 🟢 ${activeArc} Active • ⏸️ ${pausedArc} Paused
┃ ⏩ *Auto-Forward:* ${fwdState}
┃ 👥 *Auto-Follow:* ${afChannels.length} Channels Monitored
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

📡 *AUTO-REACT CHANNELS (${totalArc} Total):*
${arcSection}
⏩ *AUTO-FORWARD & RELAY SETTINGS:*
┃ • Global Status: ${fwdState}
┃ • Default Target: *${defaultTargetDisplay}*
┃ • Auto Relay Command: \`.chreact\`
${customTargetsList}
👥 *AUTO-FOLLOW CHANNELS (${afChannels.length} Total):*
${afSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 *Quick Owner Commands:*
• ➕ Auto-React add: \`.arc <channel_link>\`
• 🗑️ Auto-React del: \`.del arc <channel_link>\`
• 🎯 Set Forward Group: \`.set arc\` (Group me run karein)
• 🎯 Set Channel Route: \`.set arc <channel_link>\`
• 👥 Mass Follow: \`.chfollow <channel_link>\`
• 💎 Premium Members: \`.pmlist\` • \`.delpm <user>\`

> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;

  return await sock.sendMessage(from, { text: fullText }, { quoted: msg });
}

// ═══════════════════════════════════════════════════════════════════════════
// COUPON CODE & SINGLE-CHANNEL AUTO-REACT (.cc / .achr / .gencoupon)
// ═══════════════════════════════════════════════════════════════════════════

const couponManager = require('../utils/couponManager');

/**
 * Command: .cc <6-digit-code> / .coupon <6-digit-code>
 * Redeems coupon for the user to activate Coupon Pro (1-Channel Auto-React).
 */
async function ccCommand(sock, from, msg, args = []) {
  const isMe = Boolean(msg?.key?.fromMe);
  const rawSender = msg?.key?.participant || msg?.participant || (isMe ? sock?.user?.id : from) || '';
  const senderDigits = couponManager.normalizeDigits(rawSender);
  const rawCode = (args[0] || '').trim().toUpperCase();

  if (!rawCode) {
    const existing = couponManager.getCouponUser(senderDigits);
    const statusText = (existing && existing.isActive)
      ? `🟢 *PRO ACTIVE* (${existing.channel ? `Channel: ${existing.channel.name}` : 'Koi channel set nahi hai'})`
      : `⚪ *FREE USER (No Active Coupon)*`;

    return await sock.sendMessage(from, {
      text:
`╭━━━〔 🎟️ *SAQIB MD COUPON REDEEM* 〕━━━┈⊷
┃ 👤 *Aapka Status:* ${statusText}
┃ 📌 *Usage:* \`.cc <6-digit-code>\`
┃ 💡 *Example:* \`.cc 482910\`
┃
┃ 🎁 *Perks of Coupon Pro:*
┃ • 1-Channel Auto-React Activation
┃ • Zero ban risk (Self-Bot only reacts)
┃ • Free promotional tier to boost users!
┃
┃ 👉 Coupon milte hi yahan \`.cc <code>\` bhejein!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
`> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
  }

  const result = couponManager.redeemCoupon(rawCode, senderDigits);
  if (!result.success) {
    return await sock.sendMessage(from, {
      text:
`╭━━━〔 ❌ *COUPON REDEEM FAILED* 〕━━━┈⊷
┃ ❌ *Reason:* ${result.message}
┃ 💡 *Tip:* Code dobara check karein ya Owner se naya code lein.
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
  }

  await sock.sendMessage(from, { react: { text: '🎟️', key: msg.key } }).catch(() => {});
  return await sock.sendMessage(from, {
    text:
`╭━━━〔 🎟️ *COUPON ACTIVATED (PRO TIER)* 〕━━━┈⊷
┃ ✅ *Status:* PRO UNLOCKED (Active)
┃ 🔢 *Code:* \`${rawCode}\`
┃ 👤 *User:* +${senderDigits}
┃ 📡 *Perk:* 1-Channel Auto-Reaction
┃ 🤖 *Engine:* Self-Bot Auto-React
┃ ⏳ *Validity:* Connected Session
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

👉 *Ab apna 1 Channel auto-react par lagayein:*
\`.achr <channel_link> [emojis]\`

💡 *Example:*
\`.achr https://whatsapp.com/channel/0029Va... ❤️ 🔥 👍\`\n\n` +
`> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
  }, { quoted: msg });
}

/**
 * Command: .gencoupon / .addcoupon / .makecoupon [count / customCode] [uses=1] [days=30]
 * Strictly Owner Only: Generates single-use 6-digit coupon codes (or bulk single-use codes).
 */
async function gencouponCommand(sock, from, msg, isOwner, isMasterOwner, args = []) {
  if (!isMasterOwner && !isOwner) {
    return await sock.sendMessage(from, { text: "❌ *Access Denied!* Sirf Bot Owner naye coupon codes generate kar sakta hai." }, { quoted: msg });
  }

  const p1 = (args[0] || '').trim();
  const p2 = (args[1] || '').trim();
  const p3 = (args[2] || '').trim();

  // 1. Bulk Single-Use Generation: e.g. .gencoupon 5 (Generates 5 distinct 1-time codes)
  const isNumberOnly = /^[0-9]+$/.test(p1);
  const numVal = isNumberOnly ? parseInt(p1, 10) : 0;

  if (isNumberOnly && numVal >= 2 && numVal <= 25) {
    const generatedCodes = [];
    for (let i = 0; i < numVal; i++) {
      const c = couponManager.createCoupon({
        maxUses: 1,
        validDays: 30,
        createdBy: sock?.user?.id || '923438673242'
      });
      generatedCodes.push(c.code);
    }

    const codeListText = generatedCodes.map((c, idx) => `┃ *${idx + 1}.* \`${c}\` (Single Use)`).join('\n');
    const copyListText = generatedCodes.join('\n');

    await sock.sendMessage(from, {
      text:
`╭━━━〔 🎟️ *BULK SINGLE-USE COUPONS GENERATED* 〕━━━┈⊷
┃ 👑 *Generated By:* Bot Owner (MR SAQIB)
┃ 📦 *Total Codes:* ${generatedCodes.length} Codes
┃ 👥 *Per-Code Limit:* 1 User Only (Strictly 1-Time)
┃ ⏳ *Validity:* 30 Days
┃ 📡 *Perk:* 1-Channel Auto-React per user
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
┃ 📋 *LIST OF CODES (Forward to Channel):*
${codeListText}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

📢 *Channel Post Template:*
"Dosto! Ye lo ${generatedCodes.length} Free Single-Use Coupons! 🎁
Bot par \`.cc <code>\` bhejein aur free 1-Channel Auto-React lagayein!
Har code sirf 1 banda use kar sakta hai (First Come, First Served)!"\n\n` +
`> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });

    // Send clean text list for instant copying
    return await sock.sendMessage(from, { text: copyListText }, { quoted: msg });
  }

  // 2. Custom code: e.g. .addcoupon 786110 or .addcoupon SAQIB1
  let customCode = null;
  let maxUses = 1; // STRICTLY 1 USE BY DEFAULT!
  let days = 30;

  if (p1 && (p1.length >= 4 && (isNaN(Number(p1)) || p1.length === 6))) {
    customCode = p1.toUpperCase();
    if (p2 && !isNaN(Number(p2))) maxUses = Math.max(1, parseInt(p2, 10));
    if (p3 && !isNaN(Number(p3))) days = parseInt(p3, 10);
  }

  const newCoupon = couponManager.createCoupon({
    code: customCode,
    maxUses: maxUses,
    validDays: days,
    createdBy: sock?.user?.id || '923438673242'
  });

  const useLabel = newCoupon.maxUses === 1 ? '1 User Only (Single-Use 🔒)' : `${newCoupon.maxUses} Users`;

  await sock.sendMessage(from, {
    text:
`╭━━━〔 🎟️ *SINGLE-USE COUPON CREATED* 〕━━━┈⊷
┃ 👑 *Created By:* Bot Owner (MR SAQIB)
┃ 🔢 *Coupon Code:* \`${newCoupon.code}\`
┃ 👥 *Usage Limit:* ${useLabel}
┃ ⏳ *Validity:* ${newCoupon.validDays ? `${newCoupon.validDays} Days` : 'Permanent'}
┃ 📡 *Perk:* 1-Channel Auto-Reaction (Self-Bot)
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

📢 *User ya Channel ko share karne ke liye:*
"Dosto! Ye lo free coupon: *${newCoupon.code}* 🎁
Bot par \`.cc ${newCoupon.code}\` likhein aur apna channel auto-react par lagayein! (Sirf 1 baar chalega!)"\n\n` +
`> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
  }, { quoted: msg });

  // Send the single code separately so owner can 1-tap copy
  return await sock.sendMessage(from, { text: `${newCoupon.code}` }, { quoted: msg });
}

/**
 * Command: .listcoupon / .couponlist
 * Strictly Owner Only: Lists active coupons.
 */
async function listcouponCommand(sock, from, msg, isOwner, isMasterOwner) {
  if (!isMasterOwner && !isOwner) {
    return await sock.sendMessage(from, { text: "❌ *Access Denied!* Sirf Bot Owner coupon list check kar sakta hai." }, { quoted: msg });
  }

  const summary = couponManager.listCoupons();
  let couponLines = '';
  if (summary.coupons.length === 0) {
    couponLines = `┃ 📭 *Koi coupon code mojood nahi hai.*\n┃ 👉 Naya banane ke liye: \`.gencoupon\``;
  } else {
    summary.coupons.slice(0, 20).forEach((c, idx) => {
      const remaining = Math.max(0, c.maxUses - (c.usedCount || 0));
      couponLines += `┃ *${idx + 1}.* \`${c.code}\` — Uses: *${c.usedCount}/${c.maxUses}* (Left: ${remaining})\n`;
    });
  }

  let userLines = '';
  if (summary.activeUsers.length === 0) {
    userLines = `┃ 📭 *Kisi user ne abhi coupon redeem nahi kiya.*`;
  } else {
    summary.activeUsers.slice(0, 15).forEach((u, idx) => {
      const chName = u.channel?.name || 'No Channel Set';
      userLines += `┃ *${idx + 1}.* +${u.userId} — 📢 ${chName}\n`;
    });
  }

  return await sock.sendMessage(from, {
    text:
`╭━━━〔 🎟️ *COUPON SYSTEM DASHBOARD* 〕━━━┈⊷
┃ 📊 *Total Coupons:* ${summary.totalCoupons}
┃ 👥 *Active Redeemed Users:* ${summary.totalRedeemedUsers}
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
┃ 🎟️ *ACTIVE COUPONS:*
${couponLines}
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
┃ 👥 *REDEEMED PRO USERS:*
${userLines}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
`> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
  }, { quoted: msg });
}

/**
 * Command: .delcoupon <code>
 * Strictly Owner Only: Deletes a coupon code.
 */
async function delcouponCommand(sock, from, msg, isOwner, isMasterOwner, args = []) {
  if (!isMasterOwner && !isOwner) {
    return await sock.sendMessage(from, { text: "❌ *Access Denied!* Sirf Bot Owner coupon delete kar sakta hai." }, { quoted: msg });
  }

  const code = (args[0] || '').trim().toUpperCase();
  if (!code) {
    return await sock.sendMessage(from, { text: "❌ *Usage:* `.delcoupon <6-digit-code>`" }, { quoted: msg });
  }

  const res = couponManager.deleteCoupon(code);
  return await sock.sendMessage(from, { text: res.message }, { quoted: msg });
}

/**
 * Command: .achr <channel_link> [emojis] / .achr del / .achr list
 * Coupon Pro 1-Channel Auto-Reaction (Only the user's OWN bot reacts, NOT all cluster bots!).
 */
async function achrCommand(sock, from, msg, isOwner, isMasterOwner, args = [], groupMetadata = null) {
  const isMe = Boolean(msg?.key?.fromMe);
  const rawSender = msg?.key?.participant || msg?.participant || (isMe ? sock?.user?.id : from) || '';
  const senderDigits = couponManager.normalizeDigits(rawSender);
  const ownerManager = require('../utils/ownerManager');

  const isMaster = Boolean(isMasterOwner || ownerManager.checkIsMasterOwner({ sock, msg, from, groupMetadata }));
  const isCouponUser = couponManager.isCouponPro(senderDigits);
  let isPrem = false;
  try {
    isPrem = await ownerManager.verifyPremiumOrOwnerAsync(sock, msg, from, groupMetadata);
  } catch (_) {}

  // Permission check: Must be Coupon Pro, Premium, or Owner
  if (!isMaster && !isOwner && !isPrem && !isCouponUser) {
    return await sock.sendMessage(from, {
      text:
`╭━━━〔 🎟️ *COUPON REQUIRED* 〕━━━┈⊷
┃ ❌ *Access Denied!*
┃ Ye command use karne ke liye pehle Coupon redeem karein:
┃ 👉 \`.cc <6-digit-code>\`
┃
┃ 🎁 *Free Coupon Kaise Milega?*
┃ Owner ke channel me free coupon drop hota hai!
┃
┃ 👑 *All-Bots Swarm (.arc) ke liye:*
┃ 👉 Channel: ${config.channelLink || 'https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M'}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
`> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
  }

  const subCmd = (args[0] || '').toLowerCase().trim();

  // 1. Delete Channel: .achr del / .achr remove
  if (subCmd === 'del' || subCmd === 'delete' || subCmd === 'remove' || subCmd === 'rm') {
    couponManager.removeCouponChannel(senderDigits);
    return await sock.sendMessage(from, {
      text:
`╭━━━〔 🗑️ *CHANNEL REMOVED* 〕━━━┈⊷
┃ ✅ Aapka 1-channel auto-react successfully hata diya gaya hai.
┃ 💡 Naya channel set karne ke liye:
┃ 👉 \`.achr <new_channel_link> [emojis]\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
  }

  // 2. View Channel: .achr list / .achr info / .achr status
  if (subCmd === 'list' || subCmd === 'info' || subCmd === 'status' || subCmd === 'my') {
    const userProfile = couponManager.getCouponUser(senderDigits);
    if (!userProfile?.channel) {
      return await sock.sendMessage(from, {
        text:
`╭━━━〔 📢 *YOUR AUTO-REACT CHANNEL* 〕━━━┈⊷
┃ 👤 *User:* +${senderDigits}
┃ 📊 *Quota:* 0 / 1 Channel Set
┃ 📭 Abhi koi channel set nahi hai!
┃
┃ 👉 Set karne ke liye:
┃ \`.achr <channel_link> [emojis]\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
      }, { quoted: msg });
    }

    const ch = userProfile.channel;
    const emojis = Array.isArray(ch.emojis) ? ch.emojis.join(' ') : '❤️ 🔥';
    return await sock.sendMessage(from, {
      text:
`╭━━━〔 📢 *YOUR AUTO-REACT CHANNEL* 〕━━━┈⊷
┃ 👤 *User:* +${senderDigits}
┃ 📢 *Channel:* ${ch.name}
┃ 🆔 *JID:* \`${ch.jid}\`
┃ ✨ *Emojis:* ${emojis}
┃ 🤖 *Reaction Mode:* Self-Bot (Only YOUR bot reacts)
┃ 📊 *Quota:* 1 / 1 Channel Active
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
`> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
  }

  // 3. Set Channel: .achr <channel_link> [emojis]
  const rawLink = args[0];
  if (!rawLink) {
    return await sock.sendMessage(from, {
      text:
`╭━━━〔 📌 *ACHR USAGE GUIDE* 〕━━━┈⊷
┃ 👉 *.achr <channel_link> [emojis]*
┃ 👉 *.achr del* (Delete channel)
┃ 👉 *.achr list* (View channel)
┃
┃ 📋 *Example:*
┃ \`.achr https://whatsapp.com/channel/0029Va... ❤️ 🔥 👍\`
┃
┃ 🤖 *Note:* Is command se ONLY aapka apna bot react karega!
┃ (All bots reaction ke liye .arc premium command hai)
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

  if (!targetJid && norm.code && typeof sock.newsletterMetadata === 'function') {
    try {
      const meta = await withTimeout(sock.newsletterMetadata('invite', norm.code), 6000);
      if (meta?.id) {
        targetJid = meta.id;
        if (meta.name) channelName = meta.name;
      }
    } catch (_) {}
  }

  if (!targetJid) {
    return await sock.sendMessage(from, {
      text: "❌ *Channel JID resolve nahi ho saki!* Baraye meharbani direct channel link provide karein."
    }, { quoted: msg });
  }

  // Parse custom emojis from remaining args
  const rawEmojiTokens = args.slice(1).join(' ').trim();
  const parsedEmojis = normalizeEmojiList(rawEmojiTokens);
  const finalEmojis = parsedEmojis.length > 0 ? parsedEmojis : ['❤️', '🔥', '👍', '✨'];

  // Subscribe socket to live updates
  try {
    if (typeof sock.subscribeNewsletterUpdates === 'function') {
      sock.subscribeNewsletterUpdates(targetJid).catch(() => {});
    }
  } catch (_) {}

  // Save to coupon manager
  couponManager.setCouponChannel(senderDigits, {
    jid: targetJid,
    link: rawLink,
    name: channelName,
    emojis: finalEmojis
  });

  await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
  return await sock.sendMessage(from, {
    text:
`╭━━━〔 📢 *COUPON AUTO-REACT SET* 〕━━━┈⊷
┃ ✅ *Channel:* ${channelName}
┃ 🆔 *JID:* \`${targetJid}\`
┃ ✨ *Emojis:* ${finalEmojis.join(' ')}
┃ 🤖 *Reaction Mode:* Self-Bot (Only YOUR bot reacts)
┃ 📊 *Channels Quota:* 1 / 1 (Coupon Tier)
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

💡 *Channel par nayi post aate hi sirf aapka apna bot foran react karega!*
🚀 *Powered by MR SAQIB MD*`
  }, { quoted: msg });
}

module.exports = {
  loadArcData,
  saveArcData,
  arcCommand,
  arclistCommand,
  arcdelCommand,
  arcstopCommand,
  arcstartCommand,
  chstatusCommand,
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
  executeArcAutoReaction,
  ensureArcKeepAlive,
  ccCommand,
  gencouponCommand,
  listcouponCommand,
  delcouponCommand,
  achrCommand
};
