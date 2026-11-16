const { cmd } = require('../arslan');
const config = require('../config');
const crypto = require('crypto');

// ===========================================================
// 💳 CARDING CHANNEL REPORT
// ===========================================================
const CARDING_REPORT = (channelLink, channelName, details) => `To: WhatsApp Trust & Safety Team
Subject: URGENT — Illegal Carding Activity on WhatsApp Channel
Date: ${new Date().toDateString()}
Reference: CARDING-${Date.now().toString().slice(-8)}
Priority: CRITICAL

Dear WhatsApp Trust & Safety Team,

I am writing to report a **serious criminal activity** being conducted through a WhatsApp Channel. This channel is engaged in **illegal carding** — the sale and distribution of stolen credit/debit card information, which is a grave cybercrime.

═══════════════════════════════════════════
CHANNEL DETAILS
═══════════════════════════════════════════

📢 Channel Link: ${channelLink}
📛 Channel Name: ${channelName}
🆔 Report Reference: CARDING-${Date.now().toString().slice(-8)}

═══════════════════════════════════════════
NATURE OF ILLEGAL ACTIVITY
═══════════════════════════════════════════

${details}

The channel is actively:
❌ Selling stolen credit card data (CVV, fullz, dumps)
❌ Distributing bank account login credentials
❌ Promoting carding tutorials and tools
❌ Facilitating financial fraud
❌ Laundering money through fake transactions
❌ Targeting innocent citizens of Pakistan and other countries

═══════════════════════════════════════════
LEGAL VIOLATIONS
═══════════════════════════════════════════

This activity violates:

📜 **WhatsApp Policies:**
- WhatsApp Terms of Service (Section 2 — Prohibited Uses)
- WhatsApp Commerce Policy (Illegal Products)
- WhatsApp Community Guidelines (Criminal Activity)
- WhatsApp Business Policy (Financial Fraud)

⚖️ **Pakistan Laws:**
- PECA 2016 Section 3 — Unauthorized access to information systems
- PECA 2016 Section 4 — Unauthorized copying of data
- PECA 2016 Section 13 — Cyber terrorism
- PPC Section 420 — Cheating
- PPC Section 468 — Forgery for cheating
- PPC Section 471 — Using forged documents
- Anti-Money Laundering Act 2010
- State Bank of Pakistan's Payment Systems Act

⚖️ **International Laws:**
- US: 18 U.S.C. § 1029 — Access Device Fraud
- UK: Fraud Act 2006
- EU: Directive 2013/40/EU

═══════════════════════════════════════════
EVIDENCE
═══════════════════════════════════════════

I have collected the following evidence:

✅ Channel link and name
✅ Screenshots of illegal posts
✅ Carding advertisements and pricing
✅ CVV/dumps samples (censored for safety)
✅ Admin contact information
✅ Timestamps of criminal activity
✅ Proof of ongoing operations

**All evidence is preserved and available for law enforcement.**

═══════════════════════════════════════════
REQUESTS TO WHATSAPP
═══════════════════════════════════════════

I respectfully request WhatsApp to:

1. 🚫 **IMMEDIATELY BAN** the channel and all associated accounts
2. 🔍 **PRESERVE** all chat history and metadata
3. 🤝 **COOPERATE** fully with FIA Cybercrime Pakistan
4. 🌐 **REPORT** to relevant international authorities if applicable
5. 🔒 **SCAN** for linked channels/accounts operating the same scam
6. 📢 **NOTIFY** me of action taken (ref: CARDING-${Date.now().toString().slice(-8)})

═══════════════════════════════════════════
LEGAL DECLARATION
═══════════════════════════════════════════

I declare that:
- This report is truthful and made in good faith
- I have no personal enmity with the channel owners
- I am reporting to protect innocent citizens
- I understand false reporting is punishable by law
- I am willing to cooperate with any investigation
- I will submit evidence to FIA Cybercrime Pakistan

═══════════════════════════════════════════
LAW ENFORCEMENT NOTIFICATION
═══════════════════════════════════════════

This report is being simultaneously filed with:

📞 **FIA Cybercrime Wing:** 1991
🌐 **FIA Online Portal:** complaint.fia.gov.pk
📞 **NR3C Helpline:** 1991
🏦 **State Bank of Pakistan:** 0800-11111
📞 **Police Emergency:** 15

═══════════════════════════════════════════
URGENT APPEAL
═══════════════════════════════════════════

Carding destroys families. It empties bank accounts of elderly people saving for their children. It funds organized crime. It ruins Pakistan's digital economy.

Every hour this channel operates, more innocent people become victims.

**Please act urgently.**

Yours sincerely,

Name: [Your name]
WhatsApp: [Your WhatsApp number]
Date: ${new Date().toDateString()}
Reference: CARDING-${Date.now().toString().slice(-8)}

═══════════════════════════════════════════
ATTACHMENTS
═══════════════════════════════════════════
- Screenshot 1: Channel profile
- Screenshot 2: Carding advertisement post
- Screenshot 3: CVV/dumps sample
- Screenshot 4: Pricing list
- Screenshot 5: Admin contact
- Channel link: ${channelLink}

CC: FIA Cybercrime Pakistan
CC: State Bank of Pakistan
CC: WhatsApp Legal Department
CC: PTA Pakistan Telecommunication Authority`;

