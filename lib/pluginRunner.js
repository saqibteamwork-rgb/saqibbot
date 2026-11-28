'use strict';

/**
 * MR SAQIB MD :: Dynamic Plugin Engine for D:\Plugin--main
 * ============================================================================
 * Loads all 130 plugin modules (320+ commands) seamlessly into the bot!
 * Features full message serialization with m.quoted, download(), and context.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
let commands = [];
try {
    const cmdModule = require('../command');
    commands = cmdModule.commands || [];
} catch (e) {
    console.warn('[PluginRunner] Warning: ../command module not loaded:', e.message);
}
const settings = require('../settings');

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');
const commandMap = new Map();

let isLoaded = false;

function loadAllPlugins() {
    if (isLoaded) return;
    try {
        if (!fs.existsSync(PLUGINS_DIR)) {
            console.log('[PluginRunner] Directory not found:', PLUGINS_DIR);
            return;
        }

        const files = fs.readdirSync(PLUGINS_DIR);
        let loaded = 0;

        for (const file of files) {
            if (!file.endsWith('.js')) continue;
            try {
                require(path.join(PLUGINS_DIR, file));
                loaded++;
            } catch (err) {
                // Ignore individual plugin load errors
            }
        }

        // Register commands and aliases into fast lookup map
        for (const cmd of commands) {
            if (cmd && cmd.pattern) {
                commandMap.set(cmd.pattern.toLowerCase(), cmd);
            }
            if (cmd && Array.isArray(cmd.alias)) {
                for (const a of cmd.alias) {
                    if (a) commandMap.set(String(a).toLowerCase(), cmd);
                }
            }
        }

        isLoaded = true;
        console.log(`[PluginRunner] ✅ Successfully indexed ${commandMap.size} commands/aliases from ${loaded} plugins!`);
    } catch (e) {
        console.error('[PluginRunner Load Error]:', e);
    }
}

// Initial load
loadAllPlugins();

/**
 * Full message serializer that plugins expect (m.quoted, download, mimetype, text)
 */
