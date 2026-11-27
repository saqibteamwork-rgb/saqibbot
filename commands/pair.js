// commands/pair.js
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { getBinaryNodeChild, getBinaryNodeChildren } = require('@whiskeysockets/baileys');

const MINI_PAIR_ENDPOINTS = [
    process.env.MINI_PAIR_API || 'https://sigmamini.vercel.app/api/pair',
    process.env.MINI_BACKEND_URL ? `${process.env.MINI_BACKEND_URL.replace(/\/+$/, '')}/pair` : 'https://sigmaminibot-8fdafb0f00ef.herokuapp.com/pair'
];
const miniPairCooldown = new Map();

function normalizePairPhone(raw) {
    if (!raw) return '';
    let n = String(raw).replace(/[^0-9]/g, '');
    if (n.startsWith('00')) n = n.slice(2);
    else if (n.startsWith('0')) n = '92' + n.slice(1);
    else if (n.startsWith('3') && n.length === 10) n = '92' + n;
    return n;
}

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
    // 1. Explicit phone number in arguments (e.g. .pair 923001234567, 03001234567 or +92 300 1234567)
    const cleanArgs = (args || []).filter(a => !['force', '-f'].includes(String(a || '').toLowerCase()));
    const rawNumeric = cleanArgs.find(a => {
        const d = normalizePairPhone(a);
        return d.length >= 10 && d.length <= 15 && !/^[A-Za-z]/.test(String(a || '').trim());
    });
    const rawArg = normalizePairPhone(rawNumeric || cleanArgs.join(' ').trim());
    if (rawArg && rawArg.length >= 10 && rawArg.length <= 15) {
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
                isPublic: typeof botData?.globalSettings?.isPublic === 'boolean' ? botData.globalSettings.isPublic : true
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

        // Extract optional custom code from arguments if passed (e.g. .pair 923438673242 SAQ1BOT)
        const customCodeArg = args.find(a => {
            const clean = a.trim().replace(/[^A-Za-z0-9]/g, '');
            return clean.length === 8 && !/^\d+$/.test(clean);
        }) || null;

        const code = await session.initialize(targetNumber, customCodeArg);

        if (!code) {
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
            await sock.sendMessage(from, {
                text: `❌ *+${targetNumber}* Pairing code receive nahi hua. Baraye meharbani dubara try karein.`,
                mentions: [senderJid, targetJid]
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(from, { react: { text: '🔑', key: msg.key } }).catch(() => {});
        await sendPairingResultCard(sock, from, msg, targetNumber, code, {
            isGroup,
            senderJid,
            targetJid,
            headerTitle: '🔑 *PAIRING CODE GENERATED*',
            footerText: '🔥 Powered by MR SAQIB MD',
            webUrl: 'https://mrsaqib.me/pair',
            webLabel: '⚡ Main Bot Web',
            quickCmd: '.menu',
            quickLabel: '⚡ Bot Menu'
        });

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

async function sendPairingResultCard(sock, from, msg, targetNumber, code, opts = {}) {
    const {
        isGroup = from.endsWith('@g.us'),
        senderJid = msg.key.participant || from,
        targetJid = `${targetNumber}@s.whatsapp.net`,
        headerTitle = '🔑 *PAIRING CODE GENERATED*',
        footerText = '🔥 Powered by MR SAQIB MD',
        webUrl = 'https://mrsaqib.me/pair',
        webLabel = '🟢 WA Channel',
        quickCmd = '.menu',
        quickLabel = '⚡ Bot Menu'
    } = opts;

    let newsletterJid = '120363431913895899@newsletter';
    let newsletterName = 'SIGMA MD';
    try {
        const s = require('../settings');
        if (s?.newsletterJid) newsletterJid = s.newsletterJid;
        if (s?.botName) newsletterName = s.botName;
    } catch (_) {}

    const newsletterContextInfo = {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid,
            newsletterName,
            serverMessageId: 1
        }
    };

    const cleanCode = String(code).replace(/[^A-Za-z0-9]/g, '');
    const formattedCode = String(code).includes('-') ? String(code) : (cleanCode.match(/.{1,4}/g)?.join('-') || cleanCode);

    const mentionHeader = isGroup ? `👋 @${targetNumber} — Aapka pairing code aa gaya hai!\n\n` : '';
    const resultText =
        mentionHeader +
        `╭━━━〔 ${headerTitle} 〕━━━┈⊷\n` +
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
        `${footerText}`;

    let sentInteractive = false;
    try {
        const baileys = require('@whiskeysockets/baileys');
        const { proto, generateWAMessageFromContent } = baileys;
        const IM = proto.Message.InteractiveMessage;

        const buttons = [
            {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: '📋 Copy Pairing Code',
                    copy_code: cleanCode
                })
            },
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: webLabel,
                    url: webUrl,
                    merchant_url: webUrl
                })
            },
            {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: quickLabel,
                    id: quickCmd
                })
            }
        ];

        const interactive = IM.create({
            header: IM.Header.create({
                title: '🔑 WhatsApp Pairing Code',
                subtitle: `Code: ${cleanCode}`,
                hasMediaAttachment: false
            }),
            body: IM.Body.create({ text: resultText }),
            footer: IM.Footer.create({ text: footerText }),
            nativeFlowMessage: IM.NativeFlowMessage.create({
                buttons,
                messageVersion: 1
            }),
            contextInfo: newsletterContextInfo
        });

        const additionalNodes = [
            {
                tag: 'biz',
                attrs: {},
                content: [
                    {
                        tag: 'interactive',
                        attrs: { type: 'native_flow', v: '1' },
                        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                    }
                ]
            }
        ];

        const sendOpts = { userJid: sock.user?.id };
        if (msg && msg.key && msg.key.remoteJid && msg.message) {
            sendOpts.quoted = msg;
        }

        const waMsg = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: interactive
                }
            }
        }, sendOpts);

        await sock.relayMessage(from, waMsg.message, {
            messageId: waMsg.key.id,
            additionalNodes
        });
        sentInteractive = true;
    } catch (relayErr) {
        console.warn('[Pair Interactive Button Relay Failed, falling back to text]:', relayErr.message);
    }

    if (!sentInteractive) {
        await sock.sendMessage(from, {
            text: resultText,
            mentions: [targetJid, senderJid],
            contextInfo: newsletterContextInfo
        }, { quoted: msg });
    }

    // Card 2 stays pure 8-character code without "View channel" context for 1-tap copy
    await sock.sendMessage(from, { text: cleanCode }, { quoted: msg });
}

