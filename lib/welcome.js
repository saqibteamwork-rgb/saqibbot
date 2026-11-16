// lib/welcome.js
// Group welcome / goodbye engine
//  - new member's profile picture inside a styled card
//  - Urdu shayari + stylish unicode fonts
//  - every setting is per group (and per session), saved in data/welcome.json
//  - placeholders: @user @group @count @date @time @shayari

const fs = require('fs');
const path = require('path');
const config = require('../config');

const STORE_FILE = path.join(__dirname, '..', 'data', 'welcome.json');

// ─────────────── stylish unicode fonts ───────────────
const FONT_NAMES = {
    0: ['Normal', 'Welcome'],
    1: ['Script Bold', '𝓦𝓮𝓵𝓬𝓸𝓶𝓮'],
    2: ['Bold', '𝐖𝐞𝐥𝐜𝐨𝐦𝐞'],
    3: ['Bold Italic', '𝑾𝒆𝒍𝒄𝒐𝒎𝒆'],
    4: ['Gothic Bold', '𝖂𝖊𝖑𝖈𝖔𝖒𝖊'],
    5: ['Sans Bold', '𝗪𝗲𝗹𝗰𝗼𝗺𝗲'],
    6: ['Monospace', '𝚆𝚎𝚕𝚌𝚘𝚖𝚎'],
    7: ['Small Caps', 'ᴡᴇʟᴄᴏᴍᴇ']
};
const OFFSETS = {
    1: [0x1D4D0, 0x1D4EA, null],
    2: [0x1D400, 0x1D41A, 0x1D7CE],
    3: [0x1D468, 0x1D482, null],
    4: [0x1D56C, 0x1D586, null],
    5: [0x1D5D4, 0x1D5EE, 0x1D7EC],
    6: [0x1D670, 0x1D68A, 0x1D7F6]
};
const SMALL_CAPS = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ';

function fancy(text, style) {
    const st = Number(style);
    if (!st) return String(text);
    let out = '';
    for (const ch of String(text)) {
        const c = ch.codePointAt(0);
        if (st === 7) {
            if (c >= 97 && c <= 122) out += SMALL_CAPS[c - 97];
            else if (c >= 65 && c <= 90) out += SMALL_CAPS[c - 65];
            else out += ch;
            continue;
        }
        const o = OFFSETS[st];
        if (!o) { out += ch; continue; }
        if (c >= 65 && c <= 90) out += String.fromCodePoint(o[0] + c - 65);
        else if (c >= 97 && c <= 122) out += String.fromCodePoint(o[1] + c - 97);
        else if (c >= 48 && c <= 57 && o[2]) out += String.fromCodePoint(o[2] + c - 48);
        else out += ch;
    }
    return out;
}

// ─────────────── Urdu shayari (original couplets) ───────────────
const WELCOME_SHAYARI = [
    'آپ آئے تو محفل میں رونق آ گئی،\nدل کی ہر دھڑکن خوشی سے گنگنا گئی۔',
    'خوش آمدید اے دوست، دل سے خوش آمدید،\nتیرے آنے سے ہر چہرہ ہوا پرامید۔',
    'پھولوں کی طرح مہکتے رہو ہر دم،\nہنستے مسکراتے رہو ہر دم۔',
    'دوستی کا یہ سفر یوں ہی چلتا رہے،\nدلوں میں پیار کا چراغ جلتا رہے۔',
    'دل کے دروازے کھلے ہیں تمہارے لیے،\nمحبت کے پھول بچھے ہیں تمہارے لیے۔',
    'یہ محفل تمہاری، یہ دوست بھی تمہارے،\nآؤ کہ ہم سب ہیں اب ساتھ تمہارے۔',
    'مسکراہٹ تمہاری سلامت رہے سدا،\nخوشیوں کا ساتھ تمہارا رہے سدا۔',
    'اللہ کرے یہ ساتھ سلامت رہے،\nمحبتوں کا یہ رشتہ قائم رہے۔',
    'عزت دو گے تو عزت پاؤ گے،\nمحبت بانٹو گے تو محبت پاؤ گے۔',
    'تمہارے آنے سے بزم میں بہار آئی ہے،\nہر دل میں خوشی کی لہر سی چھائی ہے۔'
];
const GOODBYE_SHAYARI = [
    'جاتے جاتے بھی دعا ہے ہماری،\nجہاں رہو خوش رہو، سلامت رہو۔',
    'یادوں میں تم رہو گے ہمیشہ،\nدعاؤں میں ہم رکھیں گے ہمیشہ۔',
    'خدا حافظ اے دوست، اللہ نگہبان،\nتمہارا سفر ہو خوشیوں کا کارواں۔',
    'کچھ لمحے تمہارے ساتھ اچھے گزرے،\nیہ یادیں دل میں تازہ رہیں گی ہمیشہ۔'
];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shayariBlock = txt => `❝ ${String(txt).trim().split('\n').join('\n   ')} ❞`;

