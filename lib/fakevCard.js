const config = require('../config');

module.exports = {
    get fakevCard() {
        return {
            key: {
                fromMe: false,
                participant: "0@s.whatsapp.net",
                remoteJid: "status@broadcast"
            },
            message: {
                contactMessage: {
                    displayName: `${config.BOT_NAME || 'MR SAQIB MD'} ᴏꜰꜰɪᴄɪᴀʟ`,
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Meta\nORG:META AI;\nTEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER || '923286037243'}:+${config.OWNER_NUMBER || '923286037243'}\nEND:VCARD`
                }
            }
        };
    }
};
