'use strict';

/**
 * MR SAQIB MD :: SILENT MEDIA & STATUS SAVER (PRO ENGINE)
 * ============================================================================
 * Silently saves WhatsApp Status and View-Once Media (Images, Videos, Voice notes)
 * directly into the user's personal inbox (Message Yourself / Saved Messages)
 * or chat when replying with trigger words or emojis WITHOUT needing any dot (.)!
 *
 * Supported Triggers (WITHOUT DOT OR WITH DOT):
 * - Words: nice, good, acha, okay, ok, okk, k, axha, accha, achha, gud, nyc,
 *          mast, zabardast, super, superb, wow, osm, awesome, best, perfect,
 *          sahi, khoob, pyara, khoobsurat, great, fire, dil, heart, broken,
 *          save, send, bhejo, bhej, bhej do, pls send, plz send, vv, once, viewonce, status
 * - Emojis: ❤️, 💔, 💖, 💗, 💓, 💞, 💕, ❣️, 🖤, 🤍, 🤎, 💜, 💙, 💚, 💛, 🧡,
 *           👍, 🔥, 😍, 🥰, 🥺, 😭, 😢, 👏, ✨, ⭐, 💯, 🌹, 🌸, 👌, 🤲
 *
 * Features:
 * - 100% Zero dot (.) needed! Just reply "nice", "good", "acha", "okay" or "❤️".
 * - View-Once image/video unlocks instantly and delivers to Inbox.
 * - WhatsApp Status photo/video saves instantly to Inbox.
 * - Deep multi-layer unwrapping (ephemeral + viewOnce + viewOnceV2).
 * - Reaction confirmation (⚡) so user knows media was successfully saved!
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

    // 2. Normalized clean text (remove prefixes like . ! / # and punctuation)
    const lower = clean.toLowerCase()
        .replace(/^[.#!/?]/, '')
        .replace(/[.,!?;:'"~`_@#$%^&*()-]/g, ' ')
        .trim();

    // Exact trigger words
    const exactWords = new Set([
        // Okay variations
        'ok', 'okay', 'okk', 'okey', 'oke', 'k', 'ok ji', 'okay ji', 'ok yaar', 'okay yar', 'ok bro',
        // Feedback / appreciation words
        'good', 'gud', 'nice', 'nyc', 'nyce', 'sad', 'so sad', 'very sad',
        'acha', 'achha', 'axha', 'accha', 'acha ha', 'acha hai', 'bohot acha', 'bohat acha', 'bht acha', 'buht acha',
        'sahi', 'sahii', 'mast', 'zabardast', 'zbrdst', 'khoob', 'bohot khoob', 'pyara', 'khoobsurat', 'khubsurat',
        'great', 'super', 'superb', 'wow', 'beautiful', 'osm', 'awesome', 'perfect', 'best', 'fire',
        'thanks', 'thx', 'tq', 'thank you', 'thank u',
        // Emojis written as words
        'heart', 'red heart', 'rd heart', 'broken heart', 'broken', 'dil', 'toota dil', 'tuta dil',
        // Save / download intent
        'save', 'saveme', 'saved', 'send', 'sendme', 'send me', 'bhejo', 'bhej', 'bhej do', 'pls send', 'plz send', 'please send',
        'vv', 'viewonce', 'once', 'status', 'give', 'download', 'save status', 'status save'
    ]);

    if (exactWords.has(lower)) return true;

    // Phrase root check (e.g. "nice photo", "good one", "acha laga", "send please", "bhejo na")
    const words = lower.split(/\s+/).filter(Boolean);
    if (words.length <= 6) {
        const keyRoots = [
            'good', 'gud', 'nice', 'nyc', 'sad', 'thanks', 'thx',
            'acha', 'axha', 'achha', 'accha', 'okay', 'ok', 'okk',
            'heart', 'broken', 'dil', 'save', 'bhejo', 'bhej', 'send',
            'vv', 'once', 'viewonce', 'status', 'mast', 'zabardast', 'superb', 'osm'
        ];
        if (words.some(w => keyRoots.includes(w))) {
            return true;
        }
    }

    return false;
}

/**
 * Completely unwraps view-once, ephemeral, and document wrappers from a message
 */
