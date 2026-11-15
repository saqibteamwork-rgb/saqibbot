// commands/pair.js
const fs = require('fs-extra');
const path = require('path');
const { getBinaryNodeChild, getBinaryNodeChildren } = require('@whiskeysockets/baileys');

async function resolvePhoneNumberFromLid(sock, lidJid) {
    if (!lidJid) return null;
    const lidUser = lidJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (!lidUser) return null;

    // 1. Check signalRepository in Baileys
    try {
        if (sock?.signalRepository?.lidMapping?.getPNForLID) {
            const pn = await sock.signalRepository.lidMapping.getPNForLID(lidJid.includes('@') ? lidJid : `${lidJid}@lid`);
            if (pn) {
                const num = String(pn).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                if (num.length >= 10 && num.length <= 13) return num;
            }
        }
    } catch (e) {}

    // 2. Direct lookup in auth_info session folders (lid-mapping-<lid>_reverse.json)
    try {
        const authBase = path.join(__dirname, '..', 'auth_info');
        if (fs.existsSync(authBase)) {
            const dirs = fs.readdirSync(authBase);
            for (const d of dirs) {
                const filePath = path.join(authBase, d, `lid-mapping-${lidUser}_reverse.json`);
                if (fs.existsSync(filePath)) {
                    const content = fs.readJsonSync(filePath);
                    if (content) {
                        const num = String(content).replace(/[^0-9]/g, '');
                        if (num.length >= 10 && num.length <= 13) return num;
                    }
                }
            }
        }
    } catch (e) {}

    // 3. Direct lookup in authState keys
    try {
        if (sock?.authState?.keys?.get) {
            const res = await sock.authState.keys.get('lid-mapping', [`${lidUser}_reverse`]);
            if (res && res[`${lidUser}_reverse`]) {
                const num = String(res[`${lidUser}_reverse`]).replace(/[^0-9]/g, '');
                if (num.length >= 10 && num.length <= 13) return num;
            }
        }
    } catch (e) {}

    return null;
}

