const { cmd, commands } = require("../arslan");
const config = require("../config");
const path = require("path");
const fs = require("fs");
const { runtime } = require("../lib/functions");
const shortUptime = (sec) => {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60;
    return (d ? d + "d " : "") + h + "h " + m + "m " + x + "s";
};
const { getBotPic } = require("../lib/botpic");

const UPDATE_CHANNEL_JID = "120363407510749622@newsletter";
// Channel JID is taken from config.CHANNEL_LINK automatically (cached after the first lookup).
// The hard-coded JID is only a fallback if WhatsApp does not answer in time.
const FALLBACK_JID = UPDATE_CHANNEL_JID;
let resolvedChannel = null;
let channelFailedAt = 0;
async function getChannelInfo(conn, botName) {
    if (resolvedChannel) return resolvedChannel;
    if (channelFailedAt && Date.now() - channelFailedAt < 10 * 60 * 1000) return { jid: FALLBACK_JID, name: botName };
    try {
        const link = config.CHANNEL_LINK || config.FORCE_CHANNEL_1;
        const code = new URL(String(link)).pathname.split("/").filter(Boolean)[1];
        if (code && typeof conn.newsletterMetadata === "function") {
            const meta = await Promise.race([
                conn.newsletterMetadata("invite", code),
                new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))
            ]);
            const jid = meta && (meta.id || meta.jid);
            if (jid && String(jid).endsWith("@newsletter")) {
                resolvedChannel = { jid, name: (meta.name || botName) };
                return resolvedChannel;
            }
        }
    } catch (_) { /* use fallback */ }
    channelFailedAt = Date.now();
    return { jid: FALLBACK_JID, name: botName };
}

const audioDir = path.join(__dirname, "../data/menu-voice");

// Menu image: .menu par ye photo jayegi (video hata di gayi hai). Badalni ho to sirf ye link badlein.
// Link na khule to bot ki apni photo (getBotPic) chali jayegi.
const MENU_IMAGE_URL = process.env.MENU_IMAGE || config.MENU_IMAGE || settings.menuImage || "https://ik.imagekit.io/19imy4f1u/lite_1775822697436_IXJPba-z2.png";

let VERSION = "1.0.0";
try { VERSION = require("../package.json").version || VERSION; } catch (_) {}

const getRandomAudio = () => {
    try {
        if (!fs.existsSync(audioDir)) return null;
        const files = fs.readdirSync(audioDir).filter(f => /\.mp3$/i.test(f));
        if (!files.length) return null;
        return path.join(audioDir, files[Math.floor(Math.random() * files.length)]);
    } catch (_) { return null; }
};

const toSmallCaps = (text) => {
    if (!text || typeof text !== "string") return "";
    const map = {
        a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ғ", g: "ɢ", h: "ʜ", i: "ɪ", j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ",
        n: "ɴ", o: "ᴏ", p: "ᴘ", q: "ǫ", r: "ʀ", s: "s", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ"
    };
    return text.split("").map(ch => map[ch.toLowerCase()] || ch).join("");
};

const toBold = (text) => String(text || "").replace(/[A-Za-z]/g, ch => {
    const c = ch.charCodeAt(0);
    return String.fromCodePoint(c <= 90 ? 0x1D400 + (c - 65) : 0x1D41A + (c - 97));
});

// "<name>" jaise arguments .use se nikalta hai (sirf jab command ke .use mein likhe hon)
const argHint = (c) => {
    const use = String(c.use || "");
    if (!use) return "";
    const tags = use.match(/<[^<>]{1,24}>/g);
    if (!tags) return "";
    // chhote hints (<jid>, <link>, <name>) taake WhatsApp pe line wrap na ho
    const short = (t) => {
        const w = t.slice(1, -1).toLowerCase();
        if (/jid1/.test(w)) return "<jids>";
        if (/jid/.test(w)) return "<jid>";
        if (/link|url/.test(w)) return "<link>";
        if (/server/.test(w)) return "<id>";
        if (/\|/.test(w)) return "<option>";
        if (/number/.test(w)) return "<num>";
        if (/name/.test(w)) return "<name>";
        if (/message|details|text|lines|description/.test(w)) return "<text>";
        if (/category/.test(w)) return "<cat>";
        return w.length > 8 ? "<" + w.slice(0, 8) + ">" : t;
    };
    return " " + tags.slice(0, 1).map(t => toSmallCaps(short(t))).join(" ");
};

const getCategoryEmoji = (category) => {
    const cat = category.toLowerCase();
    if (cat.includes("audio") || cat.includes("voice") || cat.includes("sound") || cat.includes("music")) return "🎵";
    if (cat.includes("download") || cat.includes("dl")) return "📥";
    if (cat.includes("group") || cat.includes("gc")) return "👥";
    if (cat.includes("owner") || cat.includes("admin")) return "👑";
    if (cat.includes("anime")) return "✨";
    if (cat.includes("islam")) return "🕌";
    if (cat.includes("logo") || cat.includes("img") || cat.includes("image") || cat.includes("sticker")) return "🖼️";
    if (cat.includes("converter") || cat.includes("tools")) return "🛠️";
    if (cat.includes("fun") || cat.includes("game") || cat.includes("love") || cat.includes("emotion")) return "🎮";
    if (cat.includes("search") || cat.includes("find")) return "🔍";
    return "⚡";
};

// ═══════════════════════════════════════════════════════════
//  🎨 MENU DESIGN — yahan se apna design khud badlein
//  Placeholders:
//    HEADER: {BOT} {OWNER} {PREFIX} {UPTIME} {COUNT} {MODE} {VERSION}
//    CATEGORY_TOP: {EMOJI} {CAT} {COUNT}
//    COMMAND: {PREFIX} {CMD}
// ═══════════════════════════════════════════════════════════
const DESIGN = {
    // {BOT} {OWNER} {PLATFORM} {PREFIX} {VERSION} {UPTIME} {COUNT} {MODE}
    HEADER: [
        "╭━〔⚝ {BOT} ⚝〕━┈●",
        "┃ *𝐎𝚆𝙽𝙴𝚁:* {OWNER}",
        "┃ *𝐏𝚁𝙴𝙵𝙸𝚇:* {PREFIX}",
        "┃ *𝐔𝙿𝚃𝙸𝙼𝙴:* {UPTIME}",
        "┃ *𝐂𝙾𝙼𝙼𝙰𝙽𝙳𝚂:* {COUNT}",
        "┃ *𝐌𝙾𝙳𝙴:* {MODE}",
        "┃ *𝐕𝙴𝚁𝚂𝙸𝙾𝙽:* {VERSION}",
        "╰━━━━━━━━━━━━━━━━┈●"
    ].join("\n"),

    ALL_TITLE: "> {TITLE}",                       // sari commands se pehle wali line
    ALL_TITLE_TEXT: "ALL COMMANDS BY " + (config.OWNER_NAME || "MR SAQIB"),

    // har category ka dabba (naya design: ┏━═❲ TITLE / ┋╭┈⌖ cmd / ┋├┈⌖ cmd / ┋╰┈⌖ cmd / ┗───𒁍)
    CATEGORY_TOP:    "",                          // khali = is line ko skip karo
    CATEGORY_TITLE:  "┏━═❲ {CAT}",
    COMMAND_FIRST:   "┋╭┈⌖ {CMD}",
    COMMAND:         "┋├┈⌖ {CMD}",
    COMMAND_LAST:    "┋╰┈⌖ {CMD}",
    CATEGORY_BOTTOM: "┗───────────────────𒁍",

    // ".menu list" likhne par sirf categories ki list is design mein aati hai
    LIST_TOP:    "╭╍╍╍╍╍╍╍╍╍╍┈⊷",
    LIST_TITLE:  "┣═❲ 𝗖𝗔𝗧𝗘𝗚𝗢𝗥𝗜𝗘𝗦",
    LIST_ITEM:   "┃{CAT}",
    LIST_BOTTOM: "╰╍╍╍╍╍╍╍╍╍╍┈⊷",
    LIST_PER_ROW: 2,

    USE_STATIC_MENU: true,   // true = neeche MENU_BLOCKS wali list (khud edit karein); false = commands se auto banega

    FOOTER: "©𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 " + (config.OWNER_NAME || "MR SAQIB"),   // null = config.BOT_FOOTER ya "© Powered by BOT"
    SORT_COMMANDS: true,     // true = A-Z, false = jaise plugins mein likhe hain
    SHOW_HIDDEN: false,      // true = dontAddCommandList wale commands bhi dikhao
    VIDEO_AS_GIF: false,      // true = video GIF ki tarah autoplay/loop; false = normal video
    MAX_CHARS: 3500          // ek message ki limit; zyada ho to menu khud agle message mein chala jata hai
};
// ═══════════════════════════════════════════════════════════

