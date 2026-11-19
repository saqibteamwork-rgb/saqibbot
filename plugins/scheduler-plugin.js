// plugins/scheduler-plugin.js
'use strict';

const { cmd } = require('../command');
const schedulerCmds = require('../commands/schedulerCommands');

cmd({
    pattern: "autopost",
    react: "⏱️",
    alias: ["schedulepost", "postschedule", "automsg"],
    desc: "Schedule auto-posts for groups or channels at specific times (e.g. .autopost 09:00 PM | Message)",
    category: "utility",
    use: '.autopost <time> | <message>',
    filename: __filename
}, async (conn, mek, m, { from, isAdmins, isCreator, args }) => {
    await schedulerCmds.autopostCommand(conn, from, mek, isAdmins, isCreator, args);
});

cmd({
    pattern: "groupschedule",
    react: "🛡️",
    alias: ["groupsch", "autoclose", "automute", "grouptimer"],
    desc: "Schedule group auto-close at night and auto-open in the morning (e.g. .groupschedule 11:00 PM | 07:00 AM)",
    category: "group",
    use: '.groupschedule <close_time> | <open_time>',
    filename: __filename
}, async (conn, mek, m, { from, isAdmins, isCreator, args }) => {
    await schedulerCmds.groupscheduleCommand(conn, from, mek, isAdmins, isCreator, args);
});

cmd({
    pattern: "dailycontent",
    react: "🕌",
    alias: ["dailydrop", "dailyislamic", "dailyquote", "dailytech"],
    desc: "Automated daily morning drops: authentic Islamic Hadith, Motivational Quotes, or Tech Tips",
    category: "utility",
    use: '.dailycontent <on/off> [islamic|quote|tech]',
    filename: __filename
}, async (conn, mek, m, { from, isAdmins, isCreator, args }) => {
    await schedulerCmds.dailycontentCommand(conn, from, mek, isAdmins, isCreator, args);
});

cmd({
    pattern: "scheduletab",
    react: "📊",
    alias: ["schedulemenu", "schedules", "myschedules", "scheduledashboard"],
    desc: "Interactive Buttons Dashboard to view, pause, resume, and delete active schedules",
    category: "utility",
    use: '.scheduletab',
    filename: __filename
}, async (conn, mek, m, { from, isAdmins, isCreator, args }) => {
    await schedulerCmds.scheduleMenuCommand(conn, from, mek, isAdmins, isCreator, args);
});

cmd({
    pattern: "delschedule",
    react: "🗑️",
    alias: ["deleteschedule", "removeschedule"],
    desc: "Delete a schedule by its ID (e.g. .delschedule <ID>)",
    category: "utility",
    use: '.delschedule <ID>',
    filename: __filename
}, async (conn, mek, m, { from, isAdmins, isCreator, args }) => {
    await schedulerCmds.delScheduleCommand(conn, from, mek, isAdmins, isCreator, args);
});

cmd({
    pattern: "toggleschedule",
    react: "⏯️",
    alias: ["pauseschedule", "resumeschedule"],
    desc: "Pause or resume a schedule by its ID",
    category: "utility",
    use: '.toggleschedule <ID>',
    filename: __filename
}, async (conn, mek, m, { from, isAdmins, isCreator, args }) => {
    await schedulerCmds.toggleScheduleCommand(conn, from, mek, isAdmins, isCreator, args);
});
