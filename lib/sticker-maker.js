'use strict';

const axios = require('axios');
const { videoToWebp } = require('./video-utils');

class StickerMaker {
    static async videoToWebp(mediaBuffer) {
        return await videoToWebp(mediaBuffer);
    }

    static async fetchGif(url) {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return Buffer.from(response.data);
    }

    static async gifToSticker(gifBuffer) {
        return await videoToWebp(gifBuffer);
    }
}

module.exports = StickerMaker;
