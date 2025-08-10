const express = require('express');
const router = express.Router();
const AIPost = require('../models/AIPost');
const Character = require('../models/Character');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let isRunning = false;
let timeoutId = null;

router.post('/control-python', async (req, res) => {
  if (isRunning) {
    if (timeoutId) {
      clearTimeout(timeoutId);
      isRunning = false;
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] AI posting loop stopped`);
      return res.status(200).json({ message: 'AI posting loop stopped', timestamp });
    }
  }

  isRunning = true;
  const startTimestamp = new Date().toISOString();
  console.log(`[${startTimestamp}] AI posting loop started`);
  res.status(200).json({ message: 'AI posting loop started', timestamp: startTimestamp });

  const postLoop = async () => {
    if (!isRunning) return;

    try {
      const fetchTimestamp = new Date().toISOString();
      console.log(`[${fetchTimestamp}] Fetching random character from MongoDB`);
      
      const randomChar = await Character.aggregate([{ $sample: { size: 1 } }]);
      if (!randomChar.length) {
        console.error(`[${fetchTimestamp}] No characters found in database`);
        isRunning = false;
        return;
      }

      const charRand = randomChar[0];
      console.log(`[${fetchTimestamp}] Selected character: ${charRand.name} (ID: ${charRand.id})`);

      const inputData = {
        name: charRand.name || 'Unknown',
        behavior: charRand.behavior || '',
        background: charRand.background || '',
        relationships: charRand.relationships || 'No relationship details available.',
        tags: charRand.tags || '',
        link: charRand.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
        character_id: charRand.id
      };
      console.log(`[${fetchTimestamp}] Input data for Python script:`, inputData);

      const pythonScriptPath = path.resolve(__dirname, '../python/postMaker.py');
      if (!fs.existsSync(pythonScriptPath)) {
        console.error(`[${fetchTimestamp}] Python script not found at ${pythonScriptPath}`);
        isRunning = false;
        return;
      }

      console.log(`[${fetchTimestamp}] Executing Python script: ${pythonScriptPath}`);
      const py = spawn('python3', [pythonScriptPath]);
      let output = '';
      let errorOutput = '';

      py.stdout.on('data', (data) => {
        output += data.toString();
        console.log(`[${new Date().toISOString()}] Python stdout: ${data}`);
      });

      py.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(`[${new Date().toISOString()}] Python stderr: ${data}`);
      });

      py.on('close', async (code) => {
        const closeTimestamp = new Date().toISOString();
        if (code !== 0) {
          console.error(`[${closeTimestamp}] Python script exited with code ${code}: ${errorOutput}`);
          scheduleNextPost();
          return;
        }

        try {
          const responseData = JSON.parse(output.trim());
          console.log(`[${closeTimestamp}] Python script response:`, JSON.stringify(responseData, null, 2));

          const post = new AIPost({
            authorId: charRand.id,
            authorName: charRand.name || 'Unknown',
            authorPhoto: charRand.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
            community: '@AICharacters',
            content: `<p>${responseData.post}</p>`,
            image: null,
            viewCount: 0,
            likeCount: 0,
            commentCount: 0,
            likedBy: [],
            trend: 10,
            value: 0,
            createdAt: new Date()
          });

          await post.save();
          console.log(`[${new Date().toISOString()}] AI post created: ID=${post._id}, Author=${post.authorName}, authorPhoto=${post.authorPhoto}`);
          scheduleNextPost();
        } catch (e) {
          console.error(`[${new Date().toISOString()}] Failed to parse Python output: ${output}`, e);
          scheduleNextPost();
        }
      });

      console.log(`[${new Date().toISOString()}] Sending character data to Python script`);
      py.stdin.write(JSON.stringify(inputData) + '\n');
      py.stdin.end();
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Unexpected error:`, err);
      scheduleNextPost();
    }
  };

  const scheduleNextPost = () => {
    if (!isRunning) return;
    
    const randomInterval = Math.floor(Math.random() * (3600000 - 300000 + 1)) + 300000;
    const nextPostTime = new Date(Date.now() + randomInterval).toISOString();
    console.log(`[${new Date().toISOString()}] Next AI post scheduled for ${nextPostTime} (${randomInterval/60000} minutes from now)`);
    
    timeoutId = setTimeout(async () => {
      await postLoop();
    }, randomInterval);
  };

  postLoop();
});

// Like an AI post
router.post('/api/aiposts/:postId/like', async (req, res) => {
  const userId = req.headers['x-user-id'] || req.query.uid;
  const { postId } = req.params;

  if (!userId || !postId) {
    console.error('Missing user ID or post ID:', { userId, postId });
    return res.status(400).json({ error: 'Missing user ID or post ID' });
  }

  try {
    const post = await AIPost.findById(postId);
    if (!post) {
      console.error(`AI post not found: ${postId}`);
      return res.status(404).json({ error: 'AI post not found' });
    }

    const isLiked = post.likedBy.includes(userId);

    if (isLiked) {
      post.likedBy = post.likedBy.filter(id => id !== userId);
      post.likeCount = Math.max((post.likeCount || 1) - 1, 0);
    } else {
      post.likedBy.push(userId);
      post.likeCount = (post.likeCount || 0) + 1;
    }

    await post.save();
    console.log(`AI post ${postId} ${isLiked ? 'unliked' : 'liked'} by user ${userId}, new likeCount: ${post.likeCount}`);

    return res.json({
      likes: post.likeCount,
      likedBy: post.likedBy
    });
  } catch (error) {
    console.error('Error liking AI post:', error.message, error.stack);
    return res.status(500).json({
      error: 'Failed to like AI post',
      details: error.message
    });
  }
});

module.exports = router;