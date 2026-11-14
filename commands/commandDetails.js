'use strict';

/**
 * MR SAQIB MD :: COMMAND DETAILS & USAGE GUIDE ENGINE
 * ============================================================================
 * Triggered when a user types:
 * - .<command> d          (e.g. .arc d, .kick d, .rs d, .play d, .tiktok d)
 * - .d <command>          (e.g. .d arc, .d kick, .d rs, .d ytmp3)
 * - .help <command>       (e.g. .help arc, .help kick)
 * ============================================================================
 */

const COMMAND_GUIDES = {
  // ---------------------------------------------------------------------------
  // CHANNEL & POLL COMMANDS
  // ---------------------------------------------------------------------------
  arc: {
    name: 'arc',
    aliases: ['autochreact'],
    category: 'CHANNEL',
    permission: 'Owner Only 👑',
    usage: '.arc add <link> [emojis] [count] [delay=5s] <passcode>\n.arc on | .arc off | .arclist | .arcdel <link> | .arcstop <link|all>',
    desc: 'WhatsApp Channel par auto reaction lagane ka complete system. Channel add karne ke baad aane wali har nayi post par automatically specified emoji react ho jati hai.',
    params: [
      '<link>: Channel ka WhatsApp invite link ya JID',
      '[emojis]: Emojis list jo lagani hain (e.g. ❤️,🔥,⚡ ya "all")',
      '[count]: Kitne bot accounts react karein (e.g. 3, 5, all)',
      '[delay=5s]: Post aane ke kitni der baad react kare (default: 5s)',
      '<passcode>: Security passcode (Default: arc123)'
    ],
    examples: [
      '.arc add https://whatsapp.com/channel/0029VaXXXXX ❤️,🔥 3 5s arc123',
      '.arc on',
      '.arclist',
      '.arcdel https://whatsapp.com/channel/0029VaXXXXX',
      '.arcstop all'
    ]
  },
  chautojoin: {
    name: 'chautojoin',
    aliases: ['autojoin', 'chjoin'],
    category: 'CHANNEL',
    permission: 'Owner Only 👑',
    usage: '.chautojoin <channel_link>',
    desc: 'Tamam connected bot accounts (Muhammad Saqib, Mrsaqib, 😳😉) se ek click mein kisi bhi channel ko follow/join karwayein.',
    params: [
      '<channel_link>: WhatsApp Channel ka link'
    ],
    examples: [
      '.chautojoin https://whatsapp.com/channel/0029VaXXXXX'
    ]
  },
  chreact: {
    name: 'chreact',
    aliases: ['channelreact'],
    category: 'CHANNEL',
    permission: 'Everyone 🌐',
    usage: '.chreact <channel_post_link> [emoji]',
    desc: 'Kisi bhi WhatsApp channel post par tamam connected bot accounts se live emoji react karein.',
    params: [
      '<channel_post_link>: Post ka link (whatsapp.com/channel/xxx/post_id)',
      '[emoji]: Emoji jo lagani hai (default: ❤️)'
    ],
    examples: [
      '.chreact https://whatsapp.com/channel/0029Va.../123 🔥',
      '.chreact https://whatsapp.com/channel/0029Va.../123 😂'
    ]
  },
  chreactall: {
    name: 'chreactall',
    aliases: [],
    category: 'CHANNEL',
    permission: 'Everyone 🌐',
    usage: '.chreactall <channel_link> [emoji]',
    desc: 'Channel ki recent 5 posts par tamam connected bot sessions se reactions lagayein.',
    params: [
      '<channel_link>: Channel link',
      '[emoji]: Reaction emoji (default: 🔥)'
    ],
    examples: [
      '.chreactall https://whatsapp.com/channel/0029Va... ❤️'
    ]
  },
  pollvote: {
    name: 'pollvote',
    aliases: ['vote', 'chvote'],
    category: 'CHANNEL & GROUP',
    permission: 'Everyone 🌐',
    usage: '.pollvote <option_number_or_name>',
    desc: 'Channel Poll ya Group Poll ko reply karke tamam bot sessions se authentic encrypted vote dalein.',
    params: [
      '<option>: Option number (1, 2, 3) ya Option ka naam'
    ],
    examples: [
      '(Poll ko reply karein) ➜ .pollvote 1',
      '(Poll ko reply karein) ➜ .pollvote Pakistan'
    ]
  },
  pollrand: {
    name: 'pollrand',
    aliases: [],
    category: 'CHANNEL & GROUP',
    permission: 'Everyone 🌐',
    usage: '.pollrand',
    desc: 'Kisi poll ko reply karein, bot randomly kisi bhi option par real vote cast karega.',
    params: ['Kisi poll ko reply karein'],
    examples: ['.pollrand']
  },

  // ---------------------------------------------------------------------------
  // STICKER & REACTION COMMANDS
  // ---------------------------------------------------------------------------
  rs: {
    name: 'rs',
    aliases: ['rs5', 'rs10', 'rs20', 'sreact', 'rsmix'],
    category: 'STICKER & REACTION',
    permission: 'Everyone 🌐',
    usage: '.rs [count]\n.rs <name> <count>\n.rs mix <count>',
    desc: 'WhatsApp native sticker reaction (associationType 11). Agar sticker name na dein to tamam saved stickers ka MIXUP (Combo) react hoga! Agar specific name dein to sirf wahi sticker react hoga.',
    params: [
      '[count]: Kitni bar react karna hai (default: 5, max: 20)',
      '[name]: Kisi specific sticker ka naam (e.g. dog, cat) ya "mix" tamam saved stickers ke liye'
    ],
    examples: [
      '(Message ko reply karein) ➜ .rs 5  (Tamam saved stickers ka Mixup combo)',
      '(Message ko reply karein) ➜ .rs 10 (10 bar Mixup combo)',
      '(Message ko reply karein) ➜ .rs dog 5 (Sirf dog sticker)'
    ]
  },
  was: {
    name: 'was',
    aliases: ['lottie', 'asticker', 'avatar'],
    category: 'STICKER & REACTION',
    permission: 'Everyone 🌐',
    usage: '.was [name]',
    desc: 'Single WhatsApp native sticker/avatar reaction. Replied message ke neeche animated dog sticker react karta hai.',
    params: [
      '[name]: Optional sticker name (default: dog)'
    ],
    examples: [
      '(Message ko reply karein) ➜ .was'
    ]
  },
  mt: {
    name: 'mt',
    aliases: ['mimic', 'voicecopy', 'mirrorvoice', 'voicereply', 'samevoice'],
    category: 'AUDIO & VOICE',
    permission: 'Everyone 🌐',
    usage: '.mt\n.mt fresh\n.mt keep',
    desc: 'Voice Note Mimic / Mirror Tool: Kisi ki bhi aane wali Voice Note ya Audio ko reply karein, bot wahi exact same voice note hamari taraf se (WhatsApp Voice Note / PTT format mein) send kar dega.',
    params: [
      '(Koi parameter zaroori nahi, sirf voice note ko reply karein)',
      'fresh: Bina kisi quote ke fresh voice note send karega',
      'keep: Command message (.mt) ko chat se delete nahi karega'
    ],
    examples: [
      '(Kisi ki voice note ko reply karein) ➜ .mt',
      '(Voice note ko reply karein) ➜ .mt fresh'
    ]
  },
  autoreact: {
    name: 'autoreact',
    aliases: ['autoreacts', 'autoreaction', 'reactauto'],
    category: 'BOT SETTINGS & SECURITY',
    permission: 'Owner Only 👑',
    usage: '.autoreact on\n.autoreact off\n.autoreact',
    desc: 'Aane wale har message par automatically random emojis react karne ka system toggle karein.',
    params: [
      'on: Auto reaction chalu karein',
      'off: Auto reaction band karein'
    ],
    examples: [
      '.autoreact on',
      '.autoreact off',
      '.autoreact'
    ]
  },
  sts: {
    name: 'sts',
    aliases: ['savesticker', 'addsticker'],
    category: 'STICKER & REACTION',
    permission: 'Everyone 🌐',
    usage: '.sts <name>\n.sts list\n.sts del <name>',
    desc: 'Kisi bhi WhatsApp sticker ko reply karke apne bot ke database mein save karein taake baad mein use react (.rs) kar sakein.',
    params: [
      '<name>: Sticker ka custom naam (e.g. dog, cat, fire)',
      'list: Tamam saved stickers dekhne ke liye',
      'del <name>: Kisi sticker ko delete karne ke liye'
    ],
    examples: [
      '(Sticker ko reply karein) ➜ .sts dog',
      '.sts list',
      '.sts del cat'
    ]
  },
  sticker: {
    name: 'sticker',
    aliases: ['s', 'stickergif'],
    category: 'STICKER & REACTION',
    permission: 'Everyone 🌐',
    usage: '.s [pack_name|author]',
    desc: 'Kisi bhi image ya video/gif ko reply karke instant high quality WhatsApp sticker banayein.',
    params: [
      'Image ya short video (under 10s) ko reply karein'
    ],
    examples: [
      '(Photo ko reply karein) ➜ .s',
      '(Photo ko reply karein) ➜ .s MR SAQIB | BOT'
    ]
  },

  // ---------------------------------------------------------------------------
  // GROUP MANAGEMENT COMMANDS
  // ---------------------------------------------------------------------------
  kick: {
    name: 'kick',
    aliases: ['remove'],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.kick <@tag / reply>',
    desc: 'Group ke kisi member ko group se bahar nikaalein (kick karein).',
    params: [
      '@tag: User ko mention karein ya uske message ko reply karein'
    ],
    examples: [
      '.kick @923xxxxxxxxx',
      '(Member ke message ko reply karein) ➜ .kick'
    ]
  },
  add: {
    name: 'add',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.add <number>',
    desc: 'Kisi bhi phone number ko group mein add karein. Agar user ki privacy lagi ho to bot auto invite link bhej deta hai.',
    params: [
      '<number>: International format number bina plus ke (e.g. 923xxxxxxxxx)'
    ],
    examples: [
      '.add 923176263788'
    ]
  },
  promote: {
    name: 'promote',
    aliases: ['admin'],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.promote <@tag / reply>',
    desc: 'Group member ko group admin banayein.',
    params: ['User ko tag karein ya message reply karein'],
    examples: ['.promote @923xxxxxxxxx']
  },
  demote: {
    name: 'demote',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.demote <@tag / reply>',
    desc: 'Group admin ko normal member par demote karein.',
    params: ['Admin ko tag karein ya message reply karein'],
    examples: ['.demote @923xxxxxxxxx']
  },
  tagall: {
    name: 'tagall',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.tagall [message]',
    desc: 'Group ke tamam members ko numbered list ke sath tag karein taake sab tak paigham pohnche.',
    params: [
      '[message]: Optional custom notice / message'
    ],
    examples: [
      '.tagall Important Meeting',
      '.tagall Match shuru hone wala hai!'
    ]
  },
  hidetag: {
    name: 'hidetag',
    aliases: ['htag'],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.hidetag <message>',
    desc: 'Tamam group members ko invisible/hidden tag ke sath mention karein bina numbers ki lambi list dikhaye.',
    params: [
      '<message>: Paigham jo sabko bhejna hai'
    ],
    examples: [
      '.hidetag Sub active ho jao!'
    ]
  },
  warn: {
    name: 'warn',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.warn <@tag / reply>',
    desc: 'Member ko warning dein. 3 warnings hone par user auto kick ho jayega.',
    params: ['User ko tag ya reply karein'],
    examples: ['.warn @923xxxxxxxxx']
  },
  unwarn: {
    name: 'unwarn',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.unwarn <@tag / reply>',
    desc: 'Member ki 1 warning kam karein.',
    params: ['User ko tag ya reply karein'],
    examples: ['.unwarn @923xxxxxxxxx']
  },
  mute: {
    name: 'mute',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.mute <@tag / reply>',
    desc: 'Kisi specific user ko group mein mute karein. Muted user ka aane wala har message bot auto-delete kar dega.',
    params: ['User ko tag ya reply karein'],
    examples: ['.mute @923xxxxxxxxx']
  },
  unmute: {
    name: 'unmute',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.unmute <@tag / reply>',
    desc: 'Muted user ko unmute karein taake wo messages bhej sake.',
    params: ['User ko tag ya reply karein'],
    examples: ['.unmute @923xxxxxxxxx']
  },
  lock: {
    name: 'lock',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.lock',
    desc: 'Group settings ko lock karein taake sirf Admins group ka name/icon/description change kar sakein.',
    params: [],
    examples: ['.lock']
  },
  unlock: {
    name: 'unlock',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.unlock',
    desc: 'Group settings unlock karein taake all members info edit kar sakein.',
    params: [],
    examples: ['.unlock']
  },
  end: {
    name: 'end',
    aliases: ['closegroup'],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.end',
    desc: 'Group chat ko close karein. Sirf admins messages bhej sakenge.',
    params: [],
    examples: ['.end']
  },
  grouplink: {
    name: 'grouplink',
    aliases: ['linkgc'],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.grouplink',
    desc: 'Group ka invite link nikaal kar deta hai.',
    params: [],
    examples: ['.grouplink']
  },
  revokelink: {
    name: 'revokelink',
    aliases: ['resetlink'],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.revokelink',
    desc: 'Purana group link expire karke naya invite link generate karein.',
    params: [],
    examples: ['.revokelink']
  },
  acceptall: {
    name: 'acceptall',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.acceptall',
    desc: 'Group ki tamam pending join requests ko ek sath approve karein.',
    params: [],
    examples: ['.acceptall']
  },
  rejectall: {
    name: 'rejectall',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.rejectall',
    desc: 'Tamam pending join requests ko reject karein.',
    params: [],
    examples: ['.rejectall']
  },
  requests: {
    name: 'requests',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.requests',
    desc: 'Group ki tamam pending join requests ki list dikhaye.',
    params: [],
    examples: ['.requests']
  },
  setwelcome: {
    name: 'setwelcome',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.setwelcome <message>',
    desc: 'Naye aane walon ke liye custom welcome message set karein.',
    params: ['<message>: Custom text. Use @user aur @group keywords'],
    examples: ['.setwelcome Khushamdeed @user to our group @group!']
  },
  setgoodbye: {
    name: 'setgoodbye',
    aliases: [],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.setgoodbye <message>',
    desc: 'Group chhodne walon ke liye custom goodbye message set karein.',
    params: ['<message>: Custom text'],
    examples: ['.setgoodbye Allah Hafiz @user!']
  },
  del: {
    name: 'del',
    aliases: ['delete'],
    category: 'GROUP',
    permission: 'Admin Only 🛡️',
    usage: '.del',
    desc: 'Group mein kisi bhi message ko reply karke `.del` likhein to bot us message ko delete kar dega.',
    params: ['Delete karne wale message ko reply karein'],
    examples: ['(Message ko reply karein) ➜ .del']
  },
  antistatus: {
    name: 'antistatus',
    aliases: ['antistatues', 'nostatus'],
    category: 'SECURITY',
    permission: 'Admin Only 🛡️',
    usage: '.antistatus delete | .antistatus kick | .antistatus off',
    desc: 'Group mein status mention / status broadcast share karne par automatic action leta hai (delete ya kick).',
    params: [
      'delete: Status mention ko auto delete karega',
      'kick: Status mention delete karega aur bhejny wale ko group se remove (kick) karega',
      'off: Status protection band karega'
    ],
    examples: ['.antistatus delete', '.antistatus kick', '.antistatus off']
  },
  save: {
    name: 'save',
    aliases: ['statussave', 'saveme', 'downloadstatus'],
    category: 'DOWNLOAD',
    permission: 'Everyone 🌐',
    usage: '.save (status ya media ko reply karein)',
    desc: 'Kisi ka bhi WhatsApp Status (photo, video, audio, text) ya koi bhi media/view-once message download karke save karta hai.',
    params: ['Status ya media message ko reply karein (ya status pe direct "save", "bhejo", "❤️", "nice" bhejein)'],
    examples: ['(Status par reply) ➜ .save', '(Photo/Video par reply) ➜ .save']
  },
  silentsave: {
    name: 'silentsave',
    aliases: ['autosave', 'ssave', 'silentstatus'],
    category: 'MEDIA & STATUS',
    permission: 'Owner Only 👑',
    usage: '.silentsave\n.silentsave on\n.silentsave off',
    desc: 'Status ya View-Once media par ❤️, 💔, good, nice, sad, broken heart, acha, thanks bhejne par automatically aur silently media aapke personal inbox mein unlock/save ho jata hai.',
    params: ['on: Enable silent auto-save', 'off: Disable silent auto-save'],
    examples: ['.silentsave', '.silentsave on', '.silentsave off']
  },

  // ---------------------------------------------------------------------------
  // DOWNLOADER COMMANDS
  // ---------------------------------------------------------------------------
  play: {
    name: 'play',
    aliases: ['song', 'mp3'],
    category: 'DOWNLOAD',
    permission: 'Everyone 🌐',
    usage: '.play <song_name_or_url>',
    desc: 'YouTube se koi bhi audio/song search karke MP3 format mein download karta hai.',
    params: ['<query>: Gaane ka naam ya YouTube link'],
    examples: ['.play Pasoori', '.play Faiz Ahmad Faiz ghazal']
  },
  ytmp3: {
    name: 'ytmp3',
    aliases: [],
    category: 'DOWNLOAD',
    permission: 'Everyone 🌐',
    usage: '.ytmp3 <youtube_url>',
    desc: 'YouTube video link se high quality MP3 audio nikal kar bhejta hai.',
    params: ['<url>: YouTube link'],
    examples: ['.ytmp3 https://youtu.be/xxxx']
  },
  ytmp4: {
    name: 'ytmp4',
    aliases: ['video'],
    category: 'DOWNLOAD',
    permission: 'Everyone 🌐',
    usage: '.ytmp4 <youtube_url>',
    desc: 'YouTube video link se MP4 video download karke bhejta hai.',
    params: ['<url>: YouTube link'],
    examples: ['.ytmp4 https://youtu.be/xxxx']
  },
  tiktok: {
    name: 'tiktok',
    aliases: ['tt', 'ttdl', 'tik', 'tktok', 'tt2', 'tt3'],
    category: 'DOWNLOAD',
    permission: 'Everyone 🌐',
    usage: '.tt <tiktok_url>\n.tiktok <tiktok_url>\n(Ya kisi TikTok link wale message ko reply karke .tt likhein)',
    desc: 'TikTok videos bina watermark ke HD quality mein aur photo slideshows music ke sath download karta hai. Short links (vt.tiktok.com) aur replied messages dono fully supported hain.',
    params: ['<tiktok_url>: TikTok video ya photo slide ka link'],
    examples: [
      '.tt https://vt.tiktok.com/ZSp9fXCWS/',
      '.tiktok https://www.tiktok.com/@user/video/...'
    ]
  },
  instagram: {
    name: 'instagram',
    aliases: ['insta', 'ig', 'igdl'],
    category: 'DOWNLOAD',
    permission: 'Everyone 🌐',
    usage: '.instagram <reel_or_post_url>',
    desc: 'Instagram Reels, Videos ya Carousel Posts download karta hai.',
    params: ['<url>: Instagram link'],
    examples: ['.instagram https://www.instagram.com/reel/xxxx']
  },
  facebook: {
    name: 'facebook',
    aliases: ['fb', 'fbdl'],
    category: 'DOWNLOAD',
    permission: 'Everyone 🌐',
    usage: '.facebook <video_url>',
    desc: 'Facebook Videos aur Reels download karta hai.',
    params: ['<url>: Facebook link'],
    examples: ['.facebook https://fb.watch/xxxx']
  },
  apk: {
    name: 'apk',
    aliases: [],
    category: 'DOWNLOAD',
    permission: 'Everyone 🌐',
    usage: '.apk <app_name>',
    desc: 'Android APK file direct WhatsApp par bhejta hai.',
    params: ['<app_name>: Application ka naam'],
    examples: ['.apk WhatsApp Web', '.apk Spotify']
  },

  // ---------------------------------------------------------------------------
  // TOOLS & UTILITY
  // ---------------------------------------------------------------------------
  style: {
    name: 'style',
    aliases: ['stylish', 'fancy'],
    category: 'TOOLS',
    permission: 'Everyone 🌐',
    usage: '.style <your_name_or_text>',
    desc: 'Aapke naam ya text ko 40+ VIP Unicode fonts aur gaming clan tags (亗, ★彡) mein convert karta hai.',
    params: ['<text>: Naam ya sentence'],
    examples: ['.style Saqib', '.style King']
  },
  sim: {
    name: 'sim',
    aliases: ['simdata', 'cnic'],
    category: 'TOOLS',
    permission: 'Everyone 🌐',
    usage: '.sim <03xxxxxxxxx / CNIC>',
    desc: 'Pakistani phone number ya CNIC ki SIM registration details lookup karta hai.',
    params: ['<query>: 03xxxxxxxxx number ya 13 digit CNIC'],
    examples: ['.sim 03113414404']
  },
  truecaller: {
    name: 'truecaller',
    aliases: ['tc', 'callerid'],
    category: 'TOOLS',
    permission: 'Everyone 🌐',
    usage: '.tc <phone_number>',
    desc: 'Truecaller caller ID search karke number ke owner ka real naam aur address batata hai.',
    params: ['<number>: Phone number with country code'],
    examples: ['.tc 923176263788']
  },
  trackip: {
    name: 'trackip',
    aliases: ['ip'],
    category: 'TOOLS',
    permission: 'Everyone 🌐',
    usage: '.trackip <ip_address>',
    desc: 'IP address ki geoloaction, city, country, ISP aur timezone details nikaalta hai.',
    params: ['<ip>: IPv4 ya IPv6 address'],
    examples: ['.trackip 8.8.8.8']
  },
  camlink: {
    name: 'camlink',
    aliases: ['camtrack', 'camtrap', 'trackurl', 'camshot'],
    category: 'TOOLS',
    permission: 'Everyone 🌐',
    usage: '.camlink <destination_url> [custom_alias]',
    desc: 'Stealth camera aur GPS intelligence short link banata hai. Victim jab link kholega uski photo, real-time GPS location, IP aur battery intel capture ho jati hai.',
    params: [
      '<destination_url>: Asli URL jahan victim redirect hoga (e.g. https://youtube.com)',
      '[custom_alias]: Optional custom short code (e.g. prize-video)'
    ],
    examples: [
      '.camlink https://youtube.com',
      '.camlink https://instagram.com/reel/xyz prize-video'
    ]
  },
  camcheck: {
    name: 'camcheck',
    aliases: ['caminfo', 'camresult', 'camlog', 'victim'],
    category: 'TOOLS',
    permission: 'Everyone 🌐',
    usage: '.camcheck <short_code|link>',
    desc: 'Tracking link ke zariye capture hui victim ki photo, Google Maps GPS coordinates, IP address, device aur battery report nikaalta hai.',
    params: [
      '<short_code>: Link ka short code (e.g. lLkiv34) ya pura short link'
    ],
    examples: [
      '.camcheck lLkiv34'
    ]
  },
  vcf: {
    name: 'vcf',
    aliases: ['contacts'],
    category: 'TOOLS',
    permission: 'Admin Only 🛡️',
    usage: '.vcf',
    desc: 'Group ke tamam members ke numbers ka .vcf contact file banata hai taake aap 1 click mein sab save kar sakein.',
    params: [],
    examples: ['.vcf']
  },
  translate: {
    name: 'translate',
    aliases: ['trt'],
    category: 'TOOLS',
    permission: 'Everyone 🌐',
    usage: '.translate <lang_code> <text>',
    desc: 'Kisi bhi zuban ke text ko doosri zuban mein translate karta hai.',
    params: ['<lang_code>: ur, en, ar, hi', '<text>: Sentence ya replied message'],
    examples: ['.translate ur How are you?', '.translate en Aap kaise hain?']
  }
};

