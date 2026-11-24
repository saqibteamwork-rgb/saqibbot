// commands/channelid.js
// Usage: .channelid <whatsapp channel link | or reply to any forwarded channel post>
'use strict';

const { resolveChannel, extractFromMessageContext } = require('../utils/channelResolver');

async function channelidCommand(sock, from, msg, q) {
    try {
        // 1. Check if user quoted or forwarded a channel message (100% Rate-Limit Immune!)
        const postInfo = extractFromMessageContext(msg);
        if (postInfo?.jid) {
            const out =
                `✅ *CHANNEL INFO FOUND* *(Via Forwarded Post)*\n\n` +
                `📛 *Name:* ${postInfo.name}\n` +
                `🆔 *Newsletter JID:* \`${postInfo.jid}\`\n` +
                (postInfo.serverMessageId ? `📌 *Post ID:* ${postInfo.serverMessageId}\n` : '') +
                `\n💡 *Tip:* Is JID ko copy karke aap direct *.chfollow ${postInfo.jid}* chala sakte hain!`;

            await sock.sendMessage(from, { text: out }, { quoted: msg });
            return;
        }

        // 2. If no text and no forwarded post
        if (!q || !q.trim()) {
            await sock.sendMessage(from, {
                text: '📋 *USAGE GUIDE: .channelid*\n\n' +
                      '🔹 *Method 1 (Channel Link):*\n' +
                      '.channelid https://whatsapp.com/channel/0029Vb8yiOF42DcjDYgq5g0Q\n\n' +
                      '🔹 *Method 2 (Instant 0-Cooldown Bypass):*\n' +
                      'Channel ki koi bhi post/message bot ko forward karein aur uspar *.channelid* reply karein!'
            }, { quoted: msg });
            return;
        }

        const input = q.trim();

        // 3. Resolve using multi-tier resolver engine (Cache -> Socket Rotation -> Mega Cluster -> Web)
        const res = await resolveChannel(sock, input, msg);

        if (!res.ok) {
            await sock.sendMessage(from, {
                text: res.error || '❌ Channel info nahi mil saki. Link check karein.'
            }, { quoted: msg });
            return;
        }

        const jid = res.jid;
        const name = res.name || 'WhatsApp Channel';
        const followers = res.initialFollowers || 'N/A';
        const sourceLabel = res.source ? ` (${res.source.replace(/_/g, ' ')})` : '';

        // Extract post ID if user provided a post URL (e.g. /channel/CODE/204)
        const postMatch = input.match(/\/(\d{1,10})(?:[/?#\s]|$)/);
        const postId = postMatch ? postMatch[1] : (res.serverMessageId || null);

        let resultText =
            `✅ *CHANNEL INFO FOUND*${sourceLabel}\n\n` +
            `📛 *Name:* ${name}\n` +
            `🆔 *Newsletter JID:* \`${jid}\`\n` +
            (postId ? `📌 *Post ID:* \`${postId}\`\n` : '') +
            `👥 *Followers:* ${followers}\n` +
            `🔰 *Status:* Active\n\n` +
            `💡 *Direct Commands:* \n` +
            `👉 *.chfollow ${jid}*\n` +
            (postId ? `👉 *.chreact ${jid} ${postId} ❤️*` : `👉 *.chreact ${jid} <post_id> ❤️*`);

        await sock.sendMessage(from, { text: resultText }, { quoted: msg });

    } catch (err) {
        console.error('[channelid error]:', err);
        await sock.sendMessage(from, {
            text: `❌ Error: ${err.message || String(err)}\n\n💡 Channel ka koi bhi message forward karke uspar *.channelid* reply karein!`
        }, { quoted: msg });
    }
}

module.exports = channelidCommand;
