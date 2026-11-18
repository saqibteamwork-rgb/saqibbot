// plugins/tool-dp.js
'use strict';

const { cmd } = require('../command');
const dpCommand = require('../commands/dp');

cmd({
    pattern: "dp",
    react: "🖼️",
    alias: ["getpp", "pfp", "getpfp", "userdp", "profilepic", "viewdp", "showdp"],
    desc: "Fetch 100% Full HD profile picture of any user, group, number or reply",
    category: "tools",
    use: '.dp [@user / reply / number / group]',
    filename: __filename
},
async (conn, mek, m, { from, args }) => {
    await dpCommand(conn, from, mek, args);
});
