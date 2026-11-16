// plugins/feelings.js
// MR SAQIB MD — 40+ Emotion Commands
// Each command fetches GIF matching its exact emotion

const { cmd } = require('../arslan');
const axios = require('axios');

const NEKOS_BEST = 'https://nekos.best/api/v2';
const WAIFU_PICS = 'https://api.waifu.pics/sfw';
const UA = 'SAQIB-MD/3.0';

async function get(url) {
    const res = await axios.get(url, {
        timeout: 12000,
        headers: { 'User-Agent': UA }
    });
    return res.data;
}

const isUrl = v => typeof v === 'string' && /^https?:\/\//i.test(v);

// ═══════════════════════════════════════════
//  GIF FETCHER — tries Nekos.best then waifu.pics
//  Same category → same emotion
// ═══════════════════════════════════════════
async function fetchGif(category) {
    // 1. Nekos.best (primary)
    try {
        const d = await get(`${NEKOS_BEST}/${category}?amount=1`);
        const r = d?.results?.[0];
        if (r?.url && isUrl(r.url)) {
            return { url: r.url, artist: r.artist_name, anime: r.anime_name };
        }
    } catch (e) { /* silent */ }

    // 2. waifu.pics (fallback — same category name)
    try {
        const d = await get(`${WAIFU_PICS}/${category}`);
        if (d?.url && isUrl(d.url)) return { url: d.url };
    } catch (e) { /* silent */ }

    // 3. waifu.pics alternate mapping (some categories differ)
    const alt = {
        happy: 'happy', smile: 'smile', laugh: 'happy',
        cry: 'cry', sad: 'cry', dance: 'dance', wink: 'wink',
        wave: 'wave', hug: 'hug', kiss: 'kiss', cuddle: 'cuddle',
        pat: 'pat', handhold: 'handhold', blush: 'blush',
        slap: 'slap', punch: 'bonk', kick: 'kick', bite: 'bite',
        poke: 'poke', nom: 'nom', sleep: 'sleep', yawn: 'sleep',
        stare: 'stare', smug: 'smug', think: 'think',
        tickle: 'tickle', pout: 'bully', facepalm: 'bonk',
        nope: 'bonk', shrug: 'bonk', highfive: 'highfive',
        thumbsup: 'highfive', yeet: 'yeet'
    };
    if (alt[category] && alt[category] !== category) {
        try {
            const d = await get(`${WAIFU_PICS}/${alt[category]}`);
            if (d?.url && isUrl(d.url)) return { url: d.url };
        } catch (e) { /* silent */ }
    }

    return null;
}

// ═══════════════════════════════════════════
//  COMMAND REGISTER HELPER
// ═══════════════════════════════════════════
function emotion(pattern, aliases, category, emoji, caption) {
    cmd({
        pattern,
        alias: aliases,
        desc: `${caption} anime GIF`,
        category: 'emotions',
        react: emoji,
        use: `.${pattern}`,
        filename: __filename
    }, async (conn, mek, m, ctx) => {
        try {
            const r = await fetchGif(category);
            if (!r?.url) {
                return ctx.reply(`❌ *${caption}* GIF unavailable. Dobara try karo.`);
            }

            let cap = `${emoji} ${caption}`;
            if (r.anime) cap += `\n📺 ${String(r.anime).slice(0, 80)}`;
            if (r.artist) cap += `\n🎨 ${String(r.artist).slice(0, 60)}`;

            return conn.sendMessage(ctx.from, {
                video: { url: r.url },
                gifPlayback: true,
                caption: cap
            }, { quoted: mek });

        } catch (e) {
            console.warn(`[feelings] ${pattern}:`, e.message);
            return ctx.reply(`❌ ${caption} GIF fail.`);
        }
    });
}

