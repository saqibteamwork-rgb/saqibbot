async function privateCommand(sock, from, msg, isOwner, session) {
    if (!isOwner) return await sock.sendMessage(from, { text: "❌ *Access Denied:*\nSirf Bot Owner hi bot ko PRIVATE kar sakta hai." }, { quoted: msg });
    
    session.isPublic = false;
    await sock.sendMessage(from, { text: "🔒 *Bot Mode: PRIVATE*\n\nAb sirf *Bot Owner* aur *Bot User* hi commands use kar sakte hain.\nBaaqi sabhi users ignore honge." }, { quoted: msg });
}

module.exports = privateCommand;
