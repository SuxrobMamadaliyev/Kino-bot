const axios = require('axios');

/**
 * Render.com bepul tarifida server 15 daqiqa harakatsizlikdan keyin "uxlab qoladi".
 * Shu funksiya har 10 daqiqada o'zining tashqi URL manziliga so'rov yuborib,
 * serverni doimo "uyg'oq" holatda saqlaydi.
 */
function startKeepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL;

  if (!url) {
    console.warn('⚠️ RENDER_EXTERNAL_URL berilmagan, Keep-Alive funksiyasi ishlamaydi.');
    return;
  }

  const PING_INTERVAL = 10 * 60 * 1000; // 10 daqiqa

  setInterval(async () => {
    try {
      await axios.get(`${url}/ping`);
      console.log(`🔄 Keep-Alive ping yuborildi: ${url}/ping`);
    } catch (err) {
      console.error('❌ Keep-Alive ping xatosi:', err.message);
    }
  }, PING_INTERVAL);

  console.log('✅ Keep-Alive funksiyasi ishga tushdi (har 10 daqiqada ping)');
}

module.exports = { startKeepAlive };
