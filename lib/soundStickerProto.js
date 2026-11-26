'use strict';

/**
 * WhatsApp Native Sound Sticker Protocol Support (Field 134: audioStickerMessage)
 * Compatible with @whiskeysockets/baileys 7.0.0-rc10+ without modifying node_modules.
 *
 * Wire layout confirmed on WhatsApp 2.26.46+ (Baileys #2932):
 *   Message.134 (FutureProofMessage) {
 *     1: Message {
 *       26: StickerMessage {
 *         ...standard fields 1..22...
 *         24: int32 premium (0)
 *         25: string emojis (e.g. '🎵')
 *         26: AudioMessage (mimetype: 'audio/ogg; codecs=opus', ptt unset)
 *       }
 *     }
 *   }
 */

const {
    proto,
    jidNormalizedUser,
    areJidsSameUser,
    prepareWAMessageMedia,
    generateWAMessageFromContent
} = require('@whiskeysockets/baileys');

const SOUND_STICKER_SYM = Symbol.for('sigma.soundStickerMeta');

function readVarint(buf, state) {
    let lo = 0;
    let shift = 0;
    while (state.pos < buf.length) {
        const b = buf[state.pos++];
        if (shift < 28) lo |= (b & 0x7f) << shift;
        else lo += (b & 0x7f) * Math.pow(2, shift);
        if ((b & 0x80) === 0) return lo >>> 0;
        shift += 7;
        if (shift > 63) break;
    }
    throw new Error('Malformed varint in protobuf scan');
}

function skipWireField(buf, state, wireType) {
    if (wireType === 0) {
        readVarint(buf, state);
    } else if (wireType === 1) {
        state.pos += 8;
    } else if (wireType === 2) {
        const len = readVarint(buf, state);
        state.pos += len;
    } else if (wireType === 5) {
        state.pos += 4;
    } else {
        throw new Error(`Unsupported wireType ${wireType}`);
    }
}

function scanBytesForFields(buf, start, end, wantedFields) {
    const out = {};
    const state = { pos: start };
    while (state.pos < end) {
        const tag = readVarint(buf, state);
        const fieldNo = tag >>> 3;
        const wireType = tag & 7;
        if (wantedFields.has(fieldNo)) {
            if (wireType === 2) {
                const len = readVarint(buf, state);
                const slice = buf.subarray(state.pos, state.pos + len);
                state.pos += len;
                out[fieldNo] = slice;
                continue;
            }
            if (wireType === 0) {
                out[fieldNo] = readVarint(buf, state);
                continue;
            }
        }
        skipWireField(buf, state, wireType);
    }
    return out;
}

function hasField134Fast(buf, start, end) {
    try {
        const found = scanBytesForFields(buf, start, end, new Set([134]));
        return found[134] instanceof Uint8Array ? found[134] : null;
    } catch (_) {
        return null;
    }
}

function installSoundStickerProtoPatch() {
    if (!proto?.Message || proto.Message.__sigmaSoundStickerPatched) return;

    const origEncode = proto.Message.encode;
    const origDecode = proto.Message.decode;

    proto.Message.encode = function encodeWithSoundSticker(m, w) {
        const directMeta = m?.[SOUND_STICKER_SYM] || m?.stickerMessage?.[SOUND_STICKER_SYM];
        const nestedSticker = m?.audioStickerMessage?.message?.stickerMessage || m?.stickerMessage;
        const nestedAudio = nestedSticker?.audioMessage;
        const soundMeta = directMeta || (nestedAudio ? {
            audioMessage: nestedAudio,
            emojis: nestedSticker.emojis || '🎵',
            premium: nestedSticker.premium ?? 0
        } : null);

        if (!soundMeta?.audioMessage || !nestedSticker) {
            return origEncode.call(this, m, w);
        }

        // Shallow clone without top-level stickerMessage/audioStickerMessage so field 134 is cleanly emitted instead
        const rest = Object.assign(Object.create(Object.getPrototypeOf(m)), m);
        delete rest.stickerMessage;
        delete rest.audioStickerMessage;
        w = origEncode.call(this, rest, w);

        w.uint32((134 << 3) | 2).fork();
        w.uint32((1 << 3) | 2).fork();
        w.uint32((26 << 3) | 2).fork();
        proto.Message.StickerMessage.encode(nestedSticker, w);
        w.uint32((24 << 3) | 0).uint32(Number(soundMeta.premium ?? 0));
        if (soundMeta.emojis) {
            w.uint32((25 << 3) | 2).string(String(soundMeta.emojis));
        }
        proto.Message.AudioMessage.encode(soundMeta.audioMessage, w.uint32((26 << 3) | 2).fork()).ldelim();
        w.ldelim();
        w.ldelim();
        w.ldelim();
        return w;
    };

    proto.Message.decode = function decodeWithSoundSticker(r, l, e) {
        let rawBuf = null;
        let scanStart = 0;
        let scanEnd = 0;

        if (r && typeof r.uint32 === 'function' && r.buf instanceof Uint8Array) {
            rawBuf = r.buf;
            scanStart = r.pos;
            scanEnd = l === undefined ? r.len : r.pos + l;
        } else if (r instanceof Uint8Array) {
            rawBuf = r;
            scanStart = 0;
            scanEnd = l === undefined ? r.length : l;
        }

        const decoded = origDecode.call(this, r, l, e);

        if (rawBuf && e === undefined && scanEnd > scanStart) {
            const fpBytes = hasField134Fast(rawBuf, scanStart, scanEnd);
            if (fpBytes) {
                try {
                    const fpFields = scanBytesForFields(fpBytes, 0, fpBytes.length, new Set([1]));
                    const innerMsgBytes = fpFields[1];
                    if (innerMsgBytes instanceof Uint8Array) {
                        const innerDecoded = origDecode.call(this, innerMsgBytes);
                        const innerFields = scanBytesForFields(innerMsgBytes, 0, innerMsgBytes.length, new Set([26]));
                        const rawStickerBytes = innerFields[26];
                        if (innerDecoded?.stickerMessage && rawStickerBytes instanceof Uint8Array) {
                            const stickerExtra = scanBytesForFields(rawStickerBytes, 0, rawStickerBytes.length, new Set([24, 25, 26]));
                            if (stickerExtra[24] !== undefined) {
                                innerDecoded.stickerMessage.premium = stickerExtra[24];
                            }
                            if (stickerExtra[25] instanceof Uint8Array) {
                                innerDecoded.stickerMessage.emojis = Buffer.from(stickerExtra[25]).toString('utf8');
                            }
                            if (stickerExtra[26] instanceof Uint8Array) {
                                innerDecoded.stickerMessage.audioMessage = proto.Message.AudioMessage.decode(stickerExtra[26]);
                            }
                            decoded.audioStickerMessage = { message: innerDecoded };
                            if (!decoded.stickerMessage) {
                                decoded.stickerMessage = innerDecoded.stickerMessage;
                            }
                        }
                    }
                } catch (_) {}
            }
        }

        return decoded;
    };

    proto.Message.__sigmaSoundStickerPatched = true;
}

