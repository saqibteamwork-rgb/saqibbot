'use strict';

/**
 * ProBoy-MD / MR SAQIB MD :: SMD-Mini Aesthetic Menu Engine
 * ============================================================================
 * Ultra-clean SMD-Mini theme with Bold Sans & Italic typography requested by user:
 * ╭━━━〔 ⚡ 𝗠𝗥 𝗦𝗔𝗤𝗜𝗕 𝗠𝗗 ⚡ 〕━━━┈⊷
 * ┃ 🟢 𝗦𝘁𝗮𝘁𝘂𝘀: 𝗖𝗼𝗻𝗻𝗲𝗰𝘁𝗲𝗱
 * ┃ ⚙️ 𝗦𝘆𝘀𝘁𝗲𝗺: 𝗔𝗰𝘁𝗶𝘃𝗲
 * ┃ 🌐 𝗦𝗲𝗿𝘃𝗲𝗿: 𝗥𝘂𝗻𝗻𝗶𝗻𝗴
 * ┃ 🔥 𝗠𝗼𝗱𝘂𝗹𝗲𝘀: 𝗔𝗰𝘁𝗶𝘃𝗲
 * ╰━━━━━━━━━━━━━━━━━━┈⊷
 *
 *  ➤ .𝗺𝗲𝗻𝘂 type karein commands ke liye
 *
 * ┌───⭓ ⚡ CATEGORY ⭓───
 * │ ⬡ .command
 * └───────────────────⭓
 *
 * ╭━━━〔 👑 𝗣𝗢𝗪𝗘𝗥𝗘𝗗 𝗕𝗬 〕━━━┈⊷
 * ┃ 🚀 𝗠𝗥 𝗦𝗔𝗤𝗜𝗕
 * ╰━━━━━━━━━━━━━━━━━━┈⊷
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const settings = require('../settings');
const {
    sendInteractiveButtons,
    quickReplyButton,
    urlButton
} = require('../utils/buttonHelper');

/**
 * Convert string to Mathematical Sans-Serif Bold Unicode (e.g. 𝗠𝗥 𝗦𝗔𝗤𝗜𝗕 𝗠𝗗)
 */
function toSansBold(str) {
    return String(str || '').replace(/[A-Za-z0-9]/g, c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + code - 97);
        if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);
        return c;
    });
}

/**
 * Convert string to Mathematical Sans-Serif Italic Unicode (e.g. 𝘊𝘰𝘯𝘯𝘦𝘤𝘵𝘦𝘥)
 */
function toSansItalic(str) {
    return String(str || '').replace(/[A-Za-z]/g, c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D608 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D622 + code - 97);
        return c;
    });
}

const SMALL_CAPS_MAP = {
    'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ғ', 'g': 'ɢ', 'h': 'ʜ',
    'i': 'ɪ', 'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ',
    'q': 'ǫ', 'r': 'ʀ', 's': 's', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x',
    'y': 'ʏ', 'z': 'ᴢ'
};

function toSmallCaps(str) {
    return String(str || '').toLowerCase().split('').map(c => SMALL_CAPS_MAP[c] || c).join('');
}

function makeBox(title, commands) {
    const head = `┌───⭓ ⚡ ${toSansBold(title.toUpperCase())} ⭓───\n`;
    const body = commands.map(cmd => `│ ⬡ .${toSansBold(cmd)}`).join('\n') + '\n';
    const foot = `└───────────────────⭓\n\n`;
    return head + body + foot;
}

