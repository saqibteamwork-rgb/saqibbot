// commands/dp.js
'use strict';

/**
 * MR SAQIB MD :: ADVANCED PROFILE PICTURE (.dp / .getpp / .pfp) ENGINE
 * ============================================================================
 * - Works with .dp AND .getpp seamlessly
 * - Fetches 100% Full HD profile pictures (Image & Preview fallback)
 * - Supports Quoted replies (Text, Image, Video, Audio, Sticker, Ephemeral, View-Once)
 * - Supports Group DP (.dp group / .getpp group / .gpp)
 * - Supports Phone Numbers (.dp 03468616487 / .dp 923468616487 / +92 346 8616487)
 * - Supports Mentions (.dp @user / .getpp @user)
 * - Supports Self DP (typing .dp / .getpp with no args)
 * - Full WhatsApp LID-to-Phone JID resolution (zero 401 privacy failures)
 * - Dual Delivery Engine: Buffer download + Direct WhatsApp CDN URL streaming fallback
 * - Shows WhatsApp Status / About & Business Profile metadata
 * - Branded with Official Mr SAQIB Channel Badge
 * ============================================================================
 */

const axios = require('axios');
const { getProfilePictureUrl, resolveLidFast } = require('../utils/pfpFetcher');
const { resolvePhoneNumberFromLid } = require('./pair');
const settings = require('../settings');

function getContextInfo(msg) {
    if (!msg || !msg.message) return null;
    const m = msg.message?.ephemeralMessage?.message ||
              msg.message?.viewOnceMessage?.message ||
              msg.message?.viewOnceMessageV2?.message ||
              msg.message?.viewOnceMessageV2Extension?.message ||
              msg.message?.documentWithCaptionMessage?.message ||
              msg.message;
    if (!m) return null;
    return m.extendedTextMessage?.contextInfo ||
           m.imageMessage?.contextInfo ||
           m.videoMessage?.contextInfo ||
           m.audioMessage?.contextInfo ||
           m.documentMessage?.contextInfo ||
           m.stickerMessage?.contextInfo ||
           m.contactMessage?.contextInfo ||
           m.locationMessage?.contextInfo ||
           null;
}

function cleanJid(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const parts = raw.split('@');
    const user = parts[0].split(':')[0].trim();
    const server = parts[1] || 's.whatsapp.net';
    return `${user}@${server}`;
}