/**
 * Send a WhatsApp native Sound Sticker (field 134 audioStickerMessage).
 * Requires WebP stickerBuffer and clean OGG/Opus audioBuffer ('audio/ogg; codecs=opus', <= ~950KB).
 */
async function sendSoundStickerMessage(sock, from, {
    stickerBuffer,
    audioBuffer,
    durationSec = null,
    emoji = '🎵',
    quoted = null,
    cacheMessage = null
}) {
    if (!sock || typeof sock.waUploadToServer !== 'function' || typeof sock.relayMessage !== 'function') {
        throw new Error('WhatsApp socket upload/relay method ready nahi hai.');
    }
    if (!Buffer.isBuffer(stickerBuffer) || stickerBuffer.length < 32) {
        throw new Error('Invalid WebP sticker buffer.');
    }
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length < 32) {
        throw new Error('Invalid OGG/Opus audio buffer.');
    }
    if (audioBuffer.length > 960000) {
        throw new Error('Audio clip 960 KB se bada hai; chhoti (<= 18s) sound use karein.');
    }

    installSoundStickerProtoPatch();

    const [stickerPrep, audioPrep] = await Promise.all([
        prepareWAMessageMedia({ sticker: stickerBuffer }, { upload: sock.waUploadToServer }),
        prepareWAMessageMedia(
            { audio: audioBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: false },
            { upload: sock.waUploadToServer }
        )
    ]);

    if (!stickerPrep?.stickerMessage) {
        throw new Error('Sticker WhatsApp CDN par upload nahi ho saka.');
    }
    if (!audioPrep?.audioMessage) {
        throw new Error('Audio track WhatsApp CDN par upload nahi ho saka.');
    }

    const stickerObj = proto.Message.StickerMessage.toObject
        ? proto.Message.StickerMessage.toObject(stickerPrep.stickerMessage)
        : { ...stickerPrep.stickerMessage };
    const audioObj = proto.Message.AudioMessage.toObject
        ? proto.Message.AudioMessage.toObject(audioPrep.audioMessage)
        : { ...audioPrep.audioMessage };

    // WhatsApp strictly checks exact 'audio/ogg; codecs=opus' mimetype and unset ptt for sound stickers
    audioObj.mimetype = 'audio/ogg; codecs=opus';
    delete audioObj.ptt;
    if (!audioObj.seconds) {
        audioObj.seconds = Math.max(1, Math.min(20, Math.round(durationSec || audioBuffer.length / 4000)));
    }

    const botPn = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
    const botLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : null;
    let targetJid = from ? jidNormalizedUser(from) : from;
    if (botPn && targetJid && !targetJid.endsWith('@g.us') && !targetJid.endsWith('@newsletter')) {
        if ((botLid && areJidsSameUser(targetJid, botLid)) || areJidsSameUser(targetJid, botPn)) {
            targetJid = botPn;
        }
    }
    const isSelf = Boolean(botPn && targetJid && (botPn === targetJid || areJidsSameUser(botPn, targetJid)));
    const safeQuoted = (quoted?.message && !quoted?.key?.fromMe && !isSelf) ? quoted : undefined;

    const waMsg = generateWAMessageFromContent(
        targetJid,
        { stickerMessage: stickerObj },
        { userJid: botPn || sock.user?.id, ...(safeQuoted ? { quoted: safeQuoted } : {}) }
    );

    const soundMeta = {
        audioMessage: audioObj,
        emojis: String(emoji || '🎵').slice(0, 8),
        premium: 0
    };

    Object.defineProperty(waMsg.message.stickerMessage, SOUND_STICKER_SYM, {
        value: soundMeta,
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(waMsg.message, SOUND_STICKER_SYM, {
        value: soundMeta,
        enumerable: false,
        configurable: true
    });

    await sock.relayMessage(targetJid, waMsg.message, { messageId: waMsg.key.id });
    if (typeof cacheMessage === 'function') {
        cacheMessage(waMsg);
    }
    return waMsg;
}

module.exports = {
    SOUND_STICKER_SYM,
    installSoundStickerProtoPatch,
    sendSoundStickerMessage
};
