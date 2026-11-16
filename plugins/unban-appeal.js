const { cmd } = require('../arslan');
const config = require('../config');
const crypto = require('crypto');

// ===========================================================
// 📧 HARD APPEAL TEMPLATES — WhatsApp Review Team Format
// ===========================================================

// ===========================================================
// 1. LEGAL + EMOTIONAL (Strongest)
// ===========================================================
const APPEAL_LEGAL = (num, name, country) => `To: WhatsApp Appeals Review Team
Subject: Formal Appeal for Account Restoration — +${num}
Date: ${new Date().toDateString()}
Reference: UNBAN-${num}-${Date.now().toString().slice(-6)}

Dear WhatsApp Appeals Team,

My name is ${name}, and I am writing this formal appeal to respectfully request the restoration of my WhatsApp account registered under the phone number +${num}.

ACCOUNT DETAILS:
- Phone Number: +${num}
- Country: ${country}
- Account Type: Personal
- Usage Duration: Multiple years

REASON FOR APPEAL:

My account was banned on [${new Date().toDateString()}] without prior warning or explanation. I have carefully reviewed WhatsApp's Terms of Service and Community Guidelines, and I genuinely believe I have not knowingly violated any of them.

I want to be completely transparent with you: if I have made any mistake — whether through ignorance, misunderstanding, or an unintended action — I sincerely apologize from the depth of my heart. It was never my intention to misuse this platform.

EMOTIONAL CONTEXT:

This WhatsApp number is not just a communication tool for me — it is my connection to my loved ones. My elderly parents rely on this number to check on me every day. My young children video call me on this number when I am away. My entire family's daily communication, memories, and important documents are stored here.

Without this account, I am cut off from the people who matter most to me.

MY PROMISE:

If my account is restored, I commit to:
1. Fully complying with WhatsApp's Terms of Service and Community Guidelines
2. Never engaging in spam, bulk messaging, or unauthorized automation
3. Reporting any suspicious activity I encounter
4. Being a responsible member of the WhatsApp community

I understand that WhatsApp has strict policies for user safety, and I respect those policies. I am only asking for a fair review of my specific case.

I have been a loyal WhatsApp user for years, and losing this account has caused me significant emotional and practical distress. I humbly request the review team to kindly reconsider my ban.

I am available to provide any additional information, verification documents, or clarification you may require.

Thank you for taking the time to read my appeal. I await your kind response with hope.

With sincere gratitude and respect,

${name}
Phone: +${num}
Email: [your_email@example.com]
Date: ${new Date().toDateString()}

---
This appeal is submitted in good faith and represents my honest situation.`,

// ===========================================================
// 2. BUSINESS CRITICAL
// ===========================================================
 APPEAL_BUSINESS = (num, name, country) => `To: WhatsApp Business Support Team
Subject: URGENT — Business Account Ban Appeal — +${num}
Date: ${new Date().toDateString()}
Priority: HIGH

Dear WhatsApp Business Review Team,

I am writing to appeal the ban on my WhatsApp Business account registered under +${num}. This ban has severely disrupted my livelihood and the livelihoods of those who depend on me.

BUSINESS DETAILS:
- Owner: ${name}
- Number: +${num}
- Country: ${country}
- Business Type: Small Business / Self-Employed
- Years in Operation: Multiple
- Employees Dependent: [number]

IMPACT OF BAN:

My business operates entirely through WhatsApp. This number handles:
- Customer orders and inquiries
- Supplier communications
- Payment confirmations
- Delivery coordination
- Customer support

Since the ban, I have lost:
- Direct customer contact
- Pending orders worth significant value
- Business reputation built over years
- The trust of my regular customers

My family depends on this business. My employees depend on this business. The current situation is causing financial hardship that I cannot sustain.

COMPLIANCE STATEMENT:

I have read and understood WhatsApp's Business Policy, Commerce Policy, and Messaging Policy. I affirm that:
- I have not engaged in bulk unsolicited messaging
- I have not used unauthorized automation tools
- I have not shared prohibited content
- I have obtained proper consent from my customers

If any of my past actions inadvertently violated WhatsApp's policies, I deeply apologize and request a chance to correct them.

REQUEST:

I humbly request the WhatsApp Business team to:
1. Review my specific case
2. Provide clarity on the specific violation (if any)
3. Allow me to correct any issues
4. Restore my business account

I am willing to undergo any verification process, provide business documentation, or sign any compliance agreement you require.

This is my livelihood. This is my family's future. Please give me a fair chance.

Respectfully submitted,

${name}
Business: [Your Business Name]
Phone: +${num}
Email: [your_email@example.com]

---
Attachments available on request: Business registration, ID proof, customer testimonials.`,

