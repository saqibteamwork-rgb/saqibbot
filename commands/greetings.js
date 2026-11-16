'use strict';

/**
 * MR SAQIB MD :: Greetings & Wishes Suite
 * ============================================================================
 * Commands:
 * - .morning / .gm / .moring / .goodmorning : Good Morning wishes & inspirational quotes
 * - .goodnight / .gn / .night / .goodnyt     : Good Night peaceful wishes & bedtime dua
 * - .thanks / .thankyou / .thx / .welcome   : Warm gratitude & welcome responses
 * - .afternoon / .ga                        : Good Afternoon wishes
 * - .evening / .ge                          : Good Evening wishes
 * ============================================================================
 */

const { jidNormalizedUser } = require('@whiskeysockets/baileys');

const MORNING_WISHES = [
    "🌅 *Subah Bakhair!* Naye din ki nayi umangen aur nayi roshni aapke liye dheron khushiyan laye!",
    "☕ *Good morning!* May your cup be full of coffee and your day full of positive energy, peace and smiles!",
    "☀️ *'Har subah ek naya aaghaz hai, kal ko bhool kar aaj ko behtareen banayein!'* Good morning!",
    "🌺 *As-salamu Alaykum & Subah Bakhair!* Allah Ta'ala aapke din mein barkat, sehat aur asaniyan ata farmaye. Ameen!",
    "✨ *Rise and shine!* Today is a brand new opportunity to achieve your goals and make life beautiful. Have a wonderful day!",
    "🌸 *Subah ki taaza hawa* aapke chehre par haseen muskurahat aur dil mein sukoon laye. Have a blessed morning!",
    "🌻 *Fresh thoughts, fresh hope, fresh morning!* May Allah shower His blessings upon you and your loved ones today. Ameen!"
];

const NIGHT_WISHES = [
    "🌙 *Shab Bakhair!* Din bhar ki thakan ko bhool kar sukoon ki neend lein. Allah Ta'ala aapko apni hifz-o-amaan mein rakhe. Sweet dreams!",
    "✨ *Good night!* May the stars guide your dreams and tomorrow bring new happiness and success. Sleep well!",
    "😴 *Masnoon Dua:* 'بِاسْمِكَ اللّٰهُمَّ أَمُوْتُ وَأَحْيَا' (Bismika Allahumma amootu wa-ahya). Have a peaceful night!",
    "⭐ *Close your eyes, clear your mind,* and let peace surround your heart. Sweet dreams and good night!",
    "🌌 *'Chalo so jate hain ab nayi umeed ke sath, kal ka naya suraj naye imkanat layega.'* Shab Bakhair!",
    "💫 *May the angels watch over you tonight* and wake you up with refreshed energy and a happy heart. Good night!",
    "💤 *Tension ko side pe rakhein* aur sukoon se so jayein. Kal ka din Insha'Allah bohot shandaar hoga. Sleep tight!"
];

const THANKS_REPLIES = [
    "🌸 *You are most welcome!* Khushi hui aapki madad karke! Hamesha aapki khidmat mein hazir! 😊",
    "💖 *Shukriya kehne ki koi zaroorat nahi jani!* Dosti aur pyar mein sab chalta hai! ✨",
    "😇 *Always a pleasure!* Agar kisi bhi aur cheez ki zaroorat ho to bina jhijhak batayein! 🚀",
    "💫 *Most welcome pyaare dost!* May your day be blessed and filled with happiness! 🌷",
    "🤝 *JazakAllahu Khairan!* Shukriya aapki izzat, mohabat aur support ka! ❤️",
    "🎉 *Anytime!* MR SAQIB MD hamesha aapki khidmat ke liye ready hai! ⚡"
];

const AFTERNOON_WISHES = [
    "☀️ *Good Afternoon!* Umeed hai aapka aadha din acha guzra hoga, baki ka din aur bhi behtareen guzray!",
    "🍛 *Dopahar Bakhair!* Lunch ka time hai, acha khayein aur fresh ho jayein. Have a wonderful afternoon!",
    "🌤️ *Stay energetic and positive!* Afternoon slumps are temporary, your potential is unlimited! ✨"
];

const EVENING_WISHES = [
    "🌆 *Good Evening!* Shaam ka sukoon aur thandi hawa aapke din bhar ki thakan mita de!",
    "☕ *Shaam Bakhair!* Ek pyali garam chai aur doston ki baatein shaam ko yaadgar bana deti hain! Enjoy your evening!",
    "🌇 *As the sun sets,* may all your worries fade away and peace fill your soul. Have a lovely evening!"
];

