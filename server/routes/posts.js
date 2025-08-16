const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const AIPost = require('../models/AIPost');
const User = require('../models/User');
const Character = require('../models/Character');
const Notification = require('../models/getnot.js');
const Comment = require('../models/Comment');

router.post('/api/posts', async (req, res) => {
    console.log('POST /api/posts request:', { body: req.body });
    if (!req.body) {
        console.error('Request body is undefined');
        return res.status(400).json({ error: 'Request body is missing or invalid' });
    }

    const { content, community, authorId, image, authorName, authorPhoto } = req.body;

    if (!content || !community || !authorId) {
        console.error('Missing required fields:', { content, community, authorId });
        return res.status(400).json({ error: 'Missing required fields: content, community, and authorId are required' });
    }

    try {
        let postAuthorName = 'Unknown';
        let postAuthorPhoto = 'https://ik.imagekit.io/souravdpal/default-avatar.png';
        let normalizedCommunity = community === 'Characters' ? '@Characters' : community;

        if (normalizedCommunity === '@Characters') {
            const character = await Character.findOne({ id: authorId }).lean();
            if (character) {
                postAuthorName = character.name || 'Unknown';
                postAuthorPhoto = character.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                console.log('Character found for @Characters post:', { authorId, postAuthorName, postAuthorPhoto });
            } else {
                console.warn('Character not found for @Characters post:', authorId);
                const user = await User.findOne({ uid: authorId }).lean();
                if (user) {
                    postAuthorName = user.displayName || 'Unknown';
                    postAuthorPhoto = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                    console.log('Fallback to user:', { authorId, postAuthorName, postAuthorPhoto });
                } else {
                    console.warn('No user or character found for @Characters post:', authorId);
                }
            }
        } else {
            let user = await User.findOne({ uid: authorId }).lean();
            if (user) {
                postAuthorName = user.displayName || 'Unknown';
                postAuthorPhoto = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                console.log('User found:', { authorId, postAuthorName, postAuthorPhoto });
            } else {
                const character = await Character.findOne({ id: authorId }).lean();
                if (character) {
                    postAuthorName = character.name || 'Unknown';
                    postAuthorPhoto = character.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                    console.log('Character found for non-@Characters post:', { authorId, postAuthorName, postAuthorPhoto });
                } else {
                    console.warn('Author not found as user or character:', authorId);
                }
            }
        }

        if (authorName) postAuthorName = authorName;
        if (authorPhoto) postAuthorPhoto = authorPhoto;

        console.log('Final post details:', { postAuthorName, postAuthorPhoto, community: normalizedCommunity });

        const PostModel = normalizedCommunity === '@AICharacters' ? AIPost : Post;
        const post = new PostModel({
            authorId,
            authorName: postAuthorName,
            authorPhoto: postAuthorPhoto,
            community: normalizedCommunity,
            content,
            image,
            viewCount: 0,
            likeCount: 0,
            commentCount: 0,
            likedBy: [],
            trend: 10,
            value: 0,
            createdAt: new Date()
        });

        await post.save();
        console.log('Post created successfully:', post._id);
        res.status(201).json(post.toObject());
    } catch (error) {
        console.error('Error creating post:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to create post', details: error.message });
    }
});

router.post('/api/posts/:postId/like/:userId', async (req, res) => {
    console.log('POST /api/posts/:postId/like/:userId request:', { params: req.params });
    const { postId, userId } = req.params;

    if (!postId || !userId) {
        console.error('Missing required fields:', { postId, userId });
        return res.status(400).json({ error: 'Missing required fields: postId and userId are required' });
    }

    try {
        let post = await Post.findById(postId);
        let isAICharacter = false;

        if (!post) {
            post = await AIPost.findById(postId);
            isAICharacter = true;
            if (!post) {
                console.error('Post not found:', postId);
                return res.status(404).json({ error: 'Post not found' });
            }
        }

        post.likeCount = post.likeCount || 0;
        post.likedBy = post.likedBy || [];

        const isLiked = post.likedBy.includes(userId);
        if (isLiked) {
            post.likedBy = post.likedBy.filter(id => id !== userId);
            post.likeCount = Math.max(0, post.likeCount - 1);
            console.log(`${isAICharacter ? 'AI post' : 'Post'} ${postId} unliked by user ${userId}, new likeCount: ${post.likeCount}`);
        } else {
            post.likedBy.push(userId);
            post.likeCount += 1;
            console.log(`${isAICharacter ? 'AI post' : 'Post'} ${postId} liked by user ${userId}, new likeCount: ${post.likeCount}`);

            if (post.authorId !== userId) {
                const notification = new Notification({
                    userId: post.authorId,
                    type: 'like',
                    postId: post._id,
                    fromUserId: userId,
                    createdAt: new Date()
                });
                await notification.save();
                console.log('Notification created for like:', notification._id);
            }
        }

        await post.save();
        res.status(200).json({
            likeCount: post.likeCount,
            likedBy: post.likedBy,
            postId: post._id,
            isAICharacter,
            action: isLiked ? 'unliked' : 'liked'
        });
    } catch (error) {
        console.error('Error handling like/unlike:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to handle like/unlike', details: error.message });
    }
});

