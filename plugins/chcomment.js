module.exports = {
  name: "chcomment",
  commands: ['chcomment', 'channelcomment', 'chcom'],
  category: "tools",
  description: "Post comments on channel updates",
  async execute(sock, m, args) {
    let fullText = args.join(' ');
    let postLink = args[0] ? args[0].trim() : null;

    if (!postLink || !postLink.includes('whatsapp.com/channel/')) {
      return sock.sendMessage(m.chat, {
        text: `❌ Sahi link aur format istemal kar bhai:\n\n*.chcomment <channel_post_link> "Tera Message" <count>*`
      }, { quoted: m });
    }

    let linkParts = postLink.split('/');
    let messageId = linkParts[linkParts.length - 1];

    await sock.sendMessage(m.chat, {
      text: `🚀 *Channel Post Comment Task Started!*\n\n🔗 Post Link ID: ${messageId}\n📊 Status: Dispatching comments routine...`
    }, { quoted: m });
  }
};