// ===========================================================
// 3. FIRST-TIME / NEW USER
// ===========================================================
 APPEAL_FIRSTTIME = (num, name, country) => `To: WhatsApp Support Team
Subject: Appeal for Account Restoration — First-Time User — +${num}
Date: ${new Date().toDateString()}

Dear WhatsApp Support Team,

My name is ${name}. My WhatsApp account with the number +${num} has been banned, and I am writing this appeal with genuine confusion and a humble request for review.

I am not a tech-savvy person. I use WhatsApp simply to talk to my family and friends. I do not know what automation is, I do not run any business, and I have never intentionally sent spam to anyone.

ABOUT ME:
- Name: ${name}
- Number: +${num}
- Country: ${country}
- WhatsApp Usage: Personal only
- Contacts in Account: Family, Friends, Colleagues

WHAT HAPPENED:

One day, my WhatsApp suddenly stopped working. I received a message saying my account was banned. I was shocked. I asked my children to check what went wrong — they said sometimes numbers get banned by mistake.

I don't know how to fix this. I don't know who to contact. Someone from my family helped me write this email.

MY APPEAL:

Please, kind people at WhatsApp — I am not a bad person. I use WhatsApp only to talk to my children who live far away, to see my grandchildren's photos, and to stay in touch with my brothers and sisters.

If someone used my number for something wrong, it was not me. I don't understand these things. Please help an old person stay connected to their family.

I promise, from today onward, I will only use WhatsApp in the right way, and if anyone asks me to do something wrong, I will refuse.

Please give me back my number. My family is worried about me.

With respect and hope,

${name}
Phone: +${num}
Email: [your_email@example.com]`,

// ===========================================================
// 4. TECHNICAL MISTAKE APPEAL
// ===========================================================
 APPEAL_TECHNICAL = (num, name, country) => `To: WhatsApp Abuse Review Team
Subject: Appeal for Review — Possible False Positive Ban — +${num}
Date: ${new Date().toDateString()}
Reference: FALSEPOSITIVE-${num}

Dear WhatsApp Abuse Review Team,

My account (+${num}) has been banned, and based on my usage pattern, I strongly believe this is a false positive detection by your automated systems.

TECHNICAL CONTEXT:

I understand that WhatsApp uses automated detection systems to flag suspicious behavior. I also understand that these systems can occasionally produce false positives — accounts that are incorrectly flagged as spam or abuse.

I am writing this appeal to request a manual human review of my account before the ban is finalized.

MY USAGE PATTERN:

I use WhatsApp for legitimate personal communication. My typical daily activity includes:
- Chatting with family members (10-15 contacts)
- Participating in 2-3 study/work groups
- Sharing photos occasionally
- Making voice/video calls to relatives

Any recent activity that may have triggered your automated systems could include:
- Sharing a message forwarded multiple times (not by me — I received it)
- Being added to a group by a contact
- Sending identical "Good Morning" messages to family

None of this is spam — it's normal human behavior.

MY REQUEST:

I humbly request:
1. A manual review of my account by a human moderator
2. Clarity on the specific trigger that caused the ban
3. An opportunity to explain any questionable activity
4. Restoration if the ban was a mistake

I am willing to provide:
- Full chat history for review
- Contacts verification
- Video verification of myself
- Any other proof you require

I am an honest user who values WhatsApp deeply. Please don't let an automated mistake cost me my connection to my loved ones.

Waiting hopefully,

${name}
Phone: +${num}
Email: [your_email@example.com]

P.S. If my appeal is denied, I respectfully request the specific policy violation I committed, so I can learn and prevent it in the future.`,

