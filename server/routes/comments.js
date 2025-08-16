const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const Post = require('../models/Post');
const AIPost = require('../models/AIPost');
const User = require('../models/User');
const Character = require('../models/Character');
const Notification = require('../models/getnot.js');

router.post('/com', async (req, res) => {
  const { query: postId } = req.body;
  if (!postId) {
    console.error('Missing post ID in /com request:', req.body);
    return res.status(400).json({ error: 'Missing post ID' });
  }
  try {
    const comments = await Comment.find({ postId }).sort({ createdAt: -1 }).lean();
    console.log('Fetched comments for post ID:', postId, 'Count:', comments.length);

    const userIds = [];
    const charIds = [];
    comments.forEach(comment => {
      if (['@Characters', '@AICharacters', '@characters'].includes(comment.community)) {
        charIds.push(comment.authorId);
      } else {
        userIds.push(comment.authorId);
      }
    });
    console.log('User IDs:', userIds, 'Character IDs:', charIds);

    const users = await User.find({ uid: { $in: userIds } }).lean();
    const userMap = users.reduce((map, user) => {
      map[user.uid] = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
      return map;
    }, {});

    const characters = await Character.find({ id: { $in: charIds } }).lean();
    const charMap = characters.reduce((map, char) => {
      map[char.id] = char.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
      return map;
    }, {});

    const commentsWithLink = comments.map(comment => ({
      ...comment,
      link: ['@Characters', '@AICharacters', '@characters'].includes(comment.community)
        ? charMap[comment.authorId] || 'https://ik.imagekit.io/souravdpal/default-avatar.png'
        : userMap[comment.authorId] || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
      community: comment.community === '@characters' ? '@Characters' : comment.community
    }));

    res.json(commentsWithLink);
  } catch (error) {
    console.error('Error fetching comments for post ID:', postId, 'Error:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch comments', details: error.message });
  }
});

router.post('/add/comment', async (req, res) => {
  const { postid, content, authorId } = req.body;
  if (!postid || !content || !authorId) {
    console.error('Missing required fields in /add/comment:', { postid, content, authorId });
    return res.status(400).json({ error: 'Missing required fields: postid, content, and authorId are required' });
  }
  try {
    let post = await Post.findById(postid);
    let isAICharacter = false;
    if (!post) {
      post = await AIPost.findById(postid);
      isAICharacter = true;
      if (!post) {
        console.error('Post not found for ID:', postid);
        return res.status(404).json({ error: 'Post not found' });
      }
    }

    let authorName, link, isCharacter = false;
    if (['@Characters', '@AICharacters', '@characters'].includes(post.community)) {
      const character = await Character.findOne({ id: authorId }).lean();
      if (character) {
        authorName = character.name || 'Unknown';
        link = character.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
        isCharacter = true;
      } else {
        // Fall back to user if character not found
        console.log(`Character not found for ID: ${authorId}, checking users collection`);
        const user = await User.findOne({ uid: authorId }).lean();
        if (!user) {
          console.error('Author not found for ID:', authorId);
          return res.status(404).json({ error: 'Author not found in users or characters collection' });
        }
        authorName = user.displayName || 'Unknown';
        link = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
      }
    } else {
      const user = await User.findOne({ uid: authorId }).lean();
      if (!user) {
        console.error('User not found for ID:', authorId);
        return res.status(404).json({ error: 'User not found' });
      }
      authorName = user.displayName || 'Unknown';
      link = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
    }

    const comment = new Comment({
      postId: postid,
      authorId,
      authorName,
      content,
      community: post.community === '@characters' ? '@Characters' : post.community,
      replyTo: content.match(/^@(\w+)/)?.[1] || null,
      link,
      likes: 0,
      likedBy: [],
      createdAt: new Date()
    });

    await comment.save();
    post.commentCount = (post.commentCount || 0) + 1;
    await post.save();
    console.log('Comment saved for post ID:', postid, 'Comment ID:', comment._id);

    // Create notification for post author (if not self-commenting)
    if (post.authorId !== authorId) {
      const notification = new Notification({
        userId: post.authorId,
        type: 'comment',
        postId: postid,
        fromUserId: authorId,
        createdAt: new Date()
      });
      await notification.save();
      console.log('Notification created for comment:', notification._id);
    }

    res.status(201).json({
      comment: { ...comment.toObject(), link, isCharacter }
    });
  } catch (error) {
    console.error('Error adding comment for post ID:', postid, 'Error:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to add comment', details: error.message });
  }
});

router.post('/api/comments/:commentId/like', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    console.error('Missing user ID in /api/comments/:commentId/like:', req.query);
    return res.status(400).json({ error: 'Missing user ID' });
  }
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      console.error('Comment not found for ID:', req.params.commentId);
      return res.status(404).json({ error: 'Comment not found' });
    }

    const index = comment.likedBy.indexOf(userId);
    let action = '';
    if (index === -1) {
      comment.likedBy.push(userId);
      comment.likes = (comment.likes || 0) + 1;
      action = 'liked';
    } else {
      comment.likedBy.splice(index, 1);
      comment.likes = Math.max(0, (comment.likes || 0) - 1);
      action = 'unliked';
    }

    await comment.save();
    console.log(`Comment ${req.params.commentId} ${action} by user ${userId}, likes: ${comment.likes}`);

    let link = comment.link;
    if (!link) {
      if (['@Characters', '@AICharacters', '@characters'].includes(comment.community)) {
        const character = await Character.findOne({ id: comment.authorId }).lean();
        link = character ? character.link : 'https://ik.imagekit.io/souravdpal/default-avatar.png';
      } else {
        const user = await User.findOne({ uid: comment.authorId }).lean();
        link = user ? user.photo : 'https://ik.imagekit.io/souravdpal/default-avatar.png';
      }
    }

    if (comment.authorId !== userId && action === 'liked') {
      const notification = new Notification({
        userId: comment.authorId,
        type: 'comment_like',
        postId: comment.postId,
        fromUserId: userId,
        createdAt: new Date()
      });
      await notification.save();
      console.log('Notification created for comment like:', notification._id);
    }

    res.json({
      likes: comment.likes,
      likedBy: comment.likedBy,
      link,
      action
    });
  } catch (error) {
    console.error('Error liking comment ID:', req.params.commentId, 'Error:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to update like', details: error.message });
  }
});

module.exports = router;