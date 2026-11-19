'use strict';

/**
 * MR SAQIB MD :: Interactive Horizontal Carousel Menu (Cards Slider)
 * ============================================================================
 * Sends a native WhatsApp Carousel message (interactiveMessage with carouselMessage)
 * matching the FAM BOT / SIGMA BOY luxury card slider design:
 *   - Swipe left/right through 12 categorized cards
 *   - Image header on each card
 *   - ◈ .command diamond list styling
 *   - Interactive Quick-Reply action button on each card
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { getBotPic } = require('../lib/botpic');
const settings = require('../settings');
const config = require('../config');

// In-memory image upload cache (20-minute TTL to ensure instant delivery)
const mediaCache = new Map();
const MEDIA_TTL_MS = 20 * 60 * 1000;

async function getUploadedHeaderMedia(sock, prepareWAMessageMedia) {
    const bannerPath = path.join(__dirname, '..', 'lib', 'carousel_banner.jpg');
    const localExists = fs.existsSync(bannerPath);
    const pic = localExists ? fs.readFileSync(bannerPath) : (getBotPic(sock) || { url: settings.menuImage || 'https://ik.imagekit.io/mrsaqib/image_ePUwM_YDT.png' });
    const key = `${String(sock?.user?.id || '').split(':')[0]}|${localExists ? 'carousel_banner_ninja_v1' : pic.url}`;

    const hit = mediaCache.get(key);
    if (hit && Date.now() - hit.at < MEDIA_TTL_MS) {
        return hit.media;
    }

    if (typeof sock?.waUploadToServer !== 'function') {
        return null;
    }

    try {
        const upload = await Promise.race([
            prepareWAMessageMedia({ image: pic }, { upload: sock.waUploadToServer }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Image upload timeout')), 8000))
        ]);
        const media = upload.imageMessage;
        mediaCache.set(key, { at: Date.now(), media });
        return media;
    } catch (e) {
        console.warn('[CarouselMedia] Warning: Header image upload failed:', e.message);
        return null;
    }
}

// 12 Iconic Categories for the 12 Carousel Cards (100% Real, Working Bot Commands)
const CAROUSEL_CATEGORIES = [
    {
        name: 'MAIN & SYSTEM',
        icon: '🤖',
        filter: 'general',
        cmds: ['menu', 'allmenu', 'ping', 'runtime', 'speed', 'alive', 'botinfo', 'botstatus', 'owner', 'mode', 'public', 'private']
    },
    {
        name: 'OWNER & ADMIN',
        icon: '👑',
        filter: 'owner',
        cmds: ['broadcast', 'restart', 'setbotname', 'setownername', 'setprefix', 'addpm', 'delpm', 'ownadd', 'owndel', 'setpaircode', 'mode', 'block']
    },
    {
        name: 'GROUP MANAGEMENT',
        icon: '👥',
        filter: 'group',
        cmds: ['tagall', 'hidetag', 'kick', 'add', 'mute', 'unmute', 'promote', 'demote', 'antiadmin', 'antilink', 'antibot', 'admininform']
    },
    {
        name: 'MEDIA DOWNLOADER',
        icon: '📥',
        filter: 'download',
        cmds: ['autodl', 'tiktok', 'fb', 'ig', 'ytmp3', 'ytmp4', 'play', 'song', 'video', 'gdrive', 'mediafire', 'capcut']
    },
    {
        name: 'AI & CHATBOT',
        icon: '🧠',
        filter: 'ai',
        cmds: ['ai', 'gpt', 'gemini', 'imagine', 'bard', 'tts', 'say', 'sticker', 'toimg', 'tourl', 'removebg', 'attp']
    },
    {
        name: 'ISLAMIC & DEEN',
        icon: '🕌',
        filter: 'islamic',
        cmds: ['quran', 'surah', 'ayat', 'hadith', 'dua', 'azkar', 'allnamaz', 'hijri', 'allahname', 'durood', 'hajjguide', 'dailyhadith']
    },
    {
        name: 'FUN & GAMES',
        icon: '🎮',
        filter: 'fun',
        cmds: ['ludo', 'bubblepop', 'games', 'ttt', 'wordguess', 'mathspeed', 'slot', 'dice', 'roll', 'joke', 'meme', 'trivia']
    },
    {
        name: 'ANIME & WEEB',
        icon: '🎌',
        filter: 'anime',
        cmds: ['anime', 'animecharacters', 'animesearch', 'animequote', 'waifu', 'neko', 'wallpaper', 'animedance', 'animecuddle', 'animenews', 'animeship', 'animestatus']
    },
    {
        name: 'LOOKUP & TOOLS',
        icon: '🛠️',
        filter: 'tools',
        cmds: ['tourl', 'addreply', 'delreply', 'listreply', 'autoreply', 'shorturl', 'calc', 'weather', 'translate', 'qrcode', 'trackip', 'simdata']
    },
    {
        name: 'AUDIO & MUSIC',
        icon: '🎵',
        filter: 'audio',
        cmds: ['bgmusic', 'bass', 'blown', 'deep', 'earrape', 'fast', 'nightcore', 'reverse', 'robot', 'slow', 'smooth', 'tomp3']
    },
    {
        name: 'SEARCH & DISCOVERY',
        icon: '🔍',
        filter: 'search',
        cmds: ['google', 'yts', 'lyrics', 'pinterest', 'github', 'apk', 'news', 'playstore', 'gsearch', 'sc', 'deviceinfo', 'whois']
    },
    {
        name: 'SECURITY & ANTI',
        icon: '🛡️',
        filter: 'security',
        cmds: ['antiadmin', 'antilink', 'antibot', 'anticall', 'antidelete', 'antispam', 'antistatus', 'autoreact', 'autoread', 'lockgroup', 'unlockgroup', 'antitag']
    }
];

function quickReply(text, id) {
    return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: text, id })
    };
}

async function sendSwipeCarouselMenu(sock, from, msg, botName = 'MR SAQIB MD', ownerName = 'Mr SAQIB', prefix = '.') {
    // Instant loading reaction
    await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(() => {});

    try {
        const baileys = require('@whiskeysockets/baileys');
        const { proto, prepareWAMessageMedia, generateWAMessageFromContent } = baileys;
        const IM = proto.Message.InteractiveMessage;

        // Fetch / cache header image for the cards
        const imageMessage = await getUploadedHeaderMedia(sock, prepareWAMessageMedia);

        const cardHeader = IM.Header.fromObject({
            title: '',
            subtitle: '',
            hasMediaAttachment: Boolean(imageMessage),
            ...(imageMessage ? { imageMessage } : {})
        });

        const totalCards = CAROUSEL_CATEGORIES.length;
        const cards = [];

        CAROUSEL_CATEGORIES.forEach((cat, idx) => {
            const indexStr = `${idx + 1}/${totalCards}`;
            const cardBodyText =
                `${cat.icon} *${cat.name} (${indexStr})*\n\n` +
                cat.cmds.map(c => `◈ ${prefix}${c}`).join('\n');

            const cardFooterText = `🔥 ${botName} | Card ${indexStr}`;

            const buttons = [
                quickReply(`⚡ Open ${cat.name}`, `${prefix}menu ${cat.filter}`),
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: '🟢 WA Channel',
                        url: 'https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M',
                        merchant_url: 'https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M'
                    })
                }
            ];

            cards.push({
                header: cardHeader,
                body: IM.Body.fromObject({ text: cardBodyText }),
                footer: IM.Footer.fromObject({ text: cardFooterText }),
                nativeFlowMessage: IM.NativeFlowMessage.fromObject({ buttons })
            });
        });

        // Top message header matching the user's screenshot
        const mainIntroText =
            `⚡³*${botName.toUpperCase()}*⁴⚡\n` +
            `📚 *ALL MENU*\n\n` +
            `Swipe through the cards to see all available commands.\n\n` +
            `🔥 *Powered by ${ownerName}* | _Swipe left/right_`;

        const interactive = IM.create({
            body: IM.Body.create({ text: mainIntroText }),
            footer: IM.Footer.create({ text: `Powered by ${botName} | Swipe ⬅️ ➡️` }),
            carouselMessage: IM.CarouselMessage.fromObject({
                cards,
                messageVersion: 1
            })
        });

        const metaAiQuote = {
            key: {
                fromMe: false,
                participant: '0@s.whatsapp.net',
                remoteJid: 'status@broadcast',
                id: `META_CAROUSEL_${Date.now()}`
            },
            message: {
                contactMessage: {
                    displayName: `! ${botName} !`,
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Meta AI\nORG:Meta AI;\nTEL;type=CELL;waid=13135550002:+13135550002\nEND:VCARD`
                }
            }
        };

        const sendOpts = { userJid: sock.user?.id, quoted: metaAiQuote };

        const waMsg = generateWAMessageFromContent(from, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: interactive
                }
            }
        }, sendOpts);

        // Relay interactive message with biz native_flow node
        await sock.relayMessage(from, waMsg.message, {
            messageId: waMsg.key.id,
            additionalNodes: [{
                tag: 'biz',
                attrs: {},
                content: [{
                    tag: 'interactive',
                    attrs: { type: 'native_flow', v: '1' },
                    content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                }]
            }]
        });

        return true;
    } catch (err) {
        console.error('[sendSwipeCarouselMenu Error]:', err.stack || err.message);
        // Fallback to text menu
        const fallbackText =
            `⚡³*${botName.toUpperCase()}*⁴⚡\n` +
            `📚 *ALL MENU*\n\n` +
            CAROUSEL_CATEGORIES.map((cat, i) =>
                `${cat.icon} *${cat.name} (${i + 1}/12)*\n` + cat.cmds.map(c => `◈ ${prefix}${c}`).join('\n')
            ).join('\n\n') +
            `\n\n> *Powered by ${ownerName}*`;

        await sock.sendMessage(from, { text: fallbackText }, { quoted: msg }).catch(() => {});
        return false;
    }
}

module.exports = {
    sendSwipeCarouselMenu,
    CAROUSEL_CATEGORIES
};
