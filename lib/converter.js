const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const crypto = require('crypto');

const sharp = require('sharp');

ffmpeg.setFfmpegPath(ffmpegStatic);

/**
 * Convert sticker (WebP) buffer to PNG image buffer
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function stickerToImage(buffer) {
    return await sharp(buffer)
        .png()
        .toBuffer();
}

/**
 * Convert audio/video buffer to MP3
 * @param {Buffer} buffer 
 * @param {string} ext 
 * @returns {Promise<Buffer>}
 */
async function toAudio(buffer, ext) {
    const tmpDir = path.join(__dirname, '../temp');
    if (!fsSync.existsSync(tmpDir)) await fs.mkdir(tmpDir, { recursive: true });
    
    const id = crypto.randomBytes(8).toString('hex');
    const inputExt = (ext || 'mp3').replace(/^\./, '');
    const inputPath = path.join(tmpDir, `${id}_in.${inputExt}`);
    const outputPath = path.join(tmpDir, `${id}_out.mp3`);
    
    try {
        await fs.writeFile(inputPath, buffer);
        
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat('mp3')
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
        });
        
        const outputBuffer = await fs.readFile(outputPath);
        return outputBuffer;
    } finally {
        try {
            if (fsSync.existsSync(inputPath)) await fs.unlink(inputPath);
            if (fsSync.existsSync(outputPath)) await fs.unlink(outputPath);
        } catch (e) {
            console.error('Cleanup error:', e);
        }
    }
}

/**
 * Convert audio/video buffer to WhatsApp PTT Voice Note (OGG Opus)
 * @param {Buffer} buffer 
 * @param {string} ext 
 * @returns {Promise<Buffer>}
 */
async function toPTT(buffer, ext) {
    const tmpDir = path.join(__dirname, '../temp');
    if (!fsSync.existsSync(tmpDir)) await fs.mkdir(tmpDir, { recursive: true });
    
    const id = crypto.randomBytes(8).toString('hex');
    const inputExt = (ext || 'mp3').replace(/^\./, '');
    const inputPath = path.join(tmpDir, `${id}_in.${inputExt}`);
    const outputPath = path.join(tmpDir, `${id}_out.opus`);
    
    try {
        await fs.writeFile(inputPath, buffer);
        
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .audioCodec('libopus')
                .toFormat('ogg')
                .audioChannels(1)
                .audioFrequency(48000)
                .outputOptions([
                    '-avoid_negative_ts', 'make_zero'
                ])
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
        });
        
        const outputBuffer = await fs.readFile(outputPath);
        return outputBuffer;
    } finally {
        try {
            if (fsSync.existsSync(inputPath)) await fs.unlink(inputPath);
            if (fsSync.existsSync(outputPath)) await fs.unlink(outputPath);
        } catch (e) {
            console.error('Cleanup error:', e);
        }
    }
}

module.exports = {
    toAudio,
    toPTT,
    stickerToImage
};
