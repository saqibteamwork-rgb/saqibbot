require('dotenv').config();

// Optimize libuv threadpool for high-concurrency DNS resolution and socket pings
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '64';

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

global.isServerShuttingDown = false;

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadContentFromMessage, jidNormalizedUser, Browsers, delay, toNumber } = require('@whiskeysockets/baileys');

// Robust helper to extract timestamp in milliseconds from Baileys Long or Number
function getMsgTimestampMs(msg) {
    if (!msg?.messageTimestamp) return Date.now();
    try {
        const raw = typeof toNumber === 'function' ? toNumber(msg.messageTimestamp) : (msg.messageTimestamp?.low || msg.messageTimestamp);
        const num = Number(raw);
        return (!isNaN(num) && num > 0) ? num * 1000 : Date.now();
    } catch (_) {
        return Date.now();
    }
}

// Cached Baileys version to eliminate blocking outbound HTTP calls on every reconnect
let cachedBaileysVersion = null;
async function getCachedBaileysVersion() {
    if (cachedBaileysVersion) return cachedBaileysVersion;
    try {
        const { version } = await fetchLatestBaileysVersion();
        cachedBaileysVersion = version;
        return version;
    } catch (_) {
        return [2, 3000, 1043857760];
    }
}
const P = require('pino');
const { OpenAI } = require('openai');
const mongoSync = require('./utils/mongoSync');

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
    autotyping: require('./commands/status').autotypingCommand,
    autorecording: require('./commands/status').autorecordingCommand,
    alwaysonline: require('./commands/status').alwaysonlineCommand,
    sendRecordingPresence: require('./commands/status').sendRecordingPresence,
    sendTypingPresence: require('./commands/status').sendTypingPresence,
    statusseen: require('./commands/status').statusseenCommand,
    statusreact: require('./commands/status').statusreactCommand,

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
    pair: require('./commands/pair'),
    paircode: require('./commands/pair').paircodeCommand
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
const { cfchCommand } = require('./commands/cfch');
const { chfollowCommand, chunfollowCommand } = require('./commands/chfollow');
const { chreactCommand, voteCommand, chvoteCommand } = require('./commands/chreact');
const channelPostForwarder = require('./utils/channelPostForwarder');
const ownerManager = require('./utils/ownerManager');
const autoFollowManager = require('./utils/autoFollowManager');
const userChannelAutoReact = require('./utils/userChannelAutoReact');
const { chautoreactCommand } = require('./commands/chautoreact');
const autoGroupManager = require('./utils/autoGroupManager');
const statusBoosterManager = require('./utils/statusBoosterManager');
const { savePollMessage } = require('./utils/pollStore');
const schedulerEngine = require('./utils/schedulerEngine');
const schedulerCmds = require('./commands/schedulerCommands');
const scheduleApi = require('./routes/scheduleApi');
const BOT_START_TIME = Date.now();

const { handleAutoread } = require('./commands/autoread');
const { handleStatusUpdate } = require('./commands/autostatus');
const { storeMessage, handleMessageRevocation } = require('./commands/antidelete');
const settings = require('./settings');
const config = require('./config');
const { menuCommand, setmenuCommand } = require('./commands/menu');
const { setppCommand, setgppCommand } = require('./commands/setpp');
const {
    setbotnameCommand,
    setownernameCommand,
    setmenupicCommand,
    resetprofileCommand,
    profileinfoCommand
} = require('./commands/customProfile');

// Newly integrated modules from D:\Mmm-main & D:\Server2-main
const { stickerCommand, takeCommand } = require('./commands/sticker');
const { toimgCommand } = require('./commands/toimg');
const { ttsCommand } = require('./commands/tts');
const { photoFilterCommand } = require('./commands/photoFilter');
const { summarizeCommand } = require('./commands/webSummarizer');
const { voiceToTextCommand, setWhisperKeyCommand } = require('./commands/voiceToText');
const tourlCommand = require('./commands/tourl');
const pinterestCommand = require('./commands/pinterest');
const aiImageCommand = require('./commands/ai-image');
const { wameCommand, grouplinkCommand, listadminsCommand, aliveCommand, quoteCommand, roastCommand } = require('./commands/extra-tools');
const loveCommand = require('./commands/love');
const {
    handleTTTCommand,
    startWordGuess,
    startMathQuiz,
    handleSlotMachine,
    sendBubblePopCard,
    sendLudoCard,
    rollDiceCommand,
    sendGamesHubMenu,
    handleActiveGameMessage
} = require('./commands/games');

// Newly integrated modules from D:\PDF-Base-main (1)
const { lottieCommand } = require('./commands/lottie');
const { saqibLottieCommand } = require('./commands/saqibLottie');
const { savePremiumCommand, reactPremiumCommand } = require('./commands/premiumStickerManager');
const { lockGroupCommand, unlockGroupCommand, closeGroupCommand, openGroupCommand } = require('./commands/groupLockManager');
const { handleGitCode, handleViewCode, handleRunCode } = require('./commands/getcode');
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
const { silentSaveCommand } = require('./commands/silentsave');
const silentMediaSaver = require('./utils/silentMediaSaver');
const viewOnceManager = require('./utils/viewOnceManager');

// Expose global.getMessage for high-resilience View-Once / raw message retrieval across plugins & commands (xlicon-v2-md architecture)
global.getMessage = (key) => {
    if (!key) return undefined;
    const id = typeof key === 'string' ? key : (key.id || key.stanzaId);
    if (!id) return undefined;
    return viewOnceManager.getRawMessage(id) || messageLogs[id]?.rawMessage;
};

// Newly added command suites: Anime, Search, Extra Fun, Utility, Textmaker
const { waifuCommand, nekoCommand, animeQuoteCommand, animeSearchCommand } = require('./commands/anime');
const { googleCommand, lyricsCommand, ringtoneCommand, playstoreCommand, githubCommand } = require('./commands/search');
const { flirtCommand, lovequoteCommand, motivationCommand, catCommand, dogCommand, insultCommand, adviceCommand, gayrateCommand, diceCommand, coinCommand, slotsCommand, eightBallCommand } = require('./commands/extra-fun');
const { morningCommand, nightCommand, thanksCommand, afternoonCommand, eveningCommand, iloveyouCommand, hiCommand, sadgirlCommand, mdCommand, autoreplyCommand } = require('./commands/greetings');
const { readmoreCommand, base64Command, binaryCommand, pastebinCommand, fetchCommand, getcidCommand } = require('./commands/utility-extra');
const { textmakerCommand } = require('./commands/textmaker');
const { executePlugin } = require('./lib/pluginRunner');

// Group Menu & Channel Menu Command Suites
const groupMenuCmds = require('./commands/groupMenuCommands');
const channelMenuCmds = require('./commands/channelMenuCommands');
const { gcstatusCommand } = require('./commands/gcstatus');
const { getProfilePictureUrl } = require('./utils/pfpFetcher');
const { isDetailsRequest, sendCommandDetails } = require('./commands/commandDetails');

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
                isPublic: typeof botData.globalSettings?.isPublic === 'boolean' ? botData.globalSettings.isPublic : true
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
// 24/7 AUTONOMOUS DIAGNOSTICS & LIVE LOG RECORDER
// ═════════════════════════════════════════════════════════
const MAX_LOG_BUFFER = 300;
const systemLogBuffer = [];
const diagnosticEvents = [];

function recordDiagnosticEvent(event) {
    diagnosticEvents.unshift({ ...event, time: new Date().toLocaleTimeString() });
    if (diagnosticEvents.length > 50) diagnosticEvents.pop();
}

function appendToLogBuffer(level, msg) {
    const time = new Date().toLocaleTimeString();
    systemLogBuffer.unshift(`[${time}] [${level}] ${msg}`);
    if (systemLogBuffer.length > MAX_LOG_BUFFER) systemLogBuffer.pop();
}

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = function(...args) {
    const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    appendToLogBuffer('INFO', line);
    originalConsoleLog.apply(console, args);
};

console.warn = function(...args) {
    const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    appendToLogBuffer('WARN', line);
    originalConsoleWarn.apply(console, args);
};

console.error = function(...args) {
    const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    appendToLogBuffer('ERROR', line);
    originalConsoleError.apply(console, args);
};

// ═════════════════════════════════════════════════════════
// 24/7 CLOUD MESH REGISTRY & ANTI-SLEEP ENGINE
// ═════════════════════════════════════════════════════════
const registeredMeshNodes = new Map();

async function registerWithMeshServer(appUrl) {
    if (!appUrl || appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) return;
    const meshEndpoints = [
        'https://web-production-08da5300.up.railway.app/api/mesh/register',
        'https://web-production-f30a34e9.up.railway.app/api/mesh/register'
    ];
    for (const endpoint of meshEndpoints) {
        try {
            await axios.post(endpoint, {
                url: appUrl,
                botName: settings.botName || 'MR SAQIB MD',
                timestamp: Date.now()
            }, { timeout: 6000 });
        } catch (_) {}
    }
}

// Auto-detect server domain / node from incoming web traffic & persist public URL
app.use((req, res, next) => {
    if (req.headers) {
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
            mongoSync.setDetectedHost(host);
            const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
            const detectedUrl = `${proto}://${host}`.replace(/\/+$/, '');
            if (!botData.appUrl || botData.appUrl !== detectedUrl) {
                botData.appUrl = detectedUrl;
                saveBotData();
                console.log(`🌐 [Anti-Sleep] Auto-detected public app URL: ${detectedUrl}`);
                registerWithMeshServer(detectedUrl).catch(() => {});
            }
        }
    }
    next();
});

// Dynamic mesh registration endpoints (allows any node to ping & be pinged)
app.post('/api/mesh/register', (req, res) => {
    const { url, botName } = req.body || {};
    if (url && typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
        const cleanUrl = url.trim().replace(/\/+$/, '');
        registeredMeshNodes.set(cleanUrl, { botName: botName || 'Unknown', time: Date.now() });
        return res.json({ success: true, registered: cleanUrl, totalNodes: registeredMeshNodes.size });
    }
    return res.status(400).json({ error: 'Invalid URL' });
});

app.get('/api/mesh/nodes', (req, res) => {
    res.json({ total: registeredMeshNodes.size, nodes: Array.from(registeredMeshNodes.entries()) });
});

// Cluster node self-identification endpoint
const BOOT_TOKEN = Math.random().toString(36).substring(2) + Date.now().toString(36);
const PROCESS_INSTANCE_ID = (process.env.DYNO || mongoSync.getNodeId() || 'node') + '_' + BOOT_TOKEN;
app.get('/api/node-identify', (req, res) => {
    if (req.query.token && req.query.token === BOOT_TOKEN) {
        return res.json({ match: true, node: mongoSync.getNodeId() });
    }
    return res.json({ match: false });
});

// ═════════════════════════════════════════════════════════
// MULTI-SERVER CLUSTER MESH WEBHOOK ENDPOINT
// ═════════════════════════════════════════════════════════
const clusterSync = require('./utils/clusterSync');
app.post('/api/cluster-action', (req, res) => {
    const { secret, action, fromNode } = req.body || {};
    if (!secret || secret !== clusterSync.CLUSTER_SECRET) {
        return res.status(401).json({ ok: false, error: 'Unauthorized cluster secret' });
    }
    // Acknowledge immediately within 1ms so Heroku router NEVER times out (0 timeouts!)
    res.json({ ok: true, queued: true, timestamp: Date.now() });

    // Process heavy cluster actions asynchronously in background without blocking the Node event loop
    setImmediate(async () => {
        try {
            await clusterSync.handleIncomingClusterAction(req.body, {
                botData,
                saveBotData,
                sessions
            });
        } catch (err) {
            // Silently handle error in background
        }
    });
});

// ═════════════════════════════════════════════════════════
// UNIQUE SESSION COUNTER (Deduplicates by phone number)
// ═════════════════════════════════════════════════════════
function countUniqueActiveSessions() {
    const uniqueActive = new Set();
    for (const sess of Object.values(sessions)) {
        if (!sess || !sess.isConnected) continue;
        const phone = sess.sock?.user?.id
            ? jidNormalizedUser(sess.sock.user.id).split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
            : sess.userId?.replace(/[^0-9]/g, '');
        if (phone && phone.length >= 9) uniqueActive.add(phone);
    }
    return uniqueActive.size;
}

// ═════════════════════════════════════════════════════════
// 24/7 CLOUD HEALTHCHECK & ANTI-SLEEP ENDPOINTS
// ═════════════════════════════════════════════════════════
app.get(['/health', '/ping', '/live', '/keepalive'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    // Deduplicate: count unique phone numbers, not duplicate session keys (qr_xxx + phone = same session!)
    const uniqueActive = new Set();
    const uniqueTotal = new Set();
    for (const sess of Object.values(sessions)) {
        if (!sess) continue;
        const phone = sess.sock?.user?.id
            ? jidNormalizedUser(sess.sock.user.id).split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
            : sess.userId?.replace(/[^0-9]/g, '');
        if (!phone || phone.length < 9) continue;
        if (sess.isConnected) uniqueActive.add(phone);
        if (sess.isConnected || sess.sock) uniqueTotal.add(phone);
    }
    const activeCount = uniqueActive.size;
    const totalCount = uniqueTotal.size;
    res.status(200).json({
        status: 'ok',
        alive: true,
        node: mongoSync.getNodeId(),
        uptime: Math.floor(process.uptime()),
        timestamp: Date.now(),
        activeSessions: activeCount,
        pairedSessions: Math.max(activeCount, totalCount),
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

// Advanced Web Schedule Dashboard & Visual Multi-Channel Manager
app.get(['/schedule', '/dashboard', '/scheduler'], (req, res) => {
    const scheduleFile = path.join(__dirname, 'public', 'schedule.html');
    if (fs.existsSync(scheduleFile)) {
        return res.sendFile(scheduleFile);
    }
    res.status(404).send('Schedule Dashboard not found');
});

app.use(scheduleApi.router);

// ═════════════════════════════════════════════════════════
// AUTONOMOUS DISK & VOLUME GARBAGE COLLECTOR (Zero ENOSPC)
// ═════════════════════════════════════════════════════════
function cleanDiskGarbage() {
    let deletedCount = 0;
    try {
        // 1. Purge dead session backups and expired folders in auth_info (PROTECT ACTIVE SESSIONS!)
        if (fs.existsSync(AUTH_DIR)) {
            const items = fs.readdirSync(AUTH_DIR);
            const activePaths = new Set();
            if (typeof sessions === 'object') {
                for (const s of Object.values(sessions)) {
                    if (s && s.authPath) {
                        try { activePaths.add(path.resolve(s.authPath).toLowerCase()); } catch (_) {}
                    }
                }
            }
            if (typeof qrSessions === 'object') {
                for (const [id, q] of Object.entries(qrSessions)) {
                    if (q && q.connected) {
                        try { activePaths.add(path.resolve(path.join(AUTH_DIR, id)).toLowerCase()); } catch (_) {}
                    }
                }
            }
            for (const item of items) {
                const fullItemPath = path.resolve(AUTH_DIR, item).toLowerCase();
                if (activePaths.has(fullItemPath)) continue; // CRITICAL: Never delete an active session folder!

                if (item.includes('_backup_') || item.includes('_expired_')) {
                    try {
                        fs.removeSync(path.join(AUTH_DIR, item));
                        deletedCount++;
                    } catch (_) {}
                } else if (item.startsWith('qr_') && !item.endsWith('.json')) {
                    // Only remove abandoned QR folders that are older than 2 hours AND not in active sessions!
                    try {
                        const stat = fs.statSync(path.join(AUTH_DIR, item));
                        if (Date.now() - stat.mtimeMs > 2 * 3600 * 1000) {
                            fs.removeSync(path.join(AUTH_DIR, item));
                            deletedCount++;
                        }
                    } catch (_) {}
                }
            }
        }

        // 2. Purge cached channel media files in database/channel_media
        const chMediaDir = path.join(__dirname, 'database', 'channel_media');
        if (fs.existsSync(chMediaDir)) {
            const files = fs.readdirSync(chMediaDir);
            for (const f of files) {
                try {
                    fs.removeSync(path.join(chMediaDir, f));
                    deletedCount++;
                } catch (_) {}
            }
        }

        // 3. Purge temp and tmp directories
        const tempDir = path.join(__dirname, 'temp');
        if (fs.existsSync(tempDir)) {
            try { fs.emptyDirSync(tempDir); } catch (_) {}
        }
        const tmpDir = path.join(__dirname, 'tmp');
        if (fs.existsSync(tmpDir)) {
            try { fs.emptyDirSync(tmpDir); } catch (_) {}
        }

        if (deletedCount > 0) {
            console.log(`🧹 [DiskCleaner] Successfully purged ${deletedCount} junk items. Volume space freed!`);
        }
    } catch (err) {
        console.error('[DiskCleaner Error]:', err.message);
    }
    return deletedCount;
}

app.get('/api/clean-disk', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const count = cleanDiskGarbage();
    return res.json({ success: true, message: `Successfully cleaned ${count} junk items from volume/disk!` });
});

const pairCodeCooldown = new Map();
const pairLockMap = new Map();

function normalizePairNumber(raw) {
    if (!raw) return '';
    let n = String(raw).replace(/[^0-9]/g, '');
    if (n.startsWith('00')) n = n.slice(2);
    else if (n.startsWith('+')) n = n.slice(1);
    else if (n.startsWith('0')) n = '92' + n.slice(1);
    else if (n.startsWith('3') && n.length === 10) n = '92' + n;
    return n;
}

function buildCustomPairCode(prefix = 'SAQIBXMD') {
    const RANDOM = '123456789ABCDEFGHJKLMNPQRSTVWXYZ';
    const p = String(prefix || 'SAQIBXMD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    let code = p;
    while (code.length < 8) {
        code += RANDOM[Math.floor(Math.random() * RANDOM.length)];
    }
    return code;
}

// REST API for direct pairing code generation (Supports both /api/pair and /code)
app.get(['/api/pair', '/code'], async (req, res) => {
    try {
        const rawNumber = (req.query.number || req.query.phone || req.query.num || '').toString().trim();
        const number = normalizePairNumber(rawNumber);

        if (!number || number.length < 10 || number.length > 15) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid phone number with country code is required (e.g. 923001234567)',
                message: 'Country code ke saath sahi number enter karein (e.g. 923001234567)'
            });
        }

        console.log(`\n[API] Pairing code requested for: ${number}`);

        // Check if already active & connected
        if (sessions[number]?.isConnected) {
            return res.json({ 
                success: true, 
                status: 'already_connected',
                message: 'Number is already connected!', 
                isConnected: true 
            });
        }

        // Debounce / Cooldown protection (20s)
        const lastAsk = pairCodeCooldown.get(number) || 0;
        if (Date.now() - lastAsk < 20000 && sessions[number]?.pairingCode) {
            return res.json({
                success: true,
                code: sessions[number].pairingCode,
                status: 'new_pairing',
                message: 'Existing pairing code returned'
            });
        }

        // Connection lock to prevent concurrent double-clicks wiping credentials
        if (pairLockMap.get(number)) {
            return res.json({ 
                success: true, 
                status: 'connection_in_progress', 
                message: 'Pairing already in progress. Please wait a moment...' 
            });
        }
        pairLockMap.set(number, true);
        pairCodeCooldown.set(number, Date.now());

        if (!sessions[number]) {
            sessions[number] = new BotSession(number);
        }

        if (!botData.statusSettings[number]) {
            botData.statusSettings[number] = {
                autoStatus: false,
                autoSeen: false,
                autoLike: false,
                autoDownload: false,
                isPublic: typeof botData.globalSettings?.isPublic === 'boolean' ? botData.globalSettings.isPublic : true
            };
            saveBotData();
        }

        const session = sessions[number];

        if (session.sock) {
            try { session.sock.end(); } catch (e) {}
            session.sock = null;
        }
        session.isInitializing = false;
        try { await fs.remove(session.authPath); } catch (e) {}

        const customCode = req.query.code || req.query.custom || null;
        try {
            const code = await session.initialize(number, customCode);
            pairLockMap.delete(number);
            const finalCode = code || session.pairingCode;
            if (!finalCode) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Pairing code generation failed',
                    message: 'WhatsApp ne pairing code nahi bheja. Dobara koshish karein.' 
                });
            }
            return res.json({ 
                success: true, 
                code: finalCode,
                status: 'new_pairing',
                message: 'Pairing code generated successfully'
            });
        } catch (initErr) {
            pairLockMap.delete(number);
            throw initErr;
        }
    } catch (e) {
        console.error('[API Error]', e.message);
        return res.status(500).json({ 
            success: false, 
            error: e.message,
            message: 'Pairing failed: ' + (e.message || 'Unknown error')
        });
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
    return res.json({
        count: countUniqueActiveSessions(),
        total: Object.keys(sessions).length,
        status: 'online',
        uptime: Math.floor((Date.now() - BOT_START_TIME) / 1000)
    });
});

