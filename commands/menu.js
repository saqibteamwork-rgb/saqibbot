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
const { sendSwipeCarouselMenu } = require('./carouselMenu');
const { sendMetaAiButtonMenu } = require('./metaAiMenu');
const { sendCategoryButtonMenu } = require('./categoryButtonMenu');
const { getBotPic } = require('../lib/botpic');

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
        'ai', 'ai2', 'aimodels', 'attp', 'bard', 'blur', 'bomber', 'bot',
        'brainai', 'bw', 'chatgpt', 'circle', 'claudeai', 'codeai', 'codestral', 'comedy',
        'copilot', 'deepseek', 'devstral', 'dj', 'emojimix', 'enhance', 'felo', 'flip',
        'flux', 'gemini', 'githubstalk', 'gpt', 'gpt5', 'hd', 'imagine', 'invert',
        'luxai', 'malik', 'mememaker', 'metai', 'ministral', 'mistral', 'perplexity', 'pinterest',
        'professor', 'qr', 'repo', 'rmbg', 'sensenova', 'sepia', 'sharpen', 'sigma',
        'silentsave', 'silver', 'sticker', 'stickerinfo', 'stickerpack', 'studyai', 'summarize', 'take',
        'toimg', 'tourl', 'vc', 'watermark'
    ],
    'CHANNEL': [
        'achr', 'afc', 'afclist', 'delafc', 'chsync', 'arc', 'arcblock', 'arcblocklist', 'arcdel', 'arclist', 'arclock', 'arclocklist',
        'arcprem', 'arcpremiumlist', 'arcremoveall', 'arcstop', 'arcunblock', 'arcunlock', 'autochreact', 'cc',
        'cfch', 'cforward', 'channelid', 'channels', 'chautoreact', 'chfollow', 'chreact', 'chreactall',
        'chstatus', 'chunfollow', 'chunreact', 'chvote', 'pollrand', 'pollunvote', 'pollvfix', 'pollvinfo',
        'pollvote', 'pollvstop', 'vote1', 'vote2', 'vote3', 'vote4'
    ],
    'AUDIO EDIT': [
        'baby', 'bass', 'bgmusic', 'blown', 'chipmunk', 'deep', 'demon', 'earrape', 'fast',
        'fat', 'nightcore', 'radio', 'reverse', 'robot', 'say', 'slow', 'smooth',
        'sound', 'sound10', 'sound11', 'sound12', 'sound13', 'sound14', 'sound15', 'sound16',
        'sound2', 'sound3', 'sound4', 'sound5', 'sound6', 'sound7', 'sound8', 'sound9',
        'tomp3', 'toptt', 'tts', 'tupai', 'v2t'
    ],
    'DOWNLOAD': [
        'apk', 'audio', 'autodl', 'capcut', 'dl', 'drama', 'facebook', 'fb', 'fbdl',
        'gdrive', 'gitclone', 'ig3', 'igdl', 'igdl2', 'igdl3', 'igdl4', 'igmp3',
        'insta', 'mediafire', 'megadl', 'mp3', 'play', 'save', 'song', 'tiktok',
        'tiktok1', 'tiktok2', 'tiktok3', 'tiktoksearch', 'tiktoksearch2', 'tsticker', 'tt', 'ttdl',
        'ttmp3', 'video', 'wallpaper', 'ytdl', 'ytmp3', 'ytmp4', 'ytpost', 'ytv'
    ],
    'SEARCH': [
        'github', 'google', 'gsearch', 'lyrics', 'pinterest', 'playstore', 'ringtone', 'tiktokstalk',
        'xstalk', 'yts', 'ytstalk'
    ],
    'ANIME': [
        'anime', 'animeairing', 'animebyyear', 'animecharacters', 'animecuddle', 'animedance', 'animeepisode', 'animefacts',
        'animegenre', 'animegenres', 'animehandhold', 'animehappy', 'animehelp', 'animehighfive', 'animehug', 'animeinfo',
        'animekiss', 'animemanga', 'animemovie', 'animeova', 'animepat', 'animepeople', 'animepicture', 'animequote',
        'animesearch', 'animeseason', 'animesmile', 'animespecial', 'animetop', 'animetrailer', 'animeupcoming', 'animevideo',
        'animevoice', 'animewall', 'animewave', 'animewink', 'husbando', 'neko', 'waifu'
    ],
    'TEXT EFFECTS': [
        '1917', 'arena', 'birthday', 'blackpink', 'devil', 'fire', 'glitch', 'hacker',
        'ice', 'impressive', 'leaves', 'light', 'matrix', 'metallic', 'neon', 'purple',
        'sand', 'snow', 'thunder'
    ],
    'LOOKUP & TOOLS': [
        'activetime', 'addreply', 'adminaction', 'airport', 'anagram', 'angry', 'arcadd', 'ascii', 'autolikestatus',
        'autoreact-off', 'autoreact-on', 'autoreply', 'autoviewsview', 'b64', 'base64', 'base64dec', 'base64enc', 'bin',
        'binary', 'bmi', 'bold', 'botdp', 'botname', 'botscript', 'bubble', 'calculate',
        'callerid', 'camcheck', 'camdel', 'camlink', 'camlinks', 'capital', 'caption', 'chai',
        'channelinfo', 'channelstatus', 'charcount', 'chatanalysis', 'checkmail', 'checknum', 'chstatauto', 'chstatbulk',
        'chstatforward', 'chstatimg', 'chstatlist', 'chstatreact', 'chstatremind', 'chstatsticker', 'chstatvid', 'circled',
        'cmenu', 'cnic', 'confused', 'convert', 'count', 'countryinfo', 'cpp', 'currency',
        'cursive', 'dayinfo', 'dbinary', 'define', 'delpath', 'delreply', 'description', 'double', 'expense',
        'fakechat', 'fancy', 'fancytext', 'fetch', 'find', 'flag', 'forecast', 'frombin',
        'fullwidth', 'gencc', 'genpass', 'getcid', 'getcode', 'getimage', 'gitcode', 'goldrate', 'habit', 'happy',
        'heart', 'hot', 'id', 'imix', 'inspect', 'inverted', 'invtag', 'ip',
        'ip2', 'iplookup', 'italic', 'jid', 'languages', 'length', 'listreply', 'lottie', 'lottie2', 'lowercase',
        'mathcheck', 'memorycheck', 'menu', 'monospace', 'moon', 'morse', 'movieinfo', 'msg',
        'news', 'nikal', 'npm', 'obfuscate', 'ownername', 'ownernumber', 'palindrome', 'password2',
        'pastebin', 'pay', 'person', 'petrol', 'population', 'praytime', 'prefix', 'prem1', 'prem2', 'prem3', 'protectmsg', 'prs1', 'prs2', 'prs3', 'prslist', 'qrcode', 'randomline',
        'raw', 'rcolor', 'reactemojis', 'reactioncheck', 'readmore', 'recording', 'remind', 'remindme',
        'remini', 'removebg', 'removedup', 'removepp', 'replace', 'report', 'reportcarding', 'reportguide',
        'reportscam', 'reportscamchannel', 'restore', 'rnum', 'rs', 'rs10', 'run', 'rw', 'sad', 'saqib', 'saqibreact', 'saqibsend', 'saqibsticker', 'saqreact', 'saqsend', 'saqsticker', 'savecontact', 'saveprem', 'sendlottie', 'sprem',
        'saveweb', 'screenshot', 'script', 'setall', 'setprefix', 'setstatus', 'settings', 'short2',
        'shorturl', 'shy', 'sim', 'simdata', 'smallcaps', 'sorttext', 'squared', 'sreact',
        'ss', 'statusemojis', 'statuslike', 'statusview', 'stickername', 'stickerreact', 'sts', 'stssend', 'style',
        'sunriseset', 'tc', 'tempmail', 'timenow', 'timer', 'timezone', 'tiny', 'tobin',
        'todo', 'topwords', 'trackip', 'triviacheck', 'truecaller', 'typingcheck', 'unbanhard', 'unbase64',
        'unit', 'uppercase', 'uptime', 'urldecode', 'urlencode', 'vcf', 'viewcode', 'voices', 'was',
        'waterintake', 'weatherweek', 'webshot', 'wiki', 'wikipedia', 'wordcount', 'worldtime', 'wstalk'
    ],
    'GENERAL': [
        'alive', 'autoreply', 'botinfo', 'botstatus', 'calc', 'checkprem', 'chpoll', 'date',
        'dp', 'followstats', 'getpp', 'goodmorning', 'goodnight', 'gpass', 'hello', 'help',
        'hi', 'iloveyou', 'img', 'img2', 'iqc', 'masspoll', 'md', 'myprem',
        'myprofile', 'nettest', 'owner', 'pair', 'ping', 'ping2', 'pings', 'pollstats',
        'premium', 'profileinfo', 'redeem', 'resetmenu', 'runtime', 'sadgirl', 'server', 'setbotname',
        'setmenupic', 'setownername', 'sfollow', 'speed', 'sreacts', 'srepo', 'sunfollow', 'svotes',
        'tmp', 'tmpib', 'tmprst', 'translate', 'trt', 'typemenu', 'typmenu', 'userinfo', 'vv', 'autovv', 'viewonce', 'wame',
        'weather', 'whois'
    ],
    'GROUP': [
        'accept', 'acceptall', 'add', 'addmember', 'addmember2', 'addmember3', 'admincheck', 'admininform', 'admins',
        'antiadmin', 'antibot', 'antilink', 'antilinkreset', 'antispam', 'botadmin', 'creategroup', 'del', 'delete',
        'demote', 'demoteall', 'dismissall', 'end', 'gcfrwrd', 'gcjid', 'gcpp', 'ginfo',
        'ginvite', 'goodbye', 'grevoke', 'groupdesc', 'groupinfo', 'grouplink', 'grouplogo', 'groupstats',
        'groupstatus', 'hidetag', 'invite', 'invtag', 'join', 'joinrequest', 'kick', 'kickall',
        'leave', 'leaveall', 'left', 'leftall', 'link', 'listadmins', 'listgc', 'lock',
        'membercount', 'mute', 'newgc', 'online', 'out', 'poll', 'promote', 'promoteall',
        'r', 'randommember', 'reject', 'rejectall', 'removeadmins', 'requestlist', 'requests', 'resetwarn',
        'revoke', 'revokelink', 'rtest', 'setgdesc', 'setgname', 'setgoodbye', 'setgrouppfp', 'setname',
        'setshayari', 'setwelcome', 'silenttag', 'tagadmins', 'tagall', 'testgoodbye', 'testwelcome', 'topactive',
        'unlock', 'unmute', 'unwarn', 'updategdesc', 'updategname', 'vcf', 'warn', 'warns',
        'welcome', 'welcomefont', 'welcomeinfo', 'welcomepic'
    ],
    'SECURITY': [
        'anticall', 'antidelete', 'antistatus', 'autoreact', 'autoread', 'autorecording', 'autostatus', 'autotyping',
        'block', 'kickoffline', 'private', 'public', 'statusreact', 'statusseen', 'unblock'
    ],
    'FUN': [
        '8ball', 'abcd', 'advice', 'affirmation', 'afternoon', 'age', 'amanjagar', 'amankijan', 'saqibjagar', 'saqibkijan',
        'angel', 'animegif', 'animetag', 'aura', 'awoo', 'bacha', 'bachi', 'bahan',
        'bestfriend', 'bhai', 'bite', 'blush', 'bodyguard', 'bonk', 'bored', 'boss',
        'boyfriend', 'bully', 'cat', 'cgrt', 'chacha', 'chachi', 'character', 'choose',
        'chucknorris', 'coin', 'coinflip', 'color', 'comfort', 'compatibility', 'compliment', 'compliment2',
        'confess', 'count123', 'couple', 'cringe', 'crush', 'cry', 'cuddle', 'dad',
        'dance', 'dare', 'dare2', 'daughter', 'dice', 'dog', 'duel', 'emix',
        'emoji', 'emojimix', 'emotion', 'employee', 'enemy', 'evening', 'facepalm', 'fact',
        'fan', 'feelings', 'ff', 'flirt', 'fool', 'fortune', 'fox', 'gali',
        'gaymeter', 'gayrate', 'genius', 'ghost', 'gift', 'girlfriend', 'glomp', 'goodnight',
        'hack', 'handhold', 'highfive', 'howgay', 'hug', 'husband', 'idol', 'insult',
        'jarvis', 'joke', 'joke2', 'kill', 'king', 'kiss', 'laugh', 'lick',
        'livescore', 'love', 'lovebhai', 'lovemeter', 'lovequote', 'lovetest', 'lurk', 'mama',
        'mami', 'marige', 'master', 'mathspeed', 'mcserver', 'meme', 'memorygame', 'mlbb',
        'mom', 'mood', 'morning', 'motivate', 'motivation', 'nana', 'nani', 'neverhave',
        'nickname', 'nod', 'nom', 'nope', 'panda', 'partner', 'pat', 'pet',
        'pick', 'pickup', 'poke', 'pokemon', 'poll', 'poor', 'pout', 'propose',
        'punch', 'punjabi', 'queen', 'quiz', 'quote', 'quote2', 'raju', 'random',
        'randomanime', 'randompic', 'rank', 'rate', 'reactiontest', 'repeat', 'rich', 'riddle',
        'rival', 'rletter', 'roast', 'roll', 'rpg', 'runmureed', 'servant', 'shapar',
        'shayari', 'shayari2', 'ship', 'shoot', 'shrug', 'slap', 'slave', 'sleep',
        'slogan', 'slots', 'smile', 'smug', 'son', 'stare', 'steam', 'student',
        'tagme', 'tata', 'teacher', 'technologia', 'thanks', 'theme', 'think', 'thumbsup',
        'tickle', 'traveltip', 'trivia', 'truth', 'truth2', 'twin', 'typingtest', 'wave',
        'wife', 'wink', 'wordchain', 'wouldyou', 'wouldyourather', 'yawn', 'yeet', 'yesno',
        'zodiacsign', 'bubblepop', 'ludo', 'dice', 'roll', 'tictactoe', 'ttt', 'wordguess', 'games'
    ],
    'ISLAMIC': [
        'allahname', 'allnamaz', 'ayat', 'ayat2', 'azkar', 'charityideas', 'cleanliness', 'dailyhadith',
        'dua', 'duacat', 'duahelp', 'durood', 'eidguide', 'fastingguide', 'gooddeeds', 'hadith',
        'hadith2', 'hajjguide', 'halalearning', 'hijri', 'hijri2', 'iftardua', 'islamiccartoon', 'islamicevent',
        'islamicfact', 'islamicfamily', 'islamicmanners', 'islamicmonths', 'islamicquiz', 'islamicvideo', 'islamicvocab', 'islamquiz',
        'istighfar', 'jummahguide', 'kalima', 'masjidadab', 'muslimcharacter', 'naatvideo', 'namaz', 'namaz2',
        'namemeaning', 'neighborrights', 'nextnamaz', 'parentsdua', 'patience', 'pillarsiman', 'pillarsislam', 'prayertime',
        'prophetvideo', 'quran', 'quranadab', 'quranlearning', 'quransearch', 'ramadancount', 'ramadanguide', 'repentance',
        'sadaqah', 'safardua', 'salahguide', 'salamadab', 'shukr', 'surah', 'tasbeeh', 'truthfulness',
        'umrahguide', 'wuduguide', 'zakatguide', 'zikr', 'zikrstart'
    ],
    'OWNER': [
        'addcoupon', 'addpm', 'addprem', 'afc', 'afclist', 'ajg', 'ajginfo', 'anti-call',
        'autobio', 'backup', 'ban', 'banlist', 'bgmusic', 'blank', 'bothealth', 'botnotice', 'botpause',
        'botresume', 'botstats', 'broadcast', 'broadcast2', 'chstatus', 'countx', 'cpuinfo', 'crashgrup',
        'cs', 'delafc', 'delajg', 'delcoupon', 'delcs', 'delpm', 'delprem', 'delpromo',
        'delsudo', 'delvcontact', 'dltest', 'eval2', 'forward', 'forwardall', 'fullpp', 'gencoupon',
        'iosbug', 'killall', 'leaveall', 'leftall', 'listcoupon', 'listsudo', 'lockgroup', 'logs',
        'maintenance', 'memory', 'mode', 'ownadd', 'owndel', 'ownerhelp', 'ownerhub', 'ownerpic',
        'ownlist', 'pluginscan', 'pmlist', 'prem', 'premlist', 'promo', 'promolist', 'resetbotpic',
        'resetmenu', 'resetownerpic', 'restart', 'richhtml', 'sendto', 'serverinfo', 'sessions', 'setbotname',
        'setbotpic', 'setdesc', 'setgroq', 'setmenupic', 'setownername', 'setownerpic', 'setpp', 'setvcontact',
        'setvmsg', 'stats', 'status', 'sudo', 'unban', 'unlockgroup', 'usagestats', 'userban',
        'userunban', 'vcontact', 'vv2', 'vv3'
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
            newsletterJid: settings.newsletterJid || '120363431913895899@newsletter',
            newsletterName: botName || settings.botName || 'Mr SAQIB',
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

const CATEGORY_ALIASES = {
    // Group Menu
    'group': 'GROUP',
    'gc': 'GROUP',
    'g': 'GROUP',
    'grp': 'GROUP',
    'groupmenu': 'GROUP',
    'gcmenu': 'GROUP',
    'gmenu': 'GROUP',

    // Owner Menu
    'owner': 'OWNER',
    'onwer': 'OWNER',
    'own': 'OWNER',
    'o': 'OWNER',
    'sudo': 'OWNER',
    'ownermenu': 'OWNER',
    'onwermenu': 'OWNER',
    'omenu': 'OWNER',

    // AI & Media Menu
    'ai': 'AI & MEDIA',
    'aimedia': 'AI & MEDIA',
    'media': 'AI & MEDIA',
    'aimenu': 'AI & MEDIA',
    'mediamenu': 'AI & MEDIA',

    // Channel Menu
    'channel': 'CHANNEL',
    'ch': 'CHANNEL',
    'chnl': 'CHANNEL',
    'channelmenu': 'CHANNEL',
    'chmenu': 'CHANNEL',

    // Islamic Menu
    'islamic': 'ISLAMIC',
    'islam': 'ISLAMIC',
    'deen': 'ISLAMIC',
    'islamicmenu': 'ISLAMIC',

    // Fun Menu
    'fun': 'FUN',
    'masti': 'FUN',
    'game': 'FUN',
    'games': 'FUN',
    'funmenu': 'FUN',

    // Download Menu
    'dl': 'DOWNLOAD',
    'download': 'DOWNLOAD',
    'downloader': 'DOWNLOAD',
    'down': 'DOWNLOAD',
    'dlmenu': 'DOWNLOAD',
    'downloadmenu': 'DOWNLOAD',

    // Anime Menu
    'anime': 'ANIME',
    'weeb': 'ANIME',
    'animemenu': 'ANIME',

    // Audio Edit Menu
    'audio': 'AUDIO EDIT',
    'sound': 'AUDIO EDIT',
    'voice': 'AUDIO EDIT',
    'audiomenu': 'AUDIO EDIT',

    // Lookup & Tools Menu
    'tool': 'LOOKUP & TOOLS',
    'tools': 'LOOKUP & TOOLS',
    'lookup': 'LOOKUP & TOOLS',
    'utility': 'LOOKUP & TOOLS',
    'util': 'LOOKUP & TOOLS',
    'toolmenu': 'LOOKUP & TOOLS',
    'toolsmenu': 'LOOKUP & TOOLS',

    // Search Menu
    'search': 'SEARCH',
    'find': 'SEARCH',
    'searchmenu': 'SEARCH',

    // Text Effects Menu
    'text': 'TEXT EFFECTS',
    'texteffects': 'TEXT EFFECTS',
    'effects': 'TEXT EFFECTS',
    'textmenu': 'TEXT EFFECTS',

    // Security Menu
    'sec': 'SECURITY',
    'security': 'SECURITY',
    'guard': 'SECURITY',
    'secmenu': 'SECURITY',
    'securitymenu': 'SECURITY',

    // General Menu
    'general': 'GENERAL',
    'gen': 'GENERAL',
    'main': 'GENERAL',
    'generalmenu': 'GENERAL'
};

function resolveCategory(query) {
    if (!query) return null;
    const clean = String(query).toLowerCase().replace(/[^a-z0-9&]/g, '').trim();
    if (CATEGORY_ALIASES[clean]) return CATEGORY_ALIASES[clean];
    for (const catName of Object.keys(CATEGORIES)) {
        const catClean = catName.toLowerCase().replace(/[^a-z0-9&]/g, '');
        if (catClean === clean || catClean.includes(clean) || clean.includes(catClean)) {
            return catName;
        }
    }
    return null;
}

async function menuCommand(sock, from, msg, session, botData, BOT_START_TIME, args = [], forcedCategory = null, isPaymentMenu = false) {
    // 1. Instant loading reaction (fired asynchronously in background: ZERO delay!)
    sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

    const userId = session?.userId || 'User';
    const profile = getEffectiveProfile(botData, userId);
    const effectiveBotName = profile.botName;
    const effectiveOwnerName = profile.ownerName;
    const customName = (botData?.userNames && botData.userNames[userId]) || msg.pushName || 'User';
    const isPublic = session?.isPublic ?? (typeof botData?.globalSettings?.isPublic === 'boolean' ? botData.globalSettings.isPublic : true);

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
        if (!isNaN(firstNum) && firstNum >= 1 && firstNum <= 16 && String(firstNum) === firstClean) {
            requestedStyle = firstNum;
            if (args[1]) filterArg = String(args[1]).toLowerCase().trim();
        } else if (['pay', 'payment', 'typ', 'type', 'typmenu', 'typemenu', 'famo'].includes(firstClean.toLowerCase())) {
            requestedStyle = 13;
            if (args[1]) filterArg = String(args[1]).toLowerCase().trim();
        } else if (['carousel', 'cmenu', 'card', 'cards', 'slide', 'slidemenu'].includes(firstClean.toLowerCase())) {
            requestedStyle = 14;
            if (args[1]) filterArg = String(args[1]).toLowerCase().trim();
        } else if (['btn', 'button', 'meta', 'metaai', 'btnmenu', 'buttonmenu', 'sayron', 'wabot'].includes(firstClean.toLowerCase())) {
            requestedStyle = 15;
            if (args[1]) filterArg = String(args[1]).toLowerCase().trim();
        } else if (['cat', 'cats', 'catmenu', 'category', 'categories', 'aman', 'btnlist', 'buttons', 'allbtn', 'allbuttons'].includes(firstClean.toLowerCase())) {
            requestedStyle = 16;
            if (args[1]) filterArg = String(args[1]).toLowerCase().trim();
        } else {
            filterArg = firstClean.toLowerCase();
        }
    }

    const effectiveStyleId = requestedStyle || profile.menuStyle || 1;

    // Check if All-Categories Buttons Menu requested (Style 16 - AMAN-MD Style)
    if (effectiveStyleId === 16 || (Array.isArray(args) && args.some(a => ['cat', 'cats', 'catmenu', 'category', 'categories', 'aman', 'btnlist', 'buttons', 'allbtn', 'allbuttons'].includes(String(a).toLowerCase())))) {
        if (!filterArg || ['cat', 'cats', 'catmenu', 'category', 'categories', 'aman', 'btnlist', 'buttons', 'allbtn', 'allbuttons', '16'].includes(filterArg)) {
            return await sendCategoryButtonMenu(sock, from, msg, effectiveBotName, effectiveOwnerName, '.');
        }
    }

    // Check if Carousel Cards Slider requested (Style 14)
    if (effectiveStyleId === 14 || (Array.isArray(args) && args.some(a => ['carousel', 'cmenu', 'card', 'cards', 'slide', 'slidemenu'].includes(String(a).toLowerCase())))) {
        return await sendSwipeCarouselMenu(sock, from, msg, effectiveBotName, effectiveOwnerName, '.');
    }

    // Check if Meta AI Button Menu requested (Style 15)
    if (effectiveStyleId === 15 || (Array.isArray(args) && args.some(a => ['btn', 'button', 'meta', 'metaai', 'btnmenu', 'buttonmenu', 'sayron', 'wabot'].includes(String(a).toLowerCase())))) {
        const statsData = {
            isPublic,
            dateStr,
            runtimeStr,
            usedMem,
            totalMem,
            totalCommands: TOTAL_COMMANDS_COUNT
        };
        return await sendMetaAiButtonMenu(sock, from, msg, effectiveBotName, effectiveOwnerName, customName, statsData, null, '.');
    }

    // Resolve target single category (if forced or specified in args)
    const targetCategory = forcedCategory ? resolveCategory(forcedCategory) : (filterArg ? resolveCategory(filterArg) : null);
    const styleObj = STYLES[effectiveStyleId] || STYLES[1];

    const profileData = {
        botName: effectiveBotName,
        ownerName: effectiveOwnerName,
        userName: customName
    };

    // Calculate commands count for stats header
    const displayedCommandsCount = targetCategory && CATEGORIES[targetCategory]
        ? CATEGORIES[targetCategory].length
        : TOTAL_COMMANDS_COUNT;

    const statsData = {
        isPublic,
        dateStr,
        runtimeStr,
        usedMem,
        totalMem,
        totalCommands: displayedCommandsCount
    };

    // 2. Build Aesthetic Header Box
    const headerText = styleObj.makeHeader(profileData, statsData);

    // 3. Category Body Selection (Instant In-RAM retrieval)
    let bodyText = '';
    const styleCache = PRECOMPILED_STYLES.get(effectiveStyleId) || PRECOMPILED_STYLES.get(1);

    if (targetCategory && styleCache?.categoryMap) {
        const entry = styleCache.categoryMap.get(targetCategory.toLowerCase());
        if (entry) {
            bodyText = entry.box;
        }
    } else if (filterArg && styleCache?.categoryMap) {
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

    // 5. Image payload resolution (Custom session image -> Custom global image -> Preloaded RAM buffer -> getBotPic -> Settings URL)
    let imagePayload = null;
    if (profile.menuImage) {
        try {
            imagePayload = fs.readFileSync(profile.menuImage);
        } catch (_) {}
    }
    if (!imagePayload) {
        imagePayload = PRELOADED_MENU_IMAGE;
    }
    if (!imagePayload) {
        const botPic = typeof getBotPic === 'function' ? getBotPic(sock) : null;
        if (botPic) imagePayload = botPic;
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
        const isPaymentRequested = Boolean(isPaymentMenu) || styleObj.isPayment || effectiveStyleId === 13 ||
            (Array.isArray(args) && args.some(a => ['pay', 'payment', 'typ', 'type', 'typmenu', 'typemenu', 'famo'].includes(String(a).toLowerCase())));

        let sentViaRelay = false;
        if (isPaymentRequested) {
            try {
                const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');
                const myLid = sock.user?.lid || '163986666475657@lid';
                const waMsg = generateWAMessageFromContent(from, {
                    requestPaymentMessage: {
                        currencyCodeIso4217: "USD",
                        amount1000: "100000",
                        requestFrom: myLid,
                        noteMessage: {
                            extendedTextMessage: {
                                text: menuText,
                                contextInfo: channelContext
                            }
                        },
                        expiryTimestamp: "0",
                        amount: {
                            value: "100000",
                            offset: 1000,
                            currencyCode: "USD"
                        }
                    }
                }, { quoted: msg, userJid: sock.user?.id });

                await sock.relayMessage(from, waMsg.message, { messageId: waMsg.key.id });
                sentViaRelay = true;
            } catch (relayErr) {
                console.warn('[menuCommand] Relay payment message failed, falling back to standard send:', relayErr.message);
            }
        }

        if (!sentViaRelay) {
            // Reliable 2-Card Delivery (Guaranteed within WhatsApp caption limit):
            // If menu text fits within WhatsApp media caption limit (<= 1500 chars, e.g. single category):
            // Card 1: Image + Category Commands
            // Card 2: Google Search Card
            // For full menu (1,020 commands, 21KB):
            // Card 1: Menu Image + Bot Specifications Header (fits safely in image caption)
            // Card 2: All Commands List + Google Search Card (in full text message, supports up to 65KB)
            const combinedCommandsAndSearch = `${(bodyText + footerText).trim()}\n\n${GOOGLE_LINKS_CARD}`;

            if (imagePayload) {
                if (menuText.length <= 1500) {
                    try {
                        await sock.sendMessage(from, { image: imagePayload, caption: menuText, contextInfo: channelContext }, { quoted: msg });
                        await sock.sendMessage(from, { text: GOOGLE_LINKS_CARD, contextInfo: channelContext });
                    } catch (imgErr) {
                        console.warn('[menuCommand] Short image menu failed, falling back to text:', imgErr.message);
                        await sock.sendMessage(from, { text: `${menuText}\n\n${GOOGLE_LINKS_CARD}`, contextInfo: channelContext }, { quoted: msg });
                    }
                } else {
                    // Full menu: Card 1 (Image + Header), Card 2 (Commands + Google Search)
                    try {
                        await sock.sendMessage(from, { image: imagePayload, caption: headerText.trim(), contextInfo: channelContext }, { quoted: msg });
                        await sock.sendMessage(from, { text: combinedCommandsAndSearch, contextInfo: channelContext });
                    } catch (imgErr) {
                        console.warn('[menuCommand] Image send failed, sending pure text menu:', imgErr.message);
                        await sock.sendMessage(from, { text: `${menuText}\n\n${GOOGLE_LINKS_CARD}`, contextInfo: channelContext }, { quoted: msg });
                    }
                }
            } else {
                await sock.sendMessage(from, { text: headerText.trim(), contextInfo: channelContext }, { quoted: msg });
                await sock.sendMessage(from, { text: combinedCommandsAndSearch, contextInfo: channelContext });
            }
        } else {
            // If sent via payment relay, deliver Card 2 (Google Search Card) right after
            try {
                await sock.sendMessage(from, { text: GOOGLE_LINKS_CARD, contextInfo: channelContext }, { quoted: msg });
            } catch (relayCard2Err) {
                console.error('[menuCommand] Error sending google search card after relay:', relayCard2Err.message);
                await sock.sendMessage(from, { text: GOOGLE_LINKS_CARD }).catch(() => {});
            }
        }
    } catch (err) {
        console.error('[menuCommand] Error sending menu:', err.message);
        await sock.sendMessage(from, { text: `${menuText}\n\n${GOOGLE_LINKS_CARD}` }, { quoted: msg }).catch(() => {});
    }
}

module.exports = {
    menuCommand,
    setmenuCommand,
    resolveCategory,
    getStyleCatalog,
    STYLES,
    CATEGORIES,
    toSansBold,
    toSansItalic,
    toSmallCaps
};
