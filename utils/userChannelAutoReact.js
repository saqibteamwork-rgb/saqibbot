'use strict';

/**
 * USER FOLLOWED CHANNELS AUTO-REACTION ENGINE (PROBOY / MR SAQIB MD)
 * ============================================================================
 * 1. Automatically detects all WhatsApp channels that each connected user follows.
 * 2. Whenever any followed channel posts an update, ONLY the user who actually
 *    follows that channel automatically reacts to the post from their own WhatsApp account.
 * 3. MASTER OWNER CONTROL:
 *    - Owner can toggle the master switch globally ON or OFF for all users/sessions (.chautoreact all on/off).
 *    - Owner can toggle auto-reaction on/off for any specific user (.chautoreact on/off <number>).
 *    - Owner can trigger mass-sync of followed channels across all sessions (.chautoreact sync all).
 *    - Owner can view cluster-wide live stats and channel telemetry (.chautoreact stats).
 * 4. ZERO LINK LEAKAGE: Never sends `.chreact <link>` into any group or chat.
 *    No other bots get triggered, no group spam, 100% silent and private!
 * 5. ZERO CROSS-USER POLLUTION: Normal users who didn't follow the channel will NEVER
 *    be forced to react. Reactions only go from the real followers of that channel.
 * 6. PERSISTENT & SELF-HEALING: Subscriptions to live updates are kept active via
 *    periodic background keep-alives (every 2.5 minutes).
 * ============================================================================
 */

const fs = require('fs-extra');
const path = require('path');
const hub = require('./channelHub');
let mongoSync = null;
try { mongoSync = require('./mongoSync'); } catch (_) {}

const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'user_channel_auto_react.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = (promise, ms = 4500) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
]);

// In-memory store: accountKey (phone digits) -> Set of followed channel JIDs
const followedChannelsMap = new Map();
// In-memory store: accountKey -> Array of { jid, name, subscribers, role }
const followedMetaMap = new Map();
// Active keep-alive intervals per accountKey
const keepAliveIntervals = new Map();
const resyncIntervals = new Map();
// Track when account was last synced (ms)
const lastSyncTimes = new Map();

// Deduplication: set of "accountKey:channelJid:serverId"
const reactedPosts = new Set();

// Default reaction emojis pool (authentic, positive, engaging)
const DEFAULT_EMOJIS = ['❤️', '🔥', '👍', '😍', '👏', '✨', '⚡', '💯', '🌟', '🎉'];

let cachedSettings = null;

function loadSettings() {
  if (cachedSettings) return cachedSettings;
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      cachedSettings = fs.readJsonSync(SETTINGS_FILE);
    }
  } catch (e) {
    console.error('[UserAutoReact] Error loading settings:', e.message);
  }

  if (!cachedSettings || typeof cachedSettings !== 'object') {
    cachedSettings = {
      globalEnabled: true,
      defaultEmojis: DEFAULT_EMOJIS,
      accounts: {},
      updatedAt: Date.now()
    };
  }
  if (cachedSettings.globalEnabled === undefined) cachedSettings.globalEnabled = true;
  if (!cachedSettings.accounts) cachedSettings.accounts = {};
  if (!Array.isArray(cachedSettings.defaultEmojis)) cachedSettings.defaultEmojis = DEFAULT_EMOJIS;

  // Restore followed channels to in-memory map from persistent accounts config
  for (const [acc, conf] of Object.entries(cachedSettings.accounts)) {
    if (Array.isArray(conf?.followedJids) && conf.followedJids.length > 0) {
      if (!followedChannelsMap.has(acc)) {
        followedChannelsMap.set(acc, new Set(conf.followedJids));
      } else {
        const s = followedChannelsMap.get(acc);
        conf.followedJids.forEach(j => s.add(j));
      }
    }
  }

  return cachedSettings;
}

function saveSettings(settings) {
  try {
    settings.updatedAt = Date.now();
    fs.mkdirpSync(DATA_DIR);
    fs.writeJsonSync(SETTINGS_FILE, settings, { spaces: 2 });
    cachedSettings = settings;

    if (mongoSync && typeof mongoSync.pushToMongo === 'function') {
      try {
        mongoSync.pushToMongo('user_channel_auto_react', settings, 400);
      } catch (_) {}
    }
  } catch (e) {
    console.error('[UserAutoReact] Error saving settings:', e.message);
  }
}

function getAccountKey(sock) {
  if (!sock) return 'unknown';
  const raw = sock.user?.id || sock.userId || hub.accountOf(sock) || '';
  const digits = String(raw).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
  return digits || 'unknown';
}

function getAccountConfig(accountKey) {
  const settings = loadSettings();
  if (!settings.accounts[accountKey]) {
    settings.accounts[accountKey] = {
      enabled: true,
      emojis: null,
      totalReacted: 0,
      lastReactedAt: null,
      channelCount: 0,
      followedJids: [],
      updatedAt: Date.now()
    };
    saveSettings(settings);
  }
  if (settings.accounts[accountKey].enabled === undefined) {
    settings.accounts[accountKey].enabled = true;
  }
  if (!Array.isArray(settings.accounts[accountKey].followedJids)) {
    settings.accounts[accountKey].followedJids = [];
  }
  return settings.accounts[accountKey];
}