const LOVE_QUOTES = [
    "❤️ *'Tum meri zindagi ka wo haseen khwab ho jo haqeeqat ban chuka hai.'* I love you to the moon and back!",
    "🌹 *'Pyar lafzon ka mohtaj nahi hota, dil ki dhadkan hi kafi hoti hai.'* Sending infinite love your way! 💖",
    "✨ *'You are my today and all of my tomorrows.'* Dil se hamesha aapke sath! ❤️",
    "💖 *'Aapki muskurahat hamari jaan hai!'* Stay happy, stay blessed! Love you always! 🥰",
    "💐 *'Sachha pyar wo hai jo har haal mein sath nibhaye.'* Pure love & endless respect! 💫",
    "💍 *'Duniya ki sabse khoobsurat cheez tumhari muskurahat hai.'* Forever in my heart! 💕"
];

const SAD_QUOTES = [
    "💔 *'Kabhi kabhi khamoshi hi sabse bada shor hoti hai jo koi sun nahi pata.'*",
    "🥀 *'Log kehte hain waqt sab theek kar deta hai, par sach ye hai ke waqt sirf aadat daal deta hai.'*",
    "🌧️ *'Dil dukhane wale aksar wahi hote hain jinke liye humne sab kuch chhod diya hota hai.'*",
    "🥺 *'Aankhon mein aansu tabhi aate hain jab lafz dard bayan nahi kar paate.'*",
    "🖤 *'It hurts when you realize you aren't as important to someone as you thought you were.'*",
    "🕯️ *'Kuch baatein dil mein hi achi lagti hain, labon par aa kar tamasha ban jaati hain.'*",
    "💔 *'Muskurahat ke peeche ka dard har koi nahi samajh sakta.'*"
];

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getTargetInfo(sock, from, msg) {
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = contextInfo?.participant;
    const mentioned = contextInfo?.mentionedJid || [];

    let targetJid = null;
    if (quoted) {
        targetJid = quoted;
    } else if (mentioned.length > 0) {
        targetJid = mentioned[0];
    }

    const senderJid = msg.key.participant || msg.key.remoteJid;
    const senderName = msg.pushName || 'Friend';

    return {
        targetJid: targetJid ? jidNormalizedUser(targetJid) : null,
        senderJid: jidNormalizedUser(senderJid),
        senderName
    };
}

async function morningCommand(sock, from, msg, args = []) {
    try {
        await sock.sendMessage(from, { react: { text: '🌅', key: msg.key } }).catch(() => {});
        const wish = getRandom(MORNING_WISHES);
        const { targetJid, senderName } = getTargetInfo(sock, from, msg);

        let text = '';
        let mentions = [];

        if (targetJid) {
            const userTag = targetJid.split('@')[0];
            mentions.push(targetJid);
            text =
`╭━━━〔 🌅 *GOOD MORNING* 〕━━━┈⊷
┃ 👤 *To:* @${userTag}
┃
┃ ${wish.replace(/\n/g, '\n┃ ')}
┃
┃ 💐 *Have a blessed & energetic day!*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;
        } else {
            text =
`╭━━━〔 🌅 *GOOD MORNING / SUBAH BAKHAIR* 〕━━━┈⊷
┃ 👤 *Hello:* ${senderName}
┃
┃ ${wish.replace(/\n/g, '\n┃ ')}
┃
┃ ☕ *May your day be filled with smiles!*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;
        }

        await sock.sendMessage(from, { text, mentions }, { quoted: msg });
    } catch (e) {
        console.error('[Morning Command Error]:', e);
        await sock.sendMessage(from, { text: `❌ Morning wish error: ${e.message}` }, { quoted: msg }).catch(() => {});
    }
}

async function nightCommand(sock, from, msg, args = []) {
    try {
        await sock.sendMessage(from, { react: { text: '🌙', key: msg.key } }).catch(() => {});
        const wish = getRandom(NIGHT_WISHES);
        const { targetJid, senderName } = getTargetInfo(sock, from, msg);

        let text = '';
        let mentions = [];

        if (targetJid) {
            const userTag = targetJid.split('@')[0];
            mentions.push(targetJid);
            text =
`╭━━━〔 🌙 *GOOD NIGHT* 〕━━━┈⊷
┃ 👤 *To:* @${userTag}
┃
┃ ${wish.replace(/\n/g, '\n┃ ')}
┃
┃ 😴 *Sweet dreams & sleep tight!* ✨
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;
        } else {
            text =
`╭━━━〔 🌙 *GOOD NIGHT / SHAB BAKHAIR* 〕━━━┈⊷
┃ 👤 *Pyaare:* ${senderName}
┃
┃ ${wish.replace(/\n/g, '\n┃ ')}
┃
┃ 😴 *Sweet dreams & peaceful sleep!* ✨
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;
        }

        await sock.sendMessage(from, { text, mentions }, { quoted: msg });
    } catch (e) {
        console.error('[Night Command Error]:', e);
        await sock.sendMessage(from, { text: `❌ Night wish error: ${e.message}` }, { quoted: msg }).catch(() => {});
    }
}

