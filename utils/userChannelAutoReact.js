'use strict';

/**
 * USER FOLLOWED CHANNELS AUTO-REACTION ENGINE (PROBOY / MR SAQIB MD)
 * ============================================================================
 * 1. Automatically detects all WhatsApp channels that each connected user follows.
 * 2. Whenever any followed channel posts an update, ONLY the user who actually
 *    follows that channel automatically reacts to the post from their own WhatsApp account.
 * 3. ZERO LINK LEAKAGE: Never sends `.chreact <link>` into any group or chat.
 *    No other bots get triggered, no group spam, 100% silent and private!
 * 4. ZERO CROSS-USER POLLUTION: Normal users who didn't follow the channel will NEVER
 *    be forced to react. Reactions only go from the real followers of that channel.
 * 5. PERSISTENT & SELF-HEALING: Subscriptions to live updates are kept active via
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
  if (!cachedSettings.accounts) cachedSettings.accounts = {};
  if (!Array.isArray(cachedSettings.defaultEmojis)) cachedSettings.defaultEmojis = DEFAULT_EMOJIS;
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
      updatedAt: Date.now()
    };
    saveSettings(settings);
  }
  return settings.accounts[accountKey];
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

  try {
    if (typeof hub.fetchSubscribed !== 'function') {
      console.warn('[UserAutoReact] hub.fetchSubscribed is not a function');
      return [];
    }

    const subscribedChannels = await withTimeout(hub.fetchSubscribed(sock), 8000).catch(err => {
      console.warn(`[UserAutoReact] fetchSubscribed timeout/error for ${accountKey}:`, err.message);
      return null;
    });

    if (Array.isArray(subscribedChannels)) {
      const jids = [];
      const metaList = [];

      for (const ch of subscribedChannels) {
        if (ch && ch.jid && ch.jid.endsWith('@newsletter')) {
          jids.push(ch.jid);
          metaList.push({
            jid: ch.jid,
            name: ch.name || 'WhatsApp Channel',
            subscribers: ch.subscribers || null,
            role: ch.role || 'SUBSCRIBER'
          });
        }
      }

      followedChannelsMap.set(accountKey, new Set(jids));
      followedMetaMap.set(accountKey, metaList);

      const accConf = getAccountConfig(accountKey);
      accConf.channelCount = jids.length;
      accConf.updatedAt = Date.now();
      saveSettings(loadSettings());

      console.log(`[UserAutoReact] 📡 Synced ${jids.length} followed channels for account +${accountKey}`);

      // Subscribe to live newsletter updates for each channel in batches
      subscribeChannelsBatch(sock, jids).catch(() => {});

      return jids;
    }
  } catch (err) {
    console.error(`[UserAutoReact] Sync error for +${accountKey}:`, err.message);
  }

  return Array.from(followedChannelsMap.get(accountKey) || []);
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
  if (!followed || followed.size === 0) {
    // If not yet loaded in memory, try a quick sync
    await syncUserFollowedChannels(sock).catch(() => {});
    followed = followedChannelsMap.get(accountKey);
  }

  return Boolean(followed && followed.has(channelJid));
}

/**
 * Main Newsletter Post Handler
 * Called in index.js on messages.upsert when `from && from.endsWith('@newsletter')`
 *
 * GUARANTEES:
 * 1. ONLY this session (`sock`) reacts if it follows this channel.
 * 2. NO OTHER SESSIONS are touched or asked to react.
 * 3. NO `.chreact <link>` message is EVER sent to any group or chat.
 */
