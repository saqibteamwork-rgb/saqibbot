async function setnameCommand(sock, from, msg, isAllowed, botData, saveBotData, userId, q) {
    if (!isAllowed) return await sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner ya is session ka paired user name badal sakta hai." }, { quoted: msg });
    if (!q) return await sock.sendMessage(from, { text: "❌ Please provide a name. Example: .setname My Bot" }, { quoted: msg });
    
    botData.userNames[userId] = q;
    saveBotData();
    await sock.sendMessage(from, { text: `✅ Name set to: ${q}` }, { quoted: msg });
}

module.exports = setnameCommand;
