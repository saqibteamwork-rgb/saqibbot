// utils/pfpFetcher.js
'use strict';

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { getBinaryNodeChild } = require('@whiskeysockets/baileys');

/**
 * Fast LID resolver: reads direct JSON mapping file without scanning thousands of files
 */
function resolveLidFast(cleanNum) {
    if (!cleanNum) return null;
    try {
        const authBase = path.join(__dirname, '..', 'auth_info');
        if (!fs.existsSync(authBase)) return null;

        const dirs = fs.readdirSync(authBase);
        for (const d of dirs) {
            const dirPath = path.join(authBase, d);
            if (!fs.statSync(dirPath).isDirectory()) continue;
            
            // Check direct lid-mapping-<number>.json (instant O(1) lookup)
            const targetFile = path.join(dirPath, `lid-mapping-${cleanNum}.json`);
            if (fs.existsSync(targetFile)) {
                try {
                    const lid = fs.readJsonSync(targetFile);
                    if (lid) {
                        const cleanLid = String(lid).replace(/[^0-9]/g, '');
                        if (cleanLid) return `${cleanLid}@lid`;
                    }
                } catch {}
            }
        }
    } catch {}
    return null;
}

/**
 * Perform raw IQ profile picture query without tctoken
 * WhatsApp protocol: <iq to="s.whatsapp.net" type="get" xmlns="w:profile:picture"><picture type="image|preview" query="url"/></iq>
 */
async function queryRawProfilePic(sock, targetJid, type = 'image', timeoutMs = 4000) {
    if (!sock || !targetJid) return null;
    try {
        const isGroup = String(targetJid).endsWith('@g.us');
        const attrs = isGroup
            ? { to: targetJid, type: 'get', xmlns: 'w:profile:picture' }
            : { target: targetJid, to: 's.whatsapp.net', type: 'get', xmlns: 'w:profile:picture' };

        const result = await sock.query({
            tag: 'iq',
            attrs,
            content: [{ tag: 'picture', attrs: { type, query: 'url' } }]
        }, timeoutMs);

        const picChild = getBinaryNodeChild(result, 'picture');
        const url = picChild?.attrs?.url;
        if (url && typeof url === 'string' && url.startsWith('http')) {
            return url;
        }
    } catch (e) {
        // Can fail with 401 (privacy), 404 (no picture), or 408 (timeout)
    }
    return null;
}

/**
 * Robust Profile Picture URL resolver
 * Tries Baileys native profilePictureUrl first (with privacy token support),
 * then Raw IQ fallback, checking Phone JID, LID JID, and all active bot sessions.
 */
async function getProfilePictureUrl(primarySock, targetInput) {
    if (!targetInput) return null;

    const inputList = Array.isArray(targetInput) ? targetInput : [targetInput];
    const candidateJids = [];

    for (const item of inputList) {
        if (!item || typeof item !== 'string') continue;
        const isGroup = item.endsWith('@g.us');
        const rawNumber = item.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

        if (isGroup) {
            if (!candidateJids.includes(item)) candidateJids.push(item);
        } else {
            if (item.endsWith('@lid')) {
                if (!candidateJids.includes(item)) candidateJids.push(item);
            }
            if (rawNumber) {
                const pnJid = `${rawNumber}@s.whatsapp.net`;
                if (!candidateJids.includes(pnJid)) candidateJids.push(pnJid);
                const fastLid = resolveLidFast(rawNumber);
                if (fastLid && !candidateJids.includes(fastLid)) {
                    candidateJids.push(fastLid);
                }
            }
            if (!candidateJids.includes(item)) {
                candidateJids.push(item);
            }
        }
    }

    const candidateSockets = [];
    if (primarySock) candidateSockets.push(primarySock);

    try {
        if (typeof global.ProBoySessionManager?.getActiveSocks === 'function') {
            const all = global.ProBoySessionManager.getActiveSocks();
            for (const s of all) {
                if (s && s !== primarySock && !candidateSockets.includes(s)) {
                    candidateSockets.push(s);
                }
            }
        }
    } catch {}

    for (const s of candidateSockets) {
        for (const jid of candidateJids) {
            s.presenceSubscribe?.(jid).catch(() => {});

            // 1. Native Baileys profilePictureUrl (HD Image with full tcToken support)
            try {
                const bHigh = await Promise.race([
                    s.profilePictureUrl(jid, 'image').catch(() => null),
                    new Promise(r => setTimeout(() => r(null), 3000))
                ]);
                if (bHigh && typeof bHigh === 'string' && bHigh.startsWith('http')) {
                    return { url: bHigh, quality: 'HD', jidUsed: jid };
                }
            } catch {}

            // 2. Native Baileys profilePictureUrl (Preview)
            try {
                const bPrev = await Promise.race([
                    s.profilePictureUrl(jid, 'preview').catch(() => null),
                    new Promise(r => setTimeout(() => r(null), 2500))
                ]);
                if (bPrev && typeof bPrev === 'string' && bPrev.startsWith('http')) {
                    return { url: bPrev, quality: 'Standard', jidUsed: jid };
                }
            } catch {}

            // 3. Fallback: Raw IQ query HD
            const hdUrl = await queryRawProfilePic(s, jid, 'image', 2500);
            if (hdUrl) return { url: hdUrl, quality: 'HD', jidUsed: jid };

            // 4. Fallback: Raw IQ query Preview
            const prevUrl = await queryRawProfilePic(s, jid, 'preview', 2000);
            if (prevUrl) return { url: prevUrl, quality: 'Standard', jidUsed: jid };
        }
    }

    return null;
}

/**
 * Fetch profile picture directly as Buffer
 */
async function fetchUserPfpBuffer(sock, jidInput) {
    try {
        const res = await getProfilePictureUrl(sock, jidInput);
        if (!res || !res.url) {
            console.log('[fetchUserPfpBuffer] No DP URL found for:', jidInput);
            return null;
        }

        console.log(`[fetchUserPfpBuffer] Downloading DP (${res.quality}) for ${res.jidUsed}...`);

        const response = await axios.get(res.url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        if (response.data && response.data.length > 0) {
            const buf = Buffer.from(response.data);
            console.log(`[fetchUserPfpBuffer] Successfully downloaded DP (${buf.length} bytes)!`);
            return buf;
        }
    } catch (e) {
        console.error('[fetchUserPfpBuffer Error]:', e.message);
    }
    return null;
}

module.exports = {
    getProfilePictureUrl,
    fetchUserPfpBuffer,
    resolveLidFast,
    queryRawProfilePic
};
