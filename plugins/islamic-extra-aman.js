const { cmd } = require('../arslan');

// Helpful, general Islamic learning commands. For detailed rulings, ask a trusted scholar.
cmd({ pattern: 'wuduguide', alias: ['wudu', 'wuzu'], desc: 'Wuzu ke basic steps', category: 'islamic', react: '💧', filename: __filename }, async (conn, mek, m, ctx) => {
  return ctx.reply([
    '💧 *WUZU GUIDE — ASAN TAREEQA*', '',
    '1️⃣ Niyyat dil mein karo aur Bismillah parho.',
    '2️⃣ Dono haath kalai tak dho lo.',
    '3️⃣ Munh mein pani ghumao aur naak saaf karo.',
    '4️⃣ Chehra dho lo.',
    '5️⃣ Dono bazu kohniyon samait dho lo.',
    '6️⃣ Geelay haath se sar ka masah karo.',
    '7️⃣ Dono paon takhnon samait dho lo.', '',
    '🤲 Tafseeli masail mein apne maslak ke trusted alim se rehnumai lein.',
    '💗 AMAN ki taraf se'
  ].join('\n'));
});

cmd({ pattern: 'salahguide', alias: ['namazguide', 'salahsteps'], desc: 'Namaz ki basic rehnumai', category: 'islamic', react: '🕌', filename: __filename }, async (conn, mek, m, ctx) => {
  return ctx.reply([
    '🕌 *NAMAZ GUIDE — BASIC*', '',
    '🌙 Wuzu aur paak jagah ka ehtimam karo.',
    '🧭 Qibla rukh kharay ho kar niyyat dil mein karo.',
    '🤲 Takbeer ke baad qiyam, qiraat, ruku aur sajde ada karo.',
    '📿 Rakat aur parhne ka tareeqa namaz ke mutabiq hota hai.',
    '🤍 Aakhir mein qaida aur salam ada karo.', '',
    'ℹ️ Fiqhi tafseel ke liye trusted alim ya apni masjid ke imam se seekho.',
    '💗 AMAN ki taraf se'
  ].join('\n'));
});

cmd({ pattern: 'islamicquiz', alias: ['deenquiz', 'muslimquiz'], desc: 'Islamic knowledge quiz', category: 'islamic', react: '📚', filename: __filename }, async (conn, mek, m, ctx) => {
  const qs = [
    { q: 'Muslimon ki muqaddas kitab ka naam?', a: 'Quran Majeed' },
    { q: 'Rozana farz namazon ki tadaad kitni hai?', a: '5' },
    { q: 'Ramadan mein Muslims kis ibadat ke liye roza rakhte hain?', a: 'Allah ki raza ke liye roza' },
    { q: 'Muslim namaz mein kis taraf rukh karte hain?', a: 'Kaaba / Qibla' },
    { q: 'Islamic calendar ka pehla mahina?', a: 'Muharram' },
    { q: 'Hajj kis shehar mein ada hota hai?', a: 'Makkah' }
  ];
  const x = qs[Math.floor(Math.random() * qs.length)];
  return ctx.reply(`📚 *AMAN DEEN QUIZ*\n\n❓ ${x.q}\n\nJawab dekhne ke liye reply mein *.quizanswer* likho.\n💡 Answer: ${x.a}\n\n💗 AMAN ki taraf se`);
});

cmd({ pattern: 'gooddeeds', alias: ['nekiaaj', 'gooddeed'], desc: 'Aaj ki ek achi aadat', category: 'islamic', react: '🤍', filename: __filename }, async (conn, mek, m, ctx) => {
  const deeds = [
    'Aaj kisi ko salam mein pehal karo. 🌸',
    'Ghar walon ki kisi kaam mein madad karo. 🤲',
    'Kisi ko achi aur sachchi baat se khush karo. 💗',
    'Apne liye aur sab ke liye dua karo. 🌙',
    'Kisi ko maaf karne ki koshish karo. 🕊️',
    'Pani zaya na karo aur safai ka khayal rakho. 💧',
    'Kisi pareshan dost ki baat tawajjo se suno. 🫶'
  ];
  const deed = deeds[Math.floor(Math.random() * deeds.length)];
  return ctx.reply(`🤍 *AAJ KI NEKI*\n\n${deed}\n\nChoti si neki bhi kisi ke liye khushi ban sakti hai.\n💗 AMAN ki taraf se`);
});

cmd({ pattern: 'islamicmonths', alias: ['hijrimonths', 'islamicmahine'], desc: 'Hijri calendar ke mahine', category: 'islamic', react: '🌙', filename: __filename }, async (conn, mek, m, ctx) => {
  return ctx.reply([
    '🌙 *HIJRI CALENDAR KE 12 MAHINE*', '',
    '1. Muharram', '2. Safar', '3. Rabi ul Awwal', '4. Rabi ul Akhir',
    '5. Jumada al Awwal', '6. Jumada al Akhir', '7. Rajab', '8. Shaban',
    '9. Ramadan', '10. Shawwal', '11. Dhul Qadah', '12. Dhul Hijjah', '',
    '📅 Chand dekhne aur local announcement se mahine ki shuruat confirm hoti hai.',
    '💗 AMAN ki taraf se'
  ].join('\n'));
});
