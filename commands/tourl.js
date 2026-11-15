// commands/tourl.js - Media to Permanent Public URL Uploader (Catbox)
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const FormData = require('form-data');

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function tourlCommand(sock, from, msg) {
    try {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const target = quoted || msg.message;
        if (!target) {
            return await sock.sendMessage(from, {
                text: "📎 *TOURL UPLOADER - MR SAQIB MD*\n\nKisi bhi image, video, audio, sticker ya document ko reply karein aur likhein:\n👉 *.tourl* ya *.url*"
            }, { quoted: msg });
        }

        const actual = target.viewOnceMessageV2?.message || target.viewOnceMessage?.message || target;

        let mediaType = null;
        let mediaMsg = null;
        let ext = 'bin';
        let mime = '';

        if (actual.imageMessage) {
            mediaType = 'image';
            mediaMsg = actual.imageMessage;
            mime = mediaMsg.mimetype || 'image/jpeg';
            ext = mime.includes('png') ? 'png' : 'jpg';
        } else if (actual.videoMessage) {
            mediaType = 'video';
            mediaMsg = actual.videoMessage;
            mime = mediaMsg.mimetype || 'video/mp4';
            ext = 'mp4';
        } else if (actual.audioMessage) {
            mediaType = 'audio';
            mediaMsg = actual.audioMessage;
            mime = mediaMsg.mimetype || 'audio/mp4';
            ext = mime.includes('ogg') ? 'ogg' : 'mp3';
        } else if (actual.stickerMessage) {
            mediaType = 'sticker';
            mediaMsg = actual.stickerMessage;
            mime = 'image/webp';
            ext = 'webp';
        } else if (actual.documentMessage) {
            mediaType = 'document';
            mediaMsg = actual.documentMessage;
            mime = mediaMsg.mimetype || 'application/octet-stream';
            ext = (mediaMsg.fileName && mediaMsg.fileName.includes('.')) ? mediaMsg.fileName.split('.').pop() : 'bin';
        }

        if (!mediaType || !mediaMsg) {
            return await sock.sendMessage(from, {
                text: "❌ Kisi media (image, video, audio, sticker, document) ko reply karein!"
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

        // Download media into buffer
        const stream = await downloadContentFromMessage(mediaMsg, mediaType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        if (!buffer || buffer.length === 0) {
            return await sock.sendMessage(from, { text: "❌ Media download fail ho gaya." }, { quoted: msg });
        }

        const fileSizeFormatted = formatBytes(buffer.length);

        // Upload to Catbox
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', buffer, {
            filename: `mrsaqib_${Date.now()}.${ext}`,
            contentType: mime
        });

        const res = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 30000
        });

        const url = (res.data || '').toString().trim();
        if (!url || !url.startsWith('http')) {
            return await sock.sendMessage(from, {
                text: `❌ Upload fail ho gaya: ${res.data || 'Unknown error'}`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

        const replyText = 
`╭━━━〔 🌐 *URL GENERATED* 〕━━━┈⊷
┃ 📦 *Type:* ${mediaType.toUpperCase()}
┃ 📊 *Size:* ${fileSizeFormatted}
┃ ♾️ *Expiry:* Permanent
┃ 
┃ 🔗 *Direct URL:*
┃ ${url}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

🚀 *Powered by MR SAQIB MD*`;

        await sock.sendMessage(from, {
            text: replyText,
            contextInfo: {
                externalAdReply: {
                    title: "MR SAQIB MD - Media Uploader",
                    body: `File uploaded: ${fileSizeFormatted}`,
                    mediaType: 1,
                    thumbnailUrl: "https://ik.imagekit.io/19imy4f1u/lite_1775822697436_IXJPba-z2.png",
                    sourceUrl: url,
                    renderLargerThumbnail: false
                }
            }
        }, { quoted: msg });

    } catch (e) {
        console.error('[Tourl Command Error]:', e);
        await sock.sendMessage(from, {
            text: `❌ *Upload Error:* ${e.message || 'Server error'}`
        }, { quoted: msg });
    }
}

module.exports = tourlCommand;
