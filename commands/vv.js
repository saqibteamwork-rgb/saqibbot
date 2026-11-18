const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function vvCommand(sock, from, msg) {
    try {
        // Loading reactions (safe - errors here never block the rest of the command)
        const loadEmojis = ['⏳', '🔓', '👁️'];
        for (const emoji of loadEmojis) {
            await sock.sendMessage(from, { react: { text: emoji, key: msg.key } }).catch(() => {});
        }

        // Unwrap ephemeral (disappearing-message) wrapper on the incoming .vv reply itself, if present
        const outerMessage = msg.message?.ephemeralMessage?.message || msg.message;

        const quoted = outerMessage?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
            return await sock.sendMessage(from, { text: "❌ Please *reply* to a View-Once message with `.vv`." }, { quoted: msg });
        }

        // Some clients wrap the quoted message in ephemeralMessage too
        const unwrappedQuoted = quoted.ephemeralMessage?.message || quoted;

        // Handle every known view-once wrapper WhatsApp/Baileys uses:
        // viewOnceMessage, viewOnceMessageV2 (images/videos), viewOnceMessageV2Extension (videos, newer clients)
        const viewOnce =
            unwrappedQuoted.viewOnceMessageV2Extension ||
            unwrappedQuoted.viewOnceMessageV2 ||
            unwrappedQuoted.viewOnceMessage;

        const message = viewOnce ? viewOnce.message : unwrappedQuoted;
        if (!message) {
            return await sock.sendMessage(from, { text: "❌ Not a View-Once media message." }, { quoted: msg });
        }

        // Explicitly check for the known media keys instead of blindly taking Object.keys(message)[0],
        // since protobuf-decoded messages can carry sibling keys (e.g. messageContextInfo) in any order.
        let vType = null;
        if (message.imageMessage) vType = 'imageMessage';
        else if (message.videoMessage) vType = 'videoMessage';
        else if (message.audioMessage) vType = 'audioMessage';

        if (!vType) {
            console.error('[vv] Unrecognized quoted message keys:', Object.keys(message));
            return await sock.sendMessage(from, { text: "❌ Not a View-Once media message (unsupported type)." }, { quoted: msg });
        }

        try {
            const stream = await downloadContentFromMessage(message[vType], vType.replace('Message', ''));
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);

            if (buffer.length === 0) throw new Error('Downloaded an empty file - the media may have expired.');

            const caption = "> *_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ_*";
            const contextInfo = {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363431913895899@newsletter',
                    newsletterName: 'Mr SAQIB',
                    serverMessageId: 1
                }
            };

            if (vType === 'imageMessage') {
                await sock.sendMessage(from, { image: buffer, caption, contextInfo }, { quoted: msg });
            } else if (vType === 'videoMessage') {
                await sock.sendMessage(from, { video: buffer, caption, contextInfo }, { quoted: msg });
            } else if (vType === 'audioMessage') {
                await sock.sendMessage(from, { audio: buffer, mimetype: 'audio/mp4', contextInfo }, { quoted: msg });
            }
        } catch (e) {
            console.error('[vv] Download error:', e);
            await sock.sendMessage(from, { text: `❌ Failed to download View-Once media: ${e.message}` }, { quoted: msg }).catch(() => {});
        }

    } catch (err) {
        // Top-level safety net: guarantees the user ALWAYS gets a response, even on unexpected errors,
        // since the bot's global message handler only logs to console and never replies on its own.
        console.error('[vv] Unexpected error:', err);
        await sock.sendMessage(from, { text: `❌ Unexpected error in .vv: ${err.message}` }, { quoted: msg }).catch(() => {});
    }
}

module.exports = vvCommand;
