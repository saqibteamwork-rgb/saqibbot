'use strict';

/**
 * 12+ AESTHETIC MENU DESIGNS & STYLES ENGINE (PROBOY / MR SAQIB MD)
 * ============================================================================
 * Provides 12 unique, gorgeous menu themes with instant in-memory rendering:
 * 1. Style 1:  SMD-Mini Aesthetic (Default)
 * 2. Style 2:  Samurai Katana 父 (User Image Match: ┌───父「 ✨ CATEGORY 」 │ │ ▸ .cmd)
 * 3. Style 3:  Cyberpunk Neon Grid ◈
 * 4. Style 4:  Hacker Terminal CLI >
 * 5. Style 5:  Royal Crown Luxury 👑
 * 6. Style 6:  Minimalist Clean Dots •
 * 7. Style 7:  Anime Blossom 🌸
 * 8. Style 8:  Shadow Stealth Ops ◢◤
 * 9. Style 9:  Double Line Classic »
 * 10. Style 10: Rounded Bubble UI ╰┈➤
 * 11. Style 11: Dark Gothic Cross †
 * 12. Style 12: Developer Bash Shell $
 * ============================================================================
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

const STYLES = {
    1: {
        id: 1,
        name: 'SMD-Mini Aesthetic (Default)',
        tag: '⚡ Classic',
        makeHeader: (p, s) =>
`╭━━━〔 ⚡ ${toSansBold(p.botName)} ⚡ 〕━━━┈⊷
┃ 👤 ${toSansBold('User')}: _${p.userName}_
┃ 👑 ${toSansBold('Owner')}: ${toSansBold(p.ownerName)}
┃ 🟢 ${toSansBold('Status')}: ${toSansBold('Connected')} 🟢
┃ ⚙️ ${toSansBold('System')}: ${toSansBold('Active')} ⚡
┃ 🌐 ${toSansBold('Server')}: ${toSansBold('Running')} 🚀
┃ 🔥 ${toSansBold('Modules')}: ${toSansBold('Active')} 🔥
┃ 📱 ${toSansBold('Baileys')}: _Multi-Device_
┃ 📅 ${toSansBold('Date')}: _${s.dateStr}_
┃ ⏳ ${toSansBold('Uptime')}: _${s.runtimeStr}_
┃ 🔑 ${toSansBold('Prefix')}: [ . ]
┃ 🛡️ ${toSansBold('Mode')}: _${s.isPublic ? 'Public 🌍' : 'Private 🔒'}_
┃ 📊 ${toSansBold('RAM')}: _${s.usedMem}MB / ${s.totalMem}MB_
┃ 📂 ${toSansBold('Total Commands')}: ${toSansBold(String(s.totalCommands))}
┃ 📦 ${toSansBold('Version')}: _2.0.0_
╰━━━━━━━━━━━━━━━━━━┈⊷

 ➤ .${toSansBold('menu')} _type karein commands ke liye_\n\n`,
        makeBox: (title, cmds) => {
            const head = `┌───⭓ ⚡ ${toSansBold(title.toUpperCase())} ⭓───\n`;
            const body = cmds.map(cmd => `│ ⬡ .${toSansBold(cmd)}`).join('\n') + '\n';
            const foot = `└───────────────────⭓\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`╭━━━〔 👑 ${toSansBold('POWERED BY')} 〕━━━┈⊷
┃ 🚀 ${toSansBold(p.ownerName)}
┃ 🔍 google.com/search?q=mr+saqib
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    },

    2: {
        id: 2,
        name: 'Samurai Katana 父 (Photo Style)',
        tag: '父 Japanese Katana',
        makeHeader: (p, s) =>
`╭────父「 ⚡ ${p.botName.toUpperCase()} ⚡ 」
│ │ 👤 User: ${p.userName}
│ │ 👑 Owner: ${p.ownerName}
│ │ 🟢 Status: Connected
│ │ ⏳ Uptime: ${s.runtimeStr}
│ │ 🔑 Prefix: [ . ]
│ │ 📂 Commands: ${s.totalCommands}
│ │ 📊 RAM: ${s.usedMem}MB
╰───────────────父

 ➤ .menu <category> type karein commands ke liye\n\n`,
        makeBox: (title, cmds) => {
            const head = `╭────父「 ✨ ${title.toUpperCase()} 」\n`;
            const body = cmds.map(cmd => `│ │ ▸ .${cmd}`).join('\n') + '\n';
            const foot = `╰───────────────父\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`╭────父「 👑 POWERED BY ${p.ownerName.toUpperCase()} 」
│ │ 🚀 google.com/search?q=mr+saqib
╰───────────────父`
    },

    3: {
        id: 3,
        name: 'Cyberpunk Neon Grid ◈',
        tag: '🌐 Cyber Matrix',
        makeHeader: (p, s) =>
`╔══════❮ ⚡ ${toSansBold(p.botName)} ⚡ ❯══════╗
║ 👤 USER: ${toSansBold(p.userName)}
║ 👑 OWNER: ${toSansBold(p.ownerName)}
║ 🟢 STATUS: CONNECTED [ONLINE]
║ ⏳ UPTIME: ${s.runtimeStr}
║ 📂 CMDS: ${s.totalCommands}
║ 📊 RAM: ${s.usedMem}MB / ${s.totalMem}MB
╚═════════════════════════════════╝\n\n`,
        makeBox: (title, cmds) => {
            const head = `╔════❮ ⚡ ${toSansBold(title.toUpperCase())} ❯════╗\n`;
            const body = cmds.map(cmd => `║ ◈ .${cmd}`).join('\n') + '\n';
            const foot = `╚═══════════════════════╝\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`╔════❮ 👑 POWERED BY ${toSansBold(p.ownerName)} ❯════╗
║ 🚀 google.com/search?q=mr+saqib
╚══════════════════════════════════╝`
    },

    4: {
        id: 4,
        name: 'Hacker Terminal CLI >',
        tag: '💻 Linux Shell',
        makeHeader: (p, s) =>
`┌─── [ ⚡ SYSTEM: ${p.botName} ] ───┐
│ > USER: ${p.userName}
│ > OWNER: ${p.ownerName}
│ > STATUS: RUNNING [200 OK]
│ > UPTIME: ${s.runtimeStr}
│ > TOTAL CMDS: ${s.totalCommands}
└────────────────────────────────────┘\n\n`,
        makeBox: (title, cmds) => {
            const head = `┌─── [ ⚡ ${title.toUpperCase()} ] ───┐\n`;
            const body = cmds.map(cmd => `│ > .${cmd}`).join('\n') + '\n';
            const foot = `└────────────────────────┘\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`┌─── [ 👑 DEVELOPED BY ${p.ownerName} ] ───┐
└──────────────────────────────────────────┘`
    },

    5: {
        id: 5,
        name: 'Royal Crown Luxury 👑',
        tag: '👑 Royal Gold',
        makeHeader: (p, s) =>
`❖ ══════ 👑 ${toSansBold(p.botName)} 👑 ══════ ❖
  👤 Master: ${toSansBold(p.userName)}
  👑 Emperor: ${toSansBold(p.ownerName)}
  🟢 State: Active & Majestic
  ⏳ Runtime: ${s.runtimeStr}
  📂 Armory: ${s.totalCommands} Commands
❖ ═══════════════════════════════ ❖\n\n`,
        makeBox: (title, cmds) => {
            const head = `❖ ══════ 👑 ${toSansBold(title.toUpperCase())} ══════ ❖\n`;
            const body = cmds.map(cmd => `  ✦ .${cmd}`).join('\n') + '\n';
            const foot = `❖ ═════════════════════════ ❖\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`❖ ══════ 👑 CROWN OF ${toSansBold(p.ownerName)} ══════ ❖`
    },

    6: {
        id: 6,
        name: 'Minimalist Clean Dots •',
        tag: '✨ Ultra Minimal',
        makeHeader: (p, s) =>
`╭─〔 ⚡ ${p.botName} 〕
│ • User: ${p.userName}
│ • Owner: ${p.ownerName}
│ • Status: Connected
│ • Uptime: ${s.runtimeStr}
│ • Commands: ${s.totalCommands}
╰───────────────────\n\n`,
        makeBox: (title, cmds) => {
            const head = `╭─〔 ⚡ ${title.toUpperCase()} 〕\n`;
            const body = cmds.map(cmd => `│ • .${cmd}`).join('\n') + '\n';
            const foot = `╰───────────────\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`╭─〔 👑 Powered by ${p.ownerName} 〕
╰─────────────────────────────`
    },

    7: {
        id: 7,
        name: 'Anime Blossom 🌸',
        tag: '🌸 Kawaii Anime',
        makeHeader: (p, s) =>
`🌸 ━━━━━〔 ✨ ${toSansBold(p.botName)} ✨ 〕━━━━━ 🌸
│ 👤 Senpai: ${toSansBold(p.userName)}
│ 👑 Creator: ${toSansBold(p.ownerName)}
│ 🟢 Status: Kawaii & Active ✨
│ ⏳ Runtime: ${s.runtimeStr}
│ 📂 Magic Spells: ${s.totalCommands}
🌸 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 🌸\n\n`,
        makeBox: (title, cmds) => {
            const head = `🌸 ━━━━━〔 ✨ ${toSansBold(title.toUpperCase())} 〕━━━━━ 🌸\n`;
            const body = cmds.map(cmd => `│ ❥ .${cmd}`).join('\n') + '\n';
            const foot = `🌸 ━━━━━━━━━━━━━━━━━━━━━━━━━ 🌸\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`🌸 ━━━━━〔 👑 Made with ❤️ by ${toSansBold(p.ownerName)} 〕━━━━━ 🌸`
    },

    8: {
        id: 8,
        name: 'Shadow Stealth Ops ◢◤',
        tag: '🥷 Dark Ninja',
        makeHeader: (p, s) =>
`◢◤ ⚡ ${toSansBold(p.botName)} [SHADOW OPS] ◢◤
  ▌ Operative: ${toSansBold(p.userName)}
  ▌ Command: ${toSansBold(p.ownerName)}
  ▌ Status: Active Stealth
  ▌ Uptime: ${s.runtimeStr}
  ▌ Arsenal: ${s.totalCommands} Modules
◥◣ ═════════════════════════════ ◥◣\n\n`,
        makeBox: (title, cmds) => {
            const head = `◢◤ ⚡ ${toSansBold(title.toUpperCase())} ◢◤\n`;
            const body = cmds.map(cmd => `  ▌ .${cmd}`).join('\n') + '\n';
            const foot = `◥◣ ═════════════ ◥◣\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`◢◤ 👑 SHADOW COMMAND: ${toSansBold(p.ownerName)} ◢◤`
    },

    9: {
        id: 9,
        name: 'Double Line Classic »',
        tag: '🏛️ Classic Grid',
        makeHeader: (p, s) =>
`╔═〔 ⚡ ${p.botName.toUpperCase()} 〕══════════╗
║ 👤 User: ${p.userName}
║ 👑 Owner: ${p.ownerName}
║ 🟢 Status: Running
║ ⏳ Uptime: ${s.runtimeStr}
║ 📂 Total: ${s.totalCommands} Commands
╚══════════════════════════════╝\n\n`,
        makeBox: (title, cmds) => {
            const head = `╔═〔 ⚡ ${title.toUpperCase()} 〕═════════════╗\n`;
            const body = cmds.map(cmd => `║ » .${cmd}`).join('\n') + '\n';
            const foot = `╚══════════════════════════════╝\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`╔═〔 👑 POWERED BY ${p.ownerName.toUpperCase()} 〕═╗
╚══════════════════════════════╝`
    },

    10: {
        id: 10,
        name: 'Rounded Bubble UI ╰┈➤',
        tag: '🫧 Modern Curve',
        makeHeader: (p, s) =>
`╭────────── ⚡ ${toSansBold(p.botName)} ⚡ ──────────╮
│ 👤 User: ${toSansBold(p.userName)}
│ 👑 Owner: ${toSansBold(p.ownerName)}
│ 🟢 Status: Online & Ready
│ ⏳ Uptime: ${s.runtimeStr}
│ 📂 Total Commands: ${s.totalCommands}
╰──────────────────────────────────────╯\n\n`,
        makeBox: (title, cmds) => {
            const head = `╭────────── ⚡ ${toSansBold(title.toUpperCase())} ──────────╮\n`;
            const body = cmds.map(cmd => `│ ╰┈➤ .${cmd}`).join('\n') + '\n';
            const foot = `╰────────────────────────────────╯\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`╭────── 👑 POWERED BY ${toSansBold(p.ownerName)} ──────╮
╰────────────────────────────────────╯`
    },

    11: {
        id: 11,
        name: 'Dark Gothic Cross †',
        tag: '⚔️ Gothic Dark',
        makeHeader: (p, s) =>
`† ━━━━━━ ⚡ ${toSansBold(p.botName)} ⚡ ━━━━━━ †
  ⚝ User: ${toSansBold(p.userName)}
  ⚝ Master: ${toSansBold(p.ownerName)}
  ⚝ Status: Immortal
  ⚝ Uptime: ${s.runtimeStr}
  ⚝ Grimoire: ${s.totalCommands} Spells
† ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ †\n\n`,
        makeBox: (title, cmds) => {
            const head = `† ━━━━━━ ⚡ ${toSansBold(title.toUpperCase())} ━━━━━━ †\n`;
            const body = cmds.map(cmd => `  ⚝ .${cmd}`).join('\n') + '\n';
            const foot = `† ━━━━━━━━━━━━━━━━━━━━━━━━━ †\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`† ━━━━━━ 👑 ETERNAL: ${toSansBold(p.ownerName)} ━━━━━━ †`
    },

    12: {
        id: 12,
        name: 'Developer Bash Shell $',
        tag: '💻 Code Terminal',
        makeHeader: (p, s) =>
`// ──────────────────────────────────────────
// 🚀 ${p.botName} [v2.0 LTS Node.js]
// 👤 User   : ${p.userName}
// 👑 Owner  : ${p.ownerName}
// 🟢 Status : Active & Listening
// ⏳ Uptime : ${s.runtimeStr}
// 📂 Total  : ${s.totalCommands} Binaries
// ──────────────────────────────────────────\n\n`,
        makeBox: (title, cmds) => {
            const head = `// ─── [ ⚡ ${title.toUpperCase()} ] ───\n`;
            const body = cmds.map(cmd => `$ .${cmd}`).join('\n') + '\n';
            const foot = `// ───────────────────────\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`// 👑 (c) ${p.ownerName} • google.com/search?q=mr+saqib`
    },

    13: {
        id: 13,
        name: 'VIP Payment Request (FAMO Typ Menu)',
        tag: '💳 Payment Card',
        isPayment: true,
        makeHeader: (p, s) =>
`╭━━━〔 💳 ${toSansBold(p.botName)} 💳 〕━━━┈⊷
┃ 👤 ${toSansBold('User')}: _${p.userName}_
┃ 👑 ${toSansBold('Owner')}: ${toSansBold(p.ownerName)}
┃ 💰 ${toSansBold('Invoice')}: $100.00 USD (Paid)
┃ 🟢 ${toSansBold('Status')}: ${toSansBold('VIP Activated')} 🟢
┃ ⏳ ${toSansBold('Uptime')}: _${s.runtimeStr}_
┃ 🔑 ${toSansBold('Prefix')}: [ . ]
┃ 📂 ${toSansBold('Total Commands')}: ${toSansBold(String(s.totalCommands))}
╰━━━━━━━━━━━━━━━━━━┈⊷

 ➤ .${toSansBold('menu')} _type karein commands ke liye_\n\n`,
        makeBox: (title, cmds) => {
            const head = `┌───💳 ⚡ ${toSansBold(title.toUpperCase())} ⚡───\n`;
            const body = cmds.map(cmd => `│ 💳 .${toSansBold(cmd)}`).join('\n') + '\n';
            const foot = `└───────────────────💳\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`╭━━━〔 👑 ${toSansBold('POWERED BY')} 〕━━━┈⊷
┃ 🚀 ${toSansBold(p.ownerName)}
┃ 🔍 google.com/search?q=mr+saqib
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    },

    14: {
        id: 14,
        name: 'Interactive Carousel Cards (Swipe Slider ◈)',
        tag: '🎠 Swipe Cards',
        isCarousel: true,
        makeHeader: (p, s) =>
`⚡³*${p.botName.toUpperCase()}*⁴⚡
📚 *ALL MENU*

Swipe through the cards to see all available commands.

🔥 *Powered by ${p.ownerName}* | _Swipe left/right_\n\n`,
        makeBox: (title, cmds) => {
            const head = `┌───🎠 ⚡ ${toSansBold(title.toUpperCase())} ⚡───\n`;
            const body = cmds.map(cmd => `│ ◈ .${cmd}`).join('\n') + '\n';
            const foot = `└───────────────────🎠\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`╭━━━〔 👑 ${toSansBold('POWERED BY')} 〕━━━┈⊷
┃ 🚀 ${toSansBold(p.ownerName)}
┃ 🔍 google.com/search?q=mr+saqib
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
    },

    15: {
        id: 15,
        name: 'Meta AI Luxury Button Menu (WaBot Card 🏷️)',
        tag: '🏷️ Meta AI Buttons',
        isMetaAiButton: true,
        makeHeader: (p, s) =>
`🏷️ *${p.botName}*
Ends tomorrow at 5:40 PM
Code: ${p.botName} WaBot

╭───〔 *${p.botName} WaBot* 〕───╮
│ Assalam-o-Alaikum,
*${p.userName}* 🌸
├─────────────
│ 📅 ${s.dateStr} • ⏱️ 17:40:56
├─────────────
│ 🟢 *Status:* Online (${s.runtimeStr})
│ 📶 *Host:* SAQIB-SRV-1
│ ⚡ *Prefix:* [ . ] • ${s.totalCommands}+ Cmds
╰─────────────\n\n`,
        makeBox: (title, cmds) => {
            const head = `┌───🏷️ ⚡ ${toSansBold(title.toUpperCase())} ⚡───\n`;
            const body = cmds.map(cmd => `│ ◈ .${cmd}`).join('\n') + '\n';
            const foot = `└───────────────────🏷️\n\n`;
            return head + body + foot;
        },
        makeFooter: (p) =>
`📚 *Use .allmenu to browse all commands.*
🔥 *Powered by ${p.ownerName}*`
    }
};

// ══════════════════════════════════════════════════════════════
// ULTRA-SONIC SPEED IN-RAM CACHE FOR ALL 12 STYLES
// ══════════════════════════════════════════════════════════════
const PRECOMPILED_STYLES = new Map();

function initPrecompiledStyles(CATEGORIES) {
    for (const [styleIdStr, styleObj] of Object.entries(STYLES)) {
        const styleId = Number(styleIdStr);
        let fullBody = '';
        const categoryMap = new Map();

        for (const [categoryName, cmds] of Object.entries(CATEGORIES)) {
            const box = styleObj.makeBox(categoryName, cmds);
            categoryMap.set(categoryName.toLowerCase(), { name: categoryName, box });
            fullBody += box;
        }

        PRECOMPILED_STYLES.set(styleId, {
            fullBody,
            categoryMap
        });
    }
}

/**
 * Returns catalog text showing all 12 styles
 */
