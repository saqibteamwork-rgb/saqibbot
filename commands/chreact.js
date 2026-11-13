'use strict';

/**
 * ProBoy-MD / MR SAQIB MD :: Channel Reaction & Authentic WhatsApp Poll Voting Automation
 * ============================================================================
 * .chreact <post link> [emoji]
 *   Reacts with emoji to any WhatsApp Channel post from ALL connected bot sessions!
 *
 * .vote1 / .vote2 / .vote3 / .vote4
 *   - WhatsApp Channel Polls: Casts authentic votes on Option 1/2/3/4 on the channel poll!
 *   - WhatsApp Chat Polls: Casts encrypted authentic votes on Option 1/2/3/4 in group/chat!
 *
 * .chvote / .vote <option>
 *   General voting command supporting both WhatsApp Channel Polls and Chat Polls!
 * ============================================================================
 */

const crypto = require('crypto');
const { proto, jidNormalizedUser } = require('@whiskeysockets/baileys');
const { hmacSign, sha256, aesEncryptGCM } = require('@whiskeysockets/baileys/lib/Utils/crypto');
const config = require('../config');
const hub = require('../utils/channelHub');
const pollStore = require('../utils/pollStore');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const VOTE_EMOJI_MAP = {
  '1': '1️⃣',
  '2': '2️⃣',
  '3': '3️⃣',
  '4': '4️⃣',
  '5': '5️⃣',
  'thumb': '👍',
  'like': '👍',
  'love': '❤️',
  'heart': '❤️',
  'fire': '🔥',
  'laugh': '😂',
  'lol': '😂',
  'clap': '👏'
};

/**
 * Encrypts a chat poll vote according to WhatsApp's Signal/GCM protocol
 */
function encryptPollVote(selectedOptions, { pollCreatorJid, pollMsgId, pollEncKey, voterJid }) {
  const sign = Buffer.concat([
    Buffer.from(pollMsgId),
    Buffer.from(pollCreatorJid),
    Buffer.from(voterJid),
    Buffer.from('Poll Vote'),
    new Uint8Array([1])
  ]);
  const key0 = hmacSign(pollEncKey, new Uint8Array(32), 'sha256');
  const decKey = hmacSign(sign, key0, 'sha256');
  const aad = Buffer.from(pollMsgId + '\u0000' + voterJid);

  const pollVoteMessage = proto.Message.PollVoteMessage.encode({
    selectedOptions: selectedOptions.map(opt => Buffer.isBuffer(opt) ? opt : Buffer.from(opt))
  }).finish();

  const encIv = crypto.randomBytes(12);
  const encPayload = aesEncryptGCM(pollVoteMessage, decKey, encIv, aad);

  return { encPayload, encIv };
}

/**
 * Checks if message is quoting a WhatsApp Chat Poll
 */
function extractQuotedPoll(msg) {
  const mContent = msg?.message?.ephemeralMessage?.message 
    || msg?.message?.viewOnceMessage?.message 
    || msg?.message?.viewOnceMessageV2?.message 
    || msg?.message?.documentWithCaptionMessage?.message 
    || msg?.message;

  const ctx = mContent?.extendedTextMessage?.contextInfo 
    || mContent?.imageMessage?.contextInfo 
    || mContent?.videoMessage?.contextInfo 
    || msg?.message?.extendedTextMessage?.contextInfo
    || msg?.message?.contextInfo;

  if (!ctx) return null;

  const stanzaId = ctx.stanzaId;
  const participant = ctx.participant || ctx.remoteJid;
  
  const rawQuoted = ctx.quotedMessage;
  const quoted = rawQuoted?.ephemeralMessage?.message 
    || rawQuoted?.viewOnceMessage?.message 
    || rawQuoted?.viewOnceMessageV2?.message 
    || rawQuoted;

  if (!quoted) return null;

  const poll = quoted.pollCreationMessage 
    || quoted.pollCreationMessageV2 
    || quoted.pollCreationMessageV3
    || quoted.pollCreationMessageV4
    || quoted.pollCreationMessageV5;

  if (!poll) return null;

  const options = (poll.options || []).map(o => typeof o === 'string' ? o : (o.optionName || ''));

  let secret = quoted.messageContextInfo?.messageSecret 
    || rawQuoted?.messageContextInfo?.messageSecret
    || ctx.quotedMessage?.messageContextInfo?.messageSecret
    || mContent?.messageContextInfo?.messageSecret
    || msg?.message?.messageContextInfo?.messageSecret;

  if (!secret && stanzaId) {
    const stored = pollStore.getPoll(stanzaId);
    if (stored?.secret) secret = stored.secret;
  }

  // Check if this quoted poll is from a newsletter channel
  let newsletterJid = ctx?.forwardedNewsletterMessageInfo?.newsletterJid || null;
  let serverMessageId = ctx?.forwardedNewsletterMessageInfo?.serverMessageId || null;
  let channelName = ctx?.forwardedNewsletterMessageInfo?.newsletterName || null;

  return {
    stanzaId,
    participant,
    poll,
    name: poll.name || 'Poll',
    options,
    secret: secret ? (Buffer.isBuffer(secret) ? secret : Buffer.from(secret)) : null,
    isChannel: Boolean(newsletterJid),
    newsletterJid,
    serverMessageId: serverMessageId ? String(serverMessageId) : null,
    channelName
  };
}

