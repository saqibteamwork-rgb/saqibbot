// plugins/pay.js — MR SAQIB MD: Protected Payment Message (requestPaymentMessage)
// ============================================================================
//   .pay <text ya link>         → Sends text/link inside WhatsApp Payment Request Card
//   .pay (reply to a message)   → Takes quoted message and wraps in Payment Request Card
//   .pay 500 PKR | <text>       → Custom currency & amount (USD, PKR, INR, EUR, etc.)
//   Why: Group admins cannot "Delete for Everyone" WhatsApp Payment Request messages!
// ============================================================================

const { cmd } = require('../command');
const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const config = require('../config');

const P = () => config.prefix || config.PREFIX || '.';

cmd({
    pattern: 'pay',
    alias: ['payment', 'paymsg', 'paytext', 'paymentmsg', 'protectmsg', 'pmsg'],
    desc: 'Send anti-delete protected WhatsApp payment request card (text/link)',
    category: 'tools',
    react: '💳',
    use: '.pay <text/link> ya reply karke .pay',
    filename: __filename
}, async (conn, mek, m, { args, q, from, reply }) => {
    let text = (q || args.join(' ')).trim();

    // Check if replying to a message
    if (!text && m?.quoted) {
        text = (m.quoted.text || m.quoted.caption || m.quoted.conversation || '').trim();
    }

    if (!text) {
        const p = P();
        return reply(
            `╔══════════════════════════╗\n` +
            `   💳 *MR SAQIB MD :: PAY MSG* 💳\n` +
            `╚══════════════════════════╝\n\n` +
            `📌 *Kaise Use Karein:*\n` +
            `👉 \`${p}pay <apka text ya link>\`\n` +
            `👉 Kisi bhi message ya link ko *reply* karke \`${p}pay\` likhein!\n\n` +
            `📝 *Examples:*\n` +
            `• \`${p}pay https://chat.whatsapp.com/xxx Join our group!\`\n` +
            `• \`${p}pay Important notice: Aaj 9 baje live stream hogi.\`\n` +
            `• \`${p}pay 500 PKR | VIP Group link: https://...\`\n\n` +
            `🛡️ *Khas Baat (Anti-Delete Protection):*\n` +
            `_Ye message WhatsApp Payment Request format mein send hota hai jisay group admins "Delete for Everyone" nahi kar sakte!_`
        );
    }

    // Default payment settings
    let currency = 'USD';
    let amountVal = 100000; // $100.00

    // Check for optional custom amount/currency format: "500 PKR | my message"
    const customMatch = text.match(/^(\d+)\s*(USD|PKR|INR|AED|SAR|EUR|GBP)\s*\|\s*([\s\S]+)$/i);
    if (customMatch) {
        amountVal = parseInt(customMatch[1], 10) * 1000;
        currency = customMatch[2].toUpperCase();
        text = customMatch[3].trim();
    }

    try {
        const myLid = conn.user?.lid || '163986666475657@lid';

        const waMsg = generateWAMessageFromContent(from, {
            requestPaymentMessage: {
                currencyCodeIso4217: currency,
                amount1000: String(amountVal),
                requestFrom: myLid,
                noteMessage: {
                    extendedTextMessage: {
                        text: text,
                        contextInfo: {
                            forwardingScore: 999,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363431913895899@newsletter',
                                newsletterName: 'Mr SAQIB',
                                serverMessageId: 1
                            }
                        }
                    }
                },
                expiryTimestamp: '0',
                amount: {
                    value: String(amountVal),
                    offset: 1000,
                    currencyCode: currency
                }
            }
        }, { userJid: conn.user?.id });

        // Send payment message into chat via relayMessage
        await conn.relayMessage(from, waMsg.message, { messageId: waMsg.key.id });

        // Delete the original triggering command message to keep chat ultra clean
        await conn.sendMessage(from, { delete: mek.key }).catch(() => {});

    } catch (err) {
        console.error('[pay command error]:', err.message);
        // Fallback: send normal text if client/network rejects relay
        await conn.sendMessage(from, {
            text: `💳 *PAYMENT PROTECTED MESSAGE*\n\n${text}`,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363431913895899@newsletter',
                    newsletterName: 'Mr SAQIB',
                    serverMessageId: 1
                }
            }
        }, { quoted: mek }).catch(() => {});
    }
});
