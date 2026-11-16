'use strict';

/**
 * MR SAQIB MD :: Advanced Audio Effects Engine (FFmpeg)
 * ============================================================================
 * Provides high quality audio modulation: deep, smooth, fat, tupai, blown,
 * radio, robot, chipmunk, nightcore, earrape, bass, reverse, slow, fast, baby, demon
 * ============================================================================
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const crypto = require('crypto');

ffmpeg.setFfmpegPath(ffmpegStatic);

async function applyAudioFilter(buffer, ext, filterOptions = []) {
    const tmpDir = path.join(__dirname, '../temp');
    if (!fsSync.existsSync(tmpDir)) await fs.mkdir(tmpDir, { recursive: true });

    const id = crypto.randomBytes(8).toString('hex');
    const inputExt = (ext || 'mp3').replace(/^\./, '');
    const inputPath = path.join(tmpDir, `${id}_in.${inputExt}`);
    const outputPath = path.join(tmpDir, `${id}_out.mp3`);

    try {
        await fs.writeFile(inputPath, buffer);

        await new Promise((resolve, reject) => {
            let cmd = ffmpeg(inputPath);

            // Apply filter options
            if (Array.isArray(filterOptions) && filterOptions.length > 0) {
                cmd = cmd.outputOptions(filterOptions);
            }

            cmd.toFormat('mp3')
               .on('end', resolve)
               .on('error', (err) => {
                   console.error('[AudioEditor Error]:', err.message);
                   reject(err);
               })
               .save(outputPath);
        });

        const result = await fs.readFile(outputPath);
        return result;
    } finally {
        try {
            if (fsSync.existsSync(inputPath)) await fs.unlink(inputPath);
            if (fsSync.existsSync(outputPath)) await fs.unlink(outputPath);
        } catch (_) {}
    }
}

module.exports = {
    deep: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'atempo=4/4,asetrate=44100*2/3']);
    },
    smooth: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'atempo=4/4,asetrate=44100*1.1,lowpass=f=3500']);
    },
    fat: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'atempo=1.6,asetrate=22050']);
    },
    tupai: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'atempo=0.5,asetrate=65100']);
    },
    blown: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'acrusher=level_in=3:level_out=1:bits=4:mode=log:aa=1']);
    },
    radio: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'highpass=f=1000,lowpass=f=3000']);
    },
    robot: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'asetrate=44100,atempo=1.0,vibrato=f=14:d=0.9']);
    },
    chipmunk: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'asetrate=65100,atempo=0.6']);
    },
    nightcore: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'atempo=1.06,asetrate=44100*1.25']);
    },
    earrape: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'volume=12']);
    },
    bass: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'equalizer=f=60:width_type=o:width=2:g=15']);
    },
    reverse: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-filter_complex', 'areverse']);
    },
    slow: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'atempo=0.7,asetrate=44100']);
    },
    fast: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'atempo=1.5,asetrate=44100']);
    },
    baby: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'asetrate=44100*1.35,atempo=0.75']);
    },
    demon: async (buffer, ext) => {
        return applyAudioFilter(buffer, ext, ['-af', 'asetrate=44100*0.7,atempo=1.4']);
    }
};
