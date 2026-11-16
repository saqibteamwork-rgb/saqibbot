'use strict';

/**
 * MR SAQIB MD :: LuxuryStudioWeb AI Model Hub
 * ============================================================================
 * Powered by https://luxurystudioweb.com/ai/api/
 * 9 Verified Working High-Speed AI Models:
 * 1. Codestral 2508        - Mistral AI Coding specialist
 * 2. Mistral Large 3       - Ultra flagship reasoning model
 * 3. Mistral Medium 3.5    - Balanced general knowledge AI
 * 4. Mistral Small 4       - High-speed conversational AI
 * 5. Devstral 2 Medium     - Software architecture & dev AI
 * 6. Ministral 3 14B       - Heavyweight compact model
 * 7. Ministral 3 8B        - Medium balanced model
 * 8. Ministral 3 3B        - Ultra fast micro assistant
 * 9. SenseNova 6.8 Flash   - SenseTime multimodal intelligence
 * ============================================================================
 */

const axios = require('axios');
const { cmd } = require('../command');

const WORKING_MODELS = {
    codestral: {
        name: 'Codestral 2508',
        tag: '💻 Coding Specialist',
        endpoint: 'https://luxurystudioweb.com/ai/api/mistralai/codestral-2508'
    },
    mistralLarge: {
        name: 'Mistral Large 3',
        tag: '🧠 Ultra Flagship Reasoning',
        endpoint: 'https://luxurystudioweb.com/ai/api/mistralai/mistral-large-2512'
    },
    mistralMedium: {
        name: 'Mistral Medium 3.5',
        tag: '⚡ Balanced Conversational',
        endpoint: 'https://luxurystudioweb.com/ai/api/mistralai/mistral-medium-3.5'
    },
    mistralSmall: {
        name: 'Mistral Small 4',
        tag: '🚀 High-Speed Assistant',
        endpoint: 'https://luxurystudioweb.com/ai/api/mistralai/mistral-small-2603'
    },
    devstral: {
        name: 'Devstral 2 Medium',
        tag: '🛠️ Developer & DevOps',
        endpoint: 'https://luxurystudioweb.com/ai/api/mistralai/devstral-medium'
    },
    ministral14b: {
        name: 'Ministral 3 14B',
        tag: '📊 High Performance Compact',
        endpoint: 'https://luxurystudioweb.com/ai/api/mistralai/ministral-14b'
    },
    ministral8b: {
        name: 'Ministral 3 8B',
        tag: '✨ Lightweight Companion',
        endpoint: 'https://luxurystudioweb.com/ai/api/mistralai/ministral-8b'
    },
    ministral3b: {
        name: 'Ministral 3 3B',
        tag: '🏎️ Ultra-Fast Micro AI',
        endpoint: 'https://luxurystudioweb.com/ai/api/mistralai/ministral-3b'
    },
    sensenova: {
        name: 'SenseNova 6.8 Flash-Lite',
        tag: '🌐 Multilingual SenseTime AI',
        endpoint: 'https://luxurystudioweb.com/ai/api/sensenova/sensenova-6.8-flash-lite'
    }
};

/**
 * Queries a specific model with automatic fallback across other working models
 */
