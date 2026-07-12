const { Telegraf, Markup } = require('telegraf');

const Movie = require('./Movie');
const User = require('./User');
const { getSettings } = require('./settingsHelper');
const { checkSubscription } = require('./checkSubscription');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);

if (!BOT_TOKEN) throw new Error('BOT_TOKEN environment variable topilmadi');
if (!ADMIN_ID) throw new Error('ADMIN_ID environment variable topilmadi');

const bot = new Telegraf(BOT_TOKEN);

// ---------------------------------------------------------------------------
// Admin uchun oddiy holat-mashinasi (state machine).
// Faqat ADMIN_ID ishlatadi, shuning uchun bitta global obyekt yetarli.
// ---------------------------------------------------------------------------
const adminState = {
  mode: null, // 'ADD_CHANNEL_WAIT_FORWARD' | 'ADD_CHANNEL_WAIT_LINK' | 'ADD_MOVIE_WAIT_CODE' | 'BROADCAST_WAIT_MESSAGE'
  temp: {},
};

function resetAdminState() {
  adminState.mode = null;
  adminState.temp = {};
}

function isAdmin(ctx) {
  return ctx.from && ctx.from.id === ADMIN_ID;
}

// ---------------------------------------------------------------------------
// Foydalanuvchini bazaga yozish / yangilash
// ---------------------------------------------------------------------------
async function upsertUser(telegramId) {
  await User.findOneAndUpdate(
    { telegramId },
    { $setOnInsert: { joinedAt: new Date() }, $set: { status: 'active' } },
    { upsert: true, new: true }
  );
}

// ---------------------------------------------------------------------------
// Majburiy obuna xabarini chiqarish
// ---------------------------------------------------------------------------
function buildSubscriptionMessage(notJoined) {
  const lines = notJoined.map((ch) => `🔹 ${ch.title}`).join('\n');
  const text =
    `⚠️ Botdan foydalanish uchun quyidagi kanal/guruhlarga a'zo bo'ling:\n\n${lines}\n\n` +
    `A'zo bo'lgach, "✅ Tekshirish" tugmasini bosing.`;

  const buttons = notJoined.map((ch) => [Markup.button.url(`📢 ${ch.title}`, ch.link)]);
  buttons.push([Markup.button.callback('✅ Tekshirish', 'check_subscription')]);

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

// ---------------------------------------------------------------------------
// /start
// ---------------------------------------------------------------------------
bot.start(async (ctx) => {
  await upsertUser(ctx.from.id);

  const { subscribed, notJoined } = await checkSubscription(bot, ctx.from.id);
  if (!subscribed) {
    const { text, keyboard } = buildSubscriptionMessage(notJoined);
    return ctx.reply(text, keyboard);
  }

  return ctx.reply(
    '🎬 Xush kelibsiz!\n\nKino kodini yuboring, men sizga kerakli videoni topib beraman.'
  );
});

// "✅ Tekshirish" tugmasi
bot.action('check_subscription', async (ctx) => {
  await ctx.answerCbQuery();
  const { subscribed, notJoined } = await checkSubscription(bot, ctx.from.id);

  if (!subscribed) {
    const { text, keyboard } = buildSubscriptionMessage(notJoined);
    try {
      await ctx.editMessageText(text, keyboard);
    } catch (e) {
      await ctx.reply(text, keyboard);
    }
    return;
  }

  try {
    await ctx.editMessageText('✅ Rahmat! Endi kino kodini yuborishingiz mumkin.');
  } catch (e) {
    await ctx.reply('✅ Rahmat! Endi kino kodini yuborishingiz mumkin.');
  }
});

// ---------------------------------------------------------------------------
// /admin - Admin panel bosh menyusi
// ---------------------------------------------------------------------------
function adminMainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Statistika', 'admin_stats')],
    [Markup.button.callback('📢 Majburiy Obuna', 'admin_subs_menu')],
    [Markup.button.callback('🎬 Kino qo\'shish', 'admin_add_movie')],
    [Markup.button.callback('🗂 Kinolar ro\'yxati', 'admin_movies_list_0')],
    [Markup.button.callback('✉️ Reklama yuborish', 'admin_broadcast')],
  ]);
}

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx)) return;
  resetAdminState();
  await ctx.reply('🛠 Admin Panel', adminMainMenu());
});

