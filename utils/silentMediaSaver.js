'use strict';

/**
 * MR SAQIB MD :: SILENT MEDIA & STATUS SAVER
 * ============================================================================
 * Silently saves WhatsApp Status and View-Once / Media (Images, Videos, Voice notes)
 * directly into the user's personal inbox (Message Yourself / Saved Messages)
 * when replying with trigger emojis or words:
 *
 * Emojis:
 * - Heart emojis: ❤️, 💔, 💖, 💗, 💓, 💞, 💕, ❣️, 🖤, 🤍, 🤎, 💜, 💙, 💚, 💛, 🧡, etc.
 * - Reactions: 👍, 🔥, 😍, 🥰, 🥺, 😭, 😢, 👏, ✨, ⭐, 💯, 🌹, etc.
 *
 * Words:
 * - Feedback: good, nice, sad, thanks, thx, acha, axha, achha, mast, zabardast, etc.
 * - Emotion: heart, red heart, broken heart, dil, toota dil, etc.
 * - Save intent: save, send, bhejo, bhej do, pls send, vv, once, etc.
 *
 * Zero noise in group/contact chat:
 * - Media is sent SILENTLY to owner's personal inbox.
 * - No bot commands, errors, or spam sent to status owner or group.
 * ============================================================================
 */

const baileys = require('@whiskeysockets/baileys');
const { downloadContentFromMessage, jidNormalizedUser } = baileys;

// Set of processed message IDs to prevent duplicates
const processedSaveIds = new Set();

/**
 * Checks if the text or reaction matches trigger words or emojis
 */