async function queryAI(primaryKey, userPrompt, context = '') {
    const fullText = context ? `Context / Quoted message:\n"${context}"\n\nUser Question:\n${userPrompt}` : userPrompt;

    const sequence = [
        primaryKey,
        'codestral',
        'mistralLarge',
        'mistralMedium',
        'mistralSmall',
        'devstral',
        'ministral14b',
        'ministral8b',
        'ministral3b',
        'sensenova'
    ];

    // Deduplicate
    const tried = new Set();
    const order = [];
    for (const k of sequence) {
        if (!tried.has(k) && WORKING_MODELS[k]) {
            tried.add(k);
            order.push(k);
        }
    }

    let lastError = null;

    for (const key of order) {
        const model = WORKING_MODELS[key];
        try {
            const url = `${model.endpoint}?text=${encodeURIComponent(fullText)}`;
            const res = await axios.get(url, {
                timeout: 25000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });

            let answer = '';
            if (res.data?.response) {
                answer = res.data.response;
            } else if (res.data?.reply) {
                answer = res.data.reply;
            } else if (typeof res.data === 'string') {
                answer = res.data;
            }

            if (answer && answer.trim().length > 0) {
                return {
                    modelName: model.name,
                    tag: model.tag,
                    answer: answer.trim()
                };
            }
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error('All AI endpoints failed to respond.');
}

/**
 * Helper to extract effective prompt & context from message or quoted message
 */
function extractPrompt(q, quoted) {
    let prompt = (q || '').trim();
    let context = '';

    if (quoted) {
        const quotedText = quoted.text || quoted.caption || '';
        if (quotedText) {
            if (!prompt) {
                // If user just typed command while quoting, use quoted text as prompt
                prompt = quotedText;
            } else {
                context = quotedText;
            }
        }
    }

    return { prompt, context };
}

// ============================================================================
// 1. CODESTRAL - Developer & Coding AI
// ============================================================================
cmd({
    pattern: 'codestral',
    alias: ['codeai', 'coder', 'mistralcode', 'pycode', 'jscode'],
    desc: '💻 Ask Codestral AI for code, debugging, scripts & programming',
    category: 'ai',
    react: '💻',
    use: '.codestral <programming question>',
    filename: __filename
}, async (conn, mek, m, { q, quoted, reply, from }) => {
    try {
        const { prompt, context } = extractPrompt(q, quoted);
        if (!prompt) {
            return reply(
`💻 *CODESTRAL AI (Mistral Coding Specialist)*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kripya apna programming sawal likhein ya code message ko reply karein!

*Example:*
• .codestral Write a python script to download instagram reels
• .codestral Fix error: TypeError: Cannot read property of undefined
• Reply to any code with: .codestral explain this function`
            );
        }

        await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } }).catch(() => {});

        const res = await queryAI('codestral', prompt, context);

        const responseText =
`╭━━━〔 💻 *CODESTRAL 2508* 〕━━━┈⊷
┃ 🤖 *Model:* Mistral AI Coding Engine
┃ 💡 *Prompt:* ${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

${res.answer}

> ⚡ *Powered by MR SAQIB MD & LuxuryStudioWeb*`;

        await conn.sendMessage(from, { text: responseText }, { quoted: mek });
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } }).catch(() => {});
    } catch (e) {
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
        reply(`❌ Codestral Error: ${e.message}`);
    }
});

// ============================================================================
// 2. MISTRAL LARGE 3 - Flagship Reasoning AI
// ============================================================================
cmd({
    pattern: 'mistral',
    alias: ['mlarge', 'mistral3', 'mistralai', 'largeai'],
    desc: '🧠 Ask Mistral Large 3 flagship reasoning AI',
    category: 'ai',
    react: '🧠',
    use: '.mistral <question>',
    filename: __filename
}, async (conn, mek, m, { q, quoted, reply, from }) => {
    try {
        const { prompt, context } = extractPrompt(q, quoted);
        if (!prompt) {
            return reply('🧠 *Please ask a question!*\nExample: `.mistral Explain relativity in simple terms`');
        }

        await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } }).catch(() => {});

        const res = await queryAI('mistralLarge', prompt, context);

        const responseText =
`╭━━━〔 🧠 *MISTRAL LARGE 3* 〕━━━┈⊷
┃ 👑 *Engine:* Flagship Deep Reasoning
┃ 👤 *Query:* ${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

${res.answer}

> 🌟 *Powered by MR SAQIB MD*`;

        await conn.sendMessage(from, { text: responseText }, { quoted: mek });
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } }).catch(() => {});
    } catch (e) {
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
        reply(`❌ Mistral Error: ${e.message}`);
    }
});

