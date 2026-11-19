'use strict';

const { resolveMedia, isAutoVVEnabled, setAutoVV } = require('../utils/viewOnceManager');

/**
 * .vv command handler with 3-Layer Fallback Architecture
 * Layer 1: In-memory/disk buffer pre-cached at arrival
 * Layer 2: Raw message unstripped directPath from in-memory store
 * Layer 3: Quoted message unwrap fallback
 */
async function vvCommand(sock, from, msg, args = []) {
    try {
        const sub = (args[0] || '').toLowerCase();

        // 1. Check if user is checking or toggling Auto-VV
        if (sub === 'on' || sub === 'off' || sub === 'status') {
            if (sub === 'on') {
                setAutoVV(true);
                return await sock.sendMessage(from, {
                    text: "╭━━━〔 🔓 *AUTO VIEW-ONCE: ENABLED* 〕━━━┈⊷\n" +
                          "┃ ✅ All incoming View-Once media will now\n" +
                          "┃    automatically be sent directly to your\n" +
                          "┃    *personal \"You\" (Message Yourself) chat*!\n" +
                          "┃\n" +
                          "┃ ⚡ *No need to reply with .vv anymore!*\n" +
                          "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n" +
                          "> *_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ_*"
                }, { quoted: msg });
            } else if (sub === 'off') {
                setAutoVV(false);
                return await sock.sendMessage(from, {
                    text: "╭━━━〔 🔒 *AUTO VIEW-ONCE: DISABLED* 〕━━━┈⊷\n" +
                          "┃ ❌ Automatic forwarding disabled.\n" +
                          "┃ 💡 View-Once media will still be cached quietly;\n" +
                          "┃    you can recover any of them by replying `.vv`.\n" +
                          "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n" +
                          "> *_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ_*"
                }, { quoted: msg });
            } else {
                const status = isAutoVVEnabled() ? '✅ ENABLED' : '❌ DISABLED';
                return await sock.sendMessage(from, {
                    text: `📊 *Auto View-Once Status:* ${status}\n\nUse \`.autovv on\` or \`.autovv off\` to toggle.`
                }, { quoted: msg });
            }
        }

        // 2. Extract Quoted context & stanzaId
        const outerMessage = msg.message?.ephemeralMessage?.message || msg.message;
        const contextInfo = outerMessage?.extendedTextMessage?.contextInfo ||
                            outerMessage?.imageMessage?.contextInfo ||
                            outerMessage?.videoMessage?.contextInfo ||
                            outerMessage?.audioMessage?.contextInfo;

        const stanzaId = contextInfo?.stanzaId;
        const quoted = contextInfo?.quotedMessage;

        if (!quoted && !stanzaId) {
            return await sock.sendMessage(from, {
                text: "❌ Please *reply* to a View-Once message with `.vv`.\n\n" +
                      "💡 *Tip:* Use `.autovv on` to receive every View-Once automatically in your 'You' chat!"
            }, { quoted: msg });
        }

        // Loading reactions
        const loadEmojis = ['⏳', '🔓', '👁️'];
        for (const emoji of loadEmojis) {
            await sock.sendMessage(from, { react: { text: emoji, key: msg.key } }).catch(() => {});
        }

        // 3. Multi-Layer Resolution (Layer 1 Cache -> Layer 2 Raw Store -> Layer 3 Quoted)
        const resolved = await resolveMedia({ quoted, stanzaId, from, sock });

        if (!resolved || !resolved.buffer || resolved.buffer.length === 0) {
            return await sock.sendMessage(from, {
                text: "❌ *Could not retrieve View-Once media.*\n\n" +
                      "💡 *Technical Reasons:*\n" +
                      "1. WhatsApp client stripped the media path from the quoted reply.\n" +
                      "2. This message was sent before the bot was online/connected.\n" +
                      "3. The temporary media token expired on WhatsApp servers.\n\n" +
                      "✨ *Permanent Fix:* Turn on `.autovv on` so all future View-Once messages are cached and sent automatically to your 'You' chat the moment they arrive!"
            }, { quoted: msg });
        }

        const { buffer, mediaType, mimetype, layer } = resolved;
        const layerText = layer === 1 ? '⚡ Layer 1 (Instant Pre-Cache)' : (layer === 2 ? '🛡️ Layer 2 (Raw Message Store)' : '🔄 Layer 3 (Quoted Context)');
        const caption = `> *_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ_*\n> 🔒 _Recovered via ${layerText}_`;

        const contextInfoForward = {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363431913895899@newsletter',
                newsletterName: 'Mr SAQIB',
                serverMessageId: 1
            }
        };

        if (mediaType === 'image') {
            await sock.sendMessage(from, { image: buffer, caption, contextInfo: contextInfoForward }, { quoted: msg });
        } else if (mediaType === 'video') {
            await sock.sendMessage(from, { video: buffer, caption, contextInfo: contextInfoForward }, { quoted: msg });
        } else if (mediaType === 'audio') {
            await sock.sendMessage(from, { audio: buffer, mimetype: mimetype || 'audio/mp4', contextInfo: contextInfoForward }, { quoted: msg });
        }

    } catch (err) {
        console.error('[vv] Unexpected error:', err);
        await sock.sendMessage(from, { text: `❌ Unexpected error in .vv: ${err.message}` }, { quoted: msg }).catch(() => {});
    }
}

module.exports = vvCommand;
