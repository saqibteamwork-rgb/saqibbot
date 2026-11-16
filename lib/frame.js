// lib/frame.js — har command ke reply par ek hi box-frame lagata hai
//
// ╭┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉❥
// ┋✯╭━────────────━⊷
// ┋✯┣═━❲ COMMAND ❳
// ┋✯┃ message line 1
// ┋✯┃ message line 2
// ┋✯╰━────────────━⊷
// ╰┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉❥
//
// Band karne ke liye env: MSG_FRAME=off

const TOP    = '╭┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉❥';
const HEAD   = '┋✯╭━────────────━⊷';
const TITLE  = (t) => `┋✯┣═━❲ ${t} ❳`;
const LINE   = (l) => (l.trim() ? `┋✯┃ ${l}` : '┋✯┃');
const FOOT   = '┋✯╰━────────────━⊷';
const BOTTOM = '╰┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉┉❥';

// Content ki max width (characters). Isse lambi line apne aap agli line par wrap hoti hai
// aur har wrapped line par bhi ┋✯┃ lagta hai. Env: MSG_FRAME_WIDTH (default 28)
const WIDTH = () => Math.max(12, Number(process.env.MSG_FRAME_WIDTH) || 28);
const vlen = (t) => [...t].length;

// Ek line ko width ke andar words ke hisaab se todta hai (URL / lamba word kabhi nahi todta)
function wrapLine(line, width) {
    if (vlen(line) <= width) return [line];
    const indent = (line.match(/^\s*(?:[-•▪▫◦●○✦✧➤➜»›>]\s+|\d+[.)]\s+)?/) || [''])[0];
    const pad = ' '.repeat(Math.min(vlen(indent), 4));
    const words = line.trim().split(/\s+/);
    const out = [];
    let cur = '';
    for (const w of words) {
        const next = cur ? cur + ' ' + w : w;
        if (cur && vlen(next) > width) { out.push(cur); cur = pad + w; }
        else cur = next;
    }
    if (cur) out.push(cur);
    // *bold* _italic_ ~strike~ agar line todne se beech me kat jaye to har tukde me band/dobara kholo
    for (const m of ['*', '_', '~']) {
        const total = line.split(m).length - 1;
        if (total < 2 || total % 2) continue;
        let open = false;
        for (let i = 0; i < out.length; i++) {
            const orig = out[i];
            const c = orig.split(m).length - 1;
            let seg = orig;
            if (open) seg = seg.replace(/^(\s*)/, '$1' + m);
            if (c % 2) open = !open;
            if (open && i < out.length - 1) seg = seg.replace(/\s*$/, m);
            out[i] = seg;
        }
    }
    return out;
}

const config = require('../config');
const enabled = () => String(process.env.MSG_FRAME || 'on').toLowerCase() !== 'off';
const isFramed = (t) => typeof t === 'string' && t.includes('┋✯┣═━❲');

function frameText(text, title) {
    if (!enabled()) return text;
    const body = String(text == null ? '' : text).replace(/\r/g, '').replace(/^\n+|\n+$/g, '');
    if (!body || isFramed(body)) return text;
    const name = String(title || config.BOT_NAME || 'SAQIB-MD').trim().toUpperCase();
    return [TOP, HEAD, TITLE(name), ...body.split('\n').flatMap((l) => wrapLine(l, WIDTH())).map(LINE), FOOT, BOTTOM].join('\n');
}

module.exports = { frameText, isFramed };