/**
 * Registers newly discovered channels that THIS user follows
 * (from chats.set, messaging-history.set, chats.upsert, or live messages).
 */
function registerFollowedChannels(sock, jids) {
  const accountKey = getAccountKey(sock);
  if (!accountKey || accountKey === 'unknown' || !Array.isArray(jids) || jids.length === 0) return;

  let followed = followedChannelsMap.get(accountKey);
  if (!followed) {
    followed = new Set();
    followedChannelsMap.set(accountKey, followed);
  }

  let changed = false;
  const newJids = [];
  for (const rawJid of jids) {
    const jid = String(rawJid || '').trim();
    if (jid && jid.endsWith('@newsletter')) {
      if (!followed.has(jid)) {
        followed.add(jid);
        newJids.push(jid);
        changed = true;
      }
    }
  }

  if (changed) {
    const settings = loadSettings();
    const accConf = getAccountConfig(accountKey);
    accConf.channelCount = followed.size;
    accConf.followedJids = Array.from(followed);
    accConf.updatedAt = Date.now();
    saveSettings(settings);

    console.log(`[UserAutoReact] 📋 Registered ${newJids.length} new followed channels for account +${accountKey} (Total: ${followed.size})`);
    subscribeChannelsBatch(sock, newJids).catch(() => {});
  }
}

/**
 * Queries WhatsApp for all channels that THIS specific account follows.
 * Subscribes to live updates on all of them.
 */
async function syncUserFollowedChannels(sock, force = false) {
  const accountKey = getAccountKey(sock);
  if (!accountKey || accountKey === 'unknown') return [];

  const now = Date.now();
  const lastSync = lastSyncTimes.get(accountKey) || 0;
  // Throttle syncs to at most once per 60 seconds unless forced
  if (!force && now - lastSync < 60 * 1000 && followedChannelsMap.has(accountKey)) {
    return Array.from(followedChannelsMap.get(accountKey) || []);
  }
  lastSyncTimes.set(accountKey, now);

  let followed = followedChannelsMap.get(accountKey);
  if (!followed) {
    followed = new Set();
    followedChannelsMap.set(accountKey, followed);
  }

  // Check known channels from ChannelHub
  try {
    if (typeof hub.listChannels === 'function') {
      const hubChannels = hub.listChannels();
      for (const rec of hubChannels) {
        if (!rec?.jid) continue;
        const role = hub.roleFor ? hub.roleFor(rec, sock) : rec.accounts?.[hub.accountOf(sock)]?.role;
        if (role && ['OWNER', 'ADMIN', 'SUBSCRIBER'].includes(role)) {
          followed.add(rec.jid);
        }
      }
    }
  } catch (_) {}

  try {
    if (typeof hub.fetchSubscribed === 'function') {
      const subscribedChannels = await withTimeout(hub.fetchSubscribed(sock), 8000).catch(err => {
        return null;
      });

      if (Array.isArray(subscribedChannels)) {
        const jids = [];
        const metaList = [];

        for (const ch of subscribedChannels) {
          if (ch && ch.jid && ch.jid.endsWith('@newsletter')) {
            jids.push(ch.jid);
            followed.add(ch.jid);
            metaList.push({
              jid: ch.jid,
              name: ch.name || 'WhatsApp Channel',
              subscribers: ch.subscribers || null,
              role: ch.role || 'SUBSCRIBER'
            });
          }
        }

        followedMetaMap.set(accountKey, metaList);
      }
    }
  } catch (err) {
    // Graceful fallback: do not throw
  }

  const allJids = Array.from(followed);
  const accConf = getAccountConfig(accountKey);
  accConf.channelCount = allJids.length;
  accConf.followedJids = allJids;
  accConf.updatedAt = Date.now();
  saveSettings(loadSettings());

  console.log(`[UserAutoReact] 📡 Synced ${allJids.length} followed channels for account +${accountKey}`);

  // Subscribe to live newsletter updates for each channel in batches
  subscribeChannelsBatch(sock, allJids).catch(() => {});

  return allJids;
}

/**
 * Spaced batch subscription to avoid flooding WhatsApp socket
 */
async function subscribeChannelsBatch(sock, jids) {
  if (!sock || !Array.isArray(jids) || jids.length === 0) return;
  if (typeof sock.subscribeNewsletterUpdates !== 'function') return;

  for (let i = 0; i < jids.length; i++) {
    const chJid = jids[i];
    try {
      await sock.subscribeNewsletterUpdates(chJid).catch(() => {});
    } catch (_) {}
    if (i < jids.length - 1) {
      await sleep(100);
    }
  }
}

/**
 * Checks if this socket's account actually follows the specified channel
 */
