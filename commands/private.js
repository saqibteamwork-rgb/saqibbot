async function privateCommand(sock, from, msg, isOwner, session, botData, saveBotData, config) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner hi bot ko PRIVATE kar sakta hai." }, { quoted: msg });
    
    if (session) session.isPublic = false;
    if (botData) {
        if (!botData.globalSettings) botData.globalSettings = {};
        botData.globalSettings.isPublic = false;
        if (session && session.userId) {
            if (!botData.statusSettings[session.userId]) botData.statusSettings[session.userId] = {};
            botData.statusSettings[session.userId].isPublic = false;
        }
        if (typeof saveBotData === 'function') saveBotData();
    }
    if (config) config.WORK_TYPE = 'private';
    await sock.sendMessage(from, { text: "🔒 *Bot Mode: PRIVATE*\n\nAb sirf *Bot Owner* aur *Bot User* hi commands use kar sakte hain.\nBaaqi sabhi users ignore honge." }, { quoted: msg });
}

module.exports = privateCommand;
