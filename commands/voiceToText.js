// commands/voiceToText.js - WhatsApp Voice Note to Text Transcriber via Whisper AI
'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const FormData = require('form-data');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const settings = require('../settings');

ffmpeg.setFfmpegPath(ffmpegStatic);

let cachedGroqKey = '';

/**
 * Dynamically resolves Groq API key across Environment, Settings,
 * Local JSON storage (data/bot_data.json), or live MongoDB Atlas.
 */
async function getGroqApiKey() {
    if (cachedGroqKey) return cachedGroqKey;

    if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.startsWith('gsk_')) {
        cachedGroqKey = process.env.GROQ_API_KEY.trim();
        return cachedGroqKey;
    }

    if (settings.groqApiKey && settings.groqApiKey.startsWith('gsk_')) {
        cachedGroqKey = settings.groqApiKey.trim();
        return cachedGroqKey;
    }

    // Direct read from .env (in case .env was saved without restarting Node)
    try {
        const envPath = path.join(process.cwd(), '.env');
        if (fsSync.existsSync(envPath)) {
            const envContent = fsSync.readFileSync(envPath, 'utf8');
            const match = envContent.match(/GROQ_API_KEY\s*=\s*(gsk_[a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                cachedGroqKey = match[1].trim();
                process.env.GROQ_API_KEY = cachedGroqKey;
                return cachedGroqKey;
            }
        }
    } catch (_) {}

    // 1. Check data/bot_data.json
    try {
        const dataPath = path.join(process.cwd(), 'data', 'bot_data.json');
        if (fsSync.existsSync(dataPath)) {
            const bd = JSON.parse(fsSync.readFileSync(dataPath, 'utf8'));
            if (bd?.globalSettings?.groqApiKey && bd.globalSettings.groqApiKey.startsWith('gsk_')) {
                cachedGroqKey = bd.globalSettings.groqApiKey.trim();
                return cachedGroqKey;
            }
        }
    } catch (_) {}

    // 2. Check MongoDB Atlas cluster database
    try {
        const mongoSync = require('../utils/mongoSync');
        const db = mongoSync.getDb ? mongoSync.getDb() : null;
        if (db) {
            const doc = await db.collection('bot_data').findOne({ _id: 'bot_data' });
            let payload = doc?.payload;
            if (typeof payload === 'string') {
                try { payload = JSON.parse(payload); } catch (_) {}
            }
            if (payload?.globalSettings?.groqApiKey && payload.globalSettings.groqApiKey.startsWith('gsk_')) {
                cachedGroqKey = payload.globalSettings.groqApiKey.trim();
                return cachedGroqKey;
            }
        }
    } catch (_) {}

    return '';
}

/**
 * Transcribe Audio / Voice Note into Text
 */
async function voiceToTextCommand(sock, from, msg, args = []) {
    let inPath = null;
    let outPath = null;

    try {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const target = quoted || msg.message;
        const actual = target?.viewOnceMessageV2?.message || target?.viewOnceMessage?.message || target;

        const audioMsg = actual?.audioMessage;

        if (!audioMsg) {
            return await sock.sendMessage(from, {
                text:
`╭━━━〔 🎙️ *VOICE NOTE TO TEXT (V2T)* 〕━━━┈⊷
┃ 📌 *Usage:*
┃ Kisi bhi voice note ya audio message ko reply
┃ karke *.v2t* ya *.totext* likhein!
┃ 
┃ 💡 *Aliases:*
┃ • *.v2t*
┃ • *.totext*
┃ • *.transcribe*
┃ • *.listen*
┃ 
┃ ✨ *Features:*
┃ • Voice note ko text me convert karta hai
┃ • Urdu, English, Punjabi, Hindi, Arabic support
┃ • Noisy jagah par voice sune baghair parhein
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

🚀 *Powered by MR SAQIB MD (Whisper Engine)*`
            }, { quoted: msg });
        }

        const groqKey = await getGroqApiKey();
        const openaiKey = process.env.OPENAI_API_KEY || '';

        // If no Whisper key is configured, prompt with easy setup guide
        if (!groqKey && !openaiKey) {
            return await sock.sendMessage(from, {
                text:
`⚠️ *Voice-to-Text Setup Required*

Voice notes ko transcribe karne ke liye Whisper AI engine zaroori hai.

👉 *100% Free Groq API Key (1 Minute Setup):*
1. \`console.groq.com/keys\` par jayein (free Google sign-in).
2. *Create API Key* par click karein aur key copy karein.
3. Bot Owner WhatsApp par likhein:
   👉 *.setgroq gsk_your_api_key_here*

Iske baad bot har voice note ko instantly text me transcribe karega!`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '👂', key: msg.key } }).catch(() => {});

        // Download audio stream from WhatsApp
        const stream = await downloadContentFromMessage(audioMsg, 'audio');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        if (!buffer || buffer.length === 0) {
            return await sock.sendMessage(from, { text: "❌ Audio message download fail ho gaya." }, { quoted: msg });
        }

        const tmpDir = path.join(process.cwd(), 'temp');
        if (!fsSync.existsSync(tmpDir)) {
            await fs.mkdir(tmpDir, { recursive: true });
        }

        const id = crypto.randomBytes(6).toString('hex');
        inPath = path.join(tmpDir, `stt_${id}.ogg`);
        outPath = path.join(tmpDir, `stt_${id}.mp3`);

        await fs.writeFile(inPath, buffer);

        // Convert Opus audio to 16kHz Mono MP3 for Whisper
        await new Promise((resolve, reject) => {
            ffmpeg(inPath)
                .toFormat('mp3')
                .audioChannels(1)
                .audioFrequency(16000)
                .on('end', resolve)
                .on('error', reject)
                .save(outPath);
        });

        await sock.sendMessage(from, { react: { text: '✍️', key: msg.key } }).catch(() => {});

        let transcribedText = '';

        // 1. Try Groq Whisper (Ultra-fast whisper-large-v3)
        if (groqKey) {
            try {
                const form = new FormData();
                form.append('file', fsSync.createReadStream(outPath));
                form.append('model', 'whisper-large-v3');
                form.append('response_format', 'json');

                const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
                    headers: {
                        ...form.getHeaders(),
                        'Authorization': `Bearer ${groqKey}`
                    },
                    timeout: 45000
                });

                if (response.data && response.data.text) {
                    transcribedText = response.data.text.trim();
                }
            } catch (err) {
                console.error('[Groq Whisper Error]:', err.response?.data || err.message);
                // Fallback to whisper-large-v3-turbo
                try {
                    const formTurbo = new FormData();
                    formTurbo.append('file', fsSync.createReadStream(outPath));
                    formTurbo.append('model', 'whisper-large-v3-turbo');
                    formTurbo.append('response_format', 'json');

                    const responseTurbo = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formTurbo, {
                        headers: {
                            ...formTurbo.getHeaders(),
                            'Authorization': `Bearer ${groqKey}`
                        },
                        timeout: 30000
                    });

                    if (responseTurbo.data && responseTurbo.data.text) {
                        transcribedText = responseTurbo.data.text.trim();
                    }
                } catch (turboErr) {
                    console.error('[Groq Whisper Turbo Error]:', turboErr.response?.data || turboErr.message);
                }
            }
        }

        // 2. Fallback to OpenAI Whisper
        if (!transcribedText && openaiKey) {
            try {
                const form = new FormData();
                form.append('file', fsSync.createReadStream(outPath));
                form.append('model', 'whisper-1');

                const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
                    headers: {
                        ...form.getHeaders(),
                        'Authorization': `Bearer ${openaiKey}`
                    },
                    timeout: 45000
                });

                if (response.data && response.data.text) {
                    transcribedText = response.data.text.trim();
                }
            } catch (err) {
                console.error('[OpenAI Whisper Error]:', err.response?.data || err.message);
            }
        }

        if (!transcribedText) {
            return await sock.sendMessage(from, {
                text: "❌ Voice note transcribe nahi ho saka. Audio bohot low-volume ya unclear ho sakti hai."
            }, { quoted: msg });
        }

        const durationSec = audioMsg.seconds || Math.round(buffer.length / 4000);
        const durationFormatted = `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`;

        const outputMessage =