const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));

// Command ka pehla harf monospace capital (𝙱), baqi small-caps (ʟᴜʀ)  ->  𝙱ʟᴜʀ
const toMonoCap = (ch) => /[a-z]/i.test(ch) ? String.fromCodePoint(0x1D670 + ch.toUpperCase().charCodeAt(0) - 65) : ch;
const styleName = (name) => { const t = String(name || ""); return t ? toMonoCap(t[0]) + toSmallCaps(t.slice(1)) : ""; };

const formatCategory = (category, items, prefix) => {
    if (!items.length) return "";
    const title = fill(DESIGN.CATEGORY_TITLE, { EMOJI: getCategoryEmoji(category), CAT: toBold(category.toUpperCase()), COUNT: items.length });
    const last = items.length - 1;
    const body = items.map((it, i) => fill(last === 0 ? DESIGN.COMMAND_LAST : (i === 0 ? DESIGN.COMMAND_FIRST : (i === last ? DESIGN.COMMAND_LAST : DESIGN.COMMAND)),
        { PREFIX: prefix, CMD: styleName(it.name) + (it.hint || "") })).join("\n");
    return [DESIGN.CATEGORY_TOP, title, body, DESIGN.CATEGORY_BOTTOM].filter(Boolean).join("\n");
};

// bahut lambi category (jaise tools) ko kai POORE dabbon mein todta hai taake box kabhi adhura na kate
const formatCategoryParts = (category, items, prefix, max) => {
    const parts = [];
    let cur = [];
    const sizeOf = (arr, n) => formatCategory(n > 1 ? `${category} ${n}` : category, arr, prefix).length;
    for (const it of items) {
        if (cur.length && sizeOf([...cur, it], parts.length + 1) > max - 400) { parts.push(cur); cur = []; }
        cur.push(it);
    }
    if (cur.length) parts.push(cur);
    return parts.map((arr, i) => formatCategory(i ? `${category} ${i + 1}` : category, arr, prefix));
};

// static list (MENU_BLOCKS) se boxes; only = sirf ek category
const staticBlocks = (only) => MENU_BLOCKS.filter(b => !only || b.cat === only).map(b => b.text.trim());

// text ko MAX_CHARS ke hisaab se tukron mein todta hai (category ke beech se tabhi jab category khud bahut lambi ho)
const splitBlocks = (blocks, max) => {
    const out = [];
    let cur = "";
    const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
    for (const b of blocks) {
        if (b.length > max) {
            push();
            let part = "";
            for (const line of b.split("\n")) {
                if ((part + "\n" + line).length > max) { out.push(part.trim()); part = ""; }
                part += (part ? "\n" : "") + line;
            }
            if (part.trim()) out.push(part.trim());
            continue;
        }
        if ((cur + "\n\n" + b).length > max) push();
        cur += (cur ? "\n\n" : "") + b;
    }
    push();
    return out;
};

const LIST_ORDER = ["main", "owner", "general", "group", "download", "music", "tools", "utility", "image", "sticker", "search",
    "fun", "games", "anime", "love", "emotions", "islamic", "extra", "owner", "settings", "system"];

const ORDER = LIST_ORDER;