// ═══════════════════════════════════════════
//  😄 HAPPY — 6 commands
// ═══════════════════════════════════════════
emotion('happy',     ['khush', 'feelhappy'],           'happy',     '😄', '*HAPPY!*');
emotion('smile',     ['smiling', 'muskuray'],           'smile',     '😊', '*SMILE*');
emotion('laugh',     ['hasi', 'lol', 'laughing'],       'laugh',     '😂', '*HAHAHA!*');
emotion('dance',     ['nach', 'party', 'dancing'],      'dance',     '💃', '*DANCING!*');
emotion('wink',      ['winking', 'ankh'],               'wink',      '😉', '*WINK*');
emotion('wave',      ['hello', 'hi', 'waving'],         'wave',      '👋', '*HELLO!*');

// ═══════════════════════════════════════════
//  😢 SAD — 6 commands
// ═══════════════════════════════════════════
emotion('sad',       ['dukhi', 'feelsad'],              'cry',       '😢', '*SAD...*');
emotion('cry',       ['rona', 'tears', 'crying'],       'cry',       '😭', '*CRYING...*');
emotion('pout',      ['gussa', 'pouting'],              'pout',      '😤', '*POUTING*');
emotion('facepalm',  ['fp', 'facep'],                   'facepalm',  '🤦', '*FACEPALM*');
emotion('bored',     ['boring', 'meh'],                 'bored',     '😐', '*BORED...*');
emotion('nope',      ['nahi', 'no'],                    'nope',      '🙅', '*NOPE!*');

// ═══════════════════════════════════════════
//  ❤️ LOVE — 7 commands
// ═══════════════════════════════════════════
emotion('hug',       ['gale', 'hugging'],               'hug',       '🫂', '*HUG*');
emotion('kiss',      ['pyaar', 'chumma', 'kissing'],    'kiss',      '💋', '*KISS*');
emotion('cuddle',    ['cuddling', 'cud'],               'cuddle',    '🥰', '*CUDDLE*');
emotion('pat',       ['headpat', 'sehr'],               'pat',       '🖐️', '*HEADPAT*');
emotion('handhold',  ['hold', 'hand'],                  'handhold',  '🤝', '*HAND HOLD*');
emotion('blush',     ['sharma', 'blushing'],            'blush',     '😳', '*BLUSH*');
emotion('love',      ['iloveyou', 'pyar'],              'cuddle',    '❤️', '*LOVE*');

// ═══════════════════════════════════════════
//  😡 ANGRY — 6 commands
// ═══════════════════════════════════════════
emotion('slap',      ['thappar', 'slapping'],           'slap',      '👋', '*SLAP!*');
emotion('punch',     ['mukka', 'punching'],             'punch',     '👊', '*PUNCH!*');
emotion('kick',      ['laat', 'kicking'],               'kick',      '🦵', '*KICK!*');
emotion('bite',      ['kaat', 'biting'],                'bite',      '🦷', '*BITE!*');
emotion('poke',      ['chubh', 'poking'],               'poke',      '👉', '*POKE*');
emotion('angry',     ['gussa', 'furious'],              'pout',      '😡', '*ANGRY!*');

// ═══════════════════════════════════════════
//  🤪 FUN / SILLY — 8 commands
// ═══════════════════════════════════════════
emotion('nom',       ['khana', 'eating'],               'nom',       '🍽️', '*NOM NOM*');
emotion('sleep',     ['sona', 'sleepy'],                'sleep',     '😴', '*SLEEPY...*');
emotion('yawn',      ['yawning'],                       'yawn',      '🥱', '*YAWN*');
emotion('stare',     ['ghoor', 'staring'],              'stare',     '👀', '*STARE*');
emotion('smug',      ['smart', 'smirking'],             'smug',      '😏', '*SMUG*');
emotion('think',     ['sochna', 'thinking'],            'think',     '🤔', '*THINKING...*');
emotion('tickle',    ['tickling'],                      'tickle',    '🪶', '*TICKLE*');
emotion('shrug',     ['idk', 'pataNahi'],               'shrug',     '🤷', '*SHRUG*');

