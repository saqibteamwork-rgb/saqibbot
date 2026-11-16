const { cmd } = require("../command");
const { fetchGif, gifToVideo } = require("../lib/fetchGif");
const axios = require("axios");

const REACTIONS = [
    { pattern: "cry", react: "😢", desc: "Send a crying reaction GIF.", endpoint: "cry", action: "is crying over", solo: "is crying!" },
    { pattern: "cuddle", react: "🤗", desc: "Send a cuddle reaction GIF.", endpoint: "cuddle", action: "cuddled", solo: "wants cuddles!" },
    { pattern: "bully", react: "😈", desc: "Send a bully reaction GIF.", endpoint: "slap", action: "is bullying", solo: "is acting like a bully!" },
    { pattern: "hug", react: "🤗", desc: "Send a hug reaction GIF.", endpoint: "hug", action: "hugged", solo: "is giving free hugs!" },
    { pattern: "awoo", react: "🐺", desc: "Send an awoo reaction GIF.", endpoint: "wag", action: "howled at", solo: "goes AWOOO!" },
    { pattern: "lick", react: "👅", desc: "Send a lick reaction GIF.", endpoint: "kiss", action: "licked", solo: "is licking!" },
    { pattern: "pat", react: "🫂", desc: "Send a pat reaction GIF.", endpoint: "pat", action: "patted", solo: "wants headpats!" },
    { pattern: "smug", react: "😏", desc: "Send a smug reaction GIF.", endpoint: "smug", action: "is smug towards", solo: "is looking smug!" },
    { pattern: "bonk", react: "🔨", desc: "Send a bonk reaction GIF.", endpoint: "bonk", action: "bonked", solo: "is swinging a hammer!" },
    { pattern: "yeet", react: "💨", desc: "Send a yeet reaction GIF.", endpoint: "yeet", action: "yeeted", solo: "yeeted into orbit!" },
    { pattern: "blush", react: "😊", desc: "Send a blush reaction GIF.", endpoint: "blush", action: "is blushing at", solo: "is blushing so hard!" },
    { pattern: "handhold", react: "🤝", desc: "Send a hand-holding reaction GIF.", endpoint: "handhold", action: "is holding hands with", solo: "wants to hold hands!" },
    { pattern: "highfive", react: "✋", desc: "Send a high-five reaction GIF.", endpoint: "highfive", action: "high-fived", solo: "wants a high five!" },
    { pattern: "nom", react: "🍽️", desc: "Send a nom reaction GIF.", endpoint: "nom", action: "nommed on", solo: "is nomming!" },
    { pattern: "wave", react: "👋", desc: "Send a wave reaction GIF.", endpoint: "wave", action: "waved at", solo: "is waving at everyone!" },
    { pattern: "smile", react: "😁", desc: "Send a smile reaction GIF.", endpoint: "smile", action: "smiled at", solo: "is smiling brightly!" },
    { pattern: "wink", react: "😉", desc: "Send a wink reaction GIF.", endpoint: "wink", action: "winked at", solo: "winked!" },
    { pattern: "happy", react: "😊", desc: "Send a happy reaction GIF.", endpoint: "happy", action: "is super happy with", solo: "is jumping with happiness!" },
    { pattern: "glomp", react: "🤗", desc: "Send a glomp reaction GIF.", endpoint: "hug", action: "tackle hugged", solo: "tackles everyone with a hug!" },
    { pattern: "bite", react: "🦷", desc: "Send a bite reaction GIF.", endpoint: "bite", action: "bit", solo: "is taking a bite!" },
    { pattern: "poke", react: "👉", desc: "Send a poke reaction GIF.", endpoint: "poke", action: "poked", solo: "is poking around!" },
    { pattern: "cringe", react: "😬", desc: "Send a cringe reaction GIF.", endpoint: "facepalm", action: "cringed at", solo: "cringed hard!" },
    { pattern: "dance", react: "💃", desc: "Send a dance reaction GIF.", endpoint: "dance", action: "is dancing with", solo: "started dancing!" },
    { pattern: "kill", react: "🔪", desc: "Send a kill reaction GIF.", endpoint: "shoot", action: "eliminated", solo: "is on a rampage!" },
    { pattern: "slap", react: "✊", desc: "Send a slap reaction GIF.", endpoint: "slap", action: "slapped", solo: "is looking for someone to slap!" },
    { pattern: "kiss", react: "😘", desc: "Send a kiss reaction GIF.", endpoint: "kiss", action: "kissed", solo: "blew a kiss!" }
];

for (const item of REACTIONS) {
    cmd(
        {
            pattern: item.pattern,
            desc: item.desc,
            category: "fun",
            react: item.react,
            filename: __filename,
            use: "@tag (optional)",
        },
        async (conn, mek, m, { args, q, reply }) => {
            try {
                const senderJid = mek.sender || mek.key?.participant || '';
                const sender = `@${senderJid.split("@")[0]}`;
                const mentionedUser = m.mentionedJid?.[0] || (mek.quoted && (mek.quoted.sender || mek.quoted.participant));
                const isGroup = m.isGroup;

                let message = mentionedUser
                    ? `${sender} ${item.action} @${mentionedUser.split("@")[0]}`
                    : isGroup
                    ? `${sender} ${item.solo}`
                    : `> © Powered By MR SAQIB MD`;

                // Resilient nekos.best v2 API endpoint
                const res = await axios.get(`https://nekos.best/api/v2/${item.endpoint}`, {
                    timeout: 8000,
                    headers: { 'User-Agent': 'MR-SAQIB-MD/1.0' }
                });

                const gifUrl = res.data?.results?.[0]?.url;
                if (!gifUrl) {
                    return reply(`❌ *Reaction image nahi mil saki.*`);
                }

                const gifBuffer = await fetchGif(gifUrl);
                const videoBuffer = await gifToVideo(gifBuffer);

                const mentions = [senderJid, mentionedUser].filter(Boolean);

                await conn.sendMessage(
                    mek.chat,
                    {
                        video: videoBuffer,
                        caption: message,
                        gifPlayback: true,
                        mentions: mentions
                    },
                    { quoted: mek }
                );
            } catch (error) {
                console.error(`❌ Error in .${item.pattern} command:`, error.message);
                reply(`❌ *Error in .${item.pattern} command:*\n\`\`\`${error.message}\`\`\``);
            }
        }
    );
}
