async function publicCommand(sock, from, msg, isOwner, session, botData, saveBotData, config) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner hi bot ko PUBLIC kar sakta hai." }, { quoted: msg });
    
    if (session) session.isPublic = true;
    if (botData) {
        if (!botData.globalSettings) botData.globalSettings = {};
        botData.globalSettings.isPublic = true;
        if (session && session.userId) {
            if (!botData.statusSettings[session.userId]) botData.statusSettings[session.userId] = {};
            botData.statusSettings[session.userId].isPublic = true;
        }
        if (typeof saveBotData === 'function') saveBotData();
    }
    if (config) config.WORK_TYPE = 'public';
    await sock.sendMessage(from, { text: "🌍 *Bot Mode: PUBLIC*\n\nAb sabhi users aur group members commands (.menu, .play, .ping, etc.) use kar sakte hain." }, { quoted: msg });
}

module.exports = publicCommand;
