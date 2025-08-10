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
  trend: { type: Number, default: 10, min: 0, max: 10 }, // Trend score 1-10, starts at 10
  value: { type: Number, default: 0 }, // Engagement-based value score
  old: { type: Boolean, default: false } // Marks post as old when trend reaches 0
});

// Automatically decay trend score by 0.5 daily and mark as old when reaching 0
postSchema.index({ createdAt: 1 }); // Index for efficient sorting
postSchema.statics.updateTrendScores = async function() {
  const oneDay = 24 * 60 * 60 * 1000; // One day in milliseconds
  const now = new Date();
  
  await this.updateMany(
    { old: false },
    [
      {
        $set: {
          trend: {
            $max: [
              0,
              {
                $subtract: [
                  '$trend',
                  {
                    $multiply: [
                      0.5,
                      {
                        $floor: {
                          $divide: [
                            { $subtract: [now, '$createdAt'] },
                            oneDay
                          ]
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          },
          old: { $eq: ['$trend', 0] }
        }
      }
    ]
  );
};

// Calculate value based on engagement (likes and comments)
postSchema.statics.updateValueScores = async function() {
  await this.updateMany(
    {},
    [
      {
        $set: {
          value: {
            $add: [
              { $multiply: ['$likeCount', 2] }, // Likes are worth 2 points each
              { $multiply: ['$commentCount', 3] } // Comments are worth 3 points each
            ]
          }
        }
      }
    ]
  );
};

module.exports = mongoose.model('Post', postSchema);