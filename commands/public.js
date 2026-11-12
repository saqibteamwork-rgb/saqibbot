async function publicCommand(sock, from, msg, isOwner, session) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner hi bot ko PUBLIC kar sakta hai." }, { quoted: msg });
    
    session.isPublic = true;
    await sock.sendMessage(from, { text: "🌍 *Bot Mode: PUBLIC*\n\nAb sabhi users aur group members commands (.menu, .play, .ping, etc.) use kar sakte hain." }, { quoted: msg });
}

module.exports = publicCommand;