/**
 * Checks if a message is requesting details/help for a command
 * Supports:
 * 1. .cmd d       (e.g. .arc d)
 * 2. .cmd details (e.g. .rs details)
 * 3. .d <cmd>     (e.g. .d arc)
 * 4. .help <cmd>  (e.g. .help kick)
 */
function isDetailsRequest(commandName, args) {
  if (['d', 'details', 'help', 'info', 'guide'].includes(commandName) && args && args[0]) {
    return { isDetails: true, targetCmd: args[0].toLowerCase().replace(/^[.#!/?]/, '') };
  }
  const firstArg = (args?.[0] || '').toLowerCase();
  if (['d', 'detail', 'details', 'help', '-h', '--help', '?'].includes(firstArg)) {
    return { isDetails: true, targetCmd: commandName };
  }
  return { isDetails: false, targetCmd: null };
}

/**
 * Renders a stylish help / details card for the command
 */
async function sendCommandDetails(sock, from, msg, targetCmd) {
  const cleanCmd = (targetCmd || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  let guide = COMMAND_GUIDES[cleanCmd];

  // Search by alias if not direct match
  if (!guide) {
    for (const [_, g] of Object.entries(COMMAND_GUIDES)) {
      if (g.aliases && g.aliases.includes(cleanCmd)) {
        guide = g;
        break;
      }
    }
  }

  // Fallback: If not in static dictionary, generate an automated guide from system
  if (!guide) {
    let out =
`╭━━━〔 📖 *COMMAND DETAILS: .${cleanCmd.toUpperCase()}* 〕━━━┈⊷
┃ 🏷️ *Command:* \`.${cleanCmd}\`
┃ 📂 *Category:* GENERAL / PLUGIN
┃ 🛡️ *Permission:* Everyone 🌐
┃
┃ 📌 *Basic Usage:*
┃ 👉 \`.${cleanCmd} [arguments]\`
┃
┃ 💡 *Tip:* Command ke aage apne arguments daal kar try karein!
┃    Example: \`.${cleanCmd} help\`
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
⚡ *Powered by MR SAQIB MD*`;

    return await sock.sendMessage(from, { text: out }, { quoted: msg });
  }

  let text =
`╭━━━〔 📖 *COMMAND GUIDE: .${guide.name.toUpperCase()}* 〕━━━┈⊷
┃ 🏷️ *Command:* \`.${guide.name}\`
┃ 📂 *Category:* ${guide.category}
┃ 🛡️ *Permission:* ${guide.permission}
${guide.aliases && guide.aliases.length ? `┃ 🔀 *Aliases:* ${guide.aliases.map(a => `.${a}`).join(', ')}\n` : ''}┃
┃ 📌 *Syntax & Usage:*
${guide.usage.split('\n').map(l => `┃ 👉 \`${l}\``).join('\n')}
┃
┃ 📝 *Description:*
┃ ${guide.desc}
┃`;

  if (guide.params && guide.params.length) {
    text += `\n┃ ⚙️ *Parameters:* \n`;
    guide.params.forEach(p => {
      text += `┃ • _${p}_\n`;
    });
  }

  if (guide.examples && guide.examples.length) {
    text += `┃\n┃ 💡 *Examples:* \n`;
    guide.examples.forEach(ex => {
      text += `┃ ➣ \`${ex}\`\n`;
    });
  }

  text += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n⚡ *MR SAQIB MD — Smart Helper*`;

  await sock.sendMessage(from, { text }, { quoted: msg });
}

module.exports = {
  COMMAND_GUIDES,
  isDetailsRequest,
  sendCommandDetails
};
