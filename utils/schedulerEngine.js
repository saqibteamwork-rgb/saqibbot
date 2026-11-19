'use strict';

/**
 * MR SAQIB MD :: Advanced Automation & Scheduler Engine
 * ============================================================================
 * Provides high-performance scheduled background automation:
 *   1. Timed Auto-Poster (Groups & WhatsApp Channels)
 *   2. Smart Group Schedule Manager (Auto-close at night, auto-open in morning)
 *   3. Daily Auto Content Drops (Authentic Islamic, Motivation, Tech Updates)
 *   4. Persistent Storage (data/schedules.json) - zero timer loss across restarts
 *   5. Pakistan Standard Time (PKT, UTC+5) default reference
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const settings = require('../settings');

const SCHEDULES_FILE = path.join(__dirname, '..', 'data', 'schedules.json');

// Curated daily content library
const DAILY_CONTENT_LIBRARY = {
    islamic: [
        {
            title: "🌙 فرمانِ مصطفیٰ ﷺ (صحیح بخاری)",
            text: "رسول اللہ ﷺ نے فرمایا:\n\"تم میں سے بہترین شخص وہ ہے جو قرآن سیکھے اور دوسروں کو سکھائے۔\"\n\n📖 حوالہ: صحیح بخاری (5027)",
            dua: "🤲 اے اللہ! ہمیں قرآن پاک پڑھنے، سمجھنے اور اس پر عمل کرنے کی توفیق عطا فرما۔ آمین!"
        },
        {
            title: "🌙 فرمانِ مصطفیٰ ﷺ (صحیح مسلم)",
            text: "رسول اللہ ﷺ نے فرمایا:\n\"مسلمان وہ ہے جس کی زبان اور ہاتھ سے دوسرے مسلمان محفوظ رہیں۔\"\n\n📖 حوالہ: صحیح مسلم (65)",
            dua: "🤲 اے اللہ! ہمارے اخلاق کو سنوار اور ہمیں خیر بانٹنے والا بنا۔ آمین!"
        },
        {
            title: "🌙 قرآنِ مجید کی نصیحت (سورۃ البقرہ)",
            text: "ارشادِ باری تعالیٰ ہے:\n\"اور صبر اور نماز کے ذریعے اللہ سے مدد مانگو، اور بے شک یہ نماز بہت بھاری ہے مگر ان پر جو خشوع کرنے والے ہیں۔\"\n\n📖 حوالہ: سورۃ البقرہ (45)",
            dua: "🤲 اے ہمارے پروردگار! ہمیں پنج وقتہ نماز کا پابند اور صابر بنا۔ آمین!"
        },
        {
            title: "🌙 فرمانِ مصطفیٰ ﷺ (سنن ترمذی)",
            text: "رسول اللہ ﷺ نے فرمایا:\n\"دعا عبادت کا مغز (حقیقت) ہے۔\"\n\n📖 حوالہ: جامع ترمذی (3371)",
            dua: "🤲 یا رب العالمین! ہمارے تمام جائز مقاصد پورے فرما اور ہمارے گناہ معاف فرما۔ آمین!"
        },
        {
            title: "🌙 فرمانِ مصطفیٰ ﷺ (صحیح بخاری)",
            text: "رسول اللہ ﷺ نے فرمایا:\n\"اللہ تعالیٰ کے نزدیک سب سے پسندیدہ عمل وہ ہے جو ہمیشہ کیا جائے، اگرچہ تھوڑا ہی کیوں نہ ہو۔\"\n\n📖 حوالہ: صحیح بخاری (6464)",
            dua: "🤲 یا اللہ! ہمیں نیک اعمال میں استقامت نصیب فرما۔ آمین!"
        }
    ],
    quote: [
        {
            title: "🔥 Daily Motivational Thought",
            text: "“کامیابی کا راز یہ نہیں کہ آپ کبھی گریں نہیں، بلکہ یہ ہے کہ آپ ہر بار گرنے کے بعد دوبارہ کھڑے ہو جائیں۔”\n\n💪 Never give up on your dreams. Consistency is the master key!",
            author: "MR SAQIB Motivation"
        },
        {
            title: "🔥 Daily Motivational Thought",
            text: "“وقت اور عزت دو ایسی چیزیں ہیں جو گنوانا بہت آسان ہے لیکن کمانا بہت مشکل۔ اپنے آج کا ایک ایک سیکنڈ قیمتی بنائیں۔”\n\n⚡ Focus on your goals, not the noise around you.",
            author: "MR SAQIB Motivation"
        },
        {
            title: "🔥 Daily Motivational Thought",
            text: "“اگر آپ سورج کی طرح چمکنا چاہتے ہیں، تو پہلے سورج کی طرح جلنا سیکھیں۔ محنت وہ خاموش طاقت ہے جو تاریخ بدل دیتی ہے۔”\n\n🚀 Hard work beats talent when talent doesn't work hard.",
            author: "MR SAQIB Motivation"
        }
    ],
    tech: [
        {
            title: "💻 Daily Tech & Security Tip",
            text: "🔒 *Two-Factor Authentication (2FA) Alert:*\nKabhi bhi kisi bhi platform par sirf password par bharosa na karein. Apne WhatsApp aur Social accounts par Two-Step Verification foran activate karein taake account hacking se 100% mehfooz rahe!",
            source: "MR SAQIB Cyber Shield"
        },
        {
            title: "💻 Daily Tech & Security Tip",
            text: "⚡ *WhatsApp Storage Cleaner Tip:*\nWhatsApp settings > Storage and data > Manage storage mein ja kar 5MB se bari forward hone wali purani videos delete karein. Aapka phone aur WhatsApp 3x tez chale ga!",
            source: "MR SAQIB Tech Tips"
        },
        {
            title: "💻 Daily Tech & Security Tip",
            text: "🤖 *Modern AI Productivity Hack:*\nAI prompts likhte waqt hamesha AI ko ek specific role dein (e.g. 'Act as a senior software engineer'). Aisa karne se AI answers 10x zyada accurate aur professional deta hai!",
            source: "MR SAQIB AI Knowledge"
        }
    ]
};

// In-memory schedules state
let activeSchedules = [];
let tickerInterval = null;
let currentSock = null;
let lastFiredMinutes = new Set();

/**
 * Returns current Pakistan Standard Time (PKT, UTC+5)
 */