async function isUserFollowing(sock, channelJid) {
  if (!sock || !channelJid) return false;
  const accountKey = getAccountKey(sock);
  if (!accountKey || accountKey === 'unknown') return false;

  let followed = followedChannelsMap.get(accountKey);
  if (followed && followed.has(channelJid)) return true;

  const accConf = getAccountConfig(accountKey);
  if (Array.isArray(accConf.followedJids) && accConf.followedJids.includes(channelJid)) {
    if (!followed) {
      followed = new Set(accConf.followedJids);
      followedChannelsMap.set(accountKey, followed);
    } else {
      followed.add(channelJid);
    }
    return true;
  }

  return false;
}

/**
 * Main Newsletter Post Handler
 * Called in index.js on messages.upsert when `from && from.endsWith('@newsletter')`
 *
 * HOW IT WORKS:
 * 1. If Master Owner turned global switch OFF, NO REACTION OCCURS!
 * 2. If WhatsApp delivered this post to THIS session (`sock`), this account IS a follower of this channel!
 *    We auto-register the channel into this user's followed set, ensure live updates stay active,
 *    and trigger an auto-reaction from this user's account.
 * 3. MULTI-USER CLUSTER AUTO-REACT:
 *    If 10 users on this bot follow this channel, all 10 will auto-react from their own accounts
 *    with staggered human-like delays!
 * 4. Sessions that DO NOT follow this channel will NEVER react.
 * 5. NO `.chreact <link>` message is EVER sent to any group or chat (100% private & silent protocol).
 */
async function handleNewsletterPost(sock, msg) {
  const settings = loadSettings();
  // Master Owner Global Kill-Switch Check
  if (settings.globalEnabled === false) return false;

  const from = msg?.key?.remoteJid;
  if (!from || !from.endsWith('@newsletter')) return false;

  const serverId = msg.key?.server_id || msg.messageServerId || msg.newsletterServerId || msg.key?.serverId || msg.key?.id;
  if (!serverId) return false;

  // 🚫 STRICT HISTORICAL POST GUARD:
  // Never auto-react to past / historical posts! Only react to fresh live posts (< 90 seconds old).
  const postTimestamp = msg?.messageTimestamp ? (Number(msg.messageTimestamp) * 1000) : 0;
  if (postTimestamp > 0) {
    const postAgeMs = Date.now() - postTimestamp;
    if (postAgeMs > 90000 || postAgeMs < -30000) {
      // Historical post delivered during chat sync / newly paired session catch-up: strictly ignore!
      return false;
    }
    const sockConnectedAt = sock?._connectedAt || 0;
    if (sockConnectedAt > 0 && postTimestamp < (sockConnectedAt - 15000)) {
      // Post was published before this session connected to WhatsApp - strictly ignore!
      return false;
    }
  }

  const accountKey = getAccountKey(sock);
  if (!accountKey || accountKey === 'unknown') return false;

  const accConf = getAccountConfig(accountKey);

  // 1. Confirm and register this channel as followed by this account
  let followed = followedChannelsMap.get(accountKey);
  if (!followed) {
    followed = new Set();
    followedChannelsMap.set(accountKey, followed);
  }
  if (!followed.has(from)) {
    followed.add(from);
    accConf.channelCount = followed.size;
    accConf.followedJids = Array.from(followed);
    accConf.updatedAt = Date.now();
    saveSettings(settings);

    try {
      if (typeof sock.subscribeNewsletterUpdates === 'function') {
        sock.subscribeNewsletterUpdates(from).catch(() => {});
      }
    } catch (_) {}
  }

  // 2. React for THIS account (if enabled for this account and not already reacted)
  if (accConf.enabled !== false) {
    const dedupeKey = `${accountKey}:${from}:${serverId}`;
    if (!reactedPosts.has(dedupeKey)) {
      reactedPosts.add(dedupeKey);
      if (reactedPosts.size > 10000) {
        const first = reactedPosts.values().next().value;
        reactedPosts.delete(first);
      }

      let emojiPool = settings.defaultEmojis || DEFAULT_EMOJIS;
      if (Array.isArray(accConf.emojis) && accConf.emojis.length > 0) {
        emojiPool = accConf.emojis;
      }
      try {
        const channelMenuCmds = require('../commands/channelMenuCommands');
        const arcData = channelMenuCmds.loadArcData();
        if (arcData?.channels?.[from]?.emojis && Array.isArray(arcData.channels[from].emojis)) {
          emojiPool = arcData.channels[from].emojis;
        }
      } catch (_) {}

      const chosenEmoji = emojiPool[Math.floor(Math.random() * emojiPool.length)] || '❤️';
      const delay = Math.floor(Math.random() * 1200) + 1200;

      setTimeout(async () => {
        try {
          if (sock?.user && typeof sock.newsletterReactMessage === 'function') {
            await withTimeout(sock.newsletterReactMessage(from, String(serverId), chosenEmoji), 5000);
            accConf.totalReacted = (accConf.totalReacted || 0) + 1;
            accConf.lastReactedAt = Date.now();
            saveSettings(settings);
            console.log(`[FollowedAutoReact] ✅ Account +${accountKey} auto-reacted ${chosenEmoji} to followed channel ${from} (Post: ${serverId})`);
          }
        } catch (err) {
          console.error(`[FollowedAutoReact] Reaction failed for +${accountKey} on ${from}:`, err.message);
        }
      }, delay);
    }
  }

  // 3. Multi-Session Fan-Out:
  // If OTHER paired users on this bot ALSO follow this channel, make them react too!
  const allActiveSocks = getAllActiveSocks(sock);
  let fanOutIdx = 0;

  for (const otherSock of allActiveSocks) {
    const otherAccount = getAccountKey(otherSock);
    if (!otherAccount || otherAccount === 'unknown' || otherAccount === accountKey) continue;

    const otherConf = getAccountConfig(otherAccount);
    if (otherConf.enabled === false) continue;

    // Check if other account follows this channel
    const otherFollowed = followedChannelsMap.get(otherAccount);
    const isOtherFollower = Boolean(
      (otherFollowed && otherFollowed.has(from)) ||
      (Array.isArray(otherConf.followedJids) && otherConf.followedJids.includes(from))
    );

    if (!isOtherFollower) {
      // User does NOT follow this channel - strictly do NOT react!
      continue;
    }

    // Only CURRENT paired members who were already connected when the post was created will react
    const otherConnectedAt = otherSock?._connectedAt || 0;
    if (otherConnectedAt > 0 && postTimestamp > 0 && postTimestamp < (otherConnectedAt - 15000)) {
      continue;
    }

    const otherDedupeKey = `${otherAccount}:${from}:${serverId}`;
    if (reactedPosts.has(otherDedupeKey)) continue;
    reactedPosts.add(otherDedupeKey);

    fanOutIdx++;
    const staggeredDelay = (fanOutIdx * 1100) + Math.floor(Math.random() * 900) + 1200;

    setTimeout(async () => {
      try {
        if (!otherSock?.user || typeof otherSock.newsletterReactMessage !== 'function') return;

        let otherEmojiPool = settings.defaultEmojis || DEFAULT_EMOJIS;
        if (Array.isArray(otherConf.emojis) && otherConf.emojis.length > 0) {
          otherEmojiPool = otherConf.emojis;
        }
        const otherEmoji = otherEmojiPool[Math.floor(Math.random() * otherEmojiPool.length)] || '❤️';

        await withTimeout(otherSock.newsletterReactMessage(from, String(serverId), otherEmoji), 5000);
        otherConf.totalReacted = (otherConf.totalReacted || 0) + 1;
        otherConf.lastReactedAt = Date.now();
        saveSettings(settings);
        console.log(`[FollowedAutoReact] ✅ Fan-out: Account +${otherAccount} auto-reacted ${otherEmoji} to followed channel ${from} (Post: ${serverId})`);
      } catch (err) {
        console.error(`[FollowedAutoReact] Fan-out reaction failed for +${otherAccount} on ${from}:`, err.message);
      }
    }, staggeredDelay);
  }

  return true;
}

