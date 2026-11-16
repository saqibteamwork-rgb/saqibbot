const config = require('../config');
// NOTE: Le code complet dépend de la fonction 'get' si vous voulez des messages par groupe
// const { get } = require('./database'); 

/**
 * Gère les événements de participants de groupe (ajout ou suppression).
 * @param {import('@whiskeysockets/baileys').WASocket} conn Le socket de connexion Baileys.
 * @param {import('@whiskeysockets/baileys').GroupParticipantsUpdate} update L'objet de mise à jour des participants.
 */
async function groupEvents(conn, update) {
    // Variables de configuration (Assurez-vous qu'elles existent dans config.js)
    const isWelcomeEnabled = config.WELCOME_ENABLE === 'true'; 
    const isGoodbyeEnabled = config.GOODBYE_ENABLE === 'true'; 
    
    if (!isWelcomeEnabled && !isGoodbyeEnabled) return;

    try {
        const metadata = await conn.groupMetadata(update.id);
        const groupName = metadata.subject;
        const groupJid = update.id;
        const participants = update.participants;

        for (const participantJid of participants) {
            const username = `@${participantJid.split('@')[0]}`;
            
            // 1. GESTION DU MESSAGE DE BIENVENUE (ADD)
            if (update.action === 'add' && isWelcomeEnabled) {
                
                const defaultWelcomeMsg =
`╭━━━〔 🌸💗 WELCOME TO OUR FAMILY 💗🌸 〕━━━╮

🥹✨ Oyee @user, welcome hai ji! 🦋💞

🏡 Hamari pyari si family *@group* mein khush aamdeed!
🎀 Ab aap bhi hamari family ka hissa ho.
🤝 Sab se pyaar se milo, dosti karo aur enjoy karo.
🌷 Hamesha khush raho aur apni smile banaye rakho.
🫶 Izzat do, izzat lo — sab ke saath pyaar se raho.

💌 Umeed hai yahan aapki achi dosti hogi aur bohat sari pyari memories banengi! 🥹💖

╰━━━〔 🦋 STAY HAPPY & KEEP SMILING 🦋 〕━━━╯

💗 *𝐀𝐌𝐀𝐍 ki taraf se* 🥲🫶`;

                const welcomeText = config.WELCOME_MSG || defaultWelcomeMsg;
                const message = welcomeText
                    .replace(/@user/g, username)
                    .replace(/@group/g, groupName);

                // Agar custom image URL di ho to use karo; warna bot khud cute welcome card banaye.
                if (config.WELCOME_IMAGE && config.WELCOME_IMAGE.length > 5) {
                    await conn.sendMessage(groupJid, {
                        image: { url: config.WELCOME_IMAGE },
                        caption: message,
                        mentions: [participantJid]
                    });
                } else {
                    try {
                        const sharp = require('sharp');
                        const svg = `<svg width="1000" height="650" xmlns="http://www.w3.org/2000/svg">
                        <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#250b35"/><stop offset="1" stop-color="#ff5b9e"/></linearGradient><radialGradient id="glow"><stop stop-color="#fff1f8" stop-opacity=".9"/><stop offset="1" stop-color="#ff8fbd" stop-opacity="0"/></radialGradient></defs>
                        <rect width="1000" height="650" rx="45" fill="url(#bg)"/><circle cx="500" cy="290" r="250" fill="url(#glow)"/>
                        <g fill="#fff0f7" font-family="Arial,sans-serif" text-anchor="middle"><text x="500" y="125" font-size="54" font-weight="bold">WELCOME TO OUR FAMILY</text><text x="500" y="205" font-size="35">💗  🦋  💞  🦋  💗</text><text x="500" y="345" font-size="96">💖</text><text x="500" y="440" font-size="36">Apni family mein khush aamdeed!</text><text x="500" y="510" font-size="31">Khush raho • Smile karte raho</text><text x="500" y="585" font-size="30" font-weight="bold">𝐀𝐌𝐀𝐍 ki taraf se 🥲💞</text></g></svg>`;
                        const card = await sharp(Buffer.from(svg)).png().toBuffer();
                        await conn.sendMessage(groupJid, { image: card, caption: message, mentions: [participantJid] });
                    } catch (imageError) {
                        console.error('Welcome card image error:', imageError.message);
                        await conn.sendMessage(groupJid, { text: message, mentions: [participantJid] });
                    }
                }
            }
            
            // 2. GESTION DU MESSAGE D'AU REVOIR (REMOVE)
            else if (update.action === 'remove' && isGoodbyeEnabled) {
                
                const defaultGoodbyeMsg = 
`*╭─「 FAREWELL LEGEND 」─◇*
*│*
*│* *😔 ᴍᴇᴍʙᴇʀ ʟᴇғᴛ ᴛʜᴇ ᴄʜᴀᴛ...*
*│* *👤 ʙʏᴇ ʙʏᴇ:* ${username}
*│* *📢 ᴍsɢ:* We hope to see you again soon!
*│*
*╰────────────────────○*`;
                
                const goodbyeText = config.GOODBYE_MSG || defaultGoodbyeMsg;

                const message = goodbyeText
                    .replace(/@user/g, username)
                    .replace(/@group/g, groupName);
                
                // Envoi de l'image d'au revoir si configurée
                if (config.GOODBYE_IMAGE && config.GOODBYE_IMAGE.length > 5) {
                    await conn.sendMessage(groupJid, {
                        image: { url: config.GOODBYE_IMAGE },
                        caption: message,
                        mentions: [participantJid]
                    });
                } else {
                    await conn.sendMessage(groupJid, { text: message, mentions: [participantJid] });
                }
            }
        }
    } catch (e) {
        console.error("Group Events Error:", e.message);
    }
}

module.exports = {
    groupEvents
};
                                                      
