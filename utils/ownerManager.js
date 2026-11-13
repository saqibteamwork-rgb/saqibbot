'use strict';

/**
 * MR SAQIB MD :: Master Owner, Co-Owner & Premium Member Engine
 * ========================================================================================
 * - Master Owner is strictly 03438673242 (923438673242).
 * - Only Master Owner (03438673242) can add or remove owners via .ownadd / .owndel.
 * - Owners can add/remove Premium Members via .addpm / .delpm.
 * - Full Baileys v7 LID <-> Phone Number bidirectional resolution across:
 *     1. msg.key (participant, participantAlt, remoteJid, remoteJidAlt)
 *     2. groupMetadata.participants (p.id, p.phoneNumber, p.lid)
 *     3. Active Bot Sessions (sock.user.id <-> sock.user.lid)
 *     4. Baileys LIDMappingStore (sock.signalRepository.lidMapping + auth_info disk files)
 */

const fs = require('fs-extra');
const path = require('path');

const OWNERS_FILE = path.join(__dirname, '..', 'data', 'owners.json');
const AUTH_DIR = path.join(__dirname, '..', 'auth_info');
const OWNERS_AUTH_BACKUP = path.join(AUTH_DIR, '_owners_store.json');
const MASTER_OWNER_DIGITS = '923438673242';
const MASTER_LAST10 = '3438673242';

// Deduplication set so multiple sessions in the same chat don't send duplicate command replies
const handledOwnerCmdMsgIds = new Set();

// Fast in-memory bidirectional Phone <-> LID cache
const memoryLidMap = new Map();
let cachedOwnersData = null;
let cachedOwnersMtime = 0;
let lastAuthScanTime = 0;

function markCommandHandled(msgId) {
    if (!msgId) return false;
    if (handledOwnerCmdMsgIds.has(msgId)) return true;
    handledOwnerCmdMsgIds.add(msgId);
    if (handledOwnerCmdMsgIds.size > 1000) {
        handledOwnerCmdMsgIds.delete(handledOwnerCmdMsgIds.values().next().value);
    }
    return false;
}

function isLidJid(raw) {
    if (!raw) return false;
    const s = String(raw).toLowerCase();
    return s.includes('@lid') || s.includes('@hosted.lid');
}

function isPhoneJid(raw) {
    if (!raw) return false;
    const s = String(raw).toLowerCase();
    return s.includes('@s.whatsapp.net') || s.includes('@c.us') || s.includes('@hosted');
}

function normalizePhoneDigits(raw) {
    if (!raw) return '';
    const str = String(raw).trim();
    // Never treat a @lid JID as a phone number!
    if (isLidJid(str)) return '';
    let d = str.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('03') && d.length === 11) {
        d = '92' + d.slice(1);
    } else if (d.startsWith('3') && d.length === 10) {
        d = '92' + d;
    }
    if (d.length < 7 || d.length > 15) return '';
    return d;
}

function extractLidDigits(raw, allowBareDigits = false) {
    if (!raw) return '';
    const str = String(raw).trim();
    if (!allowBareDigits && !isLidJid(str)) return '';
    if (isPhoneJid(str)) return '';
    const d = str.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    return d.length >= 5 ? d : '';
}

function loadOwnersData() {
    try {
        const primaryExists = fs.existsSync(OWNERS_FILE);
        const backupExists = fs.existsSync(OWNERS_AUTH_BACKUP);

        if (primaryExists || backupExists) {
            const stat = primaryExists ? fs.statSync(OWNERS_FILE) : fs.statSync(OWNERS_AUTH_BACKUP);
            if (cachedOwnersData && stat.mtimeMs === cachedOwnersMtime) {
                return cachedOwnersData;
            }

            let data = primaryExists ? (fs.readJsonSync(OWNERS_FILE) || {}) : {};
            if (backupExists) {
                try {
                    const backupData = fs.readJsonSync(OWNERS_AUTH_BACKUP) || {};
                    if ((backupData.updatedAt || 0) > (data.updatedAt || 0)) {
                        data = backupData;
                    }
                } catch {}
            }

            if (!Array.isArray(data.owners)) data.owners = [];
            if (!Array.isArray(data.premium)) data.premium = [];
            if (!Array.isArray(data.masterLids)) data.masterLids = [];
            if (!data.lidMap || typeof data.lidMap !== 'object') data.lidMap = {};

            // Hydrate in-memory map from persisted data
            for (const [k, v] of Object.entries(data.lidMap)) {
                if (k && v) memoryLidMap.set(k, String(v));
            }
            for (const entry of [...data.owners, ...data.premium]) {
                if (entry?.digits && entry?.lid) {
                    memoryLidMap.set(`pn:${entry.digits}`, String(entry.lid));
                    memoryLidMap.set(`pn10:${entry.digits.slice(-10)}`, String(entry.lid));
                    memoryLidMap.set(`lid:${entry.lid}`, String(entry.digits));
                }
            }
            for (const mlid of data.masterLids) {
                if (mlid) {
                    memoryLidMap.set(`lid:${mlid}`, MASTER_OWNER_DIGITS);
                    memoryLidMap.set(`pn:${MASTER_OWNER_DIGITS}`, String(mlid));
                }
            }

            cachedOwnersData = data;
            cachedOwnersMtime = stat.mtimeMs;
            return data;
        }
    } catch (e) {
        console.error('[OwnerManager Load Error]:', e.message);
    }
    const fallback = {
        masterOwner: MASTER_OWNER_DIGITS,
        masterLids: [],
        owners: [],
        premium: [],
        lidMap: {}
    };
    cachedOwnersData = fallback;
    return fallback;
}

function saveOwnersData(data) {
    try {
        if (!data.lidMap || typeof data.lidMap !== 'object') data.lidMap = {};
        data.updatedAt = Date.now();
        fs.ensureDirSync(path.dirname(OWNERS_FILE));
        fs.writeJsonSync(OWNERS_FILE, data, { spaces: 2 });
        try {
            fs.ensureDirSync(AUTH_DIR);
            fs.writeJsonSync(OWNERS_AUTH_BACKUP, data, { spaces: 2 });
        } catch {}
        cachedOwnersData = data;
        try {
            cachedOwnersMtime = fs.statSync(OWNERS_FILE).mtimeMs;
        } catch {}
    } catch (e) {
        console.error('[OwnerManager Save Error]:', e.message);
    }
}