router.get('/api/posts', async (req, res) => {
    console.log('GET /api/posts query:', req.query);
    const { limit = 10, page = 1, community = 'all', authorId } = req.query;

    try {
        const limitNum = parseInt(limit, 10) || 10;
        const pageNum = parseInt(page, 10) || 1;
        const skip = (pageNum - 1) * limitNum;
        const query = {};
        if (community !== 'all') query.community = community === 'Characters' ? '@Characters' : community;
        if (authorId) query.authorId = authorId;

        const [posts, aiPosts] = await Promise.all([
            Post.find(query)
                .sort({ value: -1, trend: -1, createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            community === 'all' || community === '@AICharacters' || community === 'Characters'
                ? AIPost.find({ ...query, community: '@AICharacters' })
                    .sort({ value: -1, trend: -1, createdAt: -1 })
                    .skip(skip)
                    .limit(limitNum)
                    .lean()
                : []
        ]);

        let allPosts = [...posts, ...aiPosts]
            .filter((post, index, self) => self.findIndex(p => p._id.toString() === post._id.toString()) === index)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limitNum);

        const enhancedPosts = await Promise.all(allPosts.map(async (post) => {
            let authorPhoto = post.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
            let authorName = post.authorName || 'Unknown';
            let normalizedCommunity = post.community === 'Characters' ? '@Characters' : post.community;

            if (normalizedCommunity === '@Characters' || normalizedCommunity === '@AICharacters') {
                const character = await Character.findOne({ id: post.authorId }).lean();
                if (character) {
                    authorPhoto = character.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                    authorName = character.name || authorName;
                    console.log(`Character post ${post._id}: authorPhoto=${authorPhoto}, authorName=${authorName}`);
                } else {
                    console.warn(`Character not found for post ${post._id}, authorId=${post.authorId}`);
                    const user = await User.findOne({ uid: post.authorId }).lean();
                    if (user) {
                        authorPhoto = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                        authorName = user.displayName || authorName;
                        console.log(`Fallback to user for post ${post._id}: authorPhoto=${authorPhoto}, authorName=${authorName}`);
                    }
                }
            } else {
                const user = await User.findOne({ uid: post.authorId }).lean();
                if (user) {
                    authorPhoto = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                    authorName = user.displayName || authorName;
                    console.log(`User post ${post._id}: authorPhoto=${authorPhoto}, authorName=${authorName}`);
                }
            }

            return {
                ...post,
                authorPhoto,
                authorName,
                community: normalizedCommunity,
                viewCount: post.viewCount || 0,
                likeCount: post.likeCount || 0,
                commentCount: post.commentCount || 0,
                likedBy: post.likedBy || [],
                trend: post.trend || 0,
                value: post.value || 0,
                comments: []
            };
        }));

        res.json(enhancedPosts);
    } catch (error) {
        console.error('Error fetching posts:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to fetch posts', details: error.message });
    }
});

