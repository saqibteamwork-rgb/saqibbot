// plugins/carousel-menu.js
// Swipe-able carousel menu (cards) with tappable command buttons + pagination.
//   .cmenu          -> page 1 (info card + category cards)
//   .cmenu 2        -> page 2 ...
// Agar fail ho jaye to khud-ba-khud normal text menu bhej deta hai.

const fs = require('fs');
const path = require('path');
const { cmd, commands } = require('../arslan');
const config = require('../config');
const { getBotPic } = require('../lib/botpic');

// ---------- settings (yahan se badlein) ----------
const CMDS_PER_CARD = 6;        // ek card mein kitni commands (list + buttons)
const CARDS_PER_PAGE = 8;       // ek page par command cards (WhatsApp max 10 cards: info + nav ke liye jagah)
const CATEGORY_ICONS = {
    main: '🏠', general: '🏠', settings: '⚙️', pair: '🔗', channel: '📢', sticker: '🏷️',
    owner: '👑', group: '👥', download: '📥', music: '🎵', anime: '🎌', fun: '🎮',
    games: '🎲', love: '💞', emotions: '😊', islamic: '🕌', tools: '🧰', utility: '🛠️',
    image: '🖼️', system: '💻', search: '🔎', misc: '📦', personal: '👤', extra: '✨', owner: '👑', saqib: '👑'
};
// Saare menus me ek hi category order: pehle bot basics, phir group/download/tools, fun/islamic, aakhir me owner/settings/system
const CATEGORY_ORDER = ['main', 'owner', 'general', 'group', 'download', 'music', 'tools', 'utility', 'image', 'sticker', 'search',
    'fun', 'games', 'anime', 'love', 'emotions', 'islamic', 'extra', 'settings', 'system'];
// -------------------------------------------------

const PREFIX = () => config.PREFIX || '.';
const botName = () => String(config.BOT_NAME || 'MR SAQIB MD').trim();

function uptimeText() {
    let s = Math.floor(process.uptime());
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    s = s % 60;
    return `${d ? d + 'd ' : ''}${h}h ${m}m ${s}s`;
}

// Saari visible commands ko category ke hisaab se group karo
function groupCommands() {
    const grouped = {};
    const seen = new Set();
    let total = 0;
    for (const c of commands) {
        if (!c.pattern || c.dontAddCommandList) continue;
        let cat = String(c.category || 'misc').toLowerCase();
        if (cat === 'downloader') cat = 'download';
        const key = cat + ':' + c.pattern;
        if (seen.has(key)) continue;
        seen.add(key);
        total++;
        (grouped[cat] = grouped[cat] || []).push(c.pattern);
    }
    const cats = [...CATEGORY_ORDER.filter(c => grouped[c]),
        ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)).sort()];
    return { grouped, cats, total };
}

// Har category ko CMDS_PER_CARD ke tukdon mein todkar "card" banao
function buildCategoryCards(onlyCat) {
    const { grouped, cats: allCats, total } = groupCommands();
    const cats = onlyCat ? allCats.filter(c => c === onlyCat) : allCats;
    const cards = [];
    for (const cat of cats) {
        const list = grouped[cat].slice().sort();
        const parts = Math.ceil(list.length / CMDS_PER_CARD);
        for (let i = 0; i < parts; i++) {
            cards.push({
                cat,
                title: `${CATEGORY_ICONS[cat] || '📌'} ${cat.toUpperCase()}${parts > 1 ? ` · ${i + 1}/${parts}` : ''}`,
                commands: list.slice(i * CMDS_PER_CARD, (i + 1) * CMDS_PER_CARD)
            });
        }
    }
    return { cards, total };
}


// Native-flow buttons dikhane ke liye WhatsApp ko "biz" node chahiye (private aur group dono mein)
function relayInteractive(conn, jid, msg) {
    return conn.relayMessage(jid, msg.message, {
        messageId: msg.key.id,
        additionalNodes: [{
            tag: 'biz', attrs: {},
            content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
                content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }]
        }]
    });
}

// Agar group mein carousel na dikhe to env CAROUSEL_IN_GROUPS=false karo: group mein purana text menu chalega
const blockedInGroup = (jid) => String(jid).endsWith('@g.us') && String(process.env.CAROUSEL_IN_GROUPS || 'true').toLowerCase() === 'false';