const CATEGORIES = {
    'AI & MEDIA': [
        'ai', 'ai2', 'emojimix', 'flux', 'imagine', 'malik', 'pinterest',
        'qr', 'rmbg', 'sigma', 'silentsave', 'sticker', 'take', 'tourl', 'vc'
    ],
    'CHANNEL': [
        'arc', 'arcblock', 'arcblocklist', 'arcdel', 'arclist', 'arclock',
        'arclocklist', 'arcprem', 'arcpremiumlist', 'arcremoveall', 'arcstop',
        'arcunblock', 'arcunlock', 'autochreact', 'cforward', 'channelid',
        'channels', 'chfollow', 'chreact', 'chreactall', 'chunfollow',
        'chunreact', 'chvote', 'pollrand', 'pollunvote', 'pollvfix',
        'pollvinfo', 'pollvote', 'pollvstop', 'vote1', 'vote2', 'vote3', 'vote4'
    ],
    'DOWNLOAD': [
        'apk', 'audio', 'capcut', 'dl', 'facebook', 'fbdl', 'gdrive',
        'igdl', 'insta', 'mediafire', 'mp3', 'play', 'save', 'song',
        'tiktok', 'tt', 'ttdl', 'video', 'wallpaper', 'ytdl', 'ytmp3', 'ytmp4'
    ],
    'SEARCH': [
        'github', 'google', 'gsearch', 'lyrics', 'pinterest',
        'playstore', 'ringtone'
    ],
    'ANIME': [
        'anime', 'animequote', 'neko', 'waifu'
    ],
    'TEXT EFFECTS': [
        '1917', 'arena', 'birthday', 'blackpink', 'devil', 'fire',
        'glitch', 'hacker', 'ice', 'impressive', 'leaves', 'light',
        'matrix', 'metallic', 'neon', 'purple', 'sand', 'snow', 'thunder'
    ],
    'LOOKUP & TOOLS': [
        'base64', 'bin', 'binary', 'callerid', 'camcheck', 'camdel', 'camlink',
        'camlinks', 'cnic', 'define', 'fancy',
        'fetch', 'gencc', 'getcid', 'inspect', 'invtag', 'ip', 'lottie',
        'npm', 'obfuscate', 'pastebin', 'readmore', 'rs', 'rs10', 'shorturl',
        'sim', 'simdata', 'sreact', 'stickerreact', 'sts', 'tc',
        'trackip', 'truecaller', 'vcf', 'was', 'wiki'
    ],
    'GENERAL': [
        'alive', 'botstatus', 'calc', 'dp', 'help', 'owner',
        'pair', 'ping', 'runtime', 'speed', 'tmp', 'tmpib',
        'tmprst', 'translate', 'vv', 'wame', 'weather'
    ],
    'GROUP': [
        'accept', 'acceptall', 'add', 'antilink', 'antispam', 'creategroup',
        'del', 'demote', 'demoteall', 'end', 'gcfrwrd', 'gcjid', 'goodbye',
        'groupdesc', 'groupinfo', 'grouplink', 'grouplogo', 'hidetag', 'invtag',
        'join', 'joinrequest', 'kick', 'leave', 'listadmins', 'listgc',
        'lock', 'membercount', 'mute', 'online', 'out', 'poll',
        'promote', 'promoteall', 'r', 'randommember', 'reject',
        'rejectall', 'requests', 'resetwarn', 'revokelink', 'rtest',
        'setgdesc', 'setgname', 'setgoodbye', 'setgrouppfp', 'setname',
        'setwelcome', 'tagadmins', 'tagall', 'unlock', 'unmute',
        'unwarn', 'vcf', 'warn', 'welcome'
    ],
    'SECURITY': [
        'anticall', 'antidelete', 'antistatus', 'autoreact',
        'autoread', 'autostatus', 'block', 'kickoffline',
        'private', 'public', 'unblock'
    ],
    'FUN': [
        'advice', 'afternoon', 'cat', 'character', 'coin', 'compliment', 'confess',
        'couple', 'dare', 'dice', 'dog', 'evening', 'fact', 'flirt', 'gayrate',
        'gift', 'goodnight', 'hack', 'insult', 'joke', 'love', 'lovequote',
        'meme', 'morning', 'motivation', 'poll', 'quiz', 'rank', 'roast',
        'rpg', 'shayari', 'ship', 'thanks', 'truth'
    ],
    'ISLAMIC': [
        'azkar', 'dua', 'hadith', 'prayertime', 'quran', 'tasbeeh'
    ],
    'OWNER': [
        'backup', 'blank', 'broadcast', 'crashgrup', 'fullpp',
        'iosbug', 'mode', 'restart', 'richhtml', 'setpp', 'stats'
    ]
};

