// ============================================
// MR SAQIB MD | FIXED WHATSAPP TTS
// Railway / Render
// ============================================

const { cmd } = require('../arslan');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// Prefer the npm-bundled FFmpeg binary on Railway; do not depend on system ffmpeg/python3.
let FFMPEG_BIN = 'ffmpeg';
try { FFMPEG_BIN = require('@ffmpeg-installer/ffmpeg').path || 'ffmpeg'; } catch (_) {}

let EdgeTTS = null;

try {
    const edge = require('edge-tts-universal');
    EdgeTTS = edge.UniversalEdgeTTS || edge.EdgeTTS;
    console.log('[SAQIB TTS] Edge-TTS loaded');
} catch (error) {
    console.error('[SAQIB TTS] Module missing:', error.message);
}

const VOICES = {
    jarvis: 'ur-PK-AsadNeural',
    raju: 'ur-PK-AsadNeural',
    asad: 'ur-PK-AsadNeural',
    uzma: 'ur-PK-UzmaNeural',
    female: 'ur-PK-UzmaNeural',
    male: 'ur-PK-AsadNeural',
    'english-m': 'en-US-GuyNeural',
    'english-f': 'en-US-AriaNeural',
    'jarvis-en': 'en-US-GuyNeural',
    hindi: 'hi-IN-MadhurNeural',
    'hindi-f': 'hi-IN-SwaraNeural'
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// GENERATE VALID OGG / OPUS VOICE NOTE
// ============================================

async function createVoice(text, voice) {
    if (!EdgeTTS) {
        throw new Error('EDGE_TTS_MISSING');
    }

    const workDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'SAQIB-tts-')
    );

    const mp3Path = path.join(workDir, 'input.mp3');
    const oggPath = path.join(workDir, 'voice.ogg');

    try {
        const tts = new EdgeTTS(text, voice);
        const result = await tts.synthesize();

        if (!result?.audio?.arrayBuffer) {
            throw new Error('TTS returned no audio');
        }

        const audioBuffer = Buffer.from(
            await result.audio.arrayBuffer()
        );

        if (audioBuffer.length < 1000) {
            throw new Error('Generated audio is empty');
        }

        await fs.writeFile(mp3Path, audioBuffer);

        // -y must be before the output file.
        // Force real OGG container with Opus codec.
        await execFileAsync(FFMPEG_BIN, [
            '-hide_banner',
            '-loglevel', 'error',
            '-y',
            '-i', mp3Path,
            '-vn',
            '-map_metadata', '-1',
            '-c:a', 'libopus',
            '-application', 'voip',
            '-b:a', '32k',
            '-vbr', 'on',
            '-ac', '1',
            '-ar', '48000',
            '-f', 'ogg',
            oggPath
        ], {
            timeout: 60000,
            maxBuffer: 2 * 1024 * 1024
        });

        const oggBuffer = await fs.readFile(oggPath);

        // OGG files start with the OggS signature.
        if (
            oggBuffer.length < 1000 ||
            oggBuffer.toString('ascii', 0, 4) !== 'OggS'
        ) {
            throw new Error('OGG/Opus conversion validation failed');
        }

        return oggBuffer;

    } catch (error) {
        console.error('[SAQIB TTS ERROR]', error.message);
        throw error;
    } finally {
        await fs.remove(workDir).catch(() => {});
    }
}

// ============================================
// SEND VOICE NOTE
// ============================================

async function sendVoice(conn, mek, ctx, text, voice) {
    const audio = await createVoice(text, voice);

    // Send actual audio bytes, not a temporary file URL.
    await conn.sendMessage(ctx.from, {
        audio: audio,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true
    }, { quoted: mek });
}

// ============================================
// COMMON COMMAND HANDLER
// ============================================

