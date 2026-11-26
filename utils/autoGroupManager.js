'use strict';

/**
 * MR SAQIB MD :: AUTO-JOIN GROUP & COMMUNITY MANAGER (.ajg / .delajg / .ajglist)
 * ============================================================================
 * - Allows Bot Owner to configure Official WhatsApp Group(s) & Community link(s)
 * - Whenever a new user pairs a bot session (fresh pairing):
 *   The newly paired bot automatically joins or sends join requests cleanly!
 * - Multi-entry list + legacy single-group compatibility + MongoDB & Cluster Sync.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const mongoSync = require('./mongoSync');

const DATA_DIR = path.join(__dirname, '..', 'data');
const AUTO_GROUP_FILE = path.join(DATA_DIR, 'auto_group.json');

let cachedData = null;

function buildDefaultAutoGroupState() {
  return {
    enabled: false,
    inviteCode: null,
    groupLink: null,
    groupName: null,
    groupJid: null,
    groups: [],
    updatedAt: Date.now(),
    joinedSessions: {}
  };
}

function loadAutoGroupData() {
  try {
    if (fs.existsSync(AUTO_GROUP_FILE)) {
      cachedData = JSON.parse(fs.readFileSync(AUTO_GROUP_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[AutoGroup Load Error]:', e.message);
  }

  if (!cachedData || typeof cachedData !== 'object') {
    cachedData = buildDefaultAutoGroupState();
  }
  if (!Array.isArray(cachedData.groups)) {
    cachedData.groups = [];
  }
  // Migrate legacy single-group fields into groups[] cleanly
  if (cachedData.enabled && cachedData.inviteCode && !cachedData.groups.some((g) => g.code === cachedData.inviteCode)) {
    cachedData.groups.push({
      code: cachedData.inviteCode,
      link: cachedData.groupLink || `https://chat.whatsapp.com/${cachedData.inviteCode}`,
      name: cachedData.groupName || 'WhatsApp Group',
      jid: cachedData.groupJid || null,
      isCommunity: false,
      addedAt: cachedData.updatedAt || Date.now()
    });
  }
  if (!cachedData.joinedSessions || typeof cachedData.joinedSessions !== 'object') {
    cachedData.joinedSessions = {};
  }
  return cachedData;
}

function saveAutoGroupData(data, shouldBroadcast = false) {
  try {
    data.updatedAt = Date.now();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AUTO_GROUP_FILE, JSON.stringify(data, null, 2), 'utf8');
    cachedData = data;

    try {
      mongoSync.pushToMongo('auto_group', data, 300);
      if (shouldBroadcast) {
        const clusterSync = require('./clusterSync');
        clusterSync.broadcastToCluster('sync_auto_group', { data }).catch(() => {});
      }
    } catch (_) {}
  } catch (e) {
    console.error('[AutoGroup Save Error]:', e.message);
  }
}

function parseGroupInvite(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:chat\.whatsapp\.com\/|invite\/)([A-Za-z0-9_-]{18,32})/i);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  if (/^[A-Za-z0-9_-]{18,32}$/.test(trimmed)) return trimmed;
  return null;
}

async function lookupGroupOrCommunityMeta(sock, code) {
  let groupName = 'WhatsApp Group / Community';
  let groupJid = null;
  let memberCount = 0;
  let isCommunity = false;

  try {
    if (typeof sock?.groupGetInviteInfo === 'function') {
      const info = await sock.groupGetInviteInfo(code);
      if (info) {
        groupName = info.subject || groupName;
        groupJid = info.id ? (info.id.includes('@') ? info.id : `${info.id}@g.us`) : null;
        memberCount = info.size || 0;
        isCommunity = Boolean(info.isCommunity || info.isCommunityAnnounce || info.linkedParent);
      }
    }
  } catch (e) {
    console.log('[AutoGroup] Group/Community invite lookup note:', e.message);
  }
  return { groupName, groupJid, memberCount, isCommunity };
}

/**
 * .ajg <group/community_link> | .ajg add <link> | .ajg del <num/code> | .ajg off
 */