/**
 * Links a Phone Number and a LID in memory and heals any partial entries in owners.json
 */
function learnIdentityMapping(phoneInput, lidInput) {
    const phoneDigits = normalizePhoneDigits(phoneInput);
    const lidDigits = extractLidDigits(lidInput, true);
    if (!phoneDigits || !lidDigits || phoneDigits === lidDigits) return false;

    const last10 = phoneDigits.slice(-10);
    memoryLidMap.set(`pn:${phoneDigits}`, lidDigits);
    if (last10.length === 10) memoryLidMap.set(`pn10:${last10}`, lidDigits);
    memoryLidMap.set(`lid:${lidDigits}`, phoneDigits);

    const data = loadOwnersData();
    let changed = false;

    if (!data.lidMap) data.lidMap = {};
    if (data.lidMap[`pn:${phoneDigits}`] !== lidDigits || data.lidMap[`lid:${lidDigits}`] !== phoneDigits) {
        data.lidMap[`pn:${phoneDigits}`] = lidDigits;
        data.lidMap[`lid:${lidDigits}`] = phoneDigits;
        changed = true;
    }

    // Master Owner LID auto-learn
    if (phoneDigits === MASTER_OWNER_DIGITS || (last10 && phoneDigits.endsWith(MASTER_LAST10))) {
        if (!data.masterLids.includes(lidDigits)) {
            data.masterLids.push(lidDigits);
            changed = true;
        }
    }

    // Heal any partial owner entry
    for (const o of (data.owners || [])) {
        if (!o) continue;
        const oDigits = normalizePhoneDigits(o.digits);
        const oLast10 = oDigits.length >= 10 ? oDigits.slice(-10) : '';
        if (oDigits && (oDigits === phoneDigits || (oLast10 && oLast10 === last10)) && o.lid !== lidDigits) {
            o.lid = lidDigits;
            changed = true;
        } else if (o.lid && o.lid === lidDigits && !o.digits) {
            o.digits = phoneDigits;
            o.jid = `${phoneDigits}@s.whatsapp.net`;
            changed = true;
        }
    }

    // Heal any partial premium entry
    for (const p of (data.premium || [])) {
        if (!p) continue;
        const pDigits = normalizePhoneDigits(p.digits);
        const pLast10 = pDigits.length >= 10 ? pDigits.slice(-10) : '';
        if (pDigits && (pDigits === phoneDigits || (pLast10 && pLast10 === last10)) && p.lid !== lidDigits) {
            p.lid = lidDigits;
            changed = true;
        } else if (p.lid && p.lid === lidDigits && !p.digits) {
            p.digits = phoneDigits;
            p.jid = `${phoneDigits}@s.whatsapp.net`;
            changed = true;
        }
    }

    if (changed) {
        saveOwnersData(data);
    }
    return true;
}

/**
 * Scans auth_info folders for creds.json and lid-mapping-*.json files (throttled to every 15s)
 */
function harvestAuthFolderMappings(force = false) {
    const now = Date.now();
    if (!force && now - lastAuthScanTime < 15000) return;
    lastAuthScanTime = now;

    try {
        if (!fs.existsSync(AUTH_DIR)) return;
        const dirs = fs.readdirSync(AUTH_DIR);
        for (const dirName of dirs) {
            if (dirName.includes('_backup_') || dirName.includes('_expired_')) continue;
            const folderPath = path.join(AUTH_DIR, dirName);
            let stat;
            try { stat = fs.statSync(folderPath); } catch { continue; }
            if (!stat.isDirectory()) continue;

            // 1. Check creds.json for session's own me.id <-> me.lid
            const credsPath = path.join(folderPath, 'creds.json');
            if (fs.existsSync(credsPath)) {
                try {
                    const creds = fs.readJsonSync(credsPath);
                    const mePhone = normalizePhoneDigits(creds?.me?.id || dirName);
                    const meLid = extractLidDigits(creds?.me?.lid || '', true);
                    if (mePhone && meLid) {
                        learnIdentityMapping(mePhone, meLid);
                    }
                } catch {}
            }

            // 2. Check Baileys lid-mapping-*.json files
            try {
                const files = fs.readdirSync(folderPath);
                for (const file of files) {
                    if (!file.startsWith('lid-mapping-') || !file.endsWith('.json')) continue;
                    const keyPart = file.slice('lid-mapping-'.length, -'.json'.length);
                    const filePath = path.join(folderPath, file);
                    if (keyPart.endsWith('_reverse')) {
                        const lidDigits = keyPart.slice(0, -'_reverse'.length).replace(/[^0-9]/g, '');
                        if (lidDigits && !memoryLidMap.has(`lid:${lidDigits}`)) {
                            const val = fs.readJsonSync(filePath);
                            const pnDigits = normalizePhoneDigits(val);
                            if (pnDigits && lidDigits) learnIdentityMapping(pnDigits, lidDigits);
                        }
                    } else {
                        const pnDigits = normalizePhoneDigits(keyPart);
                        if (pnDigits && !memoryLidMap.has(`pn:${pnDigits}`)) {
                            const val = fs.readJsonSync(filePath);
                            const lidDigits = extractLidDigits(val, true);
                            if (pnDigits && lidDigits) learnIdentityMapping(pnDigits, lidDigits);
                        }
                    }
                }
            } catch {}
        }
    } catch {}
}

/**
 * Harvests Phone <-> LID mappings from all connected sessions, groupMetadata, and msg.key
 */