// Header photo ek baar upload hoti hai, phir 20 minute cache (har menu par dobara upload slow tha)
const MEDIA_TTL_MS = 20 * 60 * 1000;
const UPLOAD_TIMEOUT_MS = 4000;
const mediaCache = new Map();
function getHeaderMedia(conn, prepareWAMessageMedia, timeoutMs) {
    const pic = getBotPic(conn) || {};
    let mtime = 0;
    try { if (pic.url && !/^https?:/i.test(pic.url)) mtime = fs.statSync(pic.url).mtimeMs; } catch (_) {}
    const key = `${String((conn.user && conn.user.id) || '').split(':')[0]}|${pic.url}|${mtime}`;
    const hit = mediaCache.get(key);
    if (hit && Date.now() - hit.at < MEDIA_TTL_MS) return hit.promise;
    const upload = Promise.race([
        prepareWAMessageMedia({ image: pic }, { upload: conn.waUploadToServer }).then(r => r.imageMessage),
        new Promise((_, rej) => setTimeout(() => rej(new Error('image upload timeout')), timeoutMs || UPLOAD_TIMEOUT_MS))
    ]);
    const entry = { at: Date.now(), promise: upload };
    mediaCache.set(key, entry);
    upload.catch(() => { if (mediaCache.get(key) === entry) mediaCache.delete(key); });   // fail ho to dobara try hoga
    if (mediaCache.size > 20) mediaCache.delete(mediaCache.keys().next().value);
    return upload;
}

// .menu ke liye video header (config.MENU_VIDEO ya data/menu-video/*.mp4). Na mile / fail ho to photo chalegi.
// CONNECTED message par video nahi, hamesha photo aati hai.
function menuVideoSource() {
    const v = String(config.MENU_VIDEO || '').trim();
    if (v) return /^https?:/i.test(v) ? { url: v } : (fs.existsSync(v) ? { url: path.resolve(v) } : null);
    try {
        const dir = path.join(__dirname, '..', 'data', 'menu-video');
        const f = fs.readdirSync(dir).find(n => /\.mp4$/i.test(n));
        return f ? { url: path.join(dir, f) } : null;
    } catch (_) { return null; }
}

// Video ek baar upload hoti hai, phir 20 minute cache. Pehli baar slow ho to waitMs ke baad photo chalegi,
// upload peeche chalta rahta hai aur agle .menu par video tayyar milti hai.
const videoCache = new Map();
function getMenuVideo(conn, prepareWAMessageMedia, src, waitMs) {
    const key = `${String((conn.user && conn.user.id) || '').split(':')[0]}|${src.url}`;
    let hit = videoCache.get(key);
    if (!hit || Date.now() - hit.at > MEDIA_TTL_MS) {
        const promise = prepareWAMessageMedia({ video: src, mimetype: 'video/mp4' }, { upload: conn.waUploadToServer }).then(r => r.videoMessage);
        const entry = { at: Date.now(), promise };
        videoCache.set(key, entry);
        promise.catch(() => { if (videoCache.get(key) === entry) videoCache.delete(key); });
        if (videoCache.size > 10) videoCache.delete(videoCache.keys().next().value);
        hit = entry;
    }
    return Promise.race([hit.promise, new Promise((_, rej) => setTimeout(() => rej(new Error('video upload timeout')), waitMs || 30000))]);
}

const quickReply = (text, id) => ({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: text, id }) });
const urlButton = (text, url) => ({ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: text, url, merchant_url: url }) });