// ===========================================================
// 5. RELIGIOUS / EMOTIONAL APPEAL
// ===========================================================
 APPEAL_RELIGIOUS = (num, name, country) => `To: WhatsApp Support Team
Subject: Humble Appeal for Account Restoration — +${num}
Date: ${new Date().toDateString()}

Bismillah-ir-Rahman-ir-Raheem

Dear WhatsApp Team,

I begin this appeal in the name of Allah, the Most Merciful, the Most Compassionate.

My name is ${name}, and my WhatsApp number +${num} has been banned. I accept that perhaps I made a mistake — knowingly or unknowingly — and I seek forgiveness from Allah for any wrong I may have done.

I also humbly ask forgiveness from you, WhatsApp team, for anything I may have done that violated your rules.

WHO I AM:

I am a simple Muslim. My WhatsApp account is used for:
- Staying in touch with my parents and siblings
- Receiving Quranic reminders in Islamic groups
- Sending Eid and Ramadan greetings to relatives
- Communicating with my children who study abroad

Nothing more. Nothing wrong.

WHY THIS MATTERS TO ME:

My mother calls me every Fajr to wake me up for prayer. My father asks about my well-being through WhatsApp every day. My children send me their photos and voice notes every week.

Without WhatsApp, I lose my connection to them. That connection is my only joy.

MY PROMISE:

If my account is restored, I promise before Allah and before you:
1. To use WhatsApp only for good purposes
2. To never spam, never forward misleading messages
3. To never use any automation or unauthorized tools
4. To comply fully with WhatsApp's Terms of Service
5. To be a positive member of the WhatsApp community

I ask this not for myself alone, but for my aging parents and my young children who need to reach me.

Please, for the sake of humanity, review my case with a kind heart.

With hope and gratitude,

${name}
Phone: +${num}
Email: [your_email@example.com]

"Verily, with hardship comes ease." — Al-Quran`,

// ===========================================================
// 6. HARDSHIP APPEAL
// ===========================================================
 APPEAL_HARDSHIP = (num, name, country) => `To: WhatsApp Support Team
Subject: Appeal from a Hardship Case — Please Review — +${num}
Date: ${new Date().toDateString()}

Dear WhatsApp Team,

I am writing this appeal not with pride, but with a broken heart and tears in my eyes.

My name is ${name}. My WhatsApp account +${num} has been banned, and this has shattered my last connection to the world outside my difficult life.

MY SITUATION:

I am going through one of the hardest phases of my life. I have health problems. I have financial difficulties. My family depends on me, and I have nothing to give them except my presence through WhatsApp calls.

This number is the only way I can:
- Talk to my doctor about my treatment
- Receive updates from my children's school
- Coordinate with relatives helping me financially
- Hear my mother's voice, who lives far away

MY HONEST CONFESSION:

Perhaps I used WhatsApp in a way I shouldn't have. Maybe I forwarded a message without thinking. Maybe I added too many people to a group. I don't fully understand all the rules.

But I never meant any harm. I am not a bad person. I am just a tired person trying to survive.

MY REQUEST:

I don't have money for lawyers. I don't know anyone important. I only have this email and hope.

Please, kind people at WhatsApp — look at my account. Look at my chats. See that I am not a spammer, not an abuser, not a scammer. See that I am just a human being in pain.

Please give me back my number ${num}. Give me back my family's access to me.

I promise I will never misuse it again. I have learned my lesson the hard way.

With folded hands and a heavy heart,

${name}
Phone: +${num}
Email: [your_email@example.com]`,

// ===========================================================
// 7. STUDENT/TEEN APPEAL
// ===========================================================
 APPEAL_STUDENT = (num, name, country) => `To: WhatsApp Support Team
Subject: Appeal from a Student — Account Restoration — +${num}
Date: ${new Date().toDateString()}

Dear WhatsApp Team,

I am ${name}, a student, and my WhatsApp number +${num} has been banned. I am writing this appeal with hope that you will understand my situation.

MY ACADEMIC LIFE:

All of my studies depend on WhatsApp:
- Class groups where teachers share notes
- Study groups with my classmates
- Important exam schedules and reminders
- Project coordination with teammates
- Contact with my professors

My parents are not rich — they can barely afford my education. I cannot afford to buy a new SIM every time this happens. My only phone is this number.

WHAT I THINK HAPPENED:

I recently shared some study material with my classmates. Maybe I forwarded it to too many people at once. Maybe someone reported me thinking it was spam. I truly did not know this could cause a ban.

I have learned now. I will never do this again.

MY REQUEST:

Please, please unban my number ${num}. My exams are near. I cannot afford to fail because of a communication issue.

I promise:
- To only send messages that are necessary
- To never forward anything unnecessarily
- To respect WhatsApp's rules completely
- To be a responsible user

I am a young person who wants to succeed in life. Please don't let this small mistake ruin my future.

Yours sincerely,

${name}
Student
Phone: +${num}
Email: [your_email@example.com]`,

