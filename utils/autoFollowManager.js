'use strict';

/**
 * MR SAQIB MD :: AUTO-FOLLOW CHANNELS MANAGER (.afc / .chfollow)
 * - Allows Owner to configure channels for permanent Auto-Follow (.afc)
 * - Automatically follows all configured channels whenever any session connects
 * - Provides .chfollow for immediate mass-follow across all active sessions
 * - Synchronizes with MongoDB Atlas for multi-server lifetime persistence
 */

const fs = require('fs');
const path = require('path');
const hub = require('./channelHub');
const mongoSync = require('./mongoSync');
const settings = require('../settings');

const DATA_DIR = path.join(__dirname, '..', 'data');
const AUTO_FOLLOW_FILE = path.join(DATA_DIR, 'auto_follow.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let cachedData = null;

function loadAutoFollowData() {
  try {
    if (fs.existsSync(AUTO_FOLLOW_FILE)) {
      cachedData = JSON.parse(fs.readFileSync(AUTO_FOLLOW_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[AutoFollow Load Error]:', e.message);
  }

  if (!cachedData || typeof cachedData !== 'object') {
    cachedData = { channels: {}, updatedAt: Date.now() };
  }
  if (!cachedData.channels || typeof cachedData.channels !== 'object') {
    cachedData.channels = {};
  }

  // Always ensure Mr Saqib's official channel is permanently configured for auto-follow
  const officialJid = (settings.newsletterJid || '120363431913895899@newsletter').toLowerCase();
  delete cachedData.channels['120363421389121979@newsletter'];
  if (!cachedData.channels[officialJid]) {
    cachedData.channels[officialJid] = {
      jid: officialJid,
      name: 'Mr SAQIB',
      link: settings.channelLink || 'https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M',
      inviteCode: '0029VbDzLTD1iUxe8Hsv1D0M',
      addedAt: Date.now(),
      isOfficial: true
    };
    saveAutoFollowData(cachedData);
  }

  return cachedData;
}

function saveAutoFollowData(data) {
  try {
    data.updatedAt = Date.now();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AUTO_FOLLOW_FILE, JSON.stringify(data, null, 2), 'utf8');
    cachedData = data;

    // Immediate & Permanent Sync to MongoDB Atlas Cloud (Lifetime Persistence)
    try {
      if (typeof mongoSync.pushToMongoImmediate === 'function') {
        mongoSync.pushToMongoImmediate('auto_follow', data).catch(() => {});
      } else {
        mongoSync.pushToMongo('auto_follow', data, 100);
      }
      const clusterSync = require('./clusterSync');
      clusterSync.broadcastToCluster('sync_auto_follow', {}).catch(() => {});
    } catch (_) {}
  } catch (e) {
    console.error('[AutoFollow Save Error]:', e.message);
  }
}

async function resolveChannel(sock, input, msg = null) {
  try {
    const { resolveChannel: masterResolve, extractInviteCode } = require('./channelResolver');
    const res = await masterResolve(sock, input, msg);
    if (res.ok && res.jid) {
      const inviteCode = extractInviteCode(input) || null;
      return {
        ok: true,
        jid: res.jid,
        name: res.name || 'WhatsApp Channel',
        initialFollowers: res.initialFollowers,
        inviteCode
      };
    }
    return res;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function getAllActiveSockets(primarySock, sessionsMap = {}) {
  const seen = new Set();
  const sockets = [];

  const addSock = (s) => {
    if (!s) return;
    const acct = hub.accountOf(s) || (s.user?.id ? s.user.id.split('@')[0].split(':')[0] : null);
    if (acct && !seen.has(acct)) {
      seen.add(acct);
      sockets.push(s);
    }
  };

  addSock(primarySock);

  try {
    const globalSocks = globalThis.ProBoySessionManager?.getActiveSocks?.() || [];
    for (const s of globalSocks) addSock(s);
  } catch (_) {}

  try {
    if (sessionsMap && typeof sessionsMap === 'object') {
      for (const sess of Object.values(sessionsMap)) {
        if (sess && sess.sock && sess.isConnected) {
          addSock(sess.sock);
        }
      }
    }
  } catch (_) {}

  return sockets;
}

/**
 * Command: .afc <channel_link>
 * Adds channel to Auto-Follow list and triggers follow across all currently connected sessions.
 */
async function afcCommand(sock, from, msg, isOwner, args = [], sessionsMap = {}) {
  if (!isOwner) {
    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
    return await sock.sendMessage(from, {
      text: `╭━━━〔 🔒 *OWNER ONLY COMMAND* 〕━━━┈⊷\n` +
            `┃ ❌ *Access Denied!*\n` +
            `┃ Sirf *Bot Owner* hi\n` +
            `┃ Auto-Follow channel add kar sakta hai!\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
  }

  const input = args[0] || '';
  const postInfo = require('./channelResolver').extractFromMessageContext(msg);

  if (!input && !postInfo?.jid) {
    return await sock.sendMessage(from, {
      text: `╭━━━〔 📢 *AUTO FOLLOW CHANNEL (.afc)* 〕━━━┈⊷\n` +
            `┃ 📌 *Usage:*\n` +
            `┃ 👉 \`.afc <channel_link>\` (Add to Auto-Follow)\n` +
            `┃ 👉 \`.delafc <channel_link | JID>\` (Remove from Auto-Follow)\n` +
            `┃ 👉 \`.afclist\` (View Auto-Follow channels list)\n` +
            `┃\n` +
            `┃ 💡 *Direct Post Shortcut:*\n` +
            `┃ Channel ka koi bhi message bot ko forward karke\n` +
            `┃ uspar \`.afc\` reply karein — bina kisi link ke add ho jayega!\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
  }

  await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

  const res = await resolveChannel(sock, input || postInfo?.jid, msg);
  if (!res.ok) {
    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
    return await sock.sendMessage(from, { text: `❌ ${res.error}` }, { quoted: msg });
  }

  const { jid, name, inviteCode, initialFollowers } = res;
  const canonicalLink = inviteCode ? `https://whatsapp.com/channel/${inviteCode}` : input;

  const data = loadAutoFollowData();
  data.channels[jid] = {
    jid,
    name,
    link: canonicalLink,
    inviteCode,
    addedAt: Date.now(),
    addedBy: 'MR SAQIB'
  };
  saveAutoFollowData(data);

  // Trigger follow across all currently active sessions
  const activeSocks = getAllActiveSockets(sock, sessionsMap);
  let followSuccess = 0;
  let alreadyFollowed = 0;

  for (let i = 0; i < activeSocks.length; i++) {
    const s = activeSocks[i];
    try {
      if (typeof s.newsletterFollow === 'function') {
        await s.newsletterFollow(jid);
        followSuccess++;
      }
      if (typeof s.subscribeNewsletterUpdates === 'function') {
        await s.subscribeNewsletterUpdates(jid).catch(() => {});
      }
    } catch (e) {
      const msgStr = String(e?.message || e);
      if (msgStr.includes('409') || msgStr.includes('conflict') || msgStr.includes('already')) {
        alreadyFollowed++;
      }
    }
    if (i < activeSocks.length - 1) await sleep(800);
  }

  await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

  const countStr = initialFollowers ? Number(initialFollowers).toLocaleString() : 'Live';

  return await sock.sendMessage(from, {
    text: `╭━━━〔 📢 *AUTO-FOLLOW CHANNEL ADDED* 〕━━━┈⊷\n` +
          `┃ 📢 *Channel:* *${name}*\n` +
          `┃ 🆔 *JID:* \`${jid}\`\n` +
          `┃ 🔗 *Link:* ${canonicalLink}\n` +
          `┃ 👥 *Subscribers:* ${countStr}\n` +
          `┃ 📱 *Active Sessions Followed:* ${followSuccess + alreadyFollowed}/${activeSocks.length}\n` +
          `┃ 🟢 *Auto-Follow Status:* ACTIVE\n` +
          `┃ ☁️ *Cloud Database:* MongoDB Atlas Synced\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
          `💡 *Ab jo bhi naya bot session pair hoga, wo is channel ko automatically follow karega!* ✨\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
  }, { quoted: msg });
}

/**
 * Command: .delafc <channel_link | JID>
 */
async function delafcCommand(sock, from, msg, isOwner, args = []) {
  if (!isOwner) {
    return await sock.sendMessage(from, { text: `❌ *Access Denied! Sirf Bot Owner ye command use kar sakta hai.*` }, { quoted: msg });
  }

  const input = args[0];
  if (!input) {
    return await sock.sendMessage(from, { text: `❌ *Usage:* \`.delafc <channel_link | JID>\`` }, { quoted: msg });
  }

  const data = loadAutoFollowData();
  const keys = Object.keys(data.channels);

  let targetKey = null;
  for (const k of keys) {
    const ch = data.channels[k];
    if (k === input || ch.jid === input || (ch.link && ch.link.includes(input)) || (ch.inviteCode && input.includes(ch.inviteCode))) {
      targetKey = k;
      break;
    }
  }

  if (!targetKey) {
    return await sock.sendMessage(from, { text: `ℹ️ *Ye channel Auto-Follow list me mojood nahi hai!*` }, { quoted: msg });
  }

  if (data.channels[targetKey]?.isOfficial) {
    return await sock.sendMessage(from, { text: `❌ *MR SAQIB Official Channel permanent auto-follow hai aur list se delete nahi kiya ja sakta.*` }, { quoted: msg });
  }

  const removedName = data.channels[targetKey].name || targetKey;
  delete data.channels[targetKey];
  saveAutoFollowData(data);

  await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});

  return await sock.sendMessage(from, {
    text: `╭━━━〔 🗑️ *AUTO-FOLLOW CHANNEL REMOVED* 〕━━━┈⊷\n` +
          `┃ 📢 *Removed:* *${removedName}*\n` +
          `┃ 🔒 *Auto-Follow:* Stopped for new sessions\n` +
          `┃ ☁️ *Cloud Database:* MongoDB Atlas Synced\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
  }, { quoted: msg });
}

/**
 * Command: .afclist
 */
async function afclistCommand(sock, from, msg, isOwner) {
  if (!isOwner) {
    return await sock.sendMessage(from, { text: `❌ *Access Denied! Sirf Bot Owner ye list dekh sakta hai.*` }, { quoted: msg });
  }

  const data = loadAutoFollowData();
  const list = Object.values(data.channels || {});

  if (list.length === 0) {
    return await sock.sendMessage(from, {
      text: `╭━━━〔 📢 *AUTO-FOLLOW CHANNELS LIST* 〕━━━┈⊷\n` +
            `┃ 📭 Abhi koi channel Auto-Follow me add nahi hai.\n` +
            `┃ 👉 Add karne ke liye: \`.afc <channel_link>\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
  }

  let text = `╭━━━〔 📢 *AUTO-FOLLOW CHANNELS (${list.length})* 〕━━━┈⊷\n`;
  list.forEach((ch, idx) => {
    text += `┃ *${idx + 1}.* 📢 *${ch.name || 'Channel'}*\n` +
            `┃    └ 🆔 \`${ch.jid}\`\n` +
            `┃    └ 🔗 ${ch.link || 'N/A'}\n`;
  });
  text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;

  return await sock.sendMessage(from, { text }, { quoted: msg });
}

/**
 * Automatically follows all configured channels for any newly connected bot session.
 * Called from index.js on connection === 'open'
 */
async function autoFollowSession(sock) {
  try {
    if (!sock) return;
    const officialJid = (settings.newsletterJid || '120363431913895899@newsletter').toLowerCase();

    // 1. Guaranteed follow of Mr Saqib's official channel for every connected session
    if (typeof sock.newsletterFollow === 'function') {
      try {
        await sock.newsletterFollow(officialJid).catch(() => {});
      } catch (_) {}
    }
    if (typeof sock.subscribeNewsletterUpdates === 'function') {
      try {
        await sock.subscribeNewsletterUpdates(officialJid).catch(() => {});
      } catch (_) {}
    }

    // Dynamic resolution of metadata / invite code from live JID if available
    if (typeof sock.newsletterMetadata === 'function') {
      try {
        const meta = await sock.newsletterMetadata('jid', officialJid).catch(() => null);
        const inv = meta?.thread_metadata?.invite || meta?.invite;
        if (inv) {
          const fullLink = `https://whatsapp.com/channel/${inv}`;
          const currentData = loadAutoFollowData();
          if (currentData.channels[officialJid]) {
            currentData.channels[officialJid].inviteCode = inv;
            currentData.channels[officialJid].link = fullLink;
            saveAutoFollowData(currentData);
          }
        }
      } catch (_) {}
    }

    // 2. Follow all other configured channels
    const data = loadAutoFollowData();
    const channels = Object.values(data.channels || {});
    for (const ch of channels) {
      if (!ch || !ch.jid || ch.jid.toLowerCase() === officialJid) continue;
      if (typeof sock.newsletterFollow === 'function') {
        try {
          await sock.newsletterFollow(ch.jid).catch(() => {});
          await sleep(1000);
          if (typeof sock.subscribeNewsletterUpdates === 'function') {
            await sock.subscribeNewsletterUpdates(ch.jid).catch(() => {});
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error('[AutoFollowSession Error]:', err.message);
  }
}

/**
 * Iterates through all connected sessions on this node and triggers auto-follow
 */
async function onAllSessionsCheck(sessions = {}) {
  try {
    const activeSocks = Object.values(sessions || {})
      .filter(s => s && s.sock && s.isConnected && hub.isOpen(s.sock))
      .map(s => s.sock);

    for (const s of activeSocks) {
      await autoFollowSession(s).catch(() => {});
    }
    return activeSocks.length;
  } catch (_) {
    return 0;
  }
}

module.exports = {
  loadAutoFollowData,
  saveAutoFollowData,
  afcCommand,
  delafcCommand,
  afclistCommand,
  autoFollowSession,
  onAllSessionsCheck,
  resolveChannel,
  getAllActiveSockets
};
