const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  token: { type: String, required: true },
  usageCount: { type: Number, default: 0 },
  lastUsed: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ApiKey', apiKeySchema);