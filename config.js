'use strict';
const fs = require('fs');
const path = require('path');
const settings = require('./settings');

function readGlobalBotData() {
  try {
    const dataPath = path.join(__dirname, 'data', 'bot_data.json');
    if (fs.existsSync(dataPath)) {
      const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      return parsed.globalSettings || {};
    }
  } catch (_) {}
  return {};
}

let _overrideBotName = null;
let _overrideOwnerName = null;
let _overridePrefix = null;

const config = {
  prefix: '.',
  PREFIX: '.',
  ownerNumber: settings.ownerNumber || '923468616487',
  OWNER_NUMBER: settings.ownerNumber || '923468616487',
  channelLink: settings.channelLink || 'https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M',
  CHANNEL_LINK: settings.channelLink || 'https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M',
  newsletterJid: settings.newsletterJid || '120363431913895899@newsletter',
  NEWSLETTER_JID: settings.newsletterJid || '120363431913895899@newsletter',
  channelName: settings.channelName || 'Mr SAQIB',
  CHANNEL_NAME: settings.channelName || 'Mr SAQIB',
  menuImage: settings.menuImage || 'https://ik.imagekit.io/mrsaqib/image_ePUwM_YDT.png',
  MENU_IMAGE: settings.menuImage || 'https://ik.imagekit.io/mrsaqib/image_ePUwM_YDT.png',
  telegramImage: settings.telegramImage || 'https://ik.imagekit.io/mrsaqib/image_ePUwM_YDT.png',
  TELEGRAM_IMAGE: settings.telegramImage || 'https://ik.imagekit.io/mrsaqib/image_ePUwM_YDT.png',
  WORK_TYPE: 'public',
  timezone: 'Asia/Karachi',
  channelSettings: {
    pollMs: 5 * 60 * 1000,
    fetchWindow: 40,
    logDeletes: true,
    allSessionsNumber: settings.ownerNumber
  },
  antideleteSettings: {
    enabled: true,
    dest: 'chat'
  },
  ...settings
};

Object.defineProperty(config, 'botName', {
  get() {
    if (_overrideBotName) return _overrideBotName;
    const g = readGlobalBotData();
    return g.botName || settings.botName || 'MR SAQIB MD';
  },
  set(val) {
    _overrideBotName = val;
    settings.botName = val;
  },
  enumerable: true,
  configurable: true
});

Object.defineProperty(config, 'BOT_NAME', {
  get() {
    if (_overrideBotName) return _overrideBotName;
    const g = readGlobalBotData();
    return g.botName || settings.botName || 'MR SAQIB MD';
  },
  set(val) {
    _overrideBotName = val;
    settings.botName = val;
  },
  enumerable: true,
  configurable: true
});

Object.defineProperty(config, 'ownerName', {
  get() {
    if (_overrideOwnerName) return _overrideOwnerName;
    const g = readGlobalBotData();
    return g.ownerName || settings.ownerName || 'MR SAQIB';
  },
  set(val) {
    _overrideOwnerName = val;
    settings.ownerName = val;
  },
  enumerable: true,
  configurable: true
});

Object.defineProperty(config, 'OWNER_NAME', {
  get() {
    if (_overrideOwnerName) return _overrideOwnerName;
    const g = readGlobalBotData();
    return g.ownerName || settings.ownerName || 'MR SAQIB';
  },
  set(val) {
    _overrideOwnerName = val;
    settings.ownerName = val;
  },
  enumerable: true,
  configurable: true
});

Object.defineProperty(config, 'PREFIX', {
  get() {
    return _overridePrefix || config.prefix || '.';
  },
  set(val) {
    _overridePrefix = val;
    config.prefix = val;
  },
  enumerable: true,
  configurable: true
});

module.exports = config;
