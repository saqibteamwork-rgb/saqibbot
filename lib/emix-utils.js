'use strict';

const axios = require('axios');

function getEmojiCode(emoji) {
    if (!emoji) return '';
    const chars = [...emoji];
    return chars.map(c => c.codePointAt(0).toString(16).toLowerCase()).join('-');
}

async function fetchEmix(e1, e2) {
    if (!e1 || !e2) return null;
    const u1 = getEmojiCode(e1);
    const u2 = getEmojiCode(e2);

    // Try Google Emoji Kitchen endpoints
    const urls = [
        `https://emojik.vercel.app/s/${encodeURIComponent(e1)}_${encodeURIComponent(e2)}?size=256`,
        `https://api.princetechn.com/api/maker/emojimix?emoji1=${encodeURIComponent(e1)}&emoji2=${encodeURIComponent(e2)}`,
        `https://www.gstatic.com/android/keyboard/emojikitchen/20201001/u${u1}/u${u1}_u${u2}.png`
    ];

    for (const url of urls) {
        try {
            const res = await axios.get(url, {
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0' },
                validateStatus: status => status === 200
            });
            if (res.data) {
                return url;
            }
        } catch (_) {}
    }

    return `https://emojik.vercel.app/s/${encodeURIComponent(e1)}_${encodeURIComponent(e2)}?size=256`;
}

module.exports = {
    fetchEmix,
    getEmojiCode
};