`╭━━━〔 🎙️ *VOICE NOTE TRANSCRIPTION* 〕━━━┈⊷
┃ ⏱️ *Duration:* ${durationFormatted}
┃
┃ 📝 *Transcribed Message:*
┃ "${transcribedText}"
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

🚀 *Transcribed by MR SAQIB MD*`;

        await sock.sendMessage(from, { text: outputMessage }, { quoted: msg });
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

    } catch (error) {
        console.error('[V2T Error]:', error);
        await sock.sendMessage(from, {
            text: `❌ Transcription failed: ${error.message || 'Unknown error'}`
        }, { quoted: msg });
    } finally {
        try {
            if (inPath && fsSync.existsSync(inPath)) await fs.unlink(inPath);
            if (outPath && fsSync.existsSync(outPath)) await fs.unlink(outPath);
        } catch (_) {}
    }
}

/**
 * Owner command to set Groq Whisper API Key on the fly
 */
async function setWhisperKeyCommand(sock, from, msg, args = [], isOwner = false) {
    if (!isOwner) {
        return await sock.sendMessage(from, {
            text: "❌ Sirf Bot Owner Whisper API Key configure kar sakta hai."
        }, { quoted: msg });
    }

    const key = args[0]?.trim();
    if (!key || !key.startsWith('gsk_')) {
        return await sock.sendMessage(from, {
            text:
`╭━━━〔 🔑 *SET GROQ WHISPER API KEY* 〕━━━┈⊷
┃ 📌 *Usage:*
┃ *.setgroq gsk_your_api_key_here*
┃ 
┃ 🌐 *Free Key Kahan Se Milegi:*
┃ 1. \`https://console.groq.com/keys\` par login karein.
┃ 2. *Create API Key* dabayein.
┃ 3. Key copy karke yahan send karein!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    try {
        cachedGroqKey = key;
        process.env.GROQ_API_KEY = key;
        settings.groqApiKey = key;

        // 1. Persist to data/bot_data.json and sync to MongoDB Atlas
        try {
            const dataPath = path.join(process.cwd(), 'data', 'bot_data.json');
            let botData = {};
            if (fsSync.existsSync(dataPath)) {
                try { botData = JSON.parse(fsSync.readFileSync(dataPath, 'utf8')); } catch (_) {}
            }
            if (!botData.globalSettings) botData.globalSettings = {};
            botData.globalSettings.groqApiKey = key;
            await fs.writeFile(dataPath, JSON.stringify(botData, null, 2), 'utf8');

            const mongoSync = require('../utils/mongoSync');
            if (mongoSync.pushToMongo) {
                mongoSync.pushToMongo('bot_data', botData);
            }
        } catch (dbErr) {
            console.warn('[setgroq bot_data error]:', dbErr.message);
        }

        // 2. Persist to .env file if available
        try {
            const envPath = path.join(process.cwd(), '.env');
            let envContent = '';
            if (fsSync.existsSync(envPath)) {
                envContent = await fs.readFile(envPath, 'utf8');
            }

            if (envContent.includes('GROQ_API_KEY=')) {
                envContent = envContent.replace(/GROQ_API_KEY=.*/g, `GROQ_API_KEY=${key}`);
            } else {
                envContent += `\nGROQ_API_KEY=${key}\n`;
            }

            await fs.writeFile(envPath, envContent, 'utf8');
        } catch (_) {}

        await sock.sendMessage(from, {
            text:
`✅ *Groq Whisper API Key Successfully Saved!*

Cloud sync complete. Ab bot kisi bhi voice note ya audio ko instant text mein transcribe karega via *.v2t* ya *.totext*! 🎙️✨`
        }, { quoted: msg });

    } catch (e) {
        await sock.sendMessage(from, {
            text: `❌ Key save karte waqt error aaya: ${e.message}`
        }, { quoted: msg });
    }
}

module.exports = {
    voiceToTextCommand,
    setWhisperKeyCommand
};