// Owner number hamesha international format mein: 03497081205 -> 923468616487
function ownerNumberIntl() {
    const n = String((config.OWNER_NUMBERS && config.OWNER_NUMBERS[0]) || config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
    if (!n) return null;
    return n.startsWith('0') ? '92' + n.slice(1) : n;
}

// Chat Owner dabane par ye message pehle se likha hua khulega (user bas send dabaye)
const OWNER_GREETING = '𝐇𝐢 𝐒𝐀𝐐𝐈𝐁 𝐒𝐢𝐫 👋✨\n𝐈 𝐜𝐨𝐧𝐭𝐚𝐜𝐭𝐞𝐝 𝐲𝐨𝐮 𝐟𝐫𝐨𝐦 𝐲𝐨𝐮𝐫 𝐖𝐡𝐚𝐭𝐬𝐀𝐩𝐩 𝐁𝐨𝐭 🤖';

function ownerLink(withText) {
    const n = ownerNumberIntl();
    if (!n) return null;
    return 'https://wa.me/' + n + (withText ? '?text=' + encodeURIComponent(OWNER_GREETING) : '');
}

// WhatsApp contact card: sahi waid ki wajah se "Invite" ki jagah "Message" button aata hai
async function sendOwnerContact(conn, jid, quoted) {
    try {
        const n = ownerNumberIntl();
        if (!n) return false;
        const name = String(config.OWNER_NAME || 'Owner');
        const vcard = [
            'BEGIN:VCARD', 'VERSION:3.0',
            `N:;${name};;;`,
            `FN:${name}`,
            `ORG:${botName()};`,
            `TEL;type=CELL;type=VOICE;waid=${n}:+${n}`,
            'END:VCARD'
        ].join('\n');
        await conn.sendMessage(jid, { contacts: { displayName: name, contacts: [{ vcard }] } }, { quoted });
        return true;
    } catch (e) {
        console.error('owner contact error:', e && e.message);
        return false;
    }
}

function footerText() { return `Powered By ${botName()}`; }

// Plain-text fallback (agar carousel na chale)
function textMenu(page, pageCards, total, totalPages) {
    const p = PREFIX();
    let t = `*${botName()}*\n👑 Owner: ${config.OWNER_NAME || '-'}\n⚡ Prefix: ${p}\n📦 Commands: ${total}\n⏱️ Uptime: ${uptimeText()}\n\n`;
    for (const c of pageCards) t += `*${c.title}*\n${c.commands.map(x => `➤ ${p}${x}`).join('\n')}\n\n`;
    if (totalPages > 1) t += `📄 Page ${page}/${totalPages} — next: ${p}cmenu ${page % totalPages + 1}`;
    return t.trim();
}

async function buildCarousel(conn, page, pageCards, total, totalPages, baileys, catFilter) {
    const { proto, prepareWAMessageMedia } = baileys;
    const IM = proto.Message.InteractiveMessage;
    const p = PREFIX();

    // Header image ek baar upload karke sab cards mein use hoti hai
    let media = null;
    try { media = { imageMessage: await getHeaderMedia(conn, prepareWAMessageMedia) }; } catch (_) { /* image ke bina bhi chalega */ }

    const header = () => IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: !!media, ...(media || {}) });
    const makeCard = (body, buttons) => ({
        header: header(),
        body: IM.Body.fromObject({ text: body }),
        footer: IM.Footer.fromObject({ text: footerText() }),
        nativeFlowMessage: IM.NativeFlowMessage.fromObject({ buttons })
    });

    const cards = [];

    // 1) Info card (sirf page 1 par)
    if (page === 1 && !catFilter) {
        const owner = ownerLink(true);
        const info =
            `《 💎 ${botName()} 》\n` +
            `----------------------------------------\n` +
            `👑 Owner   : ${config.OWNER_NAME || '-'}\n` +
            `⚡ Prefix  : ${p}\n` +
            `📦 Commands: ${total}\n` +
            `⏱️ Uptime  : ${uptimeText()}\n` +
            `🕒 Time    : ${new Date().toLocaleTimeString('en-US', { timeZone: config.TIME_ZONE || 'Asia/Karachi' })}\n` +
            `----------------------------------------\n` +
            `➡️ Swipe for commands ⬅️`;
        const btns = [quickReply('👑 Owner', p + 'owner')];
        if (owner) btns.push(urlButton('💬 Chat Owner', owner));
        btns.push(quickReply('🏓 Ping', p + 'ping'));
        cards.push(makeCard(info, btns));
    }

    // 2) Category cards: list + tappable buttons
    for (const c of pageCards) {
        const body = `《 ${c.title} 》\n\n` + c.commands.map(x => `➤ ${x}`).join('\n');
        cards.push(makeCard(body, c.commands.map(x => quickReply(p + x, p + x))));
    }

    // 3) Navigation card
    if (totalPages > 1) {
        const next = page % totalPages + 1;
        const body = page < totalPages
            ? `《 📝 MORE 》\n\nPage ${page}/${totalPages}\n➡️ Continue to the next page`
            : `《 ✅ END 》\n\nPage ${page}/${totalPages}\nSab commands dikha di gayi hain.`;
        const btns = [];
        const nav = catFilter ? `${p}menu ${catFilter} ` : `${p}menu `;
        if (page < totalPages) btns.push(quickReply('➡️ Next Page', nav + next));
        btns.push(quickReply('🏠 First Page', nav + '1'));
        if (catFilter) btns.push(quickReply('📂 All Categories', `${p}menu list`));
        cards.push(makeCard(body, btns));
    }

    return IM.create({
        body: IM.Body.create({ text: `*${botName()}* — Page ${page}/${totalPages}` }),
        footer: IM.Footer.create({ text: footerText() }),
        carouselMessage: IM.CarouselMessage.fromObject({ cards, messageVersion: 1 })
    });
}

