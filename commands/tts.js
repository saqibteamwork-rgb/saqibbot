// commands/tts.js - WhatsApp Voice Note (PTT) Text-To-Speech Generator
'use strict';

const googleTTS = require('google-tts-api');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

ffmpeg.setFfmpegPath(ffmpegStatic);

const SUPPORTED_LANGS = {
    'ur': 'Urdu',
    'hi': 'Hindi',
    'en': 'English',
    'ar': 'Arabic',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'id': 'Indonesian',
    'tr': 'Turkish',
    'ru': 'Russian',
    'ja': 'Japanese',
    'pt': 'Portuguese',
    'it': 'Italian',
    'bn': 'Bengali'
};

/**
 * Convert text into real WhatsApp voice note (PTT)
 */
async function ttsCommand(sock, from, msg, args = []) {
    let inPath = null;
    let outPath = null;

    try {
        let lang = 'ur'; // default to Urdu/Hindi pronunciation for South Asian audiences
        let text = '';

        // Check if first arg is an explicit language code
        if (args.length > 0 && SUPPORTED_LANGS[args[0].toLowerCase()]) {
            lang = args[0].toLowerCase();
            text = args.slice(1).join(' ').trim();
        } else {
            text = args.join(' ').trim();
        }

        // If no text provided directly, check quoted message
        if (!text) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quoted) {
                text = quoted.conversation ||
                       quoted.extendedTextMessage?.text ||
                       quoted.imageMessage?.caption ||
                       quoted.videoMessage?.caption ||
                       '';
            }
        }

        if (!text) {
            return await sock.sendMessage(from, {
                text:
`╭━━━〔 🎙️ *TEXT TO VOICE NOTE (PTT)* 〕━━━┈⊷
┃ 🗣️ *Usage:*
┃ • *.say <text>* (Auto Urdu Voice Note)
┃ • *.tts <lang> <text>* (Multi-Language)
┃ • Reply to any text message with *.say*
┃ 
┃ 🌐 *Popular Languages:*
┃ \`ur\` (Urdu), \`en\` (English), \`hi\` (Hindi),
┃ \`ar\` (Arabic), \`tr\` (Turkish), \`fr\` (French)
┃ 
┃ 💡 *Examples:*
┃ 👉 *.say Assalam o alaikum kaise ho sab*
┃ 👉 *.tts en Hello welcome to MR SAQIB MD*
┃ 👉 *.tts ar Alhamdulillah rabil alameen*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

🚀 *Powered by MR SAQIB MD*`
            }, { quoted: msg });
        }

        // WhatsApp voice notes sound best under 200 characters per segment
        if (text.length > 500) {
            text = text.substring(0, 500);
        }

        await sock.sendMessage(from, { react: { text: '🎙️', key: msg.key } }).catch(() => {});

        // Fetch Google TTS audio stream
        const ttsUrl = googleTTS.getAudioUrl(text, {
            lang: lang,
            slow: false,
            host: 'https://translate.google.com'
        });

        const response = await axios.get(ttsUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        if (!response.data || response.data.length === 0) {
            throw new Error("Could not fetch speech audio.");
        }

        const tmpDir = path.join(process.cwd(), 'temp');
        if (!fsSync.existsSync(tmpDir)) {
            await fs.mkdir(tmpDir, { recursive: true });
        }

        const id = crypto.randomBytes(6).toString('hex');
        inPath = path.join(tmpDir, `tts_${id}.mp3`);
        outPath = path.join(tmpDir, `tts_${id}.ogg`);

        await fs.writeFile(inPath, response.data);

        // Encode to official WhatsApp voice note Opus stream
        await new Promise((resolve, reject) => {
            ffmpeg(inPath)
                .toFormat('ogg')
                .audioCodec('libopus')
                .audioChannels(1)
                .audioFrequency(48000)
                .outputOptions([
                    '-avoid_negative_ts', 'make_zero'
                ])
                .on('end', resolve)
                .on('error', reject)
                .save(outPath);
        });

        const oggBuffer = await fs.readFile(outPath);

        // Send as real playable WhatsApp voice note (waveform audio)
        await sock.sendMessage(from, {
            audio: oggBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
        }, { quoted: msg });

        await sock.sendMessage(from, { react: { text: '✨', key: msg.key } }).catch(() => {});

    } catch (error) {
        console.error('[TTS Error]:', error);
        await sock.sendMessage(from, {
            text: `❌ Voice note generation fail ho gayi: ${error.message || 'Unknown error'}`
        }, { quoted: msg });
    } finally {
        try {
            if (inPath && fsSync.existsSync(inPath)) await fs.unlink(inPath);
            if (outPath && fsSync.existsSync(outPath)) await fs.unlink(outPath);
        } catch (_) {}
    }
}

module.exports = { ttsCommand };
