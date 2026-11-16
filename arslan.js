// arslan.js - Compatibility bridge for AMAN HELL-MD / AMAN TECH plugin ecosystem
'use strict';

const commandModule = require('./command');

module.exports = {
    cmd: commandModule.cmd,
    AddCommand: commandModule.cmd,
    Function: commandModule.cmd,
    commands: commandModule.commands,
    commandMap: new Map(),
    aliasMap: new Map(),
    normalize: (val) => String(val || '').trim().toLowerCase().replace(/^\.+/, ''),
    findCommand: (name) => {
        const clean = String(name || '').trim().toLowerCase().replace(/^\.+/, '');
        for (const c of commandModule.commands) {
            if (c.pattern === clean) return c;
            if (Array.isArray(c.alias) && c.alias.includes(clean)) return c;
        }
        return null;
    }
};