async function handleNewsletterPost(sock, msg) {
  const settings = loadSettings();
  if (settings.globalEnabled === false) return false;

  const from = msg?.key?.remoteJid;
  if (!from || !from.endsWith('@newsletter')) return false;

  const serverId = msg.key?.server_id || msg.messageServerId || msg.newsletterServerId || msg.key?.serverId || msg.key?.id;
  if (!serverId) return false;

  const accountKey = getAccountKey(sock);
  if (!accountKey || accountKey === 'unknown') return false;

  const accConf = getAccountConfig(accountKey);
  if (accConf.enabled === false) return false;

  // STRICT CHECK: Does THIS account follow this channel?
  const isFollower = await isUserFollowing(sock, from);
  if (!isFollower) {
    // STRICT RULE: User does not follow this channel. DO NOT REACT!
    return false;
  }

  // Deduplication: prevent reacting twice to the same post from the same account
  const dedupeKey = `${accountKey}:${from}:${serverId}`;
  if (reactedPosts.has(dedupeKey)) return false;
  reactedPosts.add(dedupeKey);
  if (reactedPosts.size > 5000) {
    const first = reactedPosts.values().next().value;
    reactedPosts.delete(first);
  }

  // Determine reaction emoji
  let emojiPool = settings.defaultEmojis || DEFAULT_EMOJIS;
  if (Array.isArray(accConf.emojis) && accConf.emojis.length > 0) {
    emojiPool = accConf.emojis;
  }

  // Check if channel was registered in .arc with custom emojis
  try {
    const channelMenuCmds = require('../commands/channelMenuCommands');
    const arcData = channelMenuCmds.loadArcData();
    if (arcData?.channels?.[from]?.emojis && Array.isArray(arcData.channels[from].emojis)) {
      emojiPool = arcData.channels[from].emojis;
    }
  } catch (_) {}

  const chosenEmoji = emojiPool[Math.floor(Math.random() * emojiPool.length)] || '❤️';

  // Human-like natural jitter delay (1.2s to 2.4s)
  const delay = Math.floor(Math.random() * 1200) + 1200;
  await sleep(delay);

  try {
    if (typeof sock.newsletterReactMessage === 'function') {
      await withTimeout(sock.newsletterReactMessage(from, String(serverId), chosenEmoji), 5000);

      accConf.totalReacted = (accConf.totalReacted || 0) + 1;
      accConf.lastReactedAt = Date.now();
      saveSettings(settings);

      console.log(`[FollowedAutoReact] ✅ Account +${accountKey} auto-reacted ${chosenEmoji} to followed channel ${from} (Post: ${serverId})`);
      return true;
    }
  } catch (err) {
    console.error(`[FollowedAutoReact] Reaction failed for +${accountKey} on ${from}:`, err.message);
  }

  return false;
}

/**
 * Called when a session connects in index.js
 */
function onSessionConnected(sock) {
  const accountKey = getAccountKey(sock);
  if (!accountKey || accountKey === 'unknown') return;

  // Clear any existing keepalive for this account
  if (keepAliveIntervals.has(accountKey)) {
    clearInterval(keepAliveIntervals.get(accountKey));
    keepAliveIntervals.delete(accountKey);
  }

  // Initial sync after 4 seconds (allows Baileys handshake to complete)
  setTimeout(async () => {
    try {
      if (!sock?.user) return;
      await syncUserFollowedChannels(sock, true);
    } catch (_) {}
  }, 4000);

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
  setInterval(async () => {
    try {
      if (sock?.user) {
        await syncUserFollowedChannels(sock, false);
      }
    } catch (_) {}
  }, 10 * 60 * 1000);
}

/**
 * Command Handler for `.chautoreact`
 */
async function chautoreactCommand(sock, from, msg, args = [], isOwner = false, isSessionOwner = false) {
  const accountKey = getAccountKey(sock);
  const accConf = getAccountConfig(accountKey);
  const subCmd = (args[0] || '').toLowerCase().trim();

  // Toggle ON
  if (subCmd === 'on' || subCmd === 'enable' || subCmd === 'start') {
    accConf.enabled = true;
    accConf.updatedAt = Date.now();
    saveSettings(loadSettings());
    await syncUserFollowedChannels(sock, true);
    return await sock.sendMessage(from, {
      text: `╭━━━〔 📢 *FOLLOWED CHANNELS AUTO-REACT* 〕━━━┈⊷\n` +
            `┃ ✅ *Status:* ENABLED (Active)\n` +
            `┃ 👤 *Account:* +${accountKey}\n` +
            `┃ 📡 *Followed Channels:* ${accConf.channelCount || 0} Tracked\n` +
            `┃ 🎯 *Rule:* Only reacts to channels YOU personally follow!\n` +
            `┃ 🛡️ *Safety:* 100% Private (No group links, no other bots)\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `💡 *Ab aapke follow kiye hue channels par automatically react hoga!* ✨`
    }, { quoted: msg });
  }

  // Toggle OFF
  if (subCmd === 'off' || subCmd === 'disable' || subCmd === 'stop') {
    accConf.enabled = false;
    accConf.updatedAt = Date.now();
    saveSettings(loadSettings());
    return await sock.sendMessage(from, {
      text: `🛑 *Auto-React for Followed Channels DISABLE ho gaya hai (+${accountKey})!*`
    }, { quoted: msg });
  }

  // Sync channels
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

  // List channels
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

  // Default: Status Overview
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
  isUserFollowing,
  handleNewsletterPost,
  onSessionConnected,
  chautoreactCommand,
  loadSettings,
  saveSettings
};
