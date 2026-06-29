const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI environment variable topilmadi (.env faylini tekshiring)');
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('✅ MongoDB ga muvaffaqiyatli ulandi');
  } catch (err) {
    console.error('❌ MongoDB ulanish xatosi:', err.message);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB ulanishi uzildi, qayta urinilmoqda...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB ulanishi tiklandi');
  });
}

module.exports = connectDB;
