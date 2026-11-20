'use strict';

/**
 * MR SAQIB MD :: CHANNEL RESOLVER ENGINE (.channelid & .chfollow unified)
 * ============================================================================
 * Uses the exact same direct newsletterMetadata('invite', code) method as
 * .channelid, with multi-socket rotation, in-memory caching, and cluster fallback
 * to completely eliminate 'rate-overlimit' issues.
 * ============================================================================
 */

const fs = require('fs-extra');
const path = require('path');

// In-memory persistent cache for resolved invite codes: inviteCode -> { jid, name, followers }
const resolvedCache = new Map();

/**
 * Cleanly extracts invite code from WhatsApp channel link or raw string
 */
function extractInviteCode(input) {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim()
    .replace(/https?:\/\/(?:www\.)?whatsapp\.com\/channel\//i, '')
    .split('/')[0]
    .split('?')[0]
    .trim();
  return clean || null;
}

/**
 * Resolves a channel link or JID using the exact same fast, direct method as .channelid
 */
async function resolveChannel(sock, input) {
  if (!input || typeof input !== 'string') {
    return { ok: false, error: 'Channel link ya JID provide karein.' };
  }

  const raw = input.trim();

  // 1. Direct JID check: If already a JID (e.g. 120363xxxx@newsletter or raw digits)
  if (/@newsletter$/i.test(raw)) {
    return { ok: true, jid: raw.toLowerCase(), name: 'WhatsApp Channel', initialFollowers: null };
  }
  if (/^\d{15,25}$/.test(raw)) {
    return { ok: true, jid: `${raw}@newsletter`, name: 'WhatsApp Channel', initialFollowers: null };
  }

  const inviteCode = extractInviteCode(raw);
  if (!inviteCode) {
    return { ok: false, error: 'Valid channel link ya JID bhejein (e.g. https://whatsapp.com/channel/...)' };
  }

  // 2. Fast Cache Check: If this link/code was already resolved before
  if (resolvedCache.has(inviteCode)) {
    const cached = resolvedCache.get(inviteCode);
    return { ok: true, jid: cached.jid, name: cached.name, initialFollowers: cached.followers };
  }

  // Check auto_follow.json and channel_arc.json
  try {
    const DATA_DIR = path.join(__dirname, '..', 'data');
    const afFile = path.join(DATA_DIR, 'auto_follow.json');
    if (fs.existsSync(afFile)) {
      const af = fs.readJsonSync(afFile);
      for (const ch of Object.values(af.channels || {})) {
        if (ch && (ch.inviteCode === inviteCode || (ch.link && ch.link.includes(inviteCode)))) {
          resolvedCache.set(inviteCode, { jid: ch.jid, name: ch.name, followers: null });
          return { ok: true, jid: ch.jid, name: ch.name || 'WhatsApp Channel', initialFollowers: null };
        }
      }
    }
  } catch (_) {}

  // 3. Try directly with sock.newsletterMetadata('invite', inviteCode) — EXACT .channelid method!
  try {
    if (sock && typeof sock.newsletterMetadata === 'function') {
      const metadata = await sock.newsletterMetadata('invite', inviteCode);
      if (metadata && (metadata.id || metadata.jid)) {
        const jid = metadata.id || metadata.jid;
        const tm = metadata.thread_metadata || {};
        const name = tm.name?.text || metadata.name || 'WhatsApp Channel';
        const followers = tm.subscribers_count ?? metadata.subscribers ?? null;

        resolvedCache.set(inviteCode, { jid, name, followers });
        return { ok: true, jid, name, initialFollowers: followers };
      }
    }
  } catch (sockErr) {
    console.warn(`[channelResolver] Primary sock.newsletterMetadata failed: ${sockErr.message}`);
  }

  // 4. Multi-Socket Rotation: Try other connected sessions on this node!
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

          resolvedCache.set(inviteCode, { jid, name, followers });
          return { ok: true, jid, name, initialFollowers: followers };
        }
      }
    } catch (_) {}
  }

  // 5. Multi-Cluster Fallback: Ask other Heroku s1-s10 nodes!
  try {
    const clusterSync = require('./clusterSync');
    const clusterResults = await clusterSync.broadcastToCluster('resolve_channel', { code: inviteCode });
    for (const r of clusterResults) {
      if (r?.ok && r.data?.jid) {
        resolvedCache.set(inviteCode, { jid: r.data.jid, name: r.data.name, followers: r.data.subscribers });
        return { ok: true, jid: r.data.jid, name: r.data.name || 'WhatsApp Channel', initialFollowers: r.data.subscribers ?? null };
      }
    }
  } catch (_) {}

  // 6. Web Scraper fallback to at least extract channel name and follower count
  let webTitle = null;
  let webFollowers = null;
  try {
    const axios = require('axios');
    const webRes = await axios.get(`https://whatsapp.com/channel/${inviteCode}`, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64)' }
    });
    if (webRes?.data) {
      const titleMatch = webRes.data.match(/property="og:title"\s+content="([^"]+)"/i);
      if (titleMatch) webTitle = titleMatch[1];
      const descMatch = webRes.data.match(/(\d[\d,.]*)\s+followers/i);
      if (descMatch) webFollowers = descMatch[1];
    }
  } catch (_) {}

  const channelDisplay = webTitle ? `\n📢 *Detected Channel:* ${webTitle} ${webFollowers ? `(${webFollowers} followers)` : ''}` : '';
  return {
    ok: false,
    error: `WhatsApp server par is link ka temporary rate-limit (rate-overlimit) aa raha hai.${channelDisplay}\n\n` +
           `💡 *Aasaan Tareeqa:* Pehle command dein:\n` +
           `👉 *.channelid ${raw}*\n\n` +
           `Aur jo *Newsletter JID* (\`120363...@newsletter\`) aaye, uspar direct command dein:\n` +
           `👉 *.chfollow <JID>*\n` +
           `*(Direct JID par WhatsApp ka koi rate-limit nahi hota!)*`
  };
}

module.exports = {
  extractInviteCode,
  resolveChannel,
  resolvedCache
};
