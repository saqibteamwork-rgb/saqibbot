// lib/premium-check.js
// PREMIUM SYSTEM REMOVED — every command is free for everyone.
// OWNER = the WhatsApp account that paired (connected) this session. Nobody else.
// (The file/exports are kept so older plugins that import it keep working.)

const config = require('../config');

function cleanNumber(value) {
    let n = String(value || '').replace(/\D/g, '');
    if (n.startsWith('00')) n = n.slice(2);
    const cc = String(config.DEFAULT_COUNTRY_CODE || '92');
    if (n.startsWith(cc + '0') && n.length === cc.length + 11) n = cc + n.slice(cc.length + 1);
    if (n.startsWith('0')) n = `${cc}${n.slice(1)}`;
    return n;
}

// Optional "bot host" numbers (OWNER_NUMBER in config/env) — used ONLY to guard
// commands that act on ALL sessions (.sreacts / .arcadd), see isBotHost().
const HOST_NUMBERS = [...new Set([
    ...(Array.isArray(config.OWNER_NUMBERS) ? config.OWNER_NUMBERS : []),
    config.OWNER_NUMBER,
    ...(process.env.OWNER_NUMBERS || '').split(',')
].map(cleanNumber).filter(Boolean))];

function isOwnerNumber(number) {
    const clean = cleanNumber(number);
    return Boolean(clean) && HOST_NUMBERS.includes(clean);
}

// Owner of THIS session = the paired account (main.js sets ctx.isOwner / isMe)
function isOwner(ctx) {
    if (!ctx) return false;
    return Boolean(ctx.isOwner || ctx.isCreator || ctx.isMe);
}

// Commands that touch every connected session (other people's accounts too):
// if OWNER_NUMBER is configured only that host can run them, otherwise any session owner can.
function isBotHost(ctx) {
    if (!isOwner(ctx)) return false;
    if (!HOST_NUMBERS.length) return true;
    return isOwnerNumber(ctx.senderNumber || ctx.sender) || Boolean(ctx.isHost);
}

// Premium is gone: always allowed
async function isPremiumUser() { return true; }
async function requirePremium() { return true; }

module.exports = {
    OWNER_NUMBERS: HOST_NUMBERS,
    cleanNumber,
    isOwnerNumber,
    isOwner,
    isBotHost,
    isPremiumUser,
    requirePremium
};
