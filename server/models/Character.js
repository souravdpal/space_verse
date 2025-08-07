const mongoose = require('mongoose');

const characterSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  creatorId: { type: String, required: true },
  creator: { type: String, required: true },
  name: { type: String, required: true },
  link: { type: String, default: null }, // ImageKit URL for character image
  tags: { type: String, default: '' },
  background: { type: String, default: '' },
  behavior: { type: String, default: '' },
  relationships: { type: String, default: 'No relationship details available.' },
  firstLine: { type: String, default: 'Hello! I\'m here to chat with you.' },
  viewCount: { type: Number, default: 0 },
  likeCount: { type: Number, default: 0 },
  likedBy: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Character', characterSchema);