bot.action('admin_back', async (ctx) => {
  if (!isAdmin(ctx)) return;
  resetAdminState();
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText('🛠 Admin Panel', adminMainMenu());
  } catch (e) {
    await ctx.reply('🛠 Admin Panel', adminMainMenu());
  }
});

// ---------------------------------------------------------------------------
// 📊 Statistika
// ---------------------------------------------------------------------------
bot.action('admin_stats', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const [total, active, blocked, moviesCount, viewsAgg, topMovie] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ status: 'active' }),
    User.countDocuments({ status: 'blocked' }),
    Movie.countDocuments({}),
    Movie.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]),
    Movie.findOne().sort({ views: -1 }),
  ]);

  const totalViews = viewsAgg[0]?.total || 0;

  const text =
    `📊 *Statistika*\n\n` +
    `👥 Jami foydalanuvchilar: ${total}\n` +
    `✅ Faol: ${active}\n` +
    `🚫 Bloklagan: ${blocked}\n` +
    `🎬 Jami kinolar: ${moviesCount}\n` +
    `👁 Jami ko'rishlar: ${totalViews}` +
    (topMovie ? `\n🏆 Eng ko'p ko'rilgan: ${topMovie.code} (${topMovie.views} marta)` : '');

  try {
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', 'admin_back')]]),
    });
  } catch (e) {
    await ctx.reply(text, { parse_mode: 'Markdown' });
  }
});

// ---------------------------------------------------------------------------
// 📢 Majburiy Obuna Boshqaruvi
// ---------------------------------------------------------------------------
bot.action('admin_subs_menu', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();
  resetAdminState();

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("➕ Kanal/Guruh qo'shish", 'admin_add_channel')],
    [Markup.button.callback("❌ Kanal/Guruh o'chirish", 'admin_remove_channel_list')],
    [Markup.button.callback('📋 Kanallar ro\'yxati', 'admin_list_channels')],
    [Markup.button.callback('⬅️ Orqaga', 'admin_back')],
  ]);

  try {
    await ctx.editMessageText('📢 Majburiy Obuna Boshqaruvi', keyboard);
  } catch (e) {
    await ctx.reply('📢 Majburiy Obuna Boshqaruvi', keyboard);
  }
});

// 📋 Kanallar ro'yxati
bot.action('admin_list_channels', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const settings = await getSettings();
  const channels = settings.channels || [];

  if (channels.length === 0) {
    return ctx.reply("📋 Hozircha majburiy kanal/guruh qo'shilmagan.");
  }

  const text = channels
    .map(
      (ch, i) =>
        `${i + 1}. ${ch.title} (${ch.type === 'channel' ? 'Kanal' : 'Guruh'})\nID: ${ch.id}\nLink: ${ch.link}`
    )
    .join('\n\n');

  await ctx.reply(`📋 Majburiy Kanal/Guruhlar:\n\n${text}`);
});

// ➕ Kanal qo'shish - boshlash
bot.action('admin_add_channel', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();
  resetAdminState();
  adminState.mode = 'ADD_CHANNEL_WAIT_FORWARD';

  await ctx.reply(
    "➕ Kanal/Guruh qo'shish:\n\n" +
      "1) Botni shu kanal/guruhga ADMIN qilib qo'shing.\n" +
      "2) Keyin shu yerga ushbu kanal/guruhdan istalgan xabarni FORWARD qiling (Maxfiy kanallar uchun ham ishlaydi).\n\n" +
      "Bekor qilish uchun /admin yuboring."
  );
});