// ===========================================================
// 8. LAWYER-STYLE FORMAL APPEAL
// ===========================================================
 APPEAL_LAWYER = (num, name, country) => `NOTICE OF APPEAL
FORMAL APPEAL UNDER WHATSAPP TERMS OF SERVICE

To: WhatsApp Appeals Committee
WhatsApp LLC
Mountain View, California, USA

Date: ${new Date().toDateString()}
Reference: ACCOUNT-APPEAL-${num}-${Date.now().toString().slice(-6)}

Dear Sir/Madam,

This is a formal appeal submitted on behalf of ${name}, holder of WhatsApp account registered under phone number +${num} in ${country}.

SUMMARY OF GRIEVANCE:

On or around ${new Date().toDateString()}, the WhatsApp account associated with +${num} was banned without prior notice, warning, or explanation to the account holder. The account holder was not informed of:
1. The specific Terms of Service provision allegedly violated
2. The evidence relied upon for the ban decision
3. The mechanism to appeal the decision

LEGAL STANDARDS APPLICABLE:

We note that WhatsApp's own Terms of Service and Community Guidelines provide for fair process. Additionally, consumer protection laws in many jurisdictions require:
- Notice of alleged violation
- Opportunity to respond
- Reasoned decision

The current ban, without explanation, appears to violate these principles of natural justice.

MITIGATING CIRCUMSTANCES:

Without admission of liability, the account holder acknowledges that:
- If any automated tool was used without awareness, this was unintentional
- If any message was forwarded excessively, this was without malice
- Any technical violation, if committed, was not deliberate

The account holder has been a loyal WhatsApp user for years and has never been accused of abuse previously. This appears to be an isolated incident, if an incident at all.

REQUEST FOR RELIEF:

We respectfully request:
1. Immediate review of the ban decision by a human moderator
2. Disclosure of the specific policy violation (if any)
3. An opportunity for the account holder to submit additional evidence
4. Restoration of account if the ban was issued in error
5. Written explanation if the ban is upheld, so the account holder may comply going forward

SUPPORTING EVIDENCE AVAILABLE:

Upon request, we can provide:
- Government-issued ID of account holder
- Proof of legitimate use (chat samples, contact list)
- Character testimonials
- Any technical logs of account activity

CONCLUSION:

WhatsApp's mission is to connect the world. For my client, this account is their world. The account holder is not a threat to WhatsApp's platform — they are a victim of what appears to be an automated error.

We trust that WhatsApp will review this matter fairly.

Yours faithfully,

On behalf of ${name}
Phone: +${num}
Email: [your_email@example.com]

CC: WhatsApp Legal Department
CC: Consumer Protection Authorities (if unresolved)`,

// ===========================================================
// 9. ELDERLY USER APPEAL
// ===========================================================
 APPEAL_ELDERLY = (num, name, country) => `To: WhatsApp Support Team
Subject: Appeal from a Senior Citizen — Account Restoration — +${num}

Respected WhatsApp Team,

My name is ${name}, and I am an elderly person. My phone number is +${num}, and it has been banned.

I do not fully understand technology. My grandchildren set up this WhatsApp for me so I could see their photos and hear their voices.

WHY THIS MATTERS TO ME:

I am old. I cannot travel to meet my children and grandchildren. WhatsApp is the only way I can see their faces and hear their voices. Every day, I look forward to my son's "Good Morning" message. Every night, my granddaughter sings me a song on voice note.

Now there is only silence. And my heart is heavy.

WHAT I UNDERSTAND:

My grandchildren tell me maybe someone reported my number because I forwarded a religious message to my family group. I didn't know this was wrong. I thought I was sharing blessings.

If this is what caused the ban, please forgive an old person's mistake. I will not do it again. I don't even understand half the buttons on my phone.

MY HUMBLE REQUEST:

Please give me back my WhatsApp ${num}. I am an old person with a limited life. WhatsApp is my window to my family.

I don't want to spend my last days in silence.

Please have mercy on an old person.

With folded hands,

${name}
Phone: +${num}
Age: Senior Citizen`,

