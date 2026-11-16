const { cmd } = require('../arslan');
const config = require('../config');

// MR SAQIB MD: 28 additional Islamic learning and reminder commands.
// General educational guidance; consult a trusted scholar for detailed rulings.
const reply = (ctx, title, lines) => ctx.reply([title, '', ...lines, '', 'ℹ️ Tafseeli masail ke liye trusted alim/imam se rehnumai lein.', `💗 ${config.OWNER_NAME || 'SAQIB'} ki taraf se 🥲`].join('\n'));
const register = (pattern, alias, desc, emoji, title, lines) => cmd({ pattern, alias, desc, category: 'islamic', react: emoji, filename: __filename }, async (conn, mek, m, ctx) => reply(ctx, title, lines));

register('pillarsislam', ['islampillars'], 'Islam ke 5 arkaan', '🕌', '🕌 ISLAM KE 5 ARKAAN', [
 '1️⃣ Kalima / Shahadah — Allah ki wahdaniyat aur Muhammad ﷺ ki risalat ki gawahi.',
 '2️⃣ Salah — rozana farz namaz.',
 '3️⃣ Zakat — sharaait poori hon to wajib mali ibadat.',
 '4️⃣ Sawm — Ramadan ke roze.',
 '5️⃣ Hajj — istitaat rakhne walay par zindagi mein ek martaba farz.'
]);
register('pillarsiman', ['imanpillars'], 'Iman ke 6 bunyadi arkaan', '🤍', '🤍 IMAN KE 6 ARKAAN', [
 '1️⃣ Allah par iman.', '2️⃣ Farishton par iman.', '3️⃣ Allah ki kitabon par iman.', '4️⃣ Rasoolon par iman.', '5️⃣ Aakhirat ke din par iman.', '6️⃣ Taqdeer par iman — khair aur shar ke Allah ke ilm aur mashiyat ke mutabiq honay par iman.'
]);
register('fastingguide', ['roza-guide','rozaguide'], 'Roze ki basic rehnumai', '🌙', '🌙 ROZE KI BASIC GUIDE', [
 '🤲 Roze ki niyyat karo; niyyat dil ka irada hai.', '🌅 Sehri ka ehtimam karo aur Fajr ka waqt shuru honay se pehle khana peena rok do.', '☀️ Roze ke dauran khanay peenay se parhez aur achay akhlaq ka ehtimam karo.', '🌇 Apne ilaqay ke Maghrib waqt par iftar karo.', 'ℹ️ Roze ke masail aur rukhsat ke liye trusted alim se poochho.'
]);
register('zakatguide', ['zakat-guide'], 'Zakat ki basic maloomat', '🤲', '🤲 ZAKAT — BASIC MALoomat', [
 'Zakat ek aham farz mali ibadat hai.', 'Aam tor par nisab aur zakatable maal par ek Hijri saal guzarne jaisi sharaait dekhi jati hain.', 'Aksar eligible maal par mashhoor rate 2.5% hota hai, lekin har asset ka hukm ek jaisa nahi.', 'Apni exact calculation ke liye trusted scholar ya qualified zakat adviser se mashwara karein.'
]);
register('hajjguide', ['hajj-guide'], 'Hajj ki basic maloomat', '🕋', '🕋 HAJJ — BASIC GUIDE', [
 'Hajj Makkah aur muqaddas maqamat par muayyan dinon mein ada hota hai.', 'Is mein ihram, wuqoof-e-Arafat, tawaf aur dusre manasik shamil hain.', 'Hajj ki tafseel, dates aur official arrangements ke liye apne mulk ki official Hajj authority aur trusted alim ki rehnumai lein.'
]);
register('umrahguide', ['umrah-guide'], 'Umrah ki basic maloomat', '🕋', '🕋 UMRAH — BASIC GUIDE', [
 'Umrah mein ihram, tawaf aur sa‘i bunyadi manasik hain; phir baal mundwana ya katwana hota hai.', 'Ihram ki niyyat aur miqat ke masail safar se pehle seekh lein.', 'Tafseeli tareeqa aur maslak ke mutabiq rehnumai ke liye trusted alim se poochhein.'
]);
register('jummahguide', ['jummah'], 'Jummah ke adab aur tayyari', '🕌', '🕌 JUMMAH MUBARAK — YAAD DEHANI', [
 '🌿 Ghusl aur saaf kapron ka ehtimam karein.', '🧼 Khushboo aur safai ka khayal rakhein, agar aap ke liye munasib ho.', '📖 Khutbay ko khamoshi se tawajjo ke saath sunein.', '🤝 Dusron ko takleef na dein aur masjid mein jagah ka ehtiram karein.', '🤲 Durood, dua aur zikr ka ehtimam karein.'
]);
register('masjidadab', ['masjid-adab'], 'Masjid ke adab', '🕌', '🕌 MASJID KE ADAB', [
 '👟 Jootay muqarrar jagah par rakhein aur safai ka khayal karein.', '🤫 Ibadat karne walon ko disturb na karein.', '📵 Phone silent rakhein.', '🧹 Masjid aur us ke saman ka ehtiram karein.', '🤝 Dusron ke liye jagah aur sukoon ka khayal rakhein.'
]);
register('salamadab', ['salam-guide'], 'Salam ke adab', '🤝', '🤝 SALAM KI PYARI AADAT', [
 '💚 Salam mein pehal karna achi aadat hai.', '🗣️ Assalamu alaikum keh kar salam karein.', '💞 Salam ka jawab achay tareeqay se dein.', '🌸 Salam ko mohabbat, aman aur izzat phailanay ka zariya banayein.'
]);
register('parentsdua', ['walidain-dua'], 'Walidain ke liye Quranic dua', '🤲', '🤲 WALIDAIN KE LIYE DUA', [
 'رَبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا', 'Transliteration: Rabbir-hamhuma kama rabbayani sagheera.', 'Matlab: Aye mere Rab, mere walidain par reham farma, jaisay unhon ne bachpan mein meri parwarish ki. (Surah Al-Isra 17:24)', '🤍 Apne walidain ke liye khair aur afiyat ki dua karein.'
]);
register('safardua', ['traveldua'], 'Safar ki mashhoor dua ka reminder', '🚗', '🚗 SAFAR KI DUA — REMINDER', [
 'Safar par nikalte waqt masnoon dua parhna yaad rakhein.', 'Arabic aur transliteration ko mustanad dua book ya trusted Islamic source se verify karke parhein.', '🤲 Allah se hifazat, asani aur khair wala safar maangein.'
]);
register('iftardua', ['iftar-reminder'], 'Iftar ki dua aur reminder', '🌇', '🌇 IFTAR TIME REMINDER', [
 '🌙 Apne ilaqay ke Maghrib waqt ke mutabiq iftar karein.', '🤲 Iftar ke waqt Allah ka shukar ada karein aur apni duaein karein.', '📖 Dua ke alfaaz mukhtalif riwayat mein milte hain; masnoon alfaaz trusted source se seekhein.'
]);
register('sadaqah', ['sadqa'], 'Sadaqah aur madad ka reminder', '💝', '💝 AAJ KI SADAQAH', [
 '🤝 Kisi zarooratmand ki madad karein.', '😊 Kisi ko achi baat keh kar khush karein.', '💧 Pani ka zaya rokna ya kisi ko pani dena bhi neki hai.', '🫶 Madad izzat aur ikhlas ke saath karein; kisi ko sharminda na karein.'
]);
register('istighfar', ['astaghfar'], 'Istighfar ka reminder', '🤍', '🤍 ISTIGHFAR', [
 'أَسْتَغْفِرُ اللّٰهَ', 'Transliteration: Astaghfirullah.', 'Matlab: Main Allah se maghfirat talab karta/karti hoon.', '🌿 Dil se maafi maangein aur ghalti sudharne ki koshish karein.'
]);
register('durood', ['darood'], 'Durood parhne ka reminder', '🌹', '🌹 DUROOD SHAREEF', [
 'Nabi Muhammad ﷺ par durood o salam bhejna ek azeem ibadat hai.', 'Agar durood-e-Ibrahimi seekhna ho to namaz ki duaon se parhein ya trusted Quran/dua source se tasdeeq karein.', '💚 Aaj kuch waqt durood ke liye nikaalein.'
]);
register('quranadab', ['quran-adab'], 'Quran Majeed ke adab', '📖', '📖 QURAN MAJEED KE ADAB', [
 '🤍 Tilawat ke liye pur-sukoon aur saaf jagah ka intikhab karein.', '📚 Quran ko tawajjo se parhein aur tarjuma samajhne ki koshish karein.', '🤫 Tilawat karne walon ka ehtiram karein.', '🌱 Jo seekhein us par amal ki koshish karein.'
]);
register('ramadanguide', ['ramadan-guide'], 'Ramadan ki achi aadatein', '🌙', '🌙 RAMADAN GUIDE', [
 '📖 Rozana Quran ki tilawat ya tarjuma samajhne ka waqt rakhein.', '🤲 Dua, zikr aur sadaqah ka ehtimam karein.', '💗 Ghibat, jhoot aur larai se bachne ki koshish karein.', '🌅 Sehri aur iftar mein aitidal aur sehat ka khayal rakhein.'
]);
register('eidguide', ['eid-adab'], 'Eid ke adab aur achi aadatein', '🌙', '🌙 EID KI PYARI YAAD DEHANI', [
 '💚 Ghar walon aur doston ko khushi se mubarakbad dein.', '🤝 Rishtedaron aur zarooratmandon ko yaad rakhein.', '😊 Narazgi door karne aur sulah ki koshish karein.', '🕌 Eid ki namaz aur us ke masail local imam se seekhein.'
]);
register('neighborrights', ['hampasaya'], 'Padosiyon ke huqooq ka reminder', '🏡', '🏡 PADOSI KA KHAYAL', [
 '🤝 Padosiyon ko apni baat ya harkat se takleef na dein.', '🍲 Mumkin ho to khana ya madad share karein.', '🔉 Shor aur safai ka khayal rakhein.', '💞 Mushkil waqt mein khair-khwahi aur madad karein.'
]);
register('truthfulness', ['sach-bolo'], 'Sachai ki ahmiyat', '💚', '💚 SACH BOLNA', [
 '🗣️ Sach bolne ki aadat apnayein.', '🤝 Wada karein to poora karne ki koshish karein.', '🌿 Ghalti ho jaye to tasleem karein aur durust karein.', '💗 Sachai se bharosa mazboot hota hai.'
]);
register('patience', ['sabr'], 'Sabr ki yaad dehani', '🌿', '🌿 SABR AUR UMEED', [
 '🤲 Mushkil waqt mein Allah se madad maangein.', '🫶 Jaldbazi mein kisi ko bura jawab dene se pehle ruk kar sochein.', '💚 Halal aur behtar raasta ikhtiyar karte hue koshish jari rakhein.', '🌸 Zaroorat ho to bharosaymand logon se madad lena bhi theek hai.'
]);
register('shukr', ['shukar'], 'Shukar guzaari ka reminder', '🤍', '🤍 ALHAMDULILLAH', [
 '🌸 Aaj apni teen nematon ko yaad karein.', '🤲 Allah ka shukar ada karein.', '🫶 Dusron ki madad karke nematon ko achay kaam mein lagayein.', '💗 Choti khushiyon ki bhi qadar karein.'
]);
register('repentance', ['tawbah'], 'Tawbah ki general rehnumai', '🤲', '🤲 TAWBAH AUR ISLAH', [
 '🤍 Ghalti par nadamat aur Allah se maghfirat talab karein.', '🌿 Ghalat kaam chhorne aur dobara na karne ka sachcha irada karein.', '🤝 Agar kisi insan ka haq mara ho to mumkin ho to us ka haq wapas karein ya maafi maangein.', 'ℹ️ Mushkil ya tafseeli masail mein trusted alim se rehnumai lein.'
]);
register('cleanliness', ['safai'], 'Safai aur taharat ki yaad dehani', '💧', '💧 SAFAI AUR TAHARAT', [
 '🧼 Jism, kapron aur aas paas ki safai ka khayal rakhein.', '💧 Pani zaya na karein.', '🕌 Ibadat se pehle taharat ke masail seekhein.', '🌿 Public jagah ko bhi saaf chhor kar aayein.'
]);
register('charityideas', ['sadqahideas'], 'Madad aur khairat ke ideas', '🎁', '🎁 NEKI KE IDEAS', [
 '🥘 Kisi ke liye khana share karein.', '📚 Kisi student ko parhai mein help karein.', '🧓 Kisi buzurg ka kaam asaan karein.', '🧹 Ghar ya mohallay ki safai mein hissa lein.', '💗 Apni haisiyat ke mutabiq madad karein.'
]);
register('islamicmanners', ['deenadab'], 'Rozmarrah Islamic akhlaq', '🌸', '🌸 ROZMARrah KE ACHAY AKHLAAQ', [
 '🤝 Salam aur narmi se baat karein.', '🗣️ Jhoot, mazaq mein beizzati aur ghibat se bachein.', '💗 Walidain, ustad, padosi aur dusron ka ehtiram karein.', '⚖️ Faislay mein insaf aur amanat ka khayal rakhein.'
]);
register('quranlearning', ['learnquran'], 'Quran seekhne ke practical tips', '📖', '📖 QURAN SEEKHNE KE TIPS', [
 '⏰ Rozana chhota magar mustaqil waqt muqarrar karein.', '🎧 Tajweed ke liye qualified teacher ki tilawat sun kar seekhein.', '📚 Tarjuma aur tafseer trusted source se parhein.', '📝 Naye sabaq ko dohrayein aur teacher se durusti karwayein.'
]);
register('islamicvocab', ['deenwords'], 'Basic Islamic alfaaz ke matlab', '📚', '📚 ISLAMIC ALFAAZ', [
 'Salah: Namaz / ibadat.', 'Sawm: Roza.', 'Zakat: Sharaait ke saath wajib mali ibadat.', 'Sadaqah: Khair aur madad, mali ya ghair-mali.', 'Tawbah: Ghalti se ruju karna aur Allah se maafi talab karna.', 'Shukr: Nemat par Allah ka shukar ada karna.'
]);
register('muslimcharacter', ['akhlaq'], 'Achi Muslim aadaton ka reminder', '🫶', '🫶 ACHAY AKHLAAQ', [
 '💚 Amanat ka khayal rakho.', '🤝 Waday poore karne ki koshish karo.', '🌸 Narmi se baat karo.', '⚖️ Insaf karo aur kisi ka haq na maro.', '🫶 Ghalti par maafi maango aur doosron ko maaf karne ki koshish karo.'
]);
register('duahelp', ['duahowto'], 'Dua karne ke adab', '🤲', '🤲 DUA KE ADAB', [
 '💚 Allah ki hamd aur Nabi ﷺ par durood se dua shuru kar sakte hain.', '🤲 Ikhlas aur umeed ke saath dua karein.', '🌿 Apni aur dusron ki khair maangein.', '⏳ Dua ke jawab mein sabr karein; apni zimmedari ke kaam bhi jari rakhein.'
]);
register('halalearning', ['halalguide'], 'Halal zindagi ke general reminders', '🌿', '🌿 HALAL ZINDAGI — REMINDER', [
 '🍽️ Khane aur kamai ke halal honay ka ehtimam karein.', '🤝 Tijarat mein sachai aur amanat rakhein.', '🗣️ Jhoot, dhoka aur dusron ka haq khanay se bachein.', 'ℹ️ Kisi specific cheez ka halal/haram hukm jaanne ke liye trusted alim se poochhein.'
]);
register('islamicfamily', ['familyrights'], 'Ghar walon ke saath husn-e-sulook', '🏡', '🏡 GHAR WALON KE SAATH ACHHA SULOOK', [
 '💗 Ghar walon se narmi aur izzat se baat karein.', '🫶 Ghar ke kaam mein apni haisiyat ke mutabiq madad karein.', '🤝 Ikhtilaf ho to gaali ya beizzati ke bajaye sukoon se baat karein.', '🌸 Walidain aur rishtedaron ke huqooq ka khayal rakhein.'
]);
