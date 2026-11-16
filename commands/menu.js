'use strict';

/**
 * ProBoy-MD / MR SAQIB MD :: Ultra-Sonic SMD-Mini Aesthetic Menu Engine
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
const { getEffectiveProfile } = require('./customProfile');
const {
    STYLES,
    initPrecompiledStyles,
    PRECOMPILED_STYLES,
    getStyleCatalog,
    setmenuCommand
} = require('./menuStyles');
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
        'arcunblock', 'arcunlock', 'autochreact', 'cfch', 'cforward', 'channelid',
        'channels', 'chautoreact', 'chfollow', 'chreact', 'chreactall', 'chstatus', 'chunfollow',
        'chunreact', 'chvote', 'pollrand', 'pollunvote', 'pollvfix',
        'pollvinfo', 'pollvote', 'pollvstop', 'vote1', 'vote2', 'vote3', 'vote4'
    ],
    'AUDIO EDIT': [
        'baby', 'bass', 'blown', 'chipmunk', 'deep', 'demon', 'earrape', 'fast',
        'fat', 'nightcore', 'radio', 'reverse', 'robot', 'slow', 'smooth',
        'tomp3', 'toptt', 'tupai'
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
        'alive', 'autoreply', 'botstatus', 'calc', 'checkprem', 'dp', 'getpp',
        'goodmorning', 'goodnight', 'hello', 'help', 'hi', 'iloveyou', 'md',
        'myprem', 'myprofile', 'owner', 'pair', 'ping', 'profileinfo', 'resetmenu',
        'runtime', 'sadgirl', 'setbotname', 'setmenupic', 'setownername', 'speed',
        'tmp', 'tmpib', 'tmprst', 'translate', 'vv', 'wame', 'weather'
    ],
    'GROUP': [
        'accept', 'acceptall', 'add', 'antilink', 'antispam', 'creategroup',
        'del', 'demote', 'demoteall', 'end', 'gcfrwrd', 'gcjid', 'goodbye',
        'groupdesc', 'groupinfo', 'grouplink', 'grouplogo', 'hidetag', 'invtag',
        'join', 'joinrequest', 'kick', 'leave', 'leaveall', 'left', 'leftall', 'listadmins', 'listgc',
        'lock', 'membercount', 'mute', 'online', 'out', 'poll',
        'promote', 'promoteall', 'r', 'randommember', 'reject',
        'rejectall', 'requests', 'resetwarn', 'revokelink', 'rtest',
        'setgdesc', 'setgname', 'setgoodbye', 'setgrouppfp', 'setname',
        'setwelcome', 'tagadmins', 'tagall', 'unlock', 'unmute',
        'unwarn', 'vcf', 'warn', 'welcome'
    ],
    'SECURITY': [
        'anticall', 'antidelete', 'antistatus', 'autoreact',
        'autoread', 'autorecording', 'autostatus', 'autotyping', 'block', 'kickoffline',
        'private', 'public', 'statusreact', 'statusseen', 'unblock'
    ],
    'FUN': [
        '8ball', 'advice', 'afternoon', 'cat', 'character', 'coin', 'compliment', 'confess',
        'couple', 'dare', 'dice', 'dog', 'emojimix', 'evening', 'fact', 'flirt', 'gayrate',
        'gift', 'goodnight', 'hack', 'insult', 'joke', 'love', 'lovequote',
        'meme', 'morning', 'motivation', 'poll', 'quiz', 'rank', 'roast',
        'rpg', 'shayari', 'ship', 'slots', 'thanks', 'truth'
    ],
    'ISLAMIC': [
        'azkar', 'dua', 'hadith', 'prayertime', 'quran', 'tasbeeh'
    ],
    'OWNER': [
        'addpm', 'addprem', 'afc', 'afclist', 'ajg', 'ajginfo', 'backup', 'blank', 'broadcast', 'chstatus', 'crashgrup',
        'cs', 'delafc', 'delajg', 'delcs', 'delpm', 'delprem', 'delvcontact', 'fullpp',
        'iosbug', 'leaveall', 'leftall', 'mode', 'ownadd', 'owndel', 'ownlist', 'pmlist', 'prem', 'premlist',
        'resetmenu', 'restart', 'richhtml', 'setbotname', 'setmenupic',
        'setownername', 'setpp', 'setvcontact', 'setvmsg', 'stats', 'vcontact'
    ]
};

// ══════════════════════════════════════════════════════════════
// ULTRA-SONIC SPEED MEMORY CACHE (Pre-Compiled at Server Boot)
// ══════════════════════════════════════════════════════════════
const PRECOMPILED_BOXES = new Map();
let FULL_MENU_PRECOMPILED_BODY = '';
let TOTAL_COMMANDS_COUNT = 0;

function initPrecompiledMenu() {
    let body = '';
    let count = 0;
    for (const [categoryName, cmds] of Object.entries(CATEGORIES)) {
        count += cmds.length;
        const box = makeBox(categoryName, cmds);
        PRECOMPILED_BOXES.set(categoryName.toLowerCase(), { name: categoryName, box });
        body += box;
    }
    FULL_MENU_PRECOMPILED_BODY = body;
    TOTAL_COMMANDS_COUNT = count;
}
initPrecompiledMenu();
initPrecompiledStyles(CATEGORIES);

// Pre-buffered in-RAM Image Buffer (zero hard disk latency!)
let PRELOADED_MENU_IMAGE = null;
function loadMenuImageBuffer() {
    try {
        const localImgPath = path.join(__dirname, '..', 'data', 'mrsaqib_preview.png');
        if (fs.existsSync(localImgPath)) {
            PRELOADED_MENU_IMAGE = fs.readFileSync(localImgPath);
        } else if (settings.menuImage && fs.existsSync(settings.menuImage.trim())) {
            PRELOADED_MENU_IMAGE = fs.readFileSync(settings.menuImage.trim());
        }
    } catch (_) {}
}
loadMenuImageBuffer();

function getMenuChannelContext(botName = null) {
    return {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: settings.newsletterJid || '120363421389121979@newsletter',
            newsletterName: botName || settings.botName || 'MR SAQIB MD',
            serverMessageId: 1
        }
    };
}

// Dedicated Separate 'SEARCH ON GOOGLE' Card (100% Preserved!)
const GOOGLE_LINKS_CARD = 
`╭━━━〔 🔍 *SEARCH ON GOOGLE* 〕━━━┈⊷
┃ 🚀 *Mr Saqib:*
┃ google.com/search?q=mr+saqib
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`;

async function menuCommand(sock, from, msg, session, botData, BOT_START_TIME, args = []) {
    // 1. Instant loading reaction (fired asynchronously in background: ZERO delay!)
    sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

    const userId = session?.userId || 'User';
    const profile = getEffectiveProfile(botData, userId);
    const effectiveBotName = profile.botName;
    const effectiveOwnerName = profile.ownerName;
    const customName = (botData?.userNames && botData.userNames[userId]) || msg.pushName || 'User';
    const isPublic = session?.isPublic ?? false;

    // Fast Runtime calculation
    const uptimeSec = Math.floor((Date.now() - (BOT_START_TIME || Date.now())) / 1000);
    const uptimeH = Math.floor(uptimeSec / 3600);
    const uptimeM = Math.floor((uptimeSec % 3600) / 60);
    const uptimeS = uptimeSec % 60;
    const runtimeStr = `${uptimeH}h ${uptimeM}m ${uptimeS}s`;

    // Fast RAM calculation
    const usedMem = (process.memoryUsage().rss / (1024 * 1024)).toFixed(2);
    const totalMem = (os.totalmem() / (1024 * 1024)).toFixed(2);

    // Fast Date calculation
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    // Parse requested style or filter category
    let requestedStyle = null;
    let filterArg = null;

    if (Array.isArray(args) && args.length > 0) {
        const firstClean = String(args[0]).trim();
        const firstNum = parseInt(firstClean, 10);
        if (!isNaN(firstNum) && firstNum >= 1 && firstNum <= 12 && String(firstNum) === firstClean) {
            requestedStyle = firstNum;
            if (args[1]) filterArg = String(args[1]).toLowerCase().trim();
        } else {
            filterArg = firstClean.toLowerCase();
        }
    }

    const effectiveStyleId = requestedStyle || profile.menuStyle || 1;
    const styleObj = STYLES[effectiveStyleId] || STYLES[1];

    const profileData = {
        botName: effectiveBotName,
        ownerName: effectiveOwnerName,
        userName: customName
    };

    const statsData = {
        isPublic,
        dateStr,
        runtimeStr,
        usedMem,
        totalMem,
        totalCommands: TOTAL_COMMANDS_COUNT
    };

    // 2. Build Aesthetic Header Box
    const headerText = styleObj.makeHeader(profileData, statsData);

    // 3. Category Body Selection (Instant In-RAM retrieval)
    let bodyText = '';
    const styleCache = PRECOMPILED_STYLES.get(effectiveStyleId) || PRECOMPILED_STYLES.get(1);

    if (filterArg && styleCache?.categoryMap) {
        for (const [key, item] of styleCache.categoryMap.entries()) {
            if (key.includes(filterArg) || item.name.toLowerCase().includes(filterArg)) {
                bodyText += item.box;
            }
        }
    }

    if (!bodyText) {
        bodyText = styleCache?.fullBody || FULL_MENU_PRECOMPILED_BODY;
    }

    // 4. Build Powered By Footer
    const footerText = styleObj.makeFooter(profileData);

    const menuText = (headerText + bodyText + footerText).trim();

    // 5. Image payload resolution (Custom session image -> Custom global image -> Preloaded RAM buffer -> Settings URL)
    let imagePayload = null;
    if (profile.menuImage) {
        try {
            imagePayload = fs.readFileSync(profile.menuImage);
        } catch (_) {}
    }
    if (!imagePayload) {
        imagePayload = PRELOADED_MENU_IMAGE;
    }
    if (!imagePayload && settings.menuImage && settings.menuImage.trim() !== '') {
        const imgPath = settings.menuImage.trim();
        if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
            imagePayload = { url: imgPath };
        }
    }

    // 6. Send Message 1: Main Menu with guaranteed delivery
    try {
        const channelContext = getMenuChannelContext(effectiveBotName);
        if (imagePayload) {
            await sock.sendMessage(from, { image: imagePayload, caption: menuText, contextInfo: channelContext }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text: menuText, contextInfo: channelContext }, { quoted: msg });
        }
    } catch (err) {
        console.error('[menuCommand] Error sending menu:', err.message);
        await sock.sendMessage(from, { text: menuText }, { quoted: msg }).catch(() => {});
    }

    // 7. Send Message 2: Separate 'SEARCH ON GOOGLE' Card (100% Preserved as requested!)
    sock.sendMessage(from, { text: GOOGLE_LINKS_CARD }, { quoted: msg }).catch((e) => {
        console.error('[menuCommand] Error sending links card:', e.message);
    });
}

module.exports = {
    menuCommand,
    setmenuCommand,
    getStyleCatalog,
    STYLES,
    CATEGORIES,
    toSansBold,
    toSansItalic,
    toSmallCaps
};