function getPktTime() {
    const now = new Date();
    const pktDate = new Date(now.getTime() + (5 * 60 + now.getTimezoneOffset()) * 60000);
    const pad = n => String(n).padStart(2, '0');
    const hours = pktDate.getHours();
    const minutes = pktDate.getMinutes();
    const time24 = `${pad(hours)}:${pad(minutes)}`;
    
    let h12 = hours % 12 || 12;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const time12 = `${pad(h12)}:${pad(minutes)} ${ampm}`;

    const dateStr = `${pad(pktDate.getDate())}/${pad(pktDate.getMonth() + 1)}/${pktDate.getFullYear()}`;
    return { hours, minutes, time24, time12, dateStr, day: pktDate.getDay() };
}

/**
 * Normalize any input time string (e.g., '9:00 pm', '09:00PM', '21:00', '7:30 am') to 24h 'HH:mm'
 */
function parseTimeTo24h(input) {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim().toLowerCase();

    // Match 12h format e.g. "9:30 pm", "09:30pm", "11 am", "11:00 am"
    const match12 = clean.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)$/i);
    if (match12) {
        let h = parseInt(match12[1], 10);
        const m = parseInt(match12[2] || '0', 10);
        const ampm = match12[3].toLowerCase();
        if (h < 1 || h > 12 || m < 0 || m > 59) return null;
        if (ampm === 'pm' && h < 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // Match 24h format e.g. "21:30", "09:00"
    const match24 = clean.match(/^(\d{1,2}):(\d{1,2})$/);
    if (match24) {
        const h = parseInt(match24[1], 10);
        const m = parseInt(match24[2], 10);
        if (h < 0 || h > 23 || m < 0 || m > 59) return null;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    return null;
}

/**
 * Format 'HH:mm' 24h into pleasant 12h string (e.g. '09:00 PM')
 */
function format24hTo12h(time24) {
    if (!time24 || !time24.includes(':')) return time24;
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr.padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
}

/**
 * Load schedules safely from data/schedules.json
 */
function loadSchedules() {
    try {
        const dir = path.dirname(SCHEDULES_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(SCHEDULES_FILE)) {
            fs.writeFileSync(SCHEDULES_FILE, JSON.stringify({ schedules: [] }, null, 2));
            activeSchedules = [];
            return activeSchedules;
        }
        const data = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
        activeSchedules = Array.isArray(data?.schedules) ? data.schedules : [];
        return activeSchedules;
    } catch (err) {
        console.error('[SchedulerEngine Error loading schedules]:', err.message);
        activeSchedules = [];
        return activeSchedules;
    }
}

/**
 * Save schedules atomically to data/schedules.json
 */
function saveSchedules() {
    try {
        const dir = path.dirname(SCHEDULES_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tempPath = `${SCHEDULES_FILE}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify({ schedules: activeSchedules, updatedAt: new Date().toISOString() }, null, 2));
        fs.renameSync(tempPath, SCHEDULES_FILE);
        return true;
    } catch (err) {
        console.error('[SchedulerEngine Error saving schedules]:', err.message);
        return false;
    }
}

/**
 * Add a new scheduled task
 */
function addSchedule(scheduleObj) {
    loadSchedules();
    const id = scheduleObj.id || `SCH_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newEntry = {
        id,
        type: scheduleObj.type, // 'timed_post' | 'group_mute_unmute' | 'daily_drop'
        targetJid: scheduleObj.targetJid,
        destinations: Array.isArray(scheduleObj.destinations) ? scheduleObj.destinations : (scheduleObj.targetJid ? [scheduleObj.targetJid] : []),
        targetName: scheduleObj.targetName || 'Target',
        time24: scheduleObj.time24,
        openTime24: scheduleObj.openTime24 || null,
        message: scheduleObj.message || '',
        category: scheduleObj.category || 'islamic',
        mediaUrl: scheduleObj.mediaUrl || null,
        mediaType: scheduleObj.mediaType || null,
        mediaPath: scheduleObj.mediaPath || null,
        fileName: scheduleObj.fileName || null,
        isPtt: Boolean(scheduleObj.isPtt),
        recurring: scheduleObj.recurring !== false, // default true (daily)
        enabled: scheduleObj.enabled !== false,
        createdBy: scheduleObj.createdBy || 'Owner',
        createdAt: new Date().toISOString()
    };

    // If a group_mute_unmute schedule already exists for this group, update it
    if (newEntry.type === 'group_mute_unmute') {
        activeSchedules = activeSchedules.filter(s => !(s.type === 'group_mute_unmute' && s.targetJid === newEntry.targetJid));
    }
    // If a daily_drop schedule already exists for this group, update it
    if (newEntry.type === 'daily_drop') {
        activeSchedules = activeSchedules.filter(s => !(s.type === 'daily_drop' && s.targetJid === newEntry.targetJid));
    }

    activeSchedules.push(newEntry);
    saveSchedules();
    return newEntry;
}

/**
 * Delete a schedule by ID
 */
function removeSchedule(id, requestedByJid = null, isOwner = false) {
    loadSchedules();
    const target = activeSchedules.find(s => s.id === id);
    if (!target) return { success: false, reason: 'Schedule not found' };

    // Security: Only owner or the group admin from same group can delete
    if (!isOwner && requestedByJid && target.targetJid !== requestedByJid) {
        return { success: false, reason: 'Permission denied' };
    }

    activeSchedules = activeSchedules.filter(s => s.id !== id);
    saveSchedules();
    return { success: true, schedule: target };
}

/**
 * Toggle (pause/resume) a schedule
 */
function toggleSchedule(id, requestedByJid = null, isOwner = false) {
    loadSchedules();
    const target = activeSchedules.find(s => s.id === id);
    if (!target) return { success: false, reason: 'Schedule not found' };

    if (!isOwner && requestedByJid && target.targetJid !== requestedByJid) {
        return { success: false, reason: 'Permission denied' };
    }

    target.enabled = !target.enabled;
    saveSchedules();
    return { success: true, enabled: target.enabled, schedule: target };
}

/**
 * List schedules for a specific target JID or all (if owner)
 */
function listSchedules(targetJid = null, isOwner = false) {
    loadSchedules();
    if (isOwner && !targetJid) {
        return activeSchedules;
    }
    if (targetJid) {
        return activeSchedules.filter(s => s.targetJid === targetJid);
    }
    return [];
}

/**
 * Execute a specific schedule item
 */
async function executeSchedule(sock, schedule) {
    if (!sock || !schedule || !schedule.enabled) return;

    const channelBadge = {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: settings.newsletterJid || '120363431913895899@newsletter',
            newsletterName: settings.channelName || 'Mr SAQIB',
            serverMessageId: 1
        }
    };

    try {
        // --- 1. Timed Custom Post ---
        if (schedule.type === 'timed_post') {
            const header = `╭━━━〔 📢 *MR SAQIB MD SCHEDULED POST* 〕━━━┈⊷\n\n`;
            const footer = `\n\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷\n> *⚡ Powered By MR SAQIB MD*`;
            const postText = schedule.message ? `${header}${schedule.message}${footer}` : `╭━━━〔 📢 *MR SAQIB MD BROADCAST* 〕━━━┈⊷\n\n> *⚡ Powered By MR SAQIB MD*`;

            // Resolve target destinations (supports single target or array of 10-20 channels/groups)
            let targetJids = [];
            const rawDests = (Array.isArray(schedule.destinations) && schedule.destinations.length > 0)
                ? schedule.destinations
                : [schedule.targetJid];

            for (const d of rawDests) {
                if (!d) continue;
                if (d === 'all' || d === 'all_groups') {
                    try {
                        const groups = await sock.groupFetchAllParticipating();
                        targetJids.push(...Object.keys(groups));
                    } catch (e) {
                        console.warn('[SchedulerEngine] Failed to fetch participating groups:', e.message);
                    }
                } else if (d === 'channel') {
                    targetJids.push(settings.newsletterJid || config.newsletterJid || '120363431913895899@newsletter');
                } else {
                    targetJids.push(d);
                }
            }
            // De-duplicate targets
            targetJids = [...new Set(targetJids.filter(Boolean))];

            for (const jid of targetJids) {
                try {
                    let msgPayload = null;

                    if (schedule.mediaPath && fs.existsSync(schedule.mediaPath)) {
                        const buffer = fs.readFileSync(schedule.mediaPath);
                        if (schedule.mediaType === 'video') {
                            msgPayload = { video: buffer, caption: postText, mimetype: 'video/mp4', contextInfo: channelBadge };
                        } else if (schedule.mediaType === 'image') {
                            msgPayload = { image: buffer, caption: postText, contextInfo: channelBadge };
                        } else if (schedule.mediaType === 'audio') {
                            msgPayload = { audio: buffer, mimetype: 'audio/mp4', ptt: Boolean(schedule.isPtt), contextInfo: channelBadge };
                        } else if (schedule.mediaType === 'document') {
                            msgPayload = { document: buffer, fileName: schedule.fileName || 'Scheduled_Doc.pdf', caption: postText, contextInfo: channelBadge };
                        }
                    } else if (schedule.mediaUrl) {
                        let imgSource = { url: schedule.mediaUrl };
                        if (String(schedule.mediaUrl).startsWith('/')) {
                            const localStatic = path.join(__dirname, '..', 'public', String(schedule.mediaUrl).replace(/^\/+/, ''));
                            if (fs.existsSync(localStatic)) {
                                imgSource = fs.readFileSync(localStatic);
                            }
                        }
                        msgPayload = { image: imgSource, caption: postText, contextInfo: channelBadge };
                    } else {
                        msgPayload = { text: postText, contextInfo: channelBadge };
                    }

                    if (msgPayload) {
                        await sock.sendMessage(jid, msgPayload);
                    }
                } catch (sendErr) {
                    console.warn(`[SchedulerEngine] Delivery failed to ${jid}:`, sendErr.message);
                }

                // Anti-ban delay if broadcasting to multiple groups
                if (targetJids.length > 1) {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            // If one-time, remove it
            if (!schedule.recurring) {
                activeSchedules = activeSchedules.filter(s => s.id !== schedule.id);
                saveSchedules();
            }
            console.log(`[SchedulerEngine] Executed timed_post (${schedule.id}) to ${targetJids.length} destination(s)`);
        }

        // --- 2. Smart Group Mute / Unmute ---
        else if (schedule.type === 'group_mute_unmute') {
            const { time24, openTime24, targetJid } = schedule;
            const pkt = getPktTime();

            if (pkt.time24 === time24) {
                // Close Group (Announce mode)
                await sock.groupSettingUpdate(targetJid, 'announcement').catch(err => {
                    console.warn(`[SchedulerEngine] Group close failed: ${err.message}`);
                });

                const closeNotice =
`╭━━━〔 🌙 *GROUP AUTO-SLEEP (CLOSED)* 〕━━━┈⊷
┃ 🔒 *Status:* CLOSED (Admins Only)
┃ ⏰ *Time:* ${format24hTo12h(time24)} (PKT)
┃ 
┃ ✦ Raat ke auqat mein aaraam ke peshe nazar
┃   group ko mute kar diya gaya hai.
┃ ✦ InshaAllah subah *${format24hTo12h(openTime24)}* par
┃   group auto-unmute ho jayega!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD*`;

                await sock.sendMessage(targetJid, { text: closeNotice, contextInfo: channelBadge }).catch(() => {});
                console.log(`[SchedulerEngine] Auto-closed group ${targetJid}`);
            } else if (pkt.time24 === openTime24) {
                // Open Group (Not announce mode)
                await sock.groupSettingUpdate(targetJid, 'not_announcement').catch(err => {
                    console.warn(`[SchedulerEngine] Group open failed: ${err.message}`);
                });

                const openNotice =
`╭━━━〔 ☀️ *GOOD MORNING (GROUP OPEN)* 〕━━━┈⊷
┃ 🔓 *Status:* OPEN (All Members Can Chat)
┃ ⏰ *Time:* ${format24hTo12h(openTime24)} (PKT)
┃
┃ ✦ Subah Bakhair! Group chat open kar di gayi hai.
┃ ✦ Tamam members group rules ka khayal rakhein!
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *⚡ Powered By MR SAQIB MD*`;

                await sock.sendMessage(targetJid, { text: openNotice, contextInfo: channelBadge }).catch(() => {});
                console.log(`[SchedulerEngine] Auto-opened group ${targetJid}`);
            }
        }

        // --- 3. Daily Content Drop ---
        else if (schedule.type === 'daily_drop') {
            const category = schedule.category || 'islamic';
            const pool = DAILY_CONTENT_LIBRARY[category] || DAILY_CONTENT_LIBRARY.islamic;
            // Pick based on day of month so it changes daily
            const dayIndex = new Date().getDate() % pool.length;
            const item = pool[dayIndex];

            let dropText = '';
            if (category === 'islamic') {
                dropText =
`╭━━━〔 ${item.title} 〕━━━┈⊷
┃
┃ ${item.text.replace(/\n/g, '\n┃ ')}
┃
┃ ${item.dua.replace(/\n/g, '\n┃ ')}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *📅 Daily Islamic Inspiration • MR SAQIB MD*`;
            } else if (category === 'quote') {
                dropText =
`╭━━━〔 ${item.title} 〕━━━┈⊷
┃
┃ ${item.text.replace(/\n/g, '\n┃ ')}
┃
┃ ✍️ *Author:* ${item.author}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *🔥 Daily Motivation • MR SAQIB MD*`;
            } else if (category === 'tech') {
                dropText =
`╭━━━〔 ${item.title} 〕━━━┈⊷
┃
┃ ${item.text.replace(/\n/g, '\n┃ ')}
┃
┃ 🛡️ *Source:* ${item.source}
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷

> *💻 Daily Tech Insights • MR SAQIB MD*`;
            }

            await sock.sendMessage(schedule.targetJid, {
                text: dropText,
                contextInfo: channelBadge
            }).catch(e => console.warn(`[DailyDrop Send Error]:`, e.message));

            console.log(`[SchedulerEngine] Dropped daily ${category} to ${schedule.targetJid}`);
        }
    } catch (err) {
        console.error(`[SchedulerEngine Execution Error for ${schedule.id}]:`, err.message);
    }
}

/**
 * Ticker loop running every 30 seconds
 */
function tick(sock) {
    if (!sock) return;
    const pkt = getPktTime();
    const currentKey = `${pkt.dateStr}|${pkt.time24}`;

    // Clean up cache older than today
    if (lastFiredMinutes.size > 200) {
        lastFiredMinutes.clear();
    }

    loadSchedules();

    for (const schedule of activeSchedules) {
        if (!schedule.enabled) continue;

        // Key to prevent firing multiple times within the same minute
        const scheduleKey = `${currentKey}|${schedule.id}`;

        if (schedule.type === 'timed_post' || schedule.type === 'daily_drop') {
            if (schedule.time24 === pkt.time24) {
                if (!lastFiredMinutes.has(scheduleKey)) {
                    lastFiredMinutes.add(scheduleKey);
                    executeSchedule(sock, schedule);
                }
            }
        } else if (schedule.type === 'group_mute_unmute') {
            const isCloseTime = schedule.time24 === pkt.time24;
            const isOpenTime = schedule.openTime24 === pkt.time24;
            if (isCloseTime || isOpenTime) {
                const subKey = `${scheduleKey}|${isCloseTime ? 'close' : 'open'}`;
                if (!lastFiredMinutes.has(subKey)) {
                    lastFiredMinutes.add(subKey);
                    executeSchedule(sock, schedule);
                }
            }
        }
    }
}

/**
 * Initialize Scheduler with active socket
 */
function initScheduler(sock) {
    currentSock = sock;
    loadSchedules();
    console.log(`[SchedulerEngine] Initialized with ${activeSchedules.length} schedules.`);

    if (tickerInterval) clearInterval(tickerInterval);
    tickerInterval = setInterval(() => {
        tick(currentSock);
    }, 30000); // 30s checks guarantee exact minute match
}

module.exports = {
    initScheduler,
    addSchedule,
    removeSchedule,
    toggleSchedule,
    listSchedules,
    parseTimeTo24h,
    format24hTo12h,
    getPktTime,
    DAILY_CONTENT_LIBRARY
};