// ===========================================================
// 10. HEARTBREAKING FAMILY CASE
// ===========================================================
 APPEAL_FAMILY = (num, name, country) => `To: WhatsApp Support Team
Subject: Please Don't Take My Children Away From Me — Appeal for +${num}
Date: ${new Date().toDateString()}

Dear WhatsApp Team,

I am a parent. My name is ${name}. My WhatsApp number +${num} has been banned. And with it, my daily connection to my children.

Please hear me out.

MY CHILDREN:

I have [number] children. They live with their mother after our separation. WhatsApp is the only way I can see them every day. Every night, they video call me on this number to say "Good night, Baba." Every morning, they message me before school.

That is my only happiness. That is my reason to keep going.

WHAT HAPPENED:

I don't know what caused the ban. Maybe I shared too many messages. Maybe I was added to some group that sent spam. Maybe something happened I don't even know about.

But I know this: I would never do anything to risk my connection to my children. Never.

MY REQUEST:

Please, for the sake of my children, review my account. I will do anything you need — video verification, ID proof, anything. Just don't take my children away from me.

They don't understand why Baba is not calling. They ask their mother, "Why is Baba angry at us?" He is not angry. Baba's phone is silent. Baba is crying.

Please give me back my number.

A desperate father,
${name}
Phone: +${num}
Email: [your_email@example.com]

"What kind of father would I be if I didn't fight for my children?"`;