// ===========================================================
// 🎭 HACKING/SCAM CHANNEL REPORT
// ===========================================================
const SCAM_CHANNEL_REPORT = (channelLink, channelName, details) => `To: WhatsApp Trust & Safety Team
Subject: Report — Fraudulent Channel Engaged in Online Scams
Date: ${new Date().toDateString()}
Reference: SCAM-${Date.now().toString().slice(-8)}

Dear WhatsApp Trust & Safety Team,

I am reporting a WhatsApp Channel that is engaged in **organized online fraud** targeting innocent users.

═══════════════════════════════════════════
CHANNEL DETAILS
═══════════════════════════════════════════
📢 Link: ${channelLink}
📛 Name: ${channelName}
🆔 Ref: SCAM-${Date.now().toString().slice(-8)}

═══════════════════════════════════════════
FRAUD DETAILS
═══════════════════════════════════════════

${details}

═══════════════════════════════════════════
LEGAL VIOLATIONS
═══════════════════════════════════════════
- WhatsApp Terms of Service (Fraud & Abuse)
- PECA 2016 Section 4, 13
- PPC Section 420 (Cheating)
- Cybercrime Laws (Global)

═══════════════════════════════════════════
REQUESTS
═══════════════════════════════════════════
1. Ban the channel immediately
2. Preserve evidence for FIA
3. Investigate linked accounts
4. Notify me of action

═══════════════════════════════════════════
DECLARATION
═══════════════════════════════════════════
This report is truthful. I am willing to cooperate with investigation.

Yours sincerely,
Name: [Your name]
WhatsApp: [Your WhatsApp number]
Date: ${new Date().toDateString()}

CC: FIA Cybercrime Pakistan`;

