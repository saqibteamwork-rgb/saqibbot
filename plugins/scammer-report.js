const { cmd } = require('../arslan');
const config = require('../config');
const crypto = require('crypto');

// ===========================================================
// 💀 SCAMMER REPORT GENERATOR
// ===========================================================

// ===========================================================
// 1. FINANCIAL FRAUD REPORT
// ===========================================================
const FRAUD_REPORT = (num, name, amount, date, evidence) => `To: WhatsApp Trust & Safety Team
Subject: URGENT — Financial Fraud Report — +${num}
Date: ${new Date().toDateString()}
Reference: FRAUD-${num}-${Date.now().toString().slice(-6)}
Priority: HIGH

Dear WhatsApp Trust & Safety Team,

I am writing to report a **serious financial fraud** committed through WhatsApp by the account holder of phone number +${num}.

═══════════════════════════════════════════
REPORT DETAILS
═══════════════════════════════════════════

📱 Reported Number: +${num}
👤 Reported Name (as claimed): ${name}
💰 Amount Lost: ${amount}
📅 Date of Incident: ${date}
🆔 Case Reference: FRAUD-${num}-${Date.now().toString().slice(-6)}

═══════════════════════════════════════════
WHAT HAPPENED
═══════════════════════════════════════════

The account holder contacted me via WhatsApp with the following modus operandi:

${evidence}

They deceived me into sending ${amount} under false pretenses. The transaction was made based on their false promises. After receiving the money, the person:
- Stopped responding to my messages
- Blocked my number / or continued to make excuses
- Refused to return the money

═══════════════════════════════════════════
EVIDENCE AVAILABLE
═══════════════════════════════════════════

I have preserved the following evidence:
✅ Complete chat screenshots
✅ Transaction receipts (bank/JazzCash/EasyPaisa)
✅ Voice notes (if any)
✅ Their profile information
✅ Timestamps of all interactions
✅ Call records (if applicable)

═══════════════════════════════════════════
LEGAL CONTEXT
═══════════════════════════════════════════

This is a violation of:
- WhatsApp Terms of Service (Section on Fraud)
- Pakistan PECA 2016 (Section 3, 4, 13 — Cybercrime)
- Pakistan Penal Code (Section 420 — Cheating)
- Anti-Money Laundering Act 2010

I have already / will be filing a formal FIR with:
- FIA Cybercrime Wing (helpline: 1991)
- Local Police Station
- Bank (for transaction reversal request)

═══════════════════════════════════════════
REQUEST TO WHATSAPP
═══════════════════════════════════════════

I respectfully request WhatsApp to:

1. **IMMEDIATELY BAN** the account +${num} to prevent further victims
2. **Preserve** all chat history and activity logs for law enforcement
3. **Cooperate** with FIA Cybercrime investigation
4. **Flag** this number for future scam detection
5. **Notify me** of action taken (reference: above case ID)

═══════════════════════════════════════════
STATEMENT
═══════════════════════════════════════════

I confirm that:
- This report is truthful and made in good faith
- I have real evidence to support this claim
- I am willing to cooperate with any investigation
- I understand false reporting is punishable by law

This scammer is a threat to other innocent WhatsApp users. Please act swiftly before more people become victims.

Yours sincerely,

[Your name]
WhatsApp: [Your WhatsApp number]
Date: ${new Date().toDateString()}

═══════════════════════════════════════════
ATTACHMENTS
═══════════════════════════════════════════
- Screenshot 1: Initial contact
- Screenshot 2: Fraud conversation
- Screenshot 3: Payment proof
- Screenshot 4: Block/refuse evidence
- Bank receipt: Attached
- ID proof: Attached

CC: FIA Cybercrime Wing Pakistan
CC: State Bank of Pakistan (if bank fraud)`;

// ===========================================================
// 2. ROMANCE SCAM REPORT
// ===========================================================
const ROMANCE_REPORT = (num, name, evidence) => `To: WhatsApp Trust & Safety Team
Subject: Romance Scam Report — +${num}
Date: ${new Date().toDateString()}
Reference: ROMANCE-${num}-${Date.now().toString().slice(-6)}

Dear WhatsApp Trust & Safety Team,

I am reporting a **romance scam** being operated by the account holder of +${num}. This is part of an organized fraud that affects vulnerable people daily.

═══════════════════════════════════════════
SCAMMER DETAILS
═══════════════════════════════════════════
📱 Number: +${num}
👤 Claimed Name: ${name}
💔 Scam Type: Romance / Emotional manipulation
🎭 Possible: Fake profile, stolen photos

═══════════════════════════════════════════
MODUS OPERANDI
═══════════════════════════════════════════

${evidence}

The scammer:
1. Built fake emotional connection
2. Created a false crisis story (accident, hospital, visa, etc.)
3. Requested money urgently
4. Repeated the cycle with multiple victims

═══════════════════════════════════════════
PROOF AVAILABLE
═══════════════════════════════════════════
✅ Chat screenshots showing manipulation
✅ Money transfer proofs
✅ Their fake profile photos (reverse image searchable)
✅ Witness/other victims who experienced the same
✅ Timeline of grooming and exploitation

═══════════════════════════════════════════
REQUEST
═══════════════════════════════════════════

Please:
1. **Ban** +${num} immediately
2. **Preserve** all evidence for law enforcement
3. **Scan** for other accounts operated by this person
4. **Report** to relevant authorities if legally required

═══════════════════════════════════════════
DECLARATION
═══════════════════════════════════════════

I declare this report to be true. I understand the legal consequences of false reporting.

I'm reporting this to protect others from the same pain I went through.

Yours sincerely,
[Your name]
WhatsApp: [Your WhatsApp number]

CC: FIA Cybercrime Wing (Pakistan)
CC: Federal Investigation Agency`;

