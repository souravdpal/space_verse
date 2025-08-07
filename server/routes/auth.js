const express = require('express');
const router = express.Router();
const User = require('../models/User');



router.post('/data', async (req, res) => {
  const { uid, display_name, email, photo } = req.body;

  if (!uid || !display_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    let user = await User.findOne({ uid });
    if (user) {
      return res.status(400).json({ error: 'User already exists' });
    }

    user = new User({
      uid,
      displayName: display_name,
      email,
      photo: photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
    });

    await user.save();
    res.status(201).json({ message: 'User saved successfully', user });
  } catch (error) {
    console.error('Error saving user:', error.message);
    res.status(500).json({ error: 'Failed to save user' });
  }
});

// Get user profile
router.get('/cred', async (req, res) => {
  const { uid } = req.query;

  if (!uid) {
    return res.status(400).json({ error: 'Missing user ID' });
  }

  try {
    const user = await User.findOne({ uid });
    if (!user) {
      return res.status(404).json({ msg: 'none' });
    }
    res.json({
      name: user.displayName,
      photo: user.photo,
      bio: user.bio,
      status: user.status,
      followers: user.followers,
    });
  } catch (error) {
    console.error('Error fetching user:', error.message);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user bio
router.post('/api/user/bio', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { bio } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Missing user ID' });
  }
  if (!bio || typeof bio !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing bio' });
  }

  try {
    const user = await User.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.bio = bio;
    await user.save();
    res.json({ message: 'Bio updated successfully', bio: user.bio });
  } catch (error) {
    console.error('Error updating bio:', error.message);
    res.status(500).json({ error: 'Failed to update bio' });
  }
});



module.exports = router;