const settings = require('../settings');
module.exports = {
    get channelInfo() {
        return {
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: settings.newsletterJid || '120363431913895899@newsletter',
                    newsletterName: settings.channelName || 'Mr SAQIB',
                    serverMessageId: -1
                }
            }
        };
    }
};
