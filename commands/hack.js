// commands/hack.js
'use strict';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function hackCommand(sock, chatId, message, q) {
    try {
        await sock.sendMessage(chatId, { react: { text: '💻', key: message.key } }).catch(() => {});

        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        const quotedParticipant = contextInfo?.participant;
        const mentioned = contextInfo?.mentionedJid || [];
        let target = 'Device';
        if (quotedParticipant) {
            target = '@' + quotedParticipant.split('@')[0];
        } else if (mentioned.length > 0) {
            target = '@' + mentioned[0].split('@')[0];
        } else if (q && q.trim()) {
            target = q.trim();
        }

        const steps = [
            `💻 *INITIALIZING EXPLOIT ON ${target}...* 💻`,
            `📡 *Scanning open ports & firewall...*\n\`\`\`[█▒▒▒▒▒▒▒▒▒] 10%\`\`\``,
            `💉 *Injecting trojan payloads...*\n\`\`\`[███▒▒▒▒▒▒▒] 30%\`\`\``,
            `🔑 *Bypassing 2FA & extracting session keys...*\n\`\`\`[█████▒▒▒▒▒] 50%\`\`\``,
            `📱 *Downloading WhatsApp chats, media & gallery...*\n\`\`\`[███████▒▒▒] 75%\`\`\``,
            `☁️ *Exfiltrating database to private cloud...*\n\`\`\`[█████████▒] 90%\`\`\``,
            `🧹 *Clearing backlogs, logs & traces...*\n\`\`\`[██████████] 100%\`\`\``,
            `╭━━━〔 ☣️ *HACK COMPLETED* ☣️ 〕━━━┈⊷\n┃ 🎯 *Target:* ${target}\n┃ 📂 *Data Dump:* 4.8 GB Extracted\n┃ 🛡️ *Status:* System Compromised ⚠️\n┃ 🤫 *Traces:* Completely Wiped\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n> *⚠️ Note: Mazahiya prank command hai! Tension na lein!* 😂\n*MR SAQIB MD*`
        ];

        const sent = await sock.sendMessage(chatId, { text: steps[0] }, { quoted: message });

        for (let i = 1; i < steps.length; i++) {
            await sleep(850);
            await sock.sendMessage(chatId, { text: steps[i], edit: sent.key }).catch(() => {});
        }
    } catch (err) {
        console.error('hackCommand error:', err);
        await sock.sendMessage(chatId, { text: `❌ Error: ${err.message || String(err)}` }, { quoted: message }).catch(() => {});
    }
}

module.exports = hackCommand;
