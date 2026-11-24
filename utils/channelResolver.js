'use strict';

/**
 * MR SAQIB MD :: ADVANCED CHANNEL RESOLVER ENGINE (.channelid & .chfollow unified)
 * ============================================================================
 * Features:
 * 1. Persistent Multi-Tier Cache (RAM + Disk JSON + MongoSync)
 * 2. Instant Zero-API Forwarded Message JID Extraction (100% immune to rate-limit)
 * 3. Multi-Session Local Socket Rotation (auto-rotates if any number is throttled)
 * 4. 11-Node Mega Cluster Fallback (queries Railway + Heroku nodes in parallel)
 * 5. Public WhatsApp Web Scraper (extracts title, followers, image if Meta blocks GraphQL)
 * ============================================================================
 */

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'channel_cache.json');

// In-memory persistent cache: inviteCode -> { jid, name, followers, image, updatedAt }
const resolvedCache = new Map();

// Load persistent disk cache on startup
try {
  if (fs.existsSync(CACHE_FILE)) {
    const diskData = fs.readJsonSync(CACHE_FILE);
    if (diskData && typeof diskData === 'object') {
      for (const [code, item] of Object.entries(diskData)) {
        if (item && item.jid) {
          resolvedCache.set(code.trim(), item);
          resolvedCache.set(code.trim().toLowerCase(), item);
        }
      }
    }
  }

  // Pre-seed from database/my_admin_channels.json
  const adminFile = path.join(__dirname, '..', 'database', 'my_admin_channels.json');
  if (fs.existsSync(adminFile)) {
    try {
      const adminData = fs.readJsonSync(adminFile);
      if (adminData && adminData.accounts) {
        for (const acct of Object.values(adminData.accounts)) {
          for (const ch of (acct.channels || [])) {
            if (ch?.jid && ch?.link) {
              const code = String(ch.link).replace(/https?:\/\/(?:www\.)?whatsapp\.com\/channel\//i, '').split('/')[0].split('?')[0].trim();
              if (code) {
                const item = { jid: ch.jid.toLowerCase(), name: ch.name || 'WhatsApp Channel', followers: ch.followers || null, source: 'admin_db' };
                resolvedCache.set(code, item);
                resolvedCache.set(code.toLowerCase(), item);
              }
            }
          }
        }
      }
    } catch (_) {}
  }

  // Pre-seed from database/channels_v1.json
  const v1File = path.join(__dirname, '..', 'database', 'channels_v1.json');
  if (fs.existsSync(v1File)) {
    try {
      const v1Data = fs.readJsonSync(v1File);
      if (v1Data && v1Data.channels) {
        for (const [jid, ch] of Object.entries(v1Data.channels)) {
          if (ch?.invite) {
            const code = ch.invite.trim();
            const item = { jid: jid.toLowerCase(), name: ch.name || 'WhatsApp Channel', followers: ch.subscribers || null, source: 'channels_v1' };
            resolvedCache.set(code, item);
            resolvedCache.set(code.toLowerCase(), item);
          }
        }
      }
    } catch (_) {}
  }

  // Pre-seed from data/auto_follow.json
  const afFile = path.join(__dirname, '..', 'data', 'auto_follow.json');
  if (fs.existsSync(afFile)) {
    try {
      const afData = fs.readJsonSync(afFile);
      if (afData && afData.channels) {
        for (const [code, item] of Object.entries(afData.channels)) {
          if (item && item.jid) {
            const entry = { jid: item.jid.toLowerCase(), name: item.name || 'WhatsApp Channel', followers: item.followers || null, source: 'auto_follow' };
            resolvedCache.set(code.trim(), entry);
            resolvedCache.set(code.trim().toLowerCase(), entry);
          }
        }
      }
    } catch (_) {}
  }
} catch (e) {
  console.warn('[channelResolver] Could not load disk cache:', e.message);
}

/**
 * Saves a resolved channel entry to RAM and disk cache
 */
function saveToCache(inviteCode, jid, name, followers = null, image = null) {
  if (!inviteCode || !jid) return;
  const cleanCode = String(inviteCode).trim();
  const cleanJid = String(jid).trim().toLowerCase();
  const entry = {
    jid: cleanJid,
    name: name || 'WhatsApp Channel',
    followers: followers || null,
    image: image || null,
    updatedAt: Date.now()
  };
  resolvedCache.set(cleanCode, entry);
  resolvedCache.set(cleanCode.toLowerCase(), entry);

  // Async disk write
  try {
    fs.ensureDirSync(DATA_DIR);
    let diskData = {};
    if (fs.existsSync(CACHE_FILE)) {
      try { diskData = fs.readJsonSync(CACHE_FILE) || {}; } catch (_) {}
    }
    diskData[cleanCode] = entry;
    fs.writeJson(CACHE_FILE, diskData, { spaces: 2 }).catch(() => {});
  } catch (_) {}

  // Async MongoDB Atlas cluster-wide push
  try {
    const mongoSync = require('./mongoSync');
    mongoSync.pushToMongo('channel_cache', { [cleanCode]: entry });
  } catch (_) {}
}

/**
 * Cleanly extracts invite code from WhatsApp channel link or raw string
 */
function extractInviteCode(input) {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim()
    .replace(/https?:\/\/(?:www\.)?whatsapp\.com\/channel\//i, '')
    .split('/')[0]
    .split('?')[0]
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .trim();
  return clean || null;
}

/**
 * Extracts channel JID and name directly from forwarded newsletter context in a message
 * (Zero API calls, 100% immune to rate-limit!)
 */
function extractFromMessageContext(msg) {
  if (!msg) return null;
  
  // Direct contextInfo on top-level message
  const m = msg.message || msg;
  const candidates = [
    m?.extendedTextMessage?.contextInfo,
    m?.imageMessage?.contextInfo,
    m?.videoMessage?.contextInfo,
    m?.audioMessage?.contextInfo,
    m?.documentMessage?.contextInfo,
    m?.stickerMessage?.contextInfo,
    m?.contextInfo
  ];

  // Quoted message contextInfo
  const quoted = m?.extendedTextMessage?.contextInfo?.quotedMessage ||
                 m?.contextInfo?.quotedMessage;
  if (quoted && typeof quoted === 'object') {
    for (const k of Object.keys(quoted)) {
      if (quoted[k]?.contextInfo) {
        candidates.push(quoted[k].contextInfo);
      }
    }
  }

  for (const ctx of candidates) {
    if (ctx?.forwardedNewsletterMessageInfo?.newsletterJid) {
      const fwd = ctx.forwardedNewsletterMessageInfo;
      return {
        jid: fwd.newsletterJid.toLowerCase(),
        name: fwd.newsletterName || 'WhatsApp Channel',
        serverMessageId: fwd.serverMessageId || null,
        fromPost: true
      };
    }
  }

  return null;
}

/**
 * Public Web Scraper fallback to extract title, followers, and picture from WhatsApp web
 */
async function scrapePublicChannelInfo(inviteCode) {
  if (!inviteCode) return null;
  try {
    const res = await axios.get(`https://www.whatsapp.com/channel/${inviteCode}`, {
      timeout: 6000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    const html = res.data || '';
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                       html.match(/<title[^>]*>([^<]+)-\s*WhatsApp\s*channel<\/title>/i);
    const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
    const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);

    let name = titleMatch ? titleMatch[1].trim() : null;
    let followers = null;
    let description = null;
    let image = imgMatch ? imgMatch[1].replace(/&amp;/g, '&') : null;

    if (descMatch) {
      const rawDesc = descMatch[1];
      const folMatch = rawDesc.match(/(\d[\d,.]*)\s+followers/i);
      if (folMatch) followers = folMatch[1];
      description = rawDesc.replace(/^Channel\s*•\s*\d[\d,.]*\s*followers\s*•\s*/i, '').trim();
    }

    return { name, followers, description, image };
  } catch (err) {
    return null;
  }
}

/**
 * Master channel resolution function
 * Checks RAM cache -> Disk cache -> Forwarded msg -> Primary socket -> Multi-session rotation -> Mega Cluster
 */
async function resolveChannel(sock, input, msg = null) {
  // 1. Check if user quoted or forwarded a channel message
  if (msg) {
    const postInfo = extractFromMessageContext(msg);
    if (postInfo?.jid) {
      if (input) {
        const code = extractInviteCode(input);
        if (code) saveToCache(code, postInfo.jid, postInfo.name);
      }
      return {
        ok: true,
        jid: postInfo.jid,
        name: postInfo.name,
        initialFollowers: null,
        source: 'forwarded_post',
        serverMessageId: postInfo.serverMessageId
      };
    }
  }

  if (!input || typeof input !== 'string') {
    return { ok: false, error: 'Channel link ya JID provide karein.' };
  }

  const raw = input.trim();

  // 2. Direct JID check
  if (/@newsletter$/i.test(raw)) {
    return { ok: true, jid: raw.toLowerCase(), name: 'WhatsApp Channel', initialFollowers: null, source: 'direct_jid' };
  }
  if (/^\d{8,25}$/.test(raw)) {
    return { ok: true, jid: `${raw}@newsletter`, name: 'WhatsApp Channel', initialFollowers: null, source: 'direct_jid' };
  }

  const inviteCode = extractInviteCode(raw);
  if (!inviteCode) {
    return { ok: false, error: 'Valid channel link ya JID bhejein (e.g. https://whatsapp.com/channel/...)' };
  }

  // 3. Fast RAM & Disk Cache Check
  if (resolvedCache.has(inviteCode)) {
    const cached = resolvedCache.get(inviteCode);
    return {
      ok: true,
      jid: cached.jid,
      name: cached.name,
      initialFollowers: cached.followers,
      image: cached.image,
      source: 'cache'
    };
  }

  // Check auto_follow.json & channel_arc.json
  try {
    const afFile = path.join(DATA_DIR, 'auto_follow.json');
    if (fs.existsSync(afFile)) {
      const af = fs.readJsonSync(afFile);
      for (const ch of Object.values(af.channels || {})) {
        if (ch && (ch.inviteCode === inviteCode || (ch.link && ch.link.includes(inviteCode)))) {
          saveToCache(inviteCode, ch.jid, ch.name);
          return { ok: true, jid: ch.jid, name: ch.name || 'WhatsApp Channel', initialFollowers: null, source: 'auto_follow_db' };
        }
      }
    }
  } catch (_) {}

  // 4. Try Primary Socket newsletterMetadata('invite', inviteCode)
  let lastErrorMsg = '';
  if (sock && typeof sock.newsletterMetadata === 'function') {
    try {
      const metadata = await sock.newsletterMetadata('invite', inviteCode);
      if (metadata && (metadata.id || metadata.jid)) {
        const jid = metadata.id || metadata.jid;
        const tm = metadata.thread_metadata || {};
        const name = tm.name?.text || metadata.name || 'WhatsApp Channel';
        const followers = tm.subscribers_count ?? metadata.subscribers ?? null;
        const image = tm.picture?.direct_path || null;

        saveToCache(inviteCode, jid, name, followers, image);
        return { ok: true, jid, name, initialFollowers: followers, image, source: 'primary_socket' };
      }
    } catch (sockErr) {
      lastErrorMsg = sockErr?.message || String(sockErr);
      // console.warn(`[channelResolver] Primary socket failed: ${lastErrorMsg}`);
    }
  }

  // 5. Multi-Socket Rotation on THIS node (try every other connected WhatsApp session)
  let activeSocks = [];
  try {
    activeSocks = global.ProBoySessionManager?.getActiveSocks?.() || [];
  } catch (_) {}

  for (const altSock of activeSocks) {
    if (altSock === sock) continue;
    try {
      if (typeof altSock.newsletterMetadata === 'function') {
        const metadata = await altSock.newsletterMetadata('invite', inviteCode);
        if (metadata && (metadata.id || metadata.jid)) {
          const jid = metadata.id || metadata.jid;
          const tm = metadata.thread_metadata || {};
          const name = tm.name?.text || metadata.name || 'WhatsApp Channel';
          const followers = tm.subscribers_count ?? metadata.subscribers ?? null;
          const image = tm.picture?.direct_path || null;

          saveToCache(inviteCode, jid, name, followers, image);
          return { ok: true, jid, name, initialFollowers: followers, image, source: 'multi_socket_rotation' };
        }
      }
    } catch (altErr) {
      lastErrorMsg = altErr?.message || String(altErr);
    }
  }

  // 6. 28-Node Mega Cluster Fallback (ask all Heroku s1-s28 nodes + Railway)
  try {
    const clusterSync = require('./clusterSync');
    const clusterResults = await clusterSync.broadcastToCluster('resolve_channel', { code: inviteCode });
    for (const r of clusterResults) {
      const data = r?.data?.jid ? r.data : (r?.data?.data?.jid ? r.data.data : null);
      if (r?.ok && data?.jid) {
        const jid = data.jid;
        const name = data.name || 'WhatsApp Channel';
        const followers = data.subscribers ?? null;
        saveToCache(inviteCode, jid, name, followers);
        return { ok: true, jid, name, initialFollowers: followers, source: `cluster_${r.nodeId}` };
      }
    }
  } catch (_) {}

  // 6.5. Cloud Cache Fallback (check MongoDB Atlas cluster-wide storage)
  try {
    const mongoSync = require('./mongoSync');
    const cloudCache = await mongoSync.pullFromMongo('channel_cache');
    if (cloudCache && (cloudCache[inviteCode]?.jid || cloudCache[inviteCode.toLowerCase()]?.jid)) {
      const entry = cloudCache[inviteCode] || cloudCache[inviteCode.toLowerCase()];
      saveToCache(inviteCode, entry.jid, entry.name, entry.followers);
      return { ok: true, jid: entry.jid, name: entry.name || 'WhatsApp Channel', initialFollowers: entry.followers, source: 'mongo_cloud_cache' };
    }
  } catch (_) {}

  // 7. Scrape public web details if Meta's GraphQL is in hard rate-limit
  const webInfo = await scrapePublicChannelInfo(inviteCode);
  const detectedName = webInfo?.name ? `\n📢 *Channel Name:* ${webInfo.name}` : '';
  const detectedFollowers = webInfo?.followers ? `\n👥 *Followers:* ${webInfo.followers}` : '';
  const detectedDesc = webInfo?.description ? `\n📝 *Description:* ${webInfo.description}` : '';

  return {
    ok: false,
    error: `WhatsApp server par is link ka temporary query cooldown (*rate-overlimit*) chal raha hai.${detectedName}${detectedFollowers}${detectedDesc}\n\n` +
           `⚡ *Instant 1-Second Solution:*\n` +
           `Is channel ka koi bhi message / post bot ko *Forward* karein aur us message par reply karein:\n` +
           `👉 *.channelid*\n\n` +
           `*(Bot foran bina kisi rate-limit ke exact Newsletter JID nikaal lega!)*`,
    webInfo,
    rateLimited: true
  };
}

module.exports = {
  extractInviteCode,
  extractFromMessageContext,
  resolveChannel,
  saveToCache,
  resolvedCache,
  scrapePublicChannelInfo
};
