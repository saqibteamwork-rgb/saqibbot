// plugins/autoreply.js — MR SAQIB MD: Custom Auto-Responder & Keyword Triggers
// ============================================================================
//   .addreply <trigger> | <response>  → Custom keyword trigger set karein
//   .delreply <trigger ya number>     → Trigger delete karein
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
    desc: 'Custom keyword auto-responder set karein',
    category: 'tools',
    react: '💬',
    use: '.addreply <trigger> | <response>',
    filename: __filename
}, async (conn, mek, m, { args, reply, q, isOwner, isAdmin, isGroup }) => {
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
            `*Format:* \`${P()}addreply <keyword> | <response>\`\n\n` +
            `*Examples:*\n` +
            `• \`${P()}addreply salam | Walaikum Assalam jani! Welcome to MR SAQIB MD ❤️\`\n` +
            `• \`${P()}addreply price | MR SAQIB MD Premium details: Contact Owner or type .owner\`\n` +
            `• \`${P()}addreply rules | 1. No spam\\n2. Respect admins\\n3. No 18+\`\n\n` +
            `💡 _Jab bhi koi chat mein yeh keyword likhega, bot khud ba khud reply karega!_`
        );
    }

    const parts = fullText.split('|');
    const trigger = parts[0].trim();
    const response = parts.slice(1).join('|').trim();

    if (!trigger || !response) {
        return reply('❌ Keyword aur reply dono required hain! Format: `.addreply keyword | reply`');
    }

    try {
        const added = autoResponder.addReply(trigger, response, isOwner ? 'Owner' : 'Admin');
        return reply(
            `✅ *Custom Auto-Reply Added!*\n\n` +
            `🎯 *Trigger Keyword:* \`${added.trigger}\`\n` +
            `💬 *Response:*\n${added.response}\n\n` +
            `⚡ _Chat mein ab jab bhi koi "${added.trigger}" likhega, bot yeh reply bhejega._`
        );
    } catch (e) {
        return reply(`❌ Error: ${e.message}`);
    }
});

cmd({
    pattern: 'delreply',
    alias: ['removereply', 'deltrigger'],
    desc: 'Custom keyword auto-responder delete karein',
    category: 'tools',
    react: '🗑️',
    use: '.delreply <trigger ya number>',
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
        return reply(`🗑️ *Format:* \`${P()}delreply <trigger ya number>\`\nPehele \`${P()}listreply\` mein triggers check karein.`);
    }

    const removed = autoResponder.deleteReply(target);
    if (!removed) {
        return reply(`❌ Trigger \`${target}\` nahi mila. Check karne ke liye \`${P()}listreply\` likhein.`);
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

    out += `🗑️ *Delete:* \`${P()}delreply <number ya trigger>\`\n`;
    out += `➕ *Add New:* \`${P()}addreply <keyword> | <response>\`\n`;
    out += `⚡ *Powered by MR SAQIB MD*`;

    return reply(out);
});

cmd({
    pattern: 'autoreply',
    alias: ['smartreply', 'customreply'],
    desc: 'Chat mein custom auto-responder toggle karein',
    category: 'tools',
    react: '⚙️',
    use: '.autoreply on | off | status',
    filename: __filename
}, async (conn, mek, m, { args, reply, from, isOwner, isAdmin, isGroup }) => {
    const sub = String(args[0] || '').toLowerCase();

    if (sub === 'on') {
        if (isGroup && !isAdmin && !isOwner) {
            return reply('❌ Sirf Group Admin ya Bot Owner hi auto-reply on kar sakte hain.');
        }
        autoResponder.setChatEnabled(from, true);
        return reply('✅ *Auto-Responder ON:* Is chat mein custom keyword triggers activate ho gaye hain.');
    }

    if (sub === 'off') {
        if (isGroup && !isAdmin && !isOwner) {
            return reply('❌ Sirf Group Admin ya Bot Owner hi auto-reply off kar sakte hain.');
        }
        autoResponder.setChatEnabled(from, false);
        return reply('🔇 *Auto-Responder OFF:* Is chat mein custom keyword triggers band kar diye gaye hain.');
    }

    if (sub === 'global') {
        if (!isOwner) return reply('❌ Sirf Bot Owner hi global setting badal sakte hain.');
        const mode = String(args[1] || '').toLowerCase();
        if (mode === 'on') {
            autoResponder.setGlobalEnabled(true);
            return reply('✅ *Global Auto-Responder ON:* Saare chats mein default active ho gaya hai.');
        } else if (mode === 'off') {
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
        `📌 *Total Triggers:* ${list.length} configured\n\n` +
        `• \`${P()}autoreply on\` → Turn ON in this chat\n` +
        `• \`${P()}autoreply off\` → Turn OFF in this chat\n` +
        `• \`${P()}addreply <word> | <msg>\` → Add custom trigger\n` +
        `• \`${P()}listreply\` → View all triggers\n` +
        `• \`${P()}delreply <word>\` → Delete trigger`
    );
});

module.exports = autoResponder;