/**
 * .pairmini <number> - Main Bot ke andar se SIGMA MINI BOT pair karein
 */
async function pairminiCommand(sock, from, msg, args = [], isOwner = false) {
    const isGroup = from.endsWith('@g.us');
    const senderJid = msg.key.participant || from;
    const hasForceFlag = (args || []).some(a => ['force', '-f'].includes(String(a || '').toLowerCase()));
    const resolved = await resolveTargetNumber(sock, from, msg, args);

    if (!resolved.number) {
        return await sock.sendMessage(from, {
            text:
                `╭━━━〔 🤖 *SIGMA MINI BOT — PAIRING* 〕━━━┈⊷\n` +
                `┃ 📌 *Usage:* .pairmini <number>\n` +
                `┃ 💡 *Example:* .pairmini 923438673242\n` +
                `┃ 🌐 *Web Pair:* https://sigmamini.vercel.app\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`,
            mentions: [senderJid]
        }, { quoted: msg });
    }

    const cooldownKey = senderJid || from;
    const lastReq = miniPairCooldown.get(cooldownKey) || 0;
    if (Date.now() - lastReq < 12000) {
        const waitSec = Math.ceil((12000 - (Date.now() - lastReq)) / 1000);
        return await sock.sendMessage(from, { text: `⏳ Thora intezar karein! Dubara request *${waitSec}s* baad bhejein.` }, { quoted: msg });
    }
    if (miniPairCooldown.size >= 300) miniPairCooldown.delete(miniPairCooldown.keys().next().value);
    miniPairCooldown.set(cooldownKey, Date.now());

    const targetNumber = resolved.number;
    const targetJid = `${targetNumber}@s.whatsapp.net`;
    const allowForce = Boolean(isOwner && hasForceFlag);

    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
    await sock.sendMessage(from, {
        text: `⏳ *+${targetNumber}* ke liye *SIGMA MINI BOT* pairing code generate ho raha hai...`,
        mentions: [senderJid, targetJid]
    }, { quoted: msg });

    let responseData = null;
    let responseStatus = 0;
    let lastError = null;
    let lastConflict = null;

    const candidateEndpoints = [];
    try {
        const clusterSync = require('../utils/clusterSync');
        const miniNodes = typeof clusterSync.getMiniBotNodes === 'function' ? clusterSync.getMiniBotNodes() : [];
        if (!allowForce && miniNodes.length > 0) {
            const probes = await Promise.all(miniNodes.map(async (nodeUrl) => {
                try {
                    const hRes = await axios.get(`${nodeUrl}/health`, { timeout: 3000 });
                    return { nodeUrl, connected: Boolean(hRes.data?.connected) };
                } catch (_) {
                    return null;
                }
            }));
            for (const p of probes.filter((x) => x && !x.connected)) {
                candidateEndpoints.push(`${p.nodeUrl}/pair`);
            }
        }
        for (const base of MINI_PAIR_ENDPOINTS) {
            if (!candidateEndpoints.includes(base)) candidateEndpoints.push(base);
        }
        for (const nodeUrl of miniNodes) {
            const ep = `${nodeUrl}/pair`;
            if (!candidateEndpoints.includes(ep)) candidateEndpoints.push(ep);
        }
    } catch (_) {
        candidateEndpoints.push(...MINI_PAIR_ENDPOINTS);
    }

    for (const baseEndpoint of candidateEndpoints) {
        try {
            const url = `${baseEndpoint}?number=${encodeURIComponent(targetNumber)}${allowForce ? '&force=true' : ''}`;
            const res = await axios.get(url, { timeout: 22000, validateStatus: () => true });
            if (res.data && typeof res.data === 'object') {
                if (res.status === 409) {
                    lastConflict = { data: res.data, status: 409 };
                    continue;
                }
                responseData = res.data;
                responseStatus = res.status;
                if (![502, 503, 504].includes(res.status)) break;
            }
        } catch (err) {
            lastError = err;
        }
    }

    if (!responseData && lastConflict) {
        responseData = lastConflict.data;
        responseStatus = 409;
    }

    if (responseStatus === 409) {
        await sock.sendMessage(from, { react: { text: '⚠️', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text:
                `⚠️ *SIGMA MINI BOT* par abhi ek number pehle se connected hai.\n` +
                (isOwner ? `💡 Owner override ke liye *\`.pairmini ${targetNumber} force\`* use karein.\n` : '') +
                `🌐 Web Dashboard: https://sigmamini.vercel.app`,
            mentions: [senderJid]
        }, { quoted: msg });
    }

    if (responseStatus === 429) {
        return await sock.sendMessage(from, {
            text: `⏳ Mini Bot par ek pairing attempt pehle se chal raha hai — 10 second baad dubara try karein.`
        }, { quoted: msg });
    }

    const code = responseData?.pairingCode || responseData?.code;
    if (!responseData?.success || !code) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `❌ *SIGMA MINI BOT* pairing failed: ${responseData?.error || lastError?.message || 'Code generate nahi ho saka.'}\n🌐 Web se try karein: https://sigmamini.vercel.app`,
            mentions: [senderJid]
        }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '🔑', key: msg.key } }).catch(() => {});
    await sendPairingResultCard(sock, from, msg, targetNumber, code, {
        isGroup,
        senderJid,
        targetJid,
        headerTitle: '🤖 *SIGMA MINI PAIRING CODE*',
        footerText: '🤖 Powered by SIGMA MINI BOT',
        webUrl: 'https://sigmamini.vercel.app',
        webLabel: '🤖 Mini Bot Web',
        quickCmd: '.pairmini',
        quickLabel: '🤖 Pair Mini Again'
    });
}