/**
 * Called when a session connects in index.js
 */
function onSessionConnected(sock) {
  const accountKey = getAccountKey(sock);
  if (!accountKey || accountKey === 'unknown') return;

  // Clear any existing keepalive and resync intervals for this account
  if (keepAliveIntervals.has(accountKey)) {
    clearInterval(keepAliveIntervals.get(accountKey));
    keepAliveIntervals.delete(accountKey);
  }
  if (resyncIntervals.has(accountKey)) {
    clearInterval(resyncIntervals.get(accountKey));
    resyncIntervals.delete(accountKey);
  }

  const accConf = getAccountConfig(accountKey);

  // Restore channels from persistent config into memory
  if (Array.isArray(accConf.followedJids) && accConf.followedJids.length > 0) {
    let followed = followedChannelsMap.get(accountKey);
    if (!followed) {
      followed = new Set(accConf.followedJids);
      followedChannelsMap.set(accountKey, followed);
    } else {
      accConf.followedJids.forEach(j => followed.add(j));
    }
  }

  // Initial subscribe & sync after 3.5 seconds
  setTimeout(async () => {
    try {
      if (!sock?.user) return;
      const followed = followedChannelsMap.get(accountKey);
      if (followed && followed.size > 0) {
        await subscribeChannelsBatch(sock, Array.from(followed));
      }
      await syncUserFollowedChannels(sock, false).catch(() => {});
    } catch (_) {}
  }, 3500);

  // Background Keep-Alive: renew subscribeNewsletterUpdates every 2.5 minutes (150,000ms)
  const intervalId = setInterval(async () => {
    try {
      if (!sock?.user) {
        clearInterval(intervalId);
        keepAliveIntervals.delete(accountKey);
        return;
      }
      const followed = followedChannelsMap.get(accountKey);
      if (followed && followed.size > 0) {
        const jids = Array.from(followed);
        await subscribeChannelsBatch(sock, jids);
      }
    } catch (_) {}
  }, 150 * 1000);

  keepAliveIntervals.set(accountKey, intervalId);

  // Periodic Followed-Channels Resync every 10 minutes (to detect channels newly followed on mobile)
  const resyncId = setInterval(async () => {
    try {
      if (!sock?.user) {
        clearInterval(resyncId);
        resyncIntervals.delete(accountKey);
        return;
      }
      await syncUserFollowedChannels(sock, false).catch(() => {});
    } catch (_) {}
  }, 10 * 60 * 1000);
  resyncIntervals.set(accountKey, resyncId);
}