async function resolveTargetNumber(sock, from, msg, args) {
    // 1. Explicit phone number in arguments (e.g. .pair 923001234567 or .pair +92 300 1234567)
    const rawArg = args.join(' ').trim().replace(/[^0-9]/g, '');
    if (rawArg && rawArg.length >= 10 && rawArg.length <= 13) {
        return { number: rawArg, source: 'arg' };
    }

    // 2. Mentioned user (e.g. .pair @user)
    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    // 3. Quoted message participant (replying to a user's message with .pair)
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

    // 4. Sender of this message
    const senderJid = msg.key.participant || from;

    const candidateJid = mentionedJid || quotedParticipant || senderJid;
    if (!candidateJid) return { number: null, error: 'no_jid' };

    const baseJid = candidateJid.split(':')[0] + (candidateJid.includes('@') ? '@' + candidateJid.split('@')[1] : '');

    // If candidateJid is directly a standard phone number JID (@s.whatsapp.net)
    if (baseJid.endsWith('@s.whatsapp.net')) {
        const num = baseJid.split('@')[0].replace(/[^0-9]/g, '');
        if (num && num.length >= 10 && num.length <= 13) {
            return { number: num, jid: baseJid, source: 'direct_jid' };
        }
    }

    // If candidateJid is an LID (e.g. @lid) - resolve from LID reverse mapping!
    const fromLid = await resolvePhoneNumberFromLid(sock, candidateJid);
    if (fromLid) {
        return { number: fromLid, jid: `${fromLid}@s.whatsapp.net`, source: 'lid_reverse' };
    }

    // In a group, WhatsApp frequently sends an internal LID (e.g. 251655740244113@lid).
    // We query group stanza to map the LID to the user's real phone number!
    const isGroup = from.endsWith('@g.us');
    if (isGroup) {
        const candidateClean = candidateJid.split(':')[0].replace(/@.*/, '');

        // Step A: Direct raw binary query for maximum reliability (bypasses any library caching or dropping)
        try {
            if (typeof sock.query === 'function') {
                const res = await sock.query({
                    tag: 'iq',
                    attrs: { type: 'get', xmlns: 'w:g2', to: from },
                    content: [{ tag: 'query', attrs: { request: 'interactive' } }]
                });
                const groupNode = getBinaryNodeChild(res, 'group');
                if (groupNode) {
                    const participantNodes = getBinaryNodeChildren(groupNode, 'participant');
                    for (const p of participantNodes) {
                        const a = p.attrs || {};
                        const jidClean = String(a.jid || '').split(':')[0].replace(/@.*/, '');
                        const lidClean = String(a.lid || '').split(':')[0].replace(/@.*/, '');
                        if (jidClean === candidateClean || lidClean === candidateClean) {
                            const pn = a.phone_number || (String(a.jid || '').endsWith('@s.whatsapp.net') ? a.jid : null);
                            if (pn) {
                                const cleanNum = String(pn).split('@')[0].replace(/[^0-9]/g, '');
                                if (cleanNum.length >= 10 && cleanNum.length <= 13) {
                                    return { number: cleanNum, jid: `${cleanNum}@s.whatsapp.net`, source: 'raw_iq' };
                                }
                            }
                        }
                    }
                }
            }
        } catch (rawErr) {
            console.error('[pair] raw query error:', rawErr.message);
        }

        // Step B: Use sock.groupMetadata as fallback
        try {
            if (typeof sock.groupMetadata === 'function') {
                const meta = await sock.groupMetadata(from);
                const participant = meta.participants.find(p => {
                    const pIdClean = String(p.id || '').split(':')[0].replace(/@.*/, '');
                    const pLidClean = String(p.lid || '').split(':')[0].replace(/@.*/, '');
                    return pIdClean === candidateClean || pLidClean === candidateClean;
                });

                if (participant) {
                    if (participant.phoneNumber) {
                        const num = participant.phoneNumber.split('@')[0].replace(/[^0-9]/g, '');
                        if (num && num.length >= 10 && num.length <= 13) {
                            return { number: num, jid: `${num}@s.whatsapp.net`, source: 'group_pn' };
                        }
                    }
                    if (participant.id && participant.id.endsWith('@s.whatsapp.net')) {
                        const num = participant.id.split('@')[0].replace(/[^0-9]/g, '');
                        if (num && num.length >= 10 && num.length <= 13) {
                            return { number: num, jid: participant.id, source: 'group_id' };
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[pair] groupMetadata lookup failed:', e.message);
        }
    }

    // Step C: Check all participating groups if user is in any group with the bot
    try {
        if (typeof sock.groupFetchAllParticipating === 'function') {
            const allGroups = await sock.groupFetchAllParticipating();
            const candidateClean = candidateJid.split(':')[0].replace(/@.*/, '');
            for (const g of Object.values(allGroups)) {
                const p = g.participants?.find(x => {
                    const xId = String(x.id || '').split(':')[0].replace(/@.*/, '');
                    const xLid = String(x.lid || '').split(':')[0].replace(/@.*/, '');
                    return xId === candidateClean || xLid === candidateClean;
                });
                if (p) {
                    if (p.phoneNumber) {
                        const num = p.phoneNumber.split('@')[0].replace(/[^0-9]/g, '');
                        if (num.length >= 10 && num.length <= 13) return { number: num, jid: `${num}@s.whatsapp.net`, source: 'all_groups_pn' };
                    }
                    if (p.id && p.id.endsWith('@s.whatsapp.net')) {
                        const num = p.id.split('@')[0].replace(/[^0-9]/g, '');
                        if (num.length >= 10 && num.length <= 13) return { number: num, jid: p.id, source: 'all_groups_id' };
                    }
                }
            }
        }
    } catch {}

    // Step D: Fallback to argument if present
    if (rawArg && rawArg.length >= 10 && rawArg.length <= 14) {
        return { number: rawArg, source: 'arg_fallback' };
    }

    return {
        number: null,
        isLid: baseJid.endsWith('@lid') || candidateJid.includes('@lid'),
        jid: candidateJid
    };
}

async function pairCommand(sock, from, msg, args, isOwner, isAdmin, sessions, BotSession, botData, saveBotData) {
    const isGroup = from.endsWith('@g.us');
    const senderJid = msg.key.participant || from;

    const resolved = await resolveTargetNumber(sock, from, msg, args);

    if (!resolved.number) {
        if (resolved.isLid) {
            await sock.sendMessage(from, {
                text:
                    `⚠️ *Phone Number Auto-Detect Nahi Ho Saka*\n\n` +
                    `WhatsApp Privacy (LID) ki wajah se aapka real phone number detect nahi hua.\n\n` +
                    `👉 *Aasan Hal:*\n` +
                    `Apna WhatsApp number sath likh kar send karein:\n` +
                    `*.pair 923001234567*`,
                mentions: [senderJid]
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(from, {
            text:
                `╭━━━〔 🔑 *MR SAQIB MD — PAIRING CODE* 〕━━━┈⊷\n` +
                `┃ 📌 *Usage:*\n` +
                `┃ .pair <phone number with country code>\n` +
                `┃ \n` +
                `┃ 💡 *Example:*\n` +
                `┃ .pair 923176263788\n` +
                `┃ \n` +
                `┃ ⚡ Yeh command aapko WhatsApp pairing code\n` +
                `┃    generate karke degi jisse aap apna\n` +
                `┃    WhatsApp number bot ke sath link kar sakte hain!\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`,
            mentions: [senderJid]
        }, { quoted: msg });
        return;
    }

    const targetNumber = resolved.number;
    const targetJid = `${targetNumber}@s.whatsapp.net`;

    // Check if session is already connected
    if (sessions[targetNumber]?.isConnected) {
        await sock.sendMessage(from, {
            text: `✅ Number *+${targetNumber}* pehle se connected aur active hai!`,
            mentions: [senderJid, targetJid]
        }, { quoted: msg });
        return;
    }

    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
    await sock.sendMessage(from, {
        text: `⏳ *+${targetNumber}* ke liye pairing code generate ho raha hai...\nKuch second intezar karein.`,
        mentions: [senderJid, targetJid]
    }, { quoted: msg });

    try {
        if (!sessions[targetNumber]) {
            sessions[targetNumber] = new BotSession(targetNumber);
        }

        if (!botData.statusSettings[targetNumber]) {
            botData.statusSettings[targetNumber] = {
                autoStatus: false,
                autoSeen: false,
                autoLike: false,
                autoDownload: false,
                isPublic: false
            };
            if (typeof saveBotData === 'function') saveBotData();
        }

        const session = sessions[targetNumber];
        if (session.sock) {
            try { session.sock.end(); } catch (e) {}
            session.sock = null;
        }
        session.isInitializing = false;
        try { await fs.remove(session.authPath); } catch (e) {}

        const code = await session.initialize(targetNumber);

        if (!code) {
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            await sock.sendMessage(from, {
                text: `❌ *+${targetNumber}* Pairing code receive nahi hua. Baraye meharbani dubara try karein.`,
                mentions: [senderJid, targetJid]
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(from, { react: { text: '🔑', key: msg.key } }).catch(() => {});

        const cleanCode = code.replace(/[^A-Za-z0-9]/g, '');
        const formattedCode = code.includes('-') ? code : (code.match(/.{1,4}/g)?.join('-') || code);

        const mentionHeader = isGroup ? `👋 @${targetNumber} — Aapka pairing code aa gaya hai!\n\n` : '';
        const resultText =
            mentionHeader +
            `╭━━━〔 🔑 *PAIRING CODE GENERATED* 〕━━━┈⊷\n` +
            `┃ 👤 *Target User:* @${targetNumber}\n` +
            `┃ 📱 *Number:* +${targetNumber}\n` +
            `┃ \n` +
            `┃ 🔑 *Code:* \`${formattedCode}\`\n` +
            `┃ \n` +
            `┃ 📌 *Kaise link karein:*\n` +
            `┃ 1. WhatsApp open karein > Linked Devices\n` +
            `┃ 2. "Link a Device" dabayein\n` +
            `┃ 3. "Link with phone number instead" chunein\n` +
            `┃ 4. Niche diya gaya code enter karein:\n` +
            `┃    👉 \`${cleanCode}\`\n` +
            `┃ \n` +
            `┃ ⏰ Code 60 seconds ke liye valid hai!\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `📋 *Niche diye gaye message par 1-tap karein code copy karne ke liye!* 👇\n\n` +
            `🚀 *Powered by MR SAQIB MD*`;

        // 1. Send the main card directly in the group/chat with user tag
        await sock.sendMessage(from, {
            text: resultText,
            mentions: [targetJid, senderJid]
        }, { quoted: msg });

        // 2. Send clean 1-tap copy code message directly in the group/chat
        await sock.sendMessage(from, {
            text: `${cleanCode}`
        }, { quoted: msg });

        // Note: Per user request, code is sent directly in GC with @mention and NOT sent to private inbox/DM.
    } catch (err) {
        console.error('[pairCommand Error]', err);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, {
            text: `❌ *+${targetNumber}* Pairing code error: ${err.message}`,
            mentions: [senderJid, targetJid]
        }, { quoted: msg });
    }
}

pairCommand.resolvePhoneNumberFromLid = resolvePhoneNumberFromLid;
module.exports = pairCommand;
