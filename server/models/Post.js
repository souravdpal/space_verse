const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  authorId: { type: String, required: true },
  authorName: { type: String, required: true },
  community: { type: String, required: true },
  content: { type: String, required: true },
  image: { type: String, default: null }, // ImageKit URL for post image
  likeCount: { type: Number, default: 0 },
  likedBy: [{ type: String }],
  commentCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Post', postSchema);