const {
    proto,
    getContentType,
    jidNormalizedUser,
    downloadContentFromMessage
} = require('@whiskeysockets/baileys');

const sms = (conn, m) => {
    if (!m) return m;
    let M = proto.WebMessageInfo;
    
    if (m.key) {
        m.id = m.key.id;
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
        m.chat = m.key.remoteJid;
        m.fromMe = m.key.fromMe;
        m.isGroup = m.chat.endsWith('@g.us');
        m.sender = jidNormalizedUser(m.fromMe ? conn.user.id : (m.participant ? m.participant : m.key.participant ? m.key.participant : m.chat));
    }
    
    if (m.message) {
        m.mtype = getContentType(m.message);
        
        // Gestion ViewOnce / Ephemeral
        if (m.mtype === 'viewOnceMessageV2' || m.mtype === 'viewOnceMessage') {
             m.message = m.message[m.mtype].message;
             m.mtype = getContentType(m.message);
        }
        
        m.msg = m.message[m.mtype];
        // QUOTED MESSAGE
m.quoted = null;
        const qCtx = m.msg?.contextInfo;
        if (qCtx?.quotedMessage) {
            // unwrap view-once / ephemeral wrappers so mtype/msg point at the real content
            let qm = qCtx.quotedMessage;
            for (let i = 0; i < 5; i++) {
                const inner = qm.viewOnceMessageV2?.message || qm.viewOnceMessageV2Extension?.message ||
                              qm.viewOnceMessage?.message || qm.ephemeralMessage?.message || qm.documentWithCaptionMessage?.message;
                if (!inner) break;
                qm = inner;
            }
            const qType = getContentType(qm);
            const qMsg = qm[qType];
            m.quoted = {
                message: qCtx.quotedMessage,
                stanzaId: qCtx.stanzaId,
                id: qCtx.stanzaId,
                participant: qCtx.participant,
                sender: qCtx.participant ? jidNormalizedUser(qCtx.participant) : m.chat,
                chat: m.chat,
                mtype: qType,
                msg: qMsg,
                text: (typeof qMsg === 'string' ? qMsg : (qMsg?.text || qMsg?.caption || qMsg?.conversation || '')) || '',
                download: async () => {
                    const kind = String(qType || '').replace('Message', '');
                    if (!qMsg || !['image', 'video', 'audio', 'sticker', 'document'].includes(kind)) return null;
                    const stream = await downloadContentFromMessage(qMsg, kind);
                    const chunks = [];
                    for await (const c of stream) chunks.push(c);
                    return Buffer.concat(chunks);
                }
            };
        }

        // Récupération du texte (body)
        m.body = (m.mtype === 'conversation') ? m.message.conversation : 
                 (m.mtype == 'imageMessage') ? m.message.imageMessage.caption : 
                 (m.mtype == 'videoMessage') ? m.message.videoMessage.caption : 
                 (m.mtype == 'extendedTextMessage') ? m.message.extendedTextMessage.text : 
                 (m.mtype == 'buttonsResponseMessage') ? m.message.buttonsResponseMessage.selectedButtonId : 
                 (m.mtype == 'listResponseMessage') ? m.message.listResponseMessage.singleSelectReply.selectedRowId : 
                 (m.mtype == 'templateButtonReplyMessage') ? m.message.templateButtonReplyMessage.selectedId : 
                 (m.mtype === 'messageContextInfo') ? (m.message.buttonsResponseMessage?.selectedButtonId || m.message.listResponseMessage?.singleSelectReply.selectedRowId || m.text) : '';
                 
        // Alias pour répondre facilement
        m.q = m.body || '';
        m.text = m.body || '';
        m.reply = (text, chatId = m.chat, options = {}) => {
            return conn.sendMessage(chatId, { text: text }, { quoted: m, ...options });
        };
    }
    return m;
};

module.exports = { sms };
                
                                             
// ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴀʀꜱʟᴀɴ-ᴍᴅ                             
