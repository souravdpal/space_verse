const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/getnot.js');
const verifyFirebaseToken = require('./verifyFirebaseToken');
const mongoose = require('mongoose');

// Get creator follow status
router.get('/api/user/:creatorId/follow', verifyFirebaseToken, async (req, res) => {
  const userId = req.query.uid;
  const creatorUid = req.params.creatorId;

  if (!userId) {
    console.error('❌ Missing user ID in query');
    return res.status(400).json({ error: 'Missing user ID' });
  }

  try {
    const creator = await User.findOne({ uid: creatorUid });
    if (!creator) {
      console.error('❌ Creator not found:', creatorUid);
      return res.status(404).json({ error: 'Creator not found' });
    }

    const user = await User.findOne({ uid: userId });
    if (!user) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    const followed = user.following.some(id => id.equals(creator._id));
    console.log(`✅ Follow status checked: user ${userId} ${followed ? 'follows' : 'does not follow'} creator ${creatorUid}`);
    res.json({ followed });
  } catch (error) {
    console.error('❌ Error checking follow status:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to check follow status', details: error.message });
  }
});

// Follow or unfollow a creator
router.post('/api/user/:creatorId/follow', verifyFirebaseToken, async (req, res) => {
  const userId = req.query.uid;
  const creatorUid = req.params.creatorId;

  if (!userId) {
    console.error('❌ Missing user ID in query');
    return res.status(400).json({ error: 'Missing user ID' });
  }

  try {
    console.log(`✅ Received follow/unfollow request: user ${userId} → creator ${creatorUid}`);

    const creator = await User.findOne({ uid: creatorUid });
    if (!creator) {
      console.error('❌ Creator not found:', creatorUid);
      return res.status(404).json({ error: 'Creator not found' });
    }

    const user = await User.findOne({ uid: userId });
    if (!user) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-follow
    if (userId === creatorUid) {
      console.error('❌ User attempted to follow themselves:', userId);
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    let isFollowing = user.following.some(id => id.equals(creator._id));

    if (isFollowing) {
      // Unfollow
      user.following = user.following.filter(id => !id.equals(creator._id));
      creator.followers = Math.max(0, (creator.followers || 0) - 1);
      console.log(`✅ User ${userId} unfollowed creator ${creatorUid}`);
    } else {
      // Follow
      user.following.push(creator._id);
      creator.followers = (creator.followers || 0) + 1;

      // Create a notification for the creator
      const notification = new Notification({
        id: creator.uid,
        message: `${user.displayName || 'A user'} followed you!`,
        category: 'Follow',
        time: new Date(),
        status: false
      });
      await notification.save();
      console.log(`📨 Notification sent to ${creator.uid} for being followed`);
    }

    // Use atomic, version-safe updates to avoid VersionError
    await Promise.all([
      User.findByIdAndUpdate(user._id, { following: user.following }),
      User.findByIdAndUpdate(creator._id, { followers: creator.followers })
    ]);

    res.json({
      followed: !isFollowing,
      followerCount: creator.followers
    });

  } catch (error) {
    console.error('❌ Error processing follow/unfollow:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to follow/unfollow creator', details: error.message });
  }
});

module.exports = router;
