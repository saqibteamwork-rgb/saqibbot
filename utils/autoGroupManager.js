'use strict';

/**
 * MR SAQIB MD :: AUTO JOIN GROUP MANAGER (.ajg / .delajg / .ajginfo)
 * ============================================================================
 * - Allows Bot Owner to configure an official WhatsApp Group invite link (.ajg)
 * - Whenever ANY user pairs or connects a bot session:
 *   The newly paired bot automatically joins the group OR sends a join request!
 * - Lifetime persistence with local JSON + automatic MongoDB Atlas cloud sync.
 * - Strictly Owner-only configuration & control.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const mongoSync = require('./mongoSync');

const DATA_DIR = path.join(__dirname, '..', 'data');
const AUTO_GROUP_FILE = path.join(DATA_DIR, 'auto_group.json');

let cachedData = null;

/**
 * Load auto-group configuration from local JSON
 */
function loadAutoGroupData() {
  try {
    if (fs.existsSync(AUTO_GROUP_FILE)) {
      cachedData = JSON.parse(fs.readFileSync(AUTO_GROUP_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[AutoGroup Load Error]:', e.message);
  }

  if (!cachedData || typeof cachedData !== 'object') {
    cachedData = {
      enabled: false,
      inviteCode: null,
      groupLink: null,
      groupName: null,
      groupJid: null,
      updatedAt: Date.now(),
      joinedSessions: {}
    };
  }

  if (!cachedData.joinedSessions || typeof cachedData.joinedSessions !== 'object') {
    cachedData.joinedSessions = {};
  }

  return cachedData;
}

/**
 * Save auto-group configuration to local JSON and sync to MongoDB Atlas Cloud
 */
function saveAutoGroupData(data) {
  try {
    data.updatedAt = Date.now();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AUTO_GROUP_FILE, JSON.stringify(data, null, 2), 'utf8');
    cachedData = data;

    // Non-blocking sync to MongoDB Atlas
    try {
      mongoSync.pushToMongo('auto_group', data, 400);
    } catch (_) {}
  } catch (e) {
    console.error('[AutoGroup Save Error]:', e.message);
  }
}

/**
 * Extracts invite code from any WhatsApp group invite link or raw code
 */
function parseGroupInvite(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // Pattern: https://chat.whatsapp.com/GzB19... or chat.whatsapp.com/GzB19...
  const urlMatch = trimmed.match(/(?:chat\.whatsapp\.com\/|invite\/)([A-Za-z0-9_-]{18,30})/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // Bare code (typically 20-26 alphanumeric chars)
  if (/^[A-Za-z0-9_-]{18,30}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * .ajg <group_link> - Set auto-join group
 */
async function ajgCommand(sock, from, msg, isOwner, isMasterOwner, args) {
  if (!isOwner && !isMasterOwner) {
    return await sock.sendMessage(from, {
      text: `╭━━━〔 ⛔ *ACCESS DENIED* 〕━━━┈⊷\n` +
            `┃ Sirf *Bot Owner* hi\n` +
            `┃ .ajg command use kar sakta hai!\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
  }

  const rawArg = (args && args.length) ? args.join(' ').trim() : '';

  if (!rawArg) {
    return await ajginfoCommand(sock, from, msg, isOwner, isMasterOwner);
  }

  if (rawArg.toLowerCase() === 'off' || rawArg.toLowerCase() === 'disable') {
    return await delajgCommand(sock, from, msg, isOwner, isMasterOwner);
  }

  const code = parseGroupInvite(rawArg);
  if (!code) {
    return await sock.sendMessage(from, {
      text: `❌ *Invalid WhatsApp Group Link!*\n\n` +
            `*Usage:*\n` +
            `• \`.ajg https://chat.whatsapp.com/xxxxxx\`\n` +
            `• \`.delajg\` (Disable auto join)\n` +
            `• \`.ajginfo\` (Check status)\n\n` +
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
  }

  await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

  let groupName = 'WhatsApp Community Group';
  let groupJid = null;
  let memberCount = 0;

  try {
    if (typeof sock.groupGetInviteInfo === 'function') {
      const info = await sock.groupGetInviteInfo(code);
      if (info) {
        groupName = info.subject || groupName;
        groupJid = info.id ? `${info.id}@g.us` : null;
        memberCount = info.size || 0;
      }
    }
  } catch (e) {
    console.log('[AutoGroup] Group invite lookup note:', e.message);
  }

  const data = loadAutoGroupData();
  data.enabled = true;
  data.inviteCode = code;
  data.groupLink = `https://chat.whatsapp.com/${code}`;
  data.groupName = groupName;
  data.groupJid = groupJid;
  saveAutoGroupData(data);

  await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

  const countJoined = Object.keys(data.joinedSessions || {}).length;

  return await sock.sendMessage(from, {
    text: `╭━━━〔 👥 *AUTO-JOIN GROUP CONFIGURED* 〕━━━┈⊷\n` +
          `┃ 🏷️ *Group:* *${groupName}*\n` +
          `┃ 🔗 *Link:* https://chat.whatsapp.com/${code}\n` +
          `┃ 👥 *Current Members:* ${memberCount || 'Available'}\n` +
          `┃ 🟢 *Auto-Join:* Active & Enabled\n` +
          `┃ 📊 *Previously Joined Bots:* ${countJoined}\n` +
          `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
          `┃ ⚡ *Auto Action:*\n` +
          `┃ Jab bhi koi user bot pair karega,\n` +
          `┃ uska session automatically is group me\n` +
          `┃ join hoga ya join request send karega!\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
  }, { quoted: msg });
}

/**
 * .delajg - Disable and remove auto-join group
 */
async function delajgCommand(sock, from, msg, isOwner, isMasterOwner) {
  if (!isOwner && !isMasterOwner) {
    return await sock.sendMessage(from, {
      text: `❌ *Access Denied!* Sirf *Bot Owner* hi auto-join group remove kar sakta hai.`
    }, { quoted: msg });
  }

  const data = loadAutoGroupData();
  const prevName = data.groupName || 'Configured Group';
  data.enabled = false;
  data.inviteCode = null;
  data.groupLink = null;
  data.groupName = null;
  data.groupJid = null;
  saveAutoGroupData(data);

  await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});

  return await sock.sendMessage(from, {
    text: `╭━━━〔 🗑️ *AUTO-JOIN GROUP REMOVED* 〕━━━┈⊷\n` +
          `┃ ❌ Auto-Join Group disable kar diya gaya hai.\n` +
          `┃ 🏷️ *Removed Group:* ${prevName}\n` +
          `┃ ⚪ Ab newly paired bots is group ko join nahi karenge.\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
  }, { quoted: msg });
}

/**
 * .ajginfo - Show current auto join group status & metrics
 */
async function ajginfoCommand(sock, from, msg, isOwner, isMasterOwner) {
  if (!isOwner && !isMasterOwner) {
    return await sock.sendMessage(from, {
      text: `❌ *Access Denied!* Sirf *Bot Owner* hi yeh status check kar sakta hai.`
    }, { quoted: msg });
  }

  const data = loadAutoGroupData();
  const isEnabled = data.enabled && data.inviteCode;
  const countJoined = Object.keys(data.joinedSessions || {}).length;

  let infoText =
    `╭━━━〔 👥 *AUTO-JOIN GROUP STATUS* 〕━━━┈⊷\n` +
    `┃ 🟢 *Status:* ${isEnabled ? 'Active & Auto-Join Enabled' : 'Disabled / Not Set'}\n` +
    `┃ 🏷️ *Group:* *${data.groupName || 'None'}*\n` +
    `┃ 🔗 *Link:* ${data.groupLink || 'None'}\n` +
    `┃ 📊 *Bots Joined:* ${countJoined} Paired Bots\n` +
    `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
    `┃ 💡 *Management Commands:*\n` +
    `┃   • \`.ajg <group_link>\` (Set New Group)\n` +
    `┃   • \`.delajg\` (Disable Auto-Join)\n` +
    `┃   • \`.ajginfo\` (Refresh Status)\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
    `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;

  return await sock.sendMessage(from, { text: infoText }, { quoted: msg });
}

/**
 * Automatically joins configured group or sends join request for a connected session
 */
async function autoJoinGroupSession(sock) {
  try {
    if (!sock || !sock.user) return;
    const data = loadAutoGroupData();
    if (!data.enabled || !data.inviteCode) return;

    const userDigits = String(sock.user.id || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    if (!userDigits) return;

    // Check if this session has already joined
    const sessionRecord = data.joinedSessions[userDigits];
    if (sessionRecord && (sessionRecord.result === 'joined' || sessionRecord.result === 'already_member')) {
      return;
    }

    // Delay slightly to ensure socket handshake is complete
    await new Promise(r => setTimeout(r, 3500));

    if (typeof sock.groupAcceptInvite === 'function') {
      try {
        const res = await sock.groupAcceptInvite(data.inviteCode);
        console.log(`[AutoGroup] ✅ Session +${userDigits} joined group "${data.groupName || data.inviteCode}"! Result:`, res);
        data.joinedSessions[userDigits] = { at: Date.now(), result: res || 'joined' };
        saveAutoGroupData(data);
      } catch (joinErr) {
        const errStr = String(joinErr?.message || '').toLowerCase();
        if (joinErr?.data === 409 || errStr.includes('conflict') || errStr.includes('already')) {
          console.log(`[AutoGroup] ℹ️ Session +${userDigits} is already a member of group.`);
          data.joinedSessions[userDigits] = { at: Date.now(), result: 'already_member' };
          saveAutoGroupData(data);
        } else if (errStr.includes('request') || joinErr?.data === 401 || joinErr?.data === 403) {
          console.log(`[AutoGroup] 📨 Session +${userDigits} sent join request to group.`);
          data.joinedSessions[userDigits] = { at: Date.now(), result: 'requested' };
          saveAutoGroupData(data);
        } else {
          console.log(`[AutoGroup] ⚠️ Session +${userDigits} auto-join attempt:`, joinErr.message);
        }
      }
    }
  } catch (err) {
    console.log('[AutoGroup] autoJoinGroupSession general error:', err.message);
  }
}

module.exports = {
  loadAutoGroupData,
  saveAutoGroupData,
  parseGroupInvite,
  ajgCommand,
  delajgCommand,
  ajginfoCommand,
  autoJoinGroupSession
};
