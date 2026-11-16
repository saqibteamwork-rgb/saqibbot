'use strict';

/**
 * MR SAQIB MD :: SILENT SAVE CONFIGURATION (.silentsave / .autosave)
 * ============================================================================
 * Configure silent inbox auto-save for WhatsApp Statuses and View-Once Media.
 * ============================================================================
 */

const settings = require('../settings');

async function silentSaveCommand(sock, from, msg, isOwner, botData, saveBotData, userId, args = []) {
    if (!isOwner) {
        return await sock.sendMessage(from, { text: "❌ *Sirf Bot Owner hi Silent Save settings change kar sakta hai.*" }, { quoted: msg });
    }

    if (!botData.statusSettings[userId]) {
        botData.statusSettings[userId] = {
            autoStatus: false,
            autoSeen: false,
            autoLike: false,
            autoDownload: false,
            silentSave: true,
            isPublic: typeof botData?.globalSettings?.isPublic === 'boolean' ? botData.globalSettings.isPublic : true
        };
    }

    const currentSettings = botData.statusSettings[userId];
    const isCurrentlyActive = currentSettings.silentSave !== false;
    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
        currentSettings.silentSave = true;
        if (typeof saveBotData === 'function') saveBotData();
        return await sock.sendMessage(from, {
            text: "✅ *Silent Media & Status Saver: ENABLED*\n\nAb status ya view-once/media par ❤️, good, nice, sad, broken heart, acha, thanks bhejne par media silently aapke inbox mein save ho jayega!"
        }, { quoted: msg });
    }

    if (action === 'off' || action === 'disable' || action === '0') {
        currentSettings.silentSave = false;
        if (typeof saveBotData === 'function') saveBotData();
        return await sock.sendMessage(from, {
            text: "❌ *Silent Media & Status Saver: DISABLED*"
        }, { quoted: msg });
    }

    // Default: Display information & status card
    const card =
`╭━━━〔 📥 *SILENT MEDIA & STATUS SAVER* 〕━━━┈⊷
┃ ⚡ *Status:* ${isCurrentlyActive ? 'ACTIVE ✅' : 'DISABLED ❌'}
┃
┃ 🔓 *View-Once Auto-Save:*
┃ Kisi bhi View-Once photo, video ya voice note
┃ ko reply karke likhein:
┃ 👉 *good*, *sad*, *nice*, *thanks*, *acha*, *save*, *vv*
┃ ➔ _Media foran aapke apne inbox mein unlock ho jayega!_
┃
┃ 📥 *Status Auto-Save:*
┃ Kisi ke bhi WhatsApp Status par reply karein:
┃ 👉 *❤️*, *💔*, *good*, *sad*, *nice*, *broken heart*, *bhejo*
┃ ➔ _Status video/photo bina kisi shor ke aapke inbox mein save hoga!_
┃
┃ ⚙️ *Commands:*
┃ 👉 \`.silentsave on\`  — Turn ON
┃ 👉 \`.silentsave off\` — Turn OFF
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷
🚀 *${settings.botName || 'MR SAQIB MD'}*`;

    await sock.sendMessage(from, { text: card }, { quoted: msg });
}

module.exports = { silentSaveCommand };
