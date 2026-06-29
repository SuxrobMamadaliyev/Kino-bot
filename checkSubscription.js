const { getSettings } = require('./settingsHelper');

/**
 * Foydalanuvchining bazadagi BARCHA majburiy kanal/guruhlarga
 * a'zo bo'lib-bo'lmaganligini tekshiradi.
 * Maxfiy (private) kanallar uchun ham ishlaydi, chunki bot.telegram.getChatMember
 * faqat botning shu kanalda ADMIN bo'lishini talab qiladi, kanalning ochiq/yopiqligi muhim emas.
 *
 * @returns {Promise<{ subscribed: boolean, notJoined: Array }>}
 */
async function checkSubscription(bot, userId) {
  const settings = await getSettings();
  const channels = settings.channels || [];

  if (channels.length === 0) {
    return { subscribed: true, notJoined: [] };
  }

  const notJoined = [];

  for (const ch of channels) {
    try {
      const member = await bot.telegram.getChatMember(ch.id, userId);
      const badStatuses = ['left', 'kicked'];
      if (!member || badStatuses.includes(member.status)) {
        notJoined.push(ch);
      }
    } catch (err) {
      // Bot kanalda admin bo'lmasa yoki ID xato bo'lsa, xavfsizlik uchun
      // foydalanuvchini "a'zo emas" deb hisoblaymiz va xatoni logga yozamiz.
      console.error(`⚠️ getChatMember xatosi (${ch.id}):`, err.message);
      notJoined.push(ch);
    }
  }

  return { subscribed: notJoined.length === 0, notJoined };
}

module.exports = { checkSubscription };