// ═══════════════════════════════════════════
//  🎉 PARTY / WIN — 5 commands
// ═══════════════════════════════════════════
emotion('thumbsup',  ['like', 'ok', 'thumbs'],          'thumbsup',  '👍', '*THUMBS UP!*');
emotion('highfive',  ['high5', 'hf'],                   'highfive',  '🙌', '*HIGH FIVE!*');
emotion('yeet',      ['yeeting'],                       'yeet',      '🚀', '*YEET!*');
emotion('nod',       ['yes', 'haan'],                   'nod',       '✅', '*NOD*');
emotion('lurk',      ['watching', 'dekh'],              'lurk',      '👁️', '*LURKING...*');

// ═══════════════════════════════════════════
//  EXTRA — 3 commands
// ═══════════════════════════════════════════
emotion('cringe',    ['cringing'],                      'cringe',    '😬', '*CRINGE*');
emotion('bonk',      ['bonking', 'hit'],                'slap',      '🔨', '*BONK!*');
emotion('shoot',     ['shooting'],                      'punch',     '🔫', '*SHOOT!*');

// ═══════════════════════════════════════════
//  .feelings — list all
// ═══════════════════════════════════════════
cmd({
    pattern: 'feelings',
    alias: ['emotions', 'feels', 'emojis', 'gifs'],
    desc: 'Show all emotion commands',
    category: 'emotions',
    react: '💫',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    return ctx.reply(
`💫 *SAQIB EMOTIONS — 40+ Commands*

😄 *HAPPY (6):*
.happy .smile .laugh .dance .wink .wave

😢 *SAD (6):*
.sad .cry .pout .facepalm .bored .nope

❤️ *LOVE (7):*
.hug .kiss .cuddle .pat .handhold .blush .love

😡 *ANGRY (6):*
.slap .punch .kick .bite .poke .angry

🤪 *FUN (8):*
.nom .sleep .yawn .stare .smug .think .tickle .shrug

🎉 *PARTY (5):*
.thumbsup .highfive .yeet .nod .lurk

🎬 *EXTRA (3):*
.cringe .bonk .shoot

💛 *SUPPORT:*
.mood <happy|sad|angry|tired|lonely|grateful> .comfort .affirmation

💡 Har command apna exact emotion GIF bhejta hai
🎬 Powered by Nekos.best + waifu.pics`
    );
});

// ═══════════════════════════════════════════
//  .emotion <name> — direct call
// ═══════════════════════════════════════════
cmd({
    pattern: 'emotion',
    alias: ['gif', 'feeling', 'animegif'],
    desc: 'Get any emotion GIF: .emotion <name>',
    category: 'emotions',
    react: '🎬',
    use: '.emotion hug',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const name = (ctx.q || '').toLowerCase().trim().split(/\s+/)[0];

    const map = {
        // happy
        happy: 'happy', smile: 'smile', laugh: 'laugh', dance: 'dance',
        wink: 'wink', wave: 'wave',
        // sad
        sad: 'cry', cry: 'cry', pout: 'pout', facepalm: 'facepalm',
        bored: 'bored', nope: 'nope',
        // love
        hug: 'hug', kiss: 'kiss', cuddle: 'cuddle', pat: 'pat',
        handhold: 'handhold', blush: 'blush', love: 'cuddle',
        // angry
        slap: 'slap', punch: 'punch', kick: 'kick', bite: 'bite',
        poke: 'poke', angry: 'pout',
        // fun
        nom: 'nom', sleep: 'sleep', yawn: 'yawn', stare: 'stare',
        smug: 'smug', think: 'think', tickle: 'tickle', shrug: 'shrug',
        // party
        thumbsup: 'thumbsup', highfive: 'highfive', yeet: 'yeet',
        nod: 'nod', lurk: 'lurk',
        // extra
        cringe: 'cringe', bonk: 'slap', shoot: 'punch'
    };

    if (!name || !map[name]) {
        return ctx.reply(
`🎬 *EMOTION GIF*

📌 *Usage:* .emotion <name>

📖 *Example:* .emotion hug

💡 *Available:* ${Object.keys(map).join(', ')}`
        );
    }

    try {
        const r = await fetchGif(map[name]);
        if (!r?.url) return ctx.reply('❌ GIF unavailable.');

        let cap = `💫 *${name.toUpperCase()}*`;
        if (r.anime) cap += `\n📺 ${String(r.anime).slice(0, 80)}`;
        if (r.artist) cap += `\n🎨 ${String(r.artist).slice(0, 60)}`;

        return conn.sendMessage(ctx.from, {
            video: { url: r.url },
            gifPlayback: true,
            caption: cap
        }, { quoted: mek });

    } catch (e) {
        return ctx.reply('❌ Failed.');
    }
});

