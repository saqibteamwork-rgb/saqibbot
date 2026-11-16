// plugins/style.js
// MR SAQIB MD — Text styler with fancy unicode fonts

const { cmd } = require('../arslan');

// ═══════════════════════════════════════════
//  UNICODE FONT MAPS
// ═══════════════════════════════════════════
const FONTS = {
    bold: {
        upper: '𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭',
        lower: '𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇',
        digits: '𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵',
        baseUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseLower: 'abcdefghijklmnopqrstuvwxyz',
        baseDigits: '0123456789'
    },
    italic: {
        upper: '𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡',
        lower: '𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻',
        digits: '0123456789',
        baseUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseLower: 'abcdefghijklmnopqrstuvwxyz',
        baseDigits: '0123456789'
    },
    cursive: {
        upper: '𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵',
        lower: '𝒶𝒷𝒸𝒹ℯ𝒻ℊ𝒽𝒾𝒿𝓀𝓁𝓂𝓃ℴ𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏',
        digits: '0123456789',
        baseUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseLower: 'abcdefghijklmnopqrstuvwxyz',
        baseDigits: '0123456789'
    },
    circled: {
        upper: 'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ',
        lower: 'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ',
        digits: '⓪①②③④⑤⑥⑦⑧⑨',
        baseUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseLower: 'abcdefghijklmnopqrstuvwxyz',
        baseDigits: '0123456789'
    },
    squared: {
        upper: '🅰🅱🅲🅳🅴🅵🅶🅷🅸🅹🅺🅻🅼🅽🅾🅿🆀🆁🆂🆃🆄🆅🆆🆇🆈🆉',
        lower: '🅰🅱🅲🅳🅴🅵🅶🅷🅸🅹🅺🅻🅼🅽🅾🅿🆀🆁🆂🆃🆄🆅🆆🆇🆈🆉',
        digits: '0123456789',
        baseUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseLower: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseDigits: '0123456789'
    },
    fullwidth: {
        upper: 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ',
        lower: 'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ',
        digits: '０１２３４５６７８９',
        baseUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseLower: 'abcdefghijklmnopqrstuvwxyz',
        baseDigits: '0123456789'
    },
    monospace: {
        upper: '𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉',
        lower: '𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣',
        digits: '𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿',
        baseUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseLower: 'abcdefghijklmnopqrstuvwxyz',
        baseDigits: '0123456789'
    },
    bubble: {
        upper: 'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ',
        lower: 'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ',
        digits: '⓪①②③④⑤⑥⑦⑧⑨',
        baseUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseLower: 'abcdefghijklmnopqrstuvwxyz',
        baseDigits: '0123456789'
    },
    inverted: {
        upper: '∀𐐒ƆᗡƎℲ⅁HIſ⋊⅂WNOԀΌᴚS⊥∩ΛMX⅄Z',
        lower: 'ɐqɔpǝɟƃɥıɾʞlɯuodbɹsʇnʌʍxʎz',
        digits: '0ƖᄅƐㄣϛ9ㄥ86',
        baseUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseLower: 'abcdefghijklmnopqrstuvwxyz',
        baseDigits: '0123456789'
    },
    smallcaps: {
        upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        lower: 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘQʀꜱᴛᴜᴠᴡxʏᴢ',
        digits: '0123456789',
        baseUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseLower: 'abcdefghijklmnopqrstuvwxyz',
        baseDigits: '0123456789'
    },
    script: {
        upper: '𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩',
        lower: '𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃',
        digits: '0123456789',
        baseUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseLower: 'abcdefghijklmnopqrstuvwxyz',
        baseDigits: '0123456789'
    },
    double: {
        upper: '𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ',
        lower: '𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫',
        digits: '𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡',
        baseUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        baseLower: 'abcdefghijklmnopqrstuvwxyz',
        baseDigits: '0123456789'
    }
};

function applyStyle(text, fontName) {
    const font = FONTS[fontName];
    if (!font) return text;

    let out = '';
    for (const ch of text) {
        let replaced = false;
        const upperIdx = font.baseUpper.indexOf(ch);
        if (upperIdx >= 0) {
            out += Array.from(font.upper)[upperIdx] || ch;
            replaced = true;
        }
        if (!replaced) {
            const lowerIdx = font.baseLower.indexOf(ch);
            if (lowerIdx >= 0) {
                out += Array.from(font.lower)[lowerIdx] || ch;
                replaced = true;
            }
        }
        if (!replaced) {
            const digitIdx = font.baseDigits.indexOf(ch);
            if (digitIdx >= 0) {
                out += Array.from(font.digits)[digitIdx] || ch;
                replaced = true;
            }
        }
        if (!replaced) out += ch;
    }
    return out;
}

cmd({
    pattern: 'style',
    alias: ['font', 'fancy', 'stylish'],
    desc: 'Convert text to fancy unicode styles',
    category: 'tools',
    react: '✍️',
    use: '.style <text>',
    filename: __filename
}, async (conn, mek, m, { args, reply }) => {
    try {
        const text = args.join(' ').trim();

        if (!text) {
            return reply(
`✍️ *TEXT STYLER*

📌 *Usage:* .style <text>

📖 *Example:*
.style AMAN-MD

💡 *Available styles:*
bold, italic, cursive, circled, squared, fullwidth, monospace, bubble, inverted, smallcaps, script, double`
            );
        }

        // Generate all styles
        const styles = ['bold', 'italic', 'cursive', 'circled', 'fullwidth', 'monospace', 'bubble', 'inverted', 'smallcaps', 'script', 'double'];

        let out = `✍️ *TEXT STYLES* — "${text.slice(0, 40)}"\n\n`;
        for (const styleName of styles) {
            const styled = applyStyle(text, styleName);
            out += `*${styleName}:*\n${styled}\n\n`;
        }

        return reply(out.slice(0, 4000));

    } catch (err) {
        return reply(`❌ ${err.message}`);
    }
});

// Direct style commands
for (const styleName of Object.keys(FONTS)) {
    cmd({
        pattern: styleName,
        alias: [`${styleName}font`],
        desc: `Apply ${styleName} font`,
        category: 'tools',
        react: '✍️',
        use: `.${styleName} <text>`,
        filename: __filename
    }, async (conn, mek, m, { args, reply }) => {
        const text = args.join(' ').trim();
        if (!text) return reply(`✍️ Usage: .${styleName} <text>`);
        return reply(applyStyle(text, styleName));
    });
}

console.log('[MR SAQIB MD] Text styler loaded');