/**
 * Helper to collect all connected sockets
 */
function getAllActiveSocks(primarySock, sessionsObj = {}) {
  const socks = [];
  const seen = new Set();

  const add = (s) => {
    if (!s) return;
    const acct = getAccountKey(s);
    if (!acct || acct === 'unknown' || seen.has(acct)) return;
    seen.add(acct);
    socks.push(s);
  };

  if (primarySock) add(primarySock);

  // Check global.ProBoySessionManager
  try {
    if (global.ProBoySessionManager && typeof global.ProBoySessionManager.getActiveSocks === 'function') {
      const active = global.ProBoySessionManager.getActiveSocks();
      if (Array.isArray(active)) {
        for (const s of active) add(s);
      }
    }
  } catch (_) {}

  if (sessionsObj && typeof sessionsObj === 'object') {
    for (const item of Object.values(sessionsObj)) {
      if (item?.sock) add(item.sock);
    }
  }

  try {
    const { getActiveSockets } = require('../commands/chreact');
    if (typeof getActiveSockets === 'function') {
      const more = getActiveSockets(primarySock);
      for (const s of more) add(s);
    }
  } catch (_) {}

  return socks;
}

/**
 * Command Handler for `.chautoreact`
 * Supports both Owner Master Controls and Per-User Controls!
 */