function unwrapMessage(msg) {
    if (!msg || typeof msg !== 'object') return { inner: null, isViewOnce: false };
    let inner = msg;
    let isViewOnce = false;

    // Deep recursive unwrap
    let unwrapped = true;
    let depth = 0;
    while (unwrapped && depth < 10) {
        unwrapped = false;
        depth++;
        if (inner.ephemeralMessage?.message) {
            inner = inner.ephemeralMessage.message;
            unwrapped = true;
        }
        if (inner.viewOnceMessage?.message) {
            isViewOnce = true;
            inner = inner.viewOnceMessage.message;
            unwrapped = true;
        }
        if (inner.viewOnceMessageV2?.message) {
            isViewOnce = true;
            inner = inner.viewOnceMessageV2.message;
            unwrapped = true;
        }
        if (inner.viewOnceMessageV2Extension?.message) {
            isViewOnce = true;
            inner = inner.viewOnceMessageV2Extension.message;
            unwrapped = true;
        }
        if (inner.documentWithCaptionMessage?.message) {
            inner = inner.documentWithCaptionMessage.message;
            unwrapped = true;
        }
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
    const isGroup = from.endsWith('@g.us');

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

    // Check if silent save is explicitly disabled in settings
    const userSettings = botData?.statusSettings?.[userId];
    if (userSettings && userSettings.silentSave === false) {
        return false;
    }

    // Detect if this is replying to a WhatsApp Status
    const isStatusReply = contextInfo?.remoteJid === 'status@broadcast' ||
                          contextInfo?.participant === 'status@broadcast' ||
                          from === 'status@broadcast';

    // Unwrap quoted message completely
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

    // If it's not a status, not a view-once, and has no media, ignore
    if (!isStatusReply && !isViewOnce && !hasImage && !hasVideo && !hasAudio && !hasSticker && !hasDocument) {
        return false;
    }

    // Determine Bot User's own "Message Yourself" JID
    const botUserJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;

    // Target Destinations:
    // 1. If isMe (bot owner replied from their phone): Send to botUserJid (their own inbox)
    // 2. If !isMe and in Private Chat (DM): Send to `from` (the person chatting), plus copy to botUserJid!
    // 3. If in Group Chat: Send SILENTLY to botUserJid (never spam the group)
    const primaryInbox = isMe
        ? botUserJid
        : (!isGroup ? from : botUserJid);

    if (!primaryInbox && !botUserJid) {
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

    // Give subtle reaction confirmation on the reply message
    try {
        await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});
    } catch {}

    try {
        // ==========================================
        // 1. IMAGE (View-Once or Status or Regular)
        // ==========================================
        if (hasImage) {
            const buffer = await downloadMedia(inner.imageMessage, 'image', opts.downloader);
            if (buffer && buffer.length > 0) {
                const origCaption = inner.imageMessage.caption ? `\n┃ 💬 *Caption:* ${inner.imageMessage.caption}` : '';
                const tag = isViewOnce ? '🔓 *VIEW-ONCE PHOTO SAVED*' : (isStatusReply ? '📥 *STATUS PHOTO SAVED*' : '📥 *PHOTO SAVED*');
                const caption =
`╭━━━〔 ${tag} 〕━━━┈⊷
┃ 👤 *From:* ${senderDisplay}${origCaption}
┃ ⚡ *Trigger:* \`${triggerText.slice(0, 30)}\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved by MR SAQIB MD*`;

                // Deliver to primary inbox
                await sock.sendMessage(primaryInbox, {
                    image: buffer,
                    caption,
                    mimetype: inner.imageMessage.mimetype || 'image/jpeg'
                });

                // If in DM from someone else, also save a copy in bot owner's own inbox
                if (!isMe && botUserJid && primaryInbox !== botUserJid) {
                    await sock.sendMessage(botUserJid, {
                        image: buffer,
                        caption: caption + '\n📌 *(Auto-Backup to Bot Owner)*',
                        mimetype: inner.imageMessage.mimetype || 'image/jpeg'
                    }).catch(() => {});
                }
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
                const tag = isViewOnce ? '🔓 *VIEW-ONCE VIDEO SAVED*' : (isStatusReply ? '📥 *STATUS VIDEO SAVED*' : '📥 *VIDEO SAVED*');
                const caption =
`╭━━━〔 ${tag} 〕━━━┈⊷
┃ 👤 *From:* ${senderDisplay}${origCaption}
┃ ⚡ *Trigger:* \`${triggerText.slice(0, 30)}\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved by MR SAQIB MD*`;

                await sock.sendMessage(primaryInbox, {
                    video: buffer,
                    caption,
                    mimetype: inner.videoMessage.mimetype || 'video/mp4'
                });

                if (!isMe && botUserJid && primaryInbox !== botUserJid) {
                    await sock.sendMessage(botUserJid, {
                        video: buffer,
                        caption: caption + '\n📌 *(Auto-Backup to Bot Owner)*',
                        mimetype: inner.videoMessage.mimetype || 'video/mp4'
                    }).catch(() => {});
                }
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

                await sock.sendMessage(primaryInbox, {
                    audio: buffer,
                    mimetype: inner.audioMessage.mimetype || 'audio/mp4',
                    ptt: isPtt
                });

                await sock.sendMessage(primaryInbox, {
                    text:
`╭━━━〔 ${tag} 〕━━━┈⊷
┃ 👤 *From:* ${senderDisplay}
┃ 🎵 *Type:* ${isPtt ? 'Voice Note (PTT)' : 'Audio'}
┃ ⚡ *Trigger:* \`${triggerText.slice(0, 30)}\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved by MR SAQIB MD*`
                });

                if (!isMe && botUserJid && primaryInbox !== botUserJid) {
                    await sock.sendMessage(botUserJid, {
                        audio: buffer,
                        mimetype: inner.audioMessage.mimetype || 'audio/mp4',
                        ptt: isPtt
                    }).catch(() => {});
                }
                return true;
            }
        }

        // ==========================================
        // 4. TEXT STATUS (Status Only)
        // ==========================================
        if (isStatusReply && textContent) {
            const caption =
`╭━━━〔 📥 *STATUS TEXT SAVED* 〕━━━┈⊷
┃ 👤 *From:* ${senderDisplay}
┃ 💬 *Text:* ${textContent}
┃ ⚡ *Trigger:* \`${triggerText.slice(0, 30)}\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved by MR SAQIB MD*`;

            await sock.sendMessage(primaryInbox, { text: caption });
            return true;
        }

        // ==========================================
        // 5. STICKER
        // ==========================================
        if (hasSticker) {
            const buffer = await downloadMedia(inner.stickerMessage, 'sticker', opts.downloader);
            if (buffer && buffer.length > 0) {
                await sock.sendMessage(primaryInbox, { sticker: buffer });
                return true;
            }
        }

        // ==========================================
        // 6. DOCUMENT
        // ==========================================
        if (hasDocument) {
            const buffer = await downloadMedia(inner.documentMessage, 'document', opts.downloader);
            if (buffer && buffer.length > 0) {
                await sock.sendMessage(primaryInbox, {
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
