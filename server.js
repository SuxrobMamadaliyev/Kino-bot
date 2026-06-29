require('dotenv').config();

const express = require('express');
const connectDB = require('./db');
const bot = require('./bot');
const { startKeepAlive } = require('./keepAlive');

const PORT = process.env.PORT || 3000;
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;

const app = express();
app.use(express.json());

// Render uxlab qolmasligi va monitoring uchun oddiy "ping" endpoint
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.get('/', (req, res) => {
  res.status(200).send('🎬 Kino Kodlari Bot ishlamoqda.');
});

const WEBHOOK_PATH = `/webhook/${process.env.BOT_TOKEN}`;

// Telegramdan keladigan update'larni qabul qilish
app.use(bot.webhookCallback(WEBHOOK_PATH));

async function start() {
  await connectDB();

  if (!RENDER_EXTERNAL_URL) {
    console.warn(
      '⚠️ RENDER_EXTERNAL_URL berilmagan. Webhook o\'rnatilmaydi, polling rejimida ishga tushiriladi (faqat lokal test uchun).'
    );
    await bot.launch();
    console.log('🤖 Bot polling rejimida ishga tushdi (lokal).');
  } else {
    const webhookUrl = `${RENDER_EXTERNAL_URL}${WEBHOOK_PATH}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`✅ Webhook o'rnatildi: ${webhookUrl}`);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT} portda ishga tushdi`);
    startKeepAlive();
  });
}

start().catch((err) => {
  console.error('❌ Server ishga tushishda xato:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
