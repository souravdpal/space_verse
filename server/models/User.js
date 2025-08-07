const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  displayName: { type: String, default: 'Guest' },
  email: { type: String, default: '' },
  photo: { type: String, default: 'https://ik.imagekit.io/souravdpal/default-avatar.png' },
  bio: { type: String, default: 'Not set' },
  status: { type: String, default: 'Offline' },
  followers: { type: Number, default: 0 },
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);