async function dpCommand(sock, from, msg, args = []) {
    try {
        let target = null;
        let isGroupTarget = false;

        const rawArgs = (args || []).map(a => String(a).trim()).filter(Boolean);
        const fullArgText = rawArgs.join(' ').toLowerCase();

        // 1. Group DP check (.dp group / .getpp group / .dp gc / .gpp)
        if (['group', 'gc', 'groupdp', 'gpp'].includes(fullArgText) || fullArgText === 'group' || fullArgText === 'gc') {
            if (!from.endsWith('@g.us')) {
                return await sock.sendMessage(from, { text: "❌ Yeh command sirf groups mein group DP nikalne ke liye hai." }, { quoted: msg });
            }
            target = from;
            isGroupTarget = true;
        }

        const ctx = getContextInfo(msg);

        // 2. Phone number in args (e.g. .dp 03468616487 or .getpp 923468616487)
        if (!target && rawArgs.length > 0) {
            const combinedDigits = rawArgs.join('').replace(/[^0-9]/g, '');
            if (combinedDigits.length >= 7 && combinedDigits.length <= 15) {
                let cleanNumber = combinedDigits;
                if (cleanNumber.startsWith('03') && cleanNumber.length === 11) {
                    cleanNumber = '92' + cleanNumber.slice(1);
                }
                target = `${cleanNumber}@s.whatsapp.net`;
            }
        }

        // 3. Mentions (@user)
        if (!target && ctx?.mentionedJid && ctx.mentionedJid.length > 0) {
            target = ctx.mentionedJid[0];
        }

        // 4. Quoted message author (Reply to any message)
        if (!target && ctx) {
            const hasQuoted = Boolean(ctx.quotedMessage);
            if (hasQuoted) {
                if (ctx.participant) {
                    target = ctx.participant;
                } else if (ctx.remoteJid && !ctx.remoteJid.endsWith('@g.us')) {
                    target = ctx.remoteJid;
                } else if (!from.endsWith('@g.us')) {
                    target = from;
                }
            }
        }

        // 5. Default fallback to sender's own DP
        if (!target) {
            if (from.endsWith('@g.us')) {
                target = msg.key?.participant || msg.participant || from;
            } else {
                target = msg.key?.fromMe ? (sock.user?.id || from) : from;
            }
        }

        if (!target) target = from;

        target = cleanJid(target);

        // Handle LID vs Phone JID resolution
        let targetPhoneJid = null;
        let targetLid = null;
        let displayPhone = '';

        if (isGroupTarget) {
            targetPhoneJid = from;
        } else if (target.endsWith('@lid')) {
            targetLid = target;
            try {
                const resolvedNum = await resolvePhoneNumberFromLid(sock, targetLid);
                if (resolvedNum) {
                    targetPhoneJid = `${resolvedNum}@s.whatsapp.net`;
                    displayPhone = resolvedNum;
                }
            } catch (_) {}
        } else if (target.endsWith('@s.whatsapp.net')) {
            targetPhoneJid = target;
            displayPhone = target.split('@')[0];
            try {
                const fastLid = resolveLidFast(displayPhone);
                if (fastLid) targetLid = fastLid;
            } catch (_) {}
        }

        const candidateInputs = [targetPhoneJid, targetLid, target].filter(Boolean);

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        console.log(`[DP] Fetching DP for target: ${target} (isGroup: ${isGroupTarget}, candidateInputs: ${candidateInputs.join(', ')})`);

        // Fetch DP URL (Native Baileys + Raw IQ + Multi-Session fallback)
        const pfpResult = await getProfilePictureUrl(sock, candidateInputs);

        if (!pfpResult || !pfpResult.url) {
            await sock.sendMessage(from, { react: { text: '🔒', key: msg.key } }).catch(() => {});
            const targetDisplay = isGroupTarget ? "iss Group" : (displayPhone ? `@${displayPhone}` : "is user");
            return await sock.sendMessage(from, {
                text: 
`⚠️ *Profile Picture Not Available*

${isGroupTarget ? "Iss group par koi DP nahi lagi hui." : `User ${targetDisplay} ne apni WhatsApp profile picture hide kar rakhi hai ya koi DP nahi lagai hui.`}

🔒 _WhatsApp Privacy Settings ki wajah se DP load nahi ho saki._`,
                mentions: (isGroupTarget || !targetPhoneJid) ? [] : [targetPhoneJid]
            }, { quoted: msg });
        }

        // Try downloading image as buffer, with fallback to direct CDN URL
        let imageBuffer = null;
        try {
            const res = await axios.get(pfpResult.url, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                },
                timeout: 12000
            });
            if (res.data && res.data.length > 0) {
                imageBuffer = Buffer.from(res.data);
            }
        } catch (dlErr) {
            console.warn('[DP] Direct buffer download failed, will stream URL natively:', dlErr.message);
        }

        const imagePayload = (imageBuffer && imageBuffer.length > 0)
            ? imageBuffer
            : { url: pfpResult.url };

        // Fetch WhatsApp Status/About if available
        let aboutText = '';
        if (!isGroupTarget && targetPhoneJid) {
            try {
                const statusList = await sock.fetchStatus(targetPhoneJid).catch(() => null);
                const sObj = Array.isArray(statusList) ? statusList[0] : statusList;
                if (sObj && sObj.status) {
                    aboutText = `\n┃ 💬 *About:* ${String(sObj.status).slice(0, 100)}`;
                }
            } catch (_) {}
        }

        // Fetch WhatsApp Business metadata if target is a business account
        let bizDetails = '';
        if (!isGroupTarget && targetPhoneJid) {
            try {
                const bizRes = await sock.query({
                    tag: 'iq',
                    attrs: {
                        to: 's.whatsapp.net',
                        type: 'get',
                        xmlns: 'w:biz'
                    },
                    content: [{
                        tag: 'business_profile',
                        attrs: { v: '244' },
                        content: [{ tag: 'profile', attrs: { jid: targetPhoneJid } }]
                    }]
                }, 3000).catch(() => null);

                if (bizRes) {
                    const { getBinaryNodeChild } = require('@whiskeysockets/baileys');
                    const bProfile = getBinaryNodeChild(bizRes, 'business_profile');
                    const profileNode = getBinaryNodeChild(bProfile, 'profile');
                    if (profileNode) {
                        const desc = getBinaryNodeChild(profileNode, 'description')?.content?.toString();
                        const cat = getBinaryNodeChild(profileNode, 'category')?.content?.toString();
                        const email = getBinaryNodeChild(profileNode, 'email')?.content?.toString();
                        const website = getBinaryNodeChild(profileNode, 'website')?.content?.toString();

                        let bParts = [];
                        if (desc) bParts.push(`📝 *Bio:* ${desc.slice(0, 80)}`);
                        if (cat) bParts.push(`🏢 *Category:* ${cat}`);
                        if (email) bParts.push(`✉️ *Email:* ${email}`);
                        if (website) bParts.push(`🌐 *Web:* ${website}`);

                        if (bParts.length > 0) {
                            bizDetails = `\n┃\n┃ 💼 *WhatsApp Business Account:*\n┃ ` + bParts.join('\n┃ ');
                        }
                    }
                }
            } catch (_) {}
        }

        // Resolve Group Name if group
        let groupName = from;
        if (isGroupTarget) {
            try {
                const meta = await sock.groupMetadata(from).catch(() => null);
                if (meta?.subject) groupName = meta.subject;
            } catch (_) {}
        }

        const channelBadge = {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: settings.newsletterJid || '120363431913895899@newsletter',
                newsletterName: settings.channelName || 'Mr SAQIB',
                serverMessageId: -1
            }
        };

        const caption = isGroupTarget
            ? `╭━━━〔 🖼️ *GROUP DISPLAY PICTURE* 〕━━━┈⊷\n` +
              `┃ 🏷️ *Group:* ${groupName}\n` +
              `┃ 🆔 *JID:* \`${from}\`\n` +
              `┃ ✨ *Quality:* 100% Full HD (${pfpResult.quality || 'HD'})\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ*`
            : `╭━━━〔 🖼️ *USER DISPLAY PICTURE* 〕━━━┈⊷\n` +
              `┃ 👤 *User:* ${displayPhone ? `@${displayPhone}` : 'User'}\n` +
              (displayPhone ? `┃ 📱 *Number:* +${displayPhone}\n` : '') +
              `┃ ✨ *Quality:* 100% Full HD (${pfpResult.quality || 'HD'})${aboutText}${bizDetails}\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ sᴀǫɪʙ ᴍᴅ*`;

        await sock.sendMessage(
            from,
            {
                image: imagePayload,
                caption: caption,
                mentions: (isGroupTarget || !targetPhoneJid) ? [] : [targetPhoneJid],
                contextInfo: channelBadge
            },
            { quoted: msg }
        );

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

    } catch (e) {
        console.error('[DP Command Error]:', e);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
}

module.exports = dpCommand;
