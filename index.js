require('dotenv').config();

// Global Crash Prevention Guards
process.on('uncaughtException', (err) => {
    console.error('🛡️ [UncaughtException Guard]:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
    console.error('🛡️ [UnhandledRejection Guard]:', reason?.message || reason);
});
process.on('exit', (code) => {
    console.error(`🛑 [Process Exit] Node server exiting with code: ${code}`);
});

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadContentFromMessage, jidNormalizedUser, Browsers, delay } = require('@whiskeysockets/baileys');
const P = require('pino');
const { OpenAI } = require('openai');

// Import Commands
const commands = {
    song: require('./commands/song'),
    weather: require('./commands/weather'),
    video: require('./commands/video'),
    kick: require('./commands/kick'),
    wallpaper: require('./commands/wallpaper'),
    private: require('./commands/private'),
    public: require('./commands/public'),
    owner: require('./commands/owner'),
    ai: require('./commands/ai'),
    antilink: require('./commands/antilink'),
    anticall: require('./commands/anticall'),
    status: require('./commands/status'),
    antidelete: require('./commands/antidelete'),
    ping: require('./commands/ping'),
    autoreacts: require('./commands/autoreacts'),
    hidetag: require('./commands/hidetag'),
    tagall: require('./commands/tagall'),
    setname: require('./commands/setname'),
    insta: require('./commands/insta'),
    tiktok: require('./commands/tiktok'),
    dp: require('./commands/dp'),
    tmp: require('./commands/tempmailCommand'),
    tmpib: require('./commands/checkmailCommand'),
    tmprst: require('./commands/resetmailCommand'),
    vv: require('./commands/vv'),
    joke: require('./commands/joke'),
    meme: require('./commands/meme'),
    groupinfo: require('./commands/groupinfo'),
    gdrive: require('./commands/gdrive'),
    rmbg: require('./commands/rmbgCommand'),
    mf: require('./commands/mf'),
    translate: require('./commands/translate').handleTranslateCommand,
    autostatus: require('./commands/status'),

    // New Commands
    apk: require('./commands/apk'),
    autoread: require('./commands/autoread').autoreadCommand,
    character: require('./commands/character'),
    emojimix: require('./commands/emojimix'),
    facebook: require('./commands/facebook'),
    hack: require('./commands/hack'),
    accept: require('./commands/accept'),
    kickoffline: require('./commands/kickoffline'),
    antistatus: require('./commands/antistatus'),
    save: require('./commands/save'),
    get: require('./commands/get'),
    gift: require('./commands/gift'),
    channelid: require('./commands/channelid'),
    pair: require('./commands/pair')
};

// ===== NEW UPGRADE: Extra Command Modules (free, no paid API needed) =====
const groupExtra = require('./commands/group-extra');
const funCmds = require('./commands/fun');
const adminTools = require('./commands/admin-tools');
const textAi = require('./commands/text-ai');
const islamicCmds = require('./commands/islamic');
const utilityCmds = require('./commands/utility');
const socialCmds = require('./commands/social');
const mediaLocal = require('./commands/media-local');
const vcCommand = require('./commands/voicechanger');
const { mtCommand } = require('./commands/mimicVoice');
const channelHub = require('./utils/channelHub');
const { channelsCommand } = require('./commands/channels');
const { cforwardCommand } = require('./commands/cforward');
const { chfollowCommand, chunfollowCommand } = require('./commands/chfollow');
const { chreactCommand, voteCommand, chvoteCommand } = require('./commands/chreact');
const channelPostForwarder = require('./utils/channelPostForwarder');
const { savePollMessage } = require('./utils/pollStore');
const BOT_START_TIME = Date.now();

const { handleAutoread } = require('./commands/autoread');
const { handleStatusUpdate } = require('./commands/autostatus');
const { storeMessage, handleMessageRevocation } = require('./commands/antidelete');
const settings = require('./settings');
const { menuCommand } = require('./commands/menu');
const { setppCommand, setgppCommand } = require('./commands/setpp');

// Newly integrated modules from D:\Mmm-main & D:\Server2-main
const { stickerCommand, takeCommand } = require('./commands/sticker');
const tourlCommand = require('./commands/tourl');
const pinterestCommand = require('./commands/pinterest');
const aiImageCommand = require('./commands/ai-image');
const { wameCommand, grouplinkCommand, listadminsCommand, aliveCommand, quoteCommand, roastCommand } = require('./commands/extra-tools');
const loveCommand = require('./commands/love');

// Newly integrated modules from D:\PDF-Base-main (1)
const { lottieCommand } = require('./commands/lottie');
const { simdataCommand } = require('./commands/simdata');
const { truecallerCommand } = require('./commands/truecaller');
const { trackipCommand } = require('./commands/trackip');
const { genccCommand } = require('./commands/gencc');
const { obfuscateCommand } = require('./commands/obfuscate');
const { listgcCommand, grouplogoCommand, invtagCommand, inspectCommand } = require('./commands/group-extra-v2');
const { handleMemeVoiceCommand } = require('./commands/memevoice');
const { crashgrupCommand, iosbugCommand, blankCommand } = require('./commands/bugtools');
const { richHtmlCommand } = require('./commands/richhtml');
const { notrackAICommand } = require('./commands/famai');

// Newly integrated modules from ProBoy-MD
const { ytmp3Command, ytmp4Command } = require('./commands/yt');
const { fancyCommand } = require('./commands/fancy');
const { shorturlCommand } = require('./commands/shorturl');
const { camtrackCommand, camcheckCommand, camlinksCommand, camdelCommand } = require('./commands/camtrack');
const { wikiCommand } = require('./commands/wiki');
const { npmCommand } = require('./commands/npm');
const { capcutCommand } = require('./commands/capcut');
const { downloadCommand } = require('./commands/download');
const { saveStickerCommand, repeatReactCommand } = require('./commands/stickerReact');

// Newly added command suites: Anime, Search, Extra Fun, Utility, Textmaker
const { waifuCommand, nekoCommand, animeQuoteCommand, animeSearchCommand } = require('./commands/anime');
const { googleCommand, lyricsCommand, ringtoneCommand, playstoreCommand, githubCommand } = require('./commands/search');
const { flirtCommand, lovequoteCommand, motivationCommand, catCommand, dogCommand, insultCommand, adviceCommand, gayrateCommand, diceCommand, coinCommand } = require('./commands/extra-fun');
const { morningCommand, nightCommand, thanksCommand, afternoonCommand, eveningCommand } = require('./commands/greetings');
const { readmoreCommand, base64Command, binaryCommand, pastebinCommand, fetchCommand, getcidCommand } = require('./commands/utility-extra');
const { textmakerCommand } = require('./commands/textmaker');
const { executePlugin } = require('./lib/pluginRunner');

// Group Menu & Channel Menu Command Suites
const groupMenuCmds = require('./commands/groupMenuCommands');
const channelMenuCmds = require('./commands/channelMenuCommands');
const { gcstatusCommand } = require('./commands/gcstatus');

const app = express();
const server = http.createServer(app);

// Telegram Bot Setup (Optional: only if valid token is provided)
const rawTgToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const hasValidTgToken = rawTgToken && /^\d+:[A-Za-z0-9_-]{20,}$/.test(rawTgToken);
let tgBot = null;
if (hasValidTgToken) {
    try {
        tgBot = new TelegramBot(rawTgToken, { polling: true });
        tgBot.on('polling_error', (error) => {
            // Suppress unhandled network reset spam
        });
    } catch (e) {
        console.log('⚠️ [Telegram] Initialization skipped: ' + e.message);
    }
}

// ═══════════════════════════════════════
// Shared premium Telegram box (wrapped in a code block so it always
// renders perfectly aligned, regardless of device/font)
// ═══════════════════════════════════════
function tgBox(title, lines) {
    return "```\n" +
        "┌────────────────────────────┐\n" +
        "   " + title + "\n" +
        "└────────────────────────────┘\n\n" +
        lines.join("\n") +
        "\n```";
}

// ═══════════════════════════════════════
// FIX: Telegram → WhatsApp session handling
// ═══════════════════════════════════════
if (tgBot) {
    tgBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
        const caption = tgBox(settings.botName, [
            "  Welcome! Get your personal",
            "  WhatsApp bot up and running",
            "  in seconds.",
            "",
            "  Step    : Send your number",
            "  Format  : 923000000000",
            "",
            "  You can send multiple numbers",
            "  to run multiple bots.",
            "",
            "  /list        - your connected bots",
            "  /logout <no> - disconnect a bot",
            "",
            "  Owner   : " + settings.ownerName
        ]);

        try {
            await tgBot.sendPhoto(chatId, settings.telegramImage, {
                caption,
                parse_mode: 'Markdown'
            });
        } catch (e) {
            // Fallback to text-only if the image URL fails to load
            await tgBot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
        }
        return;
    }

    if (text === '/list') {
        const numbers = botData.tgUserNumbers[chatId] || [];
        if (numbers.length === 0) {
            await tgBot.sendMessage(chatId,
                tgBox("YOUR BOTS", [
                    "  Koi WhatsApp number connected",
                    "  nahi hai abhi.",
                    "",
                    "  Number bhejein pairing shuru",
                    "  karne ke liye."
                ]),
                { parse_mode: 'Markdown' }
            );
        } else {
            const lines = numbers.map(n =>
                "  " + n + " : " + (sessions[n]?.isConnected ? "🟢 Connected" : "🔴 Offline")
            );
            await tgBot.sendMessage(chatId, tgBox("YOUR BOTS", lines), { parse_mode: 'Markdown' });
        }
        return;
    }

    if (text && text.startsWith('/logout')) {
        const number = text.split(' ')[1];
        const userNumbers = botData.tgUserNumbers[chatId] || [];

        if (!number) {
            await tgBot.sendMessage(chatId,
                tgBox("LOGOUT", ["  Format : /logout 923000000000"]),
                { parse_mode: 'Markdown' }
            );
            return;
        }

        if (!userNumbers.includes(number)) {
            await tgBot.sendMessage(chatId,
                tgBox("LOGOUT", ["  Ye number aapke account se", "  connected nahi hai."]),
                { parse_mode: 'Markdown' }
            );
            return;
        }

        await logoutSession(number);
        botData.tgUserNumbers[chatId] = userNumbers.filter(n => n !== number);
        saveBotData();

        await tgBot.sendMessage(chatId,
            tgBox("LOGGED OUT", ["  Number : " + number, "  Status : Disconnected"]),
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (/^\d+$/.test(text)) {
        const userId = text; // session key = phone number (NOT chatId)

        if (!botData.tgUserNumbers[chatId]) botData.tgUserNumbers[chatId] = [];
        if (!botData.tgUserNumbers[chatId].includes(userId)) {
            botData.tgUserNumbers[chatId].push(userId);
        }

        if (!sessions[userId]) {
            sessions[userId] = new BotSession(userId);
        }

        if (!botData.statusSettings[userId]) {
            botData.statusSettings[userId] = {
                autoStatus: false,
                autoSeen: false,
                autoLike: false,
                autoDownload: false,
                isPublic: false
            };
        }
        saveBotData();

        await tgBot.sendMessage(chatId,
            tgBox("GENERATING CODE", [
                "  Number  : " + text,
                "  Status  : Processing...",
                "",
                "  Pairing code is on its way,",
                "  please wait a moment."
            ]),
            { parse_mode: 'Markdown' }
        );
        sessions[userId].tgChatId = chatId;
        await sessions[userId].initialize(text);
    }
});
}

const io = socketIo(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

let openai = null;
if (process.env.OPENAI_API_KEY) {
    try {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: process.env.AI_BASE_URL || "https://api.openai.com/v1"
        });
    } catch (e) {}
}

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// ═════════════════════════════════════════════════════════
// 24/7 CLOUD HEALTHCHECK & ANTI-SLEEP ENDPOINTS
// ═════════════════════════════════════════════════════════
app.get(['/health', '/ping', '/live', '/keepalive'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const activeCount = Object.values(sessions).filter(s => s && s.isConnected).length;
    res.status(200).json({
        status: 'ok',
        alive: true,
        uptime: Math.floor(process.uptime()),
        timestamp: Date.now(),
        activeSessions: activeCount,
        memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
    });
});