async function chautoreactCommand(sock, from, msg, args = [], isOwner = false, isMasterOwner = false, isSessionOwner = false, sessions = {}) {
  const accountKey = getAccountKey(sock);
  const accConf = getAccountConfig(accountKey);
  const settings = loadSettings();
  const subCmd = (args[0] || '').toLowerCase().trim();
  const secondArg = (args[1] || '').toLowerCase().trim();
  const hasOwnerPrivilege = Boolean(isMasterOwner || isOwner);

  // =========================================================================
  // 1. MASTER OWNER CONTROLS (Global ON / Global OFF / Toggle)
  // =========================================================================

  // .chautoreact all on | .chautoreact global on | .chautoreact on all
  if (
    (subCmd === 'all' && ['on', 'enable', 'start', '1'].includes(secondArg)) ||
    (subCmd === 'global' && ['on', 'enable', 'start', '1'].includes(secondArg)) ||
    (['on', 'enable', 'start'].includes(subCmd) && ['all', 'global'].includes(secondArg))
  ) {
    if (!hasOwnerPrivilege) {
      return await sock.sendMessage(from, { text: `❌ *Access Denied!* Ye Master Switch sirf Bot Owner use kar sakte hain.` }, { quoted: msg });
    }

    settings.globalEnabled = true;
    saveSettings(settings);

    const activeSocks = getAllActiveSocks(sock, sessions);

    return await sock.sendMessage(from, {
      text: `╭━━━〔 👑 *MASTER AUTO-REACT CONTROLLER* 〕━━━┈⊷\n` +
            `┃ 🌐 *Global Switch:* 🟢 ENABLED (100% ACTIVE)\n` +
            `┃ 👑 *Action:* Resumed Globally by Master Owner\n` +
            `┃ 📱 *Active Sessions Connected:* ${activeSocks.length}\n` +
            `┃ 📡 *Mode:* All paired users will auto-react to their followed channels!\n` +
            `┃ ⚡ *Group Protection:* Silent (No .chreact links sent)\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `✅ *Poore bot ke sabhi sessions ke followed-channels auto-reacts ACTIVE ho chuke hain!* 🚀`
    }, { quoted: msg });
  }

  // .chautoreact all off | .chautoreact global off | .chautoreact off all
  if (
    (subCmd === 'all' && ['off', 'disable', 'stop', '0'].includes(secondArg)) ||
    (subCmd === 'global' && ['off', 'disable', 'stop', '0'].includes(secondArg)) ||
    (['off', 'disable', 'stop'].includes(subCmd) && ['all', 'global'].includes(secondArg))
  ) {
    if (!hasOwnerPrivilege) {
      return await sock.sendMessage(from, { text: `❌ *Access Denied!* Ye Master Switch sirf Bot Owner use kar sakte hain.` }, { quoted: msg });
    }

    settings.globalEnabled = false;
    saveSettings(settings);

    return await sock.sendMessage(from, {
      text: `╭━━━〔 👑 *MASTER AUTO-REACT CONTROLLER* 〕━━━┈⊷\n` +
            `┃ 🌐 *Global Switch:* 🔴 DISABLED (ALL SESSIONS PAUSED)\n` +
            `┃ 👑 *Action:* Paused Globally by Master Owner\n` +
            `┃ ⏸️ *Status:* Koi bhi session kisi channel par auto-react nahi karega!\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `🛑 *Poore bot ka Auto-React system PAUSE kar diya gaya hai!* \n` +
            `👉 Wapas on karne ke liye: \`.chautoreact all on\` run karein.`
    }, { quoted: msg });
  }

  // .chautoreact toggle (Owner Global Toggle)
  if (subCmd === 'toggle' || (subCmd === 'all' && secondArg === 'toggle') || (subCmd === 'global' && secondArg === 'toggle')) {
    if (!hasOwnerPrivilege) {
      return await sock.sendMessage(from, { text: `❌ *Access Denied!* Ye Master Switch sirf Bot Owner use kar sakte hain.` }, { quoted: msg });
    }

    settings.globalEnabled = !settings.globalEnabled;
    saveSettings(settings);

    const stateStr = settings.globalEnabled ? '🟢 ENABLED (ON)' : '🔴 DISABLED (OFF)';
    return await sock.sendMessage(from, {
      text: `╭━━━〔 👑 *MASTER AUTO-REACT TOGGLED* 〕━━━┈⊷\n` +
            `┃ 🌐 *Global Switch:* ${stateStr}\n` +
            `┃ 👑 *Action:* Instantly Toggled by Master Owner\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
  }

  // =========================================================================
  // 2. OWNER TARGETED USER CONTROL (.chautoreact on/off <number>)
  // =========================================================================
  const possibleDigits = (secondArg || '').replace(/[^0-9]/g, '');
  if (['on', 'off', 'enable', 'disable'].includes(subCmd) && possibleDigits.length >= 10 && hasOwnerPrivilege) {
    const isTargetOn = ['on', 'enable'].includes(subCmd);
    const targetConf = getAccountConfig(possibleDigits);
    targetConf.enabled = isTargetOn;
    targetConf.updatedAt = Date.now();
    saveSettings(loadSettings());

    const tStateStr = isTargetOn ? '🟢 ENABLED (Active)' : '🔴 DISABLED (Off)';
    return await sock.sendMessage(from, {
      text: `╭━━━〔 🎯 *USER AUTO-REACT TOGGLED* 〕━━━┈⊷\n` +
            `┃ 👤 *Target User:* +${possibleDigits}\n` +
            `┃ ⚡ *Status:* ${tStateStr}\n` +
            `┃ 👑 *Action By:* Bot Owner\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `✅ *+${possibleDigits} ke liye Auto-React update ho gaya!*`
    }, { quoted: msg });
  }

  // =========================================================================
  // 3. OWNER MASS SYNC (.chautoreact sync all)
  // =========================================================================
  if (subCmd === 'sync' && (secondArg === 'all' || secondArg === 'global') && hasOwnerPrivilege) {
    await sock.sendMessage(from, { react: { text: '🔄', key: msg.key } }).catch(() => {});
    const activeSocks = getAllActiveSocks(sock, sessions);

    let totalChannelsFound = 0;
    let syncedSocksCount = 0;

    for (const s of activeSocks) {
      try {
        const jids = await syncUserFollowedChannels(s, true);
        totalChannelsFound += jids.length;
        syncedSocksCount++;
      } catch (_) {}
      await sleep(150);
    }

    return await sock.sendMessage(from, {
      text: `╭━━━〔 🔄 *CLUSTER-WIDE CHANNELS SYNC* 〕━━━┈⊷\n` +
            `┃ ✅ *Sync Status:* Successfully Completed\n` +
            `┃ 📱 *Sessions Synced:* ${syncedSocksCount} / ${activeSocks.length}\n` +
            `┃ 📡 *Total Followed Channels Monitored:* ${totalChannelsFound}\n` +
            `┃ 🟢 *Live Updates:* Subscribed & Connected\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `💡 *Sabhi connected bot sessions ke followed channels WhatsApp se sync ho chuke hain!*`
    }, { quoted: msg });
  }

  // =========================================================================
  // 4. OWNER CLUSTER STATS (.chautoreact stats)
  // =========================================================================
  if ((subCmd === 'stats' || subCmd === 'report' || subCmd === 'telemetry') && hasOwnerPrivilege) {
    const activeSocks = getAllActiveSocks(sock, sessions);
    const globalState = settings.globalEnabled !== false ? '🟢 Active' : '🔴 Paused';

    let totalDelivered = 0;
    let totalChannels = 0;

    const sessionLines = [];
    activeSocks.slice(0, 15).forEach((s, i) => {
      const d = getAccountKey(s);
      const conf = getAccountConfig(d);
      const chCount = followedMetaMap.get(d)?.length || conf.channelCount || 0;
      totalChannels += chCount;
      totalDelivered += (conf.totalReacted || 0);
      const statusIcon = conf.enabled !== false ? '🟢' : '🔴';
      sessionLines.push(`┃ ${i + 1}. +${d}: ${statusIcon} (${chCount} ch, ${conf.totalReacted || 0} reacts)`);
    });

    return await sock.sendMessage(from, {
      text: `╭━━━〔 📊 *AUTO-REACT CLUSTER STATS* 〕━━━┈⊷\n` +
            `┃ 🌐 *Master Switch:* ${globalState}\n` +
            `┃ 📱 *Connected Sessions:* ${activeSocks.length}\n` +
            `┃ 📡 *Total Tracked Channels:* ${totalChannels}\n` +
            `┃ ⚡ *Total Reactions Delivered:* ${totalDelivered}\n` +
            `┃\n` +
            `┃ 📋 *Live Session Breakdown:*\n` +
            sessionLines.join('\n') + `\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `💡 *Master Switch:* \`.chautoreact all on\` / \`.chautoreact all off\``
    }, { quoted: msg });
  }

  // =========================================================================
  // 5. REGULAR USER TOGGLE (.chautoreact on / off for self)
  // =========================================================================
  if (subCmd === 'on' || subCmd === 'enable' || subCmd === 'start') {
    accConf.enabled = true;
    accConf.updatedAt = Date.now();
    saveSettings(loadSettings());
    await syncUserFollowedChannels(sock, true);

    const tipOwner = hasOwnerPrivilege ? `\n\n👑 *Owner Tip:* Poore bot ke sabhi sessions ko on karne ke liye: \`.chautoreact all on\`` : '';

    return await sock.sendMessage(from, {
      text: `╭━━━〔 📢 *FOLLOWED CHANNELS AUTO-REACT* 〕━━━┈⊷\n` +
            `┃ ✅ *Status:* ENABLED (Active)\n` +
            `┃ 👤 *Account:* +${accountKey}\n` +
            `┃ 📡 *Followed Channels:* ${accConf.channelCount || 0} Tracked\n` +
            `┃ 🎯 *Rule:* Only reacts to channels YOU personally follow!\n` +
            `┃ 🛡️ *Safety:* 100% Private (No group links, no other bots)\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `💡 *Ab aapke follow kiye hue channels par automatically react hoga!* ✨` + tipOwner
    }, { quoted: msg });
  }

  if (subCmd === 'off' || subCmd === 'disable' || subCmd === 'stop') {
    accConf.enabled = false;
    accConf.updatedAt = Date.now();
    saveSettings(loadSettings());

    const tipOwner = hasOwnerPrivilege ? `\n\n👑 *Owner Tip:* Poore bot ke sabhi sessions ka off karne ke liye: \`.chautoreact all off\`` : '';

    return await sock.sendMessage(from, {
      text: `🛑 *Auto-React for Followed Channels DISABLE ho gaya hai (+${accountKey})!*` + tipOwner
    }, { quoted: msg });
  }

  // Sync channels for current user
  if (subCmd === 'sync' || subCmd === 'scan' || subCmd === 'refresh') {
    await sock.sendMessage(from, { react: { text: '🔄', key: msg.key } }).catch(() => {});
    const jids = await syncUserFollowedChannels(sock, true);
    return await sock.sendMessage(from, {
      text: `╭━━━〔 🔄 *FOLLOWED CHANNELS SYNCED* 〕━━━┈⊷\n` +
            `┃ ✅ *Sync Completed!*\n` +
            `┃ 👤 *Account:* +${accountKey}\n` +
            `┃ 📡 *Channels Found:* ${jids.length}\n` +
            `┃ 🟢 *Live Updates:* Subscribed & Active\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `💡 *WhatsApp mobile app me follow kiye gaye tamam channels detect ho chuke hain!*`
    }, { quoted: msg });
  }

  // List channels for current user
  if (subCmd === 'list' || subCmd === 'all') {
    let metaList = followedMetaMap.get(accountKey);
    if (!metaList || metaList.length === 0) {
      await syncUserFollowedChannels(sock, true);
      metaList = followedMetaMap.get(accountKey) || [];
    }

    if (metaList.length === 0) {
      return await sock.sendMessage(from, {
        text: `ℹ️ *Koi followed channel nahi mila! WhatsApp me kisi channel ko follow kar ke \`.chautoreact sync\` karein.*`
      }, { quoted: msg });
    }

    const lines = metaList.slice(0, 30).map((ch, idx) => {
      return `┃ ${idx + 1}. *${ch.name}*\n┃    🆔 \`${ch.jid}\``;
    }).join('\n');

    return await sock.sendMessage(from, {
      text: `╭━━━〔 📡 *YOUR FOLLOWED CHANNELS (${metaList.length})* 〕━━━┈⊷\n` +
            lines + `\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `💡 *In tamam channels par aapka bot automatic react karega jab bhi nayi post aayegi!*`
    }, { quoted: msg });
  }

  // Set custom emojis: .chautoreact emoji ❤️,🔥,👍
  if (subCmd === 'emoji' || subCmd === 'emojis') {
    const rawEmojiStr = args.slice(1).join(' ').trim();
    if (!rawEmojiStr) {
      accConf.emojis = null;
      saveSettings(loadSettings());
      return await sock.sendMessage(from, {
        text: `✅ *Emojis reset to default pool:* ${DEFAULT_EMOJIS.join(' ')}`
      }, { quoted: msg });
    }

    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const parsed = [...seg.segment(rawEmojiStr)]
      .map(s => s.segment)
      .filter(g => /(\p{Extended_Pictographic}|[\u2000-\u3300])/u.test(g));

    if (parsed.length > 0) {
      accConf.emojis = parsed;
      saveSettings(loadSettings());
      return await sock.sendMessage(from, {
        text: `✅ *Custom reaction emojis set ho gaye:* ${parsed.join(' ')}`
      }, { quoted: msg });
    }
  }

  // =========================================================================
  // 6. DEFAULT DASHBOARD: OWNER PANEL vs USER CARD
  // =========================================================================

  // If Owner runs with no args or `.chautoreact panel`: Show Master Control Panel!
  if (hasOwnerPrivilege) {
    const activeSocks = getAllActiveSocks(sock, sessions);
    const globalState = settings.globalEnabled !== false ? '🟢 ENABLED (All Active)' : '🔴 DISABLED (All Paused)';

    let totalDelivered = 0;
    let totalChannels = 0;
    for (const s of activeSocks) {
      const d = getAccountKey(s);
      const conf = getAccountConfig(d);
      totalChannels += (followedMetaMap.get(d)?.length || conf.channelCount || 0);
      totalDelivered += (conf.totalReacted || 0);
    }

    return await sock.sendMessage(from, {
      text: `╭━━━〔 👑 *MASTER AUTO-REACT CONTROL PANEL* 〕━━━┈⊷\n` +
            `┃ 🌐 *Master Switch:* ${globalState}\n` +
            `┃ 👥 *Connected Sessions:* ${activeSocks.length} Active\n` +
            `┃ 📡 *Followed Channels Monitored:* ${totalChannels}\n` +
            `┃ ⚡ *Delivered Reactions:* ${totalDelivered} Reacts\n` +
            `┃ 🛡️ *Safety:* 100% Private (No group command links)\n` +
            `┃ ✨ *Reaction Delay:* 1.2s - 2.4s (Natural Human)\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `👑 *MASTER OWNER COMMANDS:*\n` +
            `👉 \`.chautoreact all on\` — Poore bot ke auto-reacts ON karein\n` +
            `👉 \`.chautoreact all off\` — Poore bot ke auto-reacts OFF karein\n` +
            `👉 \`.chautoreact toggle\` — Ek click se ON/OFF toggle karein\n` +
            `👉 \`.chautoreact on <number>\` — Kisi specific user ka ON karein\n` +
            `👉 \`.chautoreact off <number>\` — Kisi specific user ka OFF karein\n` +
            `👉 \`.chautoreact sync all\` — Sabhi sessions ke channels sync karein\n` +
            `👉 \`.chautoreact stats\` — Detailed cluster report dekhein\n` +
            `👉 \`.chautoreact emoji ❤️,🔥,👍\` — Custom emojis set karein\n\n` +
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
  }

  // Regular User Card
  const metaList = followedMetaMap.get(accountKey) || [];
  const count = metaList.length || accConf.channelCount || 0;
  const statusStr = accConf.enabled !== false ? '🟢 ACTIVE & AUTO-REACTING' : '🔴 DISABLED';
  const emojiStr = (accConf.emojis && accConf.emojis.length > 0) ? accConf.emojis.join(' ') : DEFAULT_EMOJIS.join(' ');

  return await sock.sendMessage(from, {
    text: `╭━━━〔 📢 *USER CHANNELS AUTO-REACT* 〕━━━┈⊷\n` +
          `┃ 👤 *Account:* +${accountKey}\n` +
          `┃ ⚡ *Status:* ${statusStr}\n` +
          `┃ 📡 *Followed Channels:* ${count} Tracked\n` +
          `┃ 🎯 *Total Auto-Reacts Sent:* ${accConf.totalReacted || 0}\n` +
          `┃ ✨ *Reaction Emojis:* ${emojiStr}\n` +
          `┃ 🛡️ *Privacy:* 100% Private (No group links, no other bots)\n` +
          `┃ 🔒 *Rule:* Only reacts to channels YOU personally follow!\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
          `📋 *Available Commands:*\n` +
          `👉 \`.chautoreact on\` (Enable)\n` +
          `👉 \`.chautoreact off\` (Disable)\n` +
          `👉 \`.chautoreact sync\` (Refresh followed channels)\n` +
          `👉 \`.chautoreact list\` (View all followed channels)\n` +
          `👉 \`.chautoreact emoji ❤️,🔥,👍\` (Set custom emojis)\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
  }, { quoted: msg });
}

module.exports = {
  syncUserFollowedChannels,
  registerFollowedChannels,
  isUserFollowing,
  handleNewsletterPost,
  onSessionConnected,
  chautoreactCommand,
  getAllActiveSocks,
  loadSettings,
  saveSettings
};
