// plugins/tool-tts.js - WhatsApp Voice Note (PTT) Generator
'use strict';

const { cmd } = require('../command');
const { ttsCommand } = require('../commands/tts');

cmd({
    pattern: "tts",
    alias: ["say", "speak", "voicenote"],
    desc: "Convert text to real WhatsApp Opus voice note (PTT)",
    category: "audio",
    react: "🎙️",
    filename: __filename
}, async (conn, mek, m, { from, args, reply }) => {
    try {
        await ttsCommand(conn, from, mek, args);
    } catch (e) {
        reply(`❌ Error: ${e.message || e}`);
    }
});
