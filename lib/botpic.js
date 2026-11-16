// lib/botpic.js — per-session bot picture (menu / alive / connected message)
// Stored in data/botpics/<session-number>.jpg, falls back to config.IMAGE_PATH.

const fs = require('fs');
const path = require('path');
const config = require('../config');

const DIR = path.join(__dirname, '..', 'data', 'botpics');
const numberOf = conn => String(conn?.user?.id || '').split(':')[0].split('@')[0];
const fileFor = conn => path.join(DIR, numberOf(conn) + '.jpg');

// use as: { image: getBotPic(conn), caption }
function getBotPic(conn) {
    try {
        const f = fileFor(conn);
        if (numberOf(conn) && fs.existsSync(f)) return { url: f };
    } catch (_) {}
    return { url: config.IMAGE_PATH };
}

async function setBotPicFromBuffer(conn, buffer) {
    fs.mkdirSync(DIR, { recursive: true });
    let out = buffer;
    try {
        out = await require('sharp')(buffer).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    } catch (_) { /* keep original bytes */ }
    fs.writeFileSync(fileFor(conn), out);
    return fileFor(conn);
}

async function setBotPicFromUrl(conn, url) {
    const axios = require('axios');
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 15 * 1024 * 1024, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const ct = String(r.headers['content-type'] || '');
    if (!/^image\//i.test(ct)) throw new Error('link image nahi hai');
    return setBotPicFromBuffer(conn, Buffer.from(r.data));
}

function resetBotPic(conn) {
    try { fs.rmSync(fileFor(conn), { force: true }); } catch (_) {}
}

module.exports = { getBotPic, setBotPicFromBuffer, setBotPicFromUrl, resetBotPic };