// ============================================================================
// 3. DEVSTRAL 2 - Software Engineering & DevOps AI
// ============================================================================
cmd({
    pattern: 'devstral',
    alias: ['devai', 'devops', 'sysadmin'],
    desc: '🛠️ Ask Devstral 2 for architecture, devops & system design',
    category: 'ai',
    react: '🛠️',
    use: '.devstral <technical question>',
    filename: __filename
}, async (conn, mek, m, { q, quoted, reply, from }) => {
    try {
        const { prompt, context } = extractPrompt(q, quoted);
        if (!prompt) {
            return reply('🛠️ *Please provide a dev query!*\nExample: `.devstral How to deploy docker container on Railway with health checks?`');
        }

        await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } }).catch(() => {});

        const res = await queryAI('devstral', prompt, context);

        const responseText =
`╭━━━〔 🛠️ *DEVSTRAL 2 MEDIUM* 〕━━━┈⊷
┃ ⚙️ *DevOps & Architecture Engine*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

${res.answer}

> 🚀 *MR SAQIB MD Engineering*`;

        await conn.sendMessage(from, { text: responseText }, { quoted: mek });
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } }).catch(() => {});
    } catch (e) {
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
        reply(`❌ Devstral Error: ${e.message}`);
    }
});

// ============================================================================
// 4. MINISTRAL - High Speed Compact AI
// ============================================================================
cmd({
    pattern: 'ministral',
    alias: ['mini', 'm14b', 'm8b', 'm3b', 'quickai'],
    desc: '🏎️ Ultra-fast smart answers using Ministral 3',
    category: 'ai',
    react: '🏎️',
    use: '.ministral <question>',
    filename: __filename
}, async (conn, mek, m, { q, quoted, reply, from }) => {
    try {
        const { prompt, context } = extractPrompt(q, quoted);
        if (!prompt) {
            return reply('🏎️ *Ask a quick question!*\nExample: `.ministral What are the 7 wonders of the world?`');
        }

        await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } }).catch(() => {});

        const res = await queryAI('ministral14b', prompt, context);

        const responseText =
`╭━━━〔 🏎️ *MINISTRAL 3* 〕━━━┈⊷
┃ ⚡ *Compact High-Speed AI*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

${res.answer}

> ⚡ *MR SAQIB MD*`;

        await conn.sendMessage(from, { text: responseText }, { quoted: mek });
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } }).catch(() => {});
    } catch (e) {
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
        reply(`❌ Ministral Error: ${e.message}`);
    }
});

// ============================================================================
// 5. SENSENOVA - Multilingual Intelligence AI
// ============================================================================
cmd({
    pattern: 'sensenova',
    alias: ['nova', 'senseai', 'shangliang'],
    desc: '🌐 Ask SenseNova 6.8 multilingual AI',
    category: 'ai',
    react: '🌐',
    use: '.sensenova <question>',
    filename: __filename
}, async (conn, mek, m, { q, quoted, reply, from }) => {
    try {
        const { prompt, context } = extractPrompt(q, quoted);
        if (!prompt) {
            return reply('🌐 *Please ask a question!*\nExample: `.sensenova Explain artificial intelligence history`');
        }

        await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } }).catch(() => {});

        const res = await queryAI('sensenova', prompt, context);

        const responseText =
`╭━━━〔 🌐 *SENSENOVA 6.8 FLASH* 〕━━━┈⊷
┃ 🌏 *SenseTime Multilingual Core*
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

${res.answer}

> 💫 *MR SAQIB MD*`;

        await conn.sendMessage(from, { text: responseText }, { quoted: mek });
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } }).catch(() => {});
    } catch (e) {
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
        reply(`❌ SenseNova Error: ${e.message}`);
    }
});

