'use strict';

const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

ffmpeg.setFfmpegPath(ffmpegStatic);

async function videoToWebp(mediaBuffer) {
    const tmpDir = path.join(__dirname, '../temp');
    if (!fsSync.existsSync(tmpDir)) await fs.mkdir(tmpDir, { recursive: true });

    const id = crypto.randomBytes(8).toString('hex');
    const inputPath = path.join(tmpDir, `${id}_in.mp4`);
    const outputPath = path.join(tmpDir, `${id}_out.webp`);

    try {
        await fs.writeFile(inputPath, mediaBuffer);
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .outputOptions([
                    '-vcodec', 'libwebp',
                    '-filter:v', 'fps=fps=15,scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
                    '-lossless', '0',
                    '-compression_level', '4',
                    '-q:v', '70',
                    '-loop', '0',
                    '-an',
                    '-vsync', '0',
                    '-s', '512:512'
                ])
                .output(outputPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        return await fs.readFile(outputPath);
    } finally {
        try {
            if (fsSync.existsSync(inputPath)) await fs.unlink(inputPath);
            if (fsSync.existsSync(outputPath)) await fs.unlink(outputPath);
        } catch (_) {}
    }
}

module.exports = {
    videoToWebp
};
