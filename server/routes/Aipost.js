const express = require('express');
const router = express.Router();
const AIPost = require('../models/AIPost');
const Character = require('../models/Character');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
let timeoutId = null;

const postLoop = async () => {
  try {
    const fetchTimestamp = new Date().toISOString();
    console.log(`[${fetchTimestamp}] Fetching random character from MongoDB`);
    
    const randomChar = await Character.aggregate([{ $sample: { size: 1 } }]);
    if (!randomChar.length) {
      console.error(`[${fetchTimestamp}] No characters found in database`);
      scheduleNextPost();
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

    const pythonScriptPath = path.resolve(__dirname, '../python/postMaker.py');
    if (!fs.existsSync(pythonScriptPath)) {
      console.error(`[${fetchTimestamp}] Python script not found`);
      scheduleNextPost();
      return;
    }

    console.log(`[${fetchTimestamp}] Executing Python script`);
    const py = spawn('python3', [pythonScriptPath]);

    let output = '';
    py.stdout.on('data', (data) => output += data.toString());
    py.stderr.on('data', (data) => console.error(`[Python stderr] ${data}`));

    py.on('close', async (code) => {
      if (code !== 0) {
        console.error(`Python exited with code ${code}`);
        scheduleNextPost();
        return;
      }

      try {
        const responseData = JSON.parse(output.trim());
        const post = new AIPost({
          authorId: charRand.id,
          authorName: charRand.name || 'Unknown',
          authorPhoto: charRand.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
          community: '@AICharacters',
          content: `<p>${responseData.post}</p>`,
          viewCount: 0,
          likeCount: 0,
          commentCount: 0,
          likedBy: [],
          trend: 10,
          value: 0,
          createdAt: new Date()
        });

        await post.save();
        console.log(`[${new Date().toISOString()}] AI post created: ${post._id}`);
      } catch (e) {
        console.error(`Failed to parse Python output: ${output}`, e);
      }
      
      scheduleNextPost();
    });

    py.stdin.write(JSON.stringify(inputData) + '\n');
    py.stdin.end();
  } catch (err) {
    console.error(`Unexpected error:`, err);
    scheduleNextPost();
  }
};

const scheduleNextPost = () => {
  const randomInterval = Math.floor(Math.random() * (3600000 - 300000 + 1)) + 300000; // 5–60 mins
  const nextPostTime = new Date(Date.now() + randomInterval).toISOString();
  console.log(`Next AI post scheduled for ${nextPostTime} (${randomInterval / 60000} mins)`);
  
  timeoutId = setTimeout(postLoop, randomInterval);
};

// Start loop automatically when server boots
postLoop();

// Keep your control route if you still want to start/stop manually
router.post('/control-python', (req, res) => {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
    console.log(`[${new Date().toISOString()}] AI posting loop stopped manually`);
    return res.status(200).json({ message: 'Stopped' });
  } else {
    console.log(`[${new Date().toISOString()}] AI posting loop started manually`);
    postLoop();
    return res.status(200).json({ message: 'Started' });
  }
});


module.exports = { router, postLoop };
