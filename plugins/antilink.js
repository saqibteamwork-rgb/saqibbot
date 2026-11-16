const { cmd } = require('../arslan');
const fs = require('fs-extra');
const path = require('path');

// Persistent per-group AntiLink settings.
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'antilink.json');
fs.ensureDirSync(DATA_DIR);

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    return fs.readJsonSync(DATA_FILE);
  } catch (_) { return {}; }
}

const store = loadStore();
let saveTimer;
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeJsonSync(DATA_FILE, store, { spaces: 2 }); } catch (e) { console.error('AntiLink save error:', e.message); }
  }, 150);
}

function getConfig(jid) {
  if (!store[jid]) {
    store[jid] = {
      enabled: false,
      action: 'delete', // delete | warn | kick
      limit: 3,
      warnings: {},
      whitelist: []
    };
  }
  const c = store[jid];
  c.action = ['delete', 'warn', 'kick'].includes(c.action) ? c.action : 'delete';
  c.limit = Math.max(1, Math.min(20, Number(c.limit) || 3));
  c.whitelist = Array.isArray(c.whitelist) ? c.whitelist.map(x => String(x).toLowerCase()) : [];
  c.warnings = c.warnings && typeof c.warnings === 'object' ? c.warnings : {};
  return c;
}

const LINK_RE = /(?:https?:\/\/|www\.)[^\s]+|(?:wa\.me\/|chat\.whatsapp\.com\/|whatsapp\.com\/channel\/|whatsapp\.com\/invite\/|t\.me\/|telegram\.me\/|discord\.gg\/|discord\.com\/invite\/)[^\s]+/i;
const DOMAIN_RE = /^(?:https?:\/\/)?(?:www\.)?([^\s/:?#]+)(?:[/:?#]|$)/i;

function domainsFromText(text) {
  const found = new Set();
  const re = /(?:https?:\/\/|www\.)[^\s]+|(?:wa\.me\/|chat\.whatsapp\.com\/|whatsapp\.com\/channel\/|whatsapp\.com\/invite\/|t\.me\/|telegram\.me\/|discord\.gg\/|discord\.com\/invite\/)[^\s]+/gi;
  for (const match of String(text || '').matchAll(re)) {
    let value = match[0].replace(/[),.!?;]+$/g, '');
    if (/^wa\.me\//i.test(value)) value = 'https://' + value;
    else if (/^(?:chat\.whatsapp|whatsapp\.com|t\.me|telegram\.me|discord\.gg|discord\.com)/i.test(value)) value = 'https://' + value;
    const m = value.match(DOMAIN_RE);
    if (m) found.add(m[1].toLowerCase());
  }
  return [...found];
}

function isWhitelisted(domains, whitelist) {
  return domains.some(d => whitelist.some(w => d === w || d.endsWith('.' + w)));
}

function isProtected(sender, isOwner, isAdmins) {
  return Boolean(isOwner || isAdmins || String(sender || '').includes('status@broadcast'));
}

function statusText(from, c) {
  return [
    '🛡️ *𝗔𝗠𝗔𝗡-𝐌𝐃 ANTILINK*',
    '',
    `• Status: *${c.enabled ? 'ON' : 'OFF'}*`,
    `• Action: *${c.action.toUpperCase()}*`,
    `• Warning limit: *${c.limit}*`,
    `• Whitelist: *${c.whitelist.length ? c.whitelist.join(', ') : 'None'}*`,
    '',
    'Commands:',
    '`.antilink on` / `.antilink off`',
    '`.antilink action delete|warn|kick`',
    '`.antilink limit 3`',
    '`.antilink whitelist add domain.com`',
    '`.antilink whitelist remove domain.com`',
    '`.antilink whitelist list`',
    '`.antilink reset`'
  ].join('\n');
}

async function requireGroupAdmin(reply, isGroup, isAdmins) {
  if (!isGroup) { await reply('❌ This command only works in a group.'); return false; }
  if (!isAdmins) { await reply('❌ Only group admins can change AntiLink settings.'); return false; }
  return true;
}

cmd({
  pattern: 'antilink',
  alias: ['antilinkstatus', 'antilinksettings'],
  desc: 'Configure group AntiLink protection',
  category: 'group',
  react: '🛡️',
  filename: __filename
}, async (conn, mek, m, ctx) => {
  const { from, args, q, reply, isGroup, isAdmins, isOwner } = ctx;
  if (!isGroup) return reply('❌ This command only works in a group.');
  const c = getConfig(from);
  const sub = String(args[0] || '').toLowerCase();

  if (!sub || sub === 'status') return reply(statusText(from, c));
  if (!isOwner && !isAdmins) return reply('❌ Only group admins can change AntiLink settings.');

  if (sub === 'on' || sub === 'enable') {
    c.enabled = true; saveStore();
    return reply('✅ *AntiLink enabled.*\nNormal members posting links will be handled automatically.');
  }
  if (sub === 'off' || sub === 'disable') {
    c.enabled = false; saveStore();
    return reply('✅ *AntiLink disabled.*');
  }
  if (sub === 'action') {
    const action = String(args[1] || '').toLowerCase();
    if (!['delete', 'warn', 'kick'].includes(action)) return reply('❌ Use: `.antilink action delete|warn|kick`');
    c.action = action; saveStore();
    return reply(`✅ AntiLink action set to *${action.toUpperCase()}*.`);
  }
  if (sub === 'limit') {
    const n = Number(args[1]);
    if (!Number.isInteger(n) || n < 1 || n > 20) return reply('❌ Warning limit must be between 1 and 20.');
    c.limit = n; saveStore();
    return reply(`✅ Warning limit set to *${n}*.`);
  }
  if (sub === 'reset') {
    delete store[from]; saveStore();
    return reply('♻️ AntiLink settings reset to defaults (OFF / DELETE / 3 warnings).');
  }
  if (sub === 'whitelist') {
    const op = String(args[1] || '').toLowerCase();
    const domain = String(args[2] || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (op === 'list') return reply(`📋 *Whitelisted domains:*\n${c.whitelist.length ? c.whitelist.map(x => `• ${x}`).join('\n') : '• None'}`);
    if (!domain || !/^[a-z0-9.-]+$/.test(domain)) return reply('❌ Example: `.antilink whitelist add youtube.com`');
    if (op === 'add') {
      if (!c.whitelist.includes(domain)) c.whitelist.push(domain);
      saveStore(); return reply(`✅ Added *${domain}* to AntiLink whitelist.`);
    }
    if (op === 'remove' || op === 'del') {
      c.whitelist = c.whitelist.filter(x => x !== domain);
      saveStore(); return reply(`✅ Removed *${domain}* from AntiLink whitelist.`);
    }
    return reply('❌ Use: `.antilink whitelist add|remove|list domain.com`');
  }

  return reply(statusText(from, c));
});

// Event handler: automatically inspect normal text messages in groups.
cmd({
  on: 'body',
  allowUnprefixedInGroups: true,
  dontAddCommandList: true,
  filename: __filename
}, async (conn, mek, m, ctx) => {
  const { from, body, isGroup, sender, isAdmins, isOwner, isBotAdmins, reply } = ctx;
  if (!isGroup || !body) return;

  const c = getConfig(from);
  if (!c.enabled) return;
  if (isProtected(sender, isOwner, isAdmins)) return;

  const domains = domainsFromText(body);
  if (!domains.length || isWhitelisted(domains, c.whitelist)) return;

  // Do not attempt moderation if the bot cannot manage messages/members.
  if (!isBotAdmins) return reply('⚠️ AntiLink is ON, but I need group-admin permission to remove link messages.');

  try {
    await conn.sendMessage(from, { delete: mek.key });
  } catch (e) {
    console.error('AntiLink delete error:', e.message);
  }

  const user = sender || mek.key?.participant || from;
  const tag = '@' + String(user).split('@')[0];
  c.warnings[user] = (Number(c.warnings[user]) || 0) + 1;
  const count = c.warnings[user];
  saveStore();

  if (c.action === 'delete') {
    return reply(`🚫 ${tag} links are not allowed here.\n🛡️ Message removed.`, { mentions: [user] });
  }

  if (c.action === 'warn') {
    if (count >= c.limit) {
      try { await conn.groupParticipantsUpdate(from, [user], 'remove'); }
      catch (e) { console.error('AntiLink kick error:', e.message); }
      delete c.warnings[user]; saveStore();
      return reply(`⛔ ${tag} reached the AntiLink warning limit and was removed.`, { mentions: [user] });
    }
    return reply(`⚠️ ${tag} please don't send links.\nWarning: *${count}/${c.limit}*`, { mentions: [user] });
  }

  if (c.action === 'kick') {
    try { await conn.groupParticipantsUpdate(from, [user], 'remove'); }
    catch (e) { console.error('AntiLink kick error:', e.message); }
    return reply(`⛔ ${tag} was removed for posting a link.`, { mentions: [user] });
  }
});

// Clear stored warning count for a quoted/mentioned member.
cmd({
  pattern: 'antilinkreset',
  alias: ['alreset'],
  desc: 'Reset AntiLink warnings for a member',
  category: 'group',
  react: '♻️',
  filename: __filename
}, async (conn, mek, m, { from, reply, isGroup, isAdmins }) => {
  if (!isGroup) return reply('❌ This command only works in a group.');
  if (!isAdmins) return reply('❌ Only group admins can use this command.');
  const target = m.quoted?.sender || m.mentionedJid?.[0];
  if (!target) return reply('❌ Reply to a member or mention them.');
  const c = getConfig(from);
  delete c.warnings[target];
  saveStore();
  return reply(`✅ AntiLink warnings reset for @${target.split('@')[0]}.`, { mentions: [target] });
});
