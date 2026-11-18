// commands/extra-tools.js - Popular Essential Tools from D:\Mmm-main & D:\Server2-main
const axios = require('axios');
const { resolvePhoneNumberFromLid } = require('./pair');
const settings = require('../settings');

// Format uptime string
function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

// 1. WAME Command (.wame)
async function wameCommand(sock, from, msg, args) {
    try {
        let targetJid = null;
        let customText = '';

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

        if (quoted) {
            targetJid = quoted;
            customText = (args || []).join(' ').trim();
        } else if (mentioned) {
            targetJid = mentioned;
            customText = (args || []).join(' ').trim();
        } else if (args && args.length > 0 && /^\+?[0-9]{7,15}/.test(args[0])) {
            const rawNum = args[0].replace(/[^0-9]/g, '');
            targetJid = `${rawNum}@s.whatsapp.net`;
            customText = args.slice(1).join(' ').trim();
        } else {
            targetJid = msg.key.participant || msg.participant || from;
            customText = (args || []).join(' ').trim();
        }

        let phone = '';
        if (targetJid.includes('@lid')) {
            const resolved = await resolvePhoneNumberFromLid(sock, targetJid);
            if (resolved) {
                phone = resolved;
            } else {
                phone = targetJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            }
        } else {
            phone = targetJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        }

        let waLink = `https://wa.me/${phone}`;
        if (customText) {
            waLink += `?text=${encodeURIComponent(customText)}`;
        }

        const caption = 
`╭━━━〔 🔗 *WHATSAPP LINK* 〕━━━┈⊷
┃ 📱 *Phone:* +${phone}
┃ 🌐 *Link:* ${waLink}
${customText ? `┃ 💬 *Pre-filled Message:* ${customText}\n` : ''}╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

🚀 *Powered by MR SAQIB MD*`;

        await sock.sendMessage(from, {
            text: caption,
            contextInfo: {
                externalAdReply: {
                    title: `Chat with +${phone}`,
                    body: "Click to open WhatsApp direct chat",
                    mediaType: 1,
                    thumbnailUrl: "https://ik.imagekit.io/19imy4f1u/lite_1775822697436_IXJPba-z2.png",
                    sourceUrl: waLink,
                    renderLargerThumbnail: false
                }
            }
        }, { quoted: msg });

    } catch (e) {
        console.error('[WAME Command Error]:', e);
        await sock.sendMessage(from, { text: `❌ WAME link generate nahi ho saka: ${e.message}` }, { quoted: msg });
    }
}

// 2. Group Link Command (.grouplink / .invite / .linkgc)
async function grouplinkCommand(sock, from, msg, isOwner, isAdmin) {
    try {
        if (!from.endsWith('@g.us')) {
            return await sock.sendMessage(from, { text: "❌ Yeh command sirf WhatsApp groups me kaam karti hai." }, { quoted: msg });
        }

        if (!isAdmin && !isOwner) {
            return await sock.sendMessage(from, { text: "❌ Group link mangne ke liye aapka Group Admin ya Bot Owner hona zaroori hai." }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '🔗', key: msg.key } }).catch(() => {});

        const inviteCode = await sock.groupInviteCode(from);
        const groupLink = `https://chat.whatsapp.com/${inviteCode}`;

        const senderJid = msg.key.participant || msg.participant || from;

        const text = 
`╭━━━〔 🔗 *GROUP INVITE LINK* 〕━━━┈⊷
┃ 📌 *Invite Link:*
┃ ${groupLink}
┃ 
┃ 👤 *Requested by:* @${senderJid.split('@')[0]}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

🚀 *Powered by MR SAQIB MD*`;

        await sock.sendMessage(from, {
            text,
            mentions: [senderJid],
            contextInfo: {
                externalAdReply: {
                    title: "Group Invite Link",
                    body: "Click to join this WhatsApp Group",
                    mediaType: 1,
                    thumbnailUrl: "https://ik.imagekit.io/19imy4f1u/lite_1775822697436_IXJPba-z2.png",
                    sourceUrl: groupLink,
                    renderLargerThumbnail: false
                }
            }
        }, { quoted: msg });

    } catch (e) {
        console.error('[GroupLink Command Error]:', e);
        await sock.sendMessage(from, {
            text: `❌ Group link hasil nahi ho saka. Make sure bot is an Admin in this group!\nError: ${e.message}`
        }, { quoted: msg });
    }
}

