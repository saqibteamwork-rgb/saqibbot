// MR SAQIB MD — 10 lightweight utility commands
// Keeps all features local; no API keys required.
const { cmd } = require('../arslan');
const { getUserConfigFromMongoDB } = require('../lib/database');
const os = require('os');
const config = require('../config');

const AMAN_STARTED_AT = Date.now();
function duration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400), h = Math.floor(total % 86400 / 3600);
  const m = Math.floor(total % 3600 / 60), s = total % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}
function safeCalculate(expression) {
  const value = String(expression || '').replace(/[×]/g, '*').replace(/[÷]/g, '/').trim();
  if (!value || value.length > 80 || !/^[0-9+\-*/().%\s]+$/.test(value)) return null;
  // No eval: parse only arithmetic with a small recursive-descent parser.
  let i = 0;
  function ws(){ while (/\s/.test(value[i] || '') && i < value.length) i++; }
  function factor(){ ws(); if(value[i]==='+'){i++;return factor()} if(value[i]==='-'){i++;return -factor()} if(value[i]==='('){i++;const n=expr();ws();if(value[i++]!==')')throw Error();return n} const m=value.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);if(!m)throw Error();i+=m[0].length;return Number(m[0]); }
  function term(){let n=factor();for(;;){ws();const op=value[i];if(!['*','/','%'].includes(op))return n;i++;const r=factor();if((op==='/'||op==='%')&&r===0)throw Error();n=op==='*'?n*r:op==='/'?n/r:n%r;}}
  function expr(){let n=term();for(;;){ws();const op=value[i];if(op!=='+'&&op!=='-')return n;i++;const r=term();n=op==='+'?n+r:n-r;}}
  try { const result=expr(); ws(); return i===value.length && Number.isFinite(result) ? result : null; } catch { return null; }
}