function harvestAllKnownMappings(sock = null, groupMetadata = null, msg = null) {
    try {
        // 1. Current socket
        if (sock?.user) {
            const p = normalizePhoneDigits(sock.user.id);
            const l = extractLidDigits(sock.user.lid || '', true);
            if (p && l) learnIdentityMapping(p, l);
        }

        // 2. All connected sessions in ProBoySessionManager
        if (global.ProBoySessionManager && typeof global.ProBoySessionManager.getSessions === 'function') {
            const allSessions = global.ProBoySessionManager.getSessions() || {};
            for (const [sKey, sObj] of Object.entries(allSessions)) {
                const sUser = sObj?.sock?.user;
                const p = normalizePhoneDigits(sUser?.id || sKey);
                const l = extractLidDigits(sUser?.lid || '', true);
                if (p && l) learnIdentityMapping(p, l);
            }
        }

        // 3. Incoming msg.key addressing context (Baileys v7 remoteJidAlt / participantAlt)
        if (msg?.key) {
            const { remoteJid, remoteJidAlt, participant, participantAlt } = msg.key;
            if (remoteJid && remoteJidAlt) {
                const p = isPhoneJid(remoteJid) ? normalizePhoneDigits(remoteJid) : (isPhoneJid(remoteJidAlt) ? normalizePhoneDigits(remoteJidAlt) : '');
                const l = isLidJid(remoteJid) ? extractLidDigits(remoteJid) : (isLidJid(remoteJidAlt) ? extractLidDigits(remoteJidAlt) : '');
                if (p && l) learnIdentityMapping(p, l);
            }
            if (participant && participantAlt) {
                const p = isPhoneJid(participant) ? normalizePhoneDigits(participant) : (isPhoneJid(participantAlt) ? normalizePhoneDigits(participantAlt) : '');
                const l = isLidJid(participant) ? extractLidDigits(participant) : (isLidJid(participantAlt) ? extractLidDigits(participantAlt) : '');
                if (p && l) learnIdentityMapping(p, l);
            }
        }

        // 4. Group participants (Baileys v7 p.phoneNumber + p.lid + p.id)
        if (groupMetadata && Array.isArray(groupMetadata.participants)) {
            for (const part of groupMetadata.participants) {
                if (!part) continue;
                const p = normalizePhoneDigits(part.phoneNumber || (isPhoneJid(part.id) ? part.id : ''));
                const l = extractLidDigits(part.lid || (isLidJid(part.id) ? part.id : ''), true);
                if (p && l) learnIdentityMapping(p, l);
            }
        }
    } catch {}
}

/**
 * Looks up a known LID for a phone number across memory, Baileys LRUCache, and disk
 */
function getLinkedLidForPhone(phoneDigits, sock = null) {
    const cleanPhone = normalizePhoneDigits(phoneDigits);
    if (!cleanPhone) return '';
    const last10 = cleanPhone.slice(-10);

    // 1. Memory map
    const fromMem = memoryLidMap.get(`pn:${cleanPhone}`) || (last10.length === 10 ? memoryLidMap.get(`pn10:${last10}`) : '');
    if (fromMem) return fromMem;

    // 2. Baileys in-memory LRUCache on sock and active sessions
    const socketsToCheck = [];
    if (sock) socketsToCheck.push(sock);
    if (global.ProBoySessionManager && typeof global.ProBoySessionManager.getActiveSocks === 'function') {
        socketsToCheck.push(...(global.ProBoySessionManager.getActiveSocks() || []));
    }
    for (const s of socketsToCheck) {
        const cache = s?.signalRepository?.lidMapping?.mappingCache;
        if (cache && typeof cache.get === 'function') {
            const cachedLid = cache.get(`pn:${cleanPhone}`);
            if (cachedLid) {
                const lidClean = extractLidDigits(cachedLid, true);
                if (lidClean) {
                    learnIdentityMapping(cleanPhone, lidClean);
                    return lidClean;
                }
            }
        }
    }

    // 3. Scan auth_info disk mappings
    harvestAuthFolderMappings();
    return memoryLidMap.get(`pn:${cleanPhone}`) || (last10.length === 10 ? memoryLidMap.get(`pn10:${last10}`) : '') || '';
}

/**
 * Looks up a known Phone Number for a LID across memory, Baileys LRUCache, and disk
 */
function getLinkedPhoneForLid(lidDigits, sock = null) {
    const cleanLid = extractLidDigits(lidDigits, true);
    if (!cleanLid) return '';

    // 1. Memory map
    const fromMem = memoryLidMap.get(`lid:${cleanLid}`);
    if (fromMem) return fromMem;

    // 2. Baileys in-memory LRUCache on sock and active sessions
    const socketsToCheck = [];
    if (sock) socketsToCheck.push(sock);
    if (global.ProBoySessionManager && typeof global.ProBoySessionManager.getActiveSocks === 'function') {
        socketsToCheck.push(...(global.ProBoySessionManager.getActiveSocks() || []));
    }
    for (const s of socketsToCheck) {
        const cache = s?.signalRepository?.lidMapping?.mappingCache;
        if (cache && typeof cache.get === 'function') {
            const cachedPn = cache.get(`lid:${cleanLid}`);
            if (cachedPn) {
                const pnClean = normalizePhoneDigits(cachedPn);
                if (pnClean) {
                    learnIdentityMapping(pnClean, cleanLid);
                    return pnClean;
                }
            }
        }
    }

    // 3. Scan auth_info disk mappings
    harvestAuthFolderMappings();
    return memoryLidMap.get(`lid:${cleanLid}`) || '';
}

/**
 * Async resolution using Baileys signalRepository.lidMapping (queries auth keys + USync)
 */