function serializeMessage(sock, msg) {
    if (!msg) return msg;

    const mContent = msg.message?.ephemeralMessage?.message ||
                     msg.message?.viewOnceMessage?.message ||
                     msg.message?.viewOnceMessageV2?.message ||
                     msg.message?.viewOnceMessageV2Extension?.message ||
                     msg.message?.documentWithCaptionMessage?.message ||
                     msg.message;

    const ctx = mContent?.extendedTextMessage?.contextInfo ||
                mContent?.imageMessage?.contextInfo ||
                mContent?.videoMessage?.contextInfo ||
                mContent?.audioMessage?.contextInfo ||
                mContent?.documentMessage?.contextInfo ||
                mContent?.stickerMessage?.contextInfo ||
                msg.message?.contextInfo;

    msg.mentionedJid = ctx?.mentionedJid || [];

    // Direct message serialization
    const mType = Object.keys(mContent || {})[0] || '';
    const mData = mContent ? mContent[mType] : {};
    const isDirectMedia = Boolean(mContent?.imageMessage || mContent?.videoMessage || mContent?.audioMessage || mContent?.stickerMessage || mContent?.documentMessage);
    msg.mtype = mType;
    msg.msg = mData;
    msg.isMedia = isDirectMedia;
    msg.mimetype = mData?.mimetype || (mType === 'imageMessage' ? 'image/jpeg' : mType === 'videoMessage' ? 'video/mp4' : mType === 'audioMessage' ? 'audio/mp4' : '');
    msg.download = async () => {
        if (!isDirectMedia) return null;
        try {
            let mediaType = mType.replace('Message', '').replace('ptt', 'audio').toLowerCase();
            const stream = await downloadContentFromMessage(mData, mediaType);
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            return buffer;
        } catch (err) {
            console.error('[serializeMessage Direct Download Error]:', err.message);
            throw err;
        }
    };

    if (ctx && ctx.quotedMessage) {
        let rawQuoted = ctx.quotedMessage;
        if (rawQuoted.ephemeralMessage?.message) rawQuoted = rawQuoted.ephemeralMessage.message;
        if (rawQuoted.viewOnceMessage?.message) rawQuoted = rawQuoted.viewOnceMessage.message;
        if (rawQuoted.viewOnceMessageV2?.message) rawQuoted = rawQuoted.viewOnceMessageV2.message;
        if (rawQuoted.viewOnceMessageV2Extension?.message) rawQuoted = rawQuoted.viewOnceMessageV2Extension.message;
        if (rawQuoted.documentWithCaptionMessage?.message) rawQuoted = rawQuoted.documentWithCaptionMessage.message;

        const qType = Object.keys(rawQuoted)[0] || '';
        const qContent = rawQuoted[qType] || {};

        let mimeType = qContent.mimetype || '';
        if (!mimeType) {
            if (qType === 'imageMessage') mimeType = 'image/jpeg';
            else if (qType === 'videoMessage') mimeType = 'video/mp4';
            else if (qType === 'audioMessage') mimeType = 'audio/mp4';
            else if (qType === 'stickerMessage') mimeType = 'image/webp';
            else if (qType === 'documentMessage') mimeType = 'application/octet-stream';
        }

        const qText = rawQuoted.conversation ||
                      rawQuoted.extendedTextMessage?.text ||
                      qContent.caption ||
                      qContent.text || '';

        const isMedia = Boolean(rawQuoted.imageMessage || rawQuoted.videoMessage || rawQuoted.audioMessage || rawQuoted.stickerMessage || rawQuoted.documentMessage);

        const myNumber = (sock.user?.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const senderNumber = (ctx.participant || ctx.remoteJid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

        msg.quoted = {
            id: ctx.stanzaId,
            sender: ctx.participant || ctx.remoteJid,
            fromMe: Boolean(myNumber && senderNumber && myNumber === senderNumber),
            message: rawQuoted,
            msg: qContent,
            mtype: qType,
            mimetype: mimeType,
            text: qText,
            caption: qContent.caption || '',
            isMedia: isMedia,
            download: async () => {
                if (!isMedia) return null;
                try {
                    let mediaType = qType.replace('Message', '').replace('ptt', 'audio').toLowerCase();
                    const stream = await downloadContentFromMessage(qContent, mediaType);
                    let buffer = Buffer.alloc(0);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                    return buffer;
                } catch (err) {
                    console.error('[serializeMessage Quoted Download Error]:', err.message);
                    throw err;
                }
            }
        };
    } else {
        msg.quoted = null;
    }

    return msg;
}

/**
 * Executes a plugin command if it matches
 */
async function executePlugin(sock, from, msg, commandName, args = [], q = '', isOwner = false, isAdmin = false, isMasterOwner = false) {
    const cmd = commandMap.get(commandName.toLowerCase());
    if (!cmd || typeof cmd.function !== 'function') {
        return false;
    }

    try {
        const isGroup = from.endsWith('@g.us');
        const sender = msg.key.participant || msg.participant || from;
        const senderNumber = sender.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

        let groupMetadata = null;
        let participants = [];
        let groupAdmins = [];
        let isBotAdmins = false;

        if (isGroup) {
            try {
                if (typeof global.getCachedGroupMetadata === 'function') {
                    groupMetadata = await global.getCachedGroupMetadata(sock, from).catch(() => null);
                } else {
                    groupMetadata = await Promise.race([
                        sock.groupMetadata(from),
                        new Promise(r => setTimeout(() => r(null), 3500))
                    ]).catch(() => null);
                }
                if (groupMetadata) {
                    participants = groupMetadata.participants || [];
                    groupAdmins = participants
                        .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                        .map(p => p.id);
                    
                    const botPhoneDigits = (sock.user?.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                    const botLidDigits = (sock.user?.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

                    isBotAdmins = participants.some(p => {
                        if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
                        const pIdBare = String(p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        const pPnBare = String(p.phoneNumber || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        const pLidBare = String(p.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                        return Boolean(
                            (botPhoneDigits && (pIdBare === botPhoneDigits || pPnBare === botPhoneDigits)) ||
                            (botLidDigits && (pLidBare === botLidDigits || pIdBare === botLidDigits))
                        );
                    });

                    // Real-time verification: if sender was promoted after pairing, mark them admin
                    if (!isAdmin) {
                        const isSenderAdmin = participants.some(p => {
                            if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
                            const pIdBare = String(p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                            const pPnBare = String(p.phoneNumber || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                            const pLidBare = String(p.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                            return Boolean(senderNumber && (pIdBare === senderNumber || pPnBare === senderNumber || pLidBare === senderNumber));
                        });
                        if (isSenderAdmin) {
                            isAdmin = true;
                        }
                    }
                }
            } catch {}
        }

        // Content sanitizer to ensure 100% MR SAQIB MD branding across all dynamic plugins
        const sanitizeContent = (content) => {
            if (!content || typeof content !== 'object') return content;
            if (content.contextInfo?.forwardedNewsletterMessageInfo) {
                content.contextInfo.forwardedNewsletterMessageInfo.newsletterJid = settings.newsletterJid || '120363431913895899@newsletter';
                content.contextInfo.forwardedNewsletterMessageInfo.newsletterName = settings.channelName || 'Mr SAQIB';
            }
            if (typeof content.text === 'string') {
                content.text = content.text
                    .replace(/JawadTechX[D]?/gi, 'MR SAQIB')
                    .replace(/The TechX-?MD/gi, 'MR SAQIB MD')
                    .replace(/The TechX/gi, 'MR SAQIB')
                    .replace(/TechX MD/gi, 'MR SAQIB MD');
            }
            if (typeof content.caption === 'string') {
                content.caption = content.caption
                    .replace(/JawadTechX[D]?/gi, 'MR SAQIB')
                    .replace(/The TechX-?MD/gi, 'MR SAQIB MD')
                    .replace(/The TechX/gi, 'MR SAQIB')
                    .replace(/TechX MD/gi, 'MR SAQIB MD');
            }
            return content;
        };

        // Proxy socket to enforce MR SAQIB MD branding on all sendMessage calls from plugins
        const proxySock = Object.create(sock);
        proxySock.sendMessage = async (targetJid, content, options) => {
            sanitizeContent(content);
            return await sock.sendMessage(targetJid, content, options);
        };

        // Helper reply function
        const reply = async (text, options = {}) => {
            if (typeof text === 'object') {
                sanitizeContent(text);
                return await sock.sendMessage(from, text, { quoted: msg, ...options });
            }
            let sanitizedText = String(text)
                .replace(/JawadTechX[D]?/gi, 'MR SAQIB')
                .replace(/The TechX-?MD/gi, 'MR SAQIB MD')
                .replace(/The TechX/gi, 'MR SAQIB')
                .replace(/TechX MD/gi, 'MR SAQIB MD');
            return await sock.sendMessage(from, { text: sanitizedText, ...options }, { quoted: msg });
        };

        // Fully serialize msg so m.quoted, download(), and mimetype work seamlessly!
        serializeMessage(sock, msg);

        const extraContext = {
            from,
            botNumber: (sock.user?.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, ''),
            isGroup,
            sender,
            senderNumber,
            sanitizedNumber: senderNumber,
            reply,
            args,
            q,
            text: q, // Crucial for plugins accessing { text }
            body: q,
            command: commandName,
            prefix: '.',
            participants,
            groupAdmins,
            isAdmin,
            isAdmins: isAdmin,
            isBotAdmins,
            isOwner,
            isMasterOwner: Boolean(isMasterOwner),
            isCreator: isOwner,
            isDev: isOwner,
            isSubOwner: isOwner,
            groupMetadata,
            quoted: msg.quoted,
            quotedMsg: msg.quoted,
            userConfig: {
                AUTO_REACT: sock.autoReact ? 'true' : 'false',
                AUTO_LIKE_STATUS: 'true'
            },
            updateUserConfig: async (num, cfg) => {
                if (cfg && cfg.AUTO_REACT !== undefined) {
                    sock.autoReact = cfg.AUTO_REACT === 'true' || cfg.AUTO_REACT === true;
                }
                try {
                    const zeroLoss = require('../utils/zeroLossManager');
                    zeroLoss.persistUserSettings(num || sock?.user?.id, cfg);
                } catch (_) {}
            }
        };

        // React if command has react emoji defined
        if (cmd.react) {
            sock.sendMessage(from, { react: { text: cmd.react, key: msg.key } }).catch(() => {});
        }

        // Call plugin function with serialized msg and proxied socket
        // Supports both 4-argument (conn, mek, m, ctx) and 3-argument (conn, mek, ctx) plugins
        if (cmd.function.length === 3) {
            await cmd.function(proxySock, msg, extraContext);
        } else {
            await cmd.function(proxySock, msg, msg, extraContext);
        }
        return true;
    } catch (e) {
        console.error(`[PluginRunner Execution Error for .${commandName}]:`, e);
        await sock.sendMessage(from, { text: `❌ Plugin error (.${commandName}): ${e.message}` }, { quoted: msg }).catch(() => {});
        return true;
    }
}

module.exports = {
    loadAllPlugins,
    executePlugin,
    commandMap,
    commands,
    serializeMessage
};