async function thanksCommand(sock, from, msg, args = []) {
    try {
        await sock.sendMessage(from, { react: { text: '😇', key: msg.key } }).catch(() => {});
        const reply = getRandom(THANKS_REPLIES);
        const { targetJid, senderName } = getTargetInfo(sock, from, msg);

        let text = '';
        let mentions = [];

        if (targetJid) {
            const userTag = targetJid.split('@')[0];
            mentions.push(targetJid);
            text =
`╭━━━〔 🌸 *YOU'RE WELCOME* 〕━━━┈⊷
┃ 👤 *For:* @${userTag}
┃
┃ ${reply.replace(/\n/g, '\n┃ ')}
┃
┃ 💖 *Always happy to help you!*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;
        } else {
            text =
`╭━━━〔 🌸 *MOST WELCOME* 〕━━━┈⊷
┃ 👤 *Dear:* ${senderName}
┃
┃ ${reply.replace(/\n/g, '\n┃ ')}
┃
┃ 💖 *Always here for you!*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;
        }

        await sock.sendMessage(from, { text, mentions }, { quoted: msg });
    } catch (e) {
        console.error('[Thanks Command Error]:', e);
        await sock.sendMessage(from, { text: `❌ Thanks error: ${e.message}` }, { quoted: msg }).catch(() => {});
    }
}

async function afternoonCommand(sock, from, msg, args = []) {
    try {
        await sock.sendMessage(from, { react: { text: '☀️', key: msg.key } }).catch(() => {});
        const wish = getRandom(AFTERNOON_WISHES);
        const { targetJid, senderName } = getTargetInfo(sock, from, msg);

        let text = '';
        let mentions = [];

        if (targetJid) {
            const userTag = targetJid.split('@')[0];
            mentions.push(targetJid);
            text =
`╭━━━〔 ☀️ *GOOD AFTERNOON* 〕━━━┈⊷
┃ 👤 *To:* @${userTag}
┃
┃ ${wish.replace(/\n/g, '\n┃ ')}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;
        } else {
            text =
`╭━━━〔 ☀️ *GOOD AFTERNOON* 〕━━━┈⊷
┃ 👤 *Hello:* ${senderName}
┃
┃ ${wish.replace(/\n/g, '\n┃ ')}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;
        }

        await sock.sendMessage(from, { text, mentions }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Error: ${e.message}` }, { quoted: msg }).catch(() => {});
    }
}

async function eveningCommand(sock, from, msg, args = []) {
    try {
        await sock.sendMessage(from, { react: { text: '🌆', key: msg.key } }).catch(() => {});
        const wish = getRandom(EVENING_WISHES);
        const { targetJid, senderName } = getTargetInfo(sock, from, msg);

        let text = '';
        let mentions = [];

        if (targetJid) {
            const userTag = targetJid.split('@')[0];
            mentions.push(targetJid);
            text =
`╭━━━〔 🌆 *GOOD EVENING* 〕━━━┈⊷
┃ 👤 *To:* @${userTag}
┃
┃ ${wish.replace(/\n/g, '\n┃ ')}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;
        } else {
            text =
`╭━━━〔 🌆 *GOOD EVENING* 〕━━━┈⊷
┃ 👤 *Hello:* ${senderName}
┃
┃ ${wish.replace(/\n/g, '\n┃ ')}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;
        }

        await sock.sendMessage(from, { text, mentions }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Error: ${e.message}` }, { quoted: msg }).catch(() => {});
    }
}

async function iloveyouCommand(sock, from, msg, args = []) {
    try {
        await sock.sendMessage(from, { react: { text: '❤️', key: msg.key } }).catch(() => {});
        const loveQuote = getRandom(LOVE_QUOTES);
        const { targetJid, senderName } = getTargetInfo(sock, from, msg);

        let text = '';
        let mentions = [];

        if (targetJid) {
            const userTag = targetJid.split('@')[0];
            mentions.push(targetJid);
            text =
`╭━━━〔 ❤️ *I LOVE YOU* ❤️ 〕━━━┈⊷
┃ 👤 *To:* @${userTag}
┃ 💌 *From:* ${senderName}
┃
┃ ${loveQuote.replace(/\n/g, '\n┃ ')}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;
        } else {
            text =
`╭━━━〔 ❤️ *I LOVE YOU* ❤️ 〕━━━┈⊷
┃ 👤 *Dear:* ${senderName}
┃
┃ ${loveQuote.replace(/\n/g, '\n┃ ')}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *MR SAQIB MD*`;
        }

        await sock.sendMessage(from, { text, mentions }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Love error: ${e.message}` }, { quoted: msg }).catch(() => {});
    }
}

