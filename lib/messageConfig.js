const settings = require('../settings');
module.exports = {
    get channelInfo() {
        return {
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: settings.newsletterJid || '120363421389121979@newsletter',
                    newsletterName: settings.botName || 'MR SAQIB MD',
                    serverMessageId: -1
                }
            }
        };
    }
};
