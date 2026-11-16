const { cmd } = require('../arslan');

// Fun group command: mentions current group members only.
cmd({
    pattern: 'amankijan',
    alias: ['amankijaan'],
    desc: 'Group ke sab members ko fun message mein mention kare',
    category: 'fun',
    react: '💗',
    use: '.amankijan',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx.isGroup) return ctx.reply('🥹💗 Bhai, ye command sirf group mein chalegi.');
    try {
        const meta = await conn.groupMetadata(ctx.from);
        const participants = meta.participants || [];
        if (!participants.length) return ctx.reply('😅 Members ki list nahi mil saki, dobara try karo.');
        const mentions = participants.map(p => p.id || p.jid).filter(Boolean);
        if (!mentions.length) return ctx.reply('😅 Kisi member ko mention nahi kar saka.');
        const mentionLines = mentions.map(jid => `💞 @${jid.split('@')[0]}`);
        const text = [
            '╭━━━〔 💗 AMAN KI JAAN 💗 〕━━━╮',
            '',
            '🥹🌸 Oyee suno sab log! 🌸🥹',
            '',
            'AMAN ki koi to jaan ban jaio yaar 😂💞',
            'Koi pyari si churail hi ban jao, dil khush kar do! 🧙‍♀️💗',
            'Lekin sab apni apni izzat aur boundaries ka khayal rakhna 😅🫶',
            '',
            '💌 Chalo ji, sab ko AMAN ki taraf se pyaar!',
            '',
            ...mentionLines,
            '',
            '╰━━━〔 🥲💞 AMAN KI TARAF SE 💞🥲 〕━━━╯'
        ].join('\n');
        return await conn.sendMessage(ctx.from, { text, mentions }, { quoted: mek });
    } catch (e) {
        console.error('amankijan command error:', e);
        return ctx.reply('❌ Oops yaar, command abhi nahi chali. Bot ko dobara try karwao.');
    }
});
