// routes/trend.js
const express = require('express');
const cron = require('node-cron');
const Post = require('../models/Post');
const AIPost = require('../models/AIPost');

const router = express.Router();

// Helper function to degrade trend for any given model
async function degradeCollection(Model, collectionName) {
  try {
    console.log(`[${new Date().toISOString()}] Starting trend degradation for ${collectionName}...`);

    const result = await Model.updateMany(
      { trend: { $gt: 0 } },
      [
        {
          $set: {
            trend: { $max: [0, { $subtract: ['$trend', 0.5] }] },
            old: {
              $cond: [{ $lte: [{ $subtract: ['$trend', 0.5] }, 0] }, true, '$old']
            }
          }
        }
      ]
    );

    console.log(`[${new Date().toISOString()}] ${collectionName}: ${result.modifiedCount} documents updated.`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error degrading ${collectionName}:`, err);
  }
}

// Degrade both collections
async function degradeAll() {
  await degradeCollection(Post, 'Post');
  await degradeCollection(AIPost, 'AIPost');
}

// Manual trigger endpoint
router.post('/degrade-posts', async (req, res) => {
  await degradeAll();
  res.json({ message: 'Trend scores updated successfully for all collections' });
});

// Automatic run every day at midnight UTC
cron.schedule('0 0 * * *', () => {
  degradeAll();
}, {
  timezone: 'UTC'
});

module.exports = router;