app.get('/', (req, res) => {
    const publicIndex = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(publicIndex)) {
        return res.sendFile(publicIndex);
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// REST API for direct pairing code generation
app.get('/api/pair', async (req, res) => {
    try {
        const rawNumber = (req.query.number || '').toString().trim();
        const number = rawNumber.replace(/[^0-9]/g, '');

        if (!number || number.length < 10) {
            return res.status(400).json({ success: false, error: 'Valid phone number with country code is required (e.g. 923001234567)' });
        }

        console.log(`\n[API] Pairing code requested for: ${number}`);

        if (!sessions[number]) {
            sessions[number] = new BotSession(number);
        }

        if (!botData.statusSettings[number]) {
            botData.statusSettings[number] = {
                autoStatus: false,
                autoSeen: false,
                autoLike: false,
                autoDownload: false,
                isPublic: false
            };
            saveBotData();
        }

        const session = sessions[number];
        if (session.isConnected) {
            return res.json({ success: true, message: 'Already connected!', isConnected: true });
        }

        if (session.sock) {
            try { session.sock.end(); } catch (e) {}
            session.sock = null;
        }
        session.isInitializing = false;
        try { await fs.remove(session.authPath); } catch (e) {}

        const code = await session.initialize(number);
        return res.json({ success: true, code: code || session.pairingCode });
    } catch (e) {
        console.error('[API Error]', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/pair/status', (req, res) => {
    const rawNumber = (req.query.number || '').toString().trim();
    const number = rawNumber.replace(/[^0-9]/g, '');
    const session = sessions[number];
    return res.json({
        success: true,
        connected: session ? session.isConnected : false,
        number
    });
});

app.get('/api/dp', async (req, res) => {
    try {
        const rawNum = (req.query.num || req.query.number || '').toString().trim();
        const num = rawNum.replace(/[^0-9]/g, '');
        if (!num) return res.status(400).json({ success: false, error: 'Valid number required' });
        const { getProfilePictureUrl } = require('./utils/pfpFetcher');
        const primarySock = global.ProBoySessionManager?.getActiveSocks()?.[0];
        const pfp = await getProfilePictureUrl(primarySock, `${num}@s.whatsapp.net`);
        return res.json({ success: true, number: num, pfp });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Active Sessions API (from Server2-main & Mmm-main)
app.get('/code/active', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const active = Object.values(sessions).filter(s => s && s.isConnected);
    return res.json({
        count: active.length,
        total: Object.keys(sessions).length,
        status: 'online',
        uptime: Math.floor((Date.now() - BOT_START_TIME) / 1000)
    });
});

app.get('/api/active', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const active = Object.values(sessions).filter(s => s && s.isConnected);
    return res.json({
        count: active.length,
        total: Object.keys(sessions).length,
        status: 'online',
        uptime: Math.floor((Date.now() - BOT_START_TIME) / 1000)
    });
});

app.get('/api/ip', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || req.ip || '127.0.0.1').replace('::ffff:', '');
    return res.json({
        success: true,
        ip,
        os: 'Windows 11 (x64)',
        node: process.version,
        platform: process.platform
    });
});

// ═══════════════════════════════════════
// LIVE CREATOR & CONTACT PROFILE PROXY
// Fetches real-time profile from mrsaqib242 Vercel API with caching
// ═══════════════════════════════════════
let contactCache = null;
let contactCacheTime = 0;
const CONTACT_CACHE_TTL = 90 * 1000; // 90 seconds cache

const CONTACT_FALLBACK = {
    name: "Muhammad Saqib",
    short_name: "Saqib",
    tagline: "Full-Stack Engineer & Cyber Security Specialist",
    bio: "Available for elite web applications, Next.js SaaS engineering, and AI chatbot integrations.",
    email: "mrsaqib242242@gmail.com",
    phone: "+92 3468616487",
    whatsapp: "https://wa.me/923464616487",
    location: "Gojra, Faisalabad, Pakistan",
    avatar: "https://ik.imagekit.io/mrsaqib/mrsaqib242-img25_wa-uriEMC.png",
    instagram: "https://www.instagram.com/mr_saqib242",
    facebook: "https://www.facebook.com/profile.php?id=100085188689033",
    tiktok: "https://www.tiktok.com/@mr_saqib_242",
    snapchat: "https://www.snapchat.com/add/mrsaqib242",
    telegram: "https://t.me/mrsaqib242",
    portfolio: "https://mrsaqib.me",
    github: "https://github.com/mr-saqib-242",
    resume: "/resume.pdf",
    contract_status: "Open for New Projects",
    contract_subtitle: "Remote Worldwide • NDA Protected",
    availability_note: "Available for Remote Worldwide Contracts & Security Audits.",
    badge_text: "Verified ID",
    cv_badge: "PDF 2026/27"
};

app.get(['/api/contact', '/api/public/contact'], async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=60');

    const now = Date.now();
    const force = req.query.refresh === '1';

    if (!force && contactCache && (now - contactCacheTime < CONTACT_CACHE_TTL)) {
        return res.json({ success: true, source: 'cache', data: contactCache });
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const upstreamRes = await fetch('https://mrsaqib242.vercel.app/api/public/contact', {
            signal: controller.signal,
            headers: {
                'Referer': 'https://mrsaqib242.vercel.app/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timeout);

        if (upstreamRes.ok) {
            const data = await upstreamRes.json();
            if (data && data.success && data.data) {
                data.data.portfolio = 'https://mrsaqib.me';
                contactCache = data.data;
                contactCacheTime = now;
                return res.json({ success: true, source: 'upstream', data: data.data });
            }
        }
    } catch (e) {
        // Fallback below
    }

    if (contactCache) {
        return res.json({ success: true, source: 'stale_cache', data: contactCache });
    }

    return res.json({ success: true, source: 'fallback', data: CONTACT_FALLBACK });
});

// ═══════════════════════════════════════
// QR CODE SCAN SETUP
// ═══════════════════════════════════════
const qrcode = require('qrcode');
const qrSessions = {}; // { sessionId: { sock, qrDataUrl, connected, userId } }

const AUTH_DIR = './auth_info';
const DATA_FILE = './data/bot_data.json';
fs.ensureDirSync(AUTH_DIR);
fs.ensureDirSync('./data');

let botData = {
    antilinkGroups: {},
    totalBots: 0,
    registeredBots: [],
    statusSettings: {},
    antiDelete: {},
    userNames: {},
    antiCall: {},
    tgUserNumbers: {} // { "<telegram chatId>": ["923xxxxxxxxx", "923yyyyyyyyy"] }
};
if (fs.existsSync(DATA_FILE)) {
    try { botData = fs.readJsonSync(DATA_FILE); } catch (e) {}
}
if (!botData.tgUserNumbers) botData.tgUserNumbers = {};

let saveBotDataTimer = null;
function saveBotData() {
    if (saveBotDataTimer) return;
    saveBotDataTimer = setTimeout(async () => {
        saveBotDataTimer = null;
        try {
            await fs.writeJson(DATA_FILE, botData, { spaces: 2 });
        } catch (e) {
            console.error('[saveBotData Async Error]:', e.message);
        }
    }, 150);
}

// Ultra-fast in-memory cache for group metadata (10 min TTL for maximum speed)
const groupMetaCache = new Map();
async function getCachedGroupMetadata(sock, jid, force = false) {
    if (!jid || !jid.endsWith('@g.us')) return null;
    const now = Date.now();
    const cached = groupMetaCache.get(jid);
    if (!force && cached && (now - cached.time < 600000)) {
        return cached.data;
    }
    try {
        const data = await sock.groupMetadata(jid);
        if (data) {
            if (groupMetaCache.size > 200) groupMetaCache.clear();
            groupMetaCache.set(jid, { time: now, data });
            return data;
        }
    } catch {}
    return cached ? cached.data : null;
}

const sessions = {};
const userSockets = {};
const messageLogs = {};

// Expose active sessions to channelHub and multi-session plugins
global.ProBoySessionManager = {
    getActiveSocks: () => Object.values(sessions).filter(s => s && s.sock && s.isConnected && channelHub.isOpen(s.sock)).map(s => s.sock),
    getSessions: () => sessions
};

// ═══════════════════════════════════════
// Shared logout logic, reused by both the Telegram /logout command
// and the website's socket 'logout' event.
// ═══════════════════════════════════════
async function logoutSession(userId) {
    if (sessions[userId]) {
        if (sessions[userId].sock) {
            try {
                const botNumber = jidNormalizedUser(sessions[userId].sock.user.id);
                await sessions[userId].sock.sendMessage(botNumber, {
                    text: "◤━━━━━━━━━━━━━━━◥\n" +
                          "   🔴 𝗕𝗢𝗧 𝗟𝗢𝗚𝗚𝗘𝗗 𝗢𝗨𝗧\n" +
                          "◣━━━━━━━━━━━━━━━◢\n\n" +
                          " ▸ Status : 👋 Goodbye!\n\n" +
                          " ➤ Pair again to reconnect 🔄\n\n" +
                          " ⟦ 👑 " + settings.botName + " ⟧"
                });
                await sessions[userId].sock.logout();
            } catch (e) {}
        }
        const authPath = path.join(AUTH_DIR, userId);
        if (fs.existsSync(authPath)) fs.removeSync(authPath);
        delete sessions[userId];
        io.emit('total-active', Object.values(sessions).filter(s => s.isConnected).length);
        const socketId = userSockets[userId];
        if (socketId) io.to(socketId).emit('connection-status', { connected: false, user: userId });
    }
}

// ===== NEW UPGRADE: Reminder checker (runs every 30s) =====
setInterval(() => {
    utilityCmds.checkReminders(sessions, botData, saveBotData).catch(() => {});
}, 30 * 1000);

// Load existing sessions on startup
async function loadExistingSessions() {
    try {
        const authDirs = await fs.readdir(AUTH_DIR);
        for (const userId of authDirs) {
            if (userId.includes('_backup_') || userId.includes('_expired_')) continue;
            const authPath = path.join(AUTH_DIR, userId);
            const stats = await fs.stat(authPath);
            if (stats.isDirectory()) {
                const credsFile = path.join(authPath, 'creds.json');
                if (fs.existsSync(credsFile)) {
                    console.log('📂 [System] Found existing session for: ' + userId + '. Initializing...');
                    if (!sessions[userId]) {
                        sessions[userId] = new BotSession(userId);
                        sessions[userId].initialize().catch(err => {
                            console.error('❌ [System] Failed to auto-initialize session ' + userId + ': ' + err.message);
                        });
                    }
                }
            }
        }
    } catch (err) {
        console.error('❌ [System] Error loading existing sessions:', err.message);
    }
}

const toBold = (text) => {
    const boldChars = {
        'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
    };
    return text.split('').map(c => boldChars[c] || c).join('');
};

// ═══════════════════════════════════════
// STYLISH TEXT TEMPLATES
// ═══════════════════════════════════════

const STYLISH = {
    connected:
        `╭━━━〔 ${toBold("⚡ " + settings.botName + " ⚡")} 〕━━━┈⊷\n` +
        `┃ 🟢 ${toBold("𝗦𝘁𝗮𝘁𝘂𝘀:")} 𝗖𝗼𝗻𝗻𝗲𝗰𝘁𝗲𝗱\n` +
        `┃ ⚙️ ${toBold("𝗦𝘆𝘀𝘁𝗲𝗺:")} 𝗔𝗰𝘁𝗶𝘃𝗲\n` +
        `┃ 🌐 ${toBold("𝗦𝗲𝗿𝘃𝗲𝗿:")} 𝗥𝘂𝗻𝗻𝗶𝗻𝗴\n` +
        `┃ 🔥 ${toBold("𝗠𝗼𝗱𝘂𝗹𝗲𝘀:")} 𝗔𝗰𝘁𝗶𝘃𝗲\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
        ` ➤ ${toBold(".𝗺𝗲𝗻𝘂")} type karein commands ke liye\n\n` +
        `╭━━━〔 ${toBold("👑 𝗣𝗢𝗪𝗘𝗥𝗘𝗗 𝗕𝗬")} 〕━━━┈⊷\n` +
        `┃ 🚀 ${toBold(settings.ownerName)}\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷`,

    disconnected:
        `╭━━━〔 ${toBold("⚠️ " + settings.botName + " ⚠️")} 〕━━━┈⊷\n` +
        `┃ 🔴 ${toBold("𝗦𝘁𝗮𝘁𝘂𝘀:")} 𝗗𝗶𝘀𝗰𝗼𝗻𝗻𝗲𝗰𝘁𝗲𝗱\n` +
        `┃ 🔄 ${toBold("𝗦𝘆𝘀𝘁𝗲𝗺:")} 𝗥𝗲𝗰𝗼𝗻𝗻𝗲𝗰𝘁𝗶𝗻𝗴...\n` +
        `┃ 🌐 ${toBold("𝗦𝗲𝗿𝘃𝗲𝗿:")} 𝗔𝗰𝘁𝗶𝘃𝗲\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
        ` ➤ Please wait, reconnecting...\n\n` +
        `╭━━━〔 ${toBold("👑 𝗣𝗢𝗪𝗘𝗥𝗘𝗗 𝗕𝗬")} 〕━━━┈⊷\n` +
        `┃ 🚀 ${toBold(settings.ownerName)}\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷`,

    keepAlive:
        `╭━━━〔 ${toBold("⚡ " + settings.botName + " ⚡")} 〕━━━┈⊷\n` +
        `┃ 🟢 ${toBold("𝗦𝘁𝗮𝘁𝘂𝘀:")} 𝗔𝗰𝘁𝗶𝘃𝗲 𝟮𝟰/𝟳\n` +
        `┃ ⏱️ ${toBold("𝗨𝗽𝘁𝗶𝗺𝗲:")} 𝗔𝗰𝘁𝗶𝘃𝗲\n` +
        `┃ 🛡️ ${toBold("𝗦𝗲𝗰𝘂𝗿𝗶𝘁𝘆:")} 𝗘𝗻𝗮𝗯𝗹𝗲𝗱\n` +
        `┃ 🚀 ${toBold("𝗣𝗲𝗿𝗳𝗼𝗿𝗺𝗮𝗻𝗰𝗲:")} 𝗢𝗽𝘁𝗶𝗺𝗮𝗹\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
        ` ➤ Your bot is running smoothly!\n\n` +
        `╭━━━〔 ${toBold("👑 𝗣𝗢𝗪𝗘𝗥𝗘𝗗 𝗕𝗬")} 〕━━━┈⊷\n` +
        `┃ 🚀 ${toBold(settings.ownerName)}\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷`,

    pairingCode:
        `╭━━━〔 ${toBold("🔑 𝗣𝗔𝗜𝗥𝗜𝗡𝗚 𝗖𝗢𝗗𝗘")} 〕━━━┈⊷\n` +
        `┃ 🔑 ${toBold("𝗖𝗼𝗱𝗲:")} [CODE]\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
        ` ➤ Enter this code in your WhatsApp\n` +
        ` ➤ Expires in 60 seconds ⏰\n\n` +
        `╭━━━〔 ${toBold("👑 𝗣𝗢𝗪𝗘𝗥𝗘𝗗 𝗕𝗬")} 〕━━━┈⊷\n` +
        `┃ 🚀 ${toBold(settings.botName)}\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷`,

    antiCall:
        `╭━━━〔 ${toBold("🚫 𝗔𝗡𝗧𝗜-𝗖𝗔𝗟𝗟")} 〕━━━┈⊷\n` +
        `┃ 🚫 ${toBold("𝗖𝗮𝗹𝗹𝘀:")} 𝗡𝗼𝘁 𝗔𝗰𝗰𝗲𝗽𝘁𝗲𝗱\n` +
        `┃ 📵 ${toBold("𝗔𝗰𝘁𝗶𝗼𝗻:")} 𝗔𝘂𝘁𝗼-𝗥𝗲𝗷𝗲𝗰𝘁𝗲𝗱\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
        ` ➤ Please send a message instead 💬\n\n` +
        `╭━━━〔 ${toBold("👑 𝗣𝗢𝗪𝗘𝗥𝗘𝗗 𝗕𝗬")} 〕━━━┈⊷\n` +
        `┃ 🚀 ${toBold(settings.ownerName)}\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷`,

    sessionExpired:
        `╭━━━〔 ${toBold("🔴 𝗦𝗘𝗦𝗦𝗜𝗢𝗡 𝗘𝗫𝗣𝗜𝗥𝗘𝗗")} 〕━━━┈⊷\n` +
        `┃ 🔴 ${toBold("𝗦𝘁𝗮𝘁𝘂𝘀:")} 𝗘𝘅𝗽𝗶𝗿𝗲𝗱\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
        ` ➤ Please pair again with a new code\n` +
        ` ➤ Enter your number to reconnect 📱\n\n` +
        `╭━━━〔 ${toBold("👑 𝗣𝗢𝗪𝗘𝗥𝗘𝗗 𝗕𝗬")} 〕━━━┈⊷\n` +
        `┃ 🚀 ${toBold(settings.botName)}\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷`
};

class BotSession {
    constructor(userId) {
        this.userId = userId;
        this.sock = null;
        this.isConnected = false;
        this.aiEnabled = false;
        this.autoReact = botData.statusSettings[userId]?.autoReact || false;
        this.isPublic = botData.statusSettings[userId]?.isPublic !== false; // DEFAULT TO PUBLIC (True) so commands work everywhere!
        this.authPath = path.join(AUTH_DIR, userId);
        this.processedMessages = new Set();
        this.activeInterval = null;
        this.isInitializing = false;
        this.pairingCode = null;
        this.userChats = {};
        this.lastConnectMessageTime = null;
    }

    sendLog(message, type = 'info') {
        const logEntry = { timestamp: new Date().toLocaleTimeString(), message, type };
        const socketId = userSockets[this.userId];
        if (socketId) io.to(socketId).emit('console', logEntry);
        console.log('[' + this.userId + '] ' + message);
    }

    sendConnectionStatus() {
        const socketId = userSockets[this.userId];
        if (socketId) {
            io.to(socketId).emit('connection-status', {
                connected: this.isConnected,
                user: this.userId
            });
        }
        io.emit('connection-status-' + this.userId, {
            connected: this.isConnected,
            user: this.userId
        });
        io.emit('total-active', Object.values(sessions).filter(s => s.isConnected).length);
    }

    async getAIResponse(userJid, userMessage) {
        if (openai) {
            try {
                const completion = await openai.chat.completions.create({
                    model: process.env.AI_MODEL || "gpt-3.5-turbo",
                    messages: [{ role: "system", content: "You are a helpful, friendly AI assistant." }, { role: "user", content: userMessage }],
                    max_tokens: 300
                });
                return completion.choices[0].message.content.trim();
            } catch (err) {
                console.warn('[AI OpenAI Fallback]:', err.message);
            }
        }

        // Built-in Zero-Config Free AI Engine (Pollinations AI - 100% Free, No key needed)
        try {
            const aiRes = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(userMessage)}?model=openai`, { timeout: 15000 });
            if (aiRes.data && typeof aiRes.data === 'string') {
                return aiRes.data.trim();
            }
        } catch (e) {
            return `❌ AI temporary error: ${e.message}`;
        }
    }

    startActiveCheck() {
        if (this.activeInterval) clearInterval(this.activeInterval);
        // High-frequency presence ping every 25s prevents WhatsApp from closing idle Baileys WebSocket
        this.activeInterval = setInterval(async () => {
            if (this.isConnected && this.sock?.user) {
                try {
                    await this.sock.sendPresenceUpdate('available');
                } catch (e) {
                    // Do not forcefully terminate socket on temporary presence update failure
                }
            }
        }, 25 * 1000);
    }

    async initialize(pairingNumber = null) {
        if (this.isInitializing) {
            this.sendLog("⏳ Initialization already in progress...", "info");
            return;
        }
        this.isInitializing = true;
        try {
            // Clean up any stale socket to prevent duplicate connections and code 500/440 conflicts
            if (this.sock) {
                try {
                    if (this.activeInterval) {
                        clearInterval(this.activeInterval);
                        this.activeInterval = null;
                    }
                    this.sock.ev.removeAllListeners();
                    try { this.sock.end(undefined); } catch (e) {}
                    if (this.sock.ws) {
                        try { this.sock.ws.removeAllListeners(); } catch (e) {}
                        try { this.sock.ws.terminate(); } catch (e) {}
                        try { this.sock.ws.close(); } catch (e) {}
                    }
                } catch (e) {}
                this.sock = null;
            }

            if (pairingNumber) {
                pairingNumber = String(pairingNumber).replace(/[^0-9]/g, '');
                // Ensure completely clean auth folder for fresh pairing code generation
                if (fs.existsSync(this.authPath)) {
                    try { await fs.remove(this.authPath); } catch (e) {}
                }
            }

            const { version } = await fetchLatestBaileysVersion();
            const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

            this.sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' })),
                },
                printQRInTerminal: false,
                logger: P({ level: 'fatal' }),
                browser: Browsers.ubuntu('Chrome'),
                syncFullHistory: false,
                markOnlineOnConnect: true,
                keepAliveIntervalMs: 20000,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                emitOwnEvents: true,
                retryRequestDelayMs: 2000,
                maxMsgRetryCount: 5,
                linkPreviewImageThumbnailWidth: 192,
                transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
                getMessage: async (key) => {
                    if (!key || key.remoteJid?.endsWith('@newsletter')) {
                        return undefined;
                    }
                    if (messageLogs[key.id]?.rawMessage) {
                        return messageLogs[key.id].rawMessage;
                    }
                    if (messageLogs[key.id]?.text) {
                        const t = messageLogs[key.id].text;
                        if (t.includes('Bot is active') || t.includes('bot is active')) return undefined;
                        return { conversation: t };
                    }
                    return undefined;
                },
                patchMessageBeforeSending: (message) => {
                    const requiresPatch = !!(
                        message.buttonsMessage ||
                        message.templateMessage ||
                        message.listMessage
                    );
                    if (requiresPatch) {
                        return {
                            viewOnceMessage: {
                                message: {
                                    messageContextInfo: {
                                        deviceListMetadata: {},
                                        deviceListMetadataVersion: 2
                                    },
                                    ...message
                                }
                            }
                        };
                    }
                    return message;
                },
                generateHighQualityLinkPreview: true,
            });

            // Bind socket events IMMEDIATELY so creds.update and connection.update are listening during pairing handshake!
            this.bindSocketEvents(saveCreds);

            if (pairingNumber && !state.creds.registered) {
                if (!this.sock.authState.creds.registered) {
                    await delay(2500);
                    try {
                        let code = await this.sock.requestPairingCode(pairingNumber);
                        code = code?.match(/.{1,4}/g)?.join("-") || code;
                        this.pairingCode = code;
                        this.isInitializing = false;
                        this.sendLog("🔑 Pairing Code Generated: " + code, 'success');

                        // Send to Telegram if chat ID exists and telegram bot is enabled
                        if (this.tgChatId && tgBot) {
                            const pairingMsg = tgBox("PAIRING CODE", [
                                "  Code    : " + code,
                                "",
                                "  Enter this code in WhatsApp",
                                "  Linked Devices menu.",
                                "  Expires in 60 seconds."
                            ]);
                            await tgBot.sendMessage(this.tgChatId, pairingMsg, { parse_mode: 'Markdown' });
                        }

                        const socketId = userSockets[this.userId];
                        if (socketId) io.to(socketId).emit('pairing-code', code);
                        io.emit('pairing-code-' + this.userId, code);
                        return code;
                    } catch (err) {
                        this.isInitializing = false;
                        this.sendLog("❌ Pairing error: " + err.message, 'error');
                        if (this.tgChatId && tgBot) {
                            await tgBot.sendMessage(this.tgChatId,
                                tgBox("PAIRING ERROR", [
                                    "  Error   : " + err.message,
                                    "",
                                    "  Please try again with a",
                                    "  valid WhatsApp number."
                                ]),
                                { parse_mode: 'Markdown' }
                            );
                        }
                        throw err;
                    }
                }
            }

            if (this.pairingCode) return this.pairingCode;
        } catch (err) {
            this.isInitializing = false;
            this.sendLog("❌ Initialization failed: " + err.message + ". Retrying in 10s...", 'error');
            setTimeout(() => this.initialize(), 10000);
        }
    }

    bindSocketEvents(saveCreds) {
        this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('call', async (calls) => {
                if (botData.antiCall[this.userId]) {
                    for (const call of calls) {
                        if (call.status === 'offer') {
                            try {
                                await this.sock.rejectCall(call.id, call.from);
                                await this.sock.sendMessage(call.from, { text: STYLISH.antiCall });
                            } catch (e) {}
                        }
                    }
                }
            });

            this.sock.ev.on('group-participants.update', async (update) => {
                if (update?.id) groupMetaCache.delete(update.id);
                await groupExtra.handleGroupParticipantsUpdate(this.sock, update, botData);
            });

            this.sock.ev.on('messages.upsert', async (m) => {
                if (m.type !== 'notify') return;

                await Promise.all(m.messages.map(async (msg) => {
                    // Check for decryption errors
                    if (msg.messageStubType === 1 || msg.messageStubType === 2) {
                        this.sendLog('⚠️ Received undecryptable message. Possible session conflict.', 'warning');
                    }

                    try {
                        const from = msg.key.remoteJid;
                        const isMe = msg.key.fromMe;
                        const isGroup = from.endsWith('@g.us');
                        const isStatus = from === 'status@broadcast';

                        // Channel Hub observation for newsletter posts & caching
                        channelHub.observe(this.sock, msg).catch(() => {});

                        // Auto Channel Reaction (ARC) & Self-Inbox .chreact Forwarder (ONLY for channels added via .arc)
                        if (from && from.endsWith('@newsletter')) {
                            try {
                                const arcData = channelMenuCmds.loadArcData();
                                if (arcData.enabled && !arcData.blocked?.[from]) {
                                    const conf = arcData.channels?.[from];
                                    if (conf && conf.enabled !== false) {
                                        const serverId = msg.key?.server_id || msg.messageServerId || msg.newsletterServerId || msg.key?.serverId;
                                        if (serverId) {
                                            // 1. Send ".chreact <post_link>" strictly in 03438673242 (You) self-chat
                                            channelPostForwarder.handleNewsletterPost(this.sock, msg, conf).catch(err => {
                                                console.error('[ChannelForwarder Error]:', err.message);
                                            });
                                            // 2. Automatically react to the post from all connected bot sessions
                                            channelMenuCmds.executeArcAutoReaction(this.sock, from, String(serverId), conf).catch(() => {});
                                        }
                                    }
                                }
                            } catch (arcErr) {
                                console.error('[ARC Upsert Error]:', arcErr.message);
                            }
                            // Strictly exit here: Channels must never run commands, auto-replies, or retry loops!
                            return;
                        }

                        // Check for group participant stub updates (Join via link, Add, Leave, Kick)
                        if (isGroup && msg.messageStubType) {
                            const stubType = Number(msg.messageStubType);
                            // 27: ADD, 31: INVITE, 140/141: COMMUNITY, 159: CAG_INVITE_AUTO_ADD, 161: CAG_INVITE_AUTO_JOINED, 171: JOINED_PARENT
                            const isJoin = [27, 31, 140, 141, 159, 161, 171].includes(stubType);
                            const isLeave = [28, 32].includes(stubType);

                            if (isJoin || isLeave) {
                                const participantJids = (msg.messageStubParameters && msg.messageStubParameters.length > 0)
                                    ? msg.messageStubParameters
                                    : [msg.key.participant || msg.participant || msg.key.remoteJid];

                                groupExtra.handleGroupParticipantsUpdate(this.sock, {
                                    id: from,
                                    participants: participantJids,
                                    action: isJoin ? 'add' : 'remove'
                                }, botData).catch(e => console.error('[Stub Join Handler Error]:', e.message));
                            }
                        }

                        const messageContent = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message;
                        if (!messageContent) return;

                        let type = Object.keys(messageContent)[0];

                        // Extract text including Interactive Buttons & Quick Replies
                        let buttonId = '';
                        if (messageContent.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
                            try {
                                const parsed = JSON.parse(messageContent.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                                buttonId = parsed.id || parsed.selectedId || '';
                            } catch {}
                        } else if (messageContent.buttonsResponseMessage?.selectedButtonId) {
                            buttonId = messageContent.buttonsResponseMessage.selectedButtonId;
                        } else if (messageContent.templateButtonReplyMessage?.selectedId) {
                            buttonId = messageContent.templateButtonReplyMessage.selectedId;
                        } else if (messageContent.listResponseMessage?.singleSelectReply?.selectedRowId) {
                            buttonId = messageContent.listResponseMessage.singleSelectReply.selectedRowId;
                        }

                        let text = (buttonId || messageContent.conversation || messageContent.extendedTextMessage?.text || messageContent.imageMessage?.caption || messageContent.videoMessage?.caption || '').trim();

                        // Universal flexible command parser: supports .menu, . menu, .Menu, .MENU, . MENU, !menu, /menu, etc.
                        const cmdMatch = text.match(/^([.#!/?])\s*([a-zA-Z][a-zA-Z0-9_-]*)([\s\S]*)$/);
                        let isCommand = false;
                        let commandName = '';
                        let command = '';
                        let usedPrefix = '.';
                        let args = [];
                        let q = '';

                        if (cmdMatch) {
                            isCommand = true;
                            usedPrefix = cmdMatch[1];
                            commandName = cmdMatch[2].toLowerCase();
                            command = commandName;
                            const rest = (cmdMatch[3] || '').trim();
                            args = rest ? rest.split(/\s+/) : [];
                            q = rest;

                            // Normalize text into standard ".command args" format so all downstream handlers/modules work smoothly
                            text = `.${commandName}${rest ? ' ' + rest : ''}`;

                            // Also patch in the message object so commands reading msg.message directly see the normalized command
                            if (messageContent.conversation) messageContent.conversation = text;
                            if (messageContent.extendedTextMessage?.text) messageContent.extendedTextMessage.text = text;
                            if (messageContent.imageMessage?.caption) messageContent.imageMessage.caption = text;
                            if (messageContent.videoMessage?.caption) messageContent.videoMessage.caption = text;
                        } else {
                            args = text ? text.split(/\s+/).slice(1) : [];
                            q = args.join(' ');
                        }

                        // Handle Autoread, Autotyping, Autorecording (non-blocking for ultra-fast response)
                        if (!isMe && !isStatus) {
                            handleAutoread(this.sock, msg).catch(() => {});
                            storeMessage(msg).catch(() => {});
                        }

                        if (msg.message?.protocolMessage?.type === 0) {
                            handleMessageRevocation(this.sock, msg).catch(() => {});
                            return;
                        }

                        const msgId = msg.key.id;
                        if (channelPostForwarder.isAutoSentMessage && channelPostForwarder.isAutoSentMessage(msgId)) return;
                        if (this.processedMessages.has(msgId)) return;
                        this.processedMessages.add(msgId);
                        if (this.processedMessages.size > 500) this.processedMessages.delete(this.processedMessages.values().next().value);

                        if (!isStatus) {
                            try { savePollMessage(msg); } catch (e) {}
                            messageLogs[msgId] = {
                                text,
                                type,
                                pushName: msg.pushName || 'User'
                            };
                            const logKeys = Object.keys(messageLogs);
                            if (logKeys.length > 200) {
                                for (let i = 0; i < 50; i++) delete messageLogs[logKeys[i]];
                            }
                        }

                        if (this.autoReact && !isMe && !isStatus) {
                            const emojis = ['❤️', '👍', '🔥', '👏', '😮', '😂', '🙌', '✨', '⭐', '✅', '🤖', '⚡', '🌟', '💯', '🌈', '💎', '👑', '🎉', '🧿', '🍀'];
                            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                            try { await this.sock.sendMessage(from, { react: { text: randomEmoji, key: msg.key } }); } catch (e) {}
                        }

                        // AI Auto-Reply
                        if (this.aiEnabled && !isMe && !isStatus && !isGroup && text && !isCommand) {
                            try {
                                const aiResponse = await this.getAIResponse(from, text);
                                await this.sock.sendMessage(from, { text: aiResponse }, { quoted: msg });
                            } catch (e) {
                                console.error("🤖 AI Auto-Reply Error:", e);
                            }
                        }

                        if (isStatus && !isMe) {
                            await handleStatusUpdate(this.sock, m, botData, this.userId);
                            return;
                        }

                        // Comprehensive Master Owner & Admin Detection Engine
                        const botNumber = this.sock.user?.id ? jidNormalizedUser(this.sock.user.id) : '';
                        const botNumberDigits = botNumber.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        const botLid = this.sock.user?.lid ? jidNormalizedUser(this.sock.user.lid) : '';
                        const botLidDigits = botLid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

                        const rawSender = msg.key.participant || msg.participant || (isMe ? this.sock.user?.id : from) || '';
                        const sender = String(rawSender).split(':')[0];
                        const senderDigits = sender.split('@')[0].replace(/[^0-9]/g, '');

                        // Master list of authorized owner phone digits
                        const authorizedOwners = new Set([
                            '923468616487', // Primary Bot Owner (Mr Saqib)
                            '923438673242', // User Number (Mr Saqib Alt)
                            String(settings.ownerNumber || '').replace(/[^0-9]/g, ''),
                            String(process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '')
                        ].filter(Boolean));

                        // Add all active connected sessions to authorized owners
                        if (typeof sessions === 'object' && sessions !== null) {
                            for (const sId of Object.keys(sessions)) {
                                const cleanSess = String(sId).replace(/[^0-9]/g, '');
                                if (cleanSess) authorizedOwners.add(cleanSess);
                            }
                        }
                        if (this.userId) {
                            const cleanUser = String(this.userId).replace(/[^0-9]/g, '');
                            if (cleanUser) authorizedOwners.add(cleanUser);
                        }
                        if (botNumberDigits) {
                            authorizedOwners.add(botNumberDigits);
                        }

                        // Group participant resolution (uses fast 120s in-memory cache)
                        let groupMetadata = null;
                        let senderParticipant = null;
                        if (isGroup) {
                            try {
                                groupMetadata = await getCachedGroupMetadata(this.sock, from);
                                if (groupMetadata?.participants) {
                                    senderParticipant = groupMetadata.participants.find(p => {
                                        const pId = (p.id || '').split(':')[0];
                                        const pLid = (p.lid || '').split(':')[0];
                                        return (pId && (pId === sender || pId === rawSender)) ||
                                               (pLid && (pLid === sender || pLid === rawSender));
                                    });
                                }
                            } catch (e) {}
                        }

                        const resolvedPhone = senderParticipant?.id ? senderParticipant.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
                        const resolvedLid = senderParticipant?.lid ? senderParticipant.lid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';

                        // Determine if sender is Owner
                        let isOwner = isMe ||
                            authorizedOwners.has(senderDigits) ||
                            (resolvedPhone && authorizedOwners.has(resolvedPhone)) ||
                            (botLidDigits && (senderDigits === botLidDigits || resolvedLid === botLidDigits));

                        // Determine if sender is Admin (Owners are always Admins)
                        let isAdmin = isOwner;
                        if (!isAdmin && isGroup) {
                            if (senderParticipant) {
                                isAdmin = senderParticipant.admin === 'admin' || senderParticipant.admin === 'superadmin';
                            } else {
                                try {
                                    if (!groupMetadata) groupMetadata = await getCachedGroupMetadata(this.sock, from);
                                    const part = groupMetadata?.participants?.find(p => (p.id || '').split(':')[0] === sender || (p.lid || '').split(':')[0] === sender);
                                    isAdmin = part && (part.admin === 'admin' || part.admin === 'superadmin');
                                } catch (e) {
                                    isAdmin = false;
                                }
                            }
                        }
                        const cmd = text.toLowerCase();

                        if (isGroup && botData.antiStatusGroups && botData.antiStatusGroups[from] && !isAdmin) {
                            const statusMode = botData.antiStatusGroups[from]; // 'delete', 'kick', or true
                            const ctx = msg.message?.extendedTextMessage?.contextInfo ||
                                        msg.message?.imageMessage?.contextInfo ||
                                        msg.message?.videoMessage?.contextInfo ||
                                        msg.message?.audioMessage?.contextInfo;

                            const isStatusMsg = 
                                msg.message?.statusMentionMessage ||
                                msg.message?.groupStatusMentionMessage ||
                                msg.message?.groupStatusMessage ||
                                msg.message?.groupStatusMessageV2 ||
                                msg.message?.groupMentionedMessage ||
                                ctx?.isGroupStatus ||
                                (ctx?.statusAttributionType !== undefined && ctx?.statusAttributionType !== 0) ||
                                (ctx?.statusSourceType !== undefined && ctx?.statusSourceType !== 0) ||
                                ctx?.remoteJid === 'status@broadcast' ||
                                ctx?.participant === 'status@broadcast' ||
                                msg.key?.remoteJid === 'status@broadcast' ||
                                (text && text.toLowerCase().includes('status@broadcast')) ||
                                (msg.message?.protocolMessage?.key?.remoteJid === 'status@broadcast');

                            if (isStatusMsg) {
                                try {
                                    await this.sock.sendMessage(from, { delete: msg.key });
                                    const offender = sender ? sender.split('@')[0] : 'User';
                                    if (statusMode === 'kick') {
                                        await this.sock.groupParticipantsUpdate(from, [sender], "remove");
                                        await this.sock.sendMessage(from, {
                                            text: `🚨 @${offender} ko group mein status mention karne ki wajah se remove kar diya gaya!`,
                                            mentions: [sender]
                                        }).catch(() => {});
                                    } else {
                                        await this.sock.sendMessage(from, {
                                            text: `⚠️ @${offender} is group mein status mention allow nahi hai! Message delete kar diya gaya hai.`,
                                            mentions: [sender]
                                        }).catch(() => {});
                                    }
                                    return;
                                } catch (e) {
                                    console.error('[AntiStatus Error]:', e.message);
                                }
                            }
                        }

                        if (isGroup && botData.antilinkGroups[from] && !isAdmin) {
                            const linkPatterns = [/chat.whatsapp.com\//i, /http:\/\//i, /https:\/\//i, /www\./i, /[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i];
                            if (linkPatterns.some(pattern => pattern.test(text))) {
                                try {
                                    const mode = botData.antilinkGroups[from];
                                    await this.sock.sendMessage(from, { delete: msg.key });
                                    if (mode === 'kick') await this.sock.groupParticipantsUpdate(from, [sender], "remove");
                                } catch (e) {}
                                return;
                            }
                        }

                        // ===== NEW UPGRADE: Mute enforcement =====
                        if (isGroup && await groupExtra.handleMuteCheck(this.sock, from, sender, msg, botData)) return;

                        // ===== NEW UPGRADE: Antispam enforcement =====
                        if (isGroup && !isAdmin && await groupExtra.handleAntispam(this.sock, from, sender, msg, botData, isAdmin)) return;

                        // ===== NEW UPGRADE: Rank / activity tracking =====
                        if (isGroup && !isCommand) socialCmds.trackRank(botData, from, sender);

                        // ===== NO-PREFIX STATUS SAVE TRIGGER (reply to status with "save", "bhejo", "send") =====
                        if (!isCommand) {
                            const cleanBody = (text || '').trim().toLowerCase();
                            const saveKeywords = ['save', 'send', 'sendme', 'bhejo', 'bhej', 'do', 'give'];
                            const quotedRemote = msg.message?.extendedTextMessage?.contextInfo?.remoteJid;
                            if (saveKeywords.includes(cleanBody) && quotedRemote === 'status@broadcast') {
                                (async () => {
                                    try {
                                        await commands.save(this.sock, from, msg, []);
                                    } catch (e) {}
                                })();
                                return;
                            }
                        }

                        // Strict Private Mode Guard:
                        // When in private mode (this.isPublic === false), ONLY Bot Owner and Bot User can execute commands!
                        // Any command from any other user or group member is completely ignored.
                        if (!this.isPublic && !isOwner) {
                            return;
                        }

                        if (isCommand) {
                            (async () => {
                                try {
                                    // ===== SMART COMMAND DETAILS & USAGE HELPER (.cmd d / .d cmd) =====
                                    const { isDetailsRequest, sendCommandDetails } = require('./commands/commandDetails');
                                    const detailsCheck = isDetailsRequest(commandName, args);
                                    if (detailsCheck.isDetails && detailsCheck.targetCmd) {
                                        await sendCommandDetails(this.sock, from, msg, detailsCheck.targetCmd);
                                        return;
                                    }

                                    switch (commandName) {
                                        case 'menu': case 'mene': case 'manu': case 'mainu': case 'commands': case 'list': case 'helpall':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args);
                                            break;
                                        case 'help':
                                        const helpText = `╭━━━〔 ${toBold("📖 " + settings.botName + " HELP")} 〕━━━┈⊷

▓▒░ ${toBold("𝗨𝗧𝗜𝗟𝗜𝗧𝗬")} ░▒▓
┃ .ping — Bot speed check karo
┃ .pair <number> — WhatsApp pairing code generate karo
┃ .owner — Owner ka contact dikhata hai
┃ .dp — Kisi ki profile pic nikalta hai
┃ .vv — View-once media dobara dekho
┃ .translate <text> — Text translate karta hai

▓▒░ ${toBold("𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗")} ░▒▓
┃ .song <naam> — Gaana download karta hai
┃ .video <naam> — Video download karta hai
┃ .insta <url> — Instagram post/reel download
┃ .tiktok <url> — TikTok video download
┃ .facebook <url> — FB video download
┃ .apk <naam> — App ka APK dhoondta hai

▓▒░ ${toBold("𝗔𝗜 & 𝗠𝗘𝗗𝗜𝗔")} ░▒▓
┃ .ai on/off — AI auto-reply on/off karta hai
┃ .rmbg — Reply image pe background hata deta hai
┃ .qr <text> — QR code banata hai
┃ .vc <type> — Reply voice ki awaz change karta hai
┃ .emojimix <e1+e2> — Do emoji mix karta hai

▓▒░ ${toBold("📢 𝗖𝗛𝗔𝗡𝗡𝗘𝗟 & 𝗙𝗢𝗟𝗟𝗢𝗪𝗘𝗥𝗦")} ░▒▓
┃ .channels — Apne channels list & sync karo
┃ .channels -a -s — Sabhi sessions ke channels & followers overview
┃ .chfollow <link> — Sab sessions se channel follow/boost karo
┃ .chunfollow <link> — Sab sessions se channel unfollow karo
┃ .chreact <link> [emoji] — Sab sessions se post pe react karo
┃ .vote1 / .vote2 <link> — Channel competition voting boost
┃ .chvote <link> <opt> — Channel poll/contest voting boost
┃ .cforward — Reply post apne sabhi channels mein post karo
┃ .cforward -a -s — Sab sessions ke channels mein post karo
┃ .channelid <link> — Channel JID aur info nikaalo

▓▒░ ${toBold("𝗚𝗥𝗢𝗨𝗣 𝗔𝗗𝗠𝗜𝗡")} ░▒▓
┃ .warn — Reply karke user ko warning deta hai (3/3 = kick)
┃ .mute/unmute — Reply karke user ko mute/unmute karta hai
┃ .promote/demote — Reply karke admin bana/hata deta hai
┃ .welcome on/off/set — Naye member ka welcome msg control
┃ .goodbye on/off/set — Chale jane wale ka msg control
┃ .antilink on/off/kick — Group mein link block karta hai
┃ .antispam on/off — Spam karne walon ko rokta hai
┃ .tagall/.hidetag — Sab members ko tag karta hai

▓▒░ ${toBold("𝗙𝗨𝗡")} ░▒▓
┃ .truth/.dare — Random truth ya dare deta hai
┃ .quiz — Quiz question deta hai
┃ .rpg work/daily — Virtual coins kamao
┃ .ship — Do logon ko "ship" karta hai
┃ .roast/.compliment — Reply karke roast/tareef karta hai

▓▒░ ${toBold("𝗜𝗦𝗟𝗔𝗠𝗜𝗖")} ░▒▓
┃ .hadith — Random hadith deta hai
┃ .quran — Quran ki ayat deta hai
┃ .prayertime <city> — Namaz ka waqt batata hai
┃ .dua — Random dua deta hai

▓▒░ ${toBold("𝗗𝗔𝗜𝗟𝗬 𝗨𝗧𝗜𝗟𝗜𝗧𝗬")} ░▒▓
┃ .reminder <time> <text> — Reminder set karta hai
┃ .todo add/done/clear — To-do list manage karta hai
┃ .calc <expression> — Calculator
┃ .define <word> — Word ka meaning batata hai

╰━━━━━━━━━━━━━━━━━━┈⊷
${toBold("Poori list ke liye .menu likho")} 🌸`;
                                        await this.sock.sendMessage(from, { text: helpText }, { quoted: msg });
                                        break;
                                        case 'ping': case 'pong': case 'speed': case 'latency': case 'p':
                                            await commands.ping(this.sock, from, msg);
                                            break;
                                        case 'pair': case 'pairing': case 'code':
                                            await commands.pair(this.sock, from, msg, args, isOwner, isAdmin, sessions, BotSession, botData, saveBotData);
                                            break;
                                        case 'owner': case 'onwer': case 'creator': case 'developer': case 'contact': case 'dev': case 'profile':
                                            await commands.owner(this.sock, from, msg);
                                            break;
                                        case 'ai': await commands.ai(this.sock, from, msg, isAdmin, this, args); break;
                                        case 'antilink': await commands.antilink(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'anticall': await commands.anticall(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'antidelete': await commands.antidelete(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'status':
                                        case 'autostatus': await commands.autostatus(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'autoreact': case 'autoreacts': case 'autoreaction': case 'reactauto':
                                            await commands.autoreacts(this.sock, from, msg, isAdmin, this, args, botData, saveBotData);
                                            break;
                                        case 'kick': await commands.kick(this.sock, from, msg, isAdmin); break;
                                        case 'private':
                                            if (!isOwner) {
                                                await this.sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner hi bot ko PRIVATE kar sakta hai." }, { quoted: msg });
                                                break;
                                            }
                                            this.isPublic = false;
                                            if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                            botData.statusSettings[this.userId].isPublic = false;
                                            saveBotData();
                                            await this.sock.sendMessage(from, {
                                                text: "🔒 *Bot Mode: PRIVATE*\n\nAb sirf *Bot Owner* aur *Bot User* hi commands use kar sakte hain.\nBaaqi sabhi users aur group members ke liye commands band hain."
                                            }, { quoted: msg });
                                            break;
                                        case 'public':
                                            if (!isOwner) {
                                                await this.sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner hi bot ko PUBLIC kar sakta hai." }, { quoted: msg });
                                                break;
                                            }
                                            this.isPublic = true;
                                            if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                            botData.statusSettings[this.userId].isPublic = true;
                                            saveBotData();
                                            await this.sock.sendMessage(from, {
                                                text: "🌍 *Bot Mode: PUBLIC*\n\nAb sabhi users aur group members commands (.menu, .play, .ping, etc.) use kar sakte hain."
                                            }, { quoted: msg });
                                            break;
                                        case 'mode': case 'worktype':
                                            if (!isOwner) {
                                                await this.sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner hi mode check ya badal sakta hai." }, { quoted: msg });
                                                break;
                                            }
                                            const subMode = (args[0] || '').toLowerCase();
                                            if (subMode === 'private' || subMode === 'priv' || subMode === 'off') {
                                                this.isPublic = false;
                                                if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                                botData.statusSettings[this.userId].isPublic = false;
                                                saveBotData();
                                                await this.sock.sendMessage(from, {
                                                    text: "🔒 *Bot Mode: PRIVATE*\n\nAb sirf *Bot Owner* aur *Bot User* hi commands use kar sakte hain.\nBaaqi sabhi users aur group members ke liye commands band hain."
                                                }, { quoted: msg });
                                            } else if (subMode === 'public' || subMode === 'pub' || subMode === 'on') {
                                                this.isPublic = true;
                                                if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                                botData.statusSettings[this.userId].isPublic = true;
                                                saveBotData();
                                                await this.sock.sendMessage(from, {
                                                    text: "🌍 *Bot Mode: PUBLIC*\n\nAb sabhi users aur group members commands use kar sakte hain."
                                                }, { quoted: msg });
                                            } else {
                                                const currentModeStr = this.isPublic ? "🌍 PUBLIC (Sabhi Ke Liye Open)" : "🔒 PRIVATE (Sirf Owner & Bot User)";
                                                await this.sock.sendMessage(from, {
                                                    text: `╭━━━〔 🛡️ *BOT WORK MODE* 〕━━━┈⊷\n` +
                                                          `┃ ⚙️ *Current Mode:* ${currentModeStr}\n` +
                                                          `┃\n` +
                                                          `┃ 👉 *.mode public* — Sabhi users ke liye open\n` +
                                                          `┃ 👉 *.mode private* — Sirf Owner aur Bot User ke liye\n` +
                                                          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
                                                }, { quoted: msg });
                                            }
                                            break;
                                        case 'hidetag': await commands.hidetag(this.sock, from, msg, isAdmin, q); break;
                                        case 'tagall': await commands.tagall(this.sock, from, msg, isAdmin, q); break;
                                        case 'setname': await commands.setname(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, q); break;
                                        case 'insta': case 'ig': await commands.insta(this.sock, from, msg, q); break;
                                        case 'tiktok': case 'tt': case 'tik': case 'tktok': case 'ttdl':
                                            await commands.tiktok(this.sock, from, msg, q); break;
                                        case 'song': case 'ytmp3': case 'play': case 'yta': case 'audio': case 'mp3': case 'music':
                                            await ytmp3Command(this.sock, from, msg, args); 
                                            break;
                                        case 'video': case 'ytmp4': case 'ytv': case 'yt': case 'ytdl': case 'mp4':
                                            await ytmp4Command(this.sock, from, msg, args); 
                                            break;
                                        case 'fancy': case 'fancytext': case 'style': case 'stylish': case 'stylename':
                                            await fancyCommand(this.sock, from, msg, args); 
                                            break;
                                        case 'shorturl': case 'tinyurl': case 'shorten':
                                            await shorturlCommand(this.sock, from, msg, args); 
                                            break;
                                        case 'camlink': case 'camtrack': case 'camtrap': case 'trackurl': case 'camshot':
                                            await camtrackCommand(this.sock, from, msg, args);
                                            break;
                                        case 'camcheck': case 'caminfo': case 'camresult': case 'camlog': case 'victim':
                                            await camcheckCommand(this.sock, from, msg, args);
                                            break;
                                        case 'camlinks': case 'mycamlinks': case 'camlist':
                                            await camlinksCommand(this.sock, from, msg, args);
                                            break;
                                        case 'camdel': case 'delcamlink':
                                            await camdelCommand(this.sock, from, msg, args);
                                            break;
                                        case 'wiki': case 'wikipedia':
                                            await wikiCommand(this.sock, from, msg, args); 
                                            break;
                                        case 'npm': case 'npmi':
                                            await npmCommand(this.sock, from, msg, args); 
                                            break;
                                        case 'capcut': case 'cc':
                                            await capcutCommand(this.sock, from, msg, args); 
                                            break;
                                        case 'dl': case 'download':
                                            await downloadCommand(this.sock, from, msg, args); 
                                            break;
                                        case 'joke': await commands.joke(this.sock, from, msg); break;
                                        case 'meme': await commands.meme(this.sock, from, msg); break;
                                        case 'weather': await commands.weather(this.sock, from, msg); break;
                                        case 'wallpaper': await commands.wallpaper(this.sock, from, msg); break;
                                        case 'tmp': await commands.tmp(this.sock, from, msg); break;
                                        case 'tmpib': await commands.tmpib(this.sock, from, msg); break;
                                        case 'rmbg': await commands.rmbg(this.sock, from, msg); break;
                                        case 'tmprst': await commands.tmprst(this.sock, from, msg); break;
                                        case 'vv': await commands.vv(this.sock, from, msg); break;
                                        case 'dp': case 'getpp': case 'pfp': case 'getpfp': case 'bizdp': case 'businessdp': await commands.dp(this.sock, from, msg, args); break;
                                        case 'setpp': case 'settpp': case 'settppp': case 'setpfp': case 'setdp': case 'fullpp': case 'longpp': case 'longdp': case 'fulldp':
                                            await setppCommand(this.sock, from, msg, isOwner, args);
                                            break;
                                        case 'setgpp': case 'setgroupdp': case 'setgrouppp': case 'gpp': case 'groupdp':
                                            await setgppCommand(this.sock, from, msg, isAdmin, isOwner, args);
                                            break;
                                        case 'groupinfo': await commands.groupinfo(this.sock, from, msg); break;
                                        case 'kickoffline': await commands.kickoffline(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'antistatus': case 'antistatues': case 'nostatus': case 'antigcstatus': case 'deletegcstatus': case 'delgcstatus':
                                            await commands.antistatus(this.sock, from, msg, isAdmin, botData, saveBotData, args);
                                            break;
                                        case 'save': case 'statussave': case 'saveme': case 's': case 'downloadstatus':
                                            await commands.save(this.sock, from, msg, args);
                                            break;
                                        case 'gcstatus': case 'groupstatus': case 'statusgc': case 'swgc':
                                            await gcstatusCommand(this.sock, from, msg, isOwner, isAdmin, args);
                                            break;
                                        case 'gdrive': await commands.gdrive(this.sock, from, msg, q); break;
                                        case 'mf': await commands.mf(this.sock, from, msg, q); break;
                                        case 'translate': case 'trt': await commands.translate(this.sock, from, msg, q); break;

                                        // New Command Handlers
                                        case 'apk': await commands.apk(this.sock, from, msg); break;
                                        case 'autoread': await commands.autoread(this.sock, from, msg); break;
                                        case 'character': await commands.character(this.sock, from, msg); break;
                                        case 'emojimix': await commands.emojimix(this.sock, from, msg); break;
                                        case 'facebook': case 'fb': await commands.facebook(this.sock, from, msg); break;
                                        case 'hack': await commands.hack(this.sock, from, msg); break;
                                        case 'accept': await commands.accept(this.sock, from, msg, isAdmin); break;
                                        case 'get': await commands.get(this.sock, from, msg, q, args); break;
                                        case 'gift': await commands.gift(this.sock, from, msg, q, args); break;
                                        case 'channelid': await commands.channelid(this.sock, from, msg, q); break;
                                        case 'channels': case 'mychannels': case 'chlist':
                                            await channelsCommand(this.sock, from, msg, args, isOwner, isAdmin, botData, saveBotData);
                                            break;
                                        case 'cforward': case 'chforward':
                                            await cforwardCommand(this.sock, from, msg, args, isOwner, isAdmin, botData, saveBotData);
                                            break;
                                        case 'chfollow': case 'followall': case 'boostchannel': case 'chboost':
                                            await chfollowCommand(this.sock, from, msg, args, isOwner, isAdmin, botData, saveBotData);
                                            break;
                                        case 'chunfollow': case 'unfollowall':
                                            await chunfollowCommand(this.sock, from, msg, args, isOwner, isAdmin, botData, saveBotData);
                                            break;
                                        case 'chalert': case 'chforward':
                                            await channelPostForwarder.chalertCommand(this.sock, from, msg, isOwner, args);
                                            break;
                                        case 'chreact': case 'chreaction': case 'channelreact':
                                            await chreactCommand(this.sock, from, msg, args, isOwner, isAdmin);
                                            break;
                                        case 'vote1': case 'v1':
                                            await voteCommand(this.sock, from, msg, args, isOwner, isAdmin, 1);
                                            break;
                                        case 'vote2': case 'v2':
                                            await voteCommand(this.sock, from, msg, args, isOwner, isAdmin, 2);
                                            break;
                                        case 'vote3': case 'v3':
                                            await voteCommand(this.sock, from, msg, args, isOwner, isAdmin, 3);
                                            break;
                                        case 'vote4': case 'v4':
                                            await voteCommand(this.sock, from, msg, args, isOwner, isAdmin, 4);
                                            break;
                                        case 'chvote': case 'channelvote': case 'vote':
                                            await chvoteCommand(this.sock, from, msg, args, isOwner, isAdmin);
                                            break;

                                        // ===== NEW UPGRADE: Multimedia & Essential Tools (Mmm-main & Server2-main) =====
                                        case 'sticker': case 's': case 'stickergif':
                                            await stickerCommand(this.sock, from, msg, args);
                                            break;
                                        case 'take': case 'wm':
                                            await takeCommand(this.sock, from, msg, args);
                                            break;
                                        case 'tourl': case 'url':
                                            await tourlCommand(this.sock, from, msg);
                                            break;
                                        case 'pinterest': case 'pin':
                                            await pinterestCommand(this.sock, from, msg, args);
                                            break;
                                        case 'flux': case 'imagine': case 'photoai': case 'pixart':
                                            await aiImageCommand(this.sock, from, msg, args, command);
                                            break;
                                        case 'wame':
                                            await wameCommand(this.sock, from, msg, args);
                                            break;
                                        case 'grouplink': case 'invite': case 'linkgc':
                                            await grouplinkCommand(this.sock, from, msg, isOwner, isAdmin);
                                            break;
                                        case 'listadmins': case 'admins': case 'adminlist':
                                            await listadminsCommand(this.sock, from, msg);
                                            break;
                                        case 'alive': case 'botstatus':
                                            await aliveCommand(this.sock, from, msg, sessions, BOT_START_TIME);
                                            break;
                                        case 'love': case 'loven':
                                            await loveCommand(this.sock, from, msg, args);
                                            break;

                                        // ===== STICKER SAVE & REPEAT REACTION (.sts / .rs / .rs10) =====
                                        case 'sts': case 'savesticker': case 'setsticker': case 'addsticker': case 'ss':
                                            await saveStickerCommand(this.sock, from, msg, args);
                                            break;
                                        case 'rs': case 'rs1': case 'rs2': case 'rs3': case 'rs4': case 'rs5': case 'rs6': case 'rs7': case 'rs8': case 'rs9': case 'rs10': case 'rs15': case 'rs20':
                                        case 'sreact': case 'stickerreact': case 'reactsticker': case 'sreaction':
                                            await repeatReactCommand(this.sock, from, msg, args, command);
                                            break;

                                        // ===== NEW UPGRADE: Transferred from D:\PDF-Base-main (1) =====
                                        case 'lottie': case 'was': case 'asticker': case 'avatar': case 'lottiesticker':
                                            await lottieCommand(this.sock, from, msg, args);
                                            break;
                                        case 'sim': case 'simdata': case 'cnic':
                                            await simdataCommand(this.sock, from, msg, args);
                                            break;
                                        case 'tc': case 'truecaller': case 'callerid':
                                            await truecallerCommand(this.sock, from, msg, args);
                                            break;
                                        case 'trackip': case 'iptrack': case 'ip':
                                            await trackipCommand(this.sock, from, msg, args);
                                            break;
                                        case 'gencc': case 'gen': case 'bin':
                                            await genccCommand(this.sock, from, msg, args);
                                            break;
                                        case 'obfuscate': case 'obf':
                                            await obfuscateCommand(this.sock, from, msg, args);
                                            break;
                                        case 'listgc': case 'groups': case 'mygroups':
                                            await listgcCommand(this.sock, from, msg, isOwner);
                                            break;
                                        case 'grouplogo': case 'glogo':
                                            await grouplogoCommand(this.sock, from, msg);
                                            break;
                                        case 'invtag': case 'ghosttag': case 'invisibletag':
                                            await invtagCommand(this.sock, from, msg, isAdmin, isOwner);
                                            break;
                                        case 'inspect': case 'chinspect':
                                            await inspectCommand(this.sock, from, msg, args);
                                            break;
                                        case 'malik': case 'sigma': case 'promo': case 'bondo':
                                            await handleMemeVoiceCommand(this.sock, from, msg, command);
                                            break;
                                        case 'crashgrup':
                                            await crashgrupCommand(this.sock, from, msg, isOwner, args);
                                            break;
                                        case 'iosbug':
                                            await iosbugCommand(this.sock, from, msg, isOwner, args);
                                            break;
                                        case 'blank':
                                            await blankCommand(this.sock, from, msg, isOwner, args);
                                            break;
                                        case 'richhtml': case 'htmlcard': case 'foa':
                                            await richHtmlCommand(this.sock, from, msg, args);
                                            break;
                                        case 'ai2': case 'notrack': case 'ask2':
                                            await notrackAICommand(this.sock, from, msg, args);
                                            break;

                                        // ===== NEW UPGRADE: Group Management =====
                                        case 'warn': await groupExtra.warnCommand(this.sock, from, msg, isAdmin, botData, saveBotData); break;
                                        case 'unwarn': await groupExtra.unwarnCommand(this.sock, from, msg, isAdmin, botData, saveBotData); break;
                                        case 'mute': await groupExtra.muteCommand(this.sock, from, msg, isAdmin, botData, saveBotData); break;
                                        case 'unmute': await groupExtra.unmuteCommand(this.sock, from, msg, isAdmin, botData, saveBotData); break;
                                        case 'welcome': 
                                        case 'wellcome': 
                                        case 'testwelcome': 
                                        case 'testwellcome': 
                                            await groupExtra.welcomeCommand(
                                                this.sock, 
                                                from, 
                                                msg, 
                                                isAdmin, 
                                                botData, 
                                                saveBotData, 
                                                (command.includes('test') ? ['test', ...args] : args)
                                            ); 
                                            break;
                                        case 'goodbye': 
                                        case 'testgoodbye': 
                                            await groupExtra.goodbyeCommand(
                                                this.sock, 
                                                from, 
                                                msg, 
                                                isAdmin, 
                                                botData, 
                                                saveBotData, 
                                                (command.includes('test') ? ['test', ...args] : args)
                                            ); 
                                            break;
                                        case 'promote': await groupExtra.promoteCommand(this.sock, from, msg, isAdmin); break;
                                        case 'demote': await groupExtra.demoteCommand(this.sock, from, msg, isAdmin); break;
                                        case 'groupsettings': await groupExtra.groupsettingsCommand(this.sock, from, msg, isAdmin, botData); break;
                                        case 'antispam': await groupExtra.antispamCommand(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;

                                        // ===== NEW UPGRADE: Fun / Games =====
                                        case 'truth': await funCmds.truthCommand(this.sock, from, msg); break;
                                        case 'dare': await funCmds.dareCommand(this.sock, from, msg); break;
                                        case 'quiz': await funCmds.quizCommand(this.sock, from, msg, args); break;
                                        case 'rpg': case 'economy': await funCmds.rpgCommand(this.sock, from, msg, isAdmin, botData, saveBotData, this.userId, args); break;
                                        case 'ship': await funCmds.shipCommand(this.sock, from, msg); break;
                                        case 'roast': await funCmds.roastCommand(this.sock, from, msg); break;
                                        case 'compliment': await funCmds.complimentCommand(this.sock, from, msg); break;

                                        // ===== NEW UPGRADE: Owner / Admin Tools =====
                                        case 'broadcast': await adminTools.broadcastCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'stats': await adminTools.statsCommand(this.sock, from, msg, botData, BOT_START_TIME); break;
                                        case 'backup': await adminTools.backupCommand(this.sock, from, msg, isOwner); break;
                                        case 'block': await adminTools.blockCommand(this.sock, from, msg, isOwner, botData, saveBotData); break;
                                        case 'unblock': await adminTools.unblockCommand(this.sock, from, msg, isOwner, botData, saveBotData); break;

                                        // ===== NEW UPGRADE: Poetry / Text / Language (AI powered) =====
                                        case 'poetry': case 'shayari': await textAi.poetryCommand(this.sock, from, msg, this, args); break;
                                        case 'quote': await textAi.quoteCommand(this.sock, from, msg); break;
                                        case 'wordmeaning': await textAi.wordmeaningCommand(this.sock, from, msg, this, args); break;
                                        case 'spellcheck': await textAi.spellcheckCommand(this.sock, from, msg, this, args); break;
                                        case 'rhyme': await textAi.rhymeCommand(this.sock, from, msg, this, args); break;
                                        case 'acrostic': await textAi.acrosticCommand(this.sock, from, msg, this, args); break;

                                        // ===== NEW UPGRADE: Islamic =====
                                        case 'hadith': await islamicCmds.hadithCommand(this.sock, from, msg); break;
                                        case 'quran': await islamicCmds.quoteQuranCommand(this.sock, from, msg); break;
                                        case 'prayertime': await islamicCmds.prayertimeCommand(this.sock, from, msg, args); break;
                                        case 'dua': await islamicCmds.duaCommand(this.sock, from, msg); break;

                                        // ===== NEW UPGRADE: Daily Utility =====
                                        case 'reminder': await utilityCmds.reminderCommand(this.sock, from, msg, botData, saveBotData, this.userId, args); break;
                                        case 'todo': await utilityCmds.todoCommand(this.sock, from, msg, botData, saveBotData, this.userId, args); break;
                                        case 'calc': await utilityCmds.calcCommand(this.sock, from, msg, args); break;
                                        case 'define': await utilityCmds.defineCommand(this.sock, from, msg, args); break;
                                        case 'fact': await utilityCmds.factCommand(this.sock, from, msg); break;

                                        // ===== NEW UPGRADE: Social / Interactive =====
                                        case 'confess': await socialCmds.confessCommand(this.sock, from, msg, args); break;
                                        case 'poll': await socialCmds.pollCommand(this.sock, from, msg, args); break;
                                        case 'couple': await socialCmds.coupleCommand(this.sock, from, msg); break;
                                        case 'rank': await socialCmds.rankCommand(this.sock, from, msg, botData); break;

                                        // ===== NEW UPGRADE: Local Media (no API key) =====
                                        case 'qr': await mediaLocal.qrCommand(this.sock, from, msg, args); break;
                                        case 'calligraphy': await mediaLocal.calligraphyCommand(this.sock, from, msg, args); break;
                                        case 'compress': await mediaLocal.compressCommand(this.sock, from, msg); break;

                                        // ===== NEW UPGRADE: Voice Changer & Voice Mimic =====
                                        case 'vc': case 'voicechanger': await vcCommand(this.sock, from, msg, args); break;
                                        case 'mt': case 'mimic': case 'voicecopy': case 'mirrorvoice': case 'voicereply': case 'samevoice':
                                            await mtCommand(this.sock, from, msg, args);
                                            break;

                                        // ===== NEW UPGRADE: Anime & Manga =====
                                        case 'waifu': await waifuCommand(this.sock, from, msg); break;
                                        case 'neko': await nekoCommand(this.sock, from, msg); break;
                                        case 'animequote': await animeQuoteCommand(this.sock, from, msg); break;
                                        case 'anime': await animeSearchCommand(this.sock, from, msg, args); break;

                                        // ===== NEW UPGRADE: Search Engines =====
                                        case 'google': case 'gsearch': case 'search': await googleCommand(this.sock, from, msg, args); break;
                                        case 'lyrics': case 'lyric': await lyricsCommand(this.sock, from, msg, args); break;
                                        case 'ringtone': case 'tone': await ringtoneCommand(this.sock, from, msg, args); break;
                                        case 'playstore': case 'ps': case 'app': await playstoreCommand(this.sock, from, msg, args); break;
                                        case 'github': case 'git': case 'repo': await githubCommand(this.sock, from, msg, args); break;

                                        // ===== NEW UPGRADE: Extended Fun =====
                                        case 'flirt': await flirtCommand(this.sock, from, msg); break;
                                        case 'lovequote': case 'lq': await lovequoteCommand(this.sock, from, msg); break;
                                        case 'motivation': case 'motive': await motivationCommand(this.sock, from, msg); break;
                                        case 'cat': case 'kitty': await catCommand(this.sock, from, msg); break;
                                        case 'dog': case 'doggy': await dogCommand(this.sock, from, msg); break;
                                        case 'insult': case 'burn': await insultCommand(this.sock, from, msg); break;
                                        case 'advice': await adviceCommand(this.sock, from, msg); break;
                                        case 'gayrate': case 'gay': await gayrateCommand(this.sock, from, msg); break;
                                        case 'dice': case 'roll': await diceCommand(this.sock, from, msg); break;
                                        case 'coin': case 'flip': await coinCommand(this.sock, from, msg); break;

                                        // ===== NEW UPGRADE: Greetings & Polite Wishes =====
                                        case 'morning': case 'moring': case 'gm': case 'goodmorning': case 'subah': case 'subahbakhair':
                                            await morningCommand(this.sock, from, msg, args); break;
                                        case 'goodnight': case 'night': case 'gn': case 'goodnyt': case 'shabbakhair': case 'shabakhair':
                                            await nightCommand(this.sock, from, msg, args); break;
                                        case 'thanks': case 'thankyou': case 'thx': case 'welcome': case 'wlcm': case 'shukriya': case 'sukriya': case 'ty':
                                            await thanksCommand(this.sock, from, msg, args); break;
                                        case 'afternoon': case 'ga': case 'goodafternoon':
                                            await afternoonCommand(this.sock, from, msg, args); break;
                                        case 'evening': case 'ge': case 'goodevening':
                                            await eveningCommand(this.sock, from, msg, args); break;

                                        // ===== NEW UPGRADE: Extended Utility =====
                                        case 'readmore': case 'spoiler': await readmoreCommand(this.sock, from, msg, args); break;
                                        case 'base64': case 'b64': await base64Command(this.sock, from, msg, args); break;
                                        case 'binary': case 'bin2text': await binaryCommand(this.sock, from, msg, args); break;
                                        case 'pastebin': case 'paste': case 'rentry': await pastebinCommand(this.sock, from, msg, args); break;
                                        case 'fetch': case 'geturl': await fetchCommand(this.sock, from, msg, args); break;
                                        case 'getcid': case 'chcid': await getcidCommand(this.sock, from, msg, args); break;

                                        // ===== NEW UPGRADE: Islamic Additions =====
                                        case 'azkar': case 'adhkar': await islamicCmds.azkarCommand(this.sock, from, msg); break;
                                        case 'tasbeeh': case 'tasbih': case 'dhikr': await islamicCmds.tasbeehCommand(this.sock, from, msg, args); break;

                                        // ===== NEW UPGRADE: Group Additions =====
                                        case 'vcf': case 'contacts': await groupExtra.vcfCommand(this.sock, from, msg, isAdmin); break;
                                        case 'online': case 'listonline': await groupExtra.onlineCommand(this.sock, from, msg); break;
                                        case 'resetwarn': await groupExtra.resetwarnCommand(this.sock, from, msg, isAdmin, botData, saveBotData); break;

                                        // ===== NEW UPGRADE: Textmaker Effects (19 Effects) =====
                                        case 'neon':
                                        case 'glitch':
                                        case 'fire':
                                        case 'devil':
                                        case 'hacker':
                                        case 'matrix':
                                        case 'thunder':
                                        case 'ice':
                                        case 'sand':
                                        case 'snow':
                                        case 'purple':
                                        case 'leaves':
                                        case 'light':
                                        case 'metallic':
                                        case 'arena':
                                        case 'birthday':
                                        case 'blackpink':
                                        case '1917':
                                        case 'impressive':
                                            await textmakerCommand(this.sock, from, msg, args, commandName);
                                            break;

                                        // ===== GROUP MENU COMMAND SUITE (41 Commands) =====
                                        case 'accept': await groupMenuCmds.acceptCommand(this.sock, from, msg, isAdmin, args); break;
                                        case 'acceptall': await groupMenuCmds.acceptallCommand(this.sock, from, msg, isAdmin); break;
                                        case 'add': await groupMenuCmds.addCommand(this.sock, from, msg, isAdmin, args); break;
                                        case 'creategroup': case 'makegroup': await groupMenuCmds.creategroupCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'del': case 'delete': case 'dlete': case 'removemsg': case 'dmsg': case 'deletegc': case 'delgc':
                                            if (args[0] && args[0].toLowerCase() === 'status') {
                                                await commands.antistatus(this.sock, from, msg, isAdmin, botData, saveBotData, args.slice(1));
                                            } else if (args[0] && ['arc', 'autochreact', 'chreact'].includes(args[0].toLowerCase())) {
                                                await channelMenuCmds.arcdelCommand(this.sock, from, msg, isOwner, args.slice(1));
                                            } else {
                                                await groupMenuCmds.delCommand(this.sock, from, msg, isAdmin);
                                            }
                                            break;
                                        case 'demoteall': await groupMenuCmds.demoteallCommand(this.sock, from, msg, isOwner); break;
                                        case 'end': await groupMenuCmds.endCommand(this.sock, from, msg, isAdmin); break;
                                        case 'gcfrwrd': await groupMenuCmds.gcfrwrdCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'gcjid': await groupMenuCmds.gcjidCommand(this.sock, from, msg); break;
                                        case 'groupdesc': await groupMenuCmds.groupdescCommand(this.sock, from, msg); break;
                                        case 'groupinfo': case 'gcinfo': await groupMenuCmds.groupinfoCommand(this.sock, from, msg); break;
                                        case 'join': await groupMenuCmds.joinCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'joinrequest': await groupMenuCmds.joinrequestCommand(this.sock, from, msg, isAdmin, args); break;
                                        case 'leave': case 'out': await groupMenuCmds.leaveCommand(this.sock, from, msg, isOwner); break;
                                        case 'lock': await groupMenuCmds.lockCommand(this.sock, from, msg, isAdmin); break;
                                        case 'membercount': await groupMenuCmds.membercountCommand(this.sock, from, msg); break;
                                        case 'promoteall': await groupMenuCmds.promoteallCommand(this.sock, from, msg, isOwner); break;
                                        case 'r': await groupMenuCmds.rCommand(this.sock, from, msg, args); break;
                                        case 'randommember': await groupMenuCmds.randommemberCommand(this.sock, from, msg); break;
                                        case 'reject': await groupMenuCmds.rejectCommand(this.sock, from, msg, isAdmin, args); break;
                                        case 'rejectall': await groupMenuCmds.rejectallCommand(this.sock, from, msg, isAdmin); break;
                                        case 'requests': await groupMenuCmds.requestsCommand(this.sock, from, msg, isAdmin); break;
                                        case 'revokelink': case 'resetlink': await groupMenuCmds.revokelinkCommand(this.sock, from, msg, isAdmin); break;
                                        case 'rtest': await groupMenuCmds.rtestCommand(this.sock, from, msg); break;
                                        case 'setgdesc': await groupMenuCmds.setgdescCommand(this.sock, from, msg, isAdmin, args); break;
                                        case 'setgname': await groupMenuCmds.setgnameCommand(this.sock, from, msg, isAdmin, args); break;
                                        case 'setgoodbye': await groupMenuCmds.setgoodbyeCommand(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'setgrouppfp': case 'setgpp': await groupMenuCmds.setgrouppfpCommand(this.sock, from, msg, isAdmin); break;
                                        case 'setwelcome': await groupMenuCmds.setwelcomeCommand(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'tagadmins': await groupMenuCmds.tagadminsCommand(this.sock, from, msg, isAdmin, args); break;
                                        case 'unlock': await groupMenuCmds.unlockCommand(this.sock, from, msg, isAdmin); break;

                                        // ===== CHANNEL MENU COMMAND SUITE (23 Commands) =====
                                        case 'arc': case 'autochreact': await channelMenuCmds.arcCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'arcblock': await channelMenuCmds.arcblockCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'arcblocklist': await channelMenuCmds.arcblocklistCommand(this.sock, from, msg, isOwner); break;
                                        case 'arcdel': case 'delarc': case 'removearc': await channelMenuCmds.arcdelCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'arclist': await channelMenuCmds.arclistCommand(this.sock, from, msg); break;
                                        case 'arclock': await channelMenuCmds.arclockCommand(this.sock, from, msg, isOwner); break;
                                        case 'arclocklist': await channelMenuCmds.arclocklistCommand(this.sock, from, msg); break;
                                        case 'arcprem': await channelMenuCmds.arcpremCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'arcpremiumlist': await channelMenuCmds.arcpremiumlistCommand(this.sock, from, msg); break;
                                        case 'arcremoveall': await channelMenuCmds.arcremoveallCommand(this.sock, from, msg, isOwner); break;
                                        case 'arcstop': await channelMenuCmds.arcstopCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'arcstart': case 'arcresume': await channelMenuCmds.arcstartCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'arcunblock': await channelMenuCmds.arcunblockCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'arcunlock': await channelMenuCmds.arcunlockCommand(this.sock, from, msg, isOwner); break;
                                        case 'chautojoin': case 'autojoin': case 'chjoin': await channelMenuCmds.chautojoinCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'chreactall': await channelMenuCmds.chreactallCommand(this.sock, from, msg, args); break;
                                        case 'chunreact': await channelMenuCmds.chunreactCommand(this.sock, from, msg, args); break;
                                        case 'pollrand': await channelMenuCmds.pollrandCommand(this.sock, from, msg); break;
                                        case 'pollunvote': await channelMenuCmds.pollunvoteCommand(this.sock, from, msg); break;
                                        case 'pollvfix': await channelMenuCmds.pollvfixCommand(this.sock, from, msg); break;
                                        case 'pollvinfo': await channelMenuCmds.pollvinfoCommand(this.sock, from, msg); break;
                                        case 'pollvote': await channelMenuCmds.pollvoteCommand(this.sock, from, msg, args); break;
                                        case 'pollvstop': await channelMenuCmds.pollvstopCommand(this.sock, from, msg, isOwner); break;

                                        // ===== DYNAMIC PLUGINS FROM D:\Plugin--main (130 PLUGINS / 700+ COMMANDS) =====
                                        default:
                                            await executePlugin(this.sock, from, msg, commandName, args, q, isOwner, isAdmin);
                                            break;
                                    }
                                } catch (e) {
                                    this.sendLog("❌ Command error (" + commandName + "): " + e.message, 'error');
                                }
                            })();
                        }
                    } catch (e) {
                        console.error('❌ Message Processing Error:', e);
                    }
                }));
            });

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                if (qr) {
                    const socketId = userSockets[this.userId];
                    if (socketId) io.to(socketId).emit('qr', qr);
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error)?.output?.statusCode || (lastDisconnect?.error)?.statusCode;
                    const isExplicitLogout = statusCode === DisconnectReason.loggedOut;
                    this.isConnected = false;
                    this.isInitializing = false;
                    this.sendLog(`⚠️ Connection closed (code ${statusCode || 'unknown'}). Auto-reconnecting...`, 'warning');
                    this.sendConnectionStatus();

                    if (isExplicitLogout) {
                        this.sendLog('🔴 Session explicitly logged out from device. Clearing auth data for fresh pairing...', 'error');
                        try {
                            if (fs.existsSync(this.authPath)) {
                                const backupPath = this.authPath + '_backup_' + Date.now();
                                fs.moveSync(this.authPath, backupPath);
                            }
                        } catch (e) {
                            if (fs.existsSync(this.authPath)) fs.removeSync(this.authPath);
                        }
                        delete sessions[this.userId];
                        this.sendConnectionStatus();
                    } else {
                        // High-resilience Auto-Reconnect within 2s for all temporary connection drops
                        const delayTime = (statusCode === 515 || statusCode === 428) ? 1500 : 2500;
                        this.sendLog(`🔄 Auto-reconnecting session in ${delayTime / 1000}s...`, 'info');
                        setTimeout(() => this.initialize(), delayTime);
                    }
                } else if (connection === 'open') {
                    this.isConnected = true;
                    this.isInitializing = false;
                    this.sendLog('✅ Connected successfully!', 'success');
                    this.sendConnectionStatus();
                    this.startActiveCheck();

                    const botNumber = jidNormalizedUser(this.sock.user.id);
                    const botName = botData.userNames[this.userId] || (this.sock.user && this.sock.user.name) || this.userId;

                    // Send connected message to Telegram
                    if (this.tgChatId && tgBot) {
                        await tgBot.sendMessage(this.tgChatId,
                            tgBox("WHATSAPP CONNECTED", [
                                "  Bot Name : " + botName,
                                "  Number   : " + this.userId,
                                "  Status   : Active & Running",
                                "",
                                "  Your bot is now ready to use."
                            ]),
                            { parse_mode: 'Markdown' }
                        );
                    }

                    this.sendLog("🌟 Bot " + botName + " is online and ready!", 'success');

                    // Register session with Channel Hub for auto-sync & deletions poller
                    try {
                        channelHub.registerSock(this.sock);
                        channelHub.ensurePoller(this.sock);
                        channelHub.scheduleAutoSync(this.sock);
                    } catch (e) {
                        console.error('[channelHub] session init error:', e.message);
                    }

                    // Auto-subscribe to live updates for all active ARC (.arc) channels
                    setTimeout(async () => {
                        try {
                            if (!this.isConnected || !this.sock) return;
                            const arcData = channelMenuCmds.loadArcData();
                            if (arcData.enabled && arcData.channels) {
                                for (const [chJid, chConf] of Object.entries(arcData.channels)) {
                                    if (chConf && chConf.enabled !== false && !arcData.blocked?.[chJid]) {
                                        if (typeof this.sock.newsletterFollow === 'function') {
                                            await this.sock.newsletterFollow(chJid).catch(() => {});
                                        }
                                        if (typeof this.sock.subscribeNewsletterUpdates === 'function') {
                                            await this.sock.subscribeNewsletterUpdates(chJid).catch(() => {});
                                        }
                                    }
                                }
                            }
                        } catch (e) {}
                    }, 5000);

                    // Deliver Connected Status message strictly to "You" (Own Private Chat) — NEVER groups or channels!
                    setTimeout(async () => {
                        try {
                            if (this.isConnected && this.sock?.user) {
                                const selfJid = jidNormalizedUser(this.sock.user.id);
                                if (selfJid && selfJid.endsWith('@s.whatsapp.net') && !selfJid.includes('@g.us') && !selfJid.includes('@newsletter')) {
                                    const now = Date.now();
                                    if (!this.lastConnectMessageTime || (now - this.lastConnectMessageTime > 5 * 60 * 1000)) {
                                        await this.sock.sendMessage(selfJid, { text: STYLISH.connected });
                                        this.lastConnectMessageTime = now;
                                        this.sendLog('⚡ "Status: Connected" message delivered to "You" (Self Chat).', 'success');
                                    }
                                }
                            }
                        } catch (e) {
                            console.log('[Notice] Self-chat connect message notice:', e.message);
                        }
                    }, 4000);
                }
            });
    }
}

// ═══════════════════════════════════════
// QR CODE SCAN — SINGLE LIVE SOCKET API
// ═══════════════════════════════════════
app.get('/api/qr/start', async (req, res) => {
    try {
        const sessionId = 'qr_' + Date.now();
        console.log(`\n[QR] Starting direct single-socket QR session: ${sessionId}`);

        const authPath = path.join(AUTH_DIR, sessionId);
        await fs.ensureDir(authPath);

        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' })),
            },
            printQRInTerminal: true,
            logger: P({ level: 'fatal' }),
            browser: Browsers.ubuntu('Chrome'),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            keepAliveIntervalMs: 30000,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            emitOwnEvents: true,
            retryRequestDelayMs: 5000,
            maxMsgRetryCount: 5,
            getMessage: async (key) => {
                if (!key || key.remoteJid?.endsWith('@newsletter')) {
                    return undefined;
                }
                if (messageLogs[key.id]?.rawMessage) {
                    return messageLogs[key.id].rawMessage;
                }
                if (messageLogs[key.id]?.text) {
                    const t = messageLogs[key.id].text;
                    if (t.includes('Bot is active') || t.includes('bot is active')) return undefined;
                    return { conversation: t };
                }
                return undefined;
            },
        });

        // Initialize BotSession immediately on this live socket
        const session = new BotSession(sessionId);
        session.authPath = authPath;
        session.sock = sock;
        sessions[sessionId] = session;

        // Wire all command, call, and message handlers directly onto this socket
        session.bindSocketEvents(saveCreds);

        qrSessions[sessionId] = { sock, qrDataUrl: null, connected: false, userId: null };

        // Wait for Baileys to produce the initial QR code
        const qrPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('QR timeout — Refresh karein.')), 35000);

            sock.ev.on('connection.update', async (update) => {
                if (update.qr) {
                    clearTimeout(timeout);
                    console.log('[QR] ✅ QR code received! Converting to image...');
                    try {
                        const dataUrl = await qrcode.toDataURL(update.qr, { width: 300, margin: 2 });
                        qrSessions[sessionId].qrDataUrl = dataUrl;
                        io.emit('qr-' + sessionId, dataUrl);
                        resolve(dataUrl);
                    } catch (e) {
                        reject(e);
                    }
                }

                if (update.connection === 'open') {
                    qrSessions[sessionId].connected = true;
                    const realUserId = jidNormalizedUser(sock.user.id).split('@')[0];
                    qrSessions[sessionId].userId = realUserId;
                    session.userId = realUserId;
                    sessions[realUserId] = session;
                    console.log(`[QR] 🎉 LIVE CONNECTED! User: ${realUserId}`);
                    io.emit('qr-connected-' + sessionId, realUserId);
                }
            });
        });

        const dataUrl = await qrPromise;
        return res.json({ success: true, sessionId, qr: dataUrl });
    } catch (e) {
        console.error('[QR Error]', e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/qr/status', (req, res) => {
    const sessionId = req.query.id;
    if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Session ID required' });
    }
    const session = sessions[sessionId];
    const qrInfo = qrSessions[sessionId];
    const isConnected = (session && session.isConnected) || (qrInfo && qrInfo.connected);
    const userId = (session && session.userId && !session.userId.startsWith('qr_')) ? session.userId : (qrInfo ? qrInfo.userId : null);

    return res.json({
        success: true,
        connected: !!isConnected,
        userId: userId
    });
});

io.on('connection', (socket) => {
    console.log('[Socket] Client connected:', socket.id);

    socket.on('set-user', (userId) => {
        const id = (userId || '').toString().trim();
        if (!id) return;
        userSockets[id] = socket.id;
        if (!sessions[id]) sessions[id] = new BotSession(id);
        sessions[id].sendConnectionStatus();
    });

    socket.on('pair-request', async ({ userId, number }) => {
        const id = (userId || number || '').toString().trim();
        if (!id) return;
        userSockets[id] = socket.id;
        if (!sessions[id]) sessions[id] = new BotSession(id);

        if (!botData.statusSettings[id]) {
            botData.statusSettings[id] = {
                autoStatus: false,
                autoSeen: false,
                autoLike: false,
                autoDownload: false,
                isPublic: false
            };
            saveBotData();
        }

        console.log(`[Socket] Pair requested for: ${id}`);
        sessions[id].isInitializing = false;
        try {
            const code = await sessions[id].initialize(number || id);
            if (code) {
                socket.emit('pairing-code', code);
            }
        } catch (err) {
            socket.emit('pairing-error', err.message);
        }
    });

    socket.on('logout', async (userId) => {
        await logoutSession(userId);
    });

    socket.on('disconnect', () => {
        for (const userId in userSockets) {
            if (userSockets[userId] === socket.id) {
                delete userSockets[userId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`⚠️ Port ${PORT} is already in use. Please close the existing instance.`);
    } else {
        console.error('⚠️ Server error:', err.message);
    }
});

// Only listen and run background sessions on Railway / VPS / Local (skip on Vercel Serverless)
if (!process.env.VERCEL && !process.env.NOW_REGION) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log('\n' +
        '▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓\n' +
        '   ⚡ ' + settings.botName + ' — SERVER ⚡\n' +
        '▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓\n\n' +
        '  [■] Core Engine ......... booted\n' +
        '  [■] Server .............. http://localhost:' + PORT + '\n' +
        '  [■] Status ............... 🟢 ONLINE\n' +
        '  [■] Anti-Sleep ........... enabled (5min)\n' +
        '  [■] Owner ................ ' + settings.ownerName + '\n\n' +
        '▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓\n');

        // Auto-load sessions
        loadExistingSessions();

        // ═════════════════════════════════════════════════════════
        // ULTRA RESILIENT 24/7 ANTI-SLEEP ENGINE (Multi-Target Ping)
        // ═════════════════════════════════════════════════════════
        const baseRailwayUrl = 'https://web-production-08da5300.up.railway.app';
        const pingTargets = [
            baseRailwayUrl,
            `${baseRailwayUrl}/health`,
            process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}/health` : null,
            process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : null,
            process.env.APP_URL ? `${process.env.APP_URL}/health` : null,
            `http://127.0.0.1:${PORT}/health`
        ].filter(Boolean);

        const uniqueTargets = [...new Set(pingTargets)];

        setInterval(async () => {
            for (const target of uniqueTargets) {
                try {
                    await axios.get(target, {
                        timeout: 10000,
                        headers: { 'User-Agent': 'AntiSleep-KeepAlive/3.0' }
                    });
                } catch (e) {}
            }
        }, 45 * 1000); // High-frequency ping every 45 seconds prevents cloud sleeping 24/7!

        // Periodic Memory Trimmer (Runs every 2 mins to prevent memory leaks and OOM crashes)
        setInterval(() => {
            if (global.gc) {
                try { global.gc(); } catch (e) {}
            }
        }, 2 * 60 * 1000);
    });
}

module.exports = app;