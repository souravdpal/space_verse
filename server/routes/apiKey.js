const express = require('express');
const router = express.Router();
const ApiKey = require('../models/ApiKey');
const User = require('../models/User')

// Submit API key (as provided)
router.post('/gsk/token', async (req, res) => {
  const { userId, token } = req.body;

  if (!userId || !token || !token.startsWith('gsk_')) {
    return res.status(400).json({ msg: 'Invalid API key' });
  }
  let user  = User.findOne({userId})
  if(!user){
    console.log('invalid api req')
        res.status(500).json({ msg: 'Invalid user' });


  }
  try {
    const existingKey = await ApiKey.findOne({ userId });
    if (existingKey) {
      // Simulate rate limit check (one key per day)
      const lastUsed = existingKey.lastUsed || new Date(0);
      const now = new Date();
      const diffHours = (now - lastUsed) / (1000 * 60 * 60);
      if (diffHours < 24) {
        return res.status(429).json({ msg: 'Rate limit exceeded. Try again tomorrow.' });
      }
    }

    const apiKey = existingKey || new ApiKey({ userId });
    apiKey.token = token;
    apiKey.lastUsed = new Date();
    apiKey.usageCount += 1;

    await apiKey.save();
    res.json({ msg: 'API key saved successfully' });
  } catch (error) {
    console.error('Error saving API key:', error.message);
    res.status(500).json({ msg: 'Failed to save API key' });
  }
});

module.exports = router;