// ===========================================================
// 🚨 MAIN COMMAND — Carding channel report
// ===========================================================
cmd({
    pattern: 'reportcarding',
    alias: ['cardingreport', 'reportcard', 'banchannel'],
    desc: 'Carding/scam channel ko WhatsApp pe report karo (legal)',
    category: 'tools',
    react: '💳',
    use: '.reportcarding <channel_link> | <channel_name> | <details>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const args = (ctx.q || '').split('|').map(x => x.trim());

    if (args.length < 3) {
        return ctx.reply([
            '💳 *CARDING CHANNEL REPORT*',
            '',
            '*Use:* `.reportcarding <channel_link> | <channel_name> | <details>`',
            '',
            '*Example:*',
            '`.reportcarding https://whatsapp.com/channel/xxx | Carding Hub | CVV, dumps, fullz bech raha hai, prices bhi likhe hain`',
            '',
            '⚠️ *IMPORTANT:*',
            '• Sirf REAL carding/scam channels report karo',
            '• Screenshots pehle jama karo',
            '• Evidence ke bina report mat bhejo',
            '• Fake report = tumhara number ban',
            '',
            '⚖️ Ye command tumhe:',
            '• WhatsApp ke liye formal complaint banayegi',
            '• FIA Cybercrime ke liye bhi reference degi',
            '• Legal protection ke saath report'
        ].join('\n'));
    }

    const [channelLink, channelName, details] = args;

    if (!channelLink.includes('whatsapp.com/channel') && !channelLink.includes('whatsapp.com/')) {
        return ctx.reply('❌ Valid WhatsApp channel link do.');
    }

    const report = CARDING_REPORT(channelLink, channelName, details);

    const header = `💳 *CARDING REPORT*\n\n` +
        `📢 Channel: *${channelName}*\n` +
        `🔗 Link: ${channelLink}\n` +
        `📅 Date: *${new Date().toLocaleString()}*\n` +
        `🆔 Ref: *CARDING-${Date.now().toString().slice(-8)}*\n\n` +
        `━━━━━━━━━━━━━━━━━\n\n`;

    const footer = `\n\n━━━━━━━━━━━━━━━━━\n\n` +
        `📧 *SEND TO:*\n` +
        `• report@support.whatsapp.com\n` +
        `• abuse@support.whatsapp.com\n` +
        `• support@whatsapp.com\n` +
        `• security@whatsapp.com\n\n` +
        `⚖️ *ALSO FILE WITH:*\n` +
        `• FIA Cybercrime: *1991*\n` +
        `• FIA Online: complaint.fia.gov.pk\n` +
        `• NR3C: *1991*\n` +
        `• State Bank: *0800-11111*\n` +
        `• Police: *15*\n\n` +
        `📎 *ATTACH KARO:*\n` +
        `• Channel ke screenshots\n` +
        `• Illegal posts ke proof\n` +
        `• Admin contact info\n` +
        `• Channel link`;

    const fullText = header + report + footer;
    const maxLen = 3800;
    const parts = [];
    for (let i = 0; i < fullText.length; i += maxLen) {
        parts.push(fullText.slice(i, i + maxLen));
    }

    for (let i = 0; i < parts.length; i++) {
        await conn.sendMessage(ctx.from, {
            text: `📄 *PART ${i + 1}/${parts.length}*\n\n${parts[i]}`
        }, { quoted: mek });
        await new Promise(r => setTimeout(r, 1200));
    }

    return conn.sendMessage(ctx.from, {
        text: [
            '✅ *CARDING REPORT READY!*',
            '',
            '📧 *Step 1:* Email bhejo (sab addresses pe)',
            '⚖️ *Step 2:* FIA Cybercrime ko bhi complaint karo',
            '🚔 *Step 3:* Police station me FIR likhao',
            '🏦 *Step 4:* Bank ko bhi batao',
            '',
            '*🎯 Helplines:*',
            '• FIA Cybercrime: *1991*',
            '• NR3C: *1991*',
            '• Police: *15*',
            '• Bank: *0800-11111*',
            '',
            '💡 *Pro Tips:*',
            '• *SAB* screenshots pehle jama karo',
            '• Ek se zyada email pe bhejo',
            '• Har 3-4 din me reminder bhejo',
            '• Public awareness ke liye group me share karo',
            '',
            '⚠️ *Warning:*',
            'Is channel ke admin se direct contact MAT karo.',
            'Wo tumhe blackmail kar sakta hai.',
            '',
            '🎯 *Ye report FIA Pakistan, WhatsApp, aur State Bank sab ke paas jayegi.*',
            '',
            `_Generated by ${config.BOT_NAME || '𝗔𝗠𝗔𝗡-𝐌𝐃'}_`
        ].join('\n')
    }, { quoted: mek });
});