function getStyleCatalog(currentStyleId = 1, isOwner = false) {
    const lines = Object.values(STYLES).map(st => {
        const isCurrent = (st.id === currentStyleId) ? ' 🌟 *(Active)*' : '';
        return `┃ ${st.id}. *${st.name}* [${st.tag}]${isCurrent}`;
    }).join('\n');

    return `╭━━━〔 🎨 *MENU STYLES CATALOG (15 DESIGNS)* 〕━━━┈⊷\n` +
           lines + `\n` +
           `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
           `💡 *Kaise Change Karein:*\n` +
           `👉 \`.setmenu <1-15>\` — Apna default menu design set karein (e.g. \`.setmenu 15\` ya \`.setmenu metaai\`)\n` +
           `👉 \`.menu <1-15>\` — Kisi bhi design ka foran live preview dekhein (e.g. \`.menu 15\`)\n` +
           `👉 \`.btnmenu\` ya \`.metaaimenu\` — Meta AI Button Card Menu dekhein\n` +
           `👉 \`.cmenu\` — Interactive Swipe Cards Slider Menu dekhein\n` +
           `👉 \`.typmenu\` — VIP Payment Request Card Menu dekhein\n` +
           `👉 \`.resetmenu\` — Wapas default Style 1 par reset karein\n` +
           (isOwner ? `👉 \`.setmenu -g <1-15>\` — Poore bot ke naye users ka global default set karein\n\n` : `\n`) +
           `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;
}

/**
 * .setmenu / .menudesign / .menustyle command
 */
async function setmenuCommand(sock, from, msg, isOwner, isSessionOwner, botData, saveBotData, userId, args = []) {
    const rawArg = (args[0] || '').trim().toLowerCase();
    const isGlobal = isOwner && (rawArg === '-g' || rawArg === 'global' || (args[1] && (args[1].toLowerCase() === '-g' || args[1].toLowerCase() === 'global')));

    let choiceNum = null;
    for (const a of args) {
        const clean = String(a).toLowerCase().trim();
        if (['btn', 'button', 'meta', 'metaai', 'btnmenu', 'buttonmenu', 'sayron', 'wabot'].includes(clean)) {
            choiceNum = 15;
            break;
        }
        if (['carousel', 'cmenu', 'card', 'cards', 'slide', 'slidemenu'].includes(clean)) {
            choiceNum = 14;
            break;
        }
        if (clean === 'pay' || clean === 'payment' || clean === 'typ' || clean === 'type') {
            choiceNum = 13;
            break;
        }
        const n = parseInt(a.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(n) && n >= 1 && n <= 15) {
            choiceNum = n;
            break;
        }
    }

    if (!choiceNum) {
        const userStyle = Number(botData?.customProfiles?.[userId]?.menuStyle || botData?.globalSettings?.menuStyle || 1);
        return await sock.sendMessage(from, { text: getStyleCatalog(userStyle, isOwner) }, { quoted: msg });
    }

    const selectedStyle = STYLES[choiceNum];
    if (!selectedStyle) {
        return await sock.sendMessage(from, { text: `❌ *Invalid Style!* 1 se 15 ke darmiyan number dein (e.g. \`.setmenu 15\` ya \`.setmenu metaai\`).` }, { quoted: msg });
    }

    if (!botData.customProfiles) botData.customProfiles = {};
    if (!botData.globalSettings) botData.globalSettings = {};

    if (isGlobal) {
        botData.globalSettings.menuStyle = choiceNum;
        saveBotData();
        return await sock.sendMessage(from, {
            text: `╭━━━〔 👑 *GLOBAL MENU STYLE UPDATED* 〕━━━┈⊷\n` +
                  `┃ ✅ *Global Default Style:* ${choiceNum}. ${selectedStyle.name}\n` +
                  `┃ 👑 *Action By:* Master Owner\n` +
                  `┃ 🌍 *Effect:* Tamam naye users ka default menu ye hoga!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    if (!botData.customProfiles[userId]) botData.customProfiles[userId] = {};
    botData.customProfiles[userId].menuStyle = choiceNum;
    saveBotData();

    await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } }).catch(() => {});

    return await sock.sendMessage(from, {
        text: `╭━━━〔 🎨 *MENU DESIGN UPDATED* 〕━━━┈⊷\n` +
              `┃ ✅ *Selected Style:* ${choiceNum}. ${selectedStyle.name}\n` +
              `┃ 🏷️ *Tag:* ${selectedStyle.tag}\n` +
              `┃ 👤 *Session User:* +${userId}\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `💡 *Ab aap jab bhi \`.menu\` likhenge to ye naya style aayega!* ✨\n` +
              `👉 Kisi bhi waqt wapas badalane ke liye: \`.setmenu <1-15>\``
    }, { quoted: msg });
}

module.exports = {
    STYLES,
    initPrecompiledStyles,
    PRECOMPILED_STYLES,
    getStyleCatalog,
    setmenuCommand
};