async function menuCommand(sock, from, msg, session, botData, BOT_START_TIME, args = []) {
    // 1. Instant loading reaction
    await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

    const userId = session?.userId || 'User';
    const customName = (botData?.userNames && botData.userNames[userId]) || msg.pushName || 'User';
    const isPublic = session?.isPublic ?? false;

    // Runtime calculation
    const uptimeSec = Math.floor((Date.now() - (BOT_START_TIME || Date.now())) / 1000);
    const uptimeH = Math.floor(uptimeSec / 3600);
    const uptimeM = Math.floor((uptimeSec % 3600) / 60);
    const uptimeS = uptimeSec % 60;
    const runtimeStr = `${uptimeH}h ${uptimeM}m ${uptimeS}s`;

    // RAM calculation
    const usedMem = (process.memoryUsage().rss / (1024 * 1024)).toFixed(2);
    const totalMem = (os.totalmem() / (1024 * 1024)).toFixed(2);

    // Date calculation
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    // Total commands count
    let totalCommandsCount = 0;
    for (const cat of Object.keys(CATEGORIES)) {
        totalCommandsCount += CATEGORIES[cat].length;
    }

    // Filter check: If user typed e.g. `.menu ai` or `.menu group`
    const filterArg = (Array.isArray(args) && args[0]) ? String(args[0]).toLowerCase() : null;
    let selectedCats = Object.entries(CATEGORIES);
    if (filterArg) {
        const matched = selectedCats.filter(([cat]) => cat.toLowerCase().includes(filterArg));
        if (matched.length > 0) {
            selectedCats = matched;
        }
    }

    // 2. Build Bold & Italic Aesthetic Header Box
    let menuText = 
`╭━━━〔 ⚡ ${toSansBold(settings.botName || 'MR SAQIB MD')} ⚡ 〕━━━┈⊷
┃ 👤 ${toSansBold('User')}: _${customName}_
┃ 👑 ${toSansBold('Owner')}: ${toSansBold(settings.ownerName || 'MR SAQIB')}
┃ 🟢 ${toSansBold('Status')}: ${toSansBold('Connected')} 🟢
┃ ⚙️ ${toSansBold('System')}: ${toSansBold('Active')} ⚡
┃ 🌐 ${toSansBold('Server')}: ${toSansBold('Running')} 🚀
┃ 🔥 ${toSansBold('Modules')}: ${toSansBold('Active')} 🔥
┃ 📱 ${toSansBold('Baileys')}: _Multi-Device_
┃ 📅 ${toSansBold('Date')}: _${dateStr}_
┃ ⏳ ${toSansBold('Uptime')}: _${runtimeStr}_
┃ 🔑 ${toSansBold('Prefix')}: [ . ]
┃ 🛡️ ${toSansBold('Mode')}: _${isPublic ? 'Public 🌍' : 'Private 🔒'}_
┃ 📊 ${toSansBold('RAM')}: _${usedMem}MB / ${totalMem}MB_
┃ 📂 ${toSansBold('Total Commands')}: ${toSansBold(String(totalCommandsCount))}
┃ 📦 ${toSansBold('Version')}: _2.0.0_
╰━━━━━━━━━━━━━━━━━━┈⊷

 ➤ .${toSansBold('menu')} _type karein commands ke liye_\n\n`;

    // 3. Build Category Boxes (Clean SMD-Mini Style with Bold Sans)
    for (const [categoryName, cmds] of selectedCats) {
        menuText += makeBox(categoryName, cmds);
    }

    // 4. Build Powered By Footer
    menuText += 
`╭━━━〔 👑 ${toSansBold('POWERED BY')} 〕━━━┈⊷
┃ 🚀 ${toSansBold(settings.ownerName || 'MR SAQIB')}
┃ 🔍 google.com/search?q=mr+saqib
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

    // 5. Official Channel Context for Newsletter ("View channel")
    const channelContext = {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: settings.newsletterJid || '120363421389121979@newsletter',
            newsletterName: settings.botName || 'MR SAQIB MD',
            serverMessageId: 1
        }
    };

    // 6. Image payload
    let imagePayload = null;
    const localImgPath = path.join(__dirname, '..', 'data', 'mrsaqib_preview.png');
    if (fs.existsSync(localImgPath)) {
        try { imagePayload = fs.readFileSync(localImgPath); } catch {}
    }
    if (!imagePayload && settings.menuImage && settings.menuImage.trim() !== '') {
        const imgPath = settings.menuImage.trim();
        if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
            imagePayload = { url: imgPath };
        } else if (fs.existsSync(imgPath)) {
            imagePayload = fs.readFileSync(imgPath);
        }
    }

    // 7. Send main menu with guaranteed delivery
    try {
        if (imagePayload) {
            await sock.sendMessage(from, { image: imagePayload, caption: menuText.trim(), contextInfo: channelContext }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text: menuText.trim(), contextInfo: channelContext }, { quoted: msg });
        }
    } catch (err) {
        console.error('[menuCommand] Error sending menu:', err.message);
        await sock.sendMessage(from, { text: menuText.trim() }, { quoted: msg }).catch(() => {});
    }

    // 8. Send Google Search Link as a separate message so WhatsApp Mobile renders it 100% blue and clickable!
    try {
        const linksCard = 
`╭━━━〔 🔍 *SEARCH ON GOOGLE* 〕━━━┈⊷
┃ 🚀 *Mr Saqib:*
┃ google.com/search?q=mr+saqib
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

        await sock.sendMessage(from, { text: linksCard }, { quoted: msg });
    } catch (e) {
        console.error('[menuCommand] Error sending links card:', e.message);
    }
}

module.exports = {
    menuCommand,
    CATEGORIES,
    toSansBold,
    toSansItalic,
    toSmallCaps
};