// ─────────────── per-group settings ───────────────
let store = null;
function load() {
    if (store) return store;
    try { store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); }
    catch (_) { store = {}; }
    return store;
}
let saveTimer = null;
function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
            fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
        } catch (e) { console.error('[WELCOME] save failed:', e.message); }
    }, 300);
}

const sessionNumber = conn => String(conn?.user?.id || '').split(':')[0].split('@')[0];
const keyOf = (conn, groupJid) => `${sessionNumber(conn)}|${groupJid}`;

function defaults() {
    return {
        welcome: String(config.WELCOME_ENABLE) === 'true',
        goodbye: String(config.GOODBYE_ENABLE) === 'true',
        wtext: config.WELCOME_MSG || null,
        gtext: config.GOODBYE_MSG || null,
        shayari: true,
        shayariText: null,
        font: 1,
        pic: true
    };
}
function getSettings(conn, groupJid) {
    return { ...defaults(), ...(load()[keyOf(conn, groupJid)] || {}) };
}
function setSetting(conn, groupJid, patch) {
    const all = load();
    const k = keyOf(conn, groupJid);
    all[k] = { ...(all[k] || {}), ...patch };
    save();
    return getSettings(conn, groupJid);
}

// ─────────────── text building ───────────────
function timeStrings() {
    const tz = config.TIME_ZONE || config.TIMEZONE || 'Asia/Karachi';
    const now = new Date();
    try {
        return {
            date: now.toLocaleDateString('en-GB', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }),
            time: now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
        };
    } catch (_) {
        return { date: now.toDateString(), time: now.toTimeString().slice(0, 5) };
    }
}

function fill(template, vars) {
    return String(template)
        .replace(/@user/gi, vars.user)
        .replace(/@group/gi, vars.group)
        .replace(/@count/gi, String(vars.count))
        .replace(/@date/gi, vars.date)
        .replace(/@time/gi, vars.time)
        .replace(/@shayari/gi, vars.shayari);
}

function buildText(kind, s, vars) {
    const isWelcome = kind === 'welcome';
    const custom = isWelcome ? s.wtext : s.gtext;
    const poem = s.shayari
        ? shayariBlock(s.shayariText || pick(isWelcome ? WELCOME_SHAYARI : GOODBYE_SHAYARI))
        : '';
    const v = { ...vars, shayari: poem };
    if (custom) return fill(custom, v);

    const f = s.font;
    const bot = config.BOT_NAME || '𝗔𝗠𝗔𝗡-𝐌𝐃-𝐁𝐎𝐓';
    if (isWelcome) {
        return [
            '╔═══════════════════╗',
            `   ✨ ${fancy('WELCOME', f)} ✨`,
            '╚═══════════════════╝',
            '',
            `🌸 ${fancy('Member', f)}: ${vars.user}`,
            `🏡 ${fancy('Group', f)}: ${vars.group}`,
            `👥 ${fancy('Number', f)}: #${vars.count}`,
            `🕒 ${vars.date} • ${vars.time}`,
            poem ? '\n' + poem : '',
            '',
            `💐 ${fancy(bot, f)}`
        ].join('\n').replace(/\n{3,}/g, '\n\n');
    }
    return [
        '╔═══════════════════╗',
        `   🥀 ${fancy('GOOD BYE', f)} 🥀`,
        '╚═══════════════════╝',
        '',
        `👋 ${vars.user}`,
        `🏡 ${vars.group}`,
        `👥 ${fancy('Members left', f)}: ${vars.count}`,
        poem ? '\n' + poem : '',
        '',
        `💔 ${fancy(bot, f)}`
    ].join('\n').replace(/\n{3,}/g, '\n\n');
}

