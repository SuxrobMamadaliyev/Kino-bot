const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  id: {
    type: String, // masalan: -1001234567890 yoki @channelusername
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  link: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['channel', 'group'],
    default: 'channel',
  },
});

const settingsSchema = new mongoose.Schema({
  // Bitta umumiy sozlamalar hujjati saqlanadi (singleton pattern)
  channels: {
    type: [channelSchema],
    default: [],
  },
});

module.exports = mongoose.model('Settings', settingsSchema);
