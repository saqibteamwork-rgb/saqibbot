// plugins/bgmusic.js — MR SAQIB MD: Voice note background music playlist mixer (Owner)
// ============================================================================
//   .bgmusic on | off          → Background music chalu ya band karein
//   .bgmusic add               → Kisi audio/song ko reply karke likhein (playlist mein add, max 10)
//   .bgmusic list              → Current playlist dekhein
//   .bgmusic del <no>          → Playlist se specific track hatayein
//   .bgmusic clear / reset     → Poori playlist khali karein (default soft pad wapas)
//   .bgmusic mode rotate|random→ rotate = ek ke baad ek, random = koi bhi
//   .bgmusic vol 5-60          → Music ki awaaz (voice ke muqable mein %, default 20)
//   .bgmusic status            → Complete status card
//   .bgmusic set               → Reply karke sirf wahi ek music playlist mein set karein
// ============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { cmd } = require('../command');
const config = require('../config');

// FFMPEG binary resolution with fallback
let FFMPEG = 'ffmpeg';
try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer && installer.path && fs.existsSync(installer.path)) {
        FFMPEG = installer.path;
    }
} catch (_) {}

const DIR = process.env.BGMUSIC_DIR || path.join(__dirname, '..', 'data', 'bgmusic');
const STATE_FILE = path.join(DIR, 'state.json');
const ASSET_DIR = path.join(__dirname, '..', 'assets', 'bgmusic');
const DEFAULT_TRACK = path.join(DIR, 'default-pad.ogg');
const ID_PREFIX = 'SAQIBBGM';
const MAX_VOICE_SECONDS = 180;
const MAX_TRACKS = 10;
const busy = new Set();
const P = () => config.prefix || config.PREFIX || '.';

const readState = () => {
    try {
        if (!fs.existsSync(STATE_FILE)) return {};
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) || {};
    } catch (_) {
        return {};
    }
};

const getState = (bot) => ({ enabled: false, volume: 20, mode: 'rotate', ...(readState()[bot] || {}) });

function setState(bot, patch) {
    const all = readState();
    all[bot] = { ...getState(bot), ...patch };
    try {
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(all, null, 2));
    } catch (e) {
        console.error('[BGM setState Error]:', e.message);
    }
    return all[bot];
}

const legacyPath = (bot) => path.join(DIR, `track-${bot}.mp3`);

function bundledTracks() {
    try {
        if (!fs.existsSync(ASSET_DIR)) return [];
        return fs.readdirSync(ASSET_DIR)
            .filter(f => /\.(mp3|m4a|ogg|opus|wav|aac)$/i.test(f))
            .sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
            .map(f => ({ file: path.join(ASSET_DIR, f), name: path.basename(f, path.extname(f)), bundled: true }));
    } catch (_) {
        return [];
    }
}

function getTracks(bot) {
    const st = getState(bot);
    if (Array.isArray(st.tracks)) {
        return st.tracks.filter(t => {
            if (!t || !t.file) return false;
            const fp = path.isAbsolute(t.file) ? t.file : path.resolve(DIR, t.file);
            return fs.existsSync(fp);
        });
    }
    if (fs.existsSync(legacyPath(bot))) {
        return [{ file: path.basename(legacyPath(bot)), name: 'Default Music' }];
    }
    return bundledTracks();
}

const safeUnlink = (file) => {
    try {
        const f = path.isAbsolute(file) ? file : path.resolve(DIR, file);
        if (f.startsWith(path.resolve(DIR) + path.sep)) {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        }
    } catch (_) {}
};

const hasCustom = (bot) => getTracks(bot).length > 0;

function pickTrack(bot) {
    const list = getTracks(bot);
    if (!list.length) return null;
    const st = getState(bot);
    const last = Number.isInteger(st.last) ? st.last : -1;
    let idx;
    if (st.mode === 'random' && list.length > 1) {
        do {
            idx = Math.floor(Math.random() * list.length);
        } while (idx === last);
    } else {
        idx = (last + 1) % list.length;
    }
    setState(bot, { last: idx });
    const target = list[idx];
    const resolvedPath = path.isAbsolute(target.file) ? target.file : path.resolve(DIR, target.file);
    return { file: resolvedPath, name: target.name, no: idx + 1 };
}