// Carousel bhejta hai. Success par true, fail par false (throw nahi karta).
// ---------- CATEGORY VIEW: commands sirf text me, neeche 4 link buttons (links yahan se badlein) ----------
const CATEGORY_LINK_BUTTONS = [
    { button: '🌐 PORTFOLIO',        url: config.websiteUrl || 'https://mrsaqib.me' },
    { button: '📢 VIEW CHANNEL',     url: config.channelLink || 'https://whatsapp.com/channel/0029VbBTSK1EquiWrUt5uV1I' }
];

// Category ke commands sirf is box-style mein:  ┏━═❲ NAME / ┋╭┈⌖ cmd / ┋├┈⌖ cmd / ┋╰┈⌖ cmd / ┗───𒁍
function categoryItems(cat, argHint) {
    const out = [];
    const seen = new Set();
    for (const c of commands) {
        if (!c.pattern || c.dontAddCommandList) continue;
        let k = String(c.category || 'misc').toLowerCase();
        if (k === 'downloader') k = 'download';
        if (k !== cat || seen.has(c.pattern)) continue;
        seen.add(c.pattern);
        out.push({ name: c.pattern, hint: argHint(c) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function sendCategoryView(conn, mek, from, cat) {
    const baileys = require('@whiskeysockets/baileys');
    const { proto, prepareWAMessageMedia, generateWAMessageFromContent } = baileys;
    const IM = proto.Message.InteractiveMessage;
    const p = PREFIX();
    const A = require('./allmenu');
    const items = categoryItems(cat, A.argHint);
    if (!items.length) return false;

    // lambi category (jaise tools) kai POORE boxes mein; aakhri box image + 4 buttons ke saath
    const boxes = A.formatCategoryParts(cat, items, p, 3400);
    for (let i = 0; i < boxes.length - 1; i++) {
        await conn.sendMessage(from, { text: boxes[i] }, { quoted: mek });
    }
    const body = boxes[boxes.length - 1] + `\n\n📦 ${items.length} commands`;

    let header = IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: false });
    try {
        const imageMessage = await getHeaderMedia(conn, prepareWAMessageMedia);
        header = IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: true, imageMessage });
    } catch (_) { /* image ke bina bhi chalega */ }

    const interactive = IM.create({
        header,
        body: IM.Body.create({ text: body }),
        footer: IM.Footer.create({ text: footerText() }),
        nativeFlowMessage: IM.NativeFlowMessage.fromObject({ buttons: CATEGORY_LINK_BUTTONS.map(b => urlButton(b.button, b.url)) })
    });
    const msg = generateWAMessageFromContent(from, {
        viewOnceMessage: { message: { messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 }, interactiveMessage: interactive } }
    }, { quoted: mek, userJid: conn.user && conn.user.id });
    await relayInteractive(conn, from, msg);
    return true;
}