// ===========================================================
// 3. IMPERSONATION REPORT
// ===========================================================
const IMPERSONATION_REPORT = (num, name, target) => `To: WhatsApp Trust & Safety Team
Subject: Account Impersonation Report — +${num}
Date: ${new Date().toDateString()}
Reference: IMPERSONATION-${num}-${Date.now().toString().slice(-6)}

Dear WhatsApp Team,

I am reporting the account +${num} for **impersonating** ${target}.

═══════════════════════════════════════════
IMPERSONATION DETAILS
═══════════════════════════════════════════
📱 Fake Account: +${num}
👤 Impersonating: ${target}
🎯 Purpose: Fraud / Defamation / Scam

═══════════════════════════════════════════
EVIDENCE
═══════════════════════════════════════════

The fake account:
- Uses stolen photos of ${target}
- Uses similar name to ${target}
- Contacts ${target}'s friends and family
- Attempts to extort / scam / damage reputation

Proof:
✅ Screenshots of fake profile
✅ Comparison with real profile
✅ Chats showing fake behavior
✅ Victim testimonials

═══════════════════════════════════════════
REQUEST
═══════════════════════════════════════════

1. **Ban** +${num} immediately
2. **Restore** any stolen identity info
3. **Investigate** if linked to other accounts
4. **Notify** real ${target} if possible

This impersonation has caused [damage type]. Please act fast.

Yours,
[Your name]
WhatsApp: [Your WhatsApp number]

CC: FIA Cybercrime Wing`;

// ===========================================================
// 4. HARASSMENT / BLACKMAIL REPORT
// ===========================================================
const HARASSMENT_REPORT = (num, name, evidence) => `To: WhatsApp Trust & Safety Team
Subject: Harassment & Blackmail Report — +${num}
Date: ${new Date().toDateString()}
Reference: HARASS-${num}-${Date.now().toString().slice(-6)}
Priority: URGENT

Dear WhatsApp Trust & Safety Team,

I am reporting serious **harassment and blackmail** by the account holder of +${num}. This is causing me severe mental distress and threatening my safety.

═══════════════════════════════════════════
REPORTED ACCOUNT
═══════════════════════════════════════════
📱 Number: +${num}
👤 Name: ${name}
🚨 Type: Harassment / Blackmail / Threats

═══════════════════════════════════════════
WHAT I'M FACING
═══════════════════════════════════════════

${evidence}

They have been:
- Sending threatening messages
- Threatening to leak private information / photos
- Repeatedly contacting despite requests to stop
- Creating new numbers to bypass blocks
- Involving my family / friends

═══════════════════════════════════════════
EVIDENCE
═══════════════════════════════════════════
✅ Screenshots of threats
✅ Timestamps of messages
✅ Voice notes with threats
✅ Records of multiple numbers used
✅ Police complaint (if filed)

═══════════════════════════════════════════
LEGAL CONTEXT
═══════════════════════════════════════════

This violates:
- WhatsApp Terms of Service (Harassment Policy)
- PECA 2016 Section 24 (Cyberstalking)
- PPC Section 509 (Insulting modesty)
- PPC Section 506 (Criminal intimidation)

═══════════════════════════════════════════
URGENT REQUEST
═══════════════════════════════════════════

1. **IMMEDIATE BAN** of +${num}
2. **Preserve** all evidence for police
3. **Investigate** linked accounts
4. **Cooperate** with law enforcement

I fear for my safety. Please act urgently.

Yours,
[Your name]
WhatsApp: [Your WhatsApp number]

CC: FIA Cybercrime Wing (Emergency: 1991)
CC: Local Police`;

