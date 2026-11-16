// commands/video.js - Compatible wrapper for ytmp4Command
'use strict';

const { ytmp4Command } = require('./yt');

async function videoCommand(sock, chatId, message, args = []) {
    let queryArgs = args;
    if (!queryArgs || !queryArgs.length) {
        const messageContent = message.message?.ephemeralMessage?.message || message.message?.viewOnceMessage?.message || message.message?.viewOnceMessageV2?.message || message.message;
        const text = (messageContent.conversation || messageContent.extendedTextMessage?.text || messageContent.imageMessage?.caption || messageContent.videoMessage?.caption || '').trim();
        queryArgs = text.replace(/^\.(video|vedio|ytmp4|mp4)\s*/i, '').trim().split(/\s+/).filter(Boolean);
    }
    await ytmp4Command(sock, chatId, message, queryArgs);
}

module.exports = videoCommand;
