// plugins/autoreply.js — MR SAQIB MD: Custom Auto-Responder & Keyword Triggers
// ============================================================================
//   .addreply <trigger> | <response>  → Custom keyword trigger set karein
//   .addreply off / on                → Chat mein auto-reply band / chalu karein
//   .delreply <trigger ya number>     → Trigger delete karein (.delreply all se saare)
//   .listreply                        → Saare triggers aur hit counts dekhein
//   .autoreply on | off | status      → Chat mein auto-reply toggle karein
// ============================================================================

const { cmd } = require('../command');
const autoResponder = require('../utils/autoResponder');
const config = require('../config');

const P = () => config.prefix || config.PREFIX || '.';

cmd({
    pattern: 'addreply',
    alias: ['setreply', 'addtrigger', 'settrigger'],
    desc: 'Custom keyword auto-responder set ya toggle karein',
    category: 'tools',
    react: '💬',
    use: '.addreply <trigger> | <response>  OR  .addreply off/on',
    filename: __filename
}, async (conn, mek, m, { args, reply, q, isOwner, isAdmin, isGroup, from }) => {
    // Check for quick off/on toggles via .addreply
    const firstArg = String(args[0] || '').toLowerCase().trim();
    if (firstArg === 'off' || firstArg === 'disable' || firstArg === 'stop') {
        if (isGroup && !isAdmin && !isOwner) {
            return reply('❌ Sirf Group Admin ya Bot Owner hi auto-reply off kar sakte hain.');
        }
        autoResponder.setChatEnabled(from, false);
        return reply('🔇 *Auto-Responder OFF:* Is chat mein custom auto-replies band kar diye gaye hain.\n💡 Wapas on karne ke liye: `.addreply on` ya `.autoreply on`');
    }
    if (firstArg === 'on' || firstArg === 'enable' || firstArg === 'start') {
        if (isGroup && !isAdmin && !isOwner) {
            return reply('❌ Sirf Group Admin ya Bot Owner hi auto-reply on kar sakte hain.');
        }
        autoResponder.setChatEnabled(from, true);
        return reply('✅ *Auto-Responder ON:* Is chat mein custom auto-replies activate ho gaye hain.\n💡 Band karne ke liye: `.addreply off` ya `.autoreply off`');
    }
    if (firstArg === 'clear' || firstArg === 'reset' || firstArg === 'delall' || firstArg === 'deleteall') {
        if (isGroup && !isAdmin && !isOwner) {
            return reply('❌ Sirf Group Admin ya Bot Owner hi triggers clear kar sakte hain.');
        }
        const count = autoResponder.clearAllReplies();
        return reply(`🗑️ *All Cleared:* Saare (${count}) custom auto-replies delete kar diye gaye hain.`);
    }

    // Only owner or group admin can add replies
    if (isGroup && !isAdmin && !isOwner) {
        return reply('❌ *Access Denied:* Sirf Group Admin ya Bot Owner hi custom replies add kar sakte hain.');
    }
    if (!isGroup && !isOwner) {
        return reply('❌ *Access Denied:* Sirf Bot Owner hi custom replies add kar sakte hain.');
    }

    const fullText = q || args.join(' ');
    if (!fullText || !fullText.includes('|')) {
        return reply(
            `💬 *MR SAQIB MD :: AUTO-RESPONDER*\n\n` +
            `*Format:* \`${P()}addreply <keyword> | <response>\`\n` +
            `*Band karne ke liye:* \`${P()}addreply off\` ya \`${P()}autoreply off\`\n\n` +
            `*Examples:*\n` +
            `• \`${P()}addreply salam | Walaikum Assalam jani! Welcome to MR SAQIB MD ❤️\`\n` +
            `• \`${P()}addreply price | MR SAQIB MD Premium details inbox check karein.\`\n` +
            `• \`${P()}addreply rules | 1. No spam\\n2. Respect admins\\n3. No 18+\`\n\n` +
            `💡 _Yeh sirf exact keyword ya short message par trigger hoga, aam lambi baaton mein trigger nahi karega!_`
        );
    }

    const parts = fullText.split('|');
    const trigger = parts[0].trim();
    const response = parts.slice(1).join('|').trim();

    if (!trigger || !response) {
        return reply('❌ Keyword aur reply dono required hain! Format: `.addreply keyword | reply`');
    }

    try {
        const added = autoResponder.addReply(trigger, response, isOwner ? 'Owner' : 'Admin', 'exact');
        return reply(
            `✅ *Custom Auto-Reply Added!*\n\n` +
            `🎯 *Trigger Keyword:* \`${added.trigger}\`\n` +
            `💬 *Response:*\n${added.response}\n\n` +
            `⚡ _Chat mein ab jab koi "${added.trigger}" likhega, bot yeh reply bhejega._\n` +
            `🔇 _Kisi bhi waqt band karne ke liye: \`${P()}addreply off\` ya \`${P()}delreply ${added.trigger}\`_`
        );
    } catch (e) {
        return reply(`❌ Error: ${e.message}`);
    }
});