function isSilentSaveTrigger(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim();
    if (!clean) return false;

    // 1. Emoji check: Heart emojis and reaction emojis
    const heartAndReactionRegex = /^[\s\p{Emoji}\u200d\ufe0f❤️💔💖💗💓💞💕❣️🖤🤍🤎💜💙💚💛🧡💘💝❤️‍🔥❤️‍🩹👍🔥😍🥰🥺😭😢👏✨⭐💯🌹🌸👌🤲]+$/u;
    if (heartAndReactionRegex.test(clean) && clean.length <= 25) {
        return true;
    }

    // 2. Normalized clean text (remove prefixes like . ! /)
    const lower = clean.toLowerCase().replace(/^[.#!/?]/, '').trim();

    // Exact trigger words & aliases
    const exactWords = new Set([
        // Emojis written as words
        'heart', 'red heart', 'rd heart', 'broken heart', 'broken', 'dil', 'toota dil', 'tuta dil',
        // Feedback / appreciation words
        'good', 'nice', 'sad', 'so sad', 'very sad', 'thanks', 'thx', 'tq', 'thank you', 'thank u',
        'acha', 'achha', 'axha', 'accha', 'bohot acha', 'bohat acha', 'bht acha', 'buht acha',
        'sahi', 'sahii', 'mast', 'zabardast', 'zbrdst', 'khoob', 'bohot khoob', 'pyara', 'khoobsurat', 'khubsurat',
        'great', 'super', 'superb', 'wow', 'beautiful', 'osm', 'awesome', 'perfect', 'best', 'fire',
        // Save / download intent
        'save', 'saveme', 'saved', 'send', 'sendme', 'send me', 'bhejo', 'bhej', 'bhej do', 'pls send', 'plz send', 'please send',
        'vv', 'viewonce', 'once', 'status', 'give'
    ]);

    if (exactWords.has(lower)) return true;

    // Short phrase check (up to 5 words containing trigger roots)
    const words = lower.split(/\s+/);
    if (words.length <= 5) {
        const keyRoots = ['good', 'nice', 'sad', 'thanks', 'thx', 'acha', 'axha', 'achha', 'accha', 'heart', 'broken', 'save', 'bhejo', 'send', 'vv', 'once', 'status', 'mast', 'zabardast'];
        if (words.some(w => keyRoots.includes(w))) {
            return true;
        }
    }

    return false;
}

/**
 * Unwraps view-once, ephemeral, and document wrappers from a message
 */
function unwrapMessage(msg) {
    if (!msg || typeof msg !== 'object') return { inner: null, isViewOnce: false };
    let inner = msg;
    let isViewOnce = false;

    if (inner.ephemeralMessage?.message) inner = inner.ephemeralMessage.message;
    if (inner.viewOnceMessage?.message) {
        isViewOnce = true;
        inner = inner.viewOnceMessage.message;
    }
    if (inner.viewOnceMessageV2?.message) {
        isViewOnce = true;
        inner = inner.viewOnceMessageV2.message;
    }
    if (inner.viewOnceMessageV2Extension?.message) {
        isViewOnce = true;
        inner = inner.viewOnceMessageV2Extension.message;
    }
    if (inner.documentWithCaptionMessage?.message) {
        inner = inner.documentWithCaptionMessage.message;
    }

    // Secondary check inside media objects
    if (inner.imageMessage?.viewOnce || inner.videoMessage?.viewOnce || inner.audioMessage?.viewOnce) {
        isViewOnce = true;
    }

    return { inner, isViewOnce };
}

/**
 * Downloads media stream into buffer
 */
async function downloadMedia(mContent, mediaType, customDownloader = null) {
    try {
        const fn = customDownloader || baileys.downloadContentFromMessage || downloadContentFromMessage;
        const stream = await fn(mContent, mediaType);
        let buffer = Buffer.alloc(0);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    } catch (err) {
        console.warn(`[SilentMediaSaver] Download error (${mediaType}):`, err.message);
        return null;
    }
}

/**
 * Main Silent Saver Interceptor
 * Returns true if handled, false otherwise
 */
async function handleSilentSave(sock, msg, from, text, opts = {}) {
    const { isMe, isOwner, isPremium, userId, botData } = opts;

    // Only active for the bot user themselves (fromMe) or bot owners
    if (!isMe && !isOwner) {
        return false;
    }

    // Check if silent save is explicitly disabled in settings
    const userSettings = botData?.statusSettings?.[userId];
    if (userSettings && userSettings.silentSave === false) {
        return false;
    }

    // Prevent duplicate processing
    const msgId = msg?.key?.id;
    if (msgId && processedSaveIds.has(msgId)) {
        return false;
    }

    // Extract contextInfo and quotedMessage
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                        msg.message?.imageMessage?.contextInfo ||
                        msg.message?.videoMessage?.contextInfo ||
                        msg.message?.audioMessage?.contextInfo;
    const quoted = contextInfo?.quotedMessage;

    if (!quoted) {
        return false;
    }

    // Check triggers
    const triggerText = text || msg.message?.extendedTextMessage?.text || msg.message?.reactionMessage?.text || '';
    if (!isSilentSaveTrigger(triggerText)) {
        return false;
    }

    // Detect if this is replying to a WhatsApp Status
    const isStatusReply = contextInfo?.remoteJid === 'status@broadcast' ||
                          contextInfo?.participant === 'status@broadcast' ||
                          from === 'status@broadcast';

    // Unwrap quoted message
    const { inner, isViewOnce } = unwrapMessage(quoted);
    if (!inner) {
        return false;
    }

    // Check media availability
    const hasImage = Boolean(inner.imageMessage);
    const hasVideo = Boolean(inner.videoMessage);
    const hasAudio = Boolean(inner.audioMessage);
    const hasSticker = Boolean(inner.stickerMessage);
    const hasDocument = Boolean(inner.documentMessage);
    const textContent = inner.conversation || inner.extendedTextMessage?.text || '';

    // If it's not a status, not a view-once, and has no media, ignore (don't save random text replies)
    if (!isStatusReply && !isViewOnce && !hasImage && !hasVideo && !hasAudio && !hasSticker && !hasDocument) {
        return false;
    }

    // Target inbox: send to the user's personal "Message Yourself" / Saved Messages chat
    const myJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
    const targetInbox = isMe
        ? myJid
        : (opts.senderDigits ? `${opts.senderDigits}@s.whatsapp.net` : myJid);

    if (!targetInbox) {
        return false;
    }

    // Extract sender display
    let senderNumber = 'Contact';
    if (contextInfo.participant && contextInfo.participant !== 'status@broadcast') {
        senderNumber = contextInfo.participant.split('@')[0].split(':')[0];
    } else if (from && from !== 'status@broadcast') {
        senderNumber = from.split('@')[0].split(':')[0];
    }
    const senderDisplay = `+${senderNumber.replace(/[^0-9]/g, '')}`;

    // Mark as processed
    if (msgId) {
        processedSaveIds.add(msgId);
        if (processedSaveIds.size > 200) {
            const first = processedSaveIds.values().next().value;
            processedSaveIds.delete(first);
        }
    }

    try {
        // ==========================================
        // 1. IMAGE (View-Once or Status or Regular)
        // ==========================================
        if (hasImage) {
            const buffer = await downloadMedia(inner.imageMessage, 'image', opts.downloader);
            if (buffer && buffer.length > 0) {
                const origCaption = inner.imageMessage.caption ? `\n┃ 💬 *Caption:* ${inner.imageMessage.caption}` : '';
                const tag = isViewOnce ? '🔓 *VIEW-ONCE PHOTO SAVED (SILENT)*' : (isStatusReply ? '📥 *STATUS PHOTO SAVED (SILENT)*' : '📥 *PHOTO SAVED (SILENT)*');
                const caption =
`╭━━━〔 ${tag} 〕━━━┈⊷
┃ 👤 *From:* ${senderDisplay}${origCaption}
┃ ⚡ *Trigger:* \`${triggerText.slice(0, 30)}\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved silently to your inbox*`;

                await sock.sendMessage(targetInbox, {
                    image: buffer,
                    caption,
                    mimetype: inner.imageMessage.mimetype || 'image/jpeg'
                });
                return true;
            }
        }

        // ==========================================
        // 2. VIDEO (View-Once or Status or Regular)
        // ==========================================
        if (hasVideo) {
            const buffer = await downloadMedia(inner.videoMessage, 'video', opts.downloader);
            if (buffer && buffer.length > 0) {
                const origCaption = inner.videoMessage.caption ? `\n┃ 💬 *Caption:* ${inner.videoMessage.caption}` : '';
                const tag = isViewOnce ? '🔓 *VIEW-ONCE VIDEO SAVED (SILENT)*' : (isStatusReply ? '📥 *STATUS VIDEO SAVED (SILENT)*' : '📥 *VIDEO SAVED (SILENT)*');
                const caption =
`╭━━━〔 ${tag} 〕━━━┈⊷
┃ 👤 *From:* ${senderDisplay}${origCaption}
┃ ⚡ *Trigger:* \`${triggerText.slice(0, 30)}\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved silently to your inbox*`;

                await sock.sendMessage(targetInbox, {
                    video: buffer,
                    caption,
                    mimetype: inner.videoMessage.mimetype || 'video/mp4'
                });
                return true;
            }
        }

        // ==========================================
        // 3. AUDIO / VOICE NOTE (View-Once or Regular)
        // ==========================================
        if (hasAudio) {
            const buffer = await downloadMedia(inner.audioMessage, 'audio', opts.downloader);
            if (buffer && buffer.length > 0) {
                const isPtt = Boolean(inner.audioMessage.ptt);
                const tag = isViewOnce ? '🔓 *VIEW-ONCE VOICE NOTE SAVED*' : '🎙️ *VOICE NOTE SAVED*';
                
                // First send audio file
                await sock.sendMessage(targetInbox, {
                    audio: buffer,
                    mimetype: inner.audioMessage.mimetype || 'audio/mp4',
                    ptt: isPtt
                });

                // Send sender metadata
                await sock.sendMessage(targetInbox, {
                    text:
`╭━━━〔 ${tag} 〕━━━┈⊷
┃ 👤 *From:* ${senderDisplay}
┃ 🎵 *Type:* ${isPtt ? 'Voice Note (PTT)' : 'Audio'}
┃ ⚡ *Trigger:* \`${triggerText.slice(0, 30)}\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved silently to your inbox*`
                });
                return true;
            }
        }

        // ==========================================
        // 4. TEXT STATUS (Status Only)
        // ==========================================
        if (isStatusReply && textContent) {
            const caption =
`╭━━━〔 📥 *STATUS TEXT SAVED (SILENT)* 〕━━━┈⊷
┃ 👤 *From:* ${senderDisplay}
┃ 💬 *Text:* ${textContent}
┃ ⚡ *Trigger:* \`${triggerText.slice(0, 30)}\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved silently to your inbox*`;

            await sock.sendMessage(targetInbox, { text: caption });
            return true;
        }

        // ==========================================
        // 5. STICKER
        // ==========================================
        if (hasSticker) {
            const buffer = await downloadMedia(inner.stickerMessage, 'sticker', opts.downloader);
            if (buffer && buffer.length > 0) {
                await sock.sendMessage(targetInbox, { sticker: buffer });
                return true;
            }
        }

        // ==========================================
        // 6. DOCUMENT
        // ==========================================
        if (hasDocument) {
            const buffer = await downloadMedia(inner.documentMessage, 'document', opts.downloader);
            if (buffer && buffer.length > 0) {
                await sock.sendMessage(targetInbox, {
                    document: buffer,
                    mimetype: inner.documentMessage.mimetype || 'application/octet-stream',
                    fileName: inner.documentMessage.fileName || 'saved_file'
                });
                return true;
            }
        }

    } catch (err) {
        console.error('[SilentMediaSaver Error]:', err.message);
    }

    return false;
}

module.exports = {
    isSilentSaveTrigger,
    unwrapMessage,
    handleSilentSave
};