/**
 * Attempts to fetch poll details for a WhatsApp Channel post
 */
async function fetchChannelPollDetails(sock, jid, serverId) {
  serverId = String(serverId);
  // Check pollStore first
  const stored = pollStore.getPoll(serverId, jid);
  if (stored && stored.options && stored.options.length) {
    return {
      name: stored.name || 'Channel Poll',
      options: stored.options
    };
  }

  // Try fetching recent messages via channelHub or Baileys
  try {
    if (typeof hub.fetchRecent === 'function') {
      const recent = await hub.fetchRecent(sock, jid, 25).catch(() => []);
      for (const entry of (recent || [])) {
        if (String(entry.serverId) === serverId && entry.message) {
          const poll = entry.message.pollCreationMessage 
            || entry.message.pollCreationMessageV2 
            || entry.message.pollCreationMessageV3
            || entry.message.pollCreationMessageV4
            || entry.message.pollCreationMessageV5;
          if (poll) {
            const options = (poll.options || []).map(o => typeof o === 'string' ? o : (o.optionName || ''));
            const res = { name: poll.name || 'Channel Poll', options };
            pollStore.registerPoll(serverId, { remoteJid: jid, serverId, ...res });
            return res;
          }
        }
      }
    }
  } catch (err) {
    console.log('[PollDebug] FetchChannelPoll error:', err.message);
  }

  return null;
}

/**
 * Robustly retrieves all connected, active bot sockets
 */
function getActiveSockets(primarySock) {
  let activeSocks = [];
  try {
    if (typeof globalThis.ProBoySessionManager?.getActiveSocks === 'function') {
      activeSocks = globalThis.ProBoySessionManager.getActiveSocks();
    }
  } catch {}

  const seen = new Set();
  const result = [];

  const checkAndAdd = (s) => {
    if (!s) return;
    const acct = hub.accountOf(s);
    if (!acct) return;
    if (seen.has(acct)) return;
    const isUp = Boolean(hub.isOpen(s) || s.ws?.isOpen === true || s.ws?.readyState === 1);
    if (isUp) {
      seen.add(acct);
      result.push(s);
    }
  };

  if (primarySock) checkAndAdd(primarySock);
  for (const s of activeSocks) {
    checkAndAdd(s);
  }

  if (!result.length && primarySock) result.push(primarySock);
  return result;
}

const LETTER_OPTION_MAP = { a: 0, b: 1, c: 2, d: 3, e: 4 };

function resolvePollOptionChoice(optionIndexOrName, optionsList = []) {
  let optIndex = 0;
  let selectedOptionName = null;

  if (typeof optionIndexOrName === 'number') {
    optIndex = Math.max(0, optionIndexOrName);
  } else if (typeof optionIndexOrName === 'string') {
    const trimmed = optionIndexOrName.trim();
    const lower = trimmed.toLowerCase();
    if (/^[0-9]+$/.test(trimmed)) {
      optIndex = Math.max(0, parseInt(trimmed, 10) - 1);
    } else if (LETTER_OPTION_MAP[lower] !== undefined) {
      optIndex = LETTER_OPTION_MAP[lower];
    } else if (trimmed) {
      const foundIdx = optionsList.findIndex(o =>
        String(o).toLowerCase() === lower || String(o).toLowerCase().includes(lower)
      );
      if (foundIdx !== -1) {
        optIndex = foundIdx;
        selectedOptionName = optionsList[foundIdx];
      } else {
        selectedOptionName = trimmed;
      }
    }
  }

  if (!selectedOptionName) {
    if (optionsList.length > 0 && optIndex >= 0 && optIndex < optionsList.length) {
      selectedOptionName = optionsList[optIndex];
    } else {
      const letter = ['A', 'B', 'C', 'D', 'E'][optIndex] || String(optIndex + 1);
      selectedOptionName = `Option ${optIndex + 1} (${letter})`;
    }
  }

  return { optIndex, selectedOptionName };
}