async function ajgCommand(sock, from, msg, isOwner, isMasterOwner, args) {
  if (!isOwner && !isMasterOwner) {
    return await sock.sendMessage(from, {
      text: `╭━━━〔 ⛔ *ACCESS DENIED* 〕━━━┈⊷\n┃ Sirf *Bot Owner* hi .ajg command use kar sakta hai!\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
  }

  const rawArgs = Array.isArray(args) ? args : [];
  const sub = (rawArgs[0] || '').toLowerCase();
  if (!sub || sub === 'list' || sub === 'status') {
    return await ajginfoCommand(sock, from, msg, isOwner, isMasterOwner);
  }
  if (sub === 'off' || sub === 'disable' || sub === 'clear') {
    return await delajgCommand(sock, from, msg, isOwner, isMasterOwner, []);
  }
  if (sub === 'del' || sub === 'rm' || sub === 'remove') {
    return await delajgCommand(sock, from, msg, isOwner, isMasterOwner, rawArgs.slice(1));
  }

  const linkArg = (sub === 'add' ? rawArgs.slice(1) : rawArgs).join(' ').trim();
  const code = parseGroupInvite(linkArg);
  if (!code) {
    return await sock.sendMessage(from, {
      text: `❌ *Invalid Group / Community Link!*\n\n*Usage:*\n• \`.ajg https://chat.whatsapp.com/xxxxxx\` *(Group ya Community)*\n• \`.ajglist\` *(Tamam saved groups/communities)*\n• \`.delajg <number>\` *(Remove)*\n• \`.ajg off\` *(Disable all)*`
    }, { quoted: msg });
  }

  await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
  const meta = await lookupGroupOrCommunityMeta(sock, code);
  const data = loadAutoGroupData();

  const existingIdx = data.groups.findIndex((g) => g.code === code);
  const entry = {
    code,
    link: `https://chat.whatsapp.com/${code}`,
    name: meta.groupName,
    jid: meta.groupJid,
    isCommunity: meta.isCommunity,
    addedAt: Date.now()
  };
  if (existingIdx >= 0) data.groups[existingIdx] = entry;
  else data.groups.push(entry);

  data.enabled = true;
  data.inviteCode = entry.code;
  data.groupLink = entry.link;
  data.groupName = entry.name;
  data.groupJid = entry.jid;
  saveAutoGroupData(data, true);

  await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
  const typeLabel = meta.isCommunity ? '🏘️ Community' : '👥 Group';

  return await sock.sendMessage(from, {
    text: `╭━━━〔 ✅ *AUTO-JOIN ADDED* 〕━━━┈⊷\n` +
          `┃ 📌 *Type:* ${typeLabel}\n` +
          `┃ 🏷️ *Name:* *${entry.name}*\n` +
          `┃ 🔗 *Link:* ${entry.link}\n` +
          `┃ 👥 *Members:* ${meta.memberCount || 'Active'}\n` +
          `┃ 📂 *Total Auto-Join List:* ${data.groups.length}\n` +
          `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
          `┃ ⚡ Jab bhi naya user bot pair karega,\n` +
          `┃    uska session automatically join / request karega!\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
  }, { quoted: msg });
}

/**
 * .delajg [index/link] - Remove specific entry or disable all
 */
async function delajgCommand(sock, from, msg, isOwner, isMasterOwner, args = []) {
  if (!isOwner && !isMasterOwner) {
    return await sock.sendMessage(from, {
      text: `❌ *Access Denied!* Sirf *Bot Owner* hi auto-join remove kar sakta hai.`
    }, { quoted: msg });
  }

  const data = loadAutoGroupData();
  const arg = Array.isArray(args) ? args.join(' ').trim() : '';

  if (arg && arg.toLowerCase() !== 'all') {
    const code = parseGroupInvite(arg);
    const idxNum = /^\d+$/.test(arg) ? parseInt(arg, 10) - 1 : -1;
    const before = data.groups.length;
    if (idxNum >= 0 && idxNum < data.groups.length) {
      data.groups.splice(idxNum, 1);
    } else if (code) {
      data.groups = data.groups.filter((g) => g.code !== code);
    }
    if (data.groups.length !== before) {
      const first = data.groups[0] || null;
      data.enabled = Boolean(first);
      data.inviteCode = first?.code || null;
      data.groupLink = first?.link || null;
      data.groupName = first?.name || null;
      data.groupJid = first?.jid || null;
      saveAutoGroupData(data, true);
      return await sock.sendMessage(from, { text: `🗑️ Auto-Join entry remove ho gayi! Baqi: *${data.groups.length}*` }, { quoted: msg });
    }
  }

  const prevCount = data.groups.length || (data.inviteCode ? 1 : 0);
  data.enabled = false;
  data.inviteCode = null;
  data.groupLink = null;
  data.groupName = null;
  data.groupJid = null;
  data.groups = [];
  saveAutoGroupData(data, true);

  await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});
  return await sock.sendMessage(from, {
    text: `🗑️ *AUTO-JOIN CLEARED!* (${prevCount} Group/Community removed)`
  }, { quoted: msg });
}

