// commands/insta.js
'use strict';

const instagramCommand = require('./instagram');

/**
 * Proxy to upgraded multi-engine Instagram Downloader
 */
async function instaCommand(sock, from, msg, q) {
    return await instagramCommand(sock, from, msg, q);
}

module.exports = instaCommand;