async function sendCarouselMenu(conn, mek, m, ctx, pageArg, catFilter) {
    const from = (ctx && ctx.from) || m.chat;
    if (blockedInGroup(from)) return false;
    // Category par tap/type: commands text me + 4 link buttons (carousel nahi)
    if (catFilter) {
        try { if (await sendCategoryView(conn, mek, from, catFilter)) return true; }
        catch (e) { console.error('category view error:', e && e.message); }
    }
    const { cards, total } = buildCategoryCards(catFilter);
    const totalPages = Math.max(1, Math.ceil(cards.length / CARDS_PER_PAGE));
    let page = parseInt(pageArg, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    const pageCards = cards.slice((page - 1) * CARDS_PER_PAGE, page * CARDS_PER_PAGE);
    try {
        const baileys = require('@whiskeysockets/baileys');
        const interactive = await buildCarousel(conn, page, pageCards, total, totalPages, baileys, catFilter);
        const msg = baileys.generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: interactive
                }
            }
        }, { quoted: mek, userJid: conn.user && conn.user.id });
        await relayInteractive(conn, from, msg);
        return true;
    } catch (e) {
        console.error('carousel menu error:', e && e.message);
        sendCarouselMenu.lastFallback = textMenu(page, pageCards, total, totalPages);
        return false;
    }
}

// ---------- OWNER CARD (links yahan se badlein) ----------
const OWNER_LINKS = [
    { name: 'PORTFOLIO', button: '🌐 Portfolio',  url: config.websiteUrl || 'https://mrsaqib.me' },
    { name: 'CHANNEL',   button: '📢 Channel',    url: config.channelLink || 'https://whatsapp.com/channel/0029VbBTSK1EquiWrUt5uV1I' }
];

// Body text mein links bhi hain (WhatsApp unhe khud tappable bana deta hai), buttons alag se
function ownerCardText() {
    let t = `👑 *OWNER — ${config.OWNER_NAME || 'MR SAQIB'}*\n━━━━━━━━━━━━━━━━━━\n`;
    t += OWNER_LINKS.map(l => `*${l.name}*\n${l.url}`).join('\n\n');
    t += `\n━━━━━━━━━━━━━━━━━━\n${footerText()}`;
    return t;
}

async function sendOwnerCard(conn, jid, quoted, opts) {
    if (blockedInGroup(jid)) return false;
    try {
        const baileys = require('@whiskeysockets/baileys');
        const { proto, prepareWAMessageMedia, generateWAMessageFromContent } = baileys;
        const IM = proto.Message.InteractiveMessage;
        const buttons = [];
        for (const l of OWNER_LINKS) buttons.push(urlButton(l.button, l.url));

        // Connect message par image zaroor chahiye: fresh login par upload slow hota hai,
        // isliye lamba timeout (25s) aur 3 koshishein. Normal menu me purana 4s timeout.
        let header = IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: false });
        const tries = (opts && opts.connectMode) ? 3 : 1;
        for (let t = 1; t <= tries; t++) {
            try {
                const imageMessage = await getHeaderMedia(conn, prepareWAMessageMedia, (opts && opts.connectMode) ? 25000 : undefined);
                header = IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: true, imageMessage });
                break;
            } catch (e) {
                console.warn(`[CONNECT-IMG] image upload attempt ${t}/${tries} failed:`, e && e.message);
                if (t < tries) await new Promise(r => setTimeout(r, 1500));
            }
        }

        const interactive = IM.create({
            header,
            body: IM.Body.create({ text: ownerCardText() }),
            footer: IM.Footer.create({ text: footerText() }),
            nativeFlowMessage: IM.NativeFlowMessage.fromObject({ buttons })
        });
        const msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: { message: { messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 }, interactiveMessage: interactive } }
        }, { quoted, userJid: conn.user && conn.user.id });
        await relayInteractive(conn, jid, msg);
        return true;
    } catch (e) {
        console.error('owner card error:', e && e.message);
        return false;
    }
}

