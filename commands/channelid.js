// commands/channelid.js
// Usage: .channelid <whatsapp channel link>
async function channelidCommand(sock, from, msg, q) {
    if (!q) {
        await sock.sendMessage(from, {
            text: '📋 *Usage:* .channelid <channel link>\n\n' +
                  'Example:\n.channelid https://whatsapp.com/channel/0029Vb7kJ9t72WU043YA9p05'
        }, { quoted: msg });
        return;
    }
    try {
        let inviteCode = q.trim()
            .replace('https://whatsapp.com/channel/', '')
            .replace('http://whatsapp.com/channel/', '')
            .split('/')[0]
            .split('?')[0]
            .trim();

        if (!inviteCode) {
            await sock.sendMessage(from, { text: '❌ Valid channel link bhejein.' }, { quoted: msg });
            return;
        }

        const metadata = await sock.newsletterMetadata('invite', inviteCode);

        if (!metadata || !metadata.id) {
            await sock.sendMessage(from, { text: '❌ Channel info nahi mila. Link check karein.' }, { quoted: msg });
            return;
        }

        const id = metadata.id;
        const tm = metadata.thread_metadata || {};

        const name = tm.name?.text || metadata.name || 'Unknown Channel';
        const followers = tm.subscribers_count ?? metadata.subscribers ?? 'N/A';
        const description = tm.description?.text || metadata.description || null;
        const verified = tm.verification === 'VERIFIED' ? '✅ Verified' : 'Unverified';

        // Pre-cache resolved channel in channelResolver so .chfollow uses it instantly with zero rate-limit!
        try {
            const { resolvedCache } = require('../utils/channelResolver');
            resolvedCache.set(inviteCode, { jid: id, name, followers });
        } catch (_) {}

        let resultText =
            `✅ *CHANNEL INFO FOUND*\n\n` +
            `📛 *Name:* ${name}\n` +
            `🆔 *Newsletter JID:* \`${metadata.id}\`\n` +
            `👥 *Followers:* ${followers}\n` +
            `🔰 *Status:* ${verified}`;

        if (description) {
            resultText += `\n📝 *Description:* ${description}`;
        }

        await sock.sendMessage(from, { text: resultText }, { quoted: msg });
    } catch (err) {
        console.error('channelid error:', err);
        await sock.sendMessage(from, {
            text: `❌ Error: ${err.message || String(err)}\n\nMake sure link sahi hai aur channel public hai.`
        }, { quoted: msg });
    }
}

module.exports = channelidCommand;