cmd({
    pattern: 'delreply',
    alias: ['removereply', 'deltrigger'],
    desc: 'Custom keyword auto-responder delete karein (.delreply all se saare)',
    category: 'tools',
    react: '🗑️',
    use: '.delreply <trigger ya number ya all>',
    filename: __filename
}, async (conn, mek, m, { args, reply, isOwner, isAdmin, isGroup }) => {
    if (isGroup && !isAdmin && !isOwner) {
        return reply('❌ *Access Denied:* Sirf Group Admin ya Bot Owner hi triggers delete kar sakte hain.');
    }
    if (!isGroup && !isOwner) {
        return reply('❌ *Access Denied:* Sirf Bot Owner hi triggers delete kar sakte hain.');
    }

    const target = args.join(' ').trim();
    if (!target) {
        return reply(`🗑️ *Format:* \`${P()}delreply <trigger ya number>\` ya \`${P()}delreply all\`\nPehele \`${P()}listreply\` mein triggers check karein.`);
    }

    const removed = autoResponder.deleteReply(target);
    if (!removed) {
        return reply(`❌ Trigger \`${target}\` nahi mila. Check karne ke liye \`${P()}listreply\` likhein.`);
    }

    if (removed.all) {
        return reply(`✅ *All Triggers Deleted:* Saare (${removed.count}) custom auto-replies delete kar diye gaye hain.`);
    }

    return reply(`✅ *Trigger Deleted:* \`${removed.trigger}\` ko auto-responder se hata diya gaya hai.`);
});

cmd({
    pattern: 'listreply',
    alias: ['replylist', 'allreply', 'triggers'],
    desc: 'Saare custom keyword auto-replies dekhein',
    category: 'tools',
    react: '📋',
    use: '.listreply',
    filename: __filename
}, async (conn, mek, m, { reply }) => {
    const list = autoResponder.getReplies();
    if (!list || !list.length) {
        return reply(
            `📋 *MR SAQIB MD :: AUTO-RESPONDER*\n\n` +
            `_Abhi koi custom trigger set nahi hai._\n\n` +
            `Naya trigger add karne ke liye likhein:\n` +
            `👉 \`${P()}addreply salam | Walaikum Assalam jani!\``
        );
    }

    let out = `╔══════════════════════════╗\n`;
    out += `   💬 *CUSTOM AUTO-REPLIES* 💬\n`;
    out += `╚══════════════════════════╝\n\n`;
    out += `📌 *Total Active Triggers:* ${list.length}\n\n`;

    list.forEach((item, i) => {
        const preview = item.response.length > 50 ? item.response.slice(0, 47) + '...' : item.response;
        out += `*${i + 1}.* 🎯 \`${item.trigger}\` (Hits: ${item.hits || 0})\n`;
        out += `   💬 _"${preview.replace(/\n/g, ' ')}"_\n\n`;
    });

    out += `🗑️ *Delete Specific:* \`${P()}delreply <number ya trigger>\`\n`;
    out += `🗑️ *Delete All:* \`${P()}delreply all\`\n`;
    out += `🔇 *Turn Off:* \`${P()}addreply off\` ya \`${P()}autoreply off\`\n`;
    out += `➕ *Add New:* \`${P()}addreply <keyword> | <response>\`\n`;
    out += `⚡ *Powered by MR SAQIB MD*`;

    return reply(out);
});

