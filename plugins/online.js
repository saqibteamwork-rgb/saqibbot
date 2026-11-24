const { cmd } = require('../arslan');

cmd({
    pattern: "online",
    alias: ["whosonline", "onlinemembers"],
    desc: "Check who's online in the group (Admins & Owner only)",
    category: "main",
    react: "🟢",
    filename: __filename
},
async (conn, mek, m, { from, quoted, isGroup, isAdmins, isCreator, fromMe, reply }) => {
    try {
        if (!isGroup) return reply("*YEH COMMAND SIRF GROUPS ME USE KAREIN!*");
        if (!isCreator && !isAdmins && !fromMe) {
            return reply("*YEH COMMAND SIRF BOT OWNER OR GROUP ADMINS KE LIYE HAI!*");
        }

        await reply("*ONLINE MEMBERS CHECK HO RAHE HAIN... ⏳*\n*Kuch second intazar karein...*");

        const onlineMembers = new Set();
        const groupData = await conn.groupMetadata(from);
        const participants = groupData.participants || [];

        // Safe presence subscribe in small batches without spamming WhatsApp
        for (let i = 0; i < participants.length && i < 100; i += 10) {
            const batch = participants.slice(i, i + 10);
            await Promise.allSettled(batch.map(p => conn.presenceSubscribe(p.id).catch(() => {})));
            await new Promise(r => setTimeout(r, 200));
        }

        const presenceHandler = (json) => {
            for (const id in json.presences) {
                const presence = json.presences[id]?.lastKnownPresence;
                if (['available', 'composing', 'recording', 'online'].includes(presence)) {
                    onlineMembers.add(id);
                }
            }
        };

        conn.ev.on('presence.update', presenceHandler);

        // Wait 6 seconds for presence events, then cleanly unsubscribe and reply
        setTimeout(async () => {
            try {
                conn.ev.off('presence.update', presenceHandler);

                if (onlineMembers.size === 0) {
                    return reply("ℹ️ *Koi active member detect nahi hua (members ki privacy hide ho sakti hai).*");
                }

                const onlineArray = Array.from(onlineMembers);
                const onlineList = onlineArray.map((member, index) => 
                    `${index + 1}. @${member.split('@')[0]}`
                ).join('\n');

                const message = `*👑 ONLINE MEMBERS LIST 👑* (${onlineArray.length}/${participants.length}):\n\n${onlineList}`;

                await conn.sendMessage(from, { 
                    text: message,
                    mentions: onlineArray
                }, { quoted: mek });
            } catch (_) {}
        }, 6000);

    } catch (e) {
        console.error("Error in online command:", e.message);
        reply(`❌ Error: ${e.message}`);
    }
});