// 3. List Admins Command (.listadmins / .admins)
async function listadminsCommand(sock, from, msg) {
    try {
        if (!from.endsWith('@g.us')) {
            return await sock.sendMessage(from, { text: "❌ Yeh command sirf WhatsApp groups me kaam karti hai." }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '📜', key: msg.key } }).catch(() => {});

        const meta = await sock.groupMetadata(from);
        const participants = meta.participants || [];
        const admins = participants.filter(p => p.admin);

        if (admins.length === 0) {
            return await sock.sendMessage(from, { text: "❌ Is group me koi admin nahi mila." }, { quoted: msg });
        }

        const mentions = [];
        let listText = 
`╭━━━〔 👑 *GROUP ADMINS LIST* 〕━━━┈⊷
┃ 🏷️ *Group:* ${meta.subject}
┃ 👥 *Total Admins:* ${admins.length}
┃
`;

        for (let i = 0; i < admins.length; i++) {
            const a = admins[i];
            const jid = a.id;
            mentions.push(jid);
            const role = a.admin === 'superadmin' ? '👑 Creator / Owner' : '⭐ Admin';
            listText += `┃ ${i + 1}. @${jid.split('@')[0]} (${role})\n`;
        }

        listText += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n🚀 *Powered by MR SAQIB MD*`;

        await sock.sendMessage(from, {
            text: listText,
            mentions: mentions
        }, { quoted: msg });

    } catch (e) {
        console.error('[ListAdmins Command Error]:', e);
        await sock.sendMessage(from, { text: `❌ Admins list nahi nikaal saka: ${e.message}` }, { quoted: msg });
    }
}

// 4. Alive Command (.alive / .botstatus)
async function aliveCommand(sock, from, msg, sessions, BOT_START_TIME) {
    try {
        await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

        const uptimeSec = Math.floor((Date.now() - BOT_START_TIME) / 1000);
        const uptimeStr = formatUptime(uptimeSec);

        const activeCount = Object.values(sessions || {}).filter(s => s?.isConnected).length;
        const totalCount = Object.keys(sessions || {}).length;

        const msgTimestamp = (msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now());
        const latency = Math.max(0, Date.now() - msgTimestamp);

        const caption = 
`╭━━━〔 ⚡ *MR SAQIB MD IS ALIVE* 〕━━━┈⊷
┃ 🤖 *Bot Name:* MR SAQIB MD
┃ 👑 *Owner:* MR SAQIB
┃ ⏱️ *Uptime:* ${uptimeStr}
┃ 📡 *Active Sessions:* ${activeCount} / ${totalCount}
┃ ⚡ *Speed:* ${latency}ms
┃ 🌐 *Status:* 100% Operational & Online
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

📢 *Official Channel:*
${settings.channelLink}

🚀 *Fastest & Most Advanced Multi-Device WhatsApp Bot*`;

        await sock.sendMessage(from, {
            image: { url: "https://ik.imagekit.io/19imy4f1u/lite_1775822697436_IXJPba-z2.png" },
            caption: caption,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: settings.newsletterJid || '120363431913895899@newsletter',
                    newsletterName: settings.channelName || 'Mr SAQIB',
                    serverMessageId: -1
                }
            }
        }, { quoted: msg });

    } catch (e) {
        console.error('[Alive Command Error]:', e);
        await sock.sendMessage(from, { text: `⚡ *MR SAQIB MD is Online!* (Uptime: ${formatUptime(Math.floor((Date.now() - BOT_START_TIME) / 1000))})` }, { quoted: msg });
    }
}

// 5. Quote Command (.quote)
async function quoteCommand(sock, from, msg) {
    try {
        await sock.sendMessage(from, { react: { text: '📜', key: msg.key } }).catch(() => {});
        const res = await axios.get("https://api.quotable.io/random", { timeout: 8000 });
        const data = res.data;
        const text = 
`╭━━━〔 📜 *INSPIRATIONAL QUOTE* 〕━━━┈⊷
┃ 💬 "${data.content}"
┃ 
┃ ✍️ — *${data.author}*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

🚀 *Powered by MR SAQIB MD*`;

        await sock.sendMessage(from, { text }, { quoted: msg });
    } catch (e) {
        // Fallback quotes
        const fallbacks = [
            { c: "Believe you can and you're halfway there.", a: "Theodore Roosevelt" },
            { c: "Act as if what you do makes a difference. It does.", a: "William James" },
            { c: "Success is not final, failure is not fatal: it is the courage to continue that counts.", a: "Winston Churchill" },
            { c: "The only way to do great work is to love what you do.", a: "Steve Jobs" }
        ];
        const pick = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        await sock.sendMessage(from, {
            text: `╭━━━〔 📜 *QUOTE* 〕━━━┈⊷\n┃ 💬 "${pick.c}"\n┃ \n┃ ✍️ — *${pick.a}*\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }
}

// 6. Roast Command (.roast)
async function roastCommand(sock, from, msg) {
    try {
        await sock.sendMessage(from, { react: { text: '🔥', key: msg.key } }).catch(() => {});
        const res = await axios.get("https://insult.mattbas.org/api/insult", { timeout: 8000 });
        const insult = (res.data || '').toString().trim();
        await sock.sendMessage(from, {
            text: `╭━━━〔 🔥 *SAVAGE ROAST* 〕━━━┈⊷\n┃ 💬 ${insult}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    } catch (e) {
        const fallbacks = [
            "You have your entire life to be a jerk. Why not take today off?",
            "I'd agree with you but then we'd both be wrong.",
            "You bring everyone so much joy... when you leave the room!",
            "I'm not insulting you; I'm describing you."
        ];
        const pick = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        await sock.sendMessage(from, {
            text: `╭━━━〔 🔥 *SAVAGE ROAST* 〕━━━┈⊷\n┃ 💬 ${pick}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }
}

module.exports = {
    wameCommand,
    grouplinkCommand,
    listadminsCommand,
    aliveCommand,
    quoteCommand,
    roastCommand
};
