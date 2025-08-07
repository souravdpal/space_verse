const express = require('express');
const router = express.Router();
const Character = require('../models/Character');
const User = require('../models/User');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Get all characters
router.get('/c/list', async (req, res) => {
  try {
    const characters = await Character.find().sort({ createdAt: -1 }).lean();
    const userId = req.query.uid;
    console.log(userId); // Fixed typo: changed uid to userId
    if (userId) {
      const user = await User.findOne({ uid: userId });
      if (user) {
        characters.forEach(char => {
          char.liked = char.likedBy.includes(userId);
        });
      }
    }
    res.json(characters);
  } catch (error) {
    console.error('Error fetching characters:', error.message);
    res.status(500).json({ error: 'Failed to fetch characters', details: error.message });
  }
});

// Get character by ID
router.get('/c/char/:charId', async (req, res) => {
  const { charId } = req.params;

  try {
    const character = await Character.findOne({ id: charId });
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    character.viewCount += 1;
    await character.save();
    const sendDat = {
      id: character.id,
      name: character.name,
      firstLine: character.firstLine,
      link: character.link,
      creator: character.creator,
      creatorId: character.creatorId,
    };
    console.log('Character fetched:', sendDat);
    res.json(sendDat);
  } catch (error) {
    console.error('Error fetching character:', error.message);
    res.status(500).json({ error: 'Failed to fetch character', details: error.message });
  }
});

// Create a character
router.post('/char/uploads/:charId', upload.none(), async (req, res) => {
  const { charId } = req.params;
  const { name, background, behavior, relationships, tags, firstLine, creatorId, creator, image } = req.body;
  const userId = req.headers['x-user-id'];

  if (!userId || userId !== creatorId) {
    console.error('Invalid or missing user ID:', { userId, creatorId });
    return res.status(400).json({ error: 'Invalid or missing user ID' });
  }

  if (!name || !creatorId || !creator) {
    console.error('Missing required fields:', { name, creatorId, creator });
    return res.status(400).json({ error: 'Missing required fields: name, creatorId, and creator are required' });
  }

  try {
    const existingCharacter = await Character.findOne({ id: charId });
    if (existingCharacter) {
      console.error('Character ID already exists:', charId);
      return res.status(400).json({ error: 'Character ID already exists' });
    }

    const user = await User.findOne({ uid: creatorId });
    if (!user) {
      console.error('User not found:', creatorId);
      return res.status(404).json({ error: 'User not found' });
    }

    const character = new Character({
      id: charId,
      creatorId,
      creator,
      name,
      background: background || '',
      behavior: behavior || '',
      relationships: relationships || 'No relationship details available.',
      tags: tags || '',
      firstLine: firstLine || 'Hello! I\'m here to chat with you.',
      link: image || null, // ImageKit URL from /char/:charId/img
    });

    await character.save();
    console.log('Character created:', { charId, name });
    res.status(201).json({ message: 'Character created successfully', character });
  } catch (error) {
    console.error('Error creating character:', error.message);
    res.status(500).json({ error: 'Failed to create character', details: error.message });
  }
});
router.post('/api/char/:charId/like', async (req, res) => {
  const userId = req.query.uid;
  const { charId } = req.params;

  if (!userId || !charId) {
    return res.status(400).json({ error: 'Missing user ID or character ID' });
  }

  try {
    // 🔄 Use findOne instead of findById because charId is a string, not ObjectId
    const character = await Character.findOne({id: charId });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const user = await User.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isLiked = character.likedBy.includes(userId);

    if (isLiked) {
      character.likedBy = character.likedBy.filter(id => id !== userId);
      character.likeCount = Math.max((character.likeCount || 1) - 1, 0);
    } else {
      character.likedBy.push(userId);
      character.likeCount = (character.likeCount || 0) + 1;
    }

    await character.save();

    return res.json({
      liked: !isLiked,
      likeCount: character.likeCount
    });
  } catch (error) {
    console.error('Error liking character:', error.message);
    return res.status(500).json({
      error: 'Failed to like character',
      details: error.message
    });
  }
});



// Get character like status
router.get('/api/char/:charId/like', async (req, res) => {
  const userId = req.headers['x-user-id'] || req.query.uid;
  if (!userId) {
    return res.status(400).json({ error: 'Missing user ID' });
  }

  try {
    const character = await Character.findOne({ id: req.params.charId });
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    const liked = character.likedBy.includes(userId);
    res.json({ likeCount: character.likeCount, liked });
  } catch (error) {
    console.error('Error fetching like status:', error.message);
    res.status(500).json({ error: 'Failed to fetch like status', details: error.message });
  }
});

module.exports = router;