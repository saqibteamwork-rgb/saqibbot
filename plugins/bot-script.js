const { cmd } = require('../arslan');
const config = require('../config');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { requirePremium } = require('../lib/premium-check');

const FIXED_SCRIPT_LINK = 'https://www.mediafire.com/file/tbx95wm576jjsdx/OLD-STUDIO-V2.zip/file';
const FIXED_FILE_NAME = 'AMANMINIBOT-V2.zip';

cmd({
    pattern: 'botscript',
    alias: ['script', 'getscript', 'dlscript'],
    desc: 'Premium/Owner: AMANMINIBOT V2 script',
    category: 'tools',
    react: '📦',
    use: '.botscript',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!(await requirePremium(ctx))) return;

    await ctx.reply('📦 *AMANMINIBOT V2 SCRIPT*\n\n⏱️ Download shuru…');

    try {
        const pageRes = await axios.get(FIXED_SCRIPT_LINK, {
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        let directUrl = null;
        let m1 = pageRes.data.match(/href="(https:\/\/download[^"]*mediafire\.com[^"]+)"/i);
        if (m1) directUrl = m1[1];
        if (!directUrl) {
            m1 = pageRes.data.match(/id="downloadButton"[^>]*href="([^"]+)"/i);
            if (m1) directUrl = m1[1];
        }
        if (!directUrl) {
            m1 = pageRes.data.match(/data-scrambled-url="([^"]+)"/i);
            if (m1) { try { directUrl = Buffer.from(m1[1], 'base64').toString('utf8'); } catch (_) {} }
        }
        if (!directUrl) throw new Error('Direct link nahi mila');

        const downloadDir = path.join(__dirname, '..', 'downloads');
        fs.ensureDirSync(downloadDir);
        const filePath = path.join(downloadDir, FIXED_FILE_NAME);

        const fileRes = await axios({
            method: 'GET', url: directUrl, responseType: 'stream',
            timeout: 300000,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.mediafire.com/' }
        });

        const writer = fs.createWriteStream(filePath);
        fileRes.data.pipe(writer);
        await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

        const stats = fs.statSync(filePath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        const buffer = fs.readFileSync(filePath);

        await conn.sendMessage(ctx.from, {
            document: buffer,
            fileName: FIXED_FILE_NAME,
            mimetype: 'application/zip',
            caption: `📦 *AMANMINIBOT V2*\n\n✅ Ready!\n📊 ${sizeKB} KB\n\n🔒 Premium — share mat karo!`
        }, { quoted: mek });

        await fs.remove(filePath).catch(() => {});
    } catch (err) {
        console.error('botscript error:', err.message);
        return ctx.reply('❌ Download fail: ' + err.message);
    }
});