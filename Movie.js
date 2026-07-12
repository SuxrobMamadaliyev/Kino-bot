const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  file_id: {
    type: String,
    required: true,
  },
  caption: {
    type: String,
    default: '',
  },
  views: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Movie', movieSchema);