async function hiCommand(sock, from, msg, args = []) {
    try {
        await sock.sendMessage(from, { react: { text: '👋', key: msg.key } }).catch(() => {});
        const senderName = msg.pushName || 'Friend';
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const userTag = (senderJid || '').split('@')[0];

        const text =
`╭━━━〔 👋 *HELLO & WELCOME* 〕━━━┈⊷
┃ 👤 *Hello:* @${userTag} (${senderName})
┃ 🤖 *Bot:* MR SAQIB MD
┃ ⚡ *Status:* Online & Operational 🟢
┃ 🚀 *Cluster:* 11-Node Mega Cluster
┃ 💡 *Tip:* Type *.menu* to see all commands!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
✨ *How can I help you today?*`;

        await sock.sendMessage(from, { text, mentions: [senderJid] }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Hi error: ${e.message}` }, { quoted: msg }).catch(() => {});
    }
}

async function sadgirlCommand(sock, from, msg, args = []) {
    try {
        await sock.sendMessage(from, { react: { text: '💔', key: msg.key } }).catch(() => {});
        const sadQuote = getRandom(SAD_QUOTES);
        const senderName = msg.pushName || 'Soul';

        const text =
`╭━━━〔 🥀 *SAD DIARIES / DUKH* 〕━━━┈⊷
┃ 👤 *For:* ${senderName}
┃
┃ ${sadQuote.replace(/\n/g, '\n┃ ')}
┃
┃ 🌧️ *Be strong! Bad days don't last forever.*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🖤 *MR SAQIB MD*`;

        await sock.sendMessage(from, { text }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Sad quote error: ${e.message}` }, { quoted: msg }).catch(() => {});
    }
}

async function mdCommand(sock, from, msg, args = []) {
    try {
        await sock.sendMessage(from, { react: { text: '🚀', key: msg.key } }).catch(() => {});
        const text =
`╭━━━〔 ⚡ *MR SAQIB MD CORE* ⚡ 〕━━━┈⊷
┃ 👑 *Developer:* Muhammad Saqib
┃ 🤖 *Bot System:* MR SAQIB MD Ultra v3.5
┃ 🌐 *Infrastructure:* 11-Node Mega Cluster
┃ ⚡ *Nodes:* 10 Heroku Nodes + 1 Railway Scale
┃ 📱 *Engine:* Baileys Multi-Device Sonic Core
┃ 🎯 *Auto-React:* Channel & Post Auto Reactor
┃ 📂 *Plugins:* 130+ Modules | 450+ Commands
┃ 🛡️ *Protection:* Anti-Edit, Anti-Delete, Anti-Once
┃ 📊 *Status:* 100% Active & Ultra Fast
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🌟 *Type .menu to explore the full dashboard!*`;

        await sock.sendMessage(from, { text }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ MD info error: ${e.message}` }, { quoted: msg }).catch(() => {});
    }
}

async function autoreplyCommand(sock, from, msg, args = []) {
    try {
        await sock.sendMessage(from, { react: { text: '💬', key: msg.key } }).catch(() => {});
        const text =
`╭━━━〔 💬 *SMART AUTO-REPLY* 〕━━━┈⊷
┃ ⚙️ *Auto-Reply Engine:* Active 🟢
┃ 🤖 *AI Logic:* Gemini + GPT Fallback
┃ ⚡ *Channel Auto-React:* Enabled
┃ 🛡️ *Filter:* Safe Chat & Clean Mode
┃
┃ 💡 *Features:*
┃ • Instant polite replies on greetings
┃ • Channel updates auto-reactions (.chautoreact)
┃ • Auto status like & status read
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
✨ *MR SAQIB MD Auto-Engine*`;

        await sock.sendMessage(from, { text }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Auto-reply error: ${e.message}` }, { quoted: msg }).catch(() => {});
    }
}

module.exports = {
    morningCommand,
    nightCommand,
    thanksCommand,
    afternoonCommand,
    eveningCommand,
    iloveyouCommand,
    hiCommand,
    sadgirlCommand,
    mdCommand,
    autoreplyCommand
};
