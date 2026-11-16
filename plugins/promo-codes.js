const { cmd } = require('../arslan');
const config = require('../config');
const {
    createPromoCode, redeemPromoCode, listPromoCodes, deletePromoCode, hasPromoPremium
} = require('../lib/database');
const { isOwner, isPremiumUser, cleanNumber } = require('../lib/premium-check');

cmd({
    pattern: 'promo',
    alias: ['createpromo', 'promocode', 'genpromo'],
    desc: 'Owner: create a premium access code',
    category: 'owner',
    react: '🎟️',
    use: '.promo <code> [maxUses=100] [expiresHours=24] [premiumDays=30]',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');

    const args = (ctx.q || '').trim().split(/\s+/);
    const [code, maxUses = '100', expiresHours = '24', premiumDays = '30'] = args;
    if (!code) {
        return ctx.reply(
            `🎟️ *PREMIUM CODE*\n\n` +
            `Use: \`${config.PREFIX}promo <code> [maxUses=100] [expiresHours=24] [premiumDays=30]\`\n` +
            `Example: \`${config.PREFIX}promo MINI30 100 24 30\``
        );
    }

    try {
        const promo = await createPromoCode(
            code, Number(maxUses), cleanNumber(ctx.senderNumber), Number(expiresHours), Number(premiumDays)
        );
        return ctx.reply(
            `🎟️ *CODE CREATED*\n\n` +
            `🔑 Code: *${promo.code}*\n` +
            `👥 Uses: *${promo.maxUses}*\n` +
            `💎 Premium per use: *${promo.premiumDays} days*\n` +
            `📅 Expires: *${promo.expiresAt ? promo.expiresAt.toLocaleString() : 'Never'}*\n\n` +
            `Redeem with: \`${config.PREFIX}redeem ${promo.code}\``
        );
    } catch (e) { return ctx.reply(`❌ ${e.message}`); }
});

cmd({
    pattern: 'redeem',
    alias: ['promo-redeem', 'usecode', 'claimcode'],
    desc: 'Redeem a premium access code',
    category: 'general',
    react: '🎁',
    use: '.redeem <code>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    const code = (ctx.q || '').trim().toUpperCase();
    if (!code) return ctx.reply(`🎁 Use: \`${config.PREFIX}redeem <code>\``);
    if (isOwner(ctx)) return ctx.reply('👑 Owner has full access already.');

    try {
        const result = await redeemPromoCode(code, cleanNumber(ctx.senderNumber));
        if (!result.success) {
            const messages = {
                invalid_code: '❌ Code not found.',
                invalid_user: '❌ Your WhatsApp number could not be identified.',
                try_again: '⚠️ Redeem conflict; please try again.',
                inactive: '❌ This code is inactive.',
                expired: '⌛ This code has expired.',
                already_used_by_you: '⚠️ You already used this code.',
                limit_reached: '🚫 This code has no uses left.'
            };
            return ctx.reply(messages[result.reason] || '❌ Code could not be redeemed.');
        }
        return ctx.reply(
            `✅ *PREMIUM ACTIVATED*\n\n` +
            `🎟️ Code: *${code}*\n` +
            `💎 Added: *${result.premiumDays} days*\n` +
            `👥 Uses remaining: *${result.remaining}/${result.total}*`
        );
    } catch (e) { return ctx.reply(`❌ Redeem failed: ${e.message}`); }
});

cmd({
    pattern: 'promolist',
    alias: ['listpromo', 'mycodes', 'codes'],
    desc: 'Owner: list your premium codes',
    category: 'owner',
    react: '📋',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');
    try {
        const codes = await listPromoCodes(cleanNumber(ctx.senderNumber));
        if (!codes.length) return ctx.reply(`📋 Use: \`${config.PREFIX}promo <code>\``);
        const lines = codes.map((c, i) => {
            const status = c.usedCount >= c.maxUses ? 'FULL' :
                c.active && (!c.expiresAt || c.expiresAt > new Date()) ? 'Active' : 'Expired/inactive';
            return `${i + 1}. *${c.code}* — ${c.usedCount}/${c.maxUses} uses | ${c.premiumDays || 30} days | ${status}`;
        });
        return ctx.reply(`🎟️ *YOUR PREMIUM CODES (${codes.length})*\n\n${lines.join('\n')}`);
    } catch (e) { return ctx.reply(`❌ ${e.message}`); }
});

cmd({
    pattern: 'delpromo',
    alias: ['removepromo', 'delcode'],
    desc: 'Owner: delete a premium code',
    category: 'owner',
    react: '🗑️',
    use: '.delpromo <code>',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!isOwner(ctx)) return ctx.reply('⛔ Owner only.');
    const code = (ctx.q || '').trim().toUpperCase();
    if (!code) return ctx.reply(`Use: \`${config.PREFIX}delpromo <code>\``);
    try {
        const deleted = await deletePromoCode(code, cleanNumber(ctx.senderNumber));
        return ctx.reply(deleted ? `🗑️ Code *${code}* deleted.` : '❌ Code not found.');
    } catch (e) { return ctx.reply(`❌ ${e.message}`); }
});

cmd({
    pattern: 'premium',
    alias: ['mypremium', 'premiumstatus'],
    desc: 'Check premium status',
    category: 'general',
    react: '💎',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (isOwner(ctx)) return ctx.reply('👑 *OWNER STATUS*\n\nFull access is enabled.');
    const active = await isPremiumUser(ctx);
    if (!active) {
        return ctx.reply(
            `🔒 Premium is not active.\n\n` +
            `Ask the bot owner for a code, then use \`${config.PREFIX}redeem <code>\`.`
        );
    }
    let premium = null;
    try {
        const { PromoPremium } = require('../lib/database');
        premium = await PromoPremium.findOne({ number: cleanNumber(ctx.senderNumber) }).lean();
    } catch (_) {}
    return ctx.reply(
        `💎 *PREMIUM ACTIVE* ✅\n\n` +
        `📅 Expires: *${premium?.expiresAt ? new Date(premium.expiresAt).toLocaleString() : 'N/A'}*`
    );
});
