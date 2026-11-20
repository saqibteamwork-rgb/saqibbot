'use strict';

/**
 * .cforward - post one message to ALL channels this account owns/administers,
 * OR directly to specific channel(s) provided via Channel Link, Invite Code, or JID.
 *
 *   Mode 1 (Paired Account Channels): reply to a post with  .cforward
 *   Mode 2 (Direct Channel Link / ID): reply to a post with .cforward https://whatsapp.com/channel/CODE  or  .cforward 1203...@newsletter
 *   Mode 3 (Direct Text to Channel):  .cforward https://whatsapp.com/channel/CODE Your announcement text
 *   Mode 4 (Post Link):               .cforward https://whatsapp.com/channel/CODE/POST_ID
 *   Mode 5 (All Sessions):            .cforward -a -s (reply to a post, or with post link)
 *
 * Flags: --force  resend even if the same content already went to a channel
 *        --sync   ignore the saved channel list and ask WhatsApp again
 *        --plain  post as a normal message (no "Forwarded" label)
 *        --fwd    add the "Forwarded" label even if the source is not a channel post
 *
 * Job Controls:
 *        .cforward status  (check progress of all-sessions job)
 *        .cforward stop    (stop current all-sessions job)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');
const hub = require('../utils/channelHub');

const MAX_SHOWN = 15;
const name = (rec) => rec.name || rec.jid;

let job = null; // the running all-sessions forward (only one at a time)
const fmtMin = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? '<1 min' : `~${m} min`; };

module.exports = {
  name: 'cforward',
  aliases: ['chforward', 'cforwared', 'chforwared', 'cforwrd', 'chfwd', 'cfall', 'cforwardall'],
  category: 'dev',
  description: 'Forward a replied post (or direct text / channel link) to channels this session owns/admins or specific target channels',
  usage: `${config.prefix}cforward [<channel link | JID>] [-a -s] [--force] [--sync] [--plain] [--fwd]   (reply to a post or provide text)`,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    const { reply, react } = extra;
    let isMaster = false;
    try {
      const ownerManager = require('../utils/ownerManager');
      isMaster = ownerManager.checkIsMasterOwner({ sock, msg, from: extra.from }) || ownerManager.isOwnerNumber(extra.sender);
    } catch {}

    if (isMaster) {
      extra.isOwner = true;
      extra.isSudo = true;
    }

    if (!extra.isOwner && !extra.isSudo && !extra.isSessionOwner && !msg?.key?.fromMe) return reply('🔒 Owner / Session User only.');
    let tmpFile = null, deferCleanup = false;

    try {
      hub.registerSock(sock);
      const has = (f) => args.some((a) => a.toLowerCase() === f);
      const force = has('--force'), forceSync = has('--sync'), plain = has('--plain'), forceFwd = has('--fwd');
      const low = args.map((a) => a.toLowerCase());

      const rawArgString = args.join(' ').toLowerCase();
      const allSessions =
        low.some(a => ['-a-s', '-s-a', '-as', '-sa', '--all-sessions', '--allsessions', '-all', '--all', 'all'].includes(a)) ||
        (low.includes('-a') && low.includes('-s')) ||
        /(\s|^)(-(a-s|s-a|as|sa|all)|--all(-?sessions)?|all)(\s|$)/i.test(rawArgString);

      const flagsToStrip = new Set(['-a-s', '-s-a', '-as', '-sa', '--all-sessions', '--allsessions', '-all', '--all', 'all', '-a', '-s', '--force', '--sync', '--plain', '--fwd']);
      const rest = args.filter((a) => !flagsToStrip.has(a.toLowerCase()) && !a.startsWith('--'));

      // ---- job control ----
      if (low[0] === 'stop' || low[0] === 'status') {
        if (low[0] === 'stop') {
          if (!job) return reply('ℹ️ No all-sessions forward is running.');
          job.stop = true;
          return reply('🛑 Stopping after the post that is being sent right now...');
        }
        if (!job) return reply('ℹ️ No all-sessions forward is running.');
        const left = Math.max(0, job.total - job.done);
        return reply(`📊 *All-sessions forward*\nProgress: ${job.done}/${job.total}  (✅ ${job.sent} • ❌ ${job.failed} • ⏭️ ${job.skipped})\nRunning for ${fmtMin(Date.now() - job.startedAt)} • about ${fmtMin(left * 6500)} left\nStop with ${config.prefix}cforward stop`);
      }

      // ---- all-sessions mode: restricted to the main owner number ----
      if (allSessions) {
        if (!extra.isOwner && !isMaster && !hub.isAllSessionsUser(extra)) {
          return reply('⛔ *Restricted*\nThe all-sessions mode (-a -s) can only be used by the main owner number.\nNormal .cforward (this session\'s own channels) still works for you.');
        }
        if (job) return reply(`⏳ An all-sessions forward is already running (${job.done}/${job.total}). Wait for it, or send ${config.prefix}cforward stop`);
      }

      // ---- Extract Quoted Message / Direct Media Context ----
      let ctx = null;
      let quoted = null;

      const content = extra.utils?.getMessageContent ? extra.utils.getMessageContent(msg) : msg.message;
      const unwrapped = hub.unwrap(content) || content;

      const candidateContainers = [
        content?.extendedTextMessage,
        content?.imageMessage,
        content?.videoMessage,
        content?.documentMessage,
        content?.audioMessage,
        content?.stickerMessage,
        content?.conversation,
        unwrapped?.extendedTextMessage,
        unwrapped?.imageMessage,
        unwrapped?.videoMessage,
        unwrapped?.documentMessage,
        unwrapped?.audioMessage,
        unwrapped?.stickerMessage,
        msg?.message?.extendedTextMessage,
        msg?.message?.imageMessage,
        msg?.message?.videoMessage,
        msg?.message?.documentMessage,
        msg?.message?.ephemeralMessage?.message?.extendedTextMessage,
        msg?.message?.ephemeralMessage?.message?.imageMessage,
        msg?.message?.ephemeralMessage?.message?.videoMessage,
        msg?.message?.viewOnceMessage?.message?.imageMessage,
        msg?.message?.viewOnceMessageV2?.message?.imageMessage,
        msg?.message?.viewOnceMessage?.message?.videoMessage,
        msg?.message?.viewOnceMessageV2?.message?.videoMessage,
        msg?.message?.documentWithCaptionMessage?.message?.documentMessage
      ].filter(Boolean);

      for (const c of candidateContainers) {
        if (c?.contextInfo?.quotedMessage) {
          ctx = c.contextInfo;
          quoted = c.contextInfo.quotedMessage;
          break;
        }
      }

      // Direct media fallback if user attached media with command
      if (!quoted) {
        const directType = Object.keys(unwrapped || {}).find(k => ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(k));
        if (directType) {
          quoted = unwrapped;
          ctx = { stanzaId: msg?.key?.id, participant: msg?.key?.participant || extra?.sender };
        }
      }

      // ---- Parse Destination Tokens & Text Arguments ----
      const targetTokens = [];
      const textTokens = [];

      for (const token of rest) {
        const t = token.trim();
        if (!t) continue;
        if (/whatsapp\.com\/channel\//i.test(t)) {
          targetTokens.push(t);
        } else if (/@newsletter$/i.test(t)) {
          targetTokens.push(t.toLowerCase());
        } else if (/^\d{8,}$/.test(t)) {
          targetTokens.push(`${t}@newsletter`);
        } else if (/^0029[a-zA-Z0-9_-]{10,}$/i.test(t)) {
          targetTokens.push(t);
        } else {
          textTokens.push(t);
        }
      }

      // Check if user provided a single post link without quoting: whatsapp.com/channel/CODE/POST_ID
      const sourcePostLink = !quoted ? targetTokens.find(a => /whatsapp\.com\/channel\/[^\/]+\/\d+/i.test(a)) : null;

      let post = null, sourceJid = null, sourceLabel = '', fwdInfo = null;

      // -------- Mode B: Source Post Link (only if !quoted and link has numeric post ID) --------
      if (sourcePostLink) {
        // Remove source link from targetTokens so it doesn't get treated as destination
        const idx = targetTokens.indexOf(sourcePostLink);
        if (idx !== -1) targetTokens.splice(idx, 1);

        const parsed = hub.parseChannelLink(sourcePostLink);
        if (!parsed) return reply('❌ That is not a valid channel post link.');
        if (!parsed.postId || !/^\d+$/.test(parsed.postId)) {
          return reply('❌ The link has no numeric post id. Use: https://whatsapp.com/channel/CODE/POST_ID');
        }

        await react('⏳');
        let src = null;
        try {
          src = await hub.resolveInvite(sock, parsed.code);
        } catch (e) {
          // Fallback to channelResolver
          try {
            const { resolveChannel } = require('../utils/channelResolver');
            const res = await resolveChannel(sock, sourcePostLink);
            if (res && res.ok && res.jid) {
              src = { rec: hub.ensureChannel(res.jid, 'discovered'), meta: { jid: res.jid, name: res.name } };
              src.rec.name = res.name || src.rec.name;
            }
          } catch (_) {}
        }

        if (!src || !src.rec?.jid) {
          await react('❌');
          return reply(`❌ Source channel resolve nahi ho saka (${parsed.code}). Please check channel link.`);
        }
        sourceJid = src.rec.jid;

        let got;
        try { got = await hub.getPostById(sock, sourceJid, parsed.postId); }
        catch (e) {
          await react('❌');
          return reply(`❌ Channel post #${parsed.postId} retrieve nahi ho saki (${e.message}).\n\n💡 Tip: Post ko chat mein bhej kar us par reply karke '${config.prefix}cforward' bhejein.`);
        }

        if (got.source === 'cache') {
          post = { type: got.post.type, text: got.post.text, caption: got.post.caption, mime: got.post.mime, fileName: got.post.fileName, ptt: got.post.ptt, gif: got.post.gif, size: got.post.size };
          if (got.post.media?.path && fs.existsSync(got.post.media.path)) tmpFile = { keep: true, path: got.post.media.path };
          else if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(post.type)) {
            await react('❌'); return reply('❌ That post is cached but its media file is no longer stored.');
          }
        } else {
          const d = hub.describeContent(got.post.message);
          if (!d || d.unsupported) { await react('❌'); return reply('❌ That post type cannot be forwarded.'); }
          post = d;
          if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(d.type)) {
            let saved = await hub.saveMedia(sock, { remoteJid: sourceJid, id: parsed.postId }, got.post.message, `fw${parsed.postId}`);
            if (!saved?.path) {
              try {
                const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
                const unwrapQuoted = hub.unwrap(got.post.message);
                const rawMedia = unwrapQuoted?.[d.type];
                if (rawMedia) {
                  const downloadType = d.type === 'stickerMessage' ? 'sticker' : d.type.replace('Message', '');
                  const stream = await downloadContentFromMessage(rawMedia, downloadType);
                  let buffer = Buffer.from([]);
                  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                  if (buffer && buffer.length) {
                    const ext = d.type === 'stickerMessage' ? 'webp' : d.type === 'imageMessage' ? 'jpg' : d.type === 'videoMessage' ? 'mp4' : d.type === 'audioMessage' ? (d.mime?.includes('ogg') ? 'ogg' : 'mp3') : (d.fileName?.split('.').pop() || 'bin');
                    const fallbackFile = path.join(hub.MEDIA_DIR || os.tmpdir(), `${Date.now()}_cfw.${ext}`);
                    fs.writeFileSync(fallbackFile, buffer);
                    saved = { path: fallbackFile };
                  }
                }
              } catch (errDl) {
                console.error('[cforward download fallback error]:', errDl.message);
              }
            }
            if (!saved?.path) { await react('❌'); return reply('❌ Could not download the media of that post.'); }
            tmpFile = { keep: false, path: saved.path };
          }
        }
        sourceLabel = `${src.rec.name || sourceJid} / post ${parsed.postId}`;
        fwdInfo = { jid: sourceJid, serverId: parsed.postId, name: src.rec.name || undefined };
      } else if (quoted) {
        // -------- Mode A: Replied Message / Quoted Post / Attached Media --------
        const q = hub.unwrap(quoted);
        const d = hub.describeContent(quoted);
        if (!d || d.unsupported) return reply('❌ That message type cannot be posted to a channel (supported: text, image, video, audio, document, sticker).');
        post = d;

        // Custom caption / text override if user typed text
        const customText = textTokens.join(' ').trim();
        if (customText) {
          if (post.type === 'conversation' || post.type === 'extendedTextMessage') {
            post.text = customText;
          } else {
            post.caption = customText;
          }
        }

        const qInner = q?.[d.type];
        sourceJid = qInner?.contextInfo?.forwardedNewsletterMessageInfo?.newsletterJid || (String(ctx?.remoteJid || '').endsWith('@newsletter') ? ctx.remoteJid : null);
        await react('⏳');

        if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(d.type)) {
          let saved = await hub.saveMedia(sock, { remoteJid: extra.from, id: ctx?.stanzaId || msg?.key?.id, participant: ctx?.participant || extra?.sender }, quoted, `fw${Date.now()}`);
          if (!saved?.path) {
            try {
              const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
              const unwrapQuoted = hub.unwrap(quoted);
              const rawMedia = unwrapQuoted?.[d.type];
              if (rawMedia) {
                const downloadType = d.type === 'stickerMessage' ? 'sticker' : d.type.replace('Message', '');
                const stream = await downloadContentFromMessage(rawMedia, downloadType);
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                if (buffer && buffer.length) {
                  const ext = d.type === 'stickerMessage' ? 'webp' : d.type === 'imageMessage' ? 'jpg' : d.type === 'videoMessage' ? 'mp4' : d.type === 'audioMessage' ? (d.mime?.includes('ogg') ? 'ogg' : 'mp3') : (d.fileName?.split('.').pop() || 'bin');
                  const fallbackFile = path.join(hub.MEDIA_DIR || os.tmpdir(), `${Date.now()}_cfw.${ext}`);
                  fs.writeFileSync(fallbackFile, buffer);
                  saved = { path: fallbackFile };
                }
              }
            } catch (errDl) {
              console.error('[cforward download fallback error]:', errDl.message);
            }
          }
          if (!saved?.path) { await react('❌'); return reply('❌ Could not download the media of the replied post.'); }
          tmpFile = { keep: false, path: saved.path };
        }
        sourceLabel = sourceJid ? `${hub.getChannel(sourceJid)?.name || sourceJid} (replied post)` : 'replied message';
        const fni = qInner?.contextInfo?.forwardedNewsletterMessageInfo;
        if (sourceJid) fwdInfo = { jid: sourceJid, serverId: fni?.serverMessageId || undefined, name: fni?.newsletterName || hub.getChannel(sourceJid)?.name || undefined };
      } else if (textTokens.length > 0 && targetTokens.length > 0) {
        // -------- Mode C: Direct Text Announcement to target channel --------
        post = { type: 'extendedTextMessage', text: textTokens.join(' ').trim() };
        sourceLabel = 'direct announcement';
      }

      if (!post) {
        return reply(`📢 *How to use ${config.prefix}cforward*\n\n` +
          `1️⃣ *Forward to Paired Bot's Channels:*\n` +
          `Reply to any message/media with:\n` +
          `👉 *${config.prefix}cforward*\n\n` +
          `2️⃣ *Forward to Specific Channel (Link or ID):*\n` +
          `Reply to any message/media with:\n` +
          `👉 *${config.prefix}cforward https://whatsapp.com/channel/CODE*\n` +
          `👉 *${config.prefix}cforward 120363...@newsletter*\n\n` +
          `3️⃣ *Send Direct Text to Channel:*\n` +
          `👉 *${config.prefix}cforward <channel_link> Your text here*\n\n` +
          `4️⃣ *All Connected Sessions (-a -s):*\n` +
          `👉 *${config.prefix}cforward -a -s* (reply to post)\n\n` +
          `_Flags: --force (resend duplicate) • --plain (no "Forwarded" tag) • --sync (live check)_`);
      }

      const fwd = plain ? null : (fwdInfo || (forceFwd ? {} : null));

      // -------- ALL SESSIONS (background job) --------
      if (allSessions) {
        await reply('🧭 Checking which channels each connected session owns/administers...');
        const plan = await hub.planAllSessions(sock, { excludeJid: sourceJid, forceLive: forceSync });
        if (!plan.dests.length) {
          await react('❌');
          return reply(`❌ None of the ${plan.sessions.length} connected session(s) is owner/admin of a channel${sourceJid ? ' (other than the source channel)' : ''}.${plan.problems.length ? '\n⚠️ ' + plan.problems.slice(0, 5).map((p) => `+${p.account}: ${p.error}`).join('\n') : ''}`);
        }
        const used = new Set(plan.dests.map((d) => hub.accountOf(d._sock)));
        job = { startedAt: Date.now(), total: plan.dests.length, done: 0, sent: 0, failed: 0, skipped: 0, stop: false };
        deferCleanup = true;
        const S = { min: Number(process.env.CFORWARD_DELAY_MIN_MS) || 4000, max: Number(process.env.CFORWARD_DELAY_MAX_MS) || 8000 };
        await reply(`🚀 *All-sessions forward started*\nChannels: ${plan.dests.length} (via ${used.size} of ${plan.sessions.length} session(s))${plan.shared ? `\nShared channels: ${plan.shared} → posted once each` : ''}\nStyle: ${fwd ? (fwd.jid ? 'forwarded from channel' : 'forwarded') : 'normal post'}\nPause: random ${S.min / 1000}-${S.max / 1000} s between posts\nEstimated time: ${fmtMin(plan.dests.length * ((S.min + S.max) / 2 + 1500))}\nStop: ${config.prefix}cforward stop • Progress: ${config.prefix}cforward status`);
        const file = tmpFile?.path || null;
        console.log(`[CFORWARD] ALL-SESSIONS type=${post.type} size=${post.size || 0} media=${file ? 'yes' : 'no'} channels=${plan.dests.length} sessions=${used.size}`);
        (async () => {
          try {
            let lastNote = 0;
            const res = await hub.forwardToChannels(sock, post, file, plan.dests, {
              force, fwd, confirm: false,
              shouldStop: () => job.stop,
              onProgress: (r) => {
                job.done = r.sent.length + r.failed.length; job.sent = r.sent.length; job.failed = r.failed.length; job.skipped = r.skipped.length;
                if (job.done - lastNote >= 20) { lastNote = job.done; sock.sendMessage(extra.from, { text: `⏳ Forwarding... ${job.done}/${job.total} (✅ ${job.sent} • ❌ ${job.failed})` }).catch(() => {}); }
              }
            });
            if (res.busy) return reply('⏳ This exact post is already being forwarded right now.');
            const bySess = new Map();
            const row = (a) => { if (!bySess.has(a)) bySess.set(a, { ok: 0, bad: 0 }); return bySess.get(a); };
            for (const r of res.sent) row(r._acct).ok++;
            for (const f of res.failed) row(f.acct).bad++;
            const kb = post.size ? ` (${post.size > 1048576 ? (post.size / 1048576).toFixed(1) + ' MB' : Math.round(post.size / 1024) + ' KB'})` : '';
            let out = `*📢 ALL-SESSIONS FORWARD ${res.stopped ? '— STOPPED' : 'DONE'}*\nSource: ${sourceLabel}\nType: ${post.type.replace('Message', '')}${kb}${post.caption ? ' + caption' : ''}\nStyle: ${fwd ? (fwd.jid ? 'forwarded from channel' : 'forwarded') : 'normal post'}\nTook: ${fmtMin(Date.now() - job.startedAt)}\n\n✅ *Sent: ${res.sent.length}*  ❌ *Failed: ${res.failed.length}*  ⏭️ *Skipped: ${res.skipped.length}*${res.stopped ? `  🛑 *Not reached: ${plan.dests.length - res.sent.length - res.failed.length - res.skipped.length}*` : ''}\n\n*By session*`;
            for (const [a, v] of [...bySess.entries()].slice(0, 40)) out += `\n📱 +${a}: ✅ ${v.ok}${v.bad ? `  ❌ ${v.bad}` : ''}`;
            if (res.failed.length) out += `\n\n❌ *Failures*\n` + res.failed.slice(0, 15).map((f) => `• ${name(f.rec)} (+${f.acct}) — ${f.reason}`).join('\n') + (res.failed.length > 15 ? `\n…and ${res.failed.length - 15} more` : '');
            if (res.skipped.length) out += `\n\n⏭️ Skipped (already sent earlier): ${res.skipped.length} — use --force to resend`;
            if (plan.problems.length) out += `\n\n⚠️ Sessions not used:\n` + plan.problems.slice(0, 8).map((p) => `• +${p.account}: ${p.error}`).join('\n');
            await reply(out);
          } catch (e) {
            console.error('[cforward all-sessions]', e);
            try { await reply(`❌ All-sessions forward crashed: ${e.message}`); } catch { /* ignore */ }
          } finally {
            job = null;
            if (tmpFile && tmpFile.path && !tmpFile.keep) { try { fs.unlinkSync(tmpFile.path); } catch { /* ignore */ } }
          }
        })();
        return;
      }

      // -------- RESOLVE DESTINATIONS --------
      let dests = [], rejected = [], listInfo = null;

      if (targetTokens.length > 0) {
        // Resolve explicit target links, invite codes, and JIDs
        const resolvedTargets = [];
        for (const rawToken of targetTokens) {
          const subTokens = rawToken.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
          for (const token of subTokens) {
            if (/@newsletter$/i.test(token)) {
              resolvedTargets.push({ jid: token.toLowerCase(), name: 'WhatsApp Channel' });
              continue;
            }
            if (/^\d{8,}$/.test(token)) {
              resolvedTargets.push({ jid: `${token}@newsletter`, name: 'WhatsApp Channel' });
              continue;
            }
            // Resolve Channel Link / Invite Code
            try {
              const { resolveChannel } = require('../utils/channelResolver');
              const res = await resolveChannel(sock, token, msg);
              if (res && res.ok && res.jid) {
                resolvedTargets.push({ jid: res.jid.toLowerCase(), name: res.name || 'WhatsApp Channel' });
                continue;
              }
            } catch (_) {}

            // Direct Invite Code fallback
            const code = String(token).replace(/https?:\/\/(?:www\.)?whatsapp\.com\/channel\//i, '').split('/')[0].split('?')[0].trim();
            if (code) {
              try {
                const src = await hub.resolveInvite(sock, code);
                if (src?.rec?.jid) {
                  resolvedTargets.push({ jid: src.rec.jid.toLowerCase(), name: src.rec.name || 'WhatsApp Channel' });
                }
              } catch (_) {}
            }
          }
        }

        const seenJids = new Set();
        for (const item of resolvedTargets) {
          if (seenJids.has(item.jid)) continue;
          seenJids.add(item.jid);
          const rec = await hub.targetRecord(sock, item.jid);
          if (item.name && (!rec.name || rec.name === item.jid)) rec.name = item.name;
          dests.push(rec);
        }

        if (!dests.length) {
          await react('❌');
          return reply('❌ Target channel link ya ID resolve nahi ho saki. Please check link/JID format.');
        }

        await reply(`🎯 Forwarding to ${dests.length} target channel(s)${force ? ' (--force)' : ''}...`);
      } else {
        // Mode 1: No targets given -> Forward to ALL channels owned/admin by THIS paired session
        const r = await hub.eligibleDestinations(sock, { excludeJid: sourceJid, forceLive: forceSync });
        listInfo = r;
        dests = r.eligible;
        rejected = r.rejected;

        if (!dests.length) {
          await react('❌');
          const acct = hub.accountOf(sock);
          return reply(`❌ *Koi Channel Nahi Mila*\n\nPaired bot account (+${acct}) par koi verified Admin/Owner channel detect nahi hua.\n\n💡 *Aap direct Channel Link ya ID de kar foran forward kar sakte hain:*\nReply to any post or media:\n👉 *${config.prefix}cforward https://whatsapp.com/channel/CODE*\n👉 *${config.prefix}cforward 120363...@newsletter*\n\n_Note: Agar aap is account par channel admin hain, toh pehle \`${config.prefix}channels add <link>\` se channel save karein._`);
        }

        const ago = listInfo?.syncedAt ? Math.max(0, Math.round((Date.now() - listInfo.syncedAt) / 60000)) : null;
        const src2 = !listInfo?.source ? 'verified with WhatsApp' : listInfo.source === 'live' ? 'live WhatsApp scan' : listInfo.source === 'saved' ? `saved list (${ago}m ago)` : `database fallback (${ago}m ago)`;
        await reply(`📢 Session +${listInfo?.account || hub.accountOf(sock)} is owner/admin of ${dests.length} channel(s) (${src2}).\nPosting to all of them${force ? ' (--force)' : ''}...`);
      }

      console.log(`[CFORWARD] session=${hub.accountOf(sock)} type=${post.type} size=${post.size || 0} media=${tmpFile?.path ? 'yes' : 'no'} dests=${dests.length} fwd=${fwd ? (fwd.jid ? 'channel' : 'generic') : 'no'}`);
      const res = await hub.forwardToChannels(sock, post, tmpFile?.path || null, dests, { force, fwd });
      if (res.busy) { await react('⏳'); return reply('⏳ This exact post is already being forwarded right now. Not sending it twice.'); }

      const list = (arr, f) => arr.slice(0, MAX_SHOWN).map(f).join('\n') + (arr.length > MAX_SHOWN ? `\n…and ${arr.length - MAX_SHOWN} more` : '');
      const kb = post.size ? ` (${post.size > 1048576 ? (post.size / 1048576).toFixed(1) + ' MB' : Math.round(post.size / 1024) + ' KB'})` : '';
      let out = `*📢 CFORWARD SUMMARY*\n📱 Session: +${hub.accountOf(sock)}\nSource: ${sourceLabel}\nType: ${post.type.replace('Message', '')}${kb}${post.caption ? ' + caption' : ''}\nStyle: ${fwd ? (fwd.jid ? 'forwarded from channel' : 'forwarded') : 'normal post'}\n\n✅ *Sent: ${res.sent.length}*`;
      if (res.sent.length) out += `\n${list(res.sent, (r) => `${r._delivery === 'confirmed' ? '✅' : r._delivery === 'not-seen' ? '⚠️' : '📤'} ${name(r)}${r._delivery === 'confirmed' ? (r._serverId ? ` — accepted by WhatsApp (post #${r._serverId})` : ' — confirmed in channel') : r._delivery === 'not-seen' ? ' — sent, but not seen in feed (check channel admin)' : ' — handed over'}${r._note && r._note !== 'forwarded label' ? `\n   ↳ ${r._note}` : ''}`)}`;
      if (res.skipped.length) out += `\n\n⏭️ *Skipped (duplicate): ${res.skipped.length}*\n${list(res.skipped, (s) => `• ${name(s.rec)}`)}\n_Use ${config.prefix}cforward --force to resend._`;
      if (res.failed.length) out += `\n\n❌ *Failed: ${res.failed.length}*\n${list(res.failed, (f) => `• ${name(f.rec)} — ${f.reason}`)}`;
      if (rejected.length) out += `\n\n⚠️ *Not usable (${rejected.length}):*\n${list(rejected, (r) => `• ${name(r.rec)} — ${r.reason}`)}`;
      await reply(out);
      await react(res.failed.length && !res.sent.length ? '❌' : '✅');
    } catch (e) {
      console.error('[cforward]', e);
      const errStr = String(e?.message || e);
      if (errStr.toLowerCase().includes('rate-overlimit')) {
        await reply(`⚠️ *WhatsApp Rate Limit*: WhatsApp ke server par recent queries zyada hone ki wajah se rate-limit aayi hai. Kuch second intezar karein ya direct channel link de kar bhejein: \`${config.prefix}cforward <channel_link>\``);
      } else {
        await reply(`❌ ${errStr}`);
      }
      await react('❌');
    } finally {
      if (!deferCleanup && tmpFile && tmpFile.path && !tmpFile.keep) { try { fs.unlinkSync(tmpFile.path); } catch { /* ignore */ } }
    }
  },

  cforwardCommand: async function (sock, from, msg, args, isOwner, isAdmin, botData, saveBotData, isSessionOwner = false) {
    let resolvedOwner = isOwner;
    try {
      const ownerManager = require('../utils/ownerManager');
      if (ownerManager.checkIsMasterOwner({ sock, msg, from })) {
        resolvedOwner = true;
      }
    } catch {}

    const extra = {
      from,
      sender: msg?.key?.participant || msg?.participant || from,
      isGroup: from.endsWith('@g.us'),
      isOwner: resolvedOwner,
      isAdmin,
      isSessionOwner,
      isSudo: resolvedOwner || isAdmin || isSessionOwner,
      database: {
        getGlobalSetting: (key) => (botData ? botData[key] : null),
        setGlobalSetting: (key, val) => {
          if (botData) botData[key] = val;
          if (typeof saveBotData === 'function') saveBotData();
        }
      },
      reply: (text) => sock.sendMessage(from, { text: typeof text === 'string' ? text : JSON.stringify(text) }, { quoted: msg }),
      react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
    };
    return module.exports.execute(sock, msg, args, extra);
  }
};