// ─────────────── owner photo (badge on the card) ───────────────
// Owner ki apni photo: har welcome / goodbye card par member ki DP ke saath chhoti gol photo ke roop mein.
const OWNER_DIR = path.join(path.dirname(STORE_FILE), 'welcome-owner');
const ownerFile = conn => path.join(OWNER_DIR, sessionNumber(conn) + '.png');
const ownerOffFile = conn => path.join(OWNER_DIR, sessionNumber(conn) + '.off');

function hasOwnerPic(conn) { try { return fs.existsSync(ownerFile(conn)); } catch (_) { return false; } }
function ownerPicEnabled(conn) { try { return hasOwnerPic(conn) && !fs.existsSync(ownerOffFile(conn)); } catch (_) { return false; } }
function getOwnerPic(conn) {
    try { return ownerPicEnabled(conn) ? fs.readFileSync(ownerFile(conn)) : null; } catch (_) { return null; }
}
async function setOwnerPic(conn, buffer) {
    const sharp = require('sharp');
    const png = await sharp(buffer).resize(400, 400, { fit: 'cover' }).png().toBuffer();   // square, chhota
    fs.mkdirSync(OWNER_DIR, { recursive: true });
    fs.writeFileSync(ownerFile(conn), png);
    try { fs.unlinkSync(ownerOffFile(conn)); } catch (_) {}
}
function setOwnerPicEnabled(conn, on) {
    if (!hasOwnerPic(conn)) return false;
    try {
        if (on) { try { fs.unlinkSync(ownerOffFile(conn)); } catch (_) {} }
        else { fs.mkdirSync(OWNER_DIR, { recursive: true }); fs.writeFileSync(ownerOffFile(conn), '1'); }
        return true;
    } catch (_) { return false; }
}
function clearOwnerPic(conn) {
    try { fs.unlinkSync(ownerFile(conn)); } catch (_) {}
    try { fs.unlinkSync(ownerOffFile(conn)); } catch (_) {}
}

// ─────────────── picture card (DP inside a ring) ───────────────
const SILHOUETTE = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#2a1520"/>' +
    '<circle cx="150" cy="115" r="55" fill="#7a4a5c"/><path d="M40 300c0-70 50-110 110-110s110 40 110 110z" fill="#7a4a5c"/></svg>'
);

async function fetchBuffer(url) {
    const axios = require('axios');
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return Buffer.from(r.data);
}

async function getProfilePicture(conn, jids) {
    for (const jid of jids.filter(Boolean)) {
        for (const kind of ['image', 'preview']) {
            try {
                const url = await Promise.race([
                    conn.profilePictureUrl(jid, kind),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
                ]);
                if (url) return await fetchBuffer(url);
            } catch (_) { /* no picture / private */ }
        }
    }
    return null;
}

async function makeCard({ dp, title, subtitle, owner }) {
    const sharp = require('sharp');
    const W = 1000, H = 600, D = 300;
    const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14060d"/><stop offset="1" stop-color="#43091f"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#ff3048" stop-opacity=".55"/><stop offset="1" stop-color="#ff3048" stop-opacity="0"/></radialGradient>
<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3be"/><stop offset="1" stop-color="#ff3048"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" rx="40" fill="url(#g)"/>
<circle cx="500" cy="250" r="270" fill="url(#glow)"/>
<g fill="#ffffff" fill-opacity=".35"><circle cx="110" cy="90" r="4"/><circle cx="880" cy="120" r="5"/><circle cx="170" cy="470" r="3"/><circle cx="840" cy="430" r="4"/><circle cx="260" cy="170" r="2.5"/><circle cx="740" cy="200" r="2.5"/></g>
<circle cx="500" cy="250" r="${D / 2 + 14}" fill="none" stroke="url(#ring)" stroke-width="10"/>
<g font-family="DejaVu Sans, Arial, Helvetica, sans-serif" text-anchor="middle">
<text x="500" y="492" font-size="74" font-weight="bold" fill="#ffffff" letter-spacing="8">${esc(title)}</text>
<text x="500" y="548" font-size="32" fill="#ff8fa3">${esc(subtitle)}</text></g></svg>`;

    const mask = Buffer.from(`<svg width="${D}" height="${D}"><circle cx="${D / 2}" cy="${D / 2}" r="${D / 2}" fill="#fff"/></svg>`);
    let face;
    try { face = await sharp(dp || SILHOUETTE).resize(D, D, { fit: 'cover' }).png().toBuffer(); }
    catch (_) { face = await sharp(SILHOUETTE).resize(D, D).png().toBuffer(); }
    const round = await sharp(face).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

    const layers = [{ input: round, left: (W - D) / 2, top: 100 }];

    // Owner ki photo: member ki DP ke neeche-right kone par chhoti gol badge
    if (owner) {
        try {
            const OD = 130, ox = 575, oy = 285;                    // top-left of the badge
            const oMask = Buffer.from(`<svg width="${OD}" height="${OD}"><circle cx="${OD / 2}" cy="${OD / 2}" r="${OD / 2}" fill="#fff"/></svg>`);
            const oFace = await sharp(owner).resize(OD, OD, { fit: 'cover' }).png().toBuffer();
            const oRound = await sharp(oFace).composite([{ input: oMask, blend: 'dest-in' }]).png().toBuffer();
            const oRing = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${OD + 24}" height="${OD + 24}"><circle cx="${(OD + 24) / 2}" cy="${(OD + 24) / 2}" r="${OD / 2 + 7}" fill="#14060d" stroke="#ffb3be" stroke-width="6"/></svg>`);
            layers.push({ input: oRing, left: ox - 12, top: oy - 12 });
            layers.push({ input: oRound, left: ox, top: oy });
        } catch (e) { console.error('[WELCOME] owner badge skipped:', e.message); }
    }

    return sharp(Buffer.from(bg)).composite(layers).png().toBuffer();
}