// ❌ Kanal o'chirish - ro'yxatni chiqarish
bot.action('admin_remove_channel_list', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const settings = await getSettings();
  const channels = settings.channels || [];

  if (channels.length === 0) {
    return ctx.reply("📋 O'chirish uchun kanal/guruh mavjud emas.");
  }

  const buttons = channels.map((ch) => [
    Markup.button.callback(`❌ ${ch.title}`, `remove_channel_${ch.id}`),
  ]);
  buttons.push([Markup.button.callback('⬅️ Orqaga', 'admin_subs_menu')]);

  await ctx.reply("❌ O'chirish uchun kanal/guruhni tanlang:", Markup.inlineKeyboard(buttons));
});

// ❌ Kanalni o'chirish - amalga oshirish
bot.action(/^remove_channel_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  const channelId = ctx.match[1];
  await ctx.answerCbQuery();

  const settings = await getSettings();
  settings.channels = settings.channels.filter((ch) => ch.id !== channelId);
  await settings.save();

  await ctx.reply("✅ Kanal/Guruh ro'yxatdan o'chirildi.");
});

// ---------------------------------------------------------------------------
// 🎬 Kino qo'shish
// ---------------------------------------------------------------------------
bot.action('admin_add_movie', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();
  resetAdminState();
  adminState.mode = 'ADD_MOVIE_WAIT_VIDEO';

  await ctx.reply(
    "🎬 Kino qo'shish:\n\nVideoni caption (izoh) bilan birga shu yerga yuboring.\n\nBekor qilish uchun /admin yuboring."
  );
});

// ---------------------------------------------------------------------------
// 🗂 Kinolar ro'yxati (sahifalangan, ko'rilgan soni bilan)
// ---------------------------------------------------------------------------
const MOVIES_PER_PAGE = 8;

async function renderMoviesListPage(page) {
  const totalCount = await Movie.countDocuments({});
  const totalPages = Math.max(1, Math.ceil(totalCount / MOVIES_PER_PAGE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);

  const movies = await Movie.find({})
    .sort({ createdAt: -1 })
    .skip(safePage * MOVIES_PER_PAGE)
    .limit(MOVIES_PER_PAGE)
    .lean();

  if (movies.length === 0) {
    return {
      text: "🗂 Hozircha bazada kino yo'q.",
      keyboard: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Orqaga', 'admin_back')]]),
    };
  }

  const text =
    `🗂 *Kinolar ro'yxati* (${totalCount} ta, sahifa ${safePage + 1}/${totalPages})\n\n` +
    'Tafsilot va o\'chirish uchun kodni bosing:';

  const movieButtons = movies.map((m) => [
    Markup.button.callback(`🎬 ${m.code} — 👁 ${m.views || 0}`, `movie_detail_${m.code}`),
  ]);

  const navRow = [];
  if (safePage > 0) navRow.push(Markup.button.callback('⬅️', `admin_movies_list_${safePage - 1}`));
  if (safePage < totalPages - 1) navRow.push(Markup.button.callback('➡️', `admin_movies_list_${safePage + 1}`));
  if (navRow.length) movieButtons.push(navRow);

  movieButtons.push([Markup.button.callback('⬅️ Orqaga', 'admin_back')]);

  return { text, keyboard: Markup.inlineKeyboard(movieButtons) };
}

bot.action(/^admin_movies_list_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();
  const page = Number(ctx.match[1]) || 0;
  const { text, keyboard } = await renderMoviesListPage(page);
  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } catch (e) {
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  }
});