router.post('/api/posts/priority', async (req, res) => {
    console.log('POST /api/posts/priority request:', { body: req.body, query: req.query });
    const { userId, viewedPostIds = [] } = req.body;
    const { limit = 10, page = 1, community = 'all' } = req.query;

    if (!userId || !Array.isArray(viewedPostIds)) {
        console.error('Invalid request:', { userId, viewedPostIds });
        return res.status(400).json({ error: 'Missing or invalid userId or viewedPostIds' });
    }

    try {
        if (viewedPostIds.length > 0) {
            await Promise.all([
                Post.updateMany(
                    { _id: { $in: viewedPostIds } },
                    { $inc: { viewCount: 1 } }
                ),
                AIPost.updateMany(
                    { _id: { $in: viewedPostIds } },
                    { $inc: { viewCount: 1 } }
                )
            ]);
        }

        const limitNum = parseInt(limit, 10) || 10;
        const pageNum = parseInt(page, 10) || 1;
        const skip = (pageNum - 1) * limitNum;
        const query = community === 'all' ? {} : { community: community === 'Characters' ? '@Characters' : community };

        const totalPosts = await Post.countDocuments(query);
        const totalAIPosts = community === 'all' || community === '@AICharacters' || community === 'Characters'
            ? await AIPost.countDocuments({ ...query, community: '@AICharacters' })
            : 0;
        const totalAvailable = totalPosts + totalAIPosts;

        if (skip >= totalAvailable) {
            console.log(`No more posts available: skip=${skip}, total=${totalAvailable}`);
            return res.json([]);
        }

        let allPosts = [];
        if (community === 'all') {
            const allIds = await Promise.all([
                Post.find(query).sort({ value: -1, trend: -1, createdAt: -1 }).skip(skip).limit(limitNum).select('_id').lean(),
                AIPost.find({ ...query, community: '@AICharacters' }).sort({ value: -1, trend: -1, createdAt: -1 }).skip(skip).limit(limitNum).select('_id').lean()
            ]);
            const ids = [...allIds[0], ...allIds[1]].map(p => p._id).slice(0, limitNum);
            allPosts = await Promise.all([
                Post.find({ _id: { $in: ids } }).sort({ value: -1, trend: -1, createdAt: -1 }).lean(),
                AIPost.find({ _id: { $in: ids } }).sort({ value: -1, trend: -1, createdAt: -1 }).lean()
            ]);
            allPosts = [...allPosts[0], ...allPosts[1]]
                .filter((post, index, self) => self.findIndex(p => p._id.toString() === post._id.toString()) === index)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, limitNum);
        } else {
            const [posts, aiPosts] = await Promise.all([
                Post.find(query).sort({ value: -1, trend: -1, createdAt: -1 }).skip(skip).limit(limitNum).lean(),
                community === '@AICharacters' || community === '@Characters'
                    ? AIPost.find({ ...query, community: '@AICharacters' }).sort({ value: -1, trend: -1, createdAt: -1 }).skip(skip).limit(limitNum).lean()
                    : []
            ]);
            allPosts = [...posts, ...aiPosts]
                .filter((post, index, self) => self.findIndex(p => p._id.toString() === post._id.toString()) === index)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, limitNum);
        }

        const enhancedPosts = await Promise.all(allPosts.map(async (post) => {
            let authorPhoto = post.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
            let authorName = post.authorName || 'Unknown';
            let normalizedCommunity = post.community === 'Characters' ? '@Characters' : post.community;

            if (normalizedCommunity === '@Characters' || normalizedCommunity === '@AICharacters') {
                const character = await Character.findOne({ id: post.authorId }).lean();
                if (character) {
                    authorPhoto = character.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                    authorName = character.name || authorName;
                    console.log(`Character post ${post._id}: authorPhoto=${authorPhoto}, authorName=${authorName}`);
                } else {
                    console.warn(`Character not found for post ${post._id}, authorId=${post.authorId}`);
                    const user = await User.findOne({ uid: post.authorId }).lean();
                    if (user) {
                        authorPhoto = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                        authorName = user.displayName || authorName;
                        console.log(`Fallback to user for post ${post._id}: authorPhoto=${authorPhoto}, authorName=${authorName}`);
                    }
                }
            } else {
                const user = await User.findOne({ uid: post.authorId }).lean();
                if (user) {
                    authorPhoto = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                    authorName = user.displayName || authorName;
                    console.log(`User post ${post._id}: authorPhoto=${authorPhoto}, authorName=${authorName}`);
                }
            }

            return {
                ...post,
                authorPhoto,
                authorName,
                community: normalizedCommunity,
                viewCount: post.viewCount || 0,
                likeCount: post.likeCount || 0,
                commentCount: post.commentCount || 0,
                likedBy: post.likedBy || [],
                trend: post.trend || 0,
                value: post.value || 0,
                comments: []
            };
        }));

        console.log(`Returning ${enhancedPosts.length} posts for page ${pageNum}`);
        res.json(enhancedPosts);
    } catch (error) {
        console.error('Error fetching priority posts:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to fetch posts', details: error.message });
    }
});

