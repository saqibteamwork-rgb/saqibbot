// plugins/tts.js
// MR SAQIB MD — Text to Speech with multiple voices

const { cmd } = require('../arslan');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ═══════════════════════════════════════════
//  VOICE OPTIONS — edge-tts-universal
// ═══════════════════════════════════════════
const VOICES = {
    // English
    'en-us-female': 'en-US-JennyNeural',
    'en-us-male': 'en-US-GuyNeural',
    'en-uk-female': 'en-GB-SoniaNeural',
    'en-uk-male': 'en-GB-RyanNeural',
    'en-au-female': 'en-AU-NatashaNeural',
    'en-in-female': 'en-IN-NeerjaNeural',
    'en-in-male': 'en-IN-PrabhatNeural',

    // Hindi
    'hi-female': 'hi-IN-SwaraNeural',
    'hi-male': 'hi-IN-MadhurNeural',

    // Urdu
    'ur-female': 'ur-PK-UzmaNeural',
    'ur-male': 'ur-PK-AsadNeural',

    // Arabic
    'ar-female': 'ar-SA-ZariyahNeural',
    'ar-male': 'ar-SA-HamedNeural',

    // Japanese
    'ja-female': 'ja-JP-NanamiNeural',
    'ja-male': 'ja-JP-KeitaNeural',

    // Korean
    'ko-female': 'ko-KR-SunHiNeural',
    'ko-male': 'ko-KR-InJoonNeural',

    // Chinese
    'zh-female': 'zh-CN-XiaoxiaoNeural',
    'zh-male': 'zh-CN-YunxiNeural',

    // Spanish
    'es-female': 'es-ES-ElviraNeural',
    'es-male': 'es-ES-AlvaroNeural',

    // French
    'fr-female': 'fr-FR-DeniseNeural',
    'fr-male': 'fr-FR-HenriNeural',

    // Russian
    'ru-female': 'ru-RU-SvetlanaNeural',
    'ru-male': 'ru-RU-DmitryNeural'
};

// ═══════════════════════════════════════════
//  .tts — Text to speech
// ═══════════════════════════════════════════
cmd({
    pattern: 'tts',
    alias: ['voice', 'speak', 'say'],
    desc: 'Convert text to speech audio',
    category: 'tools',
    react: '🎤',
    use: '.tts <voice> <text>',
    filename: __filename
}, async (conn, mek, m, { args, reply, from }) => {
    try {
        if (args.length < 2) {
            const voiceList = Object.keys(VOICES).slice(0, 20).map(v => `• \`${v}\``).join('\n');
            return reply(
`🎤 *TEXT TO SPEECH*

📌 *Usage:* .tts <voice> <text>

📖 *Examples:*
.tts hi-female Namaste doston
.tts en-us-male Hello world
.tts ur-male Assalam o alaikum

🎙️ *Available Voices:*
${voiceList}

...and ${Object.keys(VOICES).length - 20} more`
            );
        }

        const voiceKey = args[0].toLowerCase();
        const text = args.slice(1).join(' ').trim();

        const voiceName = VOICES[voiceKey];
        if (!voiceName) {
            return reply(`❌ *Invalid voice:* \`${voiceKey}\`\n\nUse: ${Object.keys(VOICES).slice(0, 10).join(', ')}...`);
        }

        if (text.length > 500) {
            return reply('❌ *Text bahut lamba hai.* 500 chars max.');
        }

        await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } });

        // Generate TTS
        const { EdgeTTS } = require('edge-tts-universal');
        const tts = new EdgeTTS(text, voiceName);

        const audioBuffer = await tts.synthesize();

        // Save temp file
        const tmpFile = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
        fs.writeFileSync(tmpFile, Buffer.from(await audioBuffer.audio.arrayBuffer()));

        // Send audio
        await conn.sendMessage(from, {
            audio: fs.readFileSync(tmpFile),
            mimetype: 'audio/mpeg',
            ptt: true,
            fileName: `tts_${voiceKey}.mp3`
        }, { quoted: mek });

        // Cleanup
        try { fs.unlinkSync(tmpFile); } catch (_) {}

        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });

    } catch (err) {
        console.error('[tts] ERROR:', err.message);
        return reply(`❌ *TTS failed:* ${err.message}`);
    }
});

// ═══════════════════════════════════════════
//  .voices — list all voices
// ═══════════════════════════════════════════
cmd({
    pattern: 'voices',
    alias: ['voicelist', 'ttsvoices'],
    desc: 'Show all TTS voices',
    category: 'tools',
    react: '🎙️',
    filename: __filename
}, async (conn, mek, m, { reply }) => {
    const groups = {
        English: Object.keys(VOICES).filter(v => v.startsWith('en-')),
        Hindi: Object.keys(VOICES).filter(v => v.startsWith('hi-')),
        Urdu: Object.keys(VOICES).filter(v => v.startsWith('ur-')),
        Arabic: Object.keys(VOICES).filter(v => v.startsWith('ar-')),
        Japanese: Object.keys(VOICES).filter(v => v.startsWith('ja-')),
        Korean: Object.keys(VOICES).filter(v => v.startsWith('ko-')),
        Chinese: Object.keys(VOICES).filter(v => v.startsWith('zh-')),
        Spanish: Object.keys(VOICES).filter(v => v.startsWith('es-')),
        French: Object.keys(VOICES).filter(v => v.startsWith('fr-')),
        Russian: Object.keys(VOICES).filter(v => v.startsWith('ru-'))
    };

    let out = '🎙️ *TTS VOICES*\n\n';
    for (const [lang, list] of Object.entries(groups)) {
        if (list.length) {
            out += `*${lang}:*\n${list.map(v => `• \`${v}\``).join('\n')}\n\n`;
        }
    }
    return reply(out.slice(0, 4000));
});

console.log('[MR SAQIB MD] TTS commands loaded');