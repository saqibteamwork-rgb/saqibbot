const { cmd } = require('../arslan');

cmd({
    pattern: "sim",
    alias: ["simdata", "database", "simdetail", "detailsim"],
    desc: "SIM help (private identity lookups disabled)",
    category: "tools",
    react: "🔍",
    filename: __filename
}, async (conn, mek, m, { reply, isOwner }) => {
    if (!isOwner) return reply("*❌ Only the owner can use this command!*");
    return reply(
        "🔒 Privacy ke liye phone number se kisi shakhs ka SIM record, CNIC, naam ya address lookup nahi kiya ja sakta.\n\n" +
        "Apni SIM ki maloomat ke liye apne mobile network ki official app, helpline, ya authorized government service use karein. " +
        "`.sim` command aur uske aliases maujood hain; third-party personal-data lookup band hai."
    );
});
