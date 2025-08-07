const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const Post = require('../models/Post');
const User = require('../models/User');
const Notification = require('../models/getnot.js');

// Get comments for a post
router.post('/com', async (req, res) => {
  const { query: postId } = req.body;

  if (!postId) {
    return res.status(400).json({ error: 'Missing post ID' });
  }

  try {
    const comments = await Comment.find({ postId }).sort({ createdAt: -1 }).lean();
    const userIds = [...new Set(comments.map(comment => comment.authorId))];
    const users = await User.find({ uid: { $in: userIds } }).lean();
    const userMap = users.reduce((map, user) => {
      map[user.uid] = user.photo;
      return map;
    }, {});

    const commentsWithAuthorPhoto = comments.map(comment => ({
      ...comment,
      authorPhoto: userMap[comment.authorId] || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
    }));

    res.json(commentsWithAuthorPhoto);
  } catch (error) {
    console.error('Error fetching comments:', error.message);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Add a comment
router.post('/add/comment', async (req, res) => {
  const { postid, content, authorId } = req.body;

  if (!postid || !content || !authorId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const user = await User.findOne({ uid: authorId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const post = await Post.findById(postid);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const comment = new Comment({
      postId: postid,
      authorId,
      authorName: user.displayName,
      content,
      community: post.community,
      replyTo: content.match(/^@(\w+)/)?.[1] || null,
    });

    await comment.save();
    post.commentCount += 1;
    await post.save();

    



    res.status(201).json({
      comment: {
        ...comment.toObject(),
        authorPhoto: user.photo,
      },
    });
  } catch (error) {
    console.error('Error adding comment:', error.message);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Like a comment
router.post('/api/comments/:commentId/like', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(400).json({ error: 'Missing user ID' });
  }

  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const index = comment.likedBy.indexOf(userId);

    if (index === -1) {
      comment.likedBy.push(userId);
      comment.likes += 1;
    } else {
      comment.likedBy.splice(index, 1);
      comment.likes -= 1;
    }

    await comment.save();
    const user = await User.findOne({ uid: comment.authorId });
    res.json({
      likes: comment.likes,
      likedBy: comment.likedBy,
      authorPhoto: user ? user.photo : 'https://ik.imagekit.io/souravdpal/default-avatar.png',
    });
  } catch (error) {
    console.error('Error liking comment:', error.message);
    res.status(500).json({ error: 'Failed to update like' });
  }
});

module.exports = router;