// ===========================================================
// SCAM CHANNEL REPORT
// ===========================================================
cmd({
    pattern: 'reportscamchannel',
    alias: ['scamchannel', 'reportchan'],
    desc: 'Scam channel report karo',
    category: 'tools',
    react: '🚨',
    use: '.reportscamchannel <link> | <name> | <details>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const args = (ctx.q || '').split('|').map(x => x.trim());
    if (args.length < 3) {
        return ctx.reply([
            '🚨 *SCAM CHANNEL REPORT*',
            '',
            'Use: `.reportscamchannel <link> | <name> | <details>`',
            '',
            'Example:',
            '`.reportscamchannel https://whatsapp.com/channel/xxx | Fake Crypto | Paisa double karne ka jhoota wada`'
        ].join('\n'));
    }

    const [channelLink, channelName, details] = args;
    const report = SCAM_CHANNEL_REPORT(channelLink, channelName, details);

    const header = `🚨 *SCAM CHANNEL REPORT*\n\n` +
        `📢 Channel: *${channelName}*\n` +
        `🔗 ${channelLink}\n` +
        `📅 ${new Date().toLocaleString()}\n\n━━━━━━━━━━━━━━━━━\n\n`;

    const footer = `\n\n━━━━━━━━━━━━━━━━━\n\n` +
        `📧 *Email:* report@support.whatsapp.com\n` +
        `⚖️ *FIA:* 1991\n` +
        `🚔 *Police:* 15`;

    const fullText = header + report + footer;
    const maxLen = 3800;
    const parts = [];
    for (let i = 0; i < fullText.length; i += maxLen) {
        parts.push(fullText.slice(i, i + maxLen));
    }

    for (let i = 0; i < parts.length; i++) {
        await conn.sendMessage(ctx.from, {
            text: `📄 *PART ${i + 1}/${parts.length}*\n\n${parts[i]}`
        }, { quoted: mek });
        await new Promise(r => setTimeout(r, 1000));
    }

    return ctx.reply('✅ Report ready! Email bhejo + FIA complain karo: *1991*');
});

// ===========================================================
// REPORT GUIDE — Kaise report karo
// ===========================================================
cmd({
    pattern: 'reportguide',
    alias: ['howtoreport', 'reporthelp'],
    desc: 'WhatsApp channel report kaise karo',
    category: 'tools',
    react: '📖',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    return ctx.reply([
        '📖 *WHATSAPP REPORT GUIDE*',
        '',
        '⚖️ *Step 1: Evidence Collect karo*',
        '• Channel link copy karo',
        '• Illegal posts ke screenshots lo',
        '• Admin ki info save karo',
        '• Time/date note karo',
        '',
        '⚖️ *Step 2: WhatsApp Report*',
        '• Channel kholo',
        '• 3 dots → Report',
        '• Category select karo',
        '• Screenshots attach karo',
        '',
        '⚖️ *Step 3: Email Report*',
        '• *To:* report@support.whatsapp.com',
        '• *CC:* abuse@support.whatsapp.com',
        '• *CC:* security@whatsapp.com',
        '• Subject: "Carding Channel Report - [Channel Name]"',
        '• Body: `.reportcarding` se generate karo',
        '',
        '⚖️ *Step 4: FIA Cybercrime*',
        '• Helpline: *1991*',
        '• Online: complaint.fia.gov.pk',
        '• FIR likhao local police station me',
        '',
        '⚖️ *Step 5: Bank Report (agar fraud hua)*',
        '• State Bank: *0800-11111*',
        '• Apne bank ko bhi batao',
        '',
        '⚠️ *WARNING:*',
        '• Carding channel ke admin se direct contact mat karo',
        '• Apni personal info share mat karo',
        '• Fake report = tumhara number ban',
        '',
        '💡 *Sab emails + FIA + police — sabko simultaneously karo*',
        '',
        '🎯 Report generator: `.reportcarding <link> | <name> | <details>`'
    ].join('\n'));
});