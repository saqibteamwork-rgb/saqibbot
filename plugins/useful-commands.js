const { cmd } = require('../arslan');
const axios = require('axios');

cmd({
    pattern: 'define',
    alias: ['dictionary', 'meaning'],
    desc: 'English word ki definition dekho',
    category: 'tools',
    react: '📖',
    use: '.define serendipity',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const word = String(ctx.q || '').trim();
    if (!word) return ctx.reply('Use: `.define <English word>`\nExample: `.define serendipity`');
    if (word.length > 60 || !/^[a-zA-Z][a-zA-Z '\u2019-]*$/.test(word)) {
        return ctx.reply('❌ English word ya short phrase likho (max 60 characters).');
    }

    try {
        const response = await axios.get(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
            { timeout: 12000, headers: { Accept: 'application/json' } }
        );
        const entry = Array.isArray(response.data) ? response.data[0] : null;
        if (!entry) return ctx.reply('❌ Is word ki definition nahi mili.');

        const phonetic = entry.phonetic || entry.phonetics?.find(item => item.text)?.text;
        const lines = [];
        for (const meaning of (entry.meanings || []).slice(0, 3)) {
            lines.push(`\n*${meaning.partOfSpeech || 'Meaning'}*`);
            for (const [index, definition] of (meaning.definitions || []).slice(0, 2).entries()) {
                const text = String(definition.definition || '').replace(/\s+/g, ' ').slice(0, 300);
                if (text) lines.push(`${index + 1}. ${text}`);
            }
        }
        if (!lines.length) return ctx.reply('❌ Is word ki definition nahi mili.');

        return ctx.reply(`📖 *${entry.word || word}*${phonetic ? `  _${phonetic}_` : ''}\n${lines.join('\n')}`);
    } catch (error) {
        if (error.response?.status === 404) return ctx.reply('❌ Word nahi mila. Spelling check karo.');
        return ctx.reply('❌ Dictionary service abhi available nahi. Baad mein try karo.');
    }
});

const UNIT_TABLE = {
    mm: { type: 'length', factor: 0.001 },
    cm: { type: 'length', factor: 0.01 },
    m: { type: 'length', factor: 1 },
    km: { type: 'length', factor: 1000 },
    in: { type: 'length', factor: 0.0254 },
    ft: { type: 'length', factor: 0.3048 },
    yd: { type: 'length', factor: 0.9144 },
    mi: { type: 'length', factor: 1609.344 },
    mg: { type: 'mass', factor: 0.001 },
    g: { type: 'mass', factor: 1 },
    kg: { type: 'mass', factor: 1000 },
    oz: { type: 'mass', factor: 28.349523125 },
    lb: { type: 'mass', factor: 453.59237 }
};

function convertTemperature(value, from, to) {
    let celsius;
    if (from === 'c') celsius = value;
    else if (from === 'f') celsius = (value - 32) * 5 / 9;
    else if (from === 'k') celsius = value - 273.15;
    else return null;

    if (to === 'c') return celsius;
    if (to === 'f') return celsius * 9 / 5 + 32;
    if (to === 'k') return celsius + 273.15;
    return null;
}

cmd({
    pattern: 'unit',
    alias: ['convertunit', 'units'],
    desc: 'Length, weight, aur temperature convert karo',
    category: 'tools',
    react: '📐',
    use: '.unit 10 km mi',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const parts = String(ctx.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length !== 3) {
        return ctx.reply('Use: `.unit <value> <from> <to>`\nExamples: `.unit 10 km mi` · `.unit 72 f c` · `.unit 5 lb kg`');
    }

    const value = Number(parts[0]);
    const from = parts[1];
    const to = parts[2];
    if (!Number.isFinite(value) || Math.abs(value) > 1e15) {
        return ctx.reply('❌ Valid number likho (maximum size 1e15).');
    }

    let converted;
    const temperatures = new Set(['c', 'f', 'k']);
    if (temperatures.has(from) && temperatures.has(to)) {
        if (from === 'k' && value < 0) return ctx.reply('❌ Kelvin zero se kam nahi ho sakta.');
        if (from === 'c' && value < -273.15) return ctx.reply('❌ Celsius absolute zero se kam nahi ho sakta.');
        if (from === 'f' && value < -459.67) return ctx.reply('❌ Fahrenheit absolute zero se kam nahi ho sakta.');
        converted = convertTemperature(value, from, to);
    } else {
        const source = UNIT_TABLE[from];
        const target = UNIT_TABLE[to];
        if (!source || !target || source.type !== target.type) {
            return ctx.reply('❌ Units match nahi karte. Length: mm, cm, m, km, in, ft, yd, mi. Weight: mg, g, kg, oz, lb. Temperature: c, f, k.');
        }
        converted = value * source.factor / target.factor;
    }

    if (!Number.isFinite(converted)) return ctx.reply('❌ Conversion nahi ho saki.');
    const formatted = Number(converted.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 9 });
    return ctx.reply(`📐 *UNIT CONVERTER*\n\n${value} ${from.toUpperCase()} = *${formatted} ${to.toUpperCase()}*`);
});
