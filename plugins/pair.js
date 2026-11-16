// plugins/pair.js — sirf ek command: .pair  (private chat aur group, har jagah chalti hai)
//   .pair 923001234567   -> us number ka pairing code
//   .pair                -> apne hi number ka code
// Code ek card mein aata hai, neeche "Copy Code" button: dabate hi code copy ho jata hai.
const { cmd } = require('../arslan');
const axios = require('axios');

// Pairing code apne hi server (/code route) se aata hai.
// Alag server use karna ho to env me PAIR_API set karo, e.g. https://mybot.up.railway.app
async function fetchPairCode(number) {
    const base = (process.env.PAIR_API || `http://127.0.0.1:${process.env.PORT || 8000}`).replace(/\/+$/, '');
    try {
        return await axios.get(`${base}/code`, { params: { number }, timeout: 45000 });
    } catch (e) {
        const msg = e.response && e.response.data && (e.response.data.message || e.response.data.error);
        const err = new Error(msg || e.message);
        err.userMessage = msg || null;
        throw err;
    }
}

function pairText(code) {
    return [
        '*AMAN-MD PAIRING*',
        '',
        `🔐 *CODE:* ${code}`,
        '',
        '1. Go to Settings > Linked Devices',
        '2. Tap Link a Device',
        '3. Select "Link with phone number instead"',
        '4. Enter the code',
        '',
        '⏱️ ```Expires in 60 seconds```'
    ].join('\n');
}

// Card + "Copy Code" button. Success par true, fail par false (throw nahi karta).
async function sendPairCard(conn, jid, quoted, code) {
    try {
        const { proto, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
        const IM = proto.Message.InteractiveMessage;
        const interactive = IM.create({
            header: IM.Header.fromObject({ title: '', subtitle: '', hasMediaAttachment: false }),
            body: IM.Body.create({ text: pairText(code) }),
            footer: IM.Footer.create({ text: 'POWERED BY AMAN-MD' }),
            nativeFlowMessage: IM.NativeFlowMessage.fromObject({
                buttons: [{ name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Code', id: 'copy_pair_code', copy_code: code }) }]
            })
        });
        const msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: { message: { messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 }, interactiveMessage: interactive } }
        }, { quoted, userJid: conn.user && conn.user.id });
        await require('./carousel-menu').relayInteractive(conn, jid, msg);
        return true;
    } catch (e) {
        console.error('pair card error:', e && e.message);
        return false;
    }
}

cmd({
    pattern: 'pair',
    alias: ['pairing', 'getpair'],
    react: '✅',
    desc: 'Get pairing code for AMAN-MD bot',
    category: 'download',
    use: '.pair 92323***',
    filename: __filename
}, async (conn, mek, m, { from, q, senderNumber, reply }) => {
    try {
        const phoneNumber = q ? q.trim().replace(/[^0-9]/g, '') : String(senderNumber || '').replace(/[^0-9]/g, '');

        if (!phoneNumber || phoneNumber.length < 10 || phoneNumber.length > 15) {
            return await reply('❌ Please provide a valid phone number without `+`\nExample: `.pair 92323***`');
        }

        const response = await fetchPairCode(phoneNumber);
        const pairingCode = response.data && response.data.code;
        if (!pairingCode) {
            return await reply('❌ Failed to retrieve pairing code. Please try again later.');
        }

        if (!(await sendPairCard(conn, from, mek, pairingCode))) {
            // button card na chale to: text + alag se saaf code (long-press se copy)
            await reply(`${pairText(pairingCode)}`);
            await reply(`${pairingCode}`);
        }
    } catch (error) {
        console.error('Pair command error:', error);
        await reply(error.userMessage ? `❌ ${error.userMessage}` : '❌ An error occurred while getting pairing code. Please try again later.');
    }
});