const pick = items => items[Math.floor(Math.random() * items.length)];
const moodReplies = {
    happy: ['😄 Nice—enjoy the good moment, you earned it.', '✨ Hold onto this feeling; little wins count too.'],
    sad: ['🫂 You do not have to solve everything right now. Take one small step and give yourself some room.', '💙 It is okay to have a rough day. You deserve patience, including from yourself.'],
    angry: ['🌿 Pause for a breath before replying. You can choose what deserves your energy.', '🧊 Step away for a minute if you can; a little space can help.'],
    tired: ['😴 Rest is productive too. Take a break and come back when you have a little more energy.', '☕ One thing at a time. You do not need to finish everything this minute.'],
    lonely: ['🫂 You matter, even when it feels quiet. Consider messaging someone you trust.', '💛 A small hello to someone safe can make the day feel less heavy.'],
    grateful: ['🌼 Take a second to notice what is going right—you can appreciate it without pretending everything is perfect.', '✨ Keep that good feeling close, and share it with someone if you can.']
};
const comforts = [
    '🫂 You do not need to have all the answers today. Breathe, take the next small step, and be kind to yourself.',
    '💙 A difficult moment is not your whole story. You deserve care and a little time to reset.',
    '🌿 Pause, unclench your shoulders, and take one slow breath. You can handle the next step when you are ready.'
];
const affirmations = [
    '🌱 I can take things one step at a time.',
    '💛 My feelings are real, and I can treat myself with patience.',
    '✨ I am allowed to rest and still be making progress.',
    '🌿 I do not need to be perfect to be worthy of respect.'
];

cmd({
    pattern: 'mood',
    alias: ['moodcheck'],
    desc: 'Get a gentle response for your current mood',
    category: 'emotions',
    react: '💛',
    use: '.mood happy|sad|angry|tired|lonely|grateful',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const mood = (ctx.q || '').trim().toLowerCase();
    if (mood && !moodReplies[mood]) {
        return ctx.reply(`💛 Choose one: ${Object.keys(moodReplies).join(', ')}\nExample: .mood tired`);
    }
    const chosen = mood || pick(Object.keys(moodReplies));
    return ctx.reply(`💛 *${chosen.toUpperCase()}*\n${pick(moodReplies[chosen])}`);
});

cmd({
    pattern: 'comfort',
    alias: ['tasalli', 'comfortme'],
    desc: 'Send a supportive, calming message',
    category: 'emotions',
    react: '🫂',
    filename: __filename
}, async (conn, mek, m, ctx) => ctx.reply(pick(comforts)));

cmd({
    pattern: 'affirmation',
    alias: ['positive', 'selftalk'],
    desc: 'Get a kind affirmation',
    category: 'emotions',
    react: '🌱',
    filename: __filename
}, async (conn, mek, m, ctx) => ctx.reply(pick(affirmations)));

console.log('[MR SAQIB MD] emotion commands loaded');