cmd({
    pattern: "menu",
    alias: ["m", "help", "allmenu", "fullmenu", "commandlist"],
    use: ".menu  |  .menu <category>",
    desc: "Show bot categories, or one category's commands",
    category: "system",
    react: "⚡",
    filename: __filename,
}, async (conn, mek, m, ctx) => {
    const from = ctx.from || m.chat;
    try {
        try { Promise.resolve(conn.sendPresenceUpdate("composing", from)).catch(() => {}); } catch (_) {}

        // saari commands category ke hisaab se (duplicate nahi; bina category wali "misc" mein)
        const grouped = {};
        let totalCommands = 0;
        const seen = new Set();
        for (const c of commands) {
            if (!c.pattern) continue;
            if (c.dontAddCommandList && !DESIGN.SHOW_HIDDEN) continue;
            let cat = String(c.category || "misc").toLowerCase();
            if (cat === "downloader") cat = "download";
            const key = `${cat}:${c.pattern}`;
            if (seen.has(key)) continue;
            seen.add(key);
            totalCommands++;
            (grouped[cat] = grouped[cat] || []).push({ name: c.pattern, hint: argHint(c) });
        }

        const PREFIX = config.PREFIX || ".";
        const BOT_NAME = String(config.BOT_NAME || "MR SAQIB MD").replace(/(\s*[-_ ]\s*bot)+\s*$/i, "").trim() || "MR SAQIB MD";
        const OWNER_NAME = config.OWNER_NAME || "Owner";
        const MODE = config.WORK_TYPE || "public";
        const FOOTER = DESIGN.FOOTER || config.BOT_FOOTER || `> ©𝐏𝐨𝐰𝐞𝐫𝐝 𝐁𝐲 ${BOT_NAME}`;

        const cats = [...LIST_ORDER.filter(c => grouped[c]), ...Object.keys(grouped).filter(c => !LIST_ORDER.includes(c)).sort()];

        // 🆕 Tappable menus: ".menu" (category buttons) / ".menu 2" / ".menu list" / ".menu <category> [page]"
        // Fail ho to purana text menu chalega.
        const CAT_ALIAS = { misc: "utility", anime: "utility", games: "utility", emotions: "utility", system: "utility", settings: "extra", love: "extra", owner: "owner", main: "main", saqib: "owner", aman: "owner", image: "tools" };
        const wantedEarly = String(ctx.text || ctx.q || (ctx.args || []).join(" ") || "").trim().toLowerCase().replace(/^\S+/, w => (grouped[w] ? w : (CAT_ALIAS[w] || w))); // asli category ho to alias nahi lagta (ANIME -> anime hi khule)
        try {
            const cm = require("./carousel-menu");
            const parts = wantedEarly.split(/\s+/).filter(Boolean);
            const wantsText = ["allmenu", "fullmenu", "commandlist"].includes(String(ctx.command || "").toLowerCase());
            if (wantsText) { /* purana poora text menu */ }
            else if (!parts.length) {
                // .menu -> sirf category buttons (kisi par tap karo to us category ki commands khulti hain)
                if (await cm.sendCategoryPicker(conn, from, mek)) return;
                if (await cm.sendCarouselMenu(conn, mek, m, ctx)) return;
            } else if (/^\d+$/.test(parts[0])) {
                if (await cm.sendCarouselMenu(conn, mek, m, ctx, parts[0])) return;
            } else if (["list", "categories", "category"].includes(parts[0])) {
                if (await cm.sendCategoryPicker(conn, from, mek)) return;
            } else if (!["all", "full", "allmenu"].includes(parts[0])) {
                const hit = cats.find(c => c === parts[0]) || cats.find(c => c.startsWith(parts[0]));
                if (hit && await cm.sendCarouselMenu(conn, mek, m, ctx, parts[1], hit)) return;
            }
        } catch (_) { /* purane menu par chalo */ }
        const channel = await getChannelInfo(conn, BOT_NAME);
        const newsletterContext = {
            mentionedJid: [m.sender].filter(Boolean),
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: channel.jid,
                newsletterName: channel.name,
                serverMessageId: 143
            }
        };

        // 🆕 ".menu <category>" — sirf us category ki commands, ek hi message mein
        const wanted = String(ctx.text || ctx.q || (ctx.args || []).join(" ") || "").trim().toLowerCase().replace(/^\S+/, w => CAT_ALIAS[w] || w);
        const catListText = () => {
            // Pehla harf bold (𝐀), baqi small-caps (ᴅᴍɪɴ)  ->  .𝐀ᴅᴍɪɴ
            const boldFirst = (ch) => /[a-z]/i.test(ch) ? String.fromCodePoint(0x1D400 + ch.toUpperCase().charCodeAt(0) - 65) : ch;
            const pretty = (c) => PREFIX + boldFirst(c[0]) + toSmallCaps(c.slice(1));
            const SHOW_ORDER = LIST_ORDER;
            const ordered = [
                ...SHOW_ORDER.filter(c => cats.includes(c)),
                ...cats.filter(c => !SHOW_ORDER.includes(c))
            ];
            const rowSizes = [2, 2, 3, 3, 3, 3]; // phir 3-3 har line mein
            const rows = [];
            for (let i = 0, r = 0; i < ordered.length; r++) {
                const n = rowSizes[r] || 3;
                rows.push("┃" + ordered.slice(i, i + n).map(pretty).join(" "));
                i += n;
            }
            return [
                "╭╍═❲ 𝗖𝗔𝗧𝗘𝗚𝗢𝗥𝗜𝗘𝗦",
                ...rows,
                "╰╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍┈⊷",
                "",
                `> ${PREFIX}menu all ➜ sari commands`,
                `> ${FOOTER}`
            ].join("\n");
        };
        if (wanted === "list" || wanted === "categories" || wanted === "category") {
            return conn.sendMessage(from, { text: catListText(), contextInfo: newsletterContext }, { quoted: mek });
        }
        const showAll = ["all", "full", "allmenu"].includes(wanted);
        if (wanted && !showAll) {
            const match = cats.find(c => c === wanted) || cats.find(c => c.startsWith(wanted));
            if (!match) {
                return ctx.reply(`❌ *${wanted}* naam ki category nahi mili.\n\nAvailable: ${cats.map(toSmallCaps).join(", ")}\n\nType *${PREFIX}menu* to see all categories.`);
            }
            const list = grouped[match].slice();
            if (DESIGN.SORT_COMMANDS) list.sort((x, y) => x.name.localeCompare(y.name));
            const useStatic = DESIGN.USE_STATIC_MENU && staticBlocks(match).length;
            const blocks = splitBlocks(useStatic ? staticBlocks(match) : formatCategoryParts(match, list, PREFIX, DESIGN.MAX_CHARS), DESIGN.MAX_CHARS);
            if (blocks.length) blocks[blocks.length - 1] += `\n\n> ${FOOTER}`; else blocks.push(`> ${FOOTER}`);
            for (let i = 0; i < blocks.length; i++) {
                const last = i === blocks.length - 1;
                await conn.sendMessage(from, { text: blocks[i], contextInfo: last ? newsletterContext : undefined }, { quoted: mek });
            }
            return;
        }

        // DEFAULT ".menu" — header + SARI commands category ke hisaab se (".menu list" = sirf categories)
        const header = fill(DESIGN.HEADER, {
            BOT: BOT_NAME, OWNER: OWNER_NAME, PLATFORM: "WHATSAPP", PREFIX, UPTIME: shortUptime(process.uptime()),
            COUNT: totalCommands, MODE, VERSION
        });
        const fullBlocks = DESIGN.USE_STATIC_MENU ? staticBlocks() : cats.flatMap(c => {
            const list = grouped[c].slice();
            if (DESIGN.SORT_COMMANDS) list.sort((x, y) => x.name.localeCompare(y.name));
            return formatCategoryParts(c, list, PREFIX, DESIGN.MAX_CHARS);
        }).filter(Boolean);
        const fullChunks = splitBlocks(fullBlocks, DESIGN.MAX_CHARS)
            .map((t, i) => (i === 0 ? `${fill(DESIGN.ALL_TITLE, { TITLE: toBold(DESIGN.ALL_TITLE_TEXT) })}\n\n` : "") + t + `\n\n> ${FOOTER}`);
        
        // 1) menu photo + chhota header (caption chhota rakha taake image kabhi fail na ho)
        try {
            await conn.sendMessage(from, { image: { url: MENU_IMAGE_URL }, caption: header, contextInfo: newsletterContext, __noFooter: true }, { quoted: mek });
        } catch (e) {
            console.log("Menu image error:", e.message);
            try {
                await conn.sendMessage(from, { image: getBotPic(conn), caption: header, contextInfo: newsletterContext, __noFooter: true }, { quoted: mek });
            } catch (e2) {
                await conn.sendMessage(from, { text: header, contextInfo: newsletterContext, __noFooter: true }, { quoted: mek });
            }
        }

        // 2) sari commands (ek ya zyada messages; har message ke neeche footer)
        if (showAll) {
            for (let i = 0; i < fullChunks.length; i++) {
                const last = i === fullChunks.length - 1;
                await conn.sendMessage(from, { text: fullChunks[i], contextInfo: last ? newsletterContext : undefined });
            }
        } else {
            await conn.sendMessage(from, { text: catListText(), contextInfo: newsletterContext });
        }

        // menu voice (random mp3 from data/menu-voice) — background mein
        const audioPath = getRandomAudio();
        if (audioPath) {
            conn.sendMessage(from, { audio: { url: audioPath }, mimetype: "audio/mp4", ptt: true }, { quoted: mek })
                .catch(err => console.log("Menu audio error:", err.message));
        }
    } catch (e) {
        console.error("AllMenu Error:", e);
        try { await ctx.reply("❌ Menu error: " + e.message); } catch (_) {}
    }
});