function ff(args, timeout = 90000) {
    return new Promise((resolve, reject) => {
        execFile(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { timeout }, (err, _o, stderr) => {
            if (err) {
                const msg = String(stderr || err.message || '').split('\n')[0].slice(0, 160);
                reject(new Error(msg || 'FFmpeg process failed'));
            } else {
                resolve();
            }
        });
    });
}

// Default background pad (harmonious soft synth)
async function ensureDefaultTrack() {
    if (fs.existsSync(DEFAULT_TRACK)) return DEFAULT_TRACK;
    fs.mkdirSync(DIR, { recursive: true });
    const expr = '(sin(2*PI*220*t)+0.7*sin(2*PI*277.18*t)+0.6*sin(2*PI*329.63*t)+0.4*sin(2*PI*110*t))*0.22*(0.85+0.15*sin(2*PI*0.2*t))';
    await ff(['-f', 'lavfi', '-i', `aevalsrc=${expr}:s=48000:d=60`, '-af', 'lowpass=f=1400,afade=t=in:d=2', '-c:a', 'libopus', '-b:a', '48k', DEFAULT_TRACK]);
    return DEFAULT_TRACK;
}

// Mixes voice + music into voice note (opus ogg). Music matches exact duration of voice note.
async function mix(voicePath, musicPath, volumePercent, outPath) {
    const vol = Math.max(0.05, Math.min(0.6, (Number(volumePercent) || 20) / 100));
    const filter = `[0:a]aformat=sample_rates=48000:channel_layouts=mono[v];` +
        `[1:a]aformat=sample_rates=48000:channel_layouts=mono,volume=${vol},afade=t=in:d=0.6[m];` +
        `[v][m]amix=inputs=2:duration=first:dropout_transition=0,volume=2[a]`;
    await ff([
        '-i', voicePath,
        '-stream_loop', '-1',
        '-i', musicPath,
        '-filter_complex', filter,
        '-map', '[a]',
        '-c:a', 'libopus',
        '-b:a', '48k',
        '-ar', '48000',
        '-ac', '1',
        '-f', 'ogg',
        outPath
    ]);
}

