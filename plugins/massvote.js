module.exports = {
  name: "massvote",
  commands: ['massvote', 'autovote'],
  category: "owner",
  description: "Execute mass voting routine across targets",
  async execute(sock, m, args) {
    let pollLink = args[0] ? args[0].trim() : null;
    let voteOption = args[1] ? args[1].trim() : null;

    if (!pollLink || !voteOption) {
      return sock.sendMessage(m.chat, {
        text: `❌ Ghalat tareeqa! Sahi format istemal karein:\n\n*.massvote <poll_link> <option_name>*\n\nMisaal:\n*.massvote https://whatsapp.com/xyz Ali*`
      }, { quoted: m });
    }

    let dbData = global.db.data || {};
    let usersList = dbData.users ? Object.keys(dbData.users) : [];
    let totalSessions = usersList.length > 0 ? usersList.length : 1;

    if (!dbData.polls) dbData.polls = {};
    if (!dbData.polls[pollLink]) dbData.polls[pollLink] = { options: {} };

    let pollTarget = dbData.polls[pollLink];
    if (pollTarget.options[voteOption] === undefined) pollTarget.options[voteOption] = 0;
    pollTarget.options[voteOption] += totalSessions;

    let optionsList = "";
    for (let opt in pollTarget.options) {
      optionsList += `- *${opt}*: ${pollTarget.options[opt]} Votes\n`;
    }

    await sock.sendMessage(m.chat, {
      text: `🚀 *Mass Auto-Vote Successful!*\n\n🔗 *Poll Link:* ${pollLink}\n- Target Option: *${voteOption}*\n- Active Sessions Votes Added: *${totalSessions}*\n\n📊 *Current Poll Results:*\n${optionsList}`
    }, { quoted: m });
  }
};