// ─────────────── main sender ───────────────
const recent = new Map();

async function sendNotice(conn, kind, groupJid, memberJid, memberNumber, opts = {}) {
    const s = getSettings(conn, groupJid);
    let groupName = 'Group', count = 0;
    try {
        const meta = await Promise.race([
            conn.groupMetadata(groupJid),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))
        ]);
        groupName = meta.subject || groupName;
        count = (meta.participants || []).length;
    } catch (_) { /* keep defaults */ }

    const t = timeStrings();
    const vars = { user: '@' + memberNumber, group: groupName, count, date: t.date, time: t.time };
    const text = buildText(kind, s, vars);
    const mentions = [opts.mentionJid || memberJid];

    if (s.pic) {
        try {
            const dp = await getProfilePicture(conn, [memberJid, opts.altJid]);
            const card = await makeCard({
                dp,
                owner: getOwnerPic(conn),
                title: kind === 'welcome' ? 'WELCOME' : 'GOOD BYE',
                subtitle: kind === 'welcome' ? `Member #${count}` : 'We will miss you'
            });
            return await conn.sendMessage(groupJid, { image: card, caption: text, mentions });
        } catch (e) {
            console.error('[WELCOME] card failed, sending text:', e.message);
        }
    }
    return conn.sendMessage(groupJid, { text, mentions });
}

async function handleGroupParticipants(conn, update) {
    const action = update.action;
    if (action !== 'add' && action !== 'remove') return;
    const groupJid = update.id;
    if (!groupJid || !groupJid.endsWith('@g.us')) return;
    const s = getSettings(conn, groupJid);
    if (action === 'add' && !s.welcome) return;
    if (action === 'remove' && !s.goodbye) return;

    const me = sessionNumber(conn);
    for (const p of update.participants || []) {
        const jid = typeof p === 'string' ? p : (p.id || p.phoneNumber);
        const alt = typeof p === 'string' ? null : (p.phoneNumber && p.phoneNumber !== jid ? p.phoneNumber : null);
        if (!jid) continue;
        const number = String(alt || jid).split('@')[0].split(':')[0];
        if (number === me) continue;

        const dedupe = `${me}|${groupJid}|${jid}|${action}`;
        if (recent.has(dedupe) && Date.now() - recent.get(dedupe) < 20000) continue;
        recent.set(dedupe, Date.now());
        if (recent.size > 500) recent.clear();

        try { await sendNotice(conn, action === 'add' ? 'welcome' : 'goodbye', groupJid, jid, number, { altJid: alt, mentionJid: alt || jid }); }
        catch (e) { console.error('[WELCOME] send failed:', e.message); }
    }
}

module.exports = {
    FONT_NAMES, fancy, WELCOME_SHAYARI, GOODBYE_SHAYARI,
    getSettings, setSetting, buildText, makeCard, sendNotice, handleGroupParticipants, sessionNumber,
    fetchBuffer, hasOwnerPic, ownerPicEnabled, getOwnerPic, setOwnerPic, setOwnerPicEnabled, clearOwnerPic
};