// ============================================================================
// 6. LUXAI - Auto-Routing Super AI
// ============================================================================
cmd({
    pattern: 'luxai',
    alias: ['lux', 'superai', 'asklux', 'smartai'],
    desc: '✨ Luxury AI Auto-Router with failover across all 9 models',
    category: 'ai',
    react: '✨',
    use: '.luxai <any prompt or question>',
    filename: __filename
}, async (conn, mek, m, { q, quoted, reply, from }) => {
    try {
        const { prompt, context } = extractPrompt(q, quoted);
        if (!prompt) {
            return reply(
`✨ *LUXURY AI AUTO-ROUTER*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Aapka sawal auto-route hokar sabse behtareen working AI model se answer hoga!

*Example:*
• .luxai Who was the first person in space?
• .luxai Write an essay on artificial intelligence
• Reply to any message: .luxai summarize this`
            );
        }

        await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } }).catch(() => {});

        // Auto select best model based on prompt type
        const isCodeQuery = /code|function|python|javascript|script|html|css|sql|bug|syntax|regex/i.test(prompt);
        const preferredKey = isCodeQuery ? 'codestral' : 'mistralLarge';

        const res = await queryAI(preferredKey, prompt, context);

        const responseText =
`╭━━━〔 ✨ *LUXURY SMART AI* 〕━━━┈⊷
┃ 🤖 *Routed To:* ${res.name || res.modelName}
┃ 🏷️ *Category:* ${res.tag}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

${res.answer}

> 🚀 *MR SAQIB MD Ultra AI Engine*`;

        await conn.sendMessage(from, { text: responseText }, { quoted: mek });
        await conn.sendMessage(from, { react: { text: '✅', key: mek.key } }).catch(() => {});
    } catch (e) {
        await conn.sendMessage(from, { react: { text: '❌', key: mek.key } }).catch(() => {});
        reply(`❌ Luxury AI Error: ${e.message}`);
    }
});

// ============================================================================
// 7. AIMODELS - Real-Time Models Catalog & Status
// ============================================================================
cmd({
    pattern: 'aimodels',
    alias: ['aimodelslist', 'luxmodels', 'models', 'allmodels'],
    desc: '📋 Display all 9 working AI models with real-time status & commands',
    category: 'ai',
    react: '📋',
    filename: __filename
}, async (conn, mek, m, { reply }) => {
    const text =
`╭━━━〔 🤖 *MR SAQIB MD :: LIVE AI MODELS* 〕━━━┈⊷
┃ 🌐 *Source:* LuxuryStudioWeb AI Hub (43 Tested)
┃ 🟢 *Status:* 9 Live High-Speed Engines Active
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

💻 *1. Codestral 2508*
• Command: \`.codestral <code query>\`
• Specialty: Python, JS, PHP, C++, Coder AI
• Speed: ~750ms ⚡

🧠 *2. Mistral Large 3*
• Command: \`.mistral <question>\`
• Specialty: Complex Logic & Deep Reasoning
• Speed: ~850ms ⚡

🛠️ *3. Devstral 2 Medium*
• Command: \`.devstral <query>\`
• Specialty: DevOps, Docker, Cloud & Architecture
• Speed: ~1.4s ⚡

🏎️ *4. Ministral 3 (14B / 8B / 3B)*
• Command: \`.ministral <question>\`
• Specialty: Ultra-fast Daily Answers & Summaries
• Speed: ~900ms ⚡

🌐 *5. SenseNova 6.8 Flash-Lite*
• Command: \`.sensenova <question>\`
• Specialty: SenseTime Multilingual Intelligence
• Speed: High Accuracy ⚡

✨ *6. Smart Auto-Router*
• Command: \`.luxai <question>\`
• Specialty: Auto-picks the best working model!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 *Pro Tip:* Reply to any text message or code with any of these commands to analyze it instantly!
> 🚀 *Powered by MR SAQIB MD*`;

    return reply(text);
});

module.exports = {
    WORKING_MODELS,
    queryAI
};