router.get('/api/posts/search', async (req, res) => {
    console.log('GET /api/posts/search query:', req.query);
    const { query = '', limit = 10, page = 1, community = 'all', authorId } = req.query;

    try {
        const limitNum = parseInt(limit, 10) || 10;
        const pageNum = parseInt(page, 10) || 1;
        const skip = (pageNum - 1) * limitNum;
        const postQuery = {};
        if (community !== 'all') postQuery.community = community === 'Characters' ? '@Characters' : community;
        if (authorId) postQuery.authorId = authorId;
        if (query.trim()) {
            const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            postQuery.$or = [
                { content: regex },
                { authorName: regex },
                { community: regex }
            ];
        }

        const [posts, aiPosts] = await Promise.all([
            Post.find(postQuery).sort({ value: -1, trend: -1, createdAt: -1 }).skip(skip).limit(limitNum).lean(),
            community === 'all' || community === '@AICharacters' || community === 'Characters'
                ? AIPost.find({ ...postQuery, community: '@AICharacters' }).sort({ value: -1, trend: -1, createdAt: -1 }).skip(skip).limit(limitNum).lean()
                : []
        ]);

        let allPosts = [...posts, ...aiPosts]
            .filter((post, index, self) => self.findIndex(p => p._id.toString() === post._id.toString()) === index)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limitNum);

        const enhancedPosts = await Promise.all(allPosts.map(async (post) => {
            let authorPhoto = post.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
            let authorName = post.authorName || 'Unknown';
            let normalizedCommunity = post.community === 'Characters' ? '@Characters' : post.community;

            if (normalizedCommunity === '@Characters' || normalizedCommunity === '@AICharacters') {
                const character = await Character.findOne({ id: post.authorId }).lean();
                if (character) {
                    authorPhoto = character.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                    authorName = character.name || authorName;
                    console.log(`Character post ${post._id}: authorPhoto=${authorPhoto}, authorName=${authorName}`);
                } else {
                    console.warn(`Character not found for post ${post._id}, authorId=${post.authorId}`);
                    const user = await User.findOne({ uid: post.authorId }).lean();
                    if (user) {
                        authorPhoto = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                        authorName = user.displayName || authorName;
                        console.log(`Fallback to user for post ${post._id}: authorPhoto=${authorPhoto}, authorName=${authorName}`);
                    }
                }
            } else {
                const user = await User.findOne({ uid: post.authorId }).lean();
                if (user) {
                    authorPhoto = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                    authorName = user.displayName || authorName;
                    console.log(`User post ${post._id}: authorPhoto=${authorPhoto}, authorName=${authorName}`);
                }
            }

            return {
                ...post,
                authorPhoto,
                authorName,
                community: normalizedCommunity,
                viewCount: post.viewCount || 0,
                likeCount: post.likeCount || 0,
                commentCount: post.commentCount || 0,
                likedBy: post.likedBy || [],
                trend: post.trend || 0,
                value: post.value || 0,
                comments: []
            };
        }));

        res.json(enhancedPosts);
    } catch (error) {
        console.error('Error searching posts:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to search posts', details: error.message });
    }
});

router.get('/api/posts/:postId', async (req, res) => {
    try {
        let post = await Post.findById(req.params.postId).lean();
        let isAICharacter = false;
        if (!post) {
            post = await AIPost.findById(req.params.postId).lean();
            isAICharacter = true;
            if (!post) return res.status(404).json({ error: 'Post not found' });
        }

        let authorPhoto = post.authorPhoto || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
        let authorName = post.authorName || 'Unknown';
        let normalizedCommunity = post.community === 'Characters' ? '@Characters' : post.community;

        if (normalizedCommunity === '@Characters' || normalizedCommunity === '@AICharacters') {
            const character = await Character.findOne({ id: post.authorId }).lean();
            if (character) {
                authorPhoto = character.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                authorName = character.name || authorName;
            } else {
                const user = await User.findOne({ uid: post.authorId }).lean();
                if (user) {
                    authorPhoto = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                    authorName = user.displayName || authorName;
                }
            }
        } else {
            const user = await User.findOne({ uid: post.authorId }).lean();
            if (user) {
                authorPhoto = user.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png';
                authorName = user.displayName || authorName;
            }
        }

        res.json({
            _id: post._id,
            authorName,
            authorPhoto,
            authorId: post.authorId,
            community: normalizedCommunity,
            content: post.content,
            image: post.image || null,
            likeCount: post.likeCount || 0,
            likedBy: post.likedBy || [],
            commentCount: post.commentCount || 0,
            createdAt: post.createdAt,
            viewCount: post.viewCount || 0,
            comments: []
        });
    } catch (error) {
        console.error('Error fetching post:', error.message);
        res.status(500).json({ error: 'Failed to fetch post', details: error.message });
    }
});

module.exports = router;