// ===========================================================
// MAIN COMMAND
// ===========================================================
cmd({
    pattern: 'reportscam',
    alias: ['reportfraud', 'scamreport', 'fraudreport'],
    desc: 'Scammer ka WhatsApp report karo (legal)',
    category: 'tools',
    react: '🚨',
    use: '.reportscam <number> | <name> | <type> | <details>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const args = (ctx.q || '').split('|').map(x => x.trim());

    if (args.length < 4) {
        return ctx.reply([
            '🚨 *SCAMMER REPORT GENERATOR*',
            '',
            '*Use:* `.reportscam <number> | <name> | <type> | <details>`',
            '',
            '*Types:*',
            '• `fraud` — Financial fraud (paisa cheated)',
            '• `romance` — Romance / love scam',
            '• `impersonation` — Fake account',
            '• `harassment` — Harassment / blackmail',
            '',
            '*Examples:*',
            '`.reportscam 923XXXXXXXXX | Ali | fraud | 50000 rupees liye aur block kar diya`',
            '`.reportscam 923XXXXXXXXX | Sara | romance | Fake love story, hospital drama, 3 baar paisa manga`',
            '`.reportscam 923XXXXXXXXX | Ali | harassment | Threat de raha hai photos leak karne ki`',
            '',
            '⚠️ *Only for REAL scammers with PROOF!*',
            'False report = tumhara number ban + legal action'
        ].join('\n'));
    }

    const [rawNum, name, type, details] = args;
    const num = rawNum.replace(/\D/g, '');
    if (num.length < 10) return ctx.reply('❌ Valid number do.');

    const typeLower = type.toLowerCase();
    let report;

    if (typeLower === 'fraud' || typeLower === 'financial') {
        report = FRAUD_REPORT(num, name, 'N/A', new Date().toDateString(), details);
    } else if (typeLower === 'romance' || typeLower === 'love') {
        report = ROMANCE_REPORT(num, name, details);
    } else if (typeLower === 'impersonation' || typeLower === 'fake') {
        report = IMPERSONATION_REPORT(num, name, details);
    } else if (typeLower === 'harassment' || typeLower === 'harass') {
        report = HARASSMENT_REPORT(num, name, details);
    } else {
        return ctx.reply('❌ Invalid type. Use: `fraud`, `romance`, `impersonation`, `harassment`');
    }

    const header = `🚨 *SCAMMER REPORT*\n\n` +
        `📱 Number: *+${num}*\n` +
        `👤 Name: *${name}*\n` +
        `🎯 Type: *${typeLower.toUpperCase()}*\n` +
        `📅 Date: *${new Date().toLocaleString()}*\n\n` +
        `━━━━━━━━━━━━━━━━━\n\n`;

    const footer = `\n\n━━━━━━━━━━━━━━━━━\n\n` +
        `📧 *SEND TO:*\n` +
        `• report@support.whatsapp.com\n` +
        `• abuse@support.whatsapp.com\n` +
        `• support@whatsapp.com\n\n` +
        `⚖️ *ALSO FILE WITH:*\n` +
        `• FIA Cybercrime: 1991\n` +
        `• NR3C: 1991\n` +
        `• Local Police Station\n\n` +
        `📎 *ATTACH:*\n` +
        `• Chat screenshots\n` +
        `• Payment receipts\n` +
        `• Voice notes\n` +
        `• ID proof`;

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

    return ctx.reply(
        `✅ *Report ready!*\n\n` +
        `📧 Email bhejo upar wale addresses pe\n` +
        `⚖️ FIA Cybercrime ko bhi complain karo: *1991*\n\n` +
        `💡 *Pro tips:*\n` +
        `• Sab evidence attach karo\n` +
        `• Screenshot clear ho\n` +
        `• Time/date mention ho\n` +
        `• Akela mat bhejo — proof ke saath bhejo\n\n` +
        `🎯 *Legal help:* FIA Cybercrime Wing Pakistan`
    );
});

// ===========================================================
// QUICK REPORT — Sirf number do, generic report
// ===========================================================
cmd({
    pattern: 'report',
    alias: ['scam'],
    desc: 'Quick scam report',
    category: 'tools',
    react: '⚠️',
    use: '.report <number> | <details>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const parts = (ctx.q || '').split('|').map(x => x.trim());
    if (parts.length < 2) {
        return ctx.reply([
            '⚠️ *QUICK SCAM REPORT*',
            '',
            'Use: `.report <number> | <details>`',
            '',
            '*Example:*',
            '`.report 923XXXXXXXXX | 50 hazar rupay cheated, evidence hai`',
            '',
            '💡 Full version: `.reportscam <num> | <name> | <type> | <details>`'
        ].join('\n'));
    }

    const [rawNum, details] = parts;
    const num = rawNum.replace(/\D/g, '');
    if (num.length < 10) return ctx.reply('❌ Valid number do.');

    const report = `To: WhatsApp Trust & Safety Team
Subject: Scam Report — +${num}
Date: ${new Date().toDateString()}

Dear WhatsApp Team,

I am reporting +${num} for scam activity.

DETAILS:
${details}

EVIDENCE: Available on request
- Chat screenshots
- Transaction proof
- Voice notes

REQUEST:
1. Ban +${num}
2. Preserve evidence for law enforcement
3. Notify me of action

I confirm this report is truthful. I understand false reporting has legal consequences.

Yours,
[Your name]
WhatsApp: [Your WhatsApp number]`;

    await ctx.reply(report);

    return ctx.reply([
        '📧 *Send to:*',
        '• report@support.whatsapp.com',
        '• abuse@support.whatsapp.com',
        '',
        '⚖️ *Also:* FIA Cybercrime — 1991'
    ].join('\n'));
});