// 🎬 Bitta kino tafsiloti
bot.action(/^movie_detail_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const code = ctx.match[1];
  const movie = await Movie.findOne({ code });

  if (!movie) {
    return ctx.reply("⚠️ Bu kino topilmadi (o'chirilgan bo'lishi mumkin).");
  }

  const text =
    `🎬 *Kino tafsiloti*\n\n` +
    `🔢 Kod: ${movie.code}\n` +
    `👁 Ko'rilgan: ${movie.views || 0} marta\n` +
    `📝 Izoh: ${movie.caption ? movie.caption : '—'}\n` +
    `🗓 Qo'shilgan: ${movie.createdAt.toLocaleDateString('uz-UZ')}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("🗑 O'chirish", `movie_delete_${movie.code}`)],
    [Markup.button.callback('⬅️ Ro\'yxatga qaytish', 'admin_movies_list_0')],
  ]);

  try {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } catch (e) {
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  }
});

// 🗑 Kinoni o'chirish
bot.action(/^movie_delete_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();

  const code = ctx.match[1];
  const result = await Movie.deleteOne({ code });

  if (result.deletedCount === 0) {
    await ctx.reply('⚠️ Kino topilmadi yoki allaqachon o\'chirilgan.');
  } else {
    await ctx.reply(`✅ Kino ("${code}") bazadan o'chirildi.`);
  }

  const { text, keyboard } = await renderMoviesListPage(0);
  await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
});

// ---------------------------------------------------------------------------
// ✉️ Reklama (Broadcast)
// ---------------------------------------------------------------------------
bot.action('admin_broadcast', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();
  resetAdminState();
  adminState.mode = 'BROADCAST_WAIT_MESSAGE';

  await ctx.reply(
    "✉️ Reklama xabarini yuboring (matn, rasm, video — istalgan turdagi xabar).\n" +
      "Xabar barcha foydalanuvchilarga forward qilinadi.\n\n" +
      "Bekor qilish uchun /admin yuboring."
  );
});

