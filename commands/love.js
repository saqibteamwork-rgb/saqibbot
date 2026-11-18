// commands/love.js - Ultra Stylish Love Expression for Nishay & Loved Ones
const sharp = require('sharp');
const settings = require('../settings');

function toBoldScript(str) {
    return str.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D4D0 + (code - 65));
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D4EA + (code - 97));
        return c;
    }).join('');
}

function toItalicScript(str) {
    const upperExc = { 'B':'\u212C','E':'\u2130','F':'\u2131','H':'\u210B','I':'\u2110','L':'\u2112','M':'\u2133','R':'\u211B' };
    const lowerExc = { 'e':'\u212F','g':'\u210A','o':'\u2134' };
    return str.split('').map(c => {
        if (upperExc[c]) return upperExc[c];
        if (lowerExc[c]) return lowerExc[c];
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D49C + (code - 65));
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D4B6 + (code - 97));
        return c;
    }).join('');
}

function toDoubleStruck(str) {
    const exc = { 'C':'\u2102','H':'\u210D','N':'\u2115','P':'\u2119','Q':'\u211A','R':'\u211D','Z':'\u2124' };
    return str.split('').map(c => {
        if (exc[c]) return exc[c];
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D538 + (code - 65));
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D552 + (code - 97));
        return c;
    }).join('');
}

function toGothic(str) {
    const exc = { 'C':'\u212D','H':'\u210C','I':'\u2111','R':'\u211C','Z':'\u2128' };
    return str.split('').map(c => {
        if (exc[c]) return exc[c];
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D56C + (code - 65));
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D586 + (code - 97));
        return c;
    }).join('');
}

function toSmallCaps(str) {
    const map = {
        'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ғ','g':'ɢ','h':'ʜ',
        'i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ',
        'q':'ǫ','r':'ʀ','s':'s','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x',
        'y':'ʏ','z':'ᴢ'
    };
    return str.toLowerCase().split('').map(c => map[c] || c).join('');
}

function toSuperscript(str) {
    const map = {
        'a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ',
        'i':'ⁱ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','n':'ⁿ','o':'ᵒ','p':'ᵖ',
        'q':'ᑫ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ',
        'y':'ʸ','z':'ᶻ'
    };
    return str.toLowerCase().split('').map(c => map[c] || c).join('');
}

function toBoxed(str) {
    return str.toUpperCase().split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1F130 + (code - 65));
        return c;
    }).join('');
}

function toBubble(str) {
    return str.toLowerCase().split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x24D0 + (code - 97));
        return c;
    }).join('');
}

const romanticQuotes = [
    "❝ Tum meri zindagi ka wo haseen hissa ho,\n   Jiske bina meri har kahani adhoori hai... ❞",
    "❝ Tujhe dekh kar dil ko sukoon milta hai,\n   Tere bina yeh jahan adhoora lagta hai... ❞",
    "❝ Meri har subah, meri har shaam,\n   Sirf aur sirf tumhare naam! ❤️ ❞",
    "❝ Khuda kare hamara saath hamesha rahe,\n   Duniya ki har khushi tere qadmon me ho... ❞",
    "❝ Chand ki tarah chamakti ho tum,\n   Meri zindagi ki sabse pyari umeed ho tum... ❞"
];

