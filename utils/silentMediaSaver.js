'use strict';

/**
 * MR SAQIB MD :: SILENT MEDIA & STATUS SAVER (PRO ENGINE)
 * ============================================================================
 * Silently saves WhatsApp Status and View-Once Media (Images, Videos, Voice notes)
 * DIRECTLY and ONLY into the user's personal inbox (Message Yourself / Saved Messages).
 *
 * CRITICAL PRIVACY & STEALTH RULES:
 * 1. STRICT USER GUARD: Only the Bot User themselves (from their paired phone, msg.key.fromMe)
 *    or Master Owner (923438673242) can trigger Silent Save!
 *    Any messages or replies from friends, contacts, or group members are 100% IGNORED!
 * 2. 100% SILENT IN CONTACT'S CHAT: Media is NEVER sent into the contact's chat (`from`),
 *    and NO reactions (⚡) are ever sent into the contact's chat. The contact's chat remains
 *    completely silent and undisturbed.
 * 3. NO SELF-STATUS LOOP: Replying to one's own status will not trigger auto-save.
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

    // Exact trigger words (Appreciation, praise, or save/send intent)
    // Casual conversational words like "ok", "okay", "k" are intentionally excluded to prevent accidental saves.
    const exactWords = new Set([
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
            'acha', 'axha', 'achha', 'accha',
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
    const { userId, botData } = opts;

    // 🛑 1. CRITICAL USER GUARD:
    // ONLY the Bot User themselves (sent from their paired phone, msg.key.fromMe === true)
    // OR Master Owner (923438673242) can trigger Silent Save!
    // If any other person, contact, friend, or group member chats or replies, IGNORE COMPLETELY!
    const isFromMe = Boolean(msg?.key?.fromMe || opts?.isMe);
    const senderDigits = String(opts?.senderDigits || '').replace(/[^0-9]/g, '');
    const isMasterOwner = Boolean(
        opts?.isMasterOwner ||
        senderDigits === '923438673242' ||
        senderDigits.endsWith('3438673242')
    );

    if (!isFromMe && !isMasterOwner) {
        return false;
    }

    // 🛑 2. Prevent duplicate processing
    const msgId = msg?.key?.id;
    if (msgId && processedSaveIds.has(msgId)) {
        return false;
    }

    // 🛑 3. Extract contextInfo and quotedMessage
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                        msg.message?.imageMessage?.contextInfo ||
                        msg.message?.videoMessage?.contextInfo ||
                        msg.message?.audioMessage?.contextInfo;
    const quoted = contextInfo?.quotedMessage;

    if (!quoted) {
        return false;
    }

    // 🛑 4. Check triggers
    const triggerText = text || msg.message?.extendedTextMessage?.text || msg.message?.reactionMessage?.text || '';
    if (!isSilentSaveTrigger(triggerText)) {
        return false;
    }

    // 🛑 5. Check if silent save is explicitly disabled in user settings
    const userSettings = botData?.statusSettings?.[userId];
    if (userSettings && userSettings.silentSave === false) {
        return false;
    }

    // 🛑 6. Determine Bot User's personal inbox JID ("Message Yourself" / Saved Messages)
    const botUserJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
    const masterJid = '923438673242@s.whatsapp.net';
    const targetInbox = (isMasterOwner && !isFromMe) ? masterJid : (botUserJid || masterJid);

    if (!targetInbox) {
        return false;
    }

    // 🛑 7. Detect if this is replying to a WhatsApp Status
    const isStatusReply = contextInfo?.remoteJid === 'status@broadcast' ||
                          contextInfo?.participant === 'status@broadcast' ||
                          from === 'status@broadcast';

    // If replying to user's OWN status, ignore (no need to save your own status to yourself)
    if (isStatusReply && contextInfo?.participant) {
        const participantDigits = String(contextInfo.participant).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const myDigits = String(targetInbox).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        if (myDigits && participantDigits && (participantDigits === myDigits || myDigits.endsWith(participantDigits) || participantDigits.endsWith(myDigits))) {
            return false;
        }
    }

    // 🛑 8. Unwrap quoted message completely
    const { inner, isViewOnce } = unwrapMessage(quoted);
    if (!inner) {
        return false;
    }

    // 🛑 9. Check media availability
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

    // Extract original status/media sender display
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

    // 🛑 10. SILENT CONTACT CHAT RULE:
    // Only send a reaction ⚡ if the user is in their OWN personal chat ("Message Yourself").
    // When replying to someone else's status or in a contact's DM, the contact's chat MUST BE 100% SILENT!
    const isSelfChat = (from === targetInbox);
    if (isSelfChat) {
        try {
            await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});
        } catch {}
    }

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

                // Deliver STRICTLY and ONLY to target personal inbox
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
                const tag = isViewOnce ? '🔓 *VIEW-ONCE VIDEO SAVED*' : (isStatusReply ? '📥 *STATUS VIDEO SAVED*' : '📥 *VIDEO SAVED*');
                const caption =
`╭━━━〔 ${tag} 〕━━━┈⊷
┃ 👤 *From:* ${senderDisplay}${origCaption}
┃ ⚡ *Trigger:* \`${triggerText.slice(0, 30)}\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved by MR SAQIB MD*`;

                // Deliver STRICTLY and ONLY to target personal inbox
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

                await sock.sendMessage(targetInbox, {
                    audio: buffer,
                    mimetype: inner.audioMessage.mimetype || 'audio/mp4',
                    ptt: isPtt
                });

                await sock.sendMessage(targetInbox, {
                    text:
`╭━━━〔 ${tag} 〕━━━┈⊷
┃ 👤 *From:* ${senderDisplay}
┃ 🎵 *Type:* ${isPtt ? 'Voice Note (PTT)' : 'Audio'}
┃ ⚡ *Trigger:* \`${triggerText.slice(0, 30)}\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *Saved by MR SAQIB MD*`
                });
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
