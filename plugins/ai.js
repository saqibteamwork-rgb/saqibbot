// plugins/ai.js — Free AI chat, no API key needed
// API: Pollinations.ai (GPT-5, Claude, DeepSeek, Llama 4)

const { cmd } = require('../arslan');
const axios = require('axios');

const POLLINATIONS = 'https://text.pollinations.ai';

async function askAI(prompt, model = 'openai') {
    // Pollinations text API — no key, no signup
    const models = {
        'gpt': 'openai',
        'claude': 'claude',
        'deepseek': 'deepseek',
        'llama': 'llama',
        'mistral': 'mistral'
    };
    const m = models[model] || 'openai';

    const url = `${POLLINATIONS}/${encodeURIComponent(prompt)}?model=${m}`;
    const res = await axios.get(url, {
        timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

cmd({
    pattern: 'ai',
    alias: ['gpt', 'chat', 'ask', 'llm'],
    desc: 'Ask free AI (no API key)',
    category: 'main',
    react: '🤖',
    use: '.ai <question>',
    filename: __filename
}, async (conn, mek, m, { args, reply, from }) => {
    const q = args.join(' ').trim();
    if (!q) return reply('🤖 *FREE AI*\n\nUsage: `.ai <question>`\nModel: `.ai claude <question>`\nModels: gpt, claude, deepseek, llama, mistral');

    // Check if first arg is a model
    const models = ['gpt', 'claude', 'deepseek', 'llama', 'mistral'];
    let model = 'gpt';
    let prompt = q;
    if (models.includes(args[0]?.toLowerCase())) {
        model = args[0].toLowerCase();
        prompt = args.slice(1).join(' ');
    }
    if (!prompt) return reply('❌ Question do.');

    await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } });

    try {
        const answer = await askAI(prompt, model);
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });
        return reply(`🤖 *${model.toUpperCase()}*\n\n${String(answer).slice(0, 3500)}`);
    } catch (e) {
        return reply(`❌ AI fail: ${e.message}`);
    }
});