cmd({ pattern:'uptime', alias:['runtime','up'], desc:'Bot uptime check', category:'utility', react:'⏱️', filename:__filename }, async (conn, mek, m, ctx) => {
  return ctx.reply(`⚡ *${config.BOT_NAME || 'AMAN Mini Bot'} UPTIME*\n\n⏱️ ${duration(Date.now()-AMAN_STARTED_AT)}\n🟢 Process: Online`);
});
cmd({ pattern:'botinfo', alias:['systeminfo','sysinfo'], desc:'Bot and host system info', category:'utility', react:'🖥️', filename:__filename }, async (conn, mek, m, ctx) => {
  const mem = process.memoryUsage();
  return ctx.reply(`╭━━━〔 *${config.BOT_NAME || 'AMAN Mini Bot'} SYSTEM* 〕━━━╮\n┃ 🤖 Name: ${config.BOT_NAME || 'AMAN Mini Bot'}\n┃ 📦 Node: ${process.version}\n┃ 🧠 RAM: ${(mem.rss/1024/1024).toFixed(1)} MB RSS\n┃ 💻 Platform: ${os.platform()} ${os.arch()}\n┃ ⚙️ CPUs: ${os.cpus().length}\n┃ ⏱️ Uptime: ${duration(process.uptime()*1000)}\n╰━━━━━━━━━━━━━━━━━━╯`);
});
cmd({ pattern:'owner', alias:['creator','dev'], desc:'Owner card with tappable links', category:'main', react:'👑', filename:__filename }, async (conn, mek, m, ctx) => {
  // Sab ke liye khula hai (info card ka "Owner" button bhi yahi chalata hai). Links: plugins/carousel-menu.js -> OWNER_LINKS
  const from = ctx.from || m.chat;
  const cm = require('./carousel-menu');
  const ok = await cm.sendOwnerCard(conn, from, mek);
  if (!ok) await conn.sendMessage(from, { text: cm.ownerCardText() }, { quoted: mek });
  await cm.sendOwnerContact(conn, from, mek);   // WhatsApp contact card (+923468616487) — "Message" button ke saath
});
cmd({ pattern:'groupinfo', alias:['ginfo'], desc:'Current group details', category:'group', react:'👥', filename:__filename }, async (conn, mek, m, ctx) => {
  if (!ctx.isGroup) return ctx.reply('❌ Yeh command group mein use karo.');
  let metadata; try { metadata = await conn.groupMetadata(ctx.from); } catch { return ctx.reply('❌ Group details fetch nahi ho sake.'); }
  const admins = (metadata.participants || []).filter(p => p.admin).length;
  return ctx.reply(`👥 *GROUP INFO*\n\n📛 Name: ${metadata.subject || 'Unknown'}\n🆔 ID: ${ctx.from}\n👤 Members: ${(metadata.participants||[]).length}\n🛡️ Admins: ${admins}\n📅 Created: ${metadata.creation ? new Date(metadata.creation*1000).toLocaleDateString() : 'N/A'}`);
});
cmd({ pattern:'admins', alias:['listadmins','tagadminlist'], desc:'List group admins', category:'group', react:'🛡️', filename:__filename }, async (conn, mek, m, ctx) => {
  if (!ctx.isGroup) return ctx.reply('❌ Yeh command group mein use karo.');
  let metadata; try { metadata = await conn.groupMetadata(ctx.from); } catch { return ctx.reply('❌ Admin list nahi mil saki.'); }
  const admins = (metadata.participants || []).filter(p => p.admin);
  if (!admins.length) return ctx.reply('Is group mein admin list nahi mili.');
  return conn.sendMessage(ctx.from, { text:`🛡️ *${metadata.subject || 'GROUP'} ADMINS*\n\n${admins.map((p,i)=>`${i+1}. @${String(p.id).split('@')[0].split(':')[0]}`).join('\n')}`, mentions:admins.map(p=>p.id) }, { quoted:mek });
});
cmd({ pattern:'jid', alias:['chatid','myjid'], desc:'Show chat/sender ID, or get the ID of a channel / group link', category:'utility', use:'.jid <channel or group link>', react:'🆔', filename:__filename }, async (conn, mek, m, ctx) => {
  const withTimeout = (p, ms = 8000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  const raw = String(ctx.q || (m.quoted && m.quoted.text) || '');
  const link = (raw.match(/https?:\/\/[^\s]+/i) || [''])[0];

  // 📢 Channel (newsletter) link -> JID
  const ch = link.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i);
  if (ch) {
    try {
      if (typeof conn.newsletterMetadata !== 'function') throw new Error('not supported');
      const meta = await withTimeout(conn.newsletterMetadata('invite', ch[1]));
      const jid = meta && (meta.id || meta.jid);
      if (!jid) throw new Error('no id');
      const subs = meta.subscribers || meta.subscribers_count || (meta.thread_metadata && meta.thread_metadata.subscribers_count);
      return ctx.reply(`📢 *CHANNEL JID*\n${jid}\n\n📝 *NAME*\n${meta.name || (meta.thread_metadata && meta.thread_metadata.name && meta.thread_metadata.name.text) || 'N/A'}${subs ? `\n\n👥 *FOLLOWERS*\n${subs}` : ''}`);
    } catch (e) {
      return ctx.reply('❌ Is channel link se JID nahi mili. Link sahi hai? Thori der baad dobara try karo.');
    }
  }

  // 👥 Group invite link -> JID
  const gc = link.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i);
  if (gc) {
    try {
      const info = await withTimeout(conn.groupGetInviteInfo(gc[1]));
      if (!info || !info.id) throw new Error('no id');
      return ctx.reply(`👥 *GROUP JID*\n${info.id}\n\n📝 *NAME*\n${info.subject || 'N/A'}${info.size ? `\n\n👤 *MEMBERS*\n${info.size}` : ''}`);
    } catch (e) {
      return ctx.reply('❌ Is group link se JID nahi mili. Link expire ya galat ho sakta hai.');
    }
  }

  // 🔁 Channel post par reply -> us channel ki JID
  const fwd = m.quoted && m.quoted.msg && m.quoted.msg.contextInfo && m.quoted.msg.contextInfo.forwardedNewsletterMessageInfo;
  if (!ctx.q && fwd && fwd.newsletterJid) {
    return ctx.reply(`📢 *CHANNEL JID*\n${fwd.newsletterJid}${fwd.newsletterName ? `\n\n📝 *NAME*\n${fwd.newsletterName}` : ''}`);
  }

  return ctx.reply(`🆔 *CHAT ID*\n${ctx.from || 'N/A'}\n\n👤 *SENDER ID*\n${ctx.sender || m.sender || 'N/A'}\n\n💡 Channel ya group ki JID ke liye:\n.jid <link>`);
});
cmd({ pattern:'calc', alias:['calculate','math'], desc:'Safe basic calculator', category:'utility', react:'🧮', filename:__filename }, async (conn, mek, m, ctx) => {
  const result = safeCalculate(ctx.q || '');
  if (result === null) return ctx.reply('🧮 Use: .calc (25 + 5) * 2\nAllowed: numbers, + - * / % and brackets.');
  return ctx.reply(`🧮 *${config.BOT_NAME || 'AMAN Mini Bot'} CALCULATOR*\n\n${ctx.q} = *${result}*`);
});
cmd({ pattern:'base64enc', alias:['b64enc'], desc:'Encode text to Base64', category:'utility', react:'🔐', filename:__filename }, async (conn, mek, m, ctx) => {
  const input=String(ctx.q||''); if(!input) return ctx.reply('Use: .base64enc your text');
  return ctx.reply(`🔐 *BASE64 ENCODE*\n\n${Buffer.from(input,'utf8').toString('base64')}`);
});
cmd({ pattern:'base64dec', alias:['b64dec'], desc:'Decode Base64 text', category:'utility', react:'🔓', filename:__filename }, async (conn, mek, m, ctx) => {
  const input=String(ctx.q||'').trim(); if(!input || !/^[A-Za-z0-9+/]*={0,2}$/.test(input)) return ctx.reply('Use: .base64dec <base64 text>');
  try { return ctx.reply(`🔓 *BASE64 DECODE*\n\n${Buffer.from(input,'base64').toString('utf8').slice(0,3500)}`); } catch { return ctx.reply('❌ Invalid Base64 input.'); }
});
cmd({ pattern:'reverse', alias:['reverse-text'], desc:'Reverse a text string', category:'utility', react:'🔁', filename:__filename }, async (conn, mek, m, ctx) => {
  const input=String(ctx.q||''); if(!input) return ctx.reply('Use: .reverse hello world');
  return ctx.reply(`🔁 *REVERSED TEXT*\n\n${Array.from(input).reverse().join('')}`);
});
cmd({ pattern:'charcount', alias:['textcount','wordcount'], desc:'Count words and characters', category:'utility', react:'🔢', filename:__filename }, async (conn, mek, m, ctx) => {
  const input=String(ctx.q||''); if(!input) return ctx.reply('Use: .charcount your text');
  return ctx.reply(`🔢 *TEXT STATS*\n\n📝 Characters: ${Array.from(input).length}\n🔠 Characters (no spaces): ${Array.from(input.replace(/\s/g,'')).length}\n📚 Words: ${(input.trim().match(/\S+/g)||[]).length}\n📏 Lines: ${input.split(/\r?\n/).length}`);
});
