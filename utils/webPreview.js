'use strict';

/**
 * ProBoy-MD / MR SAQIB MD :: Web Preview Card Generator
 * ============================================================================
 * Generates rich interactive Link Previews with large hero thumbnails
 * for https://mrsaqib.me.
 *
 * NOTE: Never mix fake forwardedNewsletterMessageInfo (like serverMessageId: -1 or 1)
 * or forwardingScore: 999 with externalAdReply. WhatsApp's server drops fake
 * newsletter forwards resulting in "single tick" delivery failure!
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const settings = require('../settings');

let cachedJpegThumbnail = null;
const localJpgPath = path.join(__dirname, '..', 'data', 'mrsaqib_thumb.jpg');

try {
    if (fs.existsSync(localJpgPath)) {
        cachedJpegThumbnail = fs.readFileSync(localJpgPath);
    }
} catch (e) {
    console.error('[webPreview] Error reading thumb:', e.message);
}

/**
 * Creates contextInfo with clean externalAdReply web preview
 * @param {Object} custom Optional overrides
 * @returns {Object} contextInfo ready for sock.sendMessage
 */
function getWebPreviewContext(custom = {}) {
    return {
        externalAdReply: {
            title: custom.title || settings.websiteTitle || "Mr Saqib | Cyber Security Expert & Full-Stack App Developer",
            body: custom.body || settings.websiteBody || "Hire Muhammad Saqib (Mr Saqib): Elite Cyber Security Expert & Full-Stack App",
            mediaType: 1, // IMAGE
            previewType: "PHOTO",
            thumbnailUrl: custom.thumbnailUrl || settings.websiteThumbnail || "https://ik.imagekit.io/mrsaqib/image_ePUwM_YDT.png",
            thumbnail: custom.thumbnail || cachedJpegThumbnail,
            sourceUrl: custom.sourceUrl || settings.websiteUrl || "https://mrsaqib.me",
            renderLargerThumbnail: custom.renderLargerThumbnail !== false,
            showAdAttribution: true
        }
    };
}

module.exports = {
    getWebPreviewContext,
    getCachedThumbnail: () => cachedJpegThumbnail
};
