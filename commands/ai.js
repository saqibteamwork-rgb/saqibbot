'use strict';

/**
 * MR SAQIB MD :: Universal AI Command (.ai, .ask, .gpt, .chatgpt, .bot)
 * ============================================================================
 * High-speed AI responses powered by LuxuryStudioWeb 9-Model Cluster:
 * - Codestral 2508 (Coding & Technical)
 * - Mistral Large 3 (Flagship Deep Reasoning)
 * - Ministral 3 & Devstral (DevOps & Instant Answers)
 * - SenseNova 6.8 (Multilingual Intelligence)
 * ============================================================================
 */

let queryAI = null;
try {
    const luxury = require('../plugins/luxury-ai');
    queryAI = luxury.queryAI;
} catch (e) {
    console.warn('[AI Command] Warning: plugins/luxury-ai not loaded:', e.message);
}

async function aiCommand(sock, from, msg, isAdmin, session, args = []) {
    try {
        const action = args[0]?.toLowerCase();

        // Admin/Owner Toggle for Auto-Reply
        if (action === 'on' || action === 'off') {
            if (!isAdmin) {
                return await sock.sendMessage(from, {
                    text: "❌ Sirf Bot Admin ya Owner AI auto-reply ko on/off kar sakta hai."
                }, { quoted: msg });
            }

            if (action === 'on') {
                if (session) session.aiEnabled = true;
                return await sock.sendMessage(from, {
                    text: "✅ *AI Auto-Reply Enabled!* Bot ab chats mein smart AI replies karega."
                }, { quoted: msg });
            } else {
                if (session) session.aiEnabled = false;
                return await sock.sendMessage(from, {
                    text: "❌ *AI Auto-Reply Disabled!*"
                }, { quoted: msg });
            }
        }

        // Extract query and quoted context
        let query = (args || []).join(' ').trim();
        let context = '';

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;
        if (quotedMsg) {
            const quotedText = quotedMsg.conversation ||
                               quotedMsg.extendedTextMessage?.text ||
                               quotedMsg.imageMessage?.caption ||
                               quotedMsg.videoMessage?.caption ||
                               '';
            if (quotedText) {
                if (!query) {
                    query = quotedText;
                } else {
                    context = quotedText;
                }
            }
        }

        if (!query) {
            return await sock.sendMessage(from, {
                text:
`🤖 *MR SAQIB MD :: SMART AI*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Kripya apna sawal likhein ya kisi message ko reply karein!

*Examples:*
• \`.ai Who was the first person in space?\`
• \`.ai Write a python script to reverse a string\`
• \`.ai What are the health benefits of green tea?\`
• \`.ai Fix this code\` _(reply to any code message)_`
            }, { quoted: msg });
        }

        // Send processing reaction
        await sock.sendMessage(from, { react: { text: '🤖', key: msg.key } }).catch(() => {});

        let answer = '';
        let modelName = 'Mistral Large 3';

        // 1. Try LuxuryStudioWeb Multi-Model Engine
        if (typeof queryAI === 'function') {
            const isCode = /code|function|python|javascript|script|html|css|sql|bug|syntax|regex|java|c\+\+|php|docker|api/i.test(query);
            const preferred = isCode ? 'codestral' : 'mistralLarge';
            try {
                const res = await queryAI(preferred, query, context);
                if (res && res.answer) {
                    answer = res.answer;
                    modelName = res.modelName || (isCode ? 'Codestral 2508' : 'Mistral Large 3');
                }
            } catch (err) {
                console.warn('[AI Command] Luxury AI failover:', err.message);
            }
        }

        // 2. Fallback to session.getAIResponse if available
        if (!answer && session && typeof session.getAIResponse === 'function') {
            try {
                answer = await session.getAIResponse(from, context ? `Context: ${context}\n\nQuestion: ${query}` : query);
                modelName = 'Gemini AI Core';
            } catch (err) {
                console.warn('[AI Command] Session AI fallback error:', err.message);
            }
        }

        if (!answer) {
            throw new Error('AI engines are currently busy. Please try again in a few seconds.');
        }

        const responseText =
`╭━━━〔 🤖 *MR SAQIB MD AI* 〕━━━┈⊷
┃ 💡 *Engine:* ${modelName}
┃ ❓ *Question:* ${query.slice(0, 60)}${query.length > 60 ? '...' : ''}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

${answer}

> ⚡ *Powered by MR SAQIB MD*`;

        await sock.sendMessage(from, { text: responseText }, { quoted: msg });
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

    } catch (e) {
        console.error('[AI Command Error]:', e);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, {
            text: `❌ *AI Error:* ${e.message || 'Failed to get AI response'}`
        }, { quoted: msg }).catch(() => {});
    }
}

module.exports = aiCommand;
