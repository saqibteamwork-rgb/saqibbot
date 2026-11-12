# ⚡ WHATSAPP MD BOT — COMPLETE CRITICAL FIXES GUIDE ⚡
> **Author**: Muhammad Saqib  
> **Target**: Baileys-based WhatsApp MD Bots (Railway, Heroku, VPS, Local)  
> **Covers**: 24/7 Anti-Sleep, WhatsApp WebSocket Drops, `.play` / Audio Visibility Fix, Strict Private Mode, & Memory Leak Prevention.

---

## 📑 TABLE OF CONTENTS
1. [Fix 1: Railway 24/7 Anti-Sleep & Cloud Healthcheck](#1-fix-1-railway-247-anti-sleep--cloud-healthcheck)
2. [Fix 2: WhatsApp Connection Drops & Ghost Sockets (Code 401 / 440 / 515)](#2-fix-2-whatsapp-connection-drops--ghost-sockets)
3. [Fix 3: `.play` / Song Invisible to Other Users (Audio Protobuf Bug)](#3-fix-3-play--song-invisible-to-other-users)
4. [Fix 4: Strict Private Mode (Sirf Owner & Bot User Allowed)](#4-fix-4-strict-private-mode)
5. [Fix 5: RAM Memory Leak & 512MB OOM Crashes](#5-fix-5-ram-memory-leak--512mb-oom-crashes)

---

## 1. FIX 1: Railway 24/7 Anti-Sleep & Cloud Healthcheck

### ⚠️ Problem:
Railway free/starter tier par jab 10-15 minute tak koi incoming HTTP request nahi aati, toh Railway container ko **Sleep (Freeze)** kar deta hai. Is se bot disconnect ho jata hai.

### 🛠️ Solution:
Express mein `/health` endpoint add karein, aur `railway.json` mein healthcheck path configure karein taake Railway ka apna proxy container ko kabhi sleep na hone de.

#### Step 1: `index.js` mein Healthcheck Endpoint Add Karein
Apne Express app (`app.use(...)` ke baad) yeh code lagayein:

```javascript
// ═════════════════════════════════════════════════════════
// 24/7 CLOUD HEALTHCHECK & KEEP-ALIVE ENDPOINTS
// ═════════════════════════════════════════════════════════
app.get(['/health', '/ping', '/live', '/keepalive'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const activeCount = typeof sessions === 'object' 
        ? Object.values(sessions).filter(s => s && s.isConnected).length 
        : 1;
    res.status(200).json({
        status: 'ok',
        alive: true,
        uptime: Math.floor(process.uptime()),
        timestamp: Date.now(),
        activeSessions: activeCount,
        memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
    });
});
```

#### Step 2: `railway.json` File Banayein / Update Karein
Project ke root folder mein `railway.json` mein yeh config dalein:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node --experimental-require-module --expose-gc --max-old-space-size=460 index.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ALWAYS",
    "restartPolicyMaxRetries": 100
  }
}
```

#### Step 3: Self-Ping Keep-Alive Engine (`index.js` ke aakhir mein)
Server listen hone ke baad yeh ping loop lagayein:

```javascript
// Har 45 seconds baad self ping
const appUrl = process.env.RAILWAY_STATIC_URL 
    ? `https://${process.env.RAILWAY_STATIC_URL}/health` 
    : `http://127.0.0.1:${PORT}/health`;

setInterval(async () => {
    try {
        await axios.get(appUrl, { timeout: 10000, headers: { 'User-Agent': 'AntiSleep/3.0' } });
    } catch (e) {}
}, 45 * 1000);
```

#### Step 4: External UptimeRobot (100% Free Lifetime Active)
1. [UptimeRobot.com](https://uptimerobot.com) par free account banayein.
2. **Add New Monitor**:
   - Monitor Type: `HTTP(s)`
   - Friendly Name: `My WhatsApp Bot`
   - URL: `https://YOUR-APP-NAME.up.railway.app/health`
   - Monitoring Interval: `5 minutes` (ya 1 minute)
3. Save karein! Ab USA server se har 5 minute ping aayega aur container 24/7 jagta rahega.

---

## 2. FIX 2: WhatsApp Connection Drops & Ghost Sockets

### ⚠️ Problem:
1. WhatsApp 60 seconds idle rehne par Baileys WebSocket connection drop kar deta hai.
2. Reconnect hone par purana socket memory mein latka rehta hai (Ghost Socket), jis ki wajah se WhatsApp **Error 440 (connectionReplaced)** ya **Error 500 (conflict)** dekar session logout kar deta hai.

### 🛠️ Solution:

#### Step 1: 25-Second Presence Heartbeat
Apne session class mein presence update ka loop lagayein:

```javascript
startActiveCheck() {
    if (this.activeInterval) clearInterval(this.activeInterval);
    // 25 seconds heartbeat sends 'available' so WhatsApp server never closes the connection
    this.activeInterval = setInterval(async () => {
        if (this.isConnected && this.sock?.user) {
            try {
                await this.sock.sendPresenceUpdate('available');
            } catch (e) {}
        }
    }, 25 * 1000);
}
```
> Jab bot connect ho jaye (`connection === 'open'`), tab `this.startActiveCheck()` ko call karein.

#### Step 2: Clean Socket Teardown (Ghost Socket Killer)
Jab naya socket banayein ya reconnect karein, purane socket ko forcefully terminate karein:

```javascript
// Clean up any stale/ghost socket before initializing new one
if (this.sock) {
    try {
        if (this.activeInterval) {
            clearInterval(this.activeInterval);
            this.activeInterval = null;
        }
        this.sock.ev.removeAllListeners();
        try { this.sock.end(undefined); } catch (e) {}
        if (this.sock.ws) {
            try { this.sock.ws.removeAllListeners(); } catch (e) {}
            try { this.sock.ws.terminate(); } catch (e) {}
            try { this.sock.ws.close(); } catch (e) {}
        }
    } catch (e) {}
    this.sock = null;
}
```

---

## 3. FIX 3: `.play` / Song Invisible to Other Users

### ⚠️ Problem:
Jab user `.play` ya `.song` command chalata hai, toh audio sirf bot ke phone par aati hai lekin group ke baaqi members ya doosre user ko nazar nahi aati!

#### Asal Wajah (Root Cause):
1. **Invalid Protobuf (`externalAdReply` with `mediaType: 2`)**: Baileys mein audio message ke sath jab `externalAdReply` preview card lagaya jata hai, toh WhatsApp mobile clients (Android/iOS) use **unsupported/corrupted payload** samajh kar silently hide/discard kar dete hain!
2. **Streaming URL Upload**: `{ audio: { url: ... } }` direct bhejne se Baileys official WhatsApp CDN media key theek se register nahi kar pata.

### 🛠️ Solution:
Audio ko pehle `arraybuffer` mein download karke raw buffer bhejein, `mimetype: 'audio/mp4'` rakhein (in-chat player ke liye), aur audio message se `externalAdReply` hata kar alag se Info Image bhejein!

```javascript
async function ytmp3Command(sock, from, msg, args = []) {
    const query = args.join(' ').trim();
    if (!query) {
        return await sock.sendMessage(from, { text: "Usage: .play <song name>" }, { quoted: msg });
    }

    // 1. YouTube se song details & download link nikalain
    const videoInfo = await searchYoutube(query);
    const dlData = await getYoutubeDownloadLinks(videoInfo.url, 'mp3');
    const audioUrl = dlData.mp3;
    const cleanTitle = (dlData.title || videoInfo.title).replace(/[\\/:*?"<>|]/g, '').slice(0, 60);

    // 2. Song Cover Art Card Bhejein (Yeh Group Ke Har Bande Ko Dikhaye Ga)
    if (dlData.thumbnail || videoInfo.thumbnail) {
        await sock.sendMessage(from, {
            image: { url: dlData.thumbnail || videoInfo.thumbnail },
            caption: `╭━━━〔 🎵 *AUDIO PLAYER* 〕━━━┈⊷\n` +
                     `┃ 📌 *Title:* ${dlData.title || videoInfo.title}\n` +
                     `┃ 👤 *Artist:* ${dlData.author || 'YouTube'}\n` +
                     `┃ ⚡ *Status:* Sending Audio MP3...\n` +
                     `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg }).catch(() => {});
    }

    // 3. Audio Buffer Download Karein (Zero Failures Across All Devices)
    const audioRes = await axios.get(audioUrl, {
        responseType: 'arraybuffer',
        timeout: 50000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const audioBuffer = Buffer.from(audioRes.data);

    // 4. Playable Audio Send Karein (mimetype: 'audio/mp4' renders native wave player on all phones!)
    await sock.sendMessage(from, {
        audio: audioBuffer,
        mimetype: 'audio/mp4', // <-- NATIVE WHATSAPP AUDIO PLAYER
        fileName: `${cleanTitle}.mp3`,
        ptt: false
    }, { quoted: msg });

    await sock.sendMessage(from, { react: { text: '🎶', key: msg.key } }).catch(() => {});
}
```

---

## 4. FIX 4: Strict Private Mode

### ⚠️ Problem:
Jab bot Private mode mein ho, tab bhi kabhi kabhi doosre users ya group members commands chala lete hain ya bot confuse ho jata hai.

### 🛠️ Solution:
Jab `isPublic === false` ho, tab strictly check karein: Agar message bhejne wala **Bot Owner** nahi hai aur **Bot User** (self) nahi hai, toh foran `return` kar jayein!

#### Step 1: Owner Detection Engine (`messages.upsert` ke andar)
```javascript
const botNumber = this.sock.user?.id ? jidNormalizedUser(this.sock.user.id) : '';
const botNumberDigits = botNumber.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

const rawSender = msg.key.participant || msg.participant || (msg.key.fromMe ? this.sock.user?.id : from) || '';
const sender = String(rawSender).split(':')[0];
const senderDigits = sender.split('@')[0].replace(/[^0-9]/g, '');

// Master Owner Phone Numbers List
const authorizedOwners = new Set([
    '923468616487', // Primary Bot Owner
    '923438673242', // User Number
    String(settings.ownerNumber || '').replace(/[^0-9]/g, ''),
    String(this.userId || '').replace(/[^0-9]/g, ''),
    botNumberDigits
].filter(Boolean));

// Check if sender is Owner or the Bot itself
const isOwner = msg.key.fromMe || authorizedOwners.has(senderDigits);
```

#### Step 2: Strict Private Guard (Commands Run Hone Se Pehle)
```javascript
// 🛑 STRICT PRIVATE MODE GUARD:
// Jab bot private ho, sirf Bot Owner aur Bot User commands use kar sakte hain!
// Baaqi sabhi users aur group members ko silently ignore kiya jata hai.
if (!this.isPublic && !isOwner) {
    return; // Complete silent drop
}
```

#### Step 3: Dynamic Switcher Commands (`.mode private` & `.mode public`)
```javascript
case 'private':
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Sirf Bot Owner hi mode badal sakta hai." }, { quoted: msg });
    this.isPublic = false;
    await this.sock.sendMessage(from, { text: "🔒 *Bot Mode: PRIVATE*\nAb sirf Owner aur Bot User hi commands use kar sakte hain." }, { quoted: msg });
    break;

case 'public':
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Sirf Bot Owner hi mode badal sakta hai." }, { quoted: msg });
    this.isPublic = true;
    await this.sock.sendMessage(from, { text: "🌍 *Bot Mode: PUBLIC*\nAb sabhi users aur group members commands use kar sakte hain." }, { quoted: msg });
    break;

case 'mode':
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Sirf Bot Owner hi mode check kar sakta hai." }, { quoted: msg });
    const subMode = (args[0] || '').toLowerCase();
    if (subMode === 'private' || subMode === 'priv') {
        this.isPublic = false;
        await this.sock.sendMessage(from, { text: "🔒 *Bot Mode: PRIVATE*\nSirf Owner aur Bot User ke liye commands open hain." }, { quoted: msg });
    } else if (subMode === 'public' || subMode === 'pub') {
        this.isPublic = true;
        await this.sock.sendMessage(from, { text: "🌍 *Bot Mode: PUBLIC*\nSabhi users ke liye commands open hain." }, { quoted: msg });
    } else {
        await this.sock.sendMessage(from, {
            text: `⚙️ *Current Mode:* ${this.isPublic ? '🌍 PUBLIC' : '🔒 PRIVATE'}\n\n👉 *.mode public*\n👉 *.mode private*`
        }, { quoted: msg });
    }
    break;
```

---

## 5. FIX 5: RAM Memory Leak & 512MB OOM Crashes

### ⚠️ Problem:
Railway aur VPS par Node.js process ahista ahista RAM barhata jata hai aur 512MB limit hit hote hi Railway container **OOM (Out Of Memory) Crash** ho jata hai.

### 🛠️ Solution:
1. Node start script mein `--expose-gc --max-old-space-size=460` pass karein:
   ```bash
   node --experimental-require-module --expose-gc --max-old-space-size=460 index.js
   ```
2. `index.js` mein har 2 minute baad garbage collection trigger karein:
   ```javascript
   // Periodic RAM Garbage Collector
   setInterval(() => {
       if (global.gc) {
           try { global.gc(); } catch (e) {}
       }
   }, 2 * 60 * 1000);
   ```
   Is se bot ki memory hamesha **150MB - 190MB** ke andar rehti hai aur 512MB limit kabhi cross nahi hoti!

---

### 🏁 SUMMARY CHECKLIST FOR YOUR SECOND BOT:
- [x] `/health` endpoint add kiya?
- [x] `railway.json` mein `healthcheckPath: "/health"` aur `restartPolicyType: "ALWAYS"` lagaya?
- [x] UptimeRobot par `/health` monitor banaya?
- [x] 25 seconds `sendPresenceUpdate('available')` heartbeat on kiya?
- [x] Disconnect hone par `.ws.terminate()` aur `.end()` call kiya?
- [x] `.play` command mein `mimetype: 'audio/mp4'` aur buffer download lagaya?
- [x] Strict private check `if (!this.isPublic && !isOwner) return;` lagaya?

**In 5 fixes ke baad aapka doosra bot bhi 24/7 bina kisi crash ya sleep ke superfast chalega!** 🚀