async function handleTTS(conn, mek, ctx, input, defaultVoice) {
    if (!EdgeTTS) {
        return ctx.reply(
            '❌ Edge-TTS missing. Install edge-tts-universal.'
        );
    }

    input = (input || '').trim();

    if (!input) {
        return ctx.reply(
            '🎙️ *MR SAQIB MD TTS*\n\n' +
            'Use: .tts hello bhai\n' +
            'Use: .tts jarvis salam bhai\n' +
            'Use: .tts english-m Hello boss\n' +
            'Use: .jarvis Hello boss\n' +
            'Use: .raju Kya haal hai'
        );
    }

    const parts = input.split(/\s+/);
    const firstWord = parts[0].toLowerCase();

    let voice = defaultVoice || VOICES.jarvis;
    let text = input;

    if (VOICES[firstWord]) {
        voice = VOICES[firstWord];
        text = parts.slice(1).join(' ');
    }

    text = text.trim();

    if (text.length < 2) {
        return ctx.reply('❌ Voice generate karne ke liye text do.');
    }

    if (text.length > 500) {
        return ctx.reply('❌ Maximum 500 characters allowed hain.');
    }

    await conn.sendMessage(ctx.from, {
        react: { text: '⏳', key: mek.key }
    });

    try {
        await sendVoice(conn, mek, ctx, text, voice);

        await conn.sendMessage(ctx.from, {
            react: { text: '✅', key: mek.key }
        });

    } catch (error) {
        console.error('[SAQIB TTS]', error);

        await conn.sendMessage(ctx.from, {
            react: { text: '❌', key: mek.key }
        });

        if (error.message === 'EDGE_TTS_MISSING') {
            return ctx.reply(
                '❌ TTS package missing hai. Railway par npm install/redeploy karo.'
            );
        }

        if (error.code === 'ENOENT') {
            return ctx.reply('❌ Audio converter nahi mila. Railway par dependencies reinstall karke redeploy karo.');
        }
        return ctx.reply(
            '❌ Voice generate nahi hui.\n' +
            'Railway deployment logs mein [SAQIB TTS ERROR] check karo.'
        );
    }
}

// ============================================
// .TTS
// ============================================

cmd({
    pattern: 'tts',
    alias: ['voice', 'say', 'speak', 'bolo'],
    desc: 'Text to voice',
    category: 'tools',
    react: '🎙️',
    use: '.tts <text>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    return handleTTS(
        conn, mek, ctx, ctx.q, VOICES.jarvis
    );
});

// ============================================
// .JARVIS
// ============================================

cmd({
    pattern: 'jarvis',
    alias: ['jarvisvoice'],
    desc: 'Jarvis voice',
    category: 'fun',
    react: '🤖',
    use: '.jarvis <text>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    return handleTTS(
        conn, mek, ctx, ctx.q, VOICES.jarvis
    );
});

// ============================================
// .RAJU
// ============================================

cmd({
    pattern: 'raju',
    alias: ['rajuvoice'],
    desc: 'Raju voice',
    category: 'fun',
    react: '🎤',
    use: '.raju <text>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    return handleTTS(
        conn, mek, ctx, ctx.q, VOICES.raju
    );
});

// ============================================
// .VOICES
// ============================================

cmd({
    pattern: 'voices',
    alias: ['voicelist', 'ttsvoices'],
    desc: 'List available TTS voices',
    category: 'tools',
    react: '🎙️',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    return ctx.reply(
        '🎙️ *MR SAQIB MD VOICES*\n\n' +
        '🇵🇰 Urdu male: `jarvis`, `raju`, `male`\n' +
        '🇵🇰 Urdu female: `uzma`, `female`\n' +
        '🇮🇳 Hindi male: `hindi`\n' +
        '🇮🇳 Hindi female: `hindi-f`\n' +
        '🇺🇸 English male: `english-m`\n' +
        '🇺🇸 English female: `english-f`\n\n' +
        'Example: `.tts jarvis Hello boss`'
    );
});

console.log('[MR SAQIB MD] TTS commands registered');