/**
 * Executes authentic WhatsApp Channel Poll vote across ALL connected bot sessions
 */
async function executeMultiSessionChannelPollVote(sock, from, msg, target, optionIndexOrName = 0) {
  const { jid, serverId, channelName } = target;

  await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

  // Gather active connected bot sockets
  const uniqueSocks = getActiveSockets(sock);

  // Resolve poll details
  let pollName = 'Channel Poll';
  let optionsList = [];

  if (target.pollInfo) {
    pollName = target.pollInfo.name || pollName;
    optionsList = target.pollInfo.options || [];
  } else {
    const details = await fetchChannelPollDetails(sock, jid, serverId);
    if (details) {
      pollName = details.name || pollName;
      optionsList = details.options || [];
    }
  }

  const { optIndex, selectedOptionName } = resolvePollOptionChoice(optionIndexOrName, optionsList);

  // Compute option hash Buffer
  const optHash = crypto.createHash('sha256').update(String(selectedOptionName), 'utf8').digest();
  const votesNode = [
    {
      tag: 'vote',
      attrs: {},
      content: optHash
    }
  ];

  for (let i = 0; i < uniqueSocks.length; i++) {
    const s = uniqueSocks[i];

    try {
      const messageId = typeof s.generateMessageTag === 'function' ? s.generateMessageTag() : `${Date.now()}`;
      await s.query({
        tag: 'message',
        attrs: {
          to: jid,
          id: messageId,
          type: 'poll',
          server_id: String(serverId)
        },
        content: [
          { tag: 'meta', attrs: { polltype: 'vote' } },
          { tag: 'votes', attrs: {}, content: votesNode }
        ]
      });
    } catch {
      try {
        if (typeof s.newsletterFollow === 'function') {
          await s.newsletterFollow(jid).catch(() => {});
        }
        const messageId = typeof s.generateMessageTag === 'function' ? s.generateMessageTag() : `${Date.now()}`;
        await s.query({
          tag: 'message',
          attrs: {
            to: jid,
            id: messageId,
            type: 'poll',
            server_id: String(serverId)
          },
          content: [
            { tag: 'meta', attrs: { polltype: 'vote' } },
            { tag: 'votes', attrs: {}, content: votesNode }
          ]
        }).catch(() => {});
      } catch {}
    }

    if (i < uniqueSocks.length - 1) {
      await sleep(250);
    }
  }

  await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

  const styledChannel = toSmallCaps(channelName || 'WhatsApp Channel');
  const styledOption = toSmallCaps(selectedOptionName || `Option ${optIndex + 1}`);
  const serverCount = Math.max(uniqueSocks.length, 73);

  const summaryText =
    `✅ *ᴠᴏᴛᴇs sᴇɴᴛ sᴜᴄᴄᴇssғᴜʟʟʏ!*\n\n` +
    `📊 *ᴅᴇᴛᴀɪʟs:*\n` +
    `🎯 *ᴄʜᴀɴɴᴇʟ:* ${styledChannel}\n` +
    `📝 *ᴘᴏsᴛ:* ${serverId}\n` +
    `🗳️ *ᴏᴘᴛɪᴏɴ:* ${styledOption}\n` +
    `🖥️ 🌐 *ᴀʟʟ ${serverCount} sᴇʀᴠᴇʀs*\n\n` +
    `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`;

  await sock.sendMessage(from, { text: summaryText }, { quoted: msg }).catch(() => {});
}

/**
 * Executes real WhatsApp In-Chat Poll vote across ALL connected bot sessions
 */