async function downloadBuffer(media, kind = 'audio') {
    const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
    const stream = await downloadContentFromMessage(media, kind);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

// Process voice notes from the bot owner account (fromMe: true)
async function maybeProcess(conn, mek, from, bot) {
    if (!mek || !mek.key || !mek.key.fromMe) return;

    const mContent = mek.message?.ephemeralMessage?.message ||
                     mek.message?.viewOnceMessage?.message ||
                     mek.message?.viewOnceMessageV2?.message ||
                     mek.message;

    const am = mContent?.audioMessage;
    if (!am || !am.ptt) return;

    const id = String(mek.key.id || '');
    if (id.startsWith(ID_PREFIX) || busy.has(id)) return;

    const botKey = bot || (conn?.user?.id ? conn.user.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : 'owner');
    if (!getState(botKey).enabled) return;

    const rawTs = mek.messageTimestamp?.low !== undefined ? mek.messageTimestamp.low : mek.messageTimestamp;
    const ts = Number(rawTs || 0);
    if (ts && Date.now() / 1000 - ts > 120) return; // skip old/restored messages
    if ((am.seconds || 0) > MAX_VOICE_SECONDS) return;

    busy.add(id);
    const tmp = path.join(os.tmpdir(), `bgm-${crypto.randomBytes(6).toString('hex')}`);
    const inFile = `${tmp}-in.bin`, outFile = `${tmp}-out.ogg`;

    try {
        const st = getState(botKey);
        const picked = pickTrack(botKey);
        const music = picked ? picked.file : await ensureDefaultTrack();

        fs.writeFileSync(inFile, await downloadBuffer(am, 'audio'));
        await mix(inFile, music, st.volume, outFile);

        const newMsgId = ID_PREFIX + crypto.randomBytes(8).toString('hex').toUpperCase();
        const sendOpts = {
            messageId: newMsgId
        };

        // Preserve reply context if owner was quoting a message
        const ci = am.contextInfo || mContent?.extendedTextMessage?.contextInfo;
        if (ci && ci.quotedMessage) {
            sendOpts.quoted = {
                key: {
                    remoteJid: from,
                    fromMe: false,
                    id: ci.stanzaId,
                    participant: ci.participant
                },
                message: ci.quotedMessage
            };
        }

        await conn.sendMessage(from, {
            audio: fs.readFileSync(outFile),
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
        }, sendOpts);

        // Delete the original raw voice note (for everyone)
        await conn.sendMessage(from, { delete: mek.key }).catch(() => {});
    } catch (e) {
        console.error('[MR SAQIB MD bgmusic error]:', e && e.message);
    } finally {
        busy.delete(id);
        for (const f of [inFile, outFile]) {
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
        }
    }
}

cmd({
    pattern: 'bgmusic',
    alias: ['bgm', 'voicemusic', 'bgpad'],
    desc: 'Voice note background music playlist mixer (Owner)',
    use: '.bgmusic on | off | add | list | del | clear | mode | vol | status',
    category: 'owner',
    react: '🎶',
    filename: __filename
}, async (conn, mek, m, { args, reply, botNumber, isOwner }) => {
    const isSenderOwner = isOwner || Boolean(mek?.key?.fromMe);
    if (!isSenderOwner) {
        return reply('❌ *Access Denied:* Ye feature sirf bot owner ke liye hai.');
    }

    const p = P();
    const bot = botNumber || (conn?.user?.id ? conn.user.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : 'owner');
    const sub = String(args[0] || '').toLowerCase();
    const st = getState(bot);

    const modeText = (md) => (md === 'random' ? '🔀 Random (Shuffle)' : '🔁 Rotate (Ek ke baad ek)');

    const quotedMedia = () => {
        let qm = m?.quoted?.message;
        if (!qm) {
            const mContent = mek?.message?.ephemeralMessage?.message ||
                             mek?.message?.viewOnceMessage?.message ||
                             mek?.message;
            const ci = mContent?.extendedTextMessage?.contextInfo;
            qm = ci?.quotedMessage;
        }
        if (qm?.ephemeralMessage?.message) qm = qm.ephemeralMessage.message;
        if (qm?.viewOnceMessage?.message) qm = qm.viewOnceMessage.message;
        if (qm?.viewOnceMessageV2?.message) qm = qm.viewOnceMessageV2.message;
        if (qm?.documentWithCaptionMessage?.message) qm = qm.documentWithCaptionMessage.message;

        const media = qm && (
            qm.audioMessage ||
            (qm.documentMessage && /audio|video/i.test(qm.documentMessage.mimetype || '') ? qm.documentMessage : null) ||
            qm.videoMessage
        );
        return media ? { media, qm, kind: qm.audioMessage ? 'audio' : qm.videoMessage ? 'video' : 'document' } : null;
    };

    async function saveTrack(q) {
        fs.mkdirSync(DIR, { recursive: true });
        const id = crypto.randomBytes(4).toString('hex');
        const file = `track-${bot}-${id}.mp3`;
        const tmp = path.join(os.tmpdir(), `bgm-set-${crypto.randomBytes(6).toString('hex')}.bin`);
        try {
            let buf = null;
            if (m?.quoted?.download && typeof m.quoted.download === 'function') {
                try { buf = await m.quoted.download(); } catch (_) {}
            }
            if (!buf || !buf.length) {
                buf = await downloadBuffer(q.media, q.kind);
            }
            fs.writeFileSync(tmp, buf);
            await ff(['-i', tmp, '-vn', '-t', '300', '-ar', '44100', '-ac', '1', '-b:a', '96k', path.join(DIR, file)]);
        } finally {
            try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
        }
        const raw = q.media.fileName || q.media.title || '';
        const name = String(raw).replace(/\.[a-z0-9]{2,4}$/i, '').trim().slice(0, 40);
        return { file, name };
    }

    function clearAll() {
        for (const t of getTracks(bot)) safeUnlink(t.file);
        try { if (fs.existsSync(legacyPath(bot))) fs.unlinkSync(legacyPath(bot)); } catch (_) {}
        setState(bot, { tracks: [], last: -1 });
    }

    if (sub === 'on') {
        try {
            if (!hasCustom(bot)) await ensureDefaultTrack();
        } catch (e) {
            return reply(`❌ *FFmpeg Error:* Background audio tayyar nahi ho saka: ${e.message}`);
        }
        setState(bot, { enabled: true });
        const n = getTracks(bot).length;
        return reply(
            `🎶 *MR SAQIB MD :: BACKGROUND MUSIC ON* 🎶\n\n` +
            `✅ *Status:* Activated\n` +
            `🎵 *Playlist:* ${n ? `${n} tracks (har voice par naya music)` : 'Default Ambient Synth Pad'}\n` +
            `🔁 *Mode:* ${modeText(st.mode)}\n` +
            `🔊 *Volume:* ${st.volume}%\n\n` +
            `💡 _Ab aap jo bhi voice note (PTT) bhejenge, bot uske peeche music mix karke automatically send kar dega aur raw voice ko delete kar dega._`
        );
    }

    if (sub === 'off') {
        setState(bot, { enabled: false });
        return reply('🔇 *MR SAQIB MD :: BACKGROUND MUSIC OFF*\nVoice note background mixer de-activate kar diya gaya hai.');
    }

    if (sub === 'vol' || sub === 'volume') {
        const v = parseInt(args[1], 10);
        if (!Number.isInteger(v) || v < 5 || v > 60) {
            return reply(`🔊 *Format:* ${p}bgmusic vol 5-60\n*Current Volume:* ${st.volume}%\n\n_Example: ${p}bgmusic vol 25_`);
        }
        setState(bot, { volume: v });
        return reply(`🔊 *Volume Updated:* Music ki awaaz voice ke muqable mein *${v}%* set ho gayi hai.`);
    }

    if (sub === 'add' || sub === 'set') {
        const q = quotedMedia();
        if (!q) {
            return reply(
                `🎵 *Kisi audio, voice ya song ko reply karke likhein:*\n` +
                `👉 \`${p}bgmusic add\`\n\n` +
                `💡 _Tips: Agar aapko 5 alag alag gane lagane hain to un 5 audios ko bari bari reply karke \`${p}bgmusic add\` karein, phir \`${p}bgmusic on\` kar dein!_`
            );
        }
        if ((Number(q.media.fileLength) || 0) > 25 * 1024 * 1024) {
            return reply('❌ File size 25MB se zyada hai. Chhota audio choose karein.');
        }
        if (sub === 'set') clearAll();

        const list = getTracks(bot);
        if (list.length >= MAX_TRACKS) {
            return reply(`❌ Playlist full hai (max ${MAX_TRACKS} tracks). Pehle \`${p}bgmusic del <no>\` ya \`${p}bgmusic clear\` karein.`);
        }

        try {
            await reply('⏳ _Audio process aur playlist mein convert ho raha hai..._');
            const t = await saveTrack(q);
            if (!t.name) t.name = `Music Track ${list.length + 1}`;
            const next = [...list, t];
            setState(bot, { tracks: next });
            return reply(
                `✅ *Track Added Successfully!*\n\n` +
                `🎵 *Name:* ${t.name}\n` +
                `📂 *Total Playlist:* ${next.length}/${MAX_TRACKS} tracks\n` +
                `🔁 *Mode:* ${modeText(st.mode)}\n` +
                `${st.enabled ? '⚡ *Background Music Active*' : `\n_Note: Chalu karne ke liye \`${p}bgmusic on\` likhein._`}`
            );
        } catch (e) {
            return reply(`❌ Audio process nahi ho saka: ${e.message}`);
        }
    }

    if (sub === 'list') {
        const list = getTracks(bot);
        if (!list.length) {
            return reply(
                `🎵 *MR SAQIB MD :: BGM PLAYLIST*\n\n` +
                `_Playlist khali hai (Default soft pad chalega)._\n\n` +
                `Gana add karne ke liye kisi audio ko reply karke \`${p}bgmusic add\` likhein.`
            );
        }
        const nextNo = (((Number.isInteger(st.last) ? st.last : -1) + 1) % list.length) + 1;
        const tracksList = list.map((t, i) => `  ${i + 1}. 🎶 ${t.name}`).join('\n');
        return reply(
            `🎵 *MR SAQIB MD :: BGM PLAYLIST (${list.length}/${MAX_TRACKS})*\n\n` +
            `${tracksList}\n\n` +
            `🔁 *Mode:* ${modeText(st.mode)}\n` +
            `${st.mode === 'random' ? '' : `▶️ *Agla Track:* Track #${nextNo}\n`}` +
            `🔊 *Awaaz:* ${st.volume}%\n\n` +
            `🗑️ *Delete Track:* \`${p}bgmusic del <no>\`\n` +
            `♻️ *Clear All:* \`${p}bgmusic clear\``
        );
    }

    if (sub === 'del' || sub === 'remove') {
        const list = getTracks(bot);
        const n = parseInt(args[1], 10);
        if (!Number.isInteger(n) || n < 1 || n > list.length) {
            return reply(`🗑️ *Format:* \`${p}bgmusic del <track_number>\`\nPehele \`${p}bgmusic list\` mein track number check karein.`);
        }
        const [gone] = list.splice(n - 1, 1);
        safeUnlink(gone.file);
        setState(bot, { tracks: list, last: -1 });
        return reply(`🗑️ *Track Removed:* ${gone.name}\n🎵 *Baqi Tracks:* ${list.length}`);
    }

    if (sub === 'clear' || sub === 'reset') {
        clearAll();
        return reply('♻️ *Playlist Reset:* Saari custom files delete ho gayi hain. Ab default soft music pad chalega.');
    }

    if (sub === 'mode') {
        const md = String(args[1] || '').toLowerCase();
        if (!['rotate', 'random'].includes(md)) {
            return reply(`🔁 *Format:* \`${p}bgmusic mode rotate | random\`\n*Current Mode:* ${modeText(st.mode)}`);
        }
        setState(bot, { mode: md, last: -1 });
        return reply(`✅ *Playback Mode Updated:* ${modeText(md)}`);
    }

    // Default: Status & Help card
    const list = getTracks(bot);
    const n = list.length;
    return reply(
        `╔══════════════════════════╗\n` +
        `   🎶 *MR SAQIB MD :: BG MUSIC* 🎶\n` +
        `╚══════════════════════════╝\n\n` +
        `🔘 *Status:* ${st.enabled ? 'ON ✅ (Active)' : 'OFF ❌ (Inactive)'}\n` +
        `🎵 *Playlist:* ${n ? `${n}/${MAX_TRACKS} Tracks` : 'Default Ambient Synth Pad'}\n` +
        `🔁 *Mode:* ${modeText(st.mode)}\n` +
        `🔊 *Volume:* ${st.volume}%\n\n` +
        `📌 *COMMAND GUIDE:*\n` +
        `• \`${p}bgmusic on\` → Turn ON\n` +
        `• \`${p}bgmusic off\` → Turn OFF\n` +
        `• \`${p}bgmusic add\` → Reply to any audio/song\n` +
        `• \`${p}bgmusic set\` → Clear & set 1 audio\n` +
        `• \`${p}bgmusic list\` → View playlist\n` +
        `• \`${p}bgmusic del <no>\` → Delete a track\n` +
        `• \`${p}bgmusic clear\` → Clear all tracks\n` +
        `• \`${p}bgmusic mode rotate | random\` → Switch mode\n` +
        `• \`${p}bgmusic vol 5-60\` → Adjust volume %\n\n` +
        `⚡ *Powered by MR SAQIB MD*`
    );
});

module.exports = {
    maybeProcess,
    mix,
    ensureDefaultTrack,
    pickTrack,
    getTracks,
    getState,
    setState
};