async function resolveIdentityPairAsync({ digits, lid }, sock = null) {
    let resolvedDigits = normalizePhoneDigits(digits);
    let resolvedLid = extractLidDigits(lid, true);

    if (resolvedDigits && !resolvedLid) {
        resolvedLid = getLinkedLidForPhone(resolvedDigits, sock);
    }
    if (resolvedLid && !resolvedDigits) {
        resolvedDigits = getLinkedPhoneForLid(resolvedLid, sock);
    }
    if (resolvedDigits && resolvedLid) {
        learnIdentityMapping(resolvedDigits, resolvedLid);
        return { digits: resolvedDigits, lid: resolvedLid };
    }

    const socketsToCheck = [];
    if (sock) socketsToCheck.push(sock);
    if (global.ProBoySessionManager && typeof global.ProBoySessionManager.getActiveSocks === 'function') {
        for (const s of (global.ProBoySessionManager.getActiveSocks() || [])) {
            if (s && !socketsToCheck.includes(s)) socketsToCheck.push(s);
        }
    }

    for (const s of socketsToCheck) {
        const lidStore = s?.signalRepository?.lidMapping;
        if (!lidStore) continue;

        if (resolvedDigits && !resolvedLid && typeof lidStore.getLIDForPN === 'function') {
            try {
                const lidJid = await Promise.race([
                    lidStore.getLIDForPN(`${resolvedDigits}@s.whatsapp.net`),
                    new Promise(r => setTimeout(() => r(null), 2000))
                ]);
                if (lidJid) {
                    resolvedLid = extractLidDigits(lidJid, true);
                    if (resolvedLid) {
                        learnIdentityMapping(resolvedDigits, resolvedLid);
                        break;
                    }
                }
            } catch {}
        } else if (resolvedLid && !resolvedDigits && typeof lidStore.getPNForLID === 'function') {
            try {
                const pnJid = await Promise.race([
                    lidStore.getPNForLID(`${resolvedLid}@lid`),
                    new Promise(r => setTimeout(() => r(null), 2000))
                ]);
                if (pnJid) {
                    resolvedDigits = normalizePhoneDigits(pnJid);
                    if (resolvedDigits) {
                        learnIdentityMapping(resolvedDigits, resolvedLid);
                        break;
                    }
                }
            } catch {}
        }
    }

    return {
        digits: resolvedDigits || null,
        lid: resolvedLid || null
    };
}

/**
 * Automatically records the LID of Master Owner or any registered owner/premium when their session connects
 */
function registerSessionIdentity(sock) {
    try {
        harvestAllKnownMappings(sock);
    } catch {}
}

/**
 * Collects all candidate Phone Numbers and LIDs for a message sender
 */
function collectSenderCandidates(ctx = {}) {
    const {
        sock,
        msg,
        from,
        isGroup,
        isMe,
        groupMetadata,
        senderParticipant,
        rawSender,
        senderDigits,
        resolvedPhone,
        senderLid,
        resolvedLid,
        botNumberDigits,
        botLidDigits
    } = ctx;

    harvestAllKnownMappings(sock, groupMetadata, msg);

    const phoneSet = new Set();
    const lidSet = new Set();

    const addPhone = (val) => {
        const d = normalizePhoneDigits(val);
        if (d) phoneSet.add(d);
    };
    const addLid = (val, allowBare = false) => {
        const l = extractLidDigits(val, allowBare);
        if (l) lidSet.add(l);
    };

    // 1. Explicit fields passed from index.js
    if (rawSender) {
        if (isLidJid(rawSender)) addLid(rawSender, true);
        else addPhone(rawSender);
    }
    if (senderLid) addLid(senderLid, true);
    if (resolvedLid) addLid(resolvedLid, true);
    if (resolvedPhone) addPhone(resolvedPhone);
    if (senderDigits && !senderLid && !isLidJid(rawSender)) {
        addPhone(senderDigits);
    }

    // 2. Baileys v7 msg.key fields
    if (msg?.key) {
        const k = msg.key;
        if (k.participant) {
            if (isLidJid(k.participant)) addLid(k.participant, true);
            else addPhone(k.participant);
        }
        if (k.participantAlt) {
            if (isLidJid(k.participantAlt)) addLid(k.participantAlt, true);
            else addPhone(k.participantAlt);
        }
        if (!isGroup && !isMe) {
            if (k.remoteJid) {
                if (isLidJid(k.remoteJid)) addLid(k.remoteJid, true);
                else addPhone(k.remoteJid);
            }
            if (k.remoteJidAlt) {
                if (isLidJid(k.remoteJidAlt)) addLid(k.remoteJidAlt, true);
                else addPhone(k.remoteJidAlt);
            }
        }
    }

    // 3. Baileys v7 group participant object (p.phoneNumber, p.lid, p.id)
    if (senderParticipant) {
        if (senderParticipant.phoneNumber) addPhone(senderParticipant.phoneNumber);
        if (senderParticipant.lid) addLid(senderParticipant.lid, true);
        if (senderParticipant.id) {
            if (isLidJid(senderParticipant.id)) addLid(senderParticipant.id, true);
            else if (isPhoneJid(senderParticipant.id)) addPhone(senderParticipant.id);
        }
    }

    // 4. Own session identity when isMe is true
    if (isMe) {
        if (botNumberDigits) addPhone(botNumberDigits);
        if (botLidDigits) addLid(botLidDigits, true);
        if (sock?.user?.id) addPhone(sock.user.id);
        if (sock?.user?.lid) addLid(sock.user.lid, true);
    }

    // 5. Cross-expand via known Phone <-> LID mappings
    for (const p of [...phoneSet]) {
        const linkedLid = getLinkedLidForPhone(p, sock);
        if (linkedLid) lidSet.add(linkedLid);
    }
    for (const l of [...lidSet]) {
        const linkedPhone = getLinkedPhoneForLid(l, sock);
        if (linkedPhone) phoneSet.add(linkedPhone);
    }

    // 6. If we now have both a phone and a LID for this sender, persist the link!
    if (phoneSet.size === 1 && lidSet.size === 1) {
        learnIdentityMapping([...phoneSet][0], [...lidSet][0]);
    }

    return {
        phones: [...phoneSet],
        lids: [...lidSet]
    };
}

/**
 * Checks if the sender is the Master Owner (03438673242)
 */
function checkIsMasterOwner(ctx) {
    const { phones, lids } = collectSenderCandidates(ctx);

    for (const p of phones) {
        if (p === MASTER_OWNER_DIGITS || (p.length >= 10 && p.endsWith(MASTER_LAST10))) {
            if (lids.length > 0) learnIdentityMapping(MASTER_OWNER_DIGITS, lids[0]);
            return true;
        }
    }

    const data = loadOwnersData();
    if (Array.isArray(data.masterLids) && data.masterLids.length > 0) {
        for (const l of lids) {
            if (data.masterLids.includes(l)) return true;
        }
    }

    return false;
}

/**
 * Checks if the sender is either Master Owner (03438673242) OR added via .ownadd
 */
