// plugins/group-antiadmin.js
'use strict';

const { cmd } = require('../command');
const groupExtra = require('../commands/group-extra');

cmd({
    pattern: "antiadmin",
    react: "🛡️",
    alias: ["antiadm", "antiadminprotect"],
    desc: "Protect group from unauthorized promotions (demotes both new admin and rogue admin)",
    category: "group",
    use: '.antiadmin [on/off]',
    filename: __filename
},
async (conn, mek, m, { from, isGroup, isAdmins, isCreator, args }) => {
    const botData = globalThis.botData || {};
    const saveBotData = globalThis.saveBotData || (() => {});
    await groupExtra.antiadminCommand(conn, from, mek, isAdmins, isCreator, botData, saveBotData, args);
});

cmd({
    pattern: "admininform",
    react: "📢",
    alias: ["adminiform", "admininfo", "admininf", "admininformer", "adminalert", "adminalerts", "adminnotif", "adininform"],
    desc: "Alerts group when someone is promoted or demoted, and alerts if bot is demoted",
    category: "group",
    use: '.admininform [on/off]',
    filename: __filename
},
async (conn, mek, m, { from, isGroup, isAdmins, isCreator, args }) => {
    const botData = globalThis.botData || {};
    const saveBotData = globalThis.saveBotData || (() => {});
    await groupExtra.admininformCommand(conn, from, mek, isAdmins, isCreator, botData, saveBotData, args);
});
