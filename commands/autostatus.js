'use strict';

const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

/**
 * High-performance Status Update Handler
 * - Instant Auto-Seen via sock.readMessages([msg.key])
 * - Multi-method Auto-React (sendMessage with statusJidList + relayMessage fallback)
 * - Auto-Download to owner DM
 */
async function handleStatusUpdate(sock, m, botData, userId) {
    try {
        if (!sock || !sock.user) return;
        const settings = botData?.statusSettings?.[userId];
        if (!settings) return;

        const shouldSeen = !!(settings.autoSeen || settings.autoStatus);
        const shouldLike = !!(settings.autoLike || settings.autoReact);
        const shouldDownload = !!settings.autoDownload;

        if (!shouldSeen && !shouldLike && !shouldDownload) return;

        // Support single message or batch upsert
        const msgs = (m && Array.isArray(m.messages)) ? m.messages : (m ? [m] : []);

        for (const msg of msgs) {
            if (!msg || !msg.key) continue;
            const from = msg.key.remoteJid;
            if (from !== 'status@broadcast' && !msg.broadcast) continue;

            const participant = msg.key.participant || msg.participant;
            if (!participant) continue;

            // 1. Auto Seen (Instant Read)
            if (shouldSeen) {
                try {
                    await sock.readMessages([msg.key]);
                    console.log(`[AutoStatus] 👁️ Viewed status from ${participant.split('@')[0]}`);
                } catch (seenErr) {
                    console.error('[AutoStatus Seen Error]:', seenErr.message);
                }
            }

            // 2. Auto Like / React (Status Reaction)
            if (shouldLike) {
                const emojis = (settings.statusEmojis && settings.statusEmojis.length > 0)
                    ? settings.statusEmojis
                    : ['❤️', '🔥', '✨', '✅', '🙌', '🌟', '😍', '💚', '🌸', '💯'];
                const emoji = emojis[Math.floor(Math.random() * emojis.length)];

                try {
                    // Method 1: Baileys direct status react
                    await sock.sendMessage('status@broadcast', {
                        react: {
                            text: emoji,
                            key: msg.key
                        }
                    }, {
                        statusJidList: [participant]
                    });
                    console.log(`[AutoStatus] 💖 Reacted ${emoji} to status from ${participant.split('@')[0]}`);
                } catch (e1) {
                    // Method 2: Clean relayMessage fallback
                    try {
                        await sock.relayMessage('status@broadcast', {
                            reactionMessage: {
                                key: {
                                    remoteJid: 'status@broadcast',
                                    id: msg.key.id,
                                    participant: participant,
                                    fromMe: false
                                },
                                text: emoji
                            }
                        }, {
                            statusJidList: [participant]
                        });
                        console.log(`[AutoStatus Relay] 💖 Reacted ${emoji} to status from ${participant.split('@')[0]}`);
                    } catch (e2) {
                        console.error('[AutoStatus React Error]:', e2.message);
                    }
                }
            }

            // 3. Auto Download (Send to owner DM)
            if (shouldDownload) {
                const ownerJid = jidNormalizedUser(sock.user.id);
                const messageContent = msg.message?.ephemeralMessage?.message || 
                                     msg.message?.viewOnceMessage?.message || 
                                     msg.message?.viewOnceMessageV2?.message || 
                                     msg.message?.viewOnceMessageV2Extension?.message ||
                                     msg.message;
                
                if (!messageContent) continue;

                const type = Object.keys(messageContent).find(k => k.endsWith('Message')) || (messageContent.conversation ? 'conversation' : null);
                if (!type) continue;

                const pushName = msg.pushName || 'Unknown';
                const senderNumber = participant.split('@')[0];

                if (type === 'imageMessage' || type === 'videoMessage') {
                    try {
                        const mContent = messageContent[type];
                        if (mContent) {
                            const stream = await downloadContentFromMessage(mContent, type.replace('Message', ''));
                            let buffer = Buffer.from([]);
                            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                            
                            const caption = `📥 *Status Downloaded*\n👤 *From:* ${pushName}\n📱 *Number:* ${senderNumber}\n💬 *Caption:* ${mContent.caption || 'No caption'}`;
                            
                            if (type === 'imageMessage') {
                                await sock.sendMessage(ownerJid, { image: buffer, caption });
                            } else {
                                await sock.sendMessage(ownerJid, { video: buffer, caption });
                            }
                        }
                    } catch (e) {
                        console.error('Status Media Download Error:', e.message);
                    }
                } else if (type === 'conversation' || type === 'extendedTextMessage') {
                    const text = messageContent.conversation || messageContent.extendedTextMessage?.text;
                    if (text) {
                        const caption = `📥 *Status Text Downloaded*\n👤 *From:* ${pushName}\n📱 *Number:* ${senderNumber}\n\n*Content:* ${text}`;
                        await sock.sendMessage(ownerJid, { text: caption });
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in handleStatusUpdate:', error);
    }
}

module.exports = { handleStatusUpdate };
