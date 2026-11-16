// 💞 MR SAQIB MD — Cute Love & Friendship Commands
// Fun-only messages; no real compatibility is claimed.
const { cmd } = require('../arslan');
const config = require('../config');

const heartLine = '♡ ─────── 💗 ─────── ♡';
function getMentioned(mek) {
  return mek?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}
function tag(jid) { return `@${String(jid || '').split('@')[0]}`; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

cmd({ pattern: 'love', alias: ['lovecard', 'pyarlove'], desc: 'Send a cute love/friendship card', category: 'love', react: '💞', use: '.love @user' }, async (conn, mek, m, ctx) => {
  const target = getMentioned(mek)[0] || ctx.sender;
  const lines = [
    `╭━━━〔 💞 𝐀 𝐋𝐈𝐓𝐓𝐋𝐄 𝐋𝐎𝐕𝐄 𝐍𝐎𝐓𝐄 💞 〕━━━╮`,
    '', `  🥹🌷 To: ${tag(target)}`,
    `  💗 You make this chat a little brighter!`,
    `  🌸 Keep smiling, keep shining, and never forget your worth.`,
    `  🫶 Sending good vibes, kindness & lots of hearts!`,
    '', `╰━━━〔 💌 𝐌𝐀𝐃𝐄 𝐖𝐈𝐓𝐇 𝐋𝐎𝐕𝐄 〕━━━╯`,
    '', `        💞 *${config.OWNER_NAME || 'SAQIB'} ki taraf se* 🥲`
  ];
  return conn.sendMessage(ctx.from, { text: lines.join('\n'), mentions: [target] }, { quoted: mek });
});

cmd({ pattern: 'hug', alias: ['virtualhug', 'jadujappi'], desc: 'Send a wholesome virtual hug', category: 'love', react: '🫂', use: '.hug @user' }, async (conn, mek, m, ctx) => {
  const target = getMentioned(mek)[0] || ctx.sender;
  const msg = `╭━━━〔 🫂 𝐕𝐈𝐑𝐓𝐔𝐀𝐋 𝐇𝐔𝐆 🫂 〕━━━╮\n\n  🥹💗 ${tag(target)}, here is a warm virtual hug!\n  🌷 Whatever kind of day you're having,\n  may a little kindness make it brighter.\n  🦋 You matter. Keep smiling!\n\n╰━━━〔 💞 𝐒𝐄𝐍𝐓 𝐖𝐈𝐓𝐇 𝐂𝐀𝐑𝐄 〕━━━╯\n\n      💗 *${config.OWNER_NAME || 'SAQIB'} ki taraf se* 🥲`;
  return conn.sendMessage(ctx.from, { text: msg, mentions: [target] }, { quoted: mek });
});

cmd({ pattern: 'lovemeter', alias: ['lovepercent', 'lovecheck'], desc: 'Fun random love/friendship meter', category: 'love', react: '💘', use: '.lovemeter @user' }, async (conn, mek, m, ctx) => {
  const target = getMentioned(mek)[0] || ctx.sender;
  const score = Math.floor(Math.random() * 101);
  const bar = '💗'.repeat(Math.round(score / 10)) + '🤍'.repeat(10 - Math.round(score / 10));
  const caption = score >= 80 ? 'A beautiful vibe! 🌹✨' : score >= 55 ? 'Sweet friendship energy! 🥰' : score >= 30 ? 'Cute vibes are loading… 🌸' : 'A little kindness can grow any bond! 🌱';
  const msg = `╭━━━〔 💘 𝐋𝐎𝐕𝐄 𝐌𝐄𝐓𝐄𝐑 💘 〕━━━╮\n\n  👤 Person: ${tag(target)}\n  📊 Fun score: *${score}%*\n  ${bar}\n\n  🌷 ${caption}\n  _Just for fun — not a real compatibility test._\n\n╰━━━〔 💞 𝐊𝐄𝐄𝐏 𝐈𝐓 𝐊𝐈𝐍𝐃 〕━━━╯\n\n      💗 *${config.OWNER_NAME || 'SAQIB'} ki taraf se* 🥲`;
  return conn.sendMessage(ctx.from, { text: msg, mentions: [target] }, { quoted: mek });
});

cmd({ pattern: 'crush', alias: ['secretcrush', 'mycrush'], desc: 'A cute random secret-crush card', category: 'love', react: '🌹', use: '.crush @user' }, async (conn, mek, m, ctx) => {
  const target = getMentioned(mek)[0] || ctx.sender;
  const note = pick([
    'Some people make an ordinary day feel special. 🌷',
    'A kind smile can stay in someone’s memory all day. 😊',
    'A little admiration, a lot of respect, and good vibes. 💌',
    'The cutest connections begin with kindness and friendship. 🦋'
  ]);
  const msg = `╭━━━〔 🌹 𝐒𝐄𝐂𝐑𝐄𝐓 𝐂𝐑𝐔𝐒𝐇 𝐂𝐀𝐑𝐃 🌹 〕━━━╮\n\n  💌 For: ${tag(target)}\n\n  ✨ ${note}\n\n  🤍 Keep it respectful, sweet & pressure-free.\n\n╰━━━〔 💗 𝐉𝐔𝐒𝐓 𝐅𝐎𝐑 𝐅𝐔𝐍 〕━━━╯\n\n      🥹💞 *${config.OWNER_NAME || 'SAQIB'} ki taraf se*`;
  return conn.sendMessage(ctx.from, { text: msg, mentions: [target] }, { quoted: mek });
});

cmd({ pattern: 'ship', alias: ['couplemeter', 'shipmeter'], desc: 'Fun compatibility card for two mentioned friends', category: 'love', react: '🦋', use: '.ship @user1 @user2' }, async (conn, mek, m, ctx) => {
  const mentioned = getMentioned(mek);
  if (mentioned.length < 2) return ctx.reply('💞 Do friends ko mention karo.\nExample: *.ship @user1 @user2*');
  const score = Math.floor(Math.random() * 101);
  const bar = '💖'.repeat(Math.round(score / 10)) + '🤍'.repeat(10 - Math.round(score / 10));
  const msg = `╭━━━〔 🦋 𝐅𝐑𝐈𝐄𝐍𝐃𝐒𝐇𝐈𝐏 𝐒𝐇𝐈𝐏 🦋 〕━━━╮\n\n  🌸 ${tag(mentioned[0])}  +  ${tag(mentioned[1])}\n\n  💗 Fun vibe score: *${score}%*\n  ${bar}\n\n  🫶 This is a random joke card — real bonds need kindness and respect.\n\n╰━━━〔 🌷 𝐒𝐓𝐀𝐘 𝐂𝐔𝐓𝐄 〕━━━╯\n\n       💞 *${config.OWNER_NAME || 'SAQIB'} ki taraf se* 🥲`;
  return conn.sendMessage(ctx.from, { text: msg, mentions: mentioned.slice(0, 2) }, { quoted: mek });
});