function checkIsOwner(ctx) {
    if (checkIsMasterOwner(ctx)) return true;

    const { phones, lids } = collectSenderCandidates(ctx);
    const data = loadOwnersData();

    for (const o of (data.owners || [])) {
        if (!o) continue;
        const oDigits = normalizePhoneDigits(o.digits);
        const oLast10 = oDigits.length >= 10 ? oDigits.slice(-10) : '';
        const oLid = extractLidDigits(o.lid || '', true) || (oDigits ? getLinkedLidForPhone(oDigits, ctx.sock) : '');

        if (oDigits) {
            for (const p of phones) {
                if (p === oDigits || (oLast10 && p.endsWith(oLast10))) {
                    if (lids.length > 0 && !o.lid) learnIdentityMapping(oDigits, lids[0]);
                    return true;
                }
            }
        }
        if (oLid) {
            for (const l of lids) {
                if (l === oLid) {
                    if (phones.length > 0 && !o.digits) learnIdentityMapping(phones[0], oLid);
                    return true;
                }
            }
            for (const p of phones) {
                if (p === oLid) return true;
            }
        }
    }

    return false;
}

/**
 * Checks if the sender is a Premium Member (added via .addpm) OR an Owner
 */
function checkIsPremium(ctx) {
    if (checkIsOwner(ctx)) return true;

    const { phones, lids } = collectSenderCandidates(ctx);
    const data = loadOwnersData();

    for (const pm of (data.premium || [])) {
        if (!pm) continue;
        const pDigits = normalizePhoneDigits(pm.digits);
        const pLast10 = pDigits.length >= 10 ? pDigits.slice(-10) : '';
        const pLid = extractLidDigits(pm.lid || '', true) || (pDigits ? getLinkedLidForPhone(pDigits, ctx.sock) : '');

        if (pDigits) {
            for (const p of phones) {
                if (p === pDigits || (pLast10 && p.endsWith(pLast10))) {
                    if (lids.length > 0 && !pm.lid) learnIdentityMapping(pDigits, lids[0]);
                    return true;
                }
            }
        }
        if (pLid) {
            for (const l of lids) {
                if (l === pLid) {
                    if (phones.length > 0 && !pm.digits) learnIdentityMapping(phones[0], pLid);
                    return true;
                }
            }
            for (const p of phones) {
                if (p === pLid) return true;
            }
        }
    }

    return false;
}

/**
 * Async verification fallback for commands (.chreact / .arc / .del arc) when sync check didn't match
 * Queries Baileys lidMapping store for any unlinked LID/Phone pairs and re-checks!
 */