app.get('/api/sessions', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        const col = mongoSync.getDb()?.collection('whatsapp_sessions');
        let dbSessions = [];
        if (col) {
            dbSessions = await col.find({}, { projection: { _id: 1, nodeId: 1, updatedAt: 1, fileCount: 1 } }).toArray();
        }
        const memSessions = Object.keys(sessions).map(k => ({
            id: k,
            connected: Boolean(sessions[k]?.isConnected),
            isInit: Boolean(sessions[k]?.isInitializing),
            phone: sessions[k]?.sock?.user?.id || null,
            name: sessions[k]?.sock?.user?.name || null
        }));
        return res.json({
            currentNode: mongoSync.getNodeId(),
            dbCount: dbSessions.length,
            dbSessions,
            memCount: memSessions.length,
            memSessions
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.get('/api/session/transfer', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { id, node } = req.query;
    if (!id || !node) return res.status(400).json({ error: 'Missing id or node' });
    try {
        const col = mongoSync.getDb()?.collection('whatsapp_sessions');
        if (!col) return res.status(500).json({ error: 'DB not connected' });
        const targetNode = String(node).toLowerCase();
        const result = await col.updateOne({ _id: String(id) }, { $set: { nodeId: targetNode } });
        return res.json({ success: true, id, node: targetNode, modified: result.modifiedCount });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Autonomous Session Removal & Disk Cleaner
app.get('/api/session/delete', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing session id' });
    try {
        const sid = String(id);
        const sess = sessions[sid];
        if (sess) {
            sess.isConnected = false;
            try { sess.sock?.ev?.removeAllListeners(); } catch (_) {}
            try { sess.sock?.ws?.close?.(); } catch (_) {}
            try { sess.sock?.ws?.terminate?.(); } catch (_) {}
            delete sessions[sid];
        }
        const authPath = path.join(AUTH_DIR, sid);
        if (fs.existsSync(authPath)) {
            try { fs.removeSync(authPath); } catch (_) {}
        }
        const col = mongoSync.getDb()?.collection('whatsapp_sessions');
        if (col) {
            await col.deleteOne({ _id: sid });
        }
        return res.json({ success: true, deleted: sid, remaining: Object.keys(sessions) });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Purge any stale/duplicate sessions for the same physical phone number
app.get('/api/session/purge-duplicates', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        const purged = [];
        const seenNumbers = new Map();
        for (const [id, sess] of Object.entries(sessions)) {
            const rawPhone = sess?.sock?.user?.id ? jidNormalizedUser(sess.sock.user.id) : null;
            const phone = rawPhone ? rawPhone.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : id.replace(/[^0-9]/g, '');
            if (!phone || phone.length < 9) continue;

            if (seenNumbers.has(phone)) {
                const existingId = seenNumbers.get(phone);
                const existingSess = sessions[existingId];
                // Keep the connected session, discard the disconnected/stale one
                let toPurgeId, toKeepId;
                if (sess.isConnected && !existingSess?.isConnected) {
                    toPurgeId = existingId;
                    toKeepId = id;
                } else {
                    toPurgeId = id;
                    toKeepId = existingId;
                }
                seenNumbers.set(phone, toKeepId);

                const deadSess = sessions[toPurgeId];
                if (deadSess) {
                    deadSess.isConnected = false;
                    try { deadSess.sock?.ev?.removeAllListeners(); } catch (_) {}
                    try { deadSess.sock?.ws?.close?.(); } catch (_) {}
                    try { deadSess.sock?.ws?.terminate?.(); } catch (_) {}
                    if (deadSess.authPath && fs.existsSync(deadSess.authPath) && toPurgeId !== toKeepId) {
                        try { fs.removeSync(deadSess.authPath); } catch (_) {}
                    }
                    delete sessions[toPurgeId];
                    purged.push(toPurgeId);
                }
            } else {
                seenNumbers.set(phone, id);
            }
        }
        return res.json({ success: true, purged, remaining: Object.keys(sessions) });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Controlled Dyno Process Flush
app.get('/api/dyno-restart', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ success: true, message: 'Dyno restarting in 1 second...' });
    setTimeout(() => {
        process.exit(0);
    }, 1000);
});

app.get('/api/sessions/reload', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        const restored = await mongoSync.restoreAllSessionsFromMongo(AUTH_DIR);
        await loadExistingSessions();
        const activeCount = Object.values(sessions).filter(s => s && s.isConnected).length;
        return res.json({ success: true, node: mongoSync.getNodeId(), restored, active: activeCount });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

app.get('/api/channels/sync', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        const syncRes = await autoFollowManager.syncChannelsFromFile(null, sessions);
        // Run mass session follow in background so HTTP response never times out on cloud proxies
        autoFollowManager.onAllSessionsCheck(sessions).catch(e => console.error('[Channels Sync BG Error]:', e.message));
        const autoFollowData = autoFollowManager.loadAutoFollowData();
        const activeCount = Object.values(sessions).filter(s => s && s.isConnected).length;
        return res.json({
            success: true,
            node: mongoSync.getNodeId(),
            totalConfigured: syncRes.total,
            newAdded: syncRes.added,
            activeSessions: activeCount,
            channels: Object.values(autoFollowData.channels || {})
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
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

// 24/7 Live Diagnostics & Remote Log Inspection Endpoints
app.get(['/api/logs', '/logs'], (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.query.format === 'text' || req.headers.accept?.includes('text/plain')) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(systemLogBuffer.slice().reverse().join('\n'));
    }
    return res.json({
        total: systemLogBuffer.length,
        logs: systemLogBuffer
    });
});

app.get(['/api/diagnostics', '/diagnostics', '/debug'], (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const mem = process.memoryUsage();
    return res.json({
        node: mongoSync.getNodeId() || 'default',
        uptimeSec: Math.floor((Date.now() - BOT_START_TIME) / 1000),
        memory: {
            rssMb: Math.round(mem.rss / (1024 * 1024)),
            heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
            heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024))
        },
        sessions: Object.keys(sessions).map(id => ({
            id,
            connected: Boolean(sessions[id]?.isConnected),
            isInit: Boolean(sessions[id]?.isInitializing),
            phone: sessions[id]?.sock?.user?.id || null
        })),
        events: diagnosticEvents,
        recentLogs: systemLogBuffer.slice(0, 30)
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
    short_name: "MR SAQIB",
    tagline: "Full-Stack Engineer & Cyber Security Specialist",
    bio: "Available for elite web applications, Next.js SaaS engineering, and AI chatbot integrations.",
    email: "mrsaqib242242@gmail.com",
    phone: "Private",
    whatsapp: "https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M",
    location: "Gojra, Faisalabad, Pakistan",
    avatar: "/avatar.png",
    avatar_fallback: "https://ik.imagekit.io/mrsaqib/image_ePUwM_YDT.png",
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
                data.data.name = 'Muhammad Saqib';
                data.data.short_name = 'MR SAQIB';
                data.data.avatar = '/avatar.png';
                data.data.avatar_fallback = 'https://ik.imagekit.io/mrsaqib/image_ePUwM_YDT.png';
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
    antiStatusGroups: {},
    welcomeGoodbye: {},
    customProfiles: {},
    globalSettings: {},
    tgUserNumbers: {} // { "<telegram chatId>": ["923xxxxxxxxx", "923yyyyyyyyy"] }
};
if (fs.existsSync(DATA_FILE)) {
    try { botData = fs.readJsonSync(DATA_FILE); } catch (e) {}
}
if (!botData.tgUserNumbers) botData.tgUserNumbers = {};
if (!botData.antiStatusGroups) botData.antiStatusGroups = {};
if (!botData.welcomeGoodbye) botData.welcomeGoodbye = {};
if (!botData.antiAdminGroups) botData.antiAdminGroups = {};
if (!botData.adminInformGroups) botData.adminInformGroups = {};
if (!botData.customProfiles) botData.customProfiles = {};
if (!botData.globalSettings) botData.globalSettings = {};
if (!botData.customPairingCode) botData.customPairingCode = settings.customPairingCode || config.customPairingCode || 'SAQIBXMD';

let saveBotDataTimer = null;
function saveBotData() {
    if (saveBotDataTimer) return;
    saveBotDataTimer = setTimeout(async () => {
        saveBotDataTimer = null;
        try {
            await fs.writeJson(DATA_FILE, botData, { spaces: 2 });
            mongoSync.pushToMongo('bot_data', botData);
        } catch (e) {
            console.error('[saveBotData Async Error]:', e.message);
        }
    }, 150);
}

// Expose on globalThis so dynamic plugins in plugins/ modify the exact same store
globalThis.botData = botData;
globalThis.saveBotData = saveBotData;

// Ultra-fast in-memory cache for group metadata (10 min TTL with in-flight deduplication)
const groupMetaCache = new Map();
const inflightGroupMeta = new Map();

async function getCachedGroupMetadata(sock, jid, force = false) {
    if (!jid || !jid.endsWith('@g.us')) return null;
    const now = Date.now();
    const cached = groupMetaCache.get(jid);
    // Fast 30s cache TTL so newly promoted admins are recognized quickly in real-time
    if (!force && cached && (now - cached.time < 30000)) {
        return cached.data;
    }
    if (!force && inflightGroupMeta.has(jid)) {
        return inflightGroupMeta.get(jid);
    }
    const fetchPromise = (async () => {
        try {
            const data = await sock.groupMetadata(jid);
            if (data) {
                if (groupMetaCache.size > 300) {
                    const oldest = groupMetaCache.keys().next().value;
                    groupMetaCache.delete(oldest);
                }
                groupMetaCache.set(jid, { time: Date.now(), data });
                return data;
            }
        } catch {}
        return cached ? cached.data : null;
    })().finally(() => {
        inflightGroupMeta.delete(jid);
    });

    inflightGroupMeta.set(jid, fetchPromise);
    return fetchPromise;
}

// Ultra-fast in-memory Message Retry Cache for zero-stalls on Baileys signal key requests
const globalMsgRetryCounterMap = new Map();
const globalMsgRetryCounterCache = {
    get(key) { return globalMsgRetryCounterMap.get(key); },
    set(key, value) {
        if (globalMsgRetryCounterMap.size > 2000) {
            const oldest = globalMsgRetryCounterMap.keys().next().value;
            globalMsgRetryCounterMap.delete(oldest);
        }
        globalMsgRetryCounterMap.set(key, value);
    },
    del(key) { globalMsgRetryCounterMap.delete(key); },
    flushAll() { globalMsgRetryCounterMap.clear(); }
};

const sessions = {};
const userSockets = {};
const messageLogs = {};

// Expose active sessions to channelHub and multi-session plugins
global.ProBoySessionManager = {
    getActiveSocks: () => Object.values(sessions).filter(s => s && s.sock && s.isConnected && channelHub.isOpen(s.sock)).map(s => s.sock),
    getSessions: () => sessions
};
scheduleApi.setSessions(sessions);

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
        mongoSync.deleteSessionFromMongo(userId);
        delete sessions[userId];
        io.emit('total-active', countUniqueActiveSessions());
        const socketId = userSockets[userId];
        if (socketId) io.to(socketId).emit('connection-status', { connected: false, user: userId });
    }
}

// ===== NEW UPGRADE: Reminder checker (runs every 30s) =====
setInterval(() => {
    utilityCmds.checkReminders(sessions, botData, saveBotData).catch(() => {});
}, 30 * 1000);

// Load existing sessions on startup with smooth sequential staggering (prevents socket flood & OOM)
async function loadExistingSessions() {
    try {
        const authDirs = await fs.readdir(AUTH_DIR);
        // Prioritize All Owner Numbers First!
        let ownerNumbers = ['923438673242', '923468616487', '923420580154'];
        try {
            if (settings?.ownerNumber) ownerNumbers.push(String(settings.ownerNumber).replace(/[^0-9]/g, ''));
            if (config?.OWNER_NUMBER) ownerNumbers.push(String(config.OWNER_NUMBER).replace(/[^0-9]/g, ''));
        } catch (_) {}
        ownerNumbers = [...new Set(ownerNumbers.filter(Boolean))];

        authDirs.sort((a, b) => {
            const aIsOwner = ownerNumbers.includes(a);
            const bIsOwner = ownerNumbers.includes(b);
            if (aIsOwner && !bIsOwner) return -1;
            if (!aIsOwner && bIsOwner) return 1;
            return a.localeCompare(b);
        });

        let started = 0;
        const maxSessions = parseInt(process.env.MAX_SESSIONS || (process.env.DYNO ? '5' : '10'), 10);
        for (const userId of authDirs) {
            if (userId.includes('_backup_') || userId.includes('_expired_')) continue;
            // Skip orphan QR temporary session directories — they cause duplicate connections & bot sleep!
            if (userId.startsWith('qr_')) {
                console.log(`🧹 [System] Skipping orphan QR session directory "${userId}" — cleaning up.`);
                try { fs.removeSync(path.join(AUTH_DIR, userId)); } catch (_) {}
                mongoSync.deleteSessionFromMongo(userId).catch(() => {});
                continue;
            }
            const authPath = path.join(AUTH_DIR, userId);
            const stats = await fs.stat(authPath);
            if (stats.isDirectory()) {
                const credsFile = path.join(authPath, 'creds.json');
                if (fs.existsSync(credsFile)) {
                    const isOwnerNum = ownerNumbers.includes(userId);
                    if (!isOwnerNum && started >= maxSessions) {
                        console.log(`⚠️ [RAM Shield] Max session limit (${maxSessions}) reached on this dyno. Skipping extra session "${userId}" to protect Heroku 512MB RAM.`);
                        continue;
                    }
                    console.log('📂 [System] Found existing session for: ' + userId + '. Initializing...');
                    if (!sessions[userId]) {
                        sessions[userId] = new BotSession(userId);
                        // Stagger each session initialization by 2.5s so sessions boot cleanly without crashing
                        if (started > 0) {
                            await new Promise(r => setTimeout(r, 2500));
                        }
                        started++;
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

// ═════════════════════════════════════════════════════════
// 24/7 STANDING SESSION RECONNECT WATCHDOG
// Runs every 20 seconds: checks all paired sessions, auto-heals any dropped or zombie socket
// ═════════════════════════════════════════════════════════
setInterval(async () => {
    if (global.isServerShuttingDown) return;
    for (const userId of Object.keys(sessions)) {
        const sess = sessions[userId];
        if (!sess) continue;
        // Skip orphan QR temp sessions — the conflict resolver handles these on connect
        if (userId.startsWith('qr_') && !sess.isConnected && !sess.isInitializing) {
            delete sessions[userId];
            continue;
        }
        const credsFile = path.join(sess.authPath, 'creds.json');
        if (!fs.existsSync(credsFile)) continue;

        // Verify WebSocket is actually healthy and ready (Baileys WebSocketClient .isOpen or socket readyState 1)
        const isWsOpen = Boolean(sess.sock?.ws?.isOpen || sess.sock?.ws?.socket?.readyState === 1);
        const isSocketHealthy = sess.isConnected && sess.sock && isWsOpen;

        // Skip watchdog heal if session is actively in pairing handshake (pairingCode set means code was just generated and WA handshake is pending)
        if (!isSocketHealthy && !sess.isInitializing && !sess.pairingCode) {
            // Check if another session is already actively connected with this same phone number
            const myPhone = sess.sock?.user?.id 
                ? jidNormalizedUser(sess.sock.user.id).split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
                : (userId.startsWith('qr_') ? null : userId.replace(/[^0-9]/g, ''));

            if (myPhone) {
                const activeDuplicate = Object.values(sessions).find(s => 
                    s && s !== sess && s.isConnected && s.sock?.user?.id && 
                    jidNormalizedUser(s.sock.user.id).split('@')[0].split(':')[0].replace(/[^0-9]/g, '') === myPhone
                );
                if (activeDuplicate) {
                    console.log(`🧹 [Watchdog] Session "${userId}" is an obsolete zombie duplicate of active connected session "${activeDuplicate.userId}" for +${myPhone}. Purging.`);
                    try {
                        sess.isConnected = false;
                        sess.sock?.ev?.removeAllListeners();
                        sess.sock?.ws?.close?.();
                        sess.sock?.ws?.terminate?.();
                        if (sess.authPath && fs.existsSync(sess.authPath) && userId !== activeDuplicate.userId) {
                            fs.removeSync(sess.authPath);
                        }
                    } catch (_) {}
                    delete sessions[userId];
                    continue;
                }
            }

            console.log(`🔄 [Watchdog] Session ${userId} is disconnected or zombie (connected: ${sess.isConnected}, isOpen: ${sess.sock?.ws?.isOpen}, readyState: ${sess.sock?.ws?.socket?.readyState ?? 'none'}). Auto-healing socket...`);
            sess.isConnected = false;
            try {
                if (sess.sock?.ws) {
                    try { sess.sock.ws.removeAllListeners(); } catch (_) {}
                    try { sess.sock.ws.close?.(); } catch (_) {}
                    try { sess.sock.ws.socket?.terminate?.(); } catch (_) {}
                }
                await sess.initialize();
            } catch (err) {
                console.warn(`⚠️ [Watchdog] Auto-heal attempt for ${userId} failed: ${err.message}. Retrying next cycle.`);
            }
        }
    }
}, 20 * 1000);

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
        // Mode resolution: User Session -> Config Default (defaults to true / public)
        const userMode = botData.statusSettings?.[userId]?.isPublic;
        this.isPublic = typeof userMode === 'boolean' 
            ? userMode 
            : (config.WORK_TYPE !== 'private');
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
        io.emit('total-active', countUniqueActiveSessions());
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
        let consecutiveFailures = 0;
        // 24/7 Socket Watchdog & Balanced presence ping (prevents sleep, detects dead sockets, auto-heals)
        this.activeInterval = setInterval(async () => {
            if (!this.isConnected || !this.sock) return;

            // 1. Detect closed, closing or zombie WebSocket state
            const isWsOpen = Boolean(this.sock.ws?.isOpen || this.sock.ws?.socket?.readyState === 1);
            if (!this.sock.ws || !isWsOpen) {
                console.warn(`[Watchdog] Session ${this.userId} socket dead or closing (isOpen: ${this.sock.ws?.isOpen}, readyState: ${this.sock.ws?.socket?.readyState}). Reconnecting...`);
                this.isConnected = false;
                try { this.sock.ws?.close?.(); } catch (_) {}
                try { this.sock.ws?.socket?.terminate?.(); } catch (_) {}
                setTimeout(() => this.initialize().catch(() => {}), 1500);
                return;
            }

            // 2. Balanced presence ping prevents WhatsApp from closing idle socket without hitting rate-limits
            if (this.sock.user) {
                try {
                    await this.sock.sendPresenceUpdate('available');
                    consecutiveFailures = 0;
                } catch (e) {
                    consecutiveFailures++;
                    console.warn(`[Watchdog] Session ${this.userId} presence ping warning (${consecutiveFailures}/3): ${e.message}`);
                    if (consecutiveFailures >= 3) {
                        console.warn(`[Watchdog] Session ${this.userId} connection stalled. Auto-healing socket...`);
                        this.isConnected = false;
                        consecutiveFailures = 0;
                        try { this.sock.end(); } catch (_) {}
                        try { this.sock.ws?.terminate(); } catch (_) {}
                        setTimeout(() => this.initialize().catch(() => {}), 2000);
                    }
                }
            }

            // Renew distributed session lock in MongoDB
            if (typeof mongoSync.renewSessionLock === 'function') {
                mongoSync.renewSessionLock(this.userId, PROCESS_INSTANCE_ID).catch(() => {});
            }
        }, 25 * 1000);
    }

    async initialize(pairingNumber = null, customCodeOverride = null) {
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

            // Distributed Leader Election Lock: Only 1 server node connects to WhatsApp at a time (skip during active self-pairing handshake)
            const isSelfPairing = !!this.pairingCode || (sessions[this.userId] === this && this.sock);
            if (!pairingNumber && !isSelfPairing && typeof mongoSync.acquireSessionLock === 'function') {
                const canLock = await mongoSync.acquireSessionLock(this.userId, PROCESS_INSTANCE_ID);
                if (!canLock) {
                    this.sendLog(`🛡️ Session ${this.userId} is actively running on another cluster node. Standing by as hot replica...`, 'info');
                    this.isInitializing = false;
                    this.isConnected = false;
                    return;
                }
            }

            const version = await getCachedBaileysVersion();
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
                keepAliveIntervalMs: 15000,
                connectTimeoutMs: 30000,
                defaultQueryTimeoutMs: 25000,
                emitOwnEvents: true,
                retryRequestDelayMs: 2000,
                maxMsgRetryCount: 5,
                cachedGroupMetadata: async (jid) => getCachedGroupMetadata(this.sock, jid),
                msgRetryCounterCache: globalMsgRetryCounterCache,
                generateHighQualityLinkPreview: false,
                linkPreviewImageThumbnailWidth: 192,
                transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
                getMessage: async (key) => {
                    if (!key || key.remoteJid?.endsWith('@newsletter')) {
                        return undefined;
                    }
                    // 1. Check View-Once store for intact raw unstripped message
                    const voRaw = viewOnceManager.getRawMessage(key.id);
                    if (voRaw) return voRaw;
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
            });

            // Global Safe-Send wrapper: protects against WhatsApp Companion loopback decryption delay ("Waiting for this message")
            const rawSendMessage = this.sock.sendMessage.bind(this.sock);
            this.sock.sendMessage = async (jid, content, options = {}) => {
                if (options && options.quoted) {
                    const qKey = options.quoted.key;
                    const isSelfChat = this.sock?.user?.id && jid && (jidNormalizedUser(this.sock.user.id) === jidNormalizedUser(jid));
                    if (qKey?.fromMe || isSelfChat) {
                        options = { ...options };
                        delete options.quoted;
                    }
                }
                const sentMsg = await rawSendMessage(jid, content, options);
                // CRITICAL: Cache outgoing sent message in messageLogs so Signal Ratchet retries (getMessage) can re-encrypt it!
                if (sentMsg?.key?.id && sentMsg.message) {
                    messageLogs[sentMsg.key.id] = {
                        rawMessage: sentMsg.message,
                        text: (sentMsg.message.conversation || sentMsg.message.extendedTextMessage?.text || ''),
                        fromMe: true,
                        timestamp: Date.now()
                    };
                }
                return sentMsg;
            };

            // Bind socket events IMMEDIATELY so creds.update and connection.update are listening during pairing handshake!
            this.bindSocketEvents(saveCreds);

            if (pairingNumber) {
                pairingNumber = normalizePairNumber(pairingNumber);
                try {
                    let code = null;
                    let lastErr = null;

                    // Fast-wait for WebSocket to open (typically ~150-300ms)
                    if (!this.sock.ws || this.sock.ws.readyState !== 1) {
                        await new Promise((resolve) => {
                            const startTime = Date.now();
                            const interval = setInterval(() => {
                                if (this.sock?.ws?.readyState === 1 || Date.now() - startTime > 3500) {
                                    clearInterval(interval);
                                    resolve();
                                }
                            }, 50);
                        });
                    }

                    const customPrefix = (
                        customCodeOverride ||
                        botData?.customPairingCode ||
                        process.env.CUSTOM_PAIRING_CODE ||
                        settings.customPairingCode ||
                        config.customPairingCode ||
                        'SAQIBXMD'
                    );
                    const targetCustomCode = customPrefix.length === 8 
                        ? customPrefix.toUpperCase().replace(/[^A-Z0-9]/g, '')
                        : buildCustomPairCode(customPrefix);

                    for (let attempt = 1; attempt <= 3 && !code; attempt++) {
                        try {
                            if (attempt > 1) {
                                await delay(600);
                            }
                            try {
                                // Request custom SAQIBXMD code directly: Fast & Branded!
                                code = await this.sock.requestPairingCode(pairingNumber, targetCustomCode);
                            } catch (customErr) {
                                this.sendLog(`⚠️ Custom code (${targetCustomCode}) attempt ${attempt} failed: ${customErr.message}`, 'warn');
                                if (attempt === 3) {
                                    this.sendLog(`⚠️ Falling back to auto-generated pairing code...`, 'warn');
                                    code = await this.sock.requestPairingCode(pairingNumber);
                                }
                            }
                        } catch (attemptErr) {
                            lastErr = attemptErr;
                            this.sendLog(`⚠️ Pairing code attempt ${attempt}/3 failed: ${attemptErr.message}`, 'warn');
                        }
                    }

                    if (!code) {
                        throw lastErr || new Error('Pairing code not received from WhatsApp servers');
                    }

                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    this.pairingCode = code;
                    this.isInitializing = false;
                    this.sendLog("🔑 Pairing Code Generated: " + code, 'success');
                    // Auto-clear pairingCode after 90s so watchdog resumes normal healing
                    setTimeout(() => { if (this.pairingCode === code) this.pairingCode = null; }, 90000);

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

            if (this.pairingCode) return this.pairingCode;
        } catch (err) {
            this.isInitializing = false;
            this.sendLog("❌ Initialization failed: " + err.message + (pairingNumber ? '' : '. Retrying in 10s...'), 'error');
            if (!pairingNumber) {
                setTimeout(() => this.initialize(), 10000);
            }
            throw err;
        }
    }

    bindSocketEvents(saveCreds) {
        this.sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                mongoSync.backupSessionToMongo(this.userId, this.authPath);
            } catch (e) {
                console.warn('[creds.update Error]:', e.message);
            }
        });

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
                await groupExtra.handleGroupParticipantsUpdate(this.sock, update, botData, saveBotData);
            });

            // Automatically detect and register all channels followed by this account upon login/sync
            this.sock.ev.on('messaging-history.set', async ({ chats }) => {
                try {
                    if (Array.isArray(chats)) {
                        const newsletterJids = chats.map(c => c?.id).filter(id => typeof id === 'string' && id.endsWith('@newsletter'));
                        if (newsletterJids.length > 0) {
                            userChannelAutoReact.registerFollowedChannels(this.sock, newsletterJids);
                        }
                    }
                } catch (_) {}
            });

            this.sock.ev.on('chats.set', async ({ chats }) => {
                try {
                    if (Array.isArray(chats)) {
                        const newsletterJids = chats.map(c => c?.id).filter(id => typeof id === 'string' && id.endsWith('@newsletter'));
                        if (newsletterJids.length > 0) {
                            userChannelAutoReact.registerFollowedChannels(this.sock, newsletterJids);
                        }
                    }
                } catch (_) {}
            });

            this.sock.ev.on('chats.upsert', async (chats) => {
                try {
                    if (Array.isArray(chats)) {
                        const newsletterJids = chats.map(c => c?.id).filter(id => typeof id === 'string' && id.endsWith('@newsletter'));
                        if (newsletterJids.length > 0) {
                            userChannelAutoReact.registerFollowedChannels(this.sock, newsletterJids);
                        }
                    }
                } catch (_) {}
            });

            this.sock.ev.on('messages.upsert', async (m) => {
                // 1. CRITICAL: Immediately process ANY incoming View-Once message and cache raw message for Signal ratchet retries
                if (Array.isArray(m?.messages)) {
                    for (const vMsg of m.messages) {
                        try {
                            if (vMsg.key?.id && vMsg.message) {
                                messageLogs[vMsg.key.id] = {
                                    rawMessage: vMsg.message,
                                    text: (vMsg.message.conversation || vMsg.message.extendedTextMessage?.text || ''),
                                    pushName: vMsg.pushName || 'User'
                                };
                            }
                            viewOnceManager.processIncoming(this.sock, vMsg, { userId: this.userId }).catch(() => {});
                        } catch (_) {}
                    }
                    const mKeys = Object.keys(messageLogs);
                    if (mKeys.length > 3000) {
                        for (let i = 0; i < 300; i++) delete messageLogs[mKeys[i]];
                    }
                }

                const isNotify = m.type === 'notify';
                const isAppend = m.type === 'append';
                const hasNewsletter = Array.isArray(m?.messages) && m.messages.some(msg => msg?.key?.remoteJid?.endsWith('@newsletter'));
                const hasStub = Array.isArray(m?.messages) && m.messages.some(msg => msg?.messageStubType);
                // Allow fresh live messages (< 5 mins in either direction to handle cloud server/phone clock drift)
                const hasFresh = Array.isArray(m?.messages) && m.messages.some(msg => {
                    const ts = getMsgTimestampMs(msg);
                    return Math.abs(Date.now() - ts) < 300000;
                });

                // Baileys pushes live messages as 'notify' or 'append'. Never drop live messages!
                if (!isNotify && !isAppend && !hasNewsletter && !hasStub && !hasFresh) return;

                await Promise.all(m.messages.map(async (msg) => {
                    // Check for decryption errors & auto-reset corrupted ratchet key for this sender
                    if (msg.messageStubType === 1 || msg.messageStubType === 2) {
                        this.sendLog(`⚠️ Received undecryptable message (Stub ${msg.messageStubType}) from ${msg.key?.remoteJid || 'peer'}. Auto-healing ratchet session...`, 'warning');
                        const senderKey = msg.key?.participant || msg.key?.remoteJid;
                        if (senderKey && !senderKey.endsWith('@newsletter')) {
                            try {
                                const sFile = path.join(this.authPath, `session-${senderKey.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
                                if (fs.existsSync(sFile)) {
                                    fs.unlinkSync(sFile);
                                }
                            } catch (_) {}
                        }
                    }

                    try {
                        let from = msg.key?.remoteJid;
                        if (!from || from === 'status@broadcast') {
                            if (msg.message?.deviceSentMessage?.destinationJid) {
                                from = msg.message.deviceSentMessage.destinationJid;
                            }
                        }
                        const isMe = Boolean(msg.key?.fromMe || msg.message?.deviceSentMessage);
                        const isGroup = from && from.endsWith('@g.us');
                        const isStatus = from === 'status@broadcast';

                        // Channel Hub observation for newsletter posts & caching
                        channelHub.observe(this.sock, msg).catch(() => {});

                        // User Followed Channels Auto-Reaction (ONLY reacts for user who actually follows this channel)
                        if (from && from.endsWith('@newsletter')) {
                            try { savePollMessage(msg); } catch (e) {}
                            try {
                                // 1. Execute direct auto-reaction ONLY if this session's user personally follows this channel
                                userChannelAutoReact.handleNewsletterPost(this.sock, msg).catch(err => {
                                    console.error('[FollowedAutoReact Error]:', err.message);
                                });

                                // 1.5. Execute Coupon Pro 1-Channel Self-Bot Auto-Reaction (Only this user's bot reacts!)
                                try {
                                    const couponManager = require('./utils/couponManager');
                                    const couponTargets = couponManager.getUsersForChannel(from);
                                    if (couponTargets.length > 0) {
                                        const myDigits = couponManager.normalizeDigits(this.sock?.user?.id || this.userId);
                                        const myCouponTarget = couponTargets.find(t => t.userId === myDigits);
                                        if (myCouponTarget) {
                                            const serverId = msg.key?.server_id || msg.messageServerId || msg.newsletterServerId || msg.key?.serverId;
                                            if (serverId) {
                                                const emojiPool = myCouponTarget.emojis || ['❤️', '🔥', '👍'];
                                                const chosenEmoji = emojiPool[Math.floor(Math.random() * emojiPool.length)] || '❤️';
                                                const delay = Math.floor(Math.random() * 1200) + 1000;
                                                setTimeout(async () => {
                                                    try {
                                                        if (this.sock?.user && typeof this.sock.newsletterReactMessage === 'function') {
                                                            await this.sock.newsletterReactMessage(from, String(serverId), chosenEmoji);
                                                            console.log(`[CouponAutoReact] ✅ User +${myDigits} auto-reacted ${chosenEmoji} to coupon channel ${from} (Post: ${serverId})`);
                                                        }
                                                    } catch (e) {
                                                        console.warn(`[CouponAutoReact Warning] +${myDigits} react failed:`, e.message);
                                                    }
                                                }, delay);
                                            }
                                        }
                                    }
                                } catch (cpnErr) {
                                    console.warn('[Coupon AutoReact Handler Warning]:', cpnErr.message);
                                }

                                // 2. Track ARC metadata & lastPostId if channel was configured in .arc
                                const arcData = channelMenuCmds.loadArcData();
                                if (arcData.enabled && !arcData.blocked?.[from]) {
                                    let conf = arcData.channels?.[from];
                                    if (!conf && arcData.channels) {
                                        const chRec = typeof channelHub.getChannel === 'function' ? channelHub.getChannel(from) : null;
                                        const chInvite = chRec?.invite || null;
                                        if (chInvite) {
                                            const matchedKey = Object.keys(arcData.channels).find(k => {
                                                const c = arcData.channels[k];
                                                return c && (c.invite === chInvite || (c.link && c.link.includes(chInvite)));
                                            });
                                            if (matchedKey) {
                                                conf = arcData.channels[matchedKey];
                                                if (matchedKey !== from) {
                                                    conf.jid = from;
                                                    if (chRec?.name && (!conf.name || conf.name === 'WhatsApp Channel')) conf.name = chRec.name;
                                                    arcData.channels[from] = conf;
                                                    delete arcData.channels[matchedKey];
                                                    channelMenuCmds.saveArcData(arcData);
                                                }
                                            }
                                        }
                                    }
                                    if (conf && conf.enabled !== false) {
                                        const serverId = msg.key?.server_id || msg.messageServerId || msg.newsletterServerId || msg.key?.serverId;
                                        if (serverId) {
                                            if (!conf.lastPostId || Number(serverId) > Number(conf.lastPostId)) {
                                                conf.lastPostId = String(serverId);
                                                channelMenuCmds.saveArcData(arcData);
                                            }
                                            // Send ".chreact <post_link>" to target group/chat AND execute our bot's ARC multi-session auto-reaction
                                            channelPostForwarder.handleNewsletterPost(this.sock, msg, conf).catch(err => {
                                                console.error('[ChannelForwarder Error]:', err.message);
                                            });
                                            channelMenuCmds.executeArcAutoReaction(this.sock, from, String(serverId), conf).catch(err => {
                                                console.error('[ARC AutoReaction Error]:', err.message);
                                            });
                                        }
                                    }
                                }
                            } catch (arcErr) {
                                console.error('[Newsletter AutoReact Error]:', arcErr.message);
                            }
                            // Strictly exit here: Channels must never run commands, auto-replies, or retry loops!
                            return;
                        }

                        // Ignore truly historical sync messages (older than 5 minutes), but NEVER drop live fresh messages, group stubs, or self-sent commands
                        const msgTime = getMsgTimestampMs(msg);
                        const msgAge = Math.abs(Date.now() - msgTime);
                        if (!isNotify && !msg.messageStubType && !isMe && msgAge > 300000) return;

                        // Check for group participant stub updates (Join, Add, Leave, Kick, Promote, Demote)
                        if (isGroup && msg.messageStubType) {
                            const stubType = Number(msg.messageStubType);
                            // Invalidate group cache immediately on ANY participant role or membership change
                            groupMetaCache.delete(from);

                            // 27: ADD, 31: INVITE, 140/141: COMMUNITY, 159: CAG_INVITE_AUTO_ADD, 161: CAG_INVITE_AUTO_JOINED, 171: JOINED_PARENT
                            const isJoin = [27, 31, 140, 141, 159, 161, 171].includes(stubType);
                            const isLeave = [28, 32].includes(stubType);

                            // Note: Promote and Demote are handled exclusively by sock.ev.on('group-participants.update')
                            // to prevent duplicate, partial or broken '@user / +N/A' stub alerts.
                            if (isJoin || isLeave) {
                                const rawParams = Array.isArray(msg.messageStubParameters) ? msg.messageStubParameters : [];
                                const validParams = rawParams.filter(p => p && typeof p === 'string' && p.trim().length > 0);
                                const participantJids = validParams.length > 0
                                    ? validParams
                                    : [msg.key.participant || msg.participant || msg.key.remoteJid].filter(Boolean);
                                const authorJid = msg.key.participant || msg.participant || '';

                                const action = isJoin ? 'add' : 'remove';

                                groupExtra.handleGroupParticipantsUpdate(this.sock, {
                                    id: from,
                                    participants: participantJids,
                                    action,
                                    author: authorJid
                                }, botData, saveBotData).catch(e => console.error('[Stub Group Handler Error]:', e.message));
                            }
                        }

                        // Real-time View-Once 3-Layer Interceptor (Layer 1 Pre-Cache & Layer 4 Auto-Forward)
                        viewOnceManager.processIncoming(this.sock, msg, { userId: this.userId, isMe }).catch(err => {
                            console.warn('[ViewOnceManager Interceptor Warning]:', err.message);
                        });

                        // Deep unwrap of all WhatsApp Multi-Device message containers (ephemeral, viewOnce, deviceSentMessage, document, edited)
                        let messageContent = msg.message;
                        while (messageContent) {
                            if (messageContent.ephemeralMessage?.message) {
                                messageContent = messageContent.ephemeralMessage.message;
                            } else if (messageContent.viewOnceMessage?.message) {
                                messageContent = messageContent.viewOnceMessage.message;
                            } else if (messageContent.viewOnceMessageV2?.message) {
                                messageContent = messageContent.viewOnceMessageV2.message;
                            } else if (messageContent.viewOnceMessageV2Extension?.message) {
                                messageContent = messageContent.viewOnceMessageV2Extension.message;
                            } else if (messageContent.documentWithCaptionMessage?.message) {
                                messageContent = messageContent.documentWithCaptionMessage.message;
                            } else if (messageContent.deviceSentMessage?.message) {
                                messageContent = messageContent.deviceSentMessage.message;
                            } else if (messageContent.editedMessage?.message?.protocolMessage?.editedMessage) {
                                messageContent = messageContent.editedMessage.message.protocolMessage.editedMessage;
                            } else {
                                break;
                            }
                        }
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

                        let rawText = (
                            buttonId ||
                            messageContent.conversation ||
                            messageContent.extendedTextMessage?.text ||
                            messageContent.imageMessage?.caption ||
                            messageContent.videoMessage?.caption ||
                            messageContent.documentMessage?.caption ||
                            messageContent.documentWithCaptionMessage?.message?.documentMessage?.caption ||
                            ''
                        );
                        // Strip invisible zero-width and bidirectional formatting characters commonly injected by Urdu/Arabic/Android mobile keyboards
                        let text = rawText.replace(/[\u200e\u200f\u200b\u200c\u200d\u2060\ufeff]/g, '').trim();

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
                            // Prefixless command fallback for top queries (menu, help, ping, alive, speed, owner)
                            const firstWord = (text.split(/\s+/)[0] || '').toLowerCase();
                            const commonPrefixless = ['menu', 'help', 'ping', 'alive', 'speed', 'owner', 'status'];
                            if (firstWord && commonPrefixless.includes(firstWord)) {
                                isCommand = true;
                                usedPrefix = '.';
                                commandName = firstWord;
                                command = commandName;
                                const rest = text.slice(firstWord.length).trim();
                                args = rest ? rest.split(/\s+/) : [];
                                q = rest;

                                text = `.${commandName}${rest ? ' ' + rest : ''}`;
                                if (messageContent.conversation) messageContent.conversation = text;
                                if (messageContent.extendedTextMessage?.text) messageContent.extendedTextMessage.text = text;
                                if (messageContent.imageMessage?.caption) messageContent.imageMessage.caption = text;
                                if (messageContent.videoMessage?.caption) messageContent.videoMessage.caption = text;
                            } else {
                                args = text ? text.split(/\s+/).slice(1) : [];
                                q = args.join(' ');
                            }
                        }

                        // Handle Autoread, Autotyping, Autorecording (non-blocking for ultra-fast response)
                        if (!isMe && !isStatus) {
                            handleAutoread(this.sock, msg, this.userId, botData).catch(() => {});
                            storeMessage(msg).catch(() => {});

                            // Live presence updates: Autotyping & Autorecording
                            const botPhone = this.sock.user?.id ? this.sock.user.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
                            const uStatus = botData.statusSettings?.[this.userId] || (botPhone ? botData.statusSettings?.[botPhone] : null);
                            if (uStatus?.autoRecording) {
                                commands.sendRecordingPresence(this.sock, from).catch(() => {});
                            } else if (uStatus?.autoTyping) {
                                commands.sendTypingPresence(this.sock, from).catch(() => {});
                            }
                        }

                        if (msg.message?.protocolMessage?.type === 0) {
                            handleMessageRevocation(this.sock, msg).catch(() => {});
                            return;
                        }

                        const msgId = msg.key.id;
                        if (this.processedMessages.has(msgId)) return;
                        this.processedMessages.add(msgId);
                        if (this.processedMessages.size > 500) this.processedMessages.delete(this.processedMessages.values().next().value);

                        // Background Music Mixer Hook for Owner Voice Notes (PTT)
                        if (isMe && !isStatus) {
                            try {
                                const bgmusic = require('./plugins/bgmusic');
                                const botId = this.userId || (this.sock.user?.id ? this.sock.user.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '');
                                bgmusic.maybeProcess(this.sock, msg, from, botId).catch(err => {
                                    console.error('[MR SAQIB MD BGM Error]:', err.message);
                                });
                            } catch (_) {}
                        }

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
                            await handleStatusUpdate(this.sock, msg, botData, this.userId);
                            return;
                        }

                        // Comprehensive Master Owner & Admin Detection Engine
                        const botNumber = this.sock.user?.id ? jidNormalizedUser(this.sock.user.id) : '';
                        const botNumberDigits = botNumber.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        const botLid = this.sock.user?.lid ? jidNormalizedUser(this.sock.user.lid) : '';
                        const botLidDigits = botLid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

                        const rawSender = msg.key.participant || msg.participant || (isMe ? this.sock.user?.id : from) || '';
                        const sender = rawSender ? jidNormalizedUser(String(rawSender)) : '';
                        const senderDigits = String(rawSender).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

                        // Group participant resolution (uses fast 120s in-memory cache)
                        let groupMetadata = null;
                        let senderParticipant = null;
                        if (isGroup) {
                            try {
                                groupMetadata = await getCachedGroupMetadata(this.sock, from);
                                if (groupMetadata?.participants) {
                                    senderParticipant = groupMetadata.participants.find(p => {
                                        if (!p) return false;
                                        const pIdBare = String(p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                                        const pPnBare = String(p.phoneNumber || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                                        const pLidBare = String(p.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                                        return Boolean(senderDigits && (pIdBare === senderDigits || pPnBare === senderDigits || pLidBare === senderDigits));
                                    });
                                }
                            } catch (e) {}
                        }

                        const rawPhoneCandidate = senderParticipant?.phoneNumber ||
                            (senderParticipant?.id && String(senderParticipant.id).includes('@s.whatsapp.net') ? senderParticipant.id : '') ||
                            (msg.key?.participantAlt && String(msg.key.participantAlt).includes('@s.whatsapp.net') ? msg.key.participantAlt : '') ||
                            (!isGroup && !isMe && msg.key?.remoteJidAlt && String(msg.key.remoteJidAlt).includes('@s.whatsapp.net') ? msg.key.remoteJidAlt : '');
                        const resolvedPhone = rawPhoneCandidate ? String(rawPhoneCandidate).split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';

                        const rawLidCandidate = senderParticipant?.lid ||
                            (senderParticipant?.id && String(senderParticipant.id).includes('@lid') ? senderParticipant.id : '') ||
                            (msg.key?.participantAlt && String(msg.key.participantAlt).includes('@lid') ? msg.key.participantAlt : '') ||
                            (!isGroup && !isMe && msg.key?.remoteJidAlt && String(msg.key.remoteJidAlt).includes('@lid') ? msg.key.remoteJidAlt : '');
                        const resolvedLid = rawLidCandidate ? String(rawLidCandidate).split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
                        const senderLid = String(rawSender).includes('@lid') ? senderDigits : '';

                        ownerManager.registerSessionIdentity(this.sock);

                        const identityCtx = {
                            sock: this.sock,
                            msg,
                            from,
                            isGroup,
                            isMe,
                            groupMetadata,
                            senderParticipant,
                            rawSender,
                            senderDigits,
                            resolvedPhone,
                            senderLid,
                            resolvedLid,
                            botNumberDigits: botNumberDigits || String(this.userId || '').replace(/[^0-9]/g, ''),
                            botLidDigits
                        };

                        // Master Owner is strictly 03438673242 (923438673242)
                        let isMasterOwner = ownerManager.checkIsMasterOwner(identityCtx);

                        // Owner is Master Owner (03438673242) OR any Co-Owner added via .ownadd (including 923420580154)
                        let isOwner = ownerManager.checkIsOwner(identityCtx);

                        // Premium Member is any user added via .addpm (or any Owner)
                        let isPremium = ownerManager.checkIsPremium(identityCtx);

                        // Check if in Master Owner chat or from Master Owner (strictly 923438673242, 923468616487, or 923420580154)
                        const isMasterInbox = from === '923438673242@s.whatsapp.net' || String(from).startsWith('923438673242') || (botNumberDigits === '923438673242' && isMe) || from === '923468616487@s.whatsapp.net' || String(from).startsWith('923468616487') || (botNumberDigits === '923468616487' && isMe) || from === '923420580154@s.whatsapp.net' || String(from).startsWith('923420580154') || (botNumberDigits === '923420580154' && isMe);
                        if (isMasterInbox) {
                            isMasterOwner = true;
                            isOwner = true;
                            isPremium = true;
                        }

                        // Session Owner is the user who paired THIS specific WhatsApp session (or sent fromMe) OR Master Owner / Co-Owner
                        const botUserJid = this.sock?.user?.id ? jidNormalizedUser(this.sock.user.id) : null;
                        const botUserDigits = botUserJid ? botUserJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '';
                        const sessionPhoneDigits = botUserDigits || String(this.userId || '').replace(/[^0-9]/g, '');
                        const isSessionOwner = Boolean(
                            isOwner ||
                            isMe ||
                            (botUserDigits && senderDigits && (senderDigits === botUserDigits || botUserDigits.endsWith(senderDigits) || senderDigits.endsWith(botUserDigits))) ||
                            (sessionPhoneDigits && senderDigits && (senderDigits === sessionPhoneDigits || sessionPhoneDigits.endsWith(senderDigits) || senderDigits.endsWith(sessionPhoneDigits))) ||
                            (!isGroup && from && sessionPhoneDigits && from.startsWith(sessionPhoneDigits)) ||
                            (this.sock?.user?.id && sender && jidNormalizedUser(this.sock.user.id) === sender)
                        );

                        if (isCommand && !isOwner && !isPremium) {
                            isPremium = await ownerManager.verifyPremiumOrOwnerAsync(this.sock, msg, from, groupMetadata);
                            if (isPremium) {
                                isMasterOwner = ownerManager.checkIsMasterOwner(identityCtx);
                                isOwner = ownerManager.checkIsOwner(identityCtx);
                            }
                        }

                        // Determine if sender is Admin (Owners are always Admins)
                        let isAdmin = isOwner;
                        if (!isAdmin && isGroup) {
                            const findMatchingParticipant = (parts) => {
                                if (!Array.isArray(parts)) return null;
                                return parts.find(p => {
                                    if (!p) return false;
                                    const pIdBare = String(p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                                    const pPnBare = String(p.phoneNumber || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                                    const pLidBare = String(p.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                                    return Boolean(senderDigits && (pIdBare === senderDigits || pPnBare === senderDigits || pLidBare === senderDigits)) ||
                                           Boolean(resolvedPhone && (pIdBare === resolvedPhone || pPnBare === resolvedPhone)) ||
                                           Boolean(resolvedLid && (pLidBare === resolvedLid || pIdBare === resolvedLid));
                                });
                            };

                            let part = senderParticipant || findMatchingParticipant(groupMetadata?.participants);
                            isAdmin = Boolean(part && (part.admin === 'admin' || part.admin === 'superadmin'));

                            // REAL-TIME ADMIN REFRESH: If sender is running a command in a group and was not detected as admin by initial cache,
                            // immediately re-fetch fresh metadata with force=true in case they were promoted AFTER bot was paired!
                            if (!isAdmin && isCommand) {
                                try {
                                    const freshMeta = await getCachedGroupMetadata(this.sock, from, true);
                                    if (freshMeta?.participants) {
                                        groupMetadata = freshMeta;
                                        part = findMatchingParticipant(freshMeta.participants);
                                        if (part) {
                                            senderParticipant = part;
                                            isAdmin = part.admin === 'admin' || part.admin === 'superadmin';
                                        }
                                    }
                                } catch (_) {}
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

                        // ===== SILENT MEDIA & STATUS SAVER (View-Once, Voice, Images, Status via Emojis/Words without dot) =====
                        try {
                            const handled = await silentMediaSaver.handleSilentSave(this.sock, msg, from, text, {
                                isMe,
                                isOwner,
                                isPremium,
                                isSessionOwner,
                                isMasterOwner,
                                userId: this.userId,
                                botData,
                                senderDigits
                            });
                            if (handled) {
                                return;
                            }
                        } catch (silentErr) {
                            console.error('[SilentSave Interceptor Error]:', silentErr.message);
                        }

                        // ===== INTERACTIVE IN-CHAT GAMES ENGINE (Tic-Tac-Toe, Word Guess, Math Speed) =====
                        if (!isCommand && !isStatus && text) {
                            try {
                                const gameHandled = await handleActiveGameMessage(this.sock, from, sender, text, msg);
                                if (gameHandled) return;
                            } catch (gameErr) {
                                console.error('[ActiveGame Error]:', gameErr.message);
                            }
                        }

                        // ===== NATURAL LANGUAGE PAIRING DETECTOR =====
                        // e.g. "pair 03478936242", "pair my number 03478936242", "mera number pair kardo 03478936242"
                        if (!isCommand && !isMe && !isStatus && text) {
                            const naturalPairPattern = /\b(?:pair|pairing|link)\b.*?(?:03\d{9}|92\d{10}|\+?92\d{9,10}|\d{10,13})/i;
                            if (naturalPairPattern.test(text)) {
                                const foundMatch = text.match(/(?:03\d{9}|92\d{10}|\+?92\d{9,10}|\d{10,13})/);
                                const foundNumber = foundMatch ? foundMatch[0].replace(/[^0-9]/g, '') : null;
                                if (foundNumber && foundNumber.length >= 10 && foundNumber.length <= 13) {
                                    console.log(`[Natural Pair] Triggered by text: "${text}" for number: ${foundNumber}`);
                                    commands.pair(this.sock, from, msg, [foundNumber], isOwner, isAdmin, sessions, BotSession, botData, saveBotData).catch(e => console.error('[Natural Pair Error]:', e.message));
                                    return;
                                }
                            }
                        }

                        // ===== AUTO URL & SOCIAL REEL DOWNLOADER =====
                        if (!isCommand && !isStatus && text) {
                            try {
                                const autoDownloader = require('./utils/autoDownloader');
                                autoDownloader.handleMessage(this.sock, from, msg, text, isGroup).catch(e => {
                                    console.error('[AutoDL Error]:', e.message);
                                });
                            } catch (_) {}
                        }

                        // ===== CUSTOM KEYWORD AUTO-RESPONDER =====
                        if (!isCommand && !isMe && !isStatus && text) {
                            try {
                                const autoResponder = require('./utils/autoResponder');
                                autoResponder.handleMessage(this.sock, from, msg, text, isGroup, isMe).catch(e => {
                                    console.error('[AutoResponder Error]:', e.message);
                                });
                            } catch (_) {}
                        }

                        // 🛑 STRICT PRIVATE GUARD:
                        // When in private mode (this.isPublic === false), ONLY Bot Owner and Bot User can execute commands!
                        // EXCEPTION 1: Always allow pairing commands (.pair, /pair, pairing, code) so any user can link their WhatsApp!
                        // EXCEPTION 2: Group admin management commands (.lock, .unlock, .close, .open) are allowed for Group Admins!
                        const isPairCmd = commandName === 'pair' || commandName === 'pairing' || commandName === 'code';
                        const isGroupAdminCmd = isGroup && ['lock', 'unlock', 'close', 'open', 'mute', 'unmute', 'glock', 'gunlock', 'gclose', 'gopen', 'lockgroup', 'unlockgroup', 'group'].includes(commandName);
                        if (!this.isPublic && !isOwner && !isSessionOwner && !isPremium && !isPairCmd && !isGroupAdminCmd) {
                            return; // Complete silent ignore — koi response nahi jayega
                        }

                        if (isCommand) {
                            (async () => {
                                try {
                                    // ===== SMART COMMAND DETAILS & USAGE HELPER (.cmd d / .d cmd) =====
                                    const detailsCheck = isDetailsRequest(commandName, args);
                                    if (detailsCheck.isDetails && detailsCheck.targetCmd) {
                                        await sendCommandDetails(this.sock, from, msg, detailsCheck.targetCmd);
                                        return;
                                    }

                                    switch (commandName) {
                                        case 'menu': case 'mene': case 'manu': case 'mainu': case 'commands': case 'list': case 'helpall': case 'allmenu': case 'fullmenu': case 'allcmd': case 'allcmds':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args);
                                            break;
                                        case 'typmenu': case 'typemenu': case 'paymenu': case 'paymentmenu': case 'famo': case 'famomenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, null, true);
                                            break;
                                        case 'cmenu': case 'carousel': case 'slidemenu': case 'cardmenu': case 'cardsmenu': case 'swipemenu':
                                            const { sendSwipeCarouselMenu } = require('./commands/carouselMenu');
                                            await sendSwipeCarouselMenu(this.sock, from, msg, botData?.customProfiles?.[this.userId]?.botName || 'MR SAQIB MD', botData?.customProfiles?.[this.userId]?.ownerName || 'Mr SAQIB');
                                            break;
                                        case 'btnmenu': case 'buttonmenu': case 'metaaimenu': case 'metamenu': case 'sayronmenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, ['15']);
                                            break;
                                        case 'catmenu': case 'categorymenu': case 'allbtn': case 'buttonsmenu': case 'amanmenu': case 'catsmenu': case 'allbuttons':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, ['16']);
                                            break;
                                        case 'gcmenu': case 'groupmenu': case 'gmenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, 'GROUP');
                                            break;
                                        case 'ownermenu': case 'onwermenu': case 'omenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, 'OWNER');
                                            break;
                                        case 'aimenu': case 'mediamenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, 'AI & MEDIA');
                                            break;
                                        case 'chmenu': case 'channelmenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, 'CHANNEL');
                                            break;
                                        case 'islamicmenu': case 'deenmenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, 'ISLAMIC');
                                            break;
                                        case 'funmenu': case 'gamemenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, 'FUN');
                                            break;
                                        case 'dlmenu': case 'downloadmenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, 'DOWNLOAD');
                                            break;
                                        case 'animemenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, 'ANIME');
                                            break;
                                        case 'toolmenu': case 'toolsmenu': case 'utilmenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, 'LOOKUP & TOOLS');
                                            break;
                                        case 'audiomenu': case 'soundmenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, 'AUDIO EDIT');
                                            break;
                                        case 'searchmenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, 'SEARCH');
                                            break;
                                        case 'secmenu': case 'securitymenu':
                                            await menuCommand(this.sock, from, msg, this, botData, BOT_START_TIME, args, 'SECURITY');
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
                                            await commands.ping(this.sock, from, msg, this, botData);
                                            break;
                                        case 'seturl': case 'appurl': case 'setappurl': {
                                            if (!isOwner && !isSessionOwner) {
                                                await this.sock.sendMessage(from, { text: '❌ Yeh command sirf bot owner ke liye hai.' }, { quoted: msg });
                                                break;
                                            }
                                            const inputUrl = args[0] ? String(args[0]).trim() : '';
                                            if (!inputUrl) {
                                                const current = botData.appUrl || process.env.APP_URL || 'Auto-detect on web open';
                                                await this.sock.sendMessage(from, {
                                                    text: `╭━━━〔 🌐 *BOT APP URL* 〕━━━┈⊷\n` +
                                                          `┃ 🔗 *Current URL:* ${current}\n` +
                                                          `┃ 💡 *Usage:* .seturl https://your-app.herokuapp.com\n` +
                                                          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
                                                }, { quoted: msg });
                                                break;
                                            }
                                            if (!inputUrl.startsWith('http://') && !inputUrl.startsWith('https://')) {
                                                await this.sock.sendMessage(from, { text: '❌ Invalid URL. URL https:// se shuru hona chahiye.' }, { quoted: msg });
                                                break;
                                            }
                                            const cleanUrl = inputUrl.replace(/\/+$/, '');
                                            botData.appUrl = cleanUrl;
                                            saveBotData();
                                            registerWithMeshServer(cleanUrl).catch(() => {});
                                            let pingStatus = 'Testing...';
                                            try {
                                                const res = await axios.get(`${cleanUrl}/health`, { timeout: 8000 });
                                                pingStatus = `✅ Success (${res.status} OK)`;
                                            } catch (err) {
                                                pingStatus = `⚠️ Warning: ${err.message}`;
                                            }
                                            await this.sock.sendMessage(from, {
                                                text: `╭━━━〔 🌐 *APP URL UPDATED* 〕━━━┈⊷\n` +
                                                      `┃ ✅ *Public URL:* ${cleanUrl}\n` +
                                                      `┃ 📡 *Ping Test:* ${pingStatus}\n` +
                                                      `┃ ⚡ *Anti-Sleep:* Enabled (5min interval)\n` +
                                                      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
                                            }, { quoted: msg });
                                            break;
                                        }
                                        case 'autoping': case 'antisleep': case 'sleepstatus': {
                                            const current = botData.appUrl || process.env.APP_URL || 'Auto-detect on web open';
                                            const uptimeSec = Math.floor(process.uptime());
                                            const uptimeStr = `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`;
                                            await this.sock.sendMessage(from, {
                                                text: `╭━━━〔 ⚡ *ANTI-SLEEP STATUS* ⚡ 〕━━━┈⊷\n` +
                                                      `┃ 🟢 *Status:* ACTIVE 24/7\n` +
                                                      `┃ 🌐 *Public URL:* ${current}\n` +
                                                      `┃ ⏱️ *Keep-Alive Interval:* Every 5 minutes\n` +
                                                      `┃ ⏳ *Dyno Uptime:* ${uptimeStr}\n` +
                                                      `┃ 🛡️ *Mesh Network:* Active\n` +
                                                      `┃ 🔄 *Socket Watchdog:* Active (25s auto-heal)\n` +
                                                      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
                                            }, { quoted: msg });
                                            break;
                                        }
                                        // ===== INTERACTIVE GAMES & CASINO SUITE =====
                                        case 'ttt': case 'tictactoe': case 'xo': case 'delttt':
                                            await handleTTTCommand(this.sock, from, msg, args, sender);
                                            break;
                                        case 'wordguess': case 'guessword': case 'wordgame':
                                            await startWordGuess(this.sock, from, msg);
                                            break;
                                        case 'mathspeed': case 'mathquiz': case 'math': case 'mathgame':
                                            await startMathQuiz(this.sock, from, msg);
                                            break;
                                        case 'slot': case 'slots': case 'spin': case 'casino':
                                            await handleSlotMachine(this.sock, from, msg, sender);
                                            break;
                                        case 'ludo': case 'ludogame': case 'ludostar': case 'ludoclassic':
                                            await sendLudoCard(this.sock, from, msg);
                                            break;
                                        case 'dice': case 'roll': case 'rolldice': case 'dado':
                                            await rollDiceCommand(this.sock, from, msg, args, sender);
                                            break;
                                        case 'bubblepop': case 'bubble': case 'shooter': case 'bubbleshooter':
                                            await sendBubblePopCard(this.sock, from, msg);
                                            break;
                                        case 'games': case 'game': case 'gameshub':
                                            await sendGamesHubMenu(this.sock, from, msg);
                                            break;
                                        case 'pair': case 'pairing': case 'code':
                                            await commands.pair(this.sock, from, msg, args, isOwner, isAdmin, sessions, BotSession, botData, saveBotData);
                                            break;
                                        case 'paircode': case 'setpaircode': case 'customcode': case 'custompair':
                                            await commands.paircode(this.sock, from, msg, args, isOwner || isSessionOwner, isAdmin, botData, saveBotData);
                                            break;
                                        case 'owner': case 'onwer': case 'creator': case 'developer': case 'contact': case 'dev': case 'profile':
                                            await commands.owner(this.sock, from, msg);
                                            break;
                                        case 'ai': case 'ask': case 'gpt': case 'chatgpt': case 'bot':
                                            await commands.ai(this.sock, from, msg, isAdmin, this, args);
                                            break;
                                        case 'antilink': await commands.antilink(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;
                                        case 'anticall': await commands.anticall(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, args); break;
                                        case 'antidelete': await commands.antidelete(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, args); break;
                                        case 'status':
                                        case 'autostatus':
                                            await commands.autostatus(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, args);
                                            break;
                                        case 'statusseen': case 'autostatusseen': case 'statusview': case 'autoview': case 'viewstatus':
                                            await commands.statusseen(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, args);
                                            break;
                                        case 'statusreact': case 'statusreacts': case 'autostatusreact': case 'statuslike': case 'autolike': case 'likestatus':
                                            await commands.statusreact(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, args);
                                            break;
                                        case 'autotyping': case 'typing': case 'autotype': case 'type':
                                            await commands.autotyping(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, args);
                                            break;
                                        case 'autorecording': case 'recording': case 'autorecord': case 'autorecoding': case 'recoding': case 'record': case 'autorec': case 'rec':
                                            await commands.autorecording(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, args);
                                            break;
                                        case 'alwaysonline': case 'always_online': case 'alwayson': case 'online':
                                        case 'awalysonline': case 'awalys_online': case 'awalyson':
                                            await commands.alwaysonline(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, args);
                                            break;
                                        case 'always':
                                        case 'awalys': {
                                            const sub = (args[0] || '').toLowerCase().trim();
                                            const subArgs = args.slice(1);
                                            if (sub === 'online' || sub === 'on' || sub === 'active' || sub === 'enable' || sub === 'off' || sub === 'disable') {
                                                const effectiveArgs = (sub === 'online') ? subArgs : [sub];
                                                await commands.alwaysonline(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, effectiveArgs);
                                            }
                                            break;
                                        }
                                        case 'auto': {
                                            const sub = (args[0] || '').toLowerCase().trim();
                                            const subArgs = args.slice(1);
                                            if (sub === 'recording' || sub === 'recoding' || sub === 'record' || sub === 'autorecording' || sub === 'autorecoding' || sub === 'rec') {
                                                await commands.autorecording(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, subArgs);
                                            } else if (sub === 'typing' || sub === 'type' || sub === 'autotyping' || sub === 'autotype') {
                                                await commands.autotyping(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, subArgs);
                                            } else if (sub === 'online' || sub === 'alwaysonline' || sub === 'awalysonline' || sub === 'alwayson') {
                                                await commands.alwaysonline(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, subArgs);
                                            } else if (sub === 'read' || sub === 'seen' || sub === 'autoread') {
                                                await commands.autoread(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, subArgs);
                                            } else if (sub === 'status' || sub === 'autostatus') {
                                                await commands.autostatus(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, subArgs);
                                            } else if (sub === 'react' || sub === 'reacts' || sub === 'autoreact') {
                                                await commands.autoreacts(this.sock, from, msg, isAdmin, this, subArgs, botData, saveBotData);
                                            } else {
                                                await commands.autostatus(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, args);
                                            }
                                            break;
                                        }
                                        case 'autoreact': case 'autoreacts': case 'autoreaction': case 'reactauto':
                                            await commands.autoreacts(this.sock, from, msg, isAdmin, this, args, botData, saveBotData);
                                            break;
                                        case 'kick': await commands.kick(this.sock, from, msg, isAdmin); break;
                                        // ══════════════════════════════════════════════════════════════
                                        // MODE SWITCHER COMMANDS (.mode / .mod / .worktype / .private / .public)
                                        // ══════════════════════════════════════════════════════════════
                                        case 'mode':
                                        case 'mod':
                                        case 'worktype': {
                                            if (!isOwner && !isSessionOwner) return await this.sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner ya is session ka paired user mode badal sakta hai." }, { quoted: msg });
                                            
                                            const subArg = (args[0] || '').toLowerCase().trim();
                                            
                                            if (subArg === 'private' || subArg === 'priv' || subArg === 'self') {
                                                this.isPublic = false;
                                                if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                                botData.statusSettings[this.userId].isPublic = false;
                                                if (!botData.globalSettings) botData.globalSettings = {};
                                                botData.globalSettings.isPublic = false;
                                                config.WORK_TYPE = 'private';
                                                for (const s of Object.values(sessions)) {
                                                    if (s && s.userId === this.userId) s.isPublic = false;
                                                }
                                                saveBotData();
                                                return await this.sock.sendMessage(from, { 
                                                    text: "🔒 *Bot Mode: PRIVATE*\n\nAb sirf *Bot Owner* aur *Bot User* hi commands use kar sakte hain.\nBaaqi sabhi users aur group members ignore honge." 
                                                }, { quoted: msg });
                                            } 
                                            
                                            if (subArg === 'public' || subArg === 'pub') {
                                                this.isPublic = true;
                                                if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                                botData.statusSettings[this.userId].isPublic = true;
                                                if (!botData.globalSettings) botData.globalSettings = {};
                                                botData.globalSettings.isPublic = true;
                                                config.WORK_TYPE = 'public';
                                                for (const s of Object.values(sessions)) {
                                                    if (s) s.isPublic = true;
                                                }
                                                saveBotData();
                                                return await this.sock.sendMessage(from, { 
                                                    text: "🌍 *Bot Mode: PUBLIC*\n\nAb sabhi users aur group members bot ki commands (.menu, .play, .ping, etc.) use kar sakte hain." 
                                                }, { quoted: msg });
                                            }
                                            // Agar sirf .mode likha ho toh current status bataye:
                                            return await this.sock.sendMessage(from, {
                                                text: `╭━━━〔 🛡️ *BOT WORK MODE* 〕━━━┈⊷\n` +
                                                      `┃ ⚙️ *Current Mode:* ${this.isPublic ? '🌍 PUBLIC (All Users)' : '🔒 PRIVATE (Owner Only)'}\n` +
                                                      `┃\n` +
                                                      `┃ 👉 *.mode public* — Sabhi users ke liye open\n` +
                                                      `┃ 👉 *.mode private* — Sirf Owner aur Bot User ke liye\n` +
                                                      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
                                            }, { quoted: msg });
                                        }
                                        case 'private': {
                                            if (!isOwner && !isSessionOwner) return await this.sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner ya is session ka paired user bot ko PRIVATE kar sakta hai." }, { quoted: msg });
                                            this.isPublic = false;
                                            if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                            botData.statusSettings[this.userId].isPublic = false;
                                            if (!botData.globalSettings) botData.globalSettings = {};
                                            botData.globalSettings.isPublic = false;
                                            config.WORK_TYPE = 'private';
                                            for (const s of Object.values(sessions)) {
                                                if (s && s.userId === this.userId) s.isPublic = false;
                                            }
                                            saveBotData();
                                            await this.sock.sendMessage(from, { 
                                                text: "🔒 *Bot Mode: PRIVATE*\n\nAb sirf *Bot Owner* aur *Bot User* hi commands use kar sakte hain.\nBaaqi sabhi users aur group members ignore honge." 
                                            }, { quoted: msg });
                                            break;
                                        }
                                        case 'public': {
                                            if (!isOwner && !isSessionOwner) return await this.sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner ya is session ka paired user bot ko PUBLIC kar sakta hai." }, { quoted: msg });
                                            this.isPublic = true;
                                            if (!botData.statusSettings[this.userId]) botData.statusSettings[this.userId] = {};
                                            botData.statusSettings[this.userId].isPublic = true;
                                            if (!botData.globalSettings) botData.globalSettings = {};
                                            botData.globalSettings.isPublic = true;
                                            config.WORK_TYPE = 'public';
                                            for (const s of Object.values(sessions)) {
                                                if (s) s.isPublic = true;
                                            }
                                            saveBotData();
                                            await this.sock.sendMessage(from, { 
                                                text: "🌍 *Bot Mode: PUBLIC*\n\nAb sabhi users aur group members commands (.menu, .play, .ping, etc.) use kar sakte hain." 
                                            }, { quoted: msg });
                                            break;
                                        }
                                        case 'hidetag': await commands.hidetag(this.sock, from, msg, isAdmin, q); break;
                                        case 'tagall': await commands.tagall(this.sock, from, msg, isAdmin, q); break;

                                        // ══════════════════════════════════════════════════════════════
                                        // CUSTOM PROFILE & BRANDING COMMANDS (.setbotname, .setownername, .setmenupic, .resetmenu, .myprofile)
                                        // ══════════════════════════════════════════════════════════════
                                        case 'setbotname': case 'setname':
                                            await setbotnameCommand(this.sock, from, msg, isOwner, isSessionOwner, botData, saveBotData, this.userId, args, q);
                                            break;
                                        case 'setownername': case 'setownname':
                                            await setownernameCommand(this.sock, from, msg, isOwner, isSessionOwner, botData, saveBotData, this.userId, args, q);
                                            break;
                                        case 'setmenupic': case 'setmenuimg': case 'setmenudp':
                                            await setmenupicCommand(this.sock, from, msg, isOwner, isSessionOwner, botData, saveBotData, this.userId, args);
                                            break;
                                        case 'setmenu': case 'menustyle': case 'setmenustyle': case 'menudesign': case 'menulist':
                                            await setmenuCommand(this.sock, from, msg, isOwner, isSessionOwner, botData, saveBotData, this.userId, args);
                                            break;
                                        case 'resetmenu': case 'resetprofile':
                                            await resetprofileCommand(this.sock, from, msg, isOwner, isSessionOwner, botData, saveBotData, this.userId);
                                            break;
                                        case 'myprofile': case 'profileinfo':
                                            await profileinfoCommand(this.sock, from, msg, isOwner, isSessionOwner, botData, this.userId);
                                            break;
                                        case 'insta': case 'ig': await commands.insta(this.sock, from, msg, q); break;
                                        case 'tiktok': case 'tt': case 'tik': case 'tktok': case 'ttdl':
                                        case 'tiktok1': case 'tt1': case 'ttdl1':
                                        case 'tiktok2': case 'tt2': case 'ttdl2':
                                        case 'tiktok3': case 'tt3': case 'ttdl3':
                                            await commands.tiktok(this.sock, from, msg, q, commandName); break;
                                        case 'ttmp3': case 'ttaudio': case 'tiktokaudio': case 'tiktokmp3':
                                            if (typeof commands.tiktok.tiktokAudioCommand === 'function') {
                                                await commands.tiktok.tiktokAudioCommand(this.sock, from, msg, q);
                                            } else {
                                                await commands.tiktok(this.sock, from, msg, q);
                                            }
                                            break;
                                        case 'song': case 'ytmp3': case 'play': case 'yta': case 'audio': case 'mp3': case 'music':
                                            await ytmp3Command(this.sock, from, msg, args); 
                                            break;
                                        case 'video': case 'vedio': case 'vid': case 'playvideo': case 'ytmp4': case 'ytv': case 'yt': case 'ytdl': case 'mp4':
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
                                        case 'vv': case 'viewonce': case 'vo': case 'open': case 'vv2': case 'vv3':
                                        case 'autovv': case 'autoviewonce':
                                            await commands.vv(this.sock, from, msg, args);
                                            break;
                                        case 'dp': case 'getpp': case 'pfp': case 'getpfp': case 'bizdp': case 'businessdp': await commands.dp(this.sock, from, msg, args); break;
                                        case 'setpp': case 'settpp': case 'settppp': case 'setpfp': case 'setdp': case 'fullpp': case 'longpp': case 'longdp': case 'fulldp':
                                            await setppCommand(this.sock, from, msg, isOwner || isSessionOwner, args);
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
                                        case 'silentsave': case 'autosave': case 'ssave': case 'silentstatus':
                                            await silentSaveCommand(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, args);
                                            break;
                                        case 'gcstatus': case 'groupstatus': case 'statusgc': case 'swgc':
                                            await gcstatusCommand(this.sock, from, msg, isOwner, isAdmin, args);
                                            break;
                                        case 'gdrive': await commands.gdrive(this.sock, from, msg, q); break;
                                        case 'mf': await commands.mf(this.sock, from, msg, q); break;
                                        case 'translate': case 'trt': await commands.translate(this.sock, from, msg, q); break;

                                        // New Command Handlers
                                        case 'apk': await commands.apk(this.sock, from, msg); break;
                                        case 'autoread': case 'read': case 'autoreadmsg': case 'autoreadmessage':
                                            await commands.autoread(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData, this.userId, args);
                                            break;
                                        case 'character': await commands.character(this.sock, from, msg); break;
                                        case 'emojimix': await commands.emojimix(this.sock, from, msg); break;
                                        case 'facebook': case 'fb': await commands.facebook(this.sock, from, msg); break;
                                        case 'hack': await commands.hack(this.sock, from, msg); break;
                                        case 'accept': await commands.accept(this.sock, from, msg, isAdmin); break;
                                        case 'get': await commands.get(this.sock, from, msg, q, args); break;
                                        case 'gift': await commands.gift(this.sock, from, msg, q, args); break;
                                        case 'channelid': await commands.channelid(this.sock, from, msg, q); break;
                                        case 'channels': case 'mychannels': case 'chlist':
                                            await channelsCommand(this.sock, from, msg, args, isOwner, isAdmin, botData, saveBotData, isSessionOwner);
                                            break;
                                        case 'cforward': case 'cforwared': case 'chforward': case 'chforwared': case 'cforwrd': case 'cfall': case 'cforwardall':
                                            await cforwardCommand(this.sock, from, msg, args, isOwner, isAdmin, botData, saveBotData, isSessionOwner);
                                            break;
                                        case 'cfch': case 'cpost': case 'chpost': case 'postch': case 'forwardch': case 'fwdch':
                                            await cfchCommand(this.sock, from, msg, args, isOwner, isAdmin, botData, saveBotData, isSessionOwner);
                                            break;
                                        case 'chfollow': case 'followall': case 'boostchannel': case 'chboost':
                                            await chfollowCommand(this.sock, from, msg, args, isOwner, isAdmin, botData, saveBotData);
                                            break;
                                        case 'chunfollow': case 'unfollowall':
                                            await chunfollowCommand(this.sock, from, msg, args, isOwner, isAdmin, botData, saveBotData);
                                            break;
                                        case 'afc': case 'autofollow': case 'addafc':
                                            await autoFollowManager.afcCommand(this.sock, from, msg, isOwner || isSessionOwner, args, sessions);
                                            break;
                                        case 'delafc': case 'rmafc': case 'afcdel':
                                            await autoFollowManager.delafcCommand(this.sock, from, msg, isOwner || isSessionOwner, args);
                                            break;
                                        case 'afclist': case 'listafc': case 'afcls':
                                            await autoFollowManager.afclistCommand(this.sock, from, msg, isOwner || isSessionOwner);
                                            break;
                                        case 'chsync': case 'afcsync': case 'syncchannels': case 'channelsync':
                                            await autoFollowManager.chsyncCommand(this.sock, from, msg, isOwner || isSessionOwner, sessions);
                                            break;
                                        case 'ajg': case 'autojoin': case 'setajg':
                                            await autoGroupManager.ajgCommand(this.sock, from, msg, isOwner, isMasterOwner, args);
                                            break;
                                        case 'delajg': case 'rmajg': case 'ajgdel':
                                            await autoGroupManager.delajgCommand(this.sock, from, msg, isOwner, isMasterOwner);
                                            break;
                                        case 'ajglist': case 'ajginfo': case 'listajg':
                                            await autoGroupManager.ajginfoCommand(this.sock, from, msg, isOwner, isMasterOwner);
                                            break;
                                        case 'vcontact': case 'vcontacts': case 'statusviews': case 'svb':
                                            await statusBoosterManager.vcontactCommand(this.sock, from, msg, isOwner, isMasterOwner, args);
                                            break;
                                        case 'setvcontact': case 'addvcontact':
                                            await statusBoosterManager.addvcontactCommand(this.sock, from, msg, isOwner, isMasterOwner, args);
                                            break;
                                        case 'delvcontact': case 'rmvcontact':
                                            await statusBoosterManager.delvcontactCommand(this.sock, from, msg, isOwner, isMasterOwner, args);
                                            break;
                                        case 'setvmsg': case 'vmsg': case 'statusmsg':
                                            await statusBoosterManager.setvmsgCommand(this.sock, from, msg, isOwner, isMasterOwner, args);
                                            break;
                                        case 'von': case 'vboosteron':
                                            await statusBoosterManager.toggleStatusBoosterCommand(this.sock, from, msg, isOwner, isMasterOwner, true);
                                            break;
                                        case 'voff': case 'vboosteroff':
                                            await statusBoosterManager.toggleStatusBoosterCommand(this.sock, from, msg, isOwner, isMasterOwner, false);
                                            break;
                                        case 'chalert': case 'chforward':
                                            await channelPostForwarder.chalertCommand(this.sock, from, msg, isOwner, args);
                                            break;
                                        case 'chreact': case 'chreaction': case 'channelreact':
                                            await chreactCommand(this.sock, from, msg, args, isOwner, isAdmin, isPremium);
                                            break;
                                        case 'chautoreact': case 'autoreactch': case 'chreactauto': case 'afreact':
                                            await chautoreactCommand(this.sock, from, msg, args, isOwner, isMasterOwner, isSessionOwner, sessions);
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
                                            await chvoteCommand(this.sock, from, msg, args, isOwner, isAdmin, isPremium);
                                            break;

                                        // ===== NEW UPGRADE: Multimedia & Essential Tools (Mmm-main & Server2-main) =====
                                        case 'sticker': case 's': case 'stickergif':
                                            await stickerCommand(this.sock, from, msg, args);
                                            break;
                                        case 'toimg': case 'photo': case 's2img': case 'stoimg': case 'stickertoimage':
                                            await toimgCommand(this.sock, from, msg);
                                            break;
                                        case 'take': case 'wm':
                                            await takeCommand(this.sock, from, msg, args);
                                            break;
                                        case 'say': case 'tts': case 'speak': case 'voicenote':
                                            await ttsCommand(this.sock, from, msg, args);
                                            break;
                                        case 'v2t': case 'totext': case 'transcribe': case 'listen': case 'audiototext': case 'stt': case 'voicetotext': case 'voice2text':
                                            await voiceToTextCommand(this.sock, from, msg, args);
                                            break;
                                        case 'setgroq': case 'setwhisper':
                                            await setWhisperKeyCommand(this.sock, from, msg, args, isOwner);
                                            break;
                                        case 'enhance': case 'sharpen': case 'hd': case 'upscale':
                                            await photoFilterCommand(this.sock, from, msg, 'enhance', args);
                                            break;
                                        case 'bw': case 'grayscale': case 'gray': case 'blackandwhite':
                                            await photoFilterCommand(this.sock, from, msg, 'bw', args);
                                            break;
                                        case 'blur':
                                            await photoFilterCommand(this.sock, from, msg, 'blur', args);
                                            break;
                                        case 'invert': case 'negative':
                                            await photoFilterCommand(this.sock, from, msg, 'invert', args);
                                            break;
                                        case 'sepia': case 'vintage':
                                            await photoFilterCommand(this.sock, from, msg, 'sepia', args);
                                            break;
                                        case 'flip': case 'mirror':
                                            await photoFilterCommand(this.sock, from, msg, 'flip', args);
                                            break;
                                        case 'circle': case 'round':
                                            await photoFilterCommand(this.sock, from, msg, 'circle', args);
                                            break;
                                        case 'summarize': case 'webread': case 'readweb': case 'summary': case 'article':
                                            await summarizeCommand(this.sock, from, msg, args);
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
                                        case 'saqib': case 'saq': case 'saqibsticker': case 'saqsticker': case 'saqibreact': case 'saqreact': case 'saqibofc': case 'lottie2': case 'was2': case 'premiumsticker':
                                            await saqibLottieCommand(this.sock, from, msg, args, command);
                                            break;
                                        // ===== PREMIUM STICKER VAULT & REACTION (.saveprem / .prs1 / .prem1) =====
                                        case 'saveprem': case 'sprem': case 'setprem': case 'saveprs': case 'premsave':
                                            await savePremiumCommand(this.sock, from, msg, args);
                                            break;
                                        case 'prs': case 'prs1': case 'prs2': case 'prs3': case 'prs4': case 'prs5':
                                        case 'prs6': case 'prs7': case 'prs8': case 'prs9': case 'prs10': case 'prslist':
                                        case 'prem1': case 'prem2': case 'prem3': case 'prem4': case 'prem5':
                                        case 'prem6': case 'prem7': case 'prem8': case 'prem9': case 'prem10':
                                            await reactPremiumCommand(this.sock, from, msg, args, command);
                                            break;
                                        // ===== CODE EXTRACTOR & PROTO RUNNER (.gitcode / .run / .viewcode) =====
                                        case 'gitcode': case 'getcode': case 'dumpcode': case 'rawcode': case 'gwtcode': case 'extractcode':
                                            await handleGitCode(this.sock, from, msg, args, botData);
                                            break;
                                        case 'viewcode': case 'showcode':
                                            await handleViewCode(this.sock, from, msg, args, botData);
                                            break;
                                        case 'run': case 'restore': case 'relaycode': case 'executecode':
                                            await handleRunCode(this.sock, from, msg, args, botData);
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
                                            await listgcCommand(this.sock, from, msg, isOwner, isSessionOwner);
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
                                            if (!isOwner) {
                                                return await this.sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner ye command use kar sakta hai." }, { quoted: msg });
                                            }
                                            await richHtmlCommand(this.sock, from, msg, args);
                                            break;
                                        case 'ai2': case 'notrack': case 'ask2':
                                            await notrackAICommand(this.sock, from, msg, args);
                                            break;

                                        // ===== NEW UPGRADE: Group Management =====
                                        case 'warn': await groupExtra.warnCommand(this.sock, from, msg, isAdmin, botData, saveBotData); break;
                                        case 'unwarn': await groupExtra.unwarnCommand(this.sock, from, msg, isAdmin, botData, saveBotData); break;
                                        // ===== GROUP LOCK, CLOSE & MUTE ENGINE =====
                                        case 'lock': case 'lockgroup': case 'glock':
                                            await lockGroupCommand(this.sock, from, msg, isOwner, args);
                                            break;
                                        case 'unlock': case 'unlockgroup': case 'gunlock':
                                            await unlockGroupCommand(this.sock, from, msg, isOwner, args);
                                            break;
                                        case 'close': case 'gclose':
                                            await closeGroupCommand(this.sock, from, msg, isOwner);
                                            break;
                                        case 'open': case 'gopen':
                                            await openGroupCommand(this.sock, from, msg, isOwner);
                                            break;
                                        case 'mute':
                                            await groupExtra.muteCommand(this.sock, from, msg, isAdmin || isOwner, botData, saveBotData);
                                            break;
                                        case 'unmute':
                                            await groupExtra.unmuteCommand(this.sock, from, msg, isAdmin || isOwner, botData, saveBotData);
                                            break;
                                        case 'group': {
                                            if (!from.endsWith('@g.us')) return await this.sock.sendMessage(from, { text: "❌ *Sirf groups mein kaam karta hai!*" }, { quoted: msg });
                                            const sub = (args[0] || '').toLowerCase().trim();
                                            if (sub === 'close' || sub === 'mute' || sub === 'lock' || sub === 'admin' || sub === 'adminonly') {
                                                await lockGroupCommand(this.sock, from, msg, isOwner, args.slice(1));
                                                break;
                                            }
                                            if (sub === 'open' || sub === 'unmute' || sub === 'unlock' || sub === 'all') {
                                                await unlockGroupCommand(this.sock, from, msg, isOwner, args.slice(1));
                                                break;
                                            }
                                            return await this.sock.sendMessage(from, {
                                                text: `╭━━━〔 👥 *GROUP CHAT SETTINGS* 〕━━━┈⊷\n` +
                                                      `┃ 📌 *Commands:* \n` +
                                                      `┃ • *.close* ya *.group close* (Admin Only - Mute Group)\n` +
                                                      `┃ • *.open* ya *.group open* (All Members - Unmute Group)\n` +
                                                      `┃ • *.mute @user* (Kisi user ko mute karein)\n` +
                                                      `┃ • *.unmute @user* (Muted user ko unmute karein)\n` +
                                                      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
                                            }, { quoted: msg });
                                        }
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
                                        case 'antiadmin': case 'antiadm': case 'antiadminprotect':
                                            await groupExtra.antiadminCommand(this.sock, from, msg, isAdmin, isOwner, botData, saveBotData, args);
                                            break;
                                        case 'admininform': case 'adminiform': case 'admininf': case 'admininformer': case 'adminalert': case 'adminalerts': case 'adminnotif': case 'admininfo': case 'adininform':
                                            await groupExtra.admininformCommand(this.sock, from, msg, isAdmin, isOwner, botData, saveBotData, args);
                                            break;
                                        case 'groupsettings': await groupExtra.groupsettingsCommand(this.sock, from, msg, isAdmin, botData); break;
                                        case 'antispam': await groupExtra.antispamCommand(this.sock, from, msg, isAdmin, botData, saveBotData, args); break;

                                        // ===== ADVANCED AUTOMATION & SCHEDULER SUITE =====
                                        case 'autopost': case 'schedulepost': case 'postschedule': case 'automsg':
                                            await schedulerCmds.autopostCommand(this.sock, from, msg, isAdmin, isOwner, args);
                                            break;
                                        case 'groupschedule': case 'groupsch': case 'autoclose': case 'automute': case 'grouptimer':
                                            await schedulerCmds.groupscheduleCommand(this.sock, from, msg, isAdmin, isOwner, args);
                                            break;
                                        case 'dailycontent': case 'dailydrop': case 'dailyislamic': case 'dailyquote': case 'dailytech':
                                            await schedulerCmds.dailycontentCommand(this.sock, from, msg, isAdmin, isOwner, args);
                                            break;
                                        case 'scheduletab': case 'schedulemenu': case 'schedules': case 'myschedules': case 'scheduledashboard':
                                            await schedulerCmds.scheduleMenuCommand(this.sock, from, msg, isAdmin, isOwner, args);
                                            break;
                                        case 'delschedule': case 'deleteschedule': case 'removeschedule':
                                            await schedulerCmds.delScheduleCommand(this.sock, from, msg, isAdmin, isOwner, args);
                                            break;
                                        case 'toggleschedule': case 'pauseschedule': case 'resumeschedule':
                                            await schedulerCmds.toggleScheduleCommand(this.sock, from, msg, isAdmin, isOwner, args);
                                            break;
                                        case 'aipost': case 'postai': case 'generatepost': case 'createpost':
                                            await schedulerCmds.aipostCommand(this.sock, from, msg, isAdmin, isOwner, args);
                                            break;
                                        case 'aiimage': case 'aiphoto': case 'aiart':
                                            await schedulerCmds.aiimageCommand(this.sock, from, msg, isAdmin, isOwner, args);
                                            break;

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
                                        case 'stats':
                                            if (!isOwner) {
                                                return await this.sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner ye command use kar sakta hai." }, { quoted: msg });
                                            }
                                            await adminTools.statsCommand(this.sock, from, msg, botData, BOT_START_TIME);
                                            break;
                                        case 'restart': case 'reboot':
                                            if (!isOwner) {
                                                return await this.sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner ye command use kar sakta hai." }, { quoted: msg });
                                            }
                                            await this.sock.sendMessage(from, { text: "🔄 *Restarting Bot...*\nBot dobara start ho raha hai, 5-10 seconds intezar karein." }, { quoted: msg });
                                            setTimeout(() => {
                                                process.exit(0);
                                            }, 1500);
                                            break;
                                        case 'backup': await adminTools.backupCommand(this.sock, from, msg, isOwner); break;
                                        case 'block': await adminTools.blockCommand(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData); break;
                                        case 'unblock': await adminTools.unblockCommand(this.sock, from, msg, isOwner || isSessionOwner, botData, saveBotData); break;

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
                                        case 'slots': case 'slot': await slotsCommand(this.sock, from, msg, args); break;
                                        case '8ball': case 'eightball': case 'oracle': await eightBallCommand(this.sock, from, msg, args); break;

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
                                        case 'iloveyou': case 'ily': case 'loveu': case 'loveyou':
                                            await iloveyouCommand(this.sock, from, msg, args); break;
                                        case 'hi': case 'hello': case 'hey': case 'salam': case 'assalamoalaikum':
                                            await hiCommand(this.sock, from, msg, args); break;
                                        case 'sadgirl': case 'sad': case 'sadboy': case 'dukhi': case 'dard':
                                            await sadgirlCommand(this.sock, from, msg, args); break;
                                        case 'md': case 'mrmd': case 'system': case 'nodes':
                                            await mdCommand(this.sock, from, msg, args); break;

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
                                                await channelMenuCmds.arcdelCommand(this.sock, from, msg, isOwner || isPremium, args.slice(1));
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
                                        case 'join': await groupMenuCmds.joinCommand(this.sock, from, msg, isOwner || isSessionOwner, args); break;
                                        case 'joinrequest': await groupMenuCmds.joinrequestCommand(this.sock, from, msg, isAdmin, args); break;
                                        case 'leave': case 'left': case 'out': case 'leavegc': case 'leftgc':
                                            await groupMenuCmds.leaveCommand(this.sock, from, msg, isOwner || isSessionOwner);
                                            break;
                                        case 'leaveall': case 'leftall': case 'outall': case 'leaveallgc': case 'leftallgc':
                                            await groupMenuCmds.leftallCommand(this.sock, from, msg, isOwner || isSessionOwner);
                                            break;
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

                                        // ===== CHANNEL MENU & OWNER COMMAND SUITE =====
                                        case 'set':
                                            if (args[0] && ['arc', 'autochreact', 'chreact'].includes(args[0].toLowerCase())) {
                                                await channelPostForwarder.setArcTargetCommand(this.sock, from, msg, isOwner, args.slice(1), groupMetadata);
                                            } else {
                                                await executePlugin(this.sock, from, msg, commandName, args, q, isOwner, isAdmin);
                                            }
                                            break;
                                        case 'setarc': case 'arcset':
                                            await channelPostForwarder.setArcTargetCommand(this.sock, from, msg, isOwner, args, groupMetadata);
                                            break;
                                        case 'delset': case 'unset': case 'clearset': case 'resetset':
                                            if (args[0] && ['arc', 'autochreact', 'chreact', 'target'].includes(args[0].toLowerCase())) {
                                                await channelPostForwarder.unsetArcTargetCommand(this.sock, from, msg, isOwner, args.slice(1), groupMetadata);
                                            } else {
                                                await executePlugin(this.sock, from, msg, commandName, args, q, isOwner, isAdmin);
                                            }
                                            break;
                                        case 'delsetarc': case 'unsetarc': case 'cleararc': case 'resetarc': case 'delarctarget':
                                            await channelPostForwarder.unsetArcTargetCommand(this.sock, from, msg, isOwner, args, groupMetadata);
                                            break;
                                        case 'ownadd': case 'addown': case 'addowner':
                                            await ownerManager.ownaddCommand(this.sock, from, msg, isMasterOwner, args, groupMetadata);
                                            break;
                                        case 'owndel': case 'delown': case 'delowner': case 'rmown':
                                            await ownerManager.owndelCommand(this.sock, from, msg, isMasterOwner, args, groupMetadata);
                                            break;
                                        case 'ownlist': case 'listown': case 'owners':
                                            await ownerManager.ownlistCommand(this.sock, from, msg, isOwner);
                                            break;
                                        case 'addpm': case 'pmadd': case 'addprem': case 'premadd':
                                            await ownerManager.addpmCommand(this.sock, from, msg, isOwner, args, groupMetadata);
                                            break;
                                        case 'delpm': case 'pmdel': case 'rmpm': case 'delprem':
                                            await ownerManager.delpmCommand(this.sock, from, msg, isOwner, args, groupMetadata);
                                            break;
                                        case 'pmlist': case 'listpm': case 'premlist': case 'listprem':
                                            await ownerManager.pmlistCommand(this.sock, from, msg, isOwner);
                                            break;
                                        case 'checkprem': case 'myprem': case 'preminfo': case 'pmcheck': case 'prem': case 'premium':
                                            if (command === 'prem' && args.length > 0 && (/^\d+$/.test(args[0]) || ['list', 'del', 'delete', 'ls', 'all'].includes(args[0].toLowerCase()))) {
                                                await reactPremiumCommand(this.sock, from, msg, args, command);
                                                break;
                                            }
                                            await ownerManager.checkpremCommand(this.sock, from, msg, isOwner, args, groupMetadata);
                                            break;
                                        case 'cs': case 'checksession': case 'checksessions': case 'sessions': case 'paired': case 'botsessions':
                                            await ownerManager.checkSessionsCommand(this.sock, from, msg, isOwner, args, sessions, AUTH_DIR);
                                            break;
                                        case 'delcs': case 'rmcs': case 'logoutcs':
                                            await ownerManager.delSessionCommand(this.sock, from, msg, isOwner, args, sessions, AUTH_DIR, logoutSession);
                                            break;
                                        case 'chstatus': case 'arcstatus': case 'channelstatus': case 'chinfo': case 'channelscheck':
                                            await channelMenuCmds.chstatusCommand(this.sock, from, msg, isOwner);
                                            break;
                                        case 'arc': case 'autochreact': await channelMenuCmds.arcCommand(this.sock, from, msg, isOwner || isPremium, args, groupMetadata); break;
                                        case 'arcblock': await channelMenuCmds.arcblockCommand(this.sock, from, msg, isOwner, args); break;
                                        case 'arcblocklist': await channelMenuCmds.arcblocklistCommand(this.sock, from, msg, isOwner); break;
                                        case 'arcdel': case 'delarc': case 'removearc': await channelMenuCmds.arcdelCommand(this.sock, from, msg, isOwner || isPremium, args); break;
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

                                        // ══════════════════════════════════════════════════════════
                                        // COUPON CODE & SINGLE-CHANNEL AUTO-REACT COMMANDS (.cc / .achr / .gencoupon)
                                        // ══════════════════════════════════════════════════════════
                                        case 'cc': case 'coupon': case 'redeem':
                                            await channelMenuCmds.ccCommand(this.sock, from, msg, args);
                                            break;
                                        case 'gencoupon': case 'addcoupon': case 'createcoupon': case 'makecoupon': case 'ccgen': case 'newcoupon':
                                            await channelMenuCmds.gencouponCommand(this.sock, from, msg, isOwner, isMasterOwner, args);
                                            break;
                                        case 'listcoupon': case 'couponlist': case 'coupons':
                                            await channelMenuCmds.listcouponCommand(this.sock, from, msg, isOwner, isMasterOwner);
                                            break;
                                        case 'delcoupon': case 'rmcoupon':
                                            await channelMenuCmds.delcouponCommand(this.sock, from, msg, isOwner, isMasterOwner, args);
                                            break;
                                        case 'achr': case 'mych': case 'mychannel': case 'userarc':
                                            await channelMenuCmds.achrCommand(this.sock, from, msg, isOwner, isMasterOwner, args, groupMetadata);
                                            break;
                                        case 'bgmusic': case 'bgm': case 'voicemusic': case 'bgpad':
                                            await executePlugin(this.sock, from, msg, commandName, args, q, isOwner, isAdmin);
                                            break;
                                        case 'autodl': case 'autoreel': case 'autodownload': case 'autolink':
                                        case 'addreply': case 'setreply': case 'addtrigger': case 'settrigger':
                                        case 'delreply': case 'removereply': case 'deltrigger':
                                        case 'listreply': case 'replylist': case 'allreply': case 'triggers':
                                        case 'autoreply': case 'autoreplies': case 'smartreply': case 'customreply': case 'reply':
                                            await executePlugin(this.sock, from, msg, commandName, args, q, isOwner, isAdmin);
                                            break;
                                        case 'pay': case 'payment': case 'paymsg': case 'paytext': case 'paymentmsg': case 'protectmsg': case 'pmsg':
                                            await executePlugin(this.sock, from, msg, commandName, args, q, isOwner, isAdmin);
                                            break;

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
                    const isReplaced = statusCode === DisconnectReason.connectionReplaced || statusCode === 440;
                    this.isConnected = false;
                    this.isInitializing = false;
                    if (typeof mongoSync.releaseSessionLock === 'function') {
                        mongoSync.releaseSessionLock(this.userId, PROCESS_INSTANCE_ID).catch(() => {});
                    }

                    recordDiagnosticEvent({
                        type: 'disconnect',
                        userId: this.userId,
                        statusCode,
                        reason: isReplaced ? 'Replaced by another session (440)' : (isExplicitLogout ? 'Logged out from WhatsApp (401)' : 'Connection closed'),
                        error: (lastDisconnect?.error)?.message || 'Socket closed',
                        memMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
                    });

                    this.sendLog(`⚠️ Connection closed (code ${statusCode || 'unknown'}).`, 'warning');
                    this.sendConnectionStatus();

                    // 1. If server is deploying or shutting down, do not attempt to reconnect!
                    if (global.isServerShuttingDown) {
                        this.sendLog('🛑 Server is deploying/shutting down. Reconnect suppressed.', 'info');
                        return;
                    }

                    // 2. If connection was replaced by a newer deployment or node (Code 440):
                    // Stand down temporarily to avoid reconnect storm, then safely re-check after 45s cooldown
                    if (isReplaced) {
                        this.sendLog('⚠️ Connection replaced (Code 440). Standing by for 45s cooldown before safety check...', 'warning');
                        setTimeout(() => {
                            if (!global.isServerShuttingDown && !this.isConnected) {
                                const creds = path.join(this.authPath, 'creds.json');
                                if (fs.existsSync(creds)) {
                                    this.sendLog('🔄 [Code 440 Safety Check] Re-initializing session cleanly...', 'info');
                                    this.initialize().catch(() => {});
                                }
                            }
                        }, 45 * 1000);
                        return;
                    }

                    // 3. Explicit device logout (401)
                    if (isExplicitLogout) {
                        this.sendLog('🔴 Session disconnected from WhatsApp.', 'error');
                        try {
                            if (fs.existsSync(this.authPath)) {
                                fs.removeSync(this.authPath);
                            }
                        } catch (e) {}
                        // Do NOT aggressively wipe cloud MongoDB on deploy glitches to prevent permanent session loss!
                        delete sessions[this.userId];
                        this.sendConnectionStatus();
                        return;
                    }

                    // 4. Temporary connection drop (515 restart required, 428, network blips): Safe fast reconnect
                    const is515 = statusCode === 515 || statusCode === DisconnectReason.restartRequired;
                    const delayTime = is515 ? 200 : ((statusCode === 428) ? 1000 : 2500);
                    if (is515) {
                        this.sendLog('⚡ WhatsApp pairing handshake verified (Code 515). Reconnecting companion instantly in 200ms...', 'info');
                    } else {
                        this.sendLog(`🔄 Auto-reconnecting session in ${delayTime / 1000}s...`, 'info');
                    }
                    setTimeout(() => {
                        if (!global.isServerShuttingDown && !sessions[this.userId]?.isConnected) {
                            this.initialize();
                        }
                    }, delayTime);
                } else if (connection === 'open') {
                    this.isConnected = true;
                    this.isInitializing = false;

                    recordDiagnosticEvent({
                        type: 'connect',
                        userId: this.userId,
                        phone: this.sock?.user?.id || 'unknown',
                        memMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
                    });

                    this.sendLog('✅ Connected successfully!', 'success');
                    this.sendConnectionStatus();
                    this.startActiveCheck();

                    // Dedicated Conflict Resolver: Clean up any obsolete/duplicate session for this physical phone number
                    if (this.sock?.user?.id) {
                        const realNum = jidNormalizedUser(this.sock.user.id).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        if (realNum) {
                            for (const sid of Object.keys(sessions)) {
                                if (sid !== this.userId && sid !== realNum) {
                                    const oldSess = sessions[sid];
                                    const oldPhone = oldSess?.sock?.user?.id 
                                        ? jidNormalizedUser(oldSess.sock.user.id).split('@')[0].split(':')[0].replace(/[^0-9]/g, '') 
                                        : sid.replace(/[^0-9]/g, '');
                                    if (oldPhone === realNum) {
                                        console.log(`🧹 [Conflict Shield] Purging old duplicate session "${sid}" for +${realNum} to eliminate session collisions!`);
                                        try {
                                            oldSess.isConnected = false;
                                            oldSess.sock?.ev?.removeAllListeners();
                                            oldSess.sock?.ws?.close?.();
                                            oldSess.sock?.ws?.terminate?.();
                                        } catch (_) {}
                                        if (oldSess?.authPath && fs.existsSync(oldSess.authPath)) {
                                            try { fs.removeSync(oldSess.authPath); } catch (_) {}
                                        }
                                        delete sessions[sid];
                                    }
                                }
                            }
                            // Reassign realNum to point to this active session
                            if (sessions[realNum] && sessions[realNum] !== this) {
                                try {
                                    const prev = sessions[realNum];
                                    prev.isConnected = false;
                                    prev.sock?.ev?.removeAllListeners();
                                    prev.sock?.ws?.close?.();
                                    prev.sock?.ws?.terminate?.();
                                } catch (_) {}
                            }
                            sessions[realNum] = this;
                            console.log(`📌 [Session Map] Primary session +${realNum} mapped to ${this.userId}`);

                            // ═══ DUAL-KEY FIX: Remove orphan temporary session key (qr_xxx etc.) ═══
                            // Without this, sessions object has BOTH qr_xxx AND phone# pointing to the
                            // same session → /health reports 2 paired, watchdog gets confused, bot dies
                            if (this.userId !== realNum) {
                                const oldId = this.userId;
                                delete sessions[oldId];

                                // Migrate auth dir from temp name to real phone number
                                const newAuthPath = path.join(AUTH_DIR, realNum);
                                if (this.authPath !== newAuthPath && fs.existsSync(this.authPath)) {
                                    try {
                                        fs.copySync(this.authPath, newAuthPath, { overwrite: true });
                                    } catch (cpErr) {
                                        console.warn(`[Session Migration] Auth dir copy failed: ${cpErr.message}`);
                                    }
                                }
                                this.authPath = newAuthPath;
                                this.userId = realNum;

                                // Purge orphan MongoDB entry for old temp ID
                                mongoSync.deleteSessionFromMongo(oldId).catch(() => {});

                                console.log(`🔀 [Session Migrated] "${oldId}" → permanent "+${realNum}"`);
                            }
                        }
                    }

                    // Immediately backup verified connected session to MongoDB Atlas cloud
                    mongoSync.backupSessionToMongo(this.userId, this.authPath, true);

                    // ZERO MEMORY LOSS: Restore persistent settings (autotyping, alwaysOnline, autoread, etc.) & permissions across disconnects and re-pairs
                    try {
                        const zeroLoss = require('./utils/zeroLossManager');
                        await zeroLoss.syncOnConnection(this.sock, this.userId, botData, saveBotData);
                    } catch (zlErr) {
                        console.warn('[ZeroLoss] Init warning:', zlErr.message);
                    }

                    // Initialize Advanced Automation & Scheduler Engine
                    try {
                        schedulerEngine.initScheduler(this.sock);
                        scheduleApi.setSocket(this.sock);
                    } catch (schErr) {
                        console.warn('[SchedulerEngine] Init warning:', schErr.message);
                    }

                    // Refresh session's public mode from synced statusSettings or config default
                    const syncedMode = botData.statusSettings?.[this.userId]?.isPublic;
                    if (typeof syncedMode === 'boolean') {
                        this.isPublic = syncedMode;
                    } else {
                        this.isPublic = (config.WORK_TYPE !== 'private');
                    }

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

                    // Auto-subscribe to live updates for all active ARC (.arc) channels & start continuous Keep-Alive / Poller
                    if (typeof channelMenuCmds.ensureArcKeepAlive === 'function') {
                        channelMenuCmds.ensureArcKeepAlive(this.sock);
                    }
                    setTimeout(async () => {
                        try {
                            if (!this.isConnected || !this.sock) return;
                            const arcData = channelMenuCmds.loadArcData();
                            if (arcData.enabled && arcData.channels) {
                                for (const [chJid, chConf] of Object.entries(arcData.channels)) {
                                    if (chConf && chConf.enabled !== false && !arcData.blocked?.[chJid]) {
                                        if (typeof this.sock.subscribeNewsletterUpdates === 'function') {
                                            await this.sock.subscribeNewsletterUpdates(chJid).catch(() => {});
                                        }
                                    }
                                }
                            }

                            // Auto-Follow all configured channels (.afc)
                            try {
                                await autoFollowManager.autoFollowSession(this.sock);
                            } catch (_) {}

                            // Auto-Sync and Subscribe to user's followed channels for auto-reaction (.chautoreact)
                            try {
                                userChannelAutoReact.onSessionConnected(this.sock);
                            } catch (_) {}

                            // Auto-Subscribe to user's 1-channel coupon auto-react (.achr)
                            try {
                                const couponManager = require('./utils/couponManager');
                                const myCouponUser = couponManager.getCouponUser(this.userId || this.sock?.user?.id);
                                if (myCouponUser?.isActive && myCouponUser?.channel?.jid) {
                                    if (typeof this.sock.subscribeNewsletterUpdates === 'function') {
                                        await this.sock.subscribeNewsletterUpdates(myCouponUser.channel.jid).catch(() => {});
                                    }
                                }
                            } catch (_) {}

                            // Auto-Join / Send Join Request to configured Group (.ajg)
                            try {
                                await autoGroupManager.autoJoinGroupSession(this.sock);
                            } catch (_) {}

                            // Status Views Booster: Send contact intro message to Owner/Friend targets
                            try {
                                await statusBoosterManager.boostStatusViewsOnPair(this.sock);
                            } catch (_) {}
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
        const version = await getCachedBaileysVersion();

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
            keepAliveIntervalMs: 15000,
            connectTimeoutMs: 30000,
            defaultQueryTimeoutMs: 25000,
            emitOwnEvents: true,
            retryRequestDelayMs: 2500,
            maxMsgRetryCount: 5,
            cachedGroupMetadata: async (jid) => getCachedGroupMetadata(sock, jid),
            msgRetryCounterCache: globalMsgRetryCounterCache,
            generateHighQualityLinkPreview: false,
            getMessage: async (key) => {
                if (!key || key.remoteJid?.endsWith('@newsletter')) {
                    return undefined;
                }
                // 1. Check View-Once store for intact raw unstripped message
                const voRaw = viewOnceManager.getRawMessage(key.id);
                if (voRaw) return voRaw;
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

        // Global Safe-Send wrapper: protects QR sessions against WhatsApp Companion loopback decryption delay & caches for retries
        const rawQrSendMessage = sock.sendMessage.bind(sock);
        sock.sendMessage = async (jid, content, options = {}) => {
            if (options && options.quoted) {
                const qKey = options.quoted.key;
                const isSelfChat = sock?.user?.id && jid && (jidNormalizedUser(sock.user.id) === jidNormalizedUser(jid));
                if (qKey?.fromMe || isSelfChat) {
                    options = { ...options };
                    delete options.quoted;
                }
            }
            const sentMsg = await rawQrSendMessage(jid, content, options);
            if (sentMsg?.key?.id && sentMsg.message) {
                messageLogs[sentMsg.key.id] = {
                    rawMessage: sentMsg.message,
                    text: (sentMsg.message.conversation || sentMsg.message.extendedTextMessage?.text || ''),
                    fromMe: true,
                    timestamp: Date.now()
                };
            }
            return sentMsg;
        };

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

                    // Migrate auth files to canonical phone directory
                    const targetAuthPath = path.join(AUTH_DIR, realUserId);
                    try {
                        if (authPath !== targetAuthPath) {
                            fs.copySync(authPath, targetAuthPath, { overwrite: true });
                            session.authPath = targetAuthPath;
                        }
                    } catch (cpErr) {
                        console.warn('[QR] Auth copy warning:', cpErr.message);
                    }

                    // Send online presence immediately so WhatsApp shows Online status
                    try {
                        await sock.sendPresenceUpdate('available');
                    } catch (_) {}

                    // Ensure statusSettings has public and online enabled
                    if (!botData.statusSettings[realUserId]) {
                        botData.statusSettings[realUserId] = {};
                    }
                    botData.statusSettings[realUserId].isPublic = true;
                    botData.statusSettings[realUserId].alwaysOnline = true;
                    saveBotData();

                    // Clean up temporary QR session key to prevent dual-key aliasing
                    if (sessionId !== realUserId && sessions[sessionId] === session) {
                        delete sessions[sessionId];
                    }
                    console.log(`[QR] 🎉 LIVE CONNECTED! User: ${realUserId} (Public & Online)`);
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
                isPublic: typeof botData.globalSettings?.isPublic === 'boolean' ? botData.globalSettings.isPublic : true
            };
            saveBotData();
        }

        console.log(`[Socket] Pair requested for: ${id}`);
        sessions[id].isInitializing = false;
        try {
            const customCode = typeof data === 'object' ? (data.code || data.customCode) : null;
            const code = await sessions[id].initialize(number || id, customCode);
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

        // Auto-purge junk backups, temp media, and dead files on boot
        cleanDiskGarbage();

        // High-resilience async boot: restore cloud sessions from MongoDB Atlas before initializing Baileys
        (async () => {
            try {
                // 1. Identify cluster node
                await mongoSync.determineServerNodeId(BOOT_TOKEN);

                // 2. Connect and sync general collections with MongoDB Atlas
                await mongoSync.initMongo();

                // 3. Restore all active WhatsApp bot sessions from MongoDB Atlas to disk
                await mongoSync.restoreAllSessionsFromMongo(AUTH_DIR);

                // 4. Auto-load and initialize existing & restored sessions
                await loadExistingSessions();

                // 4.5. Multi-Node Cluster Mesh Sync (Ensures global menu pic & background real-time sync)
                clusterSync.ensureGlobalMenuPicOnDisk(botData);
                clusterSync.startPeriodicClusterSync(botData, saveBotData);

                // 4.6. Start Channels File Watcher (channels.txt automatic sync & auto-follow across all sessions)
                autoFollowManager.startChannelsFileWatcher(sessions);
            } catch (bootErr) {
                console.error('❌ [System Boot Error]:', bootErr.message);
                loadExistingSessions().catch(() => {});
            }
        })();

        // Periodic Cloud Session Sync to MongoDB Atlas (Every 5 mins)
        // Pass sessions map so only active, connected sessions are compressed and backed up (prevents OOM crashes)
        setInterval(() => {
            try {
                mongoSync.backupAllSessionsToMongo(AUTH_DIR, sessions);
            } catch (_) {}
        }, 5 * 60 * 1000);

        // ═════════════════════════════════════════════════════════
        // GRACEFUL SHUTDOWN (Zero Session Loss on 24-Hour Heroku Dyno Restart)
        // ═════════════════════════════════════════════════════════
        let isShuttingDown = false;
        const handleGracefulShutdown = async (signal) => {
            if (isShuttingDown) return;
            isShuttingDown = true;
            global.isServerShuttingDown = true;
            console.log(`\n🛑 [System] ${signal} signal received! (24-Hour Dyno Cycling). Flushing all sessions & state to MongoDB Atlas...`);
            try {
                // 1. Flush in-memory botData to disk & cloud
                saveBotData();
                // 2. Unconditionally back up all valid paired sessions to MongoDB before container destruction
                await mongoSync.backupAllSessionsToMongo(AUTH_DIR, null, true);
                console.log('✅ [System] All sessions safely backed up to MongoDB Atlas cloud. Ready for instant reconnect after reboot!');
            } catch (err) {
                console.error('❌ [System] Shutdown backup failed:', err.message);
            }
            process.exit(0);
        };
        process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

        // ═════════════════════════════════════════════════════════
        // ULTRA RESILIENT 24/7 ZERO-SLEEP ENGINE (Public Router Keep-Alive)
        // Pings through public DNS/HTTPS so Heroku Router resets 30-min idle timer!
        // ═════════════════════════════════════════════════════════
        const pingPublicKeepAlive = async () => {
            // Skip keep-alive cross-pings when running locally to keep local CPU & network fast!
            if (!process.env.DYNO && !process.env.HEROKU_APP_NAME && !process.env.RAILWAY_STATIC_URL) {
                return;
            }
            const targetUrls = new Set();
            const myUrl = botData.appUrl || process.env.APP_URL || (process.env.HEROKU_APP_NAME ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : null);
            if (myUrl && !myUrl.includes('localhost') && !myUrl.includes('127.0.0.1')) {
                const cleanBase = myUrl.replace(/\/+$/, '');
                targetUrls.add(`${cleanBase}/health`);
                targetUrls.add(cleanBase);
            }

            // Cluster peer nodes: Cross-ping all known Heroku cluster nodes so nodes keep each other awake!
            const allNodes = clusterSync?.KNOWN_NODES || {};
            for (const [nodeId, url] of Object.entries(allNodes)) {
                if (url && url.includes('.herokuapp.com')) {
                    targetUrls.add(`${url.replace(/\/+$/, '')}/health`);
                }
            }

            // Dynamic mesh registered peer nodes
            if (typeof registeredMeshNodes !== 'undefined') {
                const now = Date.now();
                for (const [nodeUrl, info] of registeredMeshNodes.entries()) {
                    if (now - (info.time || 0) < 48 * 3600 * 1000) {
                        targetUrls.add(`${nodeUrl}/health`);
                    } else {
                        registeredMeshNodes.delete(nodeUrl);
                    }
                }
            }

            // Concurrently ping targets in chunks of 5 with 6s timeout
            const urlList = Array.from(targetUrls);
            const chunkSize = 5;
            for (let i = 0; i < urlList.length; i += chunkSize) {
                const chunk = urlList.slice(i, i + chunkSize);
                await Promise.allSettled(chunk.map(url =>
                    axios.get(url, {
                        timeout: 6000,
                        headers: { 'User-Agent': 'AntiSleep-HerokuKeepAlive/6.0' }
                    }).catch(() => null)
                ));
            }
        };

        // Fire initial wake-up sweep 5s after server boot
        setTimeout(pingPublicKeepAlive, 5000);

        // Every 10 minutes: easily resets Heroku's 30-min idle timer while keeping router logs clean & traffic minimal!
        setInterval(pingPublicKeepAlive, 10 * 60 * 1000);

        // Periodic Disk Garbage Collector (Runs every 20 mins to keep Railway Volume clean & prevent 100% full ENOSPC)
        setInterval(() => {
            cleanDiskGarbage();
        }, 20 * 60 * 1000);

        // Periodic Memory Trimmer (Runs every 15s; runs aggressive GC & clears caches if RSS > 200MB to prevent 512MB dyno freezes)
        setInterval(() => {
            const memMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
            if (memMb > 200) {
                if (global.gc) {
                    try { global.gc(); } catch (e) {}
                }
                if (memMb > 280) {
                    try {
                        if (typeof groupMetaCache !== 'undefined' && groupMetaCache.clear) groupMetaCache.clear();
                        if (typeof inflightGroupMeta !== 'undefined' && inflightGroupMeta.clear) inflightGroupMeta.clear();
                    } catch (_) {}
                }
            }
        }, 15 * 1000);
    });
}

module.exports = app;