/**
 * .paircode [code / reset] - View or set the custom WhatsApp pairing code
 */
async function paircodeCommand(sock, from, msg, args, isOwner, isAdmin, botData, saveBotData) {
    if (!isOwner && !isAdmin) {
        return await sock.sendMessage(from, { text: "❌ Only owner can view or change the custom pairing code." }, { quoted: msg });
    }

    const currentCode = (botData?.customPairingCode || 'SAQ1BXMD').toUpperCase();
    const arg = (args[0] || '').trim().toUpperCase();

    if (!arg) {
        const formatted = currentCode.match(/.{1,4}/g)?.join('-') || currentCode;
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🔑 *CUSTOM PAIRING CODE ENGINE* 〕━━━┈⊷\n` +
                  `┃ 💎 *Current Code:* \`${currentCode}\` (\`${formatted}\`)\n` +
                  `┃ ⚡ *Status:* Active for all Web, Telegram & .pair requests\n` +
                  `┃ \n` +
                  `┃ 💡 *Change Kaise Karein:*\n` +
                  `┃ • \`.paircode <8-letter-code>\`  (e.g. \`.paircode SAQ1BXMD\`)\n` +
                  `┃ • \`.paircode reset\`  (Default: SAQ1BXMD)\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    }

    if (arg === 'RESET' || arg === 'DEFAULT') {
        if (botData) botData.customPairingCode = 'SAQ1BXMD';
        if (typeof saveBotData === 'function') saveBotData();
        return await sock.sendMessage(from, {
            text: `╭━━━〔 ✅ *CUSTOM PAIRING CODE RESET* 〕━━━┈⊷\n` +
                  `┃ 🔄 *New Code:* \`SAQ1BXMD\` (\`SAQ1-BXMD\`)\n` +
                  `┃ ⚡ Ab har baar default custom code \`SAQ1-BXMD\` generate hoga!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                  `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
        }, { quoted: msg });
    }

    const clean = arg.replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 8) {
        return await sock.sendMessage(from, {
            text: `⚠️ *Invalid Pairing Code!*\n` +
                  `WhatsApp pairing code strictly exactly *8 characters* (letters & numbers) hona zaroori hai.\n` +
                  `Aapne ${clean.length} characters diye: \`${clean}\`\n\n` +
                  `💡 Example: \`.paircode SAQ1BXMD\``
        }, { quoted: msg });
    }

    // Check Crockford validity
    const CROCKFORD_CHARS = '123456789ABCDEFGHJKLMNPQRSTVWXYZ';
    const invalidChar = clean.split('').find(c => !CROCKFORD_CHARS.includes(c));
    if (invalidChar) {
        return await sock.sendMessage(from, {
            text: `⚠️ *Invalid Character for WhatsApp!*\n` +
                  `WhatsApp pairing code Crockford Base32 standard use karta hai.\n` +
                  `Letter \`${invalidChar}\` allow nahi hai (I ki jagah 1 use karein).\n\n` +
                  `💡 Example: \`.paircode SAQ1BXMD\``
        }, { quoted: msg });
    }

    if (botData) botData.customPairingCode = clean;
    if (typeof saveBotData === 'function') saveBotData();

    const formatted = clean.match(/.{1,4}/g)?.join('-') || clean;
    return await sock.sendMessage(from, {
        text: `╭━━━〔 🔑 *CUSTOM PAIRING CODE UPDATED* 〕━━━┈⊷\n` +
              `┃ 💎 *New Custom Code:* \`${clean}\`\n` +
              `┃ 📱 *WhatsApp Format:* \`${formatted}\`\n` +
              `┃ ⚡ Ab jab bhi koi web, telegram ya .pair se code lega,\n` +
              `┃    yahi custom branded code generate hoga!\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
}

pairCommand.resolvePhoneNumberFromLid = resolvePhoneNumberFromLid;
pairCommand.paircodeCommand = paircodeCommand;
pairCommand.pairminiCommand = pairminiCommand;
module.exports = pairCommand;
module.exports.paircodeCommand = paircodeCommand;
module.exports.pairminiCommand = pairminiCommand;