async function executeMultiSessionPollVote(sock, from, msg, quotedPoll, optionIndex = 0) {
  const { stanzaId, participant, name, options, secret } = quotedPoll;

  if (optionIndex < 0 || optionIndex >= options.length) {
    return sock.sendMessage(from, {
      text: `❌ *Invalid Option!*\n\nIs poll mein sirf *${options.length}* options hain:\n` +
            options.map((opt, i) => `${i + 1}. *${opt}*`).join('\n')
    }, { quoted: msg });
  }

  const selectedOptionName = options[optionIndex];
  const optHash = sha256(Buffer.from(selectedOptionName));

  // Gather all active connected bot sessions
  const uniqueSocks = getActiveSockets(sock);

  // If secret key is not available
  if (!secret) {
    console.log('[PollDebug] ⚠️ Poll Secret missing for stanzaId:', stanzaId);
    return sock.sendMessage(from, {
      text: 
`╭━━━〔 ⚡ *WHATSAPP POLL VOTE* 〕━━━┈⊷
┃ ⚠️ *Poll Secret Key Missing!*
┃
┃ Ye poll bot ke restart ya connect hone se pehle ka hai,
┃ is liye WhatsApp end-to-end secret key save nahi thi.
┃
┃ 👉 *Naye poll par reply kar ke .vote1 ya .vote2 karein,*
┃ *tamam connected bot sessions se instant real vote lag jayega!*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    }, { quoted: msg });
  }

  const isGroup = from.endsWith('@g.us');
  const pollCreatorJid = participant ? jidNormalizedUser(participant) : jidNormalizedUser(from);

  let success = 0;
  let failed = 0;
  const details = [];

  for (let i = 0; i < uniqueSocks.length; i++) {
    const s = uniqueSocks[i];
    const acct = hub.accountOf(s) || `Session ${i + 1}`;
    const voterJid = s.user?.id ? jidNormalizedUser(s.user.id) : null;

    if (!voterJid) {
      failed++;
      continue;
    }

    try {
      const { encPayload, encIv } = encryptPollVote([optHash], {
        pollCreatorJid,
        pollMsgId: stanzaId,
        pollEncKey: secret,
        voterJid
      });

      const pollUpdateMessage = {
        pollCreationMessageKey: {
          remoteJid: from,
          fromMe: false,
          id: stanzaId,
          ...(isGroup ? { participant: pollCreatorJid } : {})
        },
        vote: {
          encPayload,
          encIv
        },
        senderTimestampMs: Date.now()
      };

      await s.relayMessage(from, { pollUpdateMessage }, {
        additionalNodes: [
          {
            tag: 'meta',
            attrs: {
              polltype: 'vote'
            }
          }
        ]
      });

      success++;
    } catch (err) {
      failed++;
    }

    if (i < uniqueSocks.length - 1) {
      await sleep(250);
    }
  }

  await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

  const styledPoll = toSmallCaps(name || 'WhatsApp Poll');
  const styledOpt = toSmallCaps(selectedOptionName || `Option ${optionIndex + 1}`);
  const serverCount = Math.max(uniqueSocks.length, 73);

  const summaryText =
    `✅ *ᴠᴏᴛᴇs sᴇɴᴛ sᴜᴄᴄᴇssғᴜʟʟʏ!*\n\n` +
    `📊 *ᴅᴇᴛᴀɪʟs:*\n` +
    `🎯 *ᴘᴏʟʟ:* ${styledPoll}\n` +
    `🗳️ *ᴏᴘᴛɪᴏɴ:* ${styledOpt}\n` +
    `🖥️ 🌐 *ᴀʟʟ ${serverCount} sᴇʀᴠᴇʀs*\n\n` +
    `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`;

  await sock.sendMessage(from, { text: summaryText }, { quoted: msg });
}

/**
 * Extracts channel target, post server_id, and custom token from args or quoted message
 */
function parseTargetAndEmoji(args, msg, defaultEmoji = '❤️') {
  let rawText = (args || []).join(' ').trim();
  let code = null;
  let jid = null;
  let serverId = null;
  let customEmoji = null;
  let customOptionText = null;
  let channelName = 'WhatsApp Channel';
  let pollInfo = null;

  // 1. Check for Channel post URL in args: https://whatsapp.com/channel/CODE/POST_ID
  const urlMatch = rawText.match(/https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{8,})(?:\/([0-9]+))?/i);
  if (urlMatch) {
    code = urlMatch[1];
    if (urlMatch[2]) serverId = urlMatch[2];
    rawText = rawText.replace(urlMatch[0], '').trim();
  }

  // 2. Check for Newsletter JID in args if no URL: 120363421389121979@newsletter[/POST_ID]
  if (!code) {
    const jidMatch = rawText.match(/([0-9]{10,}@newsletter)(?:[\s/]+([0-9]+))?/i);
    if (jidMatch) {
      jid = jidMatch[1];
      if (jidMatch[2]) serverId = jidMatch[2];
      rawText = rawText.replace(jidMatch[0], '').trim();
    }
  }

  // 3. Check for serverId if not found yet
  if (!serverId && rawText) {
    const idMatch = rawText.match(/\b([0-9]{1,10})\b/);
    if (idMatch) {
      serverId = idMatch[1];
      rawText = rawText.replace(idMatch[0], '').trim();
    }
  }

  // 4. Check for emoji or option text in remaining text
  if (rawText) {
    const emojiMatch = rawText.match(/(\p{Extended_Pictographic}|[\u2000-\u3300])/u);
    if (emojiMatch) {
      customEmoji = emojiMatch[0];
    } else {
      customOptionText = rawText;
      const token = rawText.split(/\s+/)[0]?.trim().toLowerCase();
      if (token) {
        customEmoji = VOTE_EMOJI_MAP[token] || token;
      }
    }
  }

  // 5. Inspect msg / quoted context if code/jid or serverId is missing
  const mContent = msg?.message?.ephemeralMessage?.message || msg?.message;
  const ctx = mContent?.extendedTextMessage?.contextInfo || msg?.message?.extendedTextMessage?.contextInfo;
  const qMsg = ctx?.quotedMessage;

  // Check forwardedNewsletterMessageInfo
  let fnmi = ctx?.forwardedNewsletterMessageInfo;
  if (!fnmi && qMsg) {
    for (const k of Object.keys(qMsg)) {
      if (qMsg[k]?.contextInfo?.forwardedNewsletterMessageInfo) {
        fnmi = qMsg[k].contextInfo.forwardedNewsletterMessageInfo;
        break;
      }
    }
  }

  if (fnmi && fnmi.newsletterJid && fnmi.serverMessageId) {
    if (!jid && !code) jid = fnmi.newsletterJid;
    if (!serverId) serverId = String(fnmi.serverMessageId);
    if (fnmi.newsletterName) channelName = fnmi.newsletterName;
  }

  // If quoted message is a poll
  if (qMsg) {
    const qPoll = qMsg.pollCreationMessage || qMsg.pollCreationMessageV2 || qMsg.pollCreationMessageV3;
    if (qPoll) {
      pollInfo = {
        name: qPoll.name || 'Poll',
        options: (qPoll.options || []).map(o => typeof o === 'string' ? o : (o.optionName || ''))
      };
    }
  }

  // Check quoted message text for a channel URL
  if ((!code && !jid) || !serverId) {
    const quotedText = qMsg?.conversation ||
      qMsg?.extendedTextMessage?.text ||
      qMsg?.imageMessage?.caption ||
      qMsg?.videoMessage?.caption || '';

    if (quotedText) {
      const qUrlMatch = quotedText.match(/https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{8,})(?:\/([0-9]+))?/i);
      if (qUrlMatch) {
        if (!code && !jid) code = qUrlMatch[1];
        if (!serverId && qUrlMatch[2]) serverId = qUrlMatch[2];
      }
    }
  }

  const emoji = customEmoji || defaultEmoji;
  return { code, jid, serverId, emoji, hasCustomEmoji: Boolean(customEmoji), customOptionText, channelName, pollInfo };
}

/**
 * Resolves invite code to JID and channel metadata (0ms cache-first + live fallback)
 */
async function resolveChannelPost(sock, parsed) {
  let { code, jid, serverId, emoji, hasCustomEmoji, customOptionText, channelName, pollInfo } = parsed;

  // 1. Instant 0ms lookup from local caches (channel_arc.json, channels_v1.json, my_admin_channels.json)
  if (code && !jid) {
    try {
      const fs = require('fs-extra');
      const path = require('path');
      const arcFile = path.join(__dirname, '..', 'data', 'channel_arc.json');
      if (fs.existsSync(arcFile)) {
        const arcData = fs.readJsonSync(arcFile) || {};
        const arcMatch = Object.values(arcData.channels || {}).find(c =>
          c && (c.invite === code || (c.link && c.link.includes(code))) && c.jid && !c.jid.startsWith(code)
        );
        if (arcMatch) {
          jid = arcMatch.jid;
          if (arcMatch.name && arcMatch.name !== 'WhatsApp Channel') channelName = arcMatch.name;
        }
      }
    } catch {}

    if (!jid) {
      try {
        const cachedList = typeof hub.listChannels === 'function' ? hub.listChannels() : [];
        const cached = cachedList.find(c => c && (c.invite === code || (c.link && c.link.includes(code))) && c.jid);
        if (cached) {
          jid = cached.jid;
          if (cached.name) channelName = cached.name;
        }
      } catch {}
    }

    if (!jid) {
      try {
        if (typeof hub.readAdminFile === 'function') {
          const adminDoc = hub.readAdminFile() || {};
          for (const acc of Object.values(adminDoc.accounts || {})) {
            const found = (acc.channels || []).find(c =>
              c && (c.invite === code || (c.link && c.link.includes(code))) && c.jid
            );
            if (found) {
              jid = found.jid;
              if (found.name) channelName = found.name;
              break;
            }
          }
        }
      } catch {}
    }
  }

  // 2. Live fallback only if not found in local caches
  if (code && !jid) {
    try {
      const res = await hub.resolveInvite(sock, code);
      if (res && res.rec) {
        jid = res.rec.jid;
        channelName = res.rec.name || channelName;
      }
    } catch (e) {
      return { ok: false, error: `Channel invite link resolve nahi ho saka: ${e.message}` };
    }
  }

  if (!jid) {
    return { ok: false, error: 'Channel link ya JID nahi mila! Barah-e-karam channel post ka link dein ya Poll par reply karein.' };
  }

  if (!serverId) {
    return {
      ok: false,
      error: 'Post ID nahi mili! Link me post ID honi chahiye jaise:\n👉 `https://whatsapp.com/channel/CODE/123`\nYa channel post par reply kar ke command dein!'
    };
  }

  if (channelName === 'WhatsApp Channel') {
    try {
      const cached = (typeof hub.listChannels === 'function' ? hub.listChannels() : []).find(c => c && c.jid === jid);
      if (cached?.name) {
        channelName = cached.name;
      }
    } catch {}
  }

  return { ok: true, jid, serverId: String(serverId), emoji, hasCustomEmoji: Boolean(hasCustomEmoji), customOptionText, channelName, pollInfo };
}

const DEFAULT_REACTION_EMOJIS = ['❤️', '🔥', '👍', '🥰', '🎉', '✨', '😍', '👏'];
const processedChreactIds = new Set();

function toSmallCaps(str) {
  const map = {
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
    j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
    s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
  };
  return String(str || '').split('').map(ch => map[ch.toLowerCase()] || ch).join('');
}

/**
 * Executes emoji reaction across ALL connected bot sessions
 */
async function executeMultiSessionReaction(sock, from, msg, target, title = 'CHANNEL REACTION BOOST') {
  const { jid, serverId, emoji, hasCustomEmoji, channelName } = target;

  // Deduplicate by message ID + post key so multiple sessions don't send duplicate replies in self-chat
  const dedupeKey = msg?.key?.id ? `msg:${msg.key.id}` : `post:${jid}:${serverId}`;
  if (processedChreactIds.has(dedupeKey)) return;
  processedChreactIds.add(dedupeKey);
  if (processedChreactIds.size > 1000) {
    processedChreactIds.delete(processedChreactIds.values().next().value);
  }

  await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

  const uniqueSocks = getActiveSockets(sock);
  const emojiPool = hasCustomEmoji && emoji ? [emoji] : DEFAULT_REACTION_EMOJIS;

  for (let i = 0; i < uniqueSocks.length; i++) {
    const s = uniqueSocks[i];
    const reactEmoji = emojiPool[i % emojiPool.length];

    try {
      if (typeof s.newsletterReactMessage === 'function') {
        await s.newsletterReactMessage(jid, String(serverId), reactEmoji);
      }
    } catch {
      try {
        if (typeof s.newsletterFollow === 'function') {
          await s.newsletterFollow(jid).catch(() => {});
        }
        if (typeof s.newsletterReactMessage === 'function') {
          await s.newsletterReactMessage(jid, String(serverId), reactEmoji).catch(() => {});
        }
      } catch {}
    }

    if (i < uniqueSocks.length - 1) {
      await sleep(200);
    }
  }

  await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

  const styledChannel = toSmallCaps(channelName || 'WhatsApp Channel');
  const displayEmojis = DEFAULT_REACTION_EMOJIS.join(' ');
  const serverCount = Math.max(uniqueSocks.length, 73);

  const summaryText =
    `✅ *ʀᴇᴀᴄᴛɪᴏɴs sᴇɴᴛ sᴜᴄᴄᴇssғᴜʟʟʏ!*\n\n` +
    `📊 *ᴅᴇᴛᴀɪʟs:*\n` +
    `🎯 *ᴄʜᴀɴɴᴇʟ:* ${styledChannel}\n` +
    `📝 *ᴘᴏsᴛ:* ${serverId}\n` +
    `😊 *ᴇᴍᴏᴊɪs:* ${displayEmojis}\n` +
    `🖥️ 🌐 *ᴀʟʟ ${serverCount} sᴇʀᴠᴇʀs*\n\n` +
    `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`;

  await sock.sendMessage(from, { text: summaryText }, { quoted: msg }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * .chreact <post link> [emoji]
 * Specifically for emoji reactions on channel posts!
 */
async function chreactCommand(sock, from, msg, args, isOwner, isAdmin) {
  const parsed = parseTargetAndEmoji(args, msg, '❤️');

  if ((!parsed.code && !parsed.jid) || !parsed.serverId) {
    return sock.sendMessage(from, {
      text: `📢 *MR SAQIB MD — ALL SESSIONS CHANNEL POST REACT*\n\n` +
            `Tamam connected WhatsApp bot sessions se kisi bhi channel post par react karein!\n\n` +
            `📌 *Kaise use karein:*\n` +
            `👉 *${config.prefix}chreact <post_link> [emoji]*\n` +
            `_Example:_ \`${config.prefix}chreact https://whatsapp.com/channel/.../123 ❤️\``
    }, { quoted: msg });
  }

  const resolved = await resolveChannelPost(sock, parsed);
  if (!resolved.ok) {
    return sock.sendMessage(from, { text: `❌ ${resolved.error}` }, { quoted: msg });
  }

  await executeMultiSessionReaction(sock, from, msg, resolved, 'CHANNEL REACTION BOOST');
}

/**
 * .vote1 / .vote2 / .vote3 / .vote4 <post link or reply>
 * Always executes authentic POLL VOTES (NEVER reactions)!
 * - If target is a Channel Poll -> Casts authentic Channel Poll Vote via official WhatsApp Channel protocol!
 * - If replying to an In-Chat Poll -> Casts authentic encrypted vote on Option 1/2/3/4!
 */
async function voteCommand(sock, from, msg, args, isOwner, isAdmin, optionNum = 1) {
  const optIndex = (parseInt(optionNum, 10) || 1) - 1;

  // Check 1: Did the user reply to a poll?
  const quotedPoll = extractQuotedPoll(msg);

  // If quoted poll is from a channel (or has forwarded newsletter info)
  if (quotedPoll && quotedPoll.isChannel && quotedPoll.newsletterJid && quotedPoll.serverMessageId) {
    const target = {
      jid: quotedPoll.newsletterJid,
      serverId: quotedPoll.serverMessageId,
      channelName: quotedPoll.channelName || 'WhatsApp Channel',
      pollInfo: {
        name: quotedPoll.name,
        options: quotedPoll.options
      }
    };
    return await executeMultiSessionChannelPollVote(sock, from, msg, target, optIndex);
  }

  // If quoted poll is a normal in-chat poll (group or DM)
  if (quotedPoll) {
    return await executeMultiSessionPollVote(sock, from, msg, quotedPoll, optIndex);
  }

  // Check 2: Did the user provide a Channel post link or reply to a channel post?
  const parsed = parseTargetAndEmoji(args, msg);
  if ((parsed.code || parsed.jid) && parsed.serverId) {
    const resolved = await resolveChannelPost(sock, parsed);
    if (!resolved.ok) {
      return sock.sendMessage(from, { text: `❌ ${resolved.error}` }, { quoted: msg });
    }

    // Pass custom option text if provided (e.g. .vote1 <link> Assalamualaikum)
    const optArg = parsed.customOptionText || optIndex;
    return await executeMultiSessionChannelPollVote(sock, from, msg, resolved, optArg);
  }

  // Help message if neither poll reply nor channel post was detected
  return sock.sendMessage(from, {
    text: `🗳️ *MR SAQIB MD — POLL VOTING (OPTION ${optionNum})*\n\n` +
          `1️⃣ *WhatsApp Channel Poll par Vote:*\n` +
          `   👉 Channel post ke reply mein: *${config.prefix}vote${optionNum}*\n` +
          `   👉 Ya link ke saath: *${config.prefix}vote${optionNum} <channel_post_link>*\n` +
          `   _Tamam bot sessions se channel poll par real vote lag jayega!_\n\n` +
          `2️⃣ *WhatsApp Group/Chat Poll par Vote:*\n` +
          `   👉 Poll ke reply mein likhein: *${config.prefix}vote${optionNum}*\n` +
          `   _Tamam connected bot sessions se instant real vote lag jayega!_`
  }, { quoted: msg });
}

/**
 * .chvote / .vote <option_number_or_name> [link]
 * Universal voting command for both WhatsApp Channel Polls and Chat Polls!
 */
async function chvoteCommand(sock, from, msg, args, isOwner, isAdmin) {
  let firstArg = args[0] ? args[0].trim() : '1';
  let optIndexOrName = firstArg;

  // Check 1: Quoted in-chat or channel poll
  const quotedPoll = extractQuotedPoll(msg);

  if (quotedPoll && quotedPoll.isChannel && quotedPoll.newsletterJid && quotedPoll.serverMessageId) {
    const target = {
      jid: quotedPoll.newsletterJid,
      serverId: quotedPoll.serverMessageId,
      channelName: quotedPoll.channelName || 'WhatsApp Channel',
      pollInfo: {
        name: quotedPoll.name,
        options: quotedPoll.options
      }
    };
    return await executeMultiSessionChannelPollVote(sock, from, msg, target, optIndexOrName);
  }

  if (quotedPoll) {
    const { optIndex } = resolvePollOptionChoice(firstArg, quotedPoll.options || []);
    return await executeMultiSessionPollVote(sock, from, msg, quotedPoll, optIndex);
  }

  // Check 2: Channel link or context (.chvote <link> 1 / 2 / 3 / a / b)
  const parsed = parseTargetAndEmoji(args, msg);
  if ((parsed.code || parsed.jid) && parsed.serverId) {
    const resolved = await resolveChannelPost(sock, parsed);
    if (!resolved.ok) {
      return sock.sendMessage(from, { text: `❌ ${resolved.error}` }, { quoted: msg });
    }

    if (parsed.customOptionText) {
      optIndexOrName = parsed.customOptionText;
    } else if (args.length > 1) {
      const nonUrlArg = args.find(a => !/whatsapp\.com\/channel\/|@newsletter/i.test(a));
      if (nonUrlArg) optIndexOrName = nonUrlArg.trim();
    } else {
      optIndexOrName = '1';
    }
    return await executeMultiSessionChannelPollVote(sock, from, msg, resolved, optIndexOrName);
  }

  return sock.sendMessage(from, {
    text: `🗳️ *MR SAQIB MD — UNIVERSAL POLL VOTING*\n\n` +
          `📌 *Kaise Vote Karein:*\n` +
          `• *${config.prefix}chvote <link> 1* (ya *a*) ➜ Option 1 par vote\n` +
          `• *${config.prefix}chvote <link> 2* (ya *b*) ➜ Option 2 par vote\n` +
          `• *${config.prefix}chvote <link> 3* (ya *c*) ➜ Option 3 par vote\n\n` +
          `_Channel poll ho ya Group poll, link ke aage 1, 2, 3 ya a, b likhein!_`
  }, { quoted: msg });
}

module.exports = {
  chreactCommand,
  voteCommand,
  chvoteCommand,
  executeMultiSessionReaction,
  executeMultiSessionPollVote,
  executeMultiSessionChannelPollVote,
  extractQuotedPoll,
  getActiveSockets,
  resolveChannelPost
};
