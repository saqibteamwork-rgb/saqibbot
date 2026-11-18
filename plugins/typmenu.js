// plugins/typmenu.js — MR SAQIB MD: VIP Payment Request Card Menu (Typ Menu / FamoFC Style)
// ============================================================================
//   .typmenu / .typemenu / .paymenu → Sends interactive WhatsApp Payment Request card menu
// ============================================================================

const { cmd } = require('../command');
const { menuCommand } = require('../commands/menu');

cmd({
    pattern: 'typmenu',
    alias: ['typemenu', 'paymenu', 'paymentmenu', 'famo', 'famomenu', 'typ'],
    desc: 'Send VIP Payment Request Style Menu (requestPaymentMessage)',
    category: 'main',
    react: '💳',
    use: '.typmenu',
    filename: __filename
}, async (conn, mek, m, { from, args }) => {
    try {
        await menuCommand(conn, from, mek, null, null, null, ['pay', ...args], null, true);
    } catch (e) {
        console.error('[typmenu error]:', e.message);
    }
});