async function runBroadcast(ctx, fromChatId, messageId) {
  const users = await User.find({ status: 'active' }).select('telegramId').lean();

  let success = 0;
  let blockedCount = 0;

  await ctx.reply(`⏳ Yuborish boshlandi... Jami: ${users.length} foydalanuvchi.`);

  for (const u of users) {
    try {
      await bot.telegram.copyMessage(u.telegramId, fromChatId, messageId);
      success += 1;
    } catch (err) {
      blockedCount += 1;
      await User.updateOne({ telegramId: u.telegramId }, { $set: { status: 'blocked' } });
    }
    // Telegram flood-limitiga tushmaslik uchun kichik kechikish
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  await ctx.reply(
    `✅ Xabar yuborish yakunlandi!\n\n` +
      `📨 ${success} ta odamga yetib bordi.\n` +
      `🚫 ${blockedCount} ta odam botni bloklagan.`
  );
}

// ---------------------------------------------------------------------------
// Admindan keladigan xabarlarni holatga (state) qarab qayta ishlash
// (Bu handler oddiy foydalanuvchi xabarlaridan OLDIN ishlashi kerak)
// ---------------------------------------------------------------------------
bot.on('message', async (ctx, next) => {
  if (!isAdmin(ctx) || !adminState.mode) {
    return next();
  }

  const msg = ctx.message;

  // ---- 1) Kanal qo'shish: forward kutilmoqda ----
  if (adminState.mode === 'ADD_CHANNEL_WAIT_FORWARD') {
    const fwdChat = msg.forward_from_chat;
    if (!fwdChat) {
      return ctx.reply("⚠️ Iltimos, kanal/guruhdan xabarni FORWARD qiling.");
    }

    adminState.temp.channelId = String(fwdChat.id);
    adminState.temp.channelTitle = fwdChat.title || fwdChat.username || 'Nomsiz';
    adminState.temp.channelType = fwdChat.type === 'channel' ? 'channel' : 'group';
    adminState.mode = 'ADD_CHANNEL_WAIT_LINK';

    await ctx.reply(
      "🔗 Endi shu kanal/guruhning ODDIY foydalanuvchi bosishi mumkin bo'lgan havolasini (link) yuboring.\n" +
        "Masalan: https://t.me/kanalim yoki https://t.me/+xxxxxxx (maxfiy kanal uchun invite link)."
    );
    return;
  }

  // ---- 2) Kanal qo'shish: link kutilmoqda ----
  if (adminState.mode === 'ADD_CHANNEL_WAIT_LINK') {
    const link = msg.text && msg.text.trim();
    if (!link || !link.startsWith('http')) {
      return ctx.reply('⚠️ Iltimos, to\'g\'ri havola (link) yuboring (http... bilan boshlanishi kerak).');
    }

    const settings = await getSettings();
    settings.channels.push({
      id: adminState.temp.channelId,
      title: adminState.temp.channelTitle,
      link,
      type: adminState.temp.channelType,
    });
    await settings.save();

    await ctx.reply(`✅ "${adminState.temp.channelTitle}" majburiy obuna ro'yxatiga qo'shildi.`);
    resetAdminState();
    return;
  }

  // ---- 3) Kino qo'shish: video kutilmoqda ----
  if (adminState.mode === 'ADD_MOVIE_WAIT_VIDEO') {
    if (!msg.video) {
      return ctx.reply('⚠️ Iltimos, video fayl yuboring (caption bilan birga bo\'lishi mumkin).');
    }

    adminState.temp.file_id = msg.video.file_id;
    adminState.temp.caption = msg.caption || '';
    adminState.mode = 'ADD_MOVIE_WAIT_CODE';

    await ctx.reply("🔢 Endi shu kino uchun KOD kiriting (masalan: 1001):");
    return;
  }

  // ---- 4) Kino qo'shish: kod kutilmoqda ----
  if (adminState.mode === 'ADD_MOVIE_WAIT_CODE') {
    const code = msg.text && msg.text.trim();
    if (!code) {
      return ctx.reply('⚠️ Iltimos, faqat matn (kod) yuboring.');
    }

    const exists = await Movie.findOne({ code });
    if (exists) {
      return ctx.reply('⚠️ Bu kod allaqachon mavjud. Boshqa kod kiriting:');
    }

    const movie = await Movie.create({
      code,
      file_id: adminState.temp.file_id,
      caption: adminState.temp.caption,
    });

    await ctx.reply(
      `✅ Kino bazaga saqlandi!\n\n` +
        `🔢 Kod: ${movie.code}\n` +
        `📝 Izoh: ${movie.caption ? movie.caption : '—'}\n` +
        `👁 Ko'rilgan: 0 marta`
    );

    resetAdminState();
    return;
  }

  // ---- 5) Reklama: xabar kutilmoqda ----
  if (adminState.mode === 'BROADCAST_WAIT_MESSAGE') {
    resetAdminState();
    await runBroadcast(ctx, msg.chat.id, msg.message_id);
    return;
  }

  return next();
});

// ---------------------------------------------------------------------------
// Oddiy foydalanuvchi: kino kodini qidirish
// ---------------------------------------------------------------------------
bot.on('text', async (ctx) => {
  if (isAdmin(ctx)) return; // admin xabarlari yuqorida ishlandi

  await upsertUser(ctx.from.id);

  const { subscribed, notJoined } = await checkSubscription(bot, ctx.from.id);
  if (!subscribed) {
    const { text, keyboard } = buildSubscriptionMessage(notJoined);
    return ctx.reply(text, keyboard);
  }

  const code = ctx.message.text.trim();
  const movie = await Movie.findOne({ code });

  if (!movie) {
    return ctx.reply("❌ Bunday kodga ega kino topilmadi. Kodni tekshirib qaytadan urinib ko'ring.");
  }

  movie.views = (movie.views || 0) + 1;
  await movie.save();

  const baseCaption = movie.caption || `Kodi: ${movie.code}`;
  const caption = `${baseCaption}\n\n👁 Ko'rilgan: ${movie.views} marta`;

  await ctx.replyWithVideo(movie.file_id, { caption });
});

module.exports = bot;