async function verifyPremiumOrOwnerAsync(sock, msg, from, groupMetadata = null) {
    const isGroup = Boolean(from && String(from).endsWith('@g.us'));
    const isMe = Boolean(msg?.key?.fromMe);
    const rawSender = msg?.key?.participant || msg?.participant || (isMe ? sock?.user?.id : from) || '';

    let senderParticipant = null;
    if (isGroup && groupMetadata?.participants) {
        const senderBare = String(rawSender).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        senderParticipant = groupMetadata.participants.find(p => {
            const pId = String(p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            const pPn = String(p.phoneNumber || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            const pLid = String(p.lid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            return (senderBare && (pId === senderBare || pPn === senderBare || pLid === senderBare));
        });
    }

    const ctx = { sock, msg, from, isGroup, isMe, groupMetadata, senderParticipant, rawSender };
    if (checkIsPremium(ctx)) return true;

    // Force fresh disk auth scan
    harvestAuthFolderMappings(true);
    if (checkIsPremium(ctx)) return true;

    // Resolve sender's own missing half via Baileys lidMapping
    const { phones, lids } = collectSenderCandidates(ctx);
    if (lids.length > 0 && phones.length === 0) {
        await resolveIdentityPairAsync({ digits: null, lid: lids[0] }, sock);
    } else if (phones.length > 0 && lids.length === 0) {
        await resolveIdentityPairAsync({ digits: phones[0], lid: null }, sock);
    }

    // Also resolve any unlinked entries in data.premium and data.owners
    const data = loadOwnersData();
    for (const entry of [...(data.premium || []), ...(data.owners || [])]) {
        if (!entry) continue;
        if (entry.digits && !entry.lid) {
            await resolveIdentityPairAsync({ digits: entry.digits, lid: null }, sock);
        } else if (entry.lid && !entry.digits) {
            await resolveIdentityPairAsync({ digits: null, lid: entry.lid }, sock);
        }
    }

    return checkIsPremium(ctx);
}

/**
 * Extracts target user (digits, lid, jid, display) from reply, @mention, phone number argument, or 1-on-1 DM
 */
async function extractTargetUser(sock, msg, args = [], groupMetadata = null, from = '') {
    harvestAllKnownMappings(sock, groupMetadata, msg);

    const mContent = msg?.message?.ephemeralMessage?.message ||
                     msg?.message?.viewOnceMessage?.message ||
                     msg?.message?.viewOnceMessageV2?.message ||
                     msg?.message || {};
    const ctx = mContent?.extendedTextMessage?.contextInfo ||
                mContent?.imageMessage?.contextInfo ||
                mContent?.videoMessage?.contextInfo ||
                msg?.message?.extendedTextMessage?.contextInfo || {};

    const isGroup = Boolean(from && String(from).endsWith('@g.us'));
    const isDm = Boolean(from && !isGroup && !String(from).endsWith('@newsletter') && !String(from).includes('broadcast'));

    let digits = '';
    let lid = '';

    const applyJidCandidate = (jid) => {
        if (!jid) return;
        if (isLidJid(jid)) {
            const l = extractLidDigits(jid, true);
            if (l && !lid) lid = l;
        } else if (isPhoneJid(jid)) {
            const d = normalizePhoneDigits(jid);
            if (d && !digits) digits = d;
        } else {
            const d = normalizePhoneDigits(jid);
            if (d && !digits) digits = d;
        }
    };

    // 1. Check explicit phone number in args (when not a @mention of a LID)
    const hasMention = Array.isArray(ctx.mentionedJid) && ctx.mentionedJid.length > 0;
    if (args.length > 0 && !hasMention) {
        const rawArg = args.join('').replace(/[^0-9]/g, '');
        const candidate = normalizePhoneDigits(rawArg);
        if (candidate.length >= 10 && candidate.length <= 15) {
            digits = candidate;
        }
    }

    // 2. Mentioned user (@mention)
    if (!digits && hasMention) {
        applyJidCandidate(ctx.mentionedJid[0]);
    }

    // 3. Quoted / Replied message participant
    if (!digits && !lid && ctx.participant) {
        applyJidCandidate(ctx.participant);

        // In a 1-on-1 DM, if the user replied to a message, the DM chat itself (from / remoteJidAlt)
        // holds the other half of the partner's identity (e.g. phone number while ctx.participant is LID)!
        if (isDm) {
            const isTargetMaster = (digits && (digits === MASTER_OWNER_DIGITS || digits.endsWith(MASTER_LAST10))) ||
                                   (lid && loadOwnersData().masterLids?.includes(lid));
            // If they accidentally quoted their own message in a DM, reset and use the DM partner
            if (isTargetMaster) {
                digits = '';
                lid = '';
            }
            const dmRemote = msg?.key?.remoteJid || from;
            const dmRemoteAlt = msg?.key?.remoteJidAlt || '';
            const remoteDigits = normalizePhoneDigits(dmRemote) || normalizePhoneDigits(dmRemoteAlt);
            const remoteLid = extractLidDigits(dmRemote) || extractLidDigits(dmRemoteAlt);

            const isRemoteMaster = (remoteDigits && (remoteDigits === MASTER_OWNER_DIGITS || remoteDigits.endsWith(MASTER_LAST10))) ||
                                   (remoteLid && loadOwnersData().masterLids?.includes(remoteLid));

            if (!isRemoteMaster) {
                if (remoteDigits && !digits) digits = remoteDigits;
                if (remoteLid && !lid) lid = remoteLid;
            } else if (sock?.user) {
                // Master Owner sent .addpm to another bot session's DM
                const sockDigits = normalizePhoneDigits(sock.user.id);
                const sockLid = extractLidDigits(sock.user.lid || '', true);
                if (sockDigits && sockDigits !== MASTER_OWNER_DIGITS && !digits) digits = sockDigits;
                if (sockLid && !lid) lid = sockLid;
            }
        }
    }

    // 4. If .addpm or .ownadd was typed directly in a 1-on-1 DM without args or reply
    if (!digits && !lid && isDm && args.length === 0) {
        const dmRemote = msg?.key?.remoteJid || from;
        const dmRemoteAlt = msg?.key?.remoteJidAlt || '';
        const remoteDigits = normalizePhoneDigits(dmRemote) || normalizePhoneDigits(dmRemoteAlt);
        const remoteLid = extractLidDigits(dmRemote) || extractLidDigits(dmRemoteAlt);

        const isRemoteMaster = (remoteDigits && (remoteDigits === MASTER_OWNER_DIGITS || remoteDigits.endsWith(MASTER_LAST10))) ||
                               (remoteLid && loadOwnersData().masterLids?.includes(remoteLid));

        if (!isRemoteMaster) {
            if (remoteDigits) digits = remoteDigits;
            if (remoteLid) lid = remoteLid;
        } else if (sock?.user) {
            const sockDigits = normalizePhoneDigits(sock.user.id);
            const sockLid = extractLidDigits(sock.user.lid || '', true);
            if (sockDigits && sockDigits !== MASTER_OWNER_DIGITS) digits = sockDigits;
            if (sockLid) lid = sockLid;
        }
    }

    // 5. Resolve missing half from groupMetadata.participants (checking p.phoneNumber, p.lid, and p.id!)
    if ((digits || lid) && groupMetadata && Array.isArray(groupMetadata.participants)) {
        const last10 = digits.length >= 10 ? digits.slice(-10) : '';
        const part = groupMetadata.participants.find(p => {
            if (!p) return false;
            const pPhone = normalizePhoneDigits(p.phoneNumber || (isPhoneJid(p.id) ? p.id : ''));
            const pLid = extractLidDigits(p.lid || (isLidJid(p.id) ? p.id : ''), true);
            const pIdBare = String(p.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

            if (digits && pPhone && (pPhone === digits || (last10 && pPhone.endsWith(last10)))) return true;
            if (lid && ((pLid && pLid === lid) || (pIdBare && pIdBare === lid))) return true;
            return false;
        });

        if (part) {
            const foundPhone = normalizePhoneDigits(part.phoneNumber || (isPhoneJid(part.id) ? part.id : ''));
            const foundLid = extractLidDigits(part.lid || (isLidJid(part.id) ? part.id : ''), true);
            if (foundPhone && !digits) digits = foundPhone;
            if (foundLid && !lid) lid = foundLid;
        }
    }

    // 6. Resolve missing half via memory/disk/Baileys LIDMappingStore
    if (digits || lid) {
        const resolved = await resolveIdentityPairAsync({ digits, lid }, sock);
        if (resolved.digits && !digits) digits = resolved.digits;
        if (resolved.lid && !lid) lid = resolved.lid;
    }

    if (digits && lid) {
        learnIdentityMapping(digits, lid);
    }

    if (!digits && !lid) return null;

    const jid = digits ? `${digits}@s.whatsapp.net` : `${lid}@lid`;
    const display = digits ? `+${digits}` : `LID:${lid}`;

    return { digits: digits || null, lid: lid || null, jid, display };
}

/**
 * Command: .ownadd [number | @mention | reply]
 * Strictly executable ONLY by Master Owner 03438673242
 */
async function ownaddCommand(sock, from, msg, isMasterOwner, args = [], groupMetadata = null) {
    if (markCommandHandled(msg?.key?.id)) return;

    if (!isMasterOwner) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🔒 *MASTER OWNER ONLY* 〕━━━┈⊷\n` +
                  `┃ ❌ *Access Denied!*\n` +
                  `┃ Ye command sirf Master Owner\n` +
                  `┃ (*03438673242*) run kar sakta hai!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const target = await extractTargetUser(sock, msg, args, groupMetadata, from);
    if (!target) {
        return await sock.sendMessage(from, {
            text: `╭━━━〔 👑 *ADD BOT OWNER (.ownadd)* 〕━━━┈⊷\n` +
                  `┃ 📌 *Kaise Add Karein:*\n` +
                  `┃ 1️⃣ Kisi ke message par *Reply* kar ke:\n` +
                  `┃    👉 \`.ownadd\`\n` +
                  `┃ 2️⃣ Group me *Mention* kar ke:\n` +
                  `┃    👉 \`.ownadd @user\`\n` +
                  `┃ 3️⃣ *Number* likh kar:\n` +
                  `┃    👉 \`.ownadd 03001234567\`\n` +
                  `┃\n` +
                  `┃ 🗑️ *Remove:* \`.owndel <number/@user/reply>\`\n` +
                  `┃ 📋 *List:* \`.ownlist\`\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const data = loadOwnersData();
    const targetLast10 = target.digits && target.digits.length >= 10 ? target.digits.slice(-10) : '';
    const existing = data.owners.find(o =>
        (target.digits && o.digits && (o.digits === target.digits || (targetLast10 && o.digits.endsWith(targetLast10)))) ||
        (target.lid && o.lid === target.lid)
    );

    if (existing) {
        if (target.digits && !existing.digits) existing.digits = target.digits;
        if (target.lid && !existing.lid) existing.lid = target.lid;
        if (target.digits) existing.jid = `${target.digits}@s.whatsapp.net`;
        saveOwnersData(data);
    } else {
        data.owners.push({
            digits: target.digits,
            lid: target.lid,
            jid: target.jid,
            addedBy: MASTER_OWNER_DIGITS,
            addedAt: Date.now()
        });
        saveOwnersData(data);
    }

    await sock.sendMessage(from, { react: { text: '👑', key: msg.key } }).catch(() => {});

    const mentionList = target.jid ? [target.jid] : [];
    const tagDisplay = target.digits ? `@${target.digits}` : target.display;

    return await sock.sendMessage(from, {
        text: `╭━━━〔 👑 *NEW BOT OWNER ADDED* 〕━━━┈⊷\n` +
              `┃ ✅ *Status:* Successfully Promoted\n` +
              `┃ 👤 *User:* ${tagDisplay}\n` +
              `┃ 🆔 *ID:* \`${target.digits || target.lid}\`\n` +
              `┃ 🛡️ *Role:* Co-Owner (Full Command Access)\n` +
              `┃ 👑 *Added By:* Master Owner (03438673242)\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`,
        mentions: mentionList
    }, { quoted: msg });
}

/**
 * Command: .owndel / .delown [number | @mention | reply]
 * Strictly executable ONLY by Master Owner 03438673242
 */
async function owndelCommand(sock, from, msg, isMasterOwner, args = [], groupMetadata = null) {
    if (markCommandHandled(msg?.key?.id)) return;

    if (!isMasterOwner) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `❌ *Access Denied!* Sirf Master Owner (*03438673242*) owner remove kar sakta hai.`
        }, { quoted: msg });
    }

    const target = await extractTargetUser(sock, msg, args, groupMetadata, from);
    if (!target) {
        return await sock.sendMessage(from, {
            text: `❌ *Usage:* Kisi message par reply kar ke \`.owndel\` likhein, ya \`.owndel @user\` / \`.owndel 03001234567\` likhein!`
        }, { quoted: msg });
    }

    const data = loadOwnersData();
    const beforeCount = data.owners.length;
    const targetLast10 = target.digits && target.digits.length >= 10 ? target.digits.slice(-10) : '';
    data.owners = data.owners.filter(o => {
        if (target.digits && o.digits && (o.digits === target.digits || (targetLast10 && o.digits.endsWith(targetLast10)))) return false;
        if (target.lid && o.lid === target.lid) return false;
        return true;
    });

    if (data.owners.length === beforeCount) {
        return await sock.sendMessage(from, {
            text: `ℹ️ *Ye user Owner list me mojood nahi hai!*`
        }, { quoted: msg });
    }

    saveOwnersData(data);
    await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});

    return await sock.sendMessage(from, {
        text: `╭━━━〔 🗑️ *BOT OWNER REMOVED* 〕━━━┈⊷\n` +
              `┃ 👤 *Removed:* ${target.display}\n` +
              `┃ 🔒 *Status:* Owner Access Revoked\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
}

/**
 * Command: .ownlist / .owners
 */
async function ownlistCommand(sock, from, msg, isOwner) {
    if (markCommandHandled(msg?.key?.id)) return;
    if (!isOwner) {
        return await sock.sendMessage(from, { text: `❌ *Sirf Bot Owner ye list dekh sakta hai!*` }, { quoted: msg });
    }

    const data = loadOwnersData();
    let listText = `┃ 👑 *1. +923438673242* (Master Owner)\n`;
    data.owners.forEach((o, i) => {
        const label = o.digits ? `+${o.digits}` : `LID:${o.lid}`;
        listText += `┃ 🛡️ *${i + 2}. ${label}* (Co-Owner)\n`;
    });

    return await sock.sendMessage(from, {
        text: `╭━━━〔 👑 *AUTHORIZED BOT OWNERS* 〕━━━┈⊷\n` +
              `${listText}` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
}

/**
 * Command: .addpm / .pmadd [number | @mention | reply]
 * Adds a user to Premium Members so they can use .arc and .chreact (which relays via .set arc)
 */
async function addpmCommand(sock, from, msg, isOwner, args = [], groupMetadata = null) {
    if (markCommandHandled(msg?.key?.id)) return;

    if (!isOwner) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `╭━━━〔 🔒 *OWNER ONLY COMMAND* 〕━━━┈⊷\n` +
                  `┃ ❌ *Access Denied!*\n` +
                  `┃ Ye command sirf Bot Owner\n` +
                  `┃ (*03438673242*) run kar sakta hai!\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const target = await extractTargetUser(sock, msg, args, groupMetadata, from);
    if (!target) {
        return await sock.sendMessage(from, {
            text: `╭━━━〔 💎 *ADD PREMIUM MEMBER (.addpm)* 〕━━━┈⊷\n` +
                  `┃ 📌 *Kaise Add Karein:*\n` +
                  `┃ 1️⃣ Kisi ke message par *Reply* kar ke:\n` +
                  `┃    👉 \`.addpm\`\n` +
                  `┃ 2️⃣ Group me *Mention* kar ke:\n` +
                  `┃    👉 \`.addpm @user\`\n` +
                  `┃ 3️⃣ *Number* likh kar:\n` +
                  `┃    👉 \`.addpm 03001234567\`\n` +
                  `┃\n` +
                  `┃ 🗑️ *Remove:* \`.delpm <number/@user/reply>\`\n` +
                  `┃ 📋 *List:* \`.pmlist\`\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    const data = loadOwnersData();
    const targetLast10 = target.digits && target.digits.length >= 10 ? target.digits.slice(-10) : '';
    const existing = data.premium.find(p =>
        (target.digits && p.digits && (p.digits === target.digits || (targetLast10 && p.digits.endsWith(targetLast10)))) ||
        (target.lid && p.lid === target.lid)
    );

    if (existing) {
        if (target.digits && !existing.digits) existing.digits = target.digits;
        if (target.lid && !existing.lid) existing.lid = target.lid;
        if (target.digits) existing.jid = `${target.digits}@s.whatsapp.net`;
        saveOwnersData(data);
    } else {
        data.premium.push({
            digits: target.digits,
            lid: target.lid,
            jid: target.jid,
            addedBy: MASTER_OWNER_DIGITS,
            addedAt: Date.now()
        });
        saveOwnersData(data);
    }

    await sock.sendMessage(from, { react: { text: '💎', key: msg.key } }).catch(() => {});

    const mentionList = target.jid ? [target.jid] : [];
    const tagDisplay = target.digits ? `@${target.digits}` : target.display;

    return await sock.sendMessage(from, {
        text: `╭━━━〔 💎 *NEW PREMIUM MEMBER ADDED* 〕━━━┈⊷\n` +
              `┃ ✅ *Status:* Premium Activated\n` +
              `┃ 👤 *Member:* ${tagDisplay}\n` +
              `┃ 🆔 *ID:* \`${target.digits || target.lid}\`\n` +
              `┃ 🔓 *Unlocked Features:*\n` +
              `┃    • \`.arc <channel_link>\` (Auto-React)\n` +
              `┃    • \`.del arc <channel_link>\`\n` +
              `┃    • \`.chreact <post_link>\` (73 Servers)\n` +
              `┃    • \`.chvote <post_link> 1/2\`\n` +
              `┃ 👑 *Approved By:* MR SAQIB\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`,
        mentions: mentionList
    }, { quoted: msg });
}

/**
 * Command: .delpm / .pmdel [number | @mention | reply]
 */
async function delpmCommand(sock, from, msg, isOwner, args = [], groupMetadata = null) {
    if (markCommandHandled(msg?.key?.id)) return;

    if (!isOwner) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: `❌ *Access Denied!* Sirf Bot Owner (*03438673242*) premium member remove kar sakta hai.`
        }, { quoted: msg });
    }

    const target = await extractTargetUser(sock, msg, args, groupMetadata, from);
    if (!target) {
        return await sock.sendMessage(from, {
            text: `❌ *Usage:* Kisi message par reply kar ke \`.delpm\` likhein, ya \`.delpm @user\` / \`.delpm 03001234567\` likhein!`
        }, { quoted: msg });
    }

    const data = loadOwnersData();
    const beforeCount = data.premium.length;
    const targetLast10 = target.digits && target.digits.length >= 10 ? target.digits.slice(-10) : '';
    data.premium = data.premium.filter(p => {
        if (target.digits && p.digits && (p.digits === target.digits || (targetLast10 && p.digits.endsWith(targetLast10)))) return false;
        if (target.lid && p.lid === target.lid) return false;
        return true;
    });

    if (data.premium.length === beforeCount) {
        return await sock.sendMessage(from, {
            text: `ℹ️ *Ye user Premium list me mojood nahi hai!*`
        }, { quoted: msg });
    }

    saveOwnersData(data);
    await sock.sendMessage(from, { react: { text: '🗑️', key: msg.key } }).catch(() => {});

    return await sock.sendMessage(from, {
        text: `╭━━━〔 🗑️ *PREMIUM MEMBER REMOVED* 〕━━━┈⊷\n` +
              `┃ 👤 *Removed:* ${target.display}\n` +
              `┃ 🔒 *Status:* Premium Access Revoked\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
}

/**
 * Command: .pmlist / .premlist
 */
async function pmlistCommand(sock, from, msg, isOwner) {
    if (markCommandHandled(msg?.key?.id)) return;
    if (!isOwner) {
        return await sock.sendMessage(from, { text: `❌ *Sirf Bot Owner ye list dekh sakta hai!*` }, { quoted: msg });
    }

    const data = loadOwnersData();
    if (!data.premium.length) {
        return await sock.sendMessage(from, {
            text: `╭━━━〔 💎 *PREMIUM MEMBERS LIST* 〕━━━┈⊷\n` +
                  `┃ 📭 Abhi koi Premium Member add nahi hai.\n` +
                  `┃ 👉 Add karne ke liye: \`.addpm <number/@user/reply>\`\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }

    let listText = '';
    data.premium.forEach((p, i) => {
        const label = p.digits ? `+${p.digits}` : `LID:${p.lid}`;
        listText += `┃ 💎 *${i + 1}. ${label}* (Premium)\n`;
    });

    return await sock.sendMessage(from, {
        text: `╭━━━〔 💎 *PREMIUM MEMBERS (${data.premium.length})* 〕━━━┈⊷\n` +
              `${listText}` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴛᴇᴀᴍ-ᴍʀ-sᴀǫɪʙ*`
    }, { quoted: msg });
}

module.exports = {
    MASTER_OWNER_DIGITS,
    markCommandHandled,
    normalizePhoneDigits,
    extractLidDigits,
    loadOwnersData,
    saveOwnersData,
    learnIdentityMapping,
    harvestAllKnownMappings,
    registerSessionIdentity,
    checkIsMasterOwner,
    checkIsOwner,
    checkIsPremium,
    verifyPremiumOrOwnerAsync,
    extractTargetUser,
    ownaddCommand,
    owndelCommand,
    ownlistCommand,
    addpmCommand,
    delpmCommand,
    pmlistCommand
};