// ===========================================================
// MAIN UNBAN-HARD COMMAND
// ===========================================================
cmd({
    pattern: 'unbanhard',
    alias: ['hardunban', 'strongappeal', 'hardappeal'],
    desc: 'Hard emotional WhatsApp unban appeal (email ready)',
    category: 'tools',
    react: '📧',
    use: '.unbanhard <number> <name> <country>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const args = (ctx.q || '').split('|').map(x => x.trim());

    if (args.length < 3) {
        return ctx.reply([
            '📧 *HARD UNBAN APPEAL GENERATOR*',
            '',
            'Use: `.unbanhard <number> | <name> | <country>`',
            '',
            '*Example:*',
            '`.unbanhard 923XXXXXXXXX | Your name | Pakistan`',
            '',
            '*Options:*',
            '`.unbanhard 923XXXXXXXXX | Your name | Pakistan legal`',
            '`.unbanhard 923XXXXXXXXX | Your name | Pakistan business`',
            '`.unbanhard 923XXXXXXXXX | Your name | Pakistan student`',
            '`.unbanhard 923XXXXXXXXX | Your name | Pakistan family`',
            '',
            '*Types:*',
            '• `legal` — Legal-style formal appeal (strongest)',
            '• `business` — Business account appeal',
            '• `student` — Student appeal',
            '• `family` — Family/parent appeal',
            '• `elderly` — Senior citizen appeal',
            '• `religious` — Islamic appeal',
            '• `hardship` — Hardship case',
            '• `firsttime` — First-time user',
            '• `technical` — False positive',
            '• `default` — Legal appeal'
        ].join('\n'));
    }

    const [rawNum, name, country, type = 'legal'] = args;
    const number = rawNum.replace(/\D/g, '');

    if (number.length < 10) return ctx.reply('❌ Valid number do (10+ digits).');

    // Template map
    const templates = {
        legal: APPEAL_LEGAL,
        business: APPEAL_BUSINESS,
        student: APPEAL_STUDENT,
        family: APPEAL_FAMILY,
        elderly: APPEAL_ELDERLY,
        religious: APPEAL_RELIGIOUS,
        hardship: APPEAL_HARDSHIP,
        firsttime: APPEAL_FIRSTTIME,
        technical: APPEAL_TECHNICAL,
        lawyer: APPEAL_LAWYER,
        default: APPEAL_LEGAL
    };

    const template = templates[type.toLowerCase()] || APPEAL_LEGAL;
    const appeal = template(number, name, country);

    // Header
    const header = `📧 *HARD UNBAN APPEAL*\n\n` +
        `📱 Number: *${number}*\n` +
        `👤 Name: *${name}*\n` +
        `🌍 Country: *${country}*\n` +
        `🎯 Type: *${type.toUpperCase()}*\n` +
        `📅 Date: *${new Date().toLocaleString()}*\n\n` +
        `━━━━━━━━━━━━━━━━━\n\n`;

    const fullText = header + appeal + '\n\n━━━━━━━━━━━━━━━━━\n\n' +
        `📧 *SEND TO:*\n` +
        `support@whatsapp.com\n` +
        `support@support.whatsapp.com\n` +
        `android_web@support.whatsapp.com\n` +
        `ios_web@support.whatsapp.com\n\n` +
        `⚠️ *Sabko bhejo* — ek hi time pe multiple emails`;

    // Send in parts (WhatsApp limit 4096)
    const maxLen = 3800;
    if (fullText.length <= maxLen) {
        await conn.sendMessage(ctx.from, { text: fullText }, { quoted: mek });
    } else {
        const parts = [];
        for (let i = 0; i < fullText.length; i += maxLen) {
            parts.push(fullText.slice(i, i + maxLen));
        }
        for (let i = 0; i < parts.length; i++) {
            await conn.sendMessage(ctx.from, {
                text: `📄 *PART ${i + 1}/${parts.length}*\n\n${parts[i]}`
            }, { quoted: mek });
            await new Promise(r => setTimeout(r, 800));
        }
    }

    await new Promise(r => setTimeout(r, 1000));

    return conn.sendMessage(ctx.from, {
        text: [
            '📧 *HOW TO SUBMIT:*',
            '',
            '1️⃣ Copy the appeal above',
            '2️⃣ Gmail/Outlook kholo',
            '3️⃣ Subject: *Appeal for Account Restoration — +' + number + '*',
            '4️⃣ Paste the appeal',
            '5️⃣ *CC:* support@support.whatsapp.com',
            '6️⃣ Send',
            '',
            '💡 *PRO TIPS:*',
            '• Har 2 din me naya appeal bhejo (naya type use karo)',
            '• Different emails use karo (Gmail, Outlook, Yahoo)',
            '• Ek appeal → ek email address (mass nahi)',
            '• Reply aane pe patiently respond karo',
            '• 7-14 din me jawab aa sakta hai',
            '',
            '🎯 *Generated by:* ' + (config.BOT_NAME || '𝗔𝗠𝗔𝗡-𝐌𝐃')
        ].join('\n')
    }, { quoted: mek });
});

// ===========================================================
// QUICK UNBAN — Sirf number do, appeal
// ===========================================================
cmd({
    pattern: 'unban',
    alias: ['appeal'],
    desc: 'Quick unban appeal',
    category: 'tools',
    react: '📧',
    use: '.unban <number>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const number = (ctx.q || '').replace(/\D/g, '');
    if (number.length < 10) {
        return ctx.reply('Use: `.unban 923XXXXXXXXX`\n\n💡 Full version: `.unbanhard <num> | <name> | <country> legal`');
    }

    // Default: legal appeal
    const appeal = APPEAL_LEGAL(number, 'WhatsApp User', 'Pakistan');

    const parts = [];
    const maxLen = 3800;
    for (let i = 0; i < appeal.length; i += maxLen) {
        parts.push(appeal.slice(i, i + maxLen));
    }

    for (let i = 0; i < parts.length; i++) {
        await conn.sendMessage(ctx.from, {
            text: `📄 *APPEAL PART ${i + 1}/${parts.length}*\n\n${parts[i]}`
        }, { quoted: mek });
        await new Promise(r => setTimeout(r, 800));
    }

    return ctx.reply(
        `📧 *Send to:*\n` +
        `support@whatsapp.com\n` +
        `support@support.whatsapp.com\n\n` +
        `💡 *Full version:* \`.unbanhard <num> | <name> | <country> legal\``
    );
});