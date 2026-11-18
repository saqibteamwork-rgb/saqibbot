// plugins/nettest.js
// .nettest      — server ke internet / yt-dlp / ffmpeg ka quick check (kya block hai?)
// .nettest yt   — YouTube extraction ka asli test (har client try karta hai)

const { cmd } = require('../arslan');
const axios = require('axios');
const { spawn, spawnSync } = require('child_process');
const mediaDl = require('../lib/media-dl');

const TESTS = [
    ['GitHub (yt-dlp download)', 'https://github.com/yt-dlp/yt-dlp/releases/latest'],
    ['YouTube', 'https://www.youtube.com/generate_204'],
    ['SoundCloud', 'https://soundcloud.com/'],
    ['waifu.pics', 'https://api.waifu.pics/sfw/waifu'],
    ['nekos.best', 'https://nekos.best/api/v2/neko'],
    ['Jikan (anime info)', 'https://api.jikan.moe/v4/anime/1'],
    ['jsDelivr (emoji sticker)', 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/2764.svg'],
    ['WhatsApp channel page', 'https://whatsapp.com/channel/0029VbDzLTD1iUxe8Hsv1D0M']
];

async function ping(url) {
    const t = Date.now();
    try {
        const r = await axios.get(url, { timeout: 9000, validateStatus: () => true, headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 5, responseType: 'arraybuffer', maxContentLength: 2 * 1024 * 1024 });
        return { ok: r.status < 500, status: r.status, ms: Date.now() - t };
    } catch (e) {
        return { ok: false, error: e.code || e.message, ms: Date.now() - t };
    }
}

function version(bin, args) {
    try {
        const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 15000 });
        if (r.status === 0) return String(r.stdout || r.stderr).split('\n')[0].slice(0, 60);
        return null;
    } catch (_) { return null; }
}

function runYt(bin, client, url) {
    return new Promise(resolve => {
        const args = ['--skip-download', '--no-warnings', '--no-playlist', '--print', '%(title)s', '--socket-timeout', '15'];
        if (client) args.push('--extractor-args', `youtube:player_client=${client}`);
        if (process.env.YTDLP_COOKIES) args.push('--cookies', process.env.YTDLP_COOKIES);
        args.push(url);
        const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        const timer = setTimeout(() => { try { p.kill('SIGKILL'); } catch (_) {} resolve({ ok: false, why: 'timeout' }); }, 45000);
        p.stdout.on('data', d => { out += d; });
        p.stderr.on('data', d => { err += d; });
        p.on('error', e => { clearTimeout(timer); resolve({ ok: false, why: e.message }); });
        p.on('close', code => {
            clearTimeout(timer);
            if (code === 0 && out.trim()) resolve({ ok: true, title: out.trim().split('\n')[0].slice(0, 40) });
            else resolve({ ok: false, why: (err.trim().split('\n').pop() || 'exit ' + code).slice(0, 110) });
        });
    });
}

cmd({
    pattern: 'nettest',
    alias: ['dltest', 'netcheck', 'checkdl'],
    desc: 'Check server internet, yt-dlp and ffmpeg (why downloads fail)',
    category: 'general',
    react: '🧪',
    use: '.nettest  |  .nettest yt',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    try {
        const deep = /^(yt|youtube|deep)$/i.test((ctx.q || '').trim());
        await ctx.reply('🧪 Server check chal raha hai... (10-20 second)');

        const lines = ['🧪 *NETTEST*', ''];

        let bin = null;
        try { bin = await mediaDl.ensureYtDlp(); } catch (e) { lines.push('❌ yt-dlp: install nahi ho saka (' + String(e.message).slice(0, 50) + ')'); }
        if (bin) lines.push('✅ yt-dlp: ' + (version(bin, ['--version']) || 'mil gaya'));
        const ff = version(mediaDl.ffmpegLocation(), ['-version']);
        lines.push(ff ? '✅ ffmpeg: ' + ff.replace(/^ffmpeg version\s*/i, '').slice(0, 30) : '❌ ffmpeg: nahi mila');
        lines.push(process.env.YTDLP_COOKIES ? '🍪 YTDLP_COOKIES: set' : '🍪 YTDLP_COOKIES: set nahi');
        lines.push('', '🌐 *Internet*');

        const res = await Promise.all(TESTS.map(async ([name, url]) => [name, await ping(url)]));
        for (const [name, r] of res) lines.push(r.ok ? `✅ ${name} (${r.status}, ${r.ms}ms)` : `❌ ${name} — ${r.error || r.status}`);

        const down = res.filter(([, r]) => !r.ok).length;
        if (down === res.length) lines.push('', '⛔ Server ka outbound internet band lag raha hai. Hosting/firewall check karein.');

        if (deep && bin) {
            lines.push('', '▶️ *YouTube extraction*');
            for (const c of [null, 'android_vr', 'tv', 'web_safari', 'mweb', 'ios']) {
                const r = await runYt(bin, c, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
                lines.push(r.ok ? `✅ ${c || 'default'}: ${r.title}` : `❌ ${c || 'default'}: ${r.why}`);
                if (r.ok) break;
            }
        } else {
            lines.push('', '💡 Gehra YouTube test: `.nettest yt`');
        }
        return ctx.reply(lines.join('\n'));
    } catch (e) {
        return ctx.reply('⚠️ nettest error: ' + String(e.message).slice(0, 200));
    }
});

console.log('[MR SAQIB MD] .nettest loaded');