// Generate High Definition Glowing Love Card Image (100% bug-free on all mobile screens)
async function generateLoveCardImage(name) {
    try {
        const width = 800;
        const height = 800;
        const safeName = (name || 'Nishay').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const svg = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0a010d"/>
                    <stop offset="40%" stop-color="#260424"/>
                    <stop offset="70%" stop-color="#18021a"/>
                    <stop offset="100%" stop-color="#08000a"/>
                </linearGradient>
                
                <linearGradient id="heartGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#ff2a6d"/>
                    <stop offset="50%" stop-color="#ff007f"/>
                    <stop offset="100%" stop-color="#ff758c"/>
                </linearGradient>

                <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#ffe066"/>
                    <stop offset="50%" stop-color="#fff3b0"/>
                    <stop offset="100%" stop-color="#e6b800"/>
                </linearGradient>
            </defs>

            <!-- Background -->
            <rect width="100%" height="100%" rx="35" fill="url(#bg)"/>

            <!-- Outer Ornamental Border -->
            <rect x="25" y="25" width="750" height="750" rx="25" fill="none" stroke="#ff2a6d" stroke-width="2" stroke-dasharray="12,8" opacity="0.5"/>
            <rect x="35" y="35" width="730" height="730" rx="20" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.15"/>

            <!-- Floating Sparkles -->
            <circle cx="140" cy="140" r="4" fill="#ff758c" opacity="0.8"/>
            <circle cx="660" cy="150" r="5" fill="#ffd1dc" opacity="0.8"/>
            <circle cx="120" cy="650" r="6" fill="#ff2a6d" opacity="0.6"/>
            <circle cx="680" cy="620" r="4" fill="#ff9a9e" opacity="0.7"/>

            <!-- Big Center Glowing Heart -->
            <path d="M 400,670 C 210,510 90,370 90,235 C 90,135 170,75 260,75 C 320,75 375,115 400,165 C 425,115 480,75 540,75 C 630,75 710,135 710,235 C 710,370 590,510 400,670 Z" 
                  fill="url(#heartGlow)" opacity="0.95"/>

            <!-- Inner Heart Highlight -->
            <path d="M 400,635 C 230,485 125,355 125,235 C 125,155 190,105 260,105 C 315,105 365,140 400,185 C 435,140 485,105 540,105 C 610,105 675,155 675,235 C 675,355 570,485 400,635 Z" 
                  fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.35" stroke-dasharray="6,6"/>

            <!-- Typography Inside Heart -->
            <text x="400" y="275" font-family="sans-serif" font-size="32" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="6">I LOVE YOU</text>
            
            <text x="400" y="375" font-family="Georgia, serif" font-size="72" font-weight="bold" fill="url(#gold)" text-anchor="middle" font-style="italic">${safeName}</text>
            
            <text x="400" y="440" font-family="sans-serif" font-size="22" fill="#ffffff" opacity="0.9" text-anchor="middle" letter-spacing="4">FOREVER &amp; ALWAYS</text>
            <text x="400" y="485" font-family="sans-serif" font-size="26" fill="#ffffff" text-anchor="middle">💍 💕 ✨</text>

            <!-- Bottom Tag -->
            <text x="400" y="745" font-family="sans-serif" font-size="18" font-weight="bold" fill="#ff758c" text-anchor="middle" letter-spacing="3">POWERED BY MR SAQIB MD</text>
        </svg>`;

        return await sharp(Buffer.from(svg)).png().toBuffer();
    } catch (e) {
        console.error('[Love Image Gen Error]:', e);
        return null;
    }
}

async function loveCommand(sock, from, msg, args) {
    try {
        await sock.sendMessage(from, { react: { text: '💖', key: msg.key } }).catch(() => {});

        let rawInput = (args || []).join(' ').trim();
        let targetName = 'Nishay';

        // Check if user specifically entered a name or shortcut
        if (!rawInput || rawInput.toLowerCase() === 'n' || rawInput.toLowerCase() === 'nishay') {
            targetName = 'Nishay';
        } else if (rawInput.startsWith('@')) {
            targetName = rawInput.replace(/[^0-9a-zA-Z]/g, '');
        } else {
            targetName = rawInput.charAt(0).toUpperCase() + rawInput.slice(1);
        }

        const senderJid = msg.key.participant || msg.participant || from;
        const senderTag = `@${senderJid.split('@')[0]}`;

        // Generate Multiple Aesthetic Font Styles
        const style1 = toBoldScript(`I Love ${targetName}`);
        const style2 = toItalicScript(`I Love ${targetName}`);
        const style3 = toDoubleStruck(`I Love ${targetName}`);
        const style4 = toGothic(`I Love ${targetName}`);
        const style5 = toSmallCaps(`i love ${targetName}`);
        const style6 = toSuperscript(`i love ${targetName}`);
        const style7 = toBoxed(`I Love ${targetName}`);
        const style8 = toBubble(`i love ${targetName}`);
        const style9 = `💖 𝕚 𝕝𝕠𝕧𝕖 ${targetName.toLowerCase()} 💖`;
        const style10 = `♡ (˘ ³˘)♥ 𝓘 𝓛𝓸𝓿𝓮 𝓨𝓸𝓾 ${targetName} ♥(˘³˘ ) ♡`;

        // Random sweet shayari
        const randomQuote = romanticQuotes[Math.floor(Math.random() * romanticQuotes.length)];

        // Clean & perfectly aligned layout that NEVER breaks on mobile
        const loveCard = 
`╭━━━〔 💖 ɪ ʟᴏᴠᴇ ${targetName.toUpperCase()} 💖 〕━━━┈⊷
┃ 
┃   🌹 ✨ ${toBoldScript('I Love You')} ${toBoldScript(targetName)} ✨ 🌹
┃ 
┃ ${randomQuote}
┃ 
┃ 💍 𝐹𝑜𝓇𝑒𝓋𝑒𝓇 & 𝒜𝓁𝓌𝒶𝓎𝓈
┃ 💖 𝕃𝕠𝕧𝕖 𝕊𝕥𝕒𝕥𝕦𝕤: 𝟙𝟘𝟘% 𝕀𝕟𝕗𝕚𝕟𝕚𝕥𝕖
┃ 🔐 𝒴𝑜𝓊 𝒜𝓇𝑒 𝑀𝓎 𝐸𝓋𝑒𝓇𝓎𝓉𝒽𝒾𝓃𝑔
┃ 
┃ 🎨 *10 Aesthetic Font Styles:*
┃ ✦ 1. ${style1}
┃ ✦ 2. ${style2}
┃ ✦ 3. ${style3}
┃ ✦ 4. ${style4}
┃ ✦ 5. ${style5}
┃ ✦ 6. 💖 ${style6} 💖
┃ ✦ 7. ${style7}
┃ ✦ 8. ${style8}
┃ ✦ 9. ${style9}
┃ ✦ 10. ${style10}
┃ 
┃ 💌 𝒯𝑜: ${targetName} 💕
┃ 👑 𝐹𝓇𝑜𝓂: ${senderTag} 🌸
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

🚀 *Powered by MR SAQIB MD*`;

        // Generate glowing HD image card
        const cardImage = await generateLoveCardImage(targetName);

        const channelContext = {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: settings.newsletterJid || '120363431913895899@newsletter',
                newsletterName: settings.channelName || 'Mr SAQIB',
                serverMessageId: -1
            }
        };

        if (cardImage) {
            await sock.sendMessage(from, {
                image: cardImage,
                caption: loveCard,
                mentions: [senderJid],
                contextInfo: channelContext
            }, { quoted: msg });
        } else {
            await sock.sendMessage(from, {
                text: loveCard,
                mentions: [senderJid],
                contextInfo: channelContext
            }, { quoted: msg });
        }

    } catch (e) {
        console.error('[Love Command Error]:', e);
        await sock.sendMessage(from, {
            text: `💖 *I Love Nishay* 💖\n\nForever & Always ✨`
        }, { quoted: msg });
    }
}

module.exports = loveCommand;