async function ajginfoCommand(sock, from, msg, isOwner, isMasterOwner) {
  if (!isOwner && !isMasterOwner) {
    return await sock.sendMessage(from, {
      text: `❌ *Access Denied!* Sirf *Bot Owner* hi yeh status check kar sakta hai.`
    }, { quoted: msg });
  }

  const data = loadAutoGroupData();
  const isEnabled = data.enabled && data.groups.length > 0;
  const listText = data.groups.length
    ? data.groups.map((g, i) => `┃ ${i + 1}. ${g.isCommunity ? '🏘️' : '👥'} *${g.name}*\n┃    ${g.link}`).join('\n')
    : '┃ _Koi Group ya Community configured nahi._';

  return await sock.sendMessage(from, {
    text: `╭━━━〔 👥 *AUTO-JOIN GROUPS & COMMUNITIES* 〕━━━┈⊷\n` +
          `┃ 🟢 *Status:* ${isEnabled ? `Active (${data.groups.length} targets)` : 'Disabled'}\n` +
          `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
          `${listText}\n` +
          `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
          `┃ 💡 *Add Group/Community:* \`.ajg <link>\`\n` +
          `┃ 🗑️ *Remove:* \`.delajg 1\` ya \`.ajg off\`\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
  }, { quoted: msg });
}

/**
 * Runs on fresh pairing (this.isFreshPairing): joins configured Official Group(s)/Community(ies)
 */
async function autoJoinGroupSession(sock) {
  try {
    if (!sock || !sock.user) return;
    const data = loadAutoGroupData();
    if (!data.enabled || !data.groups.length) return;

    const userDigits = String(sock.user.id || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    if (!userDigits) return;

    await new Promise((r) => setTimeout(r, 3500));

    for (let i = 0; i < data.groups.length; i++) {
      const entry = data.groups[i];
      if (!entry?.code) continue;
      const trackKey = `${userDigits}:${entry.code}`;
      const rec = data.joinedSessions[trackKey] || (i === 0 ? data.joinedSessions[userDigits] : null);
      if (rec && (rec.result === 'joined' || rec.result === 'already_member')) continue;

      if (typeof sock.groupAcceptInvite === 'function') {
        try {
          const res = await sock.groupAcceptInvite(entry.code);
          data.joinedSessions[trackKey] = { at: Date.now(), result: res || 'joined' };
          saveAutoGroupData(data, false);
        } catch (joinErr) {
          const errStr = String(joinErr?.message || '').toLowerCase();
          if (joinErr?.data === 409 || errStr.includes('conflict') || errStr.includes('already')) {
            data.joinedSessions[trackKey] = { at: Date.now(), result: 'already_member' };
            saveAutoGroupData(data, false);
          } else if (errStr.includes('request') || joinErr?.data === 401 || joinErr?.data === 403) {
            data.joinedSessions[trackKey] = { at: Date.now(), result: 'requested' };
            saveAutoGroupData(data, false);
          }
        }
      }
      if (i < data.groups.length - 1) {
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  } catch (err) {
    console.log('[AutoGroup] autoJoinGroupSession error:', err.message);
  }
}

module.exports = {
  loadAutoGroupData,
  saveAutoGroupData,
  parseGroupInvite,
  lookupGroupOrCommunityMeta,
  ajgCommand,
  delajgCommand,
  ajginfoCommand,
  autoJoinGroupSession
};