// ═══════════════════════════════════════════════════════════
//  📋 SARI COMMANDS KI LIST — har line seedhi text hai, jahan chahein khud badlein
//  • Kisi command ki line badalni ho / hatani ho / nayi lagani ho to seedha yahan edit karein
//  • Har { cat, text } ek message ka box hai. Lambi category (tools) kai poore boxes mein hai
//  • DESIGN.USE_STATIC_MENU = false karein to ye list chhod kar menu khud auto banega
//  • Nayi command plugin mein add karein to yahan bhi ek line add karein (ya auto mode on karein)
// ═══════════════════════════════════════════════════════════
const MENU_BLOCKS = [
    { cat: "tools", text: `┏━═❲ 𝐓𝐎𝐎𝐋𝐒
┋╭┈⌖ 𝙰ᴄᴛɪᴠᴇᴛɪᴍᴇ
┋├┈⌖ 𝙰ɪʀᴘᴏʀᴛ
┋├┈⌖ 𝙰ɴᴀɢʀᴀᴍ
┋├┈⌖ 𝙰ʀᴄᴀᴅᴅ <ʟɪɴᴋ>
┋├┈⌖ 𝙰sᴄɪɪ
┋├┈⌖ 𝙰ᴜᴛᴏʀᴇᴀᴄᴛ-ᴏғғ <ᴊɪᴅ>
┋├┈⌖ 𝙰ᴜᴛᴏʀᴇᴀᴄᴛ-ᴏɴ <ᴊɪᴅ>
┋├┈⌖ 𝙱64
┋├┈⌖ 𝙱ᴀsᴇ64
┋├┈⌖ 𝙱ɪɴᴀʀʏ
┋├┈⌖ 𝙱ᴍɪ
┋├┈⌖ 𝙱ᴏʟᴅ <ᴛᴇxᴛ>
┋├┈⌖ 𝙱ᴏᴛsᴄʀɪᴘᴛ
┋├┈⌖ 𝙱ᴜʙʙʟᴇ <ᴛᴇxᴛ>
┋├┈⌖ 𝙲ᴀᴘɪᴛᴀʟ
┋├┈⌖ 𝙲ʜᴀɴɴᴇʟsᴛᴀᴛᴜs <ᴊɪᴅ>
┋├┈⌖ 𝙲ʜᴀᴛᴀɴᴀʟʏsɪs
┋├┈⌖ 𝙲ʜᴇᴄᴋɴᴜᴍ
┋├┈⌖ 𝙲ʜsᴛᴀᴛᴀᴜᴛᴏ <ᴊɪᴅ>
┋├┈⌖ 𝙲ʜsᴛᴀᴛʙᴜʟᴋ <ᴊɪᴅs>
┋├┈⌖ 𝙲ʜsᴛᴀᴛғᴏʀᴡᴀʀᴅ <ᴊɪᴅ>
┋├┈⌖ 𝙲ʜsᴛᴀᴛɪᴍɢ <ᴊɪᴅ>
┋├┈⌖ 𝙲ʜsᴛᴀᴛʟɪsᴛ
┋├┈⌖ 𝙲ʜsᴛᴀᴛʀᴇᴀᴄᴛ <ᴊɪᴅ> <ɪᴅ>
┋├┈⌖ 𝙲ʜsᴛᴀᴛʀᴇᴍɪɴᴅ <ᴊɪᴅ>
┋├┈⌖ 𝙲ʜsᴛᴀᴛsᴛɪᴄᴋᴇʀ <ᴊɪᴅ>
┋├┈⌖ 𝙲ʜsᴛᴀᴛᴠɪᴅ <ᴊɪᴅ>
┋├┈⌖ 𝙲ɪʀᴄʟᴇᴅ <ᴛᴇxᴛ>
┋├┈⌖ 𝙲ᴏɴғᴜsᴇᴅ
┋├┈⌖ 𝙲ᴏᴜɴᴛ
┋├┈⌖ 𝙲ᴏᴜɴᴛʀʏɪɴғᴏ
┋├┈⌖ 𝙲ᴜʀʀᴇɴᴄʏ
┋├┈⌖ 𝙲ᴜʀsɪᴠᴇ <ᴛᴇxᴛ>
┋├┈⌖ 𝙳ᴀʏɪɴғᴏ
┋├┈⌖ 𝙳ᴇғɪɴᴇ
┋├┈⌖ 𝙳ᴏᴜʙʟᴇ <ᴛᴇxᴛ>
┋├┈⌖ 𝙴xᴘᴇɴsᴇ <ᴀᴍᴏᴜɴᴛ> <ɪᴛᴇᴍ>
┋├┈⌖ 𝙵ᴀᴋᴇᴄʜᴀᴛ
┋├┈⌖ 𝙵ᴀɴᴄʏᴛᴇxᴛ
┋├┈⌖ 𝙵ʟᴀɢ
┋├┈⌖ 𝙵ᴏʀᴇᴄᴀsᴛ
┋├┈⌖ 𝙵ʀᴏᴍʙɪɴ
┋├┈⌖ 𝙵ᴜʟʟᴡɪᴅᴛʜ <ᴛᴇxᴛ>
┋├┈⌖ 𝙶ᴇɴᴘᴀss
┋├┈⌖ 𝙶ɪᴛʜᴜʙ
┋├┈⌖ 𝙶ᴏʟᴅʀᴀᴛᴇ
┋├┈⌖ 𝙷ᴀʙɪᴛ <ɴᴀᴍᴇ> <ɴᴀᴍᴇ>
┋├┈⌖ 𝙷ᴇᴀʀᴛ
┋├┈⌖ 𝙷ᴏᴛ
┋├┈⌖ 𝙸ɴᴠᴇʀᴛᴇᴅ <ᴛᴇxᴛ>
┋├┈⌖ 𝙸ᴘ2
┋├┈⌖ 𝙸ᴘʟᴏᴏᴋᴜᴘ
┋├┈⌖ 𝙸ᴛᴀʟɪᴄ <ᴛᴇxᴛ>
┋├┈⌖ 𝙻ᴀɴɢᴜᴀɢᴇs
┋├┈⌖ 𝙻ᴇɴɢᴛʜ
┋├┈⌖ 𝙻ᴏᴡᴇʀᴄᴀsᴇ
┋├┈⌖ 𝙼ᴏɴᴏsᴘᴀᴄᴇ <ᴛᴇxᴛ>
┋├┈⌖ 𝙼ᴏʀsᴇ
┋├┈⌖ 𝙽ɪᴋᴀʟ
┋├┈⌖ 𝙿ᴀʟɪɴᴅʀᴏᴍᴇ
┋├┈⌖ 𝙿ᴀssᴡᴏʀᴅ2
┋├┈⌖ 𝙿ᴇᴛʀᴏʟ
┋├┈⌖ 𝙿ᴏᴘᴜʟᴀᴛɪᴏɴ
┋├┈⌖ 𝚀ʀᴄᴏᴅᴇ
┋├┈⌖ 𝚁ᴀɴᴅᴏᴍʟɪɴᴇ
┋├┈⌖ 𝚁ᴇᴍɪɴᴅ
┋├┈⌖ 𝚁ᴇᴍɪɴᴅᴍᴇ <ᴛᴇxᴛ>
┋├┈⌖ 𝚁ᴇᴍᴏᴠᴇᴅᴜᴘ
┋├┈⌖ 𝚁ᴇᴍᴏᴠᴇᴘᴘ
┋├┈⌖ 𝚁ᴇᴘʟᴀᴄᴇ
┋├┈⌖ 𝚁ᴇᴘᴏʀᴛ <ɴᴜᴍ> <ᴛᴇxᴛ>
┋├┈⌖ 𝚁ᴇᴘᴏʀᴛᴄᴀʀᴅɪɴɢ <ʟɪɴᴋ>
┋├┈⌖ 𝚁ᴇᴘᴏʀᴛɢᴜɪᴅᴇ
┋├┈⌖ 𝚁ᴇᴘᴏʀᴛsᴄᴀᴍ <ɴᴜᴍ> <ɴᴀᴍᴇ>
┋├┈⌖ 𝚁ᴇᴘᴏʀᴛsᴄᴀᴍᴄʜᴀɴɴᴇʟ
┋├┈⌖ 𝚁ɴᴜᴍ
┋├┈⌖ 𝚂ᴄʀᴇᴇɴsʜᴏᴛ
┋├┈⌖ 𝚂ᴄʀɪᴘᴛ <ᴛᴇxᴛ>
┋├┈⌖ 𝚂ᴇᴛᴀʟʟ
┋├┈⌖ 𝚂ᴇᴛʙᴏᴛɴᴀᴍᴇ
┋├┈⌖ 𝚂ᴇᴛᴘᴘ
┋├┈⌖ 𝚂ᴇᴛsᴛᴀᴛᴜs
┋├┈⌖ 𝚂ʜᴏʀᴛ2
┋├┈⌖ 𝚂ʜᴏʀᴛᴜʀʟ
┋├┈⌖ 𝚂ʜʏ
┋├┈⌖ 𝚂ɪᴍ
┋├┈⌖ 𝚂ᴍᴀʟʟᴄᴀᴘs <ᴛᴇxᴛ>
┋├┈⌖ 𝚂ᴏʀᴛᴛᴇxᴛ
┋├┈⌖ 𝚂ǫᴜᴀʀᴇᴅ <ᴛᴇxᴛ>
┋├┈⌖ 𝚂ᴛʏʟᴇ <ᴛᴇxᴛ>
┋├┈⌖ 𝚂ᴜɴʀɪsᴇsᴇᴛ
┋├┈⌖ 𝚃ɪᴍᴇʀ
┋├┈⌖ 𝚃ɪᴍᴇᴢᴏɴᴇ
┋├┈⌖ 𝚃ᴏʙɪɴ
┋├┈⌖ 𝚃ᴏᴅᴏ <ᴛᴀsᴋ> <ɴᴜᴍ>
┋├┈⌖ 𝚃ᴏᴘᴡᴏʀᴅs
┋├┈⌖ 𝚃ʀᴀɴsʟᴀᴛᴇ
┋├┈⌖ 𝚃ᴛs <ᴠᴏɪᴄᴇ> <ᴛᴇxᴛ>
┋├┈⌖ 𝚄ɴʙᴀɴ <ɴᴜᴍ>
┋├┈⌖ 𝚄ɴʙᴀɴʜᴀʀᴅ <ɴᴜᴍ> <ɴᴀᴍᴇ>
┋├┈⌖ 𝚄ɴɪᴛ
┋├┈⌖ 𝚄ᴘᴘᴇʀᴄᴀsᴇ
┋├┈⌖ 𝚅ᴏɪᴄᴇs
┋├┈⌖ 𝚅ᴠ2
┋├┈⌖ 𝚆ᴀᴛᴇʀɪɴᴛᴀᴋᴇ
┋├┈⌖ 𝚆ᴇᴀᴛʜᴇʀ
┋├┈⌖ 𝚆ᴇᴀᴛʜᴇʀᴡᴇᴇᴋ
┋├┈⌖ 𝚆ᴇʙsʜᴏᴛ
┋├┈⌖ 𝚆ɪᴋɪ
┋├┈⌖ 𝚆ᴏʀᴅᴄᴏᴜɴᴛ <ᴛᴇxᴛ>
┋╰┈⌖ 𝚆ᴏʀʟᴅᴛɪᴍᴇ
┗───────────────────𒁍` },

    { cat: "owner", text: `┏━═❲ 𝐎𝐖𝐍𝐄𝐑
┋╭┈⌖ 𝙰ɴᴛɪ-ᴄᴀʟʟ
┋├┈⌖ 𝙰ᴜᴛᴏʙɪᴏ
┋├┈⌖ 𝙱ᴀɴʟɪsᴛ
┋├┈⌖ 𝙱ᴏᴛʜᴇᴀʟᴛʜ
┋├┈⌖ 𝙱ᴏᴛɴᴏᴛɪᴄᴇ <ᴛᴇxᴛ>
┋├┈⌖ 𝙱ᴏᴛᴘᴀᴜsᴇ
┋├┈⌖ 𝙱ᴏᴛʀᴇsᴜᴍᴇ
┋├┈⌖ 𝙱ᴏᴛsᴛᴀᴛs
┋├┈⌖ 𝙱ʀᴏᴀᴅᴄᴀsᴛ2 <ᴛᴇxᴛ>
┋├┈⌖ 𝙲ᴘᴜɪɴғᴏ
┋├┈⌖ 𝙳ᴇʟᴘʀᴏᴍᴏ <ᴄᴏᴅᴇ>
┋├┈⌖ 𝙴ɴᴅ
┋├┈⌖ 𝙴ᴠᴀʟ2
┋├┈⌖ 𝙵ᴏʀᴡᴀʀᴅᴀʟʟ
┋├┈⌖ 𝙺ɪᴄᴋ
┋├┈⌖ 𝙺ɪʟʟᴀʟʟ
┋├┈⌖ 𝙻ᴇᴀᴠᴇ
┋├┈⌖ 𝙻ᴏᴄᴋɢʀᴏᴜᴘ
┋├┈⌖ 𝙻ᴏɢs
┋├┈⌖ 𝙼ᴀɪɴᴛᴇɴᴀɴᴄᴇ
┋├┈⌖ 𝙼ᴇᴍᴏʀʏ
┋├┈⌖ 𝙾ᴡɴᴇʀ
┋├┈⌖ 𝙾ᴡɴᴇʀʜᴇʟᴘ
┋├┈⌖ 𝙾ᴡɴᴇʀʜᴜʙ
┋├┈⌖ 𝙿ʟᴜɢɪɴsᴄᴀɴ
┋├┈⌖ 𝙿ʀᴏᴍᴏ <ᴄᴏᴅᴇ>
┋├┈⌖ 𝙿ʀᴏᴍᴏʟɪsᴛ
┋├┈⌖ 𝚁ᴇsᴇᴛʙᴏᴛᴘɪᴄ
┋├┈⌖ 𝚁ᴇsᴛᴀʀᴛ
┋├┈⌖ 𝚂ᴀʏ <ɴᴜᴍ> <ᴛᴇxᴛ>
┋├┈⌖ 𝚂ᴇɴᴅᴛᴏ <ᴛᴇxᴛ>
┋├┈⌖ 𝚂ᴇʀᴠᴇʀɪɴғᴏ
┋├┈⌖ 𝚂ᴇssɪᴏɴs
┋├┈⌖ 𝚂ᴇᴛʙᴏᴛᴘɪᴄ <ʟɪɴᴋ>
┋├┈⌖ 𝚂ᴇᴛᴅᴇsᴄ <ᴛᴇxᴛ>
┋├┈⌖ 𝚂ᴇᴛɴᴀᴍᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝚂ᴇᴛᴘʀᴇғɪx
┋├┈⌖ 𝚄ɴʙʟᴏᴄᴋ
┋├┈⌖ 𝚄ɴʟᴏᴄᴋɢʀᴏᴜᴘ
┋├┈⌖ 𝚄sᴀɢᴇsᴛᴀᴛs
┋├┈⌖ 𝚄sᴇʀʙᴀɴ <ʀᴇᴀsᴏɴ>
┋├┈⌖ 𝚄sᴇʀᴜɴʙᴀɴ
┋╰┈⌖ 𝚅ᴠ
┗───────────────────𒁍` },

    { cat: "utility", text: `┏━═❲ 𝐀𝐍𝐈𝐌𝐄
┋╭┈⌖ 𝙰ɴɪᴍᴇᴀɪʀɪɴɢ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇʙʏʏᴇᴀʀ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴄʜᴀʀᴀᴄᴛᴇʀs <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴄᴜᴅᴅʟᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴅᴀɴᴄᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴇᴘɪsᴏᴅᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇғᴀᴄᴛs <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇɢᴇɴʀᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇɢᴇɴʀᴇs <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇʜᴀɴᴅʜᴏʟᴅ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇʜᴀᴘᴘʏ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇʜᴇʟᴘ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇʜɪɢʜғɪᴠᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇʜᴜɢ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇɪɴғᴏ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴋɪss <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴍᴀɴɢᴀ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴍᴏᴠɪᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴏᴠᴀ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴘᴀᴛ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴘᴇᴏᴘʟᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴘɪᴄᴛᴜʀᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇǫᴜᴏᴛᴇ
┋├┈⌖ 𝙰ɴɪᴍᴇsᴇᴀʀᴄʜ
┋├┈⌖ 𝙰ɴɪᴍᴇsᴇᴀsᴏɴ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇsᴍɪʟᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇsᴘᴇᴄɪᴀʟ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴛᴏᴘ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴛʀᴀɪʟᴇʀ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴜᴘᴄᴏᴍɪɴɢ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴠɪᴅᴇᴏ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴠᴏɪᴄᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴡᴀʟʟ
┋├┈⌖ 𝙰ɴɪᴍᴇᴡᴀᴠᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴡɪɴᴋ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙽ᴇᴋᴏ
┋╰┈⌖ 𝚆ᴀɪғᴜ
┗───────────────────𒁍` },

    { cat: "group", text: `┏━═❲ 𝐆𝐑𝐎𝐔𝐏
┋╭┈⌖ 𝙰ᴄᴄᴇᴘᴛᴀʟʟ
┋├┈⌖ 𝙰ᴅᴅ
┋├┈⌖ 𝙰ᴅᴅᴍᴇᴍʙᴇʀ
┋├┈⌖ 𝙰ᴅᴅᴍᴇᴍʙᴇʀ2
┋├┈⌖ 𝙰ᴅᴅᴍᴇᴍʙᴇʀ3
┋├┈⌖ 𝙰ᴅᴍɪɴᴄʜᴇᴄᴋ
┋├┈⌖ 𝙰ᴅᴍɪɴs
┋├┈⌖ 𝙰ɴᴛɪʟɪɴᴋ
┋├┈⌖ 𝙰ɴᴛɪʟɪɴᴋʀᴇsᴇᴛ
┋├┈⌖ 𝙱ᴏᴛᴀᴅᴍɪɴ
┋├┈⌖ 𝙳ᴇᴍᴏᴛᴇ
┋├┈⌖ 𝙶ɪɴᴠɪᴛᴇ
┋├┈⌖ 𝙶ᴏᴏᴅʙʏᴇ
┋├┈⌖ 𝙶ʀᴇᴠᴏᴋᴇ
┋├┈⌖ 𝙶ʀᴏᴜᴘɪɴғᴏ
┋├┈⌖ 𝙶ʀᴏᴜᴘsᴛᴀᴛs
┋├┈⌖ 𝙶ʀᴏᴜᴘsᴛᴀᴛᴜs
┋├┈⌖ 𝙷ɪᴅᴇᴛᴀɢ
┋├┈⌖ 𝙺ɪᴄᴋᴀʟʟ
┋├┈⌖ 𝙻ᴏᴄᴋ
┋├┈⌖ 𝙿ᴏʟʟ
┋├┈⌖ 𝙿ʀᴏᴍᴏᴛᴇ
┋├┈⌖ 𝚁ᴇᴊᴇᴄᴛᴀʟʟ
┋├┈⌖ 𝚁ᴇᴍᴏᴠᴇᴀᴅᴍɪɴs
┋├┈⌖ 𝚁ᴇǫᴜᴇsᴛʟɪsᴛ
┋├┈⌖ 𝚁ᴇsᴇᴛᴡᴀʀɴ
┋├┈⌖ 𝚂ᴇᴛɢᴅᴇsᴄ <ᴛᴇxᴛ>
┋├┈⌖ 𝚂ᴇᴛɢɴᴀᴍᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝚂ᴇᴛɢᴏᴏᴅʙʏᴇ
┋├┈⌖ 𝚂ᴇᴛsʜᴀʏᴀʀɪ <ᴛᴇxᴛ>
┋├┈⌖ 𝚂ᴇᴛᴡᴇʟᴄᴏᴍᴇ
┋├┈⌖ 𝚂ʜᴀʏᴀʀɪ
┋├┈⌖ 𝚂ɪʟᴇɴᴛᴛᴀɢ <ᴛᴇxᴛ>
┋├┈⌖ 𝚃ᴀɢᴀʟʟ
┋├┈⌖ 𝚃ᴇsᴛɢᴏᴏᴅʙʏᴇ
┋├┈⌖ 𝚃ᴇsᴛᴡᴇʟᴄᴏᴍᴇ
┋├┈⌖ 𝚃ᴏᴘᴀᴄᴛɪᴠᴇ
┋├┈⌖ 𝚄ɴʟᴏᴄᴋ
┋├┈⌖ 𝚆ᴀʀɴ
┋├┈⌖ 𝚆ᴀʀɴs
┋├┈⌖ 𝚆ᴇʟᴄᴏᴍᴇ
┋├┈⌖ 𝚆ᴇʟᴄᴏᴍᴇғᴏɴᴛ
┋├┈⌖ 𝚆ᴇʟᴄᴏᴍᴇɪɴғᴏ
┋╰┈⌖ 𝚆ᴇʟᴄᴏᴍᴇᴘɪᴄ
┗───────────────────𒁍` },

    { cat: "main", text: `┏━═❲ 𝐌𝐀𝐈𝐍
┋╭┈⌖ 𝙰ɪ <ǫᴜᴇsᴛɪᴏɴ>
┋├┈⌖ 𝙰ʟɪᴠᴇ
┋├┈⌖ 𝙾ɴʟɪɴᴇ
┋╰┈⌖ 𝙿ɪɴɢ
┗───────────────────𒁍` },

    { cat: "fun", text: `┏━═❲ 𝐅𝐔𝐍
┋╭┈⌖ 8ʙᴀʟʟ
┋├┈⌖ 𝙰ʙᴄᴅ
┋├┈⌖ 𝙰ᴅᴠɪᴄᴇ
┋├┈⌖ 𝙰ɢᴇ
┋├┈⌖ 𝚂ᴀǫɪʙᴊᴀɢᴀʀ
┋├┈⌖ 𝚂ᴀǫɪʙᴋɪᴊᴀɴ
┋├┈⌖ 𝙰ɴɪᴍᴇ <ᴄʜᴀʀᴀᴄᴛᴇ>
┋├┈⌖ 𝙰ɴɪᴍᴇɢɪғ <ᴄᴀᴛ>
┋├┈⌖ 𝙰ɴɪᴍᴇᴛᴀɢ <ᴛᴀɢ>
┋├┈⌖ 𝙲ᴀᴛ
┋├┈⌖ 𝙲ʜᴏᴏsᴇ
┋├┈⌖ 𝙲ʜᴜᴄᴋɴᴏʀʀɪs
┋├┈⌖ 𝙲ᴏɪɴғʟɪᴘ
┋├┈⌖ 𝙲ᴏʟᴏʀ
┋├┈⌖ 𝙲ᴏᴍᴘʟɪᴍᴇɴᴛ
┋├┈⌖ 𝙲ᴏᴍᴘʟɪᴍᴇɴᴛ2
┋├┈⌖ 𝙲ᴏᴜɴᴛ123
┋├┈⌖ 𝙳ᴀʀᴇ
┋├┈⌖ 𝙳ᴀʀᴇ2
┋├┈⌖ 𝙳ɪᴄᴇ
┋├┈⌖ 𝙳ᴏɢ
┋├┈⌖ 𝙳ᴜᴇʟ
┋├┈⌖ 𝙵ᴏʀᴛᴜɴᴇ
┋├┈⌖ 𝙵ᴏx
┋├┈⌖ 𝙶ᴀʏᴍᴇᴛᴇʀ
┋├┈⌖ 𝙶ᴏᴏᴅᴍᴏʀɴɪɴɢ
┋├┈⌖ 𝙶ᴏᴏᴅɴɪɢʜᴛ
┋├┈⌖ 𝙷ᴀᴄᴋ
┋├┈⌖ 𝙷ᴏᴡɢᴀʏ
┋├┈⌖ 𝙷ᴜsʙᴀɴᴅᴏ
┋├┈⌖ 𝙸ɴsᴜʟᴛ
┋├┈⌖ 𝙹ᴀʀᴠɪs <ᴛᴇxᴛ>
┋├┈⌖ 𝙹ᴏᴋᴇ
┋├┈⌖ 𝙹ᴏᴋᴇ2
┋├┈⌖ 𝙺ɪʟʟ
┋├┈⌖ 𝙺ɪss
┋├┈⌖ 𝙻ɪᴠᴇsᴄᴏʀᴇ
┋├┈⌖ 𝙻ᴏᴠᴇʙʜᴀɪ
┋├┈⌖ 𝙼ᴀᴛʜsᴘᴇᴇᴅ
┋├┈⌖ 𝙼ᴇᴍᴇ
┋├┈⌖ 𝙼ᴇᴍᴏʀʏɢᴀᴍᴇ
┋├┈⌖ 𝙼ᴏᴏɴ
┋├┈⌖ 𝙽ᴇᴠᴇʀʜᴀᴠᴇ
┋├┈⌖ 𝙽ɪᴄᴋɴᴀᴍᴇ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙿ᴀɴᴅᴀ
┋├┈⌖ 𝙿ɪᴄᴋᴜᴘ
┋├┈⌖ 𝙿ᴜɴᴄʜ
┋├┈⌖ 𝙿ᴜɴᴊᴀʙɪ
┋├┈⌖ 𝚀ᴜɪᴢ
┋├┈⌖ 𝚀ᴜᴏᴛᴇ2
┋├┈⌖ 𝚁ᴀᴊᴜ <ᴛᴇxᴛ>
┋├┈⌖ 𝚁ᴀɴᴅᴏᴍ
┋├┈⌖ 𝚁ᴀɴᴅᴏᴍᴀɴɪᴍᴇ
┋├┈⌖ 𝚁ᴀɴᴅᴏᴍᴘɪᴄ
┋├┈⌖ 𝚁ᴀᴛᴇ
┋├┈⌖ 𝚁ᴇᴀᴄᴛɪᴏɴᴛᴇsᴛ
┋├┈⌖ 𝚁ɪᴅᴅʟᴇ
┋├┈⌖ 𝚁ʟᴇᴛᴛᴇʀ
┋├┈⌖ 𝚁ᴏᴀsᴛ
┋├┈⌖ 𝚂ʜᴀʏᴀʀɪ2
┋├┈⌖ 𝚂ʟᴀᴘ
┋├┈⌖ 𝚂ʟᴏɢᴀɴ
┋├┈⌖ 𝚃ᴀɢᴍᴇ <ᴛᴇxᴛ>
┋├┈⌖ 𝚃ʜᴇᴍᴇ
┋├┈⌖ 𝚃ʀᴀᴠᴇʟᴛɪᴘ
┋├┈⌖ 𝚃ʀɪᴠɪᴀ
┋├┈⌖ 𝚃ʀᴜᴛʜ
┋├┈⌖ 𝚃ʀᴜᴛʜ2
┋├┈⌖ 𝚃ʏᴘɪɴɢᴛᴇsᴛ
┋├┈⌖ 𝚆ᴏʀᴅᴄʜᴀɪɴ
┋├┈⌖ 𝚆ᴏᴜʟᴅʏᴏᴜ
┋├┈⌖ 𝚆ᴏᴜʟᴅʏᴏᴜʀᴀᴛʜᴇʀ
┋├┈⌖ 𝚈ᴇsɴᴏ
┋╰┈⌖ 𝚉ᴏᴅɪᴀᴄsɪɢɴ
┗───────────────────𒁍` },

    { cat: "utility", text: `┏━═❲ 𝐄𝐌𝐎𝐓𝐈𝐎𝐍𝐒
┋╭┈⌖ 𝙰ғғɪʀᴍᴀᴛɪᴏɴ
┋├┈⌖ 𝙰ɴɢʀʏ
┋├┈⌖ 𝙱ɪᴛᴇ
┋├┈⌖ 𝙱ʟᴜsʜ
┋├┈⌖ 𝙱ᴏɴᴋ
┋├┈⌖ 𝙱ᴏʀᴇᴅ
┋├┈⌖ 𝙲ᴏᴍғᴏʀᴛ
┋├┈⌖ 𝙲ʀɪɴɢᴇ
┋├┈⌖ 𝙲ʀʏ
┋├┈⌖ 𝙲ᴜᴅᴅʟᴇ
┋├┈⌖ 𝙳ᴀɴᴄᴇ
┋├┈⌖ 𝙴ᴍᴏᴛɪᴏɴ
┋├┈⌖ 𝙵ᴀᴄᴇᴘᴀʟᴍ
┋├┈⌖ 𝙵ᴇᴇʟɪɴɢs
┋├┈⌖ 𝙷ᴀɴᴅʜᴏʟᴅ
┋├┈⌖ 𝙷ᴀᴘᴘʏ
┋├┈⌖ 𝙷ɪɢʜғɪᴠᴇ
┋├┈⌖ 𝙻ᴀᴜɢʜ
┋├┈⌖ 𝙻ᴜʀᴋ
┋├┈⌖ 𝙼ᴏᴏᴅ
┋├┈⌖ 𝙽ᴏᴅ
┋├┈⌖ 𝙽ᴏᴍ
┋├┈⌖ 𝙽ᴏᴘᴇ
┋├┈⌖ 𝙿ᴀᴛ
┋├┈⌖ 𝙿ᴏᴋᴇ
┋├┈⌖ 𝙿ᴏᴜᴛ
┋├┈⌖ 𝚂ᴀᴅ
┋├┈⌖ 𝚂ʜᴏᴏᴛ
┋├┈⌖ 𝚂ʜʀᴜɢ
┋├┈⌖ 𝚂ʟᴇᴇᴘ
┋├┈⌖ 𝚂ᴍɪʟᴇ
┋├┈⌖ 𝚂ᴍᴜɢ
┋├┈⌖ 𝚂ᴛᴀʀᴇ
┋├┈⌖ 𝚃ʜɪɴᴋ
┋├┈⌖ 𝚃ʜᴜᴍʙsᴜᴘ
┋├┈⌖ 𝚃ɪᴄᴋʟᴇ
┋├┈⌖ 𝚆ᴀᴠᴇ
┋├┈⌖ 𝚆ɪɴᴋ
┋├┈⌖ 𝚈ᴀᴡɴ
┋╰┈⌖ 𝚈ᴇᴇᴛ
┗───────────────────𒁍` },

    { cat: "tools", text: `┏━═❲ 𝐈𝐌𝐀𝐆𝐄
┋╭┈⌖ 𝙰ᴛᴛᴘ <ᴛᴇxᴛ>
┋├┈⌖ 𝙱ʟᴜʀ
┋├┈⌖ 𝙴ᴍᴏᴊɪᴍɪx
┋├┈⌖ 𝙵ʟɪᴘ
┋├┈⌖ 𝙼ᴇᴍᴇᴍᴀᴋᴇʀ <ᴛᴇxᴛ>
┋├┈⌖ 𝚂ᴇᴘɪᴀ
┋├┈⌖ 𝚂ᴛɪᴄᴋᴇʀɪɴғᴏ
┋├┈⌖ 𝚂ᴛɪᴄᴋᴇʀᴘᴀᴄᴋ <ɴᴀᴍᴇ>
┋╰┈⌖ 𝚆ᴀᴛᴇʀᴍᴀʀᴋ <ᴛᴇxᴛ>
┗───────────────────𒁍` },

    { cat: "download", text: `┏━═❲ 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃
┋╭┈⌖ 𝙰ᴘᴋ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙳ʀᴀᴍᴀ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙵ʙ
┋├┈⌖ 𝙸ɢ3 <ʟɪɴᴋ>
┋├┈⌖ 𝙸ɢᴅʟ <ʟɪɴᴋ>
┋├┈⌖ 𝙸ɢᴅʟ2 <ʟɪɴᴋ>
┋├┈⌖ 𝙸ɢᴅʟ4 <ʟɪɴᴋ>
┋├┈⌖ 𝙿ᴀɪʀ
┋├┈⌖ 𝙿ᴀɪʀ2
┋├┈⌖ 𝙿ɪɴᴛᴇʀᴇsᴛ <ʟɪɴᴋ>
┋├┈⌖ 𝚂ᴏɴɢ <ɴᴀᴍᴇ>
┋├┈⌖ 𝚃ɪᴋᴛᴏᴋ <ʟɪɴᴋ>
┋├┈⌖ 𝚅ɪᴅᴇᴏ <ʟɪɴᴋ>
┋╰┈⌖ 𝚈ᴛs <ɴᴀᴍᴇ>
┗───────────────────𒁍` },

    { cat: "extra", text: `┏━═❲ 𝐋𝐎𝐕𝐄
┋╭┈⌖ 𝙲ʀᴜsʜ
┋├┈⌖ 𝙷ᴜɢ
┋├┈⌖ 𝙻ᴏᴠᴇ
┋├┈⌖ 𝙻ᴏᴠᴇᴍᴇᴛᴇʀ
┋╰┈⌖ 𝚂ʜɪᴘ
┗───────────────────𒁍` },

    { cat: "utility", text: `┏━═❲ 𝐒𝐘𝐒𝐓𝐄𝐌
┋╭┈⌖ 𝙼ᴀᴛʜᴄʜᴇᴄᴋ
┋├┈⌖ 𝙼ᴇᴍᴏʀʏᴄʜᴇᴄᴋ
┋├┈⌖ 𝙼ᴇɴᴜ <ᴄᴀᴛ>
┋├┈⌖ 𝚁ᴇᴀᴄᴛɪᴏɴᴄʜᴇᴄᴋ
┋├┈⌖ 𝚃ʀɪᴠɪᴀᴄʜᴇᴄᴋ
┋╰┈⌖ 𝚃ʏᴘɪɴɢᴄʜᴇᴄᴋ
┗───────────────────𒁍` },

    { cat: "utility", text: `┏━═❲ 𝐔𝐓𝐈𝐋𝐈𝐓𝐘
┋╭┈⌖ 𝙱ᴀsᴇ64ᴅᴇᴄ
┋├┈⌖ 𝙱ᴀsᴇ64ᴇɴᴄ
┋├┈⌖ 𝙱ᴏᴛɪɴғᴏ
┋├┈⌖ 𝙲ᴀʟᴄ
┋├┈⌖ 𝙲ʜᴀʀᴄᴏᴜɴᴛ
┋├┈⌖ 𝙹ɪᴅ <ʟɪɴᴋ>
┋├┈⌖ 𝚁ᴇᴠᴇʀsᴇ
┋╰┈⌖ 𝚄ᴘᴛɪᴍᴇ
┗───────────────────𒁍` },

    { cat: "utility", text: `┏━═❲ 𝐆𝐀𝐌𝐄𝐒
┋╭┈⌖ 𝙵ғ
┋├┈⌖ 𝙼ᴄsᴇʀᴠᴇʀ
┋├┈⌖ 𝙼ʟʙʙ
┋├┈⌖ 𝙿ᴏᴋᴇᴍᴏɴ
┋╰┈⌖ 𝚂ᴛᴇᴀᴍ
┗───────────────────𒁍` },

    { cat: "extra", text: `┏━═❲ 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒
┋╭┈⌖ 𝙰ɴᴛɪᴄᴀʟʟ
┋├┈⌖ 𝙰ɴᴛɪᴅᴇʟᴇᴛᴇ
┋├┈⌖ 𝙰ᴜᴛᴏʟɪᴋᴇsᴛᴀᴛᴜs
┋├┈⌖ 𝙰ᴜᴛᴏʀᴇᴀᴅ
┋├┈⌖ 𝙰ᴜᴛᴏʀᴇᴄᴏʀᴅɪɴɢ
┋├┈⌖ 𝙰ᴜᴛᴏᴛʏᴘɪɴɢ
┋├┈⌖ 𝙰ᴜᴛᴏᴠɪᴇᴡsᴠɪᴇᴡ
┋├┈⌖ 𝙼ᴏᴅᴇ
┋├┈⌖ 𝙾ᴡɴᴇʀɴᴀᴍᴇ
┋╰┈⌖ 𝙾ᴡɴᴇʀɴᴜᴍʙᴇʀ
┗───────────────────𒁍` },

    { cat: "general", text: `┏━═❲ 𝐆𝐄𝐍𝐄𝐑𝐀𝐋
┋╭┈⌖ 𝙲ʜᴀɴɴᴇʟɪɴғᴏ <ᴊɪᴅ>
┋├┈⌖ 𝙲ʜᴘᴏʟʟ
┋├┈⌖ 𝙲ʜʀᴇᴀᴄᴛ
┋├┈⌖ 𝙳ᴀᴛᴇ
┋├┈⌖ 𝙵ᴏʟʟᴏᴡsᴛᴀᴛs
┋├┈⌖ 𝙼ᴀssᴘᴏʟʟ
┋├┈⌖ 𝙽ᴇᴛᴛᴇsᴛ
┋├┈⌖ 𝙿ɪɴɢ2
┋├┈⌖ 𝙿ɪɴɢs
┋├┈⌖ 𝙿ᴏʟʟsᴛᴀᴛs
┋├┈⌖ 𝙿ʀᴇᴍɪᴜᴍ
┋├┈⌖ 𝚁ᴇᴅᴇᴇᴍ <ᴄᴏᴅᴇ>
┋├┈⌖ 𝚂ᴇʀᴠᴇʀ
┋├┈⌖ 𝚂ғᴏʟʟᴏᴡ <ʟɪɴᴋ>
┋├┈⌖ 𝚂ʀᴇᴀᴄᴛs <ʟɪɴᴋ>
┋├┈⌖ 𝚂ᴜɴғᴏʟʟᴏᴡ <ʟɪɴᴋ>
┋├┈⌖ 𝚂ᴠᴏᴛᴇs <ʟɪɴᴋ> <ᴏᴘᴛɪᴏɴ>
┋├┈⌖ 𝚄sᴇʀɪɴғᴏ
┋╰┈⌖ 𝚆ʜᴏɪs
┗───────────────────𒁍` },

    { cat: "islamic", text: `┏━═❲ 𝐈𝐒𝐋𝐀𝐌𝐈𝐂
┋╭┈⌖ 𝙰ʟʟᴀʜɴᴀᴍᴇ
┋├┈⌖ 𝙰ʟʟɴᴀᴍᴀᴢ
┋├┈⌖ 𝙰ʏᴀᴛ
┋├┈⌖ 𝙰ʏᴀᴛ2
┋├┈⌖ 𝙲ʜᴀʀɪᴛʏɪᴅᴇᴀs
┋├┈⌖ 𝙲ʟᴇᴀɴʟɪɴᴇss
┋├┈⌖ 𝙳ᴀɪʟʏʜᴀᴅɪᴛʜ
┋├┈⌖ 𝙳ᴜᴀ
┋├┈⌖ 𝙳ᴜᴀᴄᴀᴛ
┋├┈⌖ 𝙳ᴜᴀʜᴇʟᴘ
┋├┈⌖ 𝙳ᴜʀᴏᴏᴅ
┋├┈⌖ 𝙴ɪᴅɢᴜɪᴅᴇ
┋├┈⌖ 𝙵ᴀsᴛɪɴɢɢᴜɪᴅᴇ
┋├┈⌖ 𝙶ᴏᴏᴅᴅᴇᴇᴅs
┋├┈⌖ 𝙷ᴀᴅɪᴛʜ2
┋├┈⌖ 𝙷ᴀᴊᴊɢᴜɪᴅᴇ
┋├┈⌖ 𝙷ᴀʟᴀʟᴇᴀʀɴɪɴɢ
┋├┈⌖ 𝙷ɪᴊʀɪ
┋├┈⌖ 𝙷ɪᴊʀɪ2
┋├┈⌖ 𝙸ғᴛᴀʀᴅᴜᴀ
┋├┈⌖ 𝙸sʟᴀᴍɪᴄᴄᴀʀᴛᴏᴏɴ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙸sʟᴀᴍɪᴄᴇᴠᴇɴᴛ
┋├┈⌖ 𝙸sʟᴀᴍɪᴄғᴀᴄᴛ
┋├┈⌖ 𝙸sʟᴀᴍɪᴄғᴀᴍɪʟʏ
┋├┈⌖ 𝙸sʟᴀᴍɪᴄᴍᴀɴɴᴇʀs
┋├┈⌖ 𝙸sʟᴀᴍɪᴄᴍᴏɴᴛʜs
┋├┈⌖ 𝙸sʟᴀᴍɪᴄǫᴜɪᴢ
┋├┈⌖ 𝙸sʟᴀᴍɪᴄᴠɪᴅᴇᴏ <ʟɪɴᴋ>
┋├┈⌖ 𝙸sʟᴀᴍɪᴄᴠᴏᴄᴀʙ
┋├┈⌖ 𝙸sʟᴀᴍǫᴜɪᴢ
┋├┈⌖ 𝙸sᴛɪɢʜғᴀʀ
┋├┈⌖ 𝙹ᴜᴍᴍᴀʜɢᴜɪᴅᴇ
┋├┈⌖ 𝙺ᴀʟɪᴍᴀ
┋├┈⌖ 𝙼ᴀsᴊɪᴅᴀᴅᴀʙ
┋├┈⌖ 𝙼ᴜsʟɪᴍᴄʜᴀʀᴀᴄᴛᴇʀ
┋├┈⌖ 𝙽ᴀᴀᴛᴠɪᴅᴇᴏ <ɴᴀᴍᴇ>
┋├┈⌖ 𝙽ᴀᴍᴀᴢ
┋├┈⌖ 𝙽ᴀᴍᴀᴢ2
┋├┈⌖ 𝙽ᴀᴍᴇᴍᴇᴀɴɪɴɢ
┋├┈⌖ 𝙽ᴇɪɢʜʙᴏʀʀɪɢʜᴛs
┋├┈⌖ 𝙽ᴇxᴛɴᴀᴍᴀᴢ
┋├┈⌖ 𝙿ᴀʀᴇɴᴛsᴅᴜᴀ
┋├┈⌖ 𝙿ᴀᴛɪᴇɴᴄᴇ
┋├┈⌖ 𝙿ɪʟʟᴀʀsɪᴍᴀɴ
┋├┈⌖ 𝙿ɪʟʟᴀʀsɪsʟᴀᴍ
┋├┈⌖ 𝙿ʀᴏᴘʜᴇᴛᴠɪᴅᴇᴏ <ɴᴀᴍᴇ>
┋├┈⌖ 𝚀ᴜʀᴀɴᴀᴅᴀʙ
┋├┈⌖ 𝚀ᴜʀᴀɴʟᴇᴀʀɴɪɴɢ
┋├┈⌖ 𝚀ᴜʀᴀɴsᴇᴀʀᴄʜ
┋├┈⌖ 𝚁ᴀᴍᴀᴅᴀɴᴄᴏᴜɴᴛ
┋├┈⌖ 𝚁ᴀᴍᴀᴅᴀɴɢᴜɪᴅᴇ
┋├┈⌖ 𝚁ᴇᴘᴇɴᴛᴀɴᴄᴇ
┋├┈⌖ 𝚂ᴀᴅᴀǫᴀʜ
┋├┈⌖ 𝚂ᴀғᴀʀᴅᴜᴀ
┋├┈⌖ 𝚂ᴀʟᴀʜɢᴜɪᴅᴇ
┋├┈⌖ 𝚂ᴀʟᴀᴍᴀᴅᴀʙ
┋├┈⌖ 𝚂ʜᴜᴋʀ
┋├┈⌖ 𝚂ᴜʀᴀʜ
┋├┈⌖ 𝚃ᴀsʙᴇᴇʜ
┋├┈⌖ 𝚃ʀᴜᴛʜғᴜʟɴᴇss
┋├┈⌖ 𝚄ᴍʀᴀʜɢᴜɪᴅᴇ
┋├┈⌖ 𝚆ᴜᴅᴜɢᴜɪᴅᴇ
┋├┈⌖ 𝚉ᴀᴋᴀᴛɢᴜɪᴅᴇ
┋├┈⌖ 𝚉ɪᴋʀ
┋╰┈⌖ 𝚉ɪᴋʀsᴛᴀʀᴛ
┗───────────────────𒁍` },

];

// carousel-menu.js (category tap) isi design ko use karta hai
module.exports = { argHint, formatCategory, formatCategoryParts, styleName, toSmallCaps, toBold };
