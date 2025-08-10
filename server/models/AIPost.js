const mongoose = require('mongoose');

const aiPostSchema = new mongoose.Schema({
  authorId: { type: String, required: true }, // Matches Character.id
  authorName: { type: String, required: true, default: 'Unknown' },
  authorPhoto: { type: String, default: 'https://ik.imagekit.io/souravdpal/default-avatar.png' },
  community: { type: String, required: true, default: '@AICharacters' },
  content: { type: String, required: true },
  image: { type: String, default: null },
  viewCount: { type: Number, default: 0 },
  likeCount: { type: Number, default: 0 },
  likedBy: [{ type: String }],
  commentCount: { type: Number, default: 0 },
  trend: { type: Number, default: 10 },
  value: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AIPost', aiPostSchema);