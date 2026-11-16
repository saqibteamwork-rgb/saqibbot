const { cmd } = require('../arslan');
const config = require('../config');
let bioTimer = null;

cmd({
  pattern: "autobio",
  alias: ["bioauto", "setautobio"],
  react: "😎",
  category: "owner",
  desc: "Auto bio on/off",
  filename: __filename
}, async (conn, mek, m, { from, q, reply, isOwner }) => {
  try {

    // 🔐 Owner only
    if (!isOwner) {
      return reply("*YEH COMMAND SIRF OWNER KE LIYE HAI 😎*");
    }

    const state = q?.toLowerCase();

    // ❓ Help / status
    if (!state || !["on", "off"].includes(state)) {
      return reply(
        `*AUTO BIO COMMAND 🥰*\n
➤ *.autobio on*
➤ *.autobio off*

📌 *ABHI AUTOBIO:* ${global.autoBio ? "ON ✅" : "OFF ❌"}`
      );
    }

    // ✅ Set state
    global.autoBio = state === "on";

    if (global.autoBio) {
      if (bioTimer) clearTimeout(bioTimer);
      updateBio(conn);
    } else if (bioTimer) {
      clearTimeout(bioTimer);
      bioTimer = null;
    }

    return reply(`*AUTO BIO AB ${state.toUpperCase()} HO GAYI HAI ☺️*`);

  } catch (e) {
    console.log("AUTOBIO ERROR:", e);
    reply("*❌ Error aa gaya*");
  }
});


// ================= BIO UPDATER =================
async function updateBio(conn) {
  if (!global.autoBio) return;

  try {
    const uptime = clockString(process.uptime() * 1000);
    const botname = config.BOT_NAME || "𝗔𝗠𝗔𝗡-𝐌𝐃";

    const bio = `👑 ${botname} ACTIVE (${uptime}) 👑`;
    await conn.updateProfileStatus(bio);

    console.log("✅ BIO UPDATED:", bio);
  } catch (err) {
    console.log("❌ BIO UPDATE FAILED:", err.message);
  }

  // Keep a single bounded updater, even if .autobio on is run repeatedly.
  if (global.autoBio) {
    if (bioTimer) clearTimeout(bioTimer);
    bioTimer = setTimeout(() => updateBio(conn), 5 * 60 * 1000);
    if (bioTimer.unref) bioTimer.unref();
  }
}


// ================= TIME FORMAT =================
function clockString(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor(ms / 3600000) % 24;
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;

  let str = "";
  if (d) str += `${d}D `;
  if (h) str += `${h}H `;
  if (m) str += `${m}M `;
  if (s) str += `${s}S`;
  return str.trim();
}