// Saari categories ek tappable list mein (connect message ke neeche aur ".menu list" par)
async function sendCategoryPicker(conn, jid, quoted, bodyText, opts) {
    if (blockedInGroup(jid)) return false;
    try {
        const baileys = require('@whiskeysockets/baileys');
        const { proto, prepareWAMessageMedia, generateWAMessageFromContent } = baileys;
        const IM = proto.Message.InteractiveMessage;
        const p = PREFIX();
        const { grouped, cats, total } = groupCommands();
        const channelLink = config.CHANNEL_LINK || (config.AUTO_FOLLOW_CHANNELS && config.AUTO_FOLLOW_CHANNELS[0]) || '';

        // .menu par VIDEO (na chale to photo); CONNECTED message par hamesha PHOTO
        // (fresh login par upload slow hota hai, isliye connect par 25s timeout aur 3 koshishein)
        const connect = !!(opts && opts.connectMode);
        let header = IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: false });
        let gotVideo = false;
        const vsrc = connect ? null : menuVideoSource();
        if (vsrc) {
            try {
                const videoMessage = await getMenuVideo(conn, prepareWAMessageMedia, vsrc, 30000);
                header = IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: true, videoMessage });
                gotVideo = true;
            } catch (e) {
                console.warn('[MENU-VIDEO] video nahi gayi, photo bhej raha hoon:', e && e.message);
            }
        }
        const tries = connect ? 3 : 1;
        for (let t = 1; t <= tries && !gotVideo; t++) {
            try {
                const imageMessage = await getHeaderMedia(conn, prepareWAMessageMedia, connect ? 25000 : undefined);
                header = IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: true, imageMessage });
                break;
            } catch (e) {
                console.warn(`[MENU-IMG] image upload attempt ${t}/${tries} failed:`, e && e.message);
                if (t < tries) await new Promise(r => setTimeout(r, 1500));
            }
        }

        const send = async (body, buttons, withHeader) => {
            const interactive = IM.create({
                header: withHeader ? header : IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: false }),
                body: IM.Body.create({ text: body }),
                footer: IM.Footer.create({ text: (opts && opts.footer) || footerText() }),
                nativeFlowMessage: IM.NativeFlowMessage.fromObject({ buttons })
            });
            const msg = generateWAMessageFromContent(jid, {
                viewOnceMessage: { message: { messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 }, interactiveMessage: interactive } }
            }, { quoted, userJid: conn.user && conn.user.id });
            await relayInteractive(conn, jid, msg);
        };

        // Connect message: sirf 2 button — Categories + View Channel
        if (opts && opts.connectMode) {
            const buttons = [quickReply('📂 Categories', p + 'menu list')];
            if (channelLink) buttons.push(urlButton('📢 View Channel', channelLink));
            await send(bodyText || `*${botName()}*\n📂 Categories (${cats.length}) · ${total} commands`, buttons, true);
            return true;
        }

        // Categories: har category ek tappable button (ek message mein max 10 button)
        const PER_MSG = 10;
        const catButtons = cats.map(c => quickReply(`${CATEGORY_ICONS[c] || '📌'} ${c.toUpperCase()} (${grouped[c].length})`, `${p}menu ${c}`));
        const chunks = [];
        for (let i = 0; i < catButtons.length; i += PER_MSG) chunks.push(catButtons.slice(i, i + PER_MSG));
        for (let i = 0; i < chunks.length; i++) {
            const body = i === 0
                ? (bodyText || `*${botName()}*\n📂 Categories (${cats.length}) · ${total} commands\nKisi bhi category par tap karo 👇`)
                : `📂 Categories (${i + 1}/${chunks.length}) 👇`;
            await send(body, chunks[i], i === 0);
        }
        return true;
    } catch (e) {
        console.error('category picker error:', e && e.message);
        return false;
    }
}

cmd({
    pattern: 'cmenu',
    alias: ['swipemenu', 'cardmenu', 'cmenu1'],
    use: '.cmenu  |  .cmenu <page>',
    desc: 'Swipe-able card menu with tappable buttons',
    category: 'system',
    react: '📜',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const from = ctx.from || m.chat;
    const arg = (ctx.args && ctx.args[0]) || (ctx.q || '').trim();
    const ok = await sendCarouselMenu(conn, mek, m, ctx, arg);
    if (!ok) await conn.sendMessage(from, { text: sendCarouselMenu.lastFallback }, { quoted: mek });
});

module.exports = { relayInteractive, buildCategoryCards, sendCarouselMenu, sendCategoryPicker, groupCommands, sendOwnerCard, sendOwnerContact, ownerCardText, OWNER_LINKS };
