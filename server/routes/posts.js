const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const User = require('../models/User');
const Notification = require('../models/getnot.js');


router.post('/api/posts', async (req, res) => {
  console.log('Received /api/posts request:', { body: req.body });
  if (!req.body) {
    console.error('Request body is undefined');
    return res.status(400).json({ error: 'Request body is missing or invalid' });
  }

  const { content, community, authorId, image } = req.body;

  if (!content || !community || !authorId) {
    console.error('Missing required fields:', { content, community, authorId });
    return res.status(400).json({ error: 'Missing required fields: content, community, and authorId are required' });
  }

  try {
    const user = await User.findOne({ uid: authorId });
    if (!user) {
      console.error('User not found:', authorId);
      return res.status(404).json({ error: 'User not found' });
    }

    const post = new Post({
      authorId,
      authorName: user.displayName,
      community,
      content,
      image, // ImageKit URL from /posts/image
    });

    await post.save();
    console.log('Post created successfully:', post._id);
    res.status(201).json({
      ...post.toObject(),
      authorPhoto: user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
    });
  } catch (error) {
    console.error('Error creating post:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to create post', details: error.message });
  }
});
// Get posts
router.get('/api/posts', async (req, res) => {
  const { limit = 10, page = 1, community = 'all' } = req.query;

  try {
    const query = community === 'all' ? {} : { community };
    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const userIds = [...new Set(posts.map(post => post.authorId))];
    const users = await User.find({ uid: { $in: userIds } }).lean();
    const userMap = users.reduce((map, user) => {
      map[user.uid] = user.photo;
      return map;
    }, {});

    const postsWithAuthorPhoto = posts.map(post => ({
      ...post,
      authorPhoto: userMap[post.authorId] || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
    }));

    res.json(postsWithAuthorPhoto);
  } catch (error) {
    console.error('Error fetching posts:', error.message);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Like a post
router.post('/api/posts/:postId/like/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  let { id } = req.params;
  let getlikerid = id
  let getname = await User.findOne({ uid: getlikerid })

  if (!userId) {
    return res.status(400).json({ error: 'Missing user ID' });
  }

  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const index = post.likedBy.indexOf(userId);

    if (index === -1) {
      post.likedBy.push(userId);
      post.likeCount += 1;
      if (post.authorId != getname.uid) {
        const notifyUser = new Notification({
          id: post.authorId,
          message: `${getname.displayName} ❤️ liked your post!`,
          category: 'Post',
          time: new Date(),
          status: false
        });

        await notifyUser.save();

      }



    } else {
      post.likedBy.splice(index, 1);
      post.likeCount -= 1;
    }

    await post.save();

    const user = await User.findOne({ uid: post.authorId });


    res.json({
      likeCount: post.likeCount,
      likedBy: post.likedBy,
      authorPhoto: user ? user.photo : 'https://ik.imagekit.io/souravdpal/default-avatar.png',
    });

  } catch (error) {
    console.error('Error liking post:', error.message);
    res.status(500).json({ error: 'Failed to update like' });
  }
});




module.exports = router;