cmd({
    pattern: 'autoreply',
    alias: ['smartreply', 'customreply', 'reply'],
    desc: 'Chat mein custom auto-responder toggle karein (on / off)',
    category: 'tools',
    react: '⚙️',
    use: '.autoreply on | off | status | clear',
    filename: __filename
}, async (conn, mek, m, { args, reply, from, isOwner, isAdmin, isGroup }) => {
    const sub = String(args[0] || '').toLowerCase().trim();

    if (sub === 'on' || sub === 'enable' || sub === 'start') {
        if (isGroup && !isAdmin && !isOwner) {
            return reply('❌ Sirf Group Admin ya Bot Owner hi auto-reply on kar sakte hain.');
        }
        autoResponder.setChatEnabled(from, true);
        return reply('✅ *Auto-Responder ON:* Is chat mein custom keyword triggers activate ho gaye hain.');
    }

    if (sub === 'off' || sub === 'disable' || sub === 'stop') {
        if (isGroup && !isAdmin && !isOwner) {
            return reply('❌ Sirf Group Admin ya Bot Owner hi auto-reply off kar sakte hain.');
        }
        autoResponder.setChatEnabled(from, false);
        return reply('🔇 *Auto-Responder OFF:* Is chat mein custom keyword triggers band kar diye gaye hain.');
    }

    if (sub === 'clear' || sub === 'reset' || sub === 'delall' || sub === 'deleteall') {
        if (isGroup && !isAdmin && !isOwner) {
            return reply('❌ Sirf Group Admin ya Bot Owner hi triggers clear kar sakte hain.');
        }
        const count = autoResponder.clearAllReplies();
        return reply(`🗑️ *All Cleared:* Saare (${count}) custom auto-replies delete kar diye gaye hain.`);
    }

    if (sub === 'global') {
        if (!isOwner) return reply('❌ Sirf Bot Owner hi global setting badal sakte hain.');
        const mode = String(args[1] || '').toLowerCase();
        if (mode === 'on' || mode === 'enable') {
            autoResponder.setGlobalEnabled(true);
            return reply('✅ *Global Auto-Responder ON:* Saare chats mein default active ho gaya hai.');
        } else if (mode === 'off' || mode === 'disable') {
            autoResponder.setGlobalEnabled(false);
            return reply('🔇 *Global Auto-Responder OFF:* Sabhi chats mein band ho gaya hai.');
        } else {
            return reply(`Format: \`${P()}autoreply global on | off\``);
        }
    }

    // Status
    const isEnabled = autoResponder.isChatEnabled(from);
    const list = autoResponder.getReplies();
    return reply(
        `╔══════════════════════════╗\n` +
        `   💬 *AUTO-RESPONDER STATUS* 💬\n` +
        `╚══════════════════════════╝\n\n` +
        `🔘 *Current Chat Status:* ${isEnabled ? 'ON ✅ (Active)' : 'OFF ❌ (Disabled)'}\n` +
        `📌 *Total Custom Triggers:* ${list.length} configured\n\n` +
        `• \`${P()}autoreply off\` (ya \`${P()}addreply off\`) → Turn OFF in this chat\n` +
        `• \`${P()}autoreply on\` (ya \`${P()}addreply on\`) → Turn ON in this chat\n` +
        `• \`${P()}addreply <word> | <msg>\` → Add custom trigger\n` +
        `• \`${P()}listreply\` → View all triggers\n` +
        `• \`${P()}delreply <word>\` → Delete trigger\n` +
        `• \`${P()}delreply all\` → Clear all triggers`
    );
});

module.exports = autoResponder;
