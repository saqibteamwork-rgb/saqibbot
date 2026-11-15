'use strict';
const settings = require('./settings');

module.exports = {
  prefix: '.',
  ownerNumber: settings.ownerNumber || '923468616487',
  botName: settings.botName || 'MR SAQIB MD',
  ownerName: settings.ownerName || 'MR SAQIB',
  channelLink: settings.channelLink || 'https://whatsapp.com/channel/0029VbBTSK1EquiWrUt5uV1I',
  newsletterJid: settings.newsletterJid || '120363421389121979@newsletter',
  menuImage: settings.menuImage || 'https://ik.imagekit.io/19imy4f1u/lite_1775822697436_IXJPba-z2.png',
  telegramImage: settings.telegramImage || 'https://ik.imagekit.io/19imy4f1u/lite_1775822697436_IXJPba-z2.png',
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
