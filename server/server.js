const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');
const characterRoutes = require('./routes/characters');
const creatorRoutes = require('./routes/creator');
const apiKeyRoutes = require('./routes/apiKey');
const chatRoutes = require('./routes/chat');
const imageRoutes = require('./routes/imageRoute');
const routeai = require('./routes/routeai');
const notifyUser = require('./routes/notify');
const his = require('./routes/chat');
const followRoutes = require('./routes/creator');
const ApiKey = require('./models/ApiKey');
const User = require('./models/User');
const verifyFirebaseToken = require('./routes/verifyFirebaseToken');
const Character = require('./models/Character');
const app = express();
const postmakerJS = require('./routes/Aipost')
// Verify environment variables
/*if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY) {
  console.error('Fatal: Missing ImageKit credentials. Check .env file.');
  process.exit(1);
}*/
// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files before protected routes
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.ico')) {
      res.setHeader('Content-Type', 'image/x-icon');
    }
  },
}));

app.use((req, res, next) => {
  if (req.path.startsWith('/py/ai')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
  }
  next();
});

// Connect to MongoDB
connectDB();

// Serve favicon.ico explicitly
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'favicon.ico'), (err) => {
    if (err) {
      console.error('Error serving favicon.ico:', err);
      res.status(404).send('Favicon not found');
    }
  });
});

// Public routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'root.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.get('/view/u/:id', (req, res) => {
  const { id } = req.params;
  res.render('home', { data: null });
});

app.get('/home', (req, res) => {
  res.render('home', { data: null });
});

app.get('/post/u/:id', (req, res) => {
  const { id } = req.params;
  res.render('post', { data: null });
});

app.get('/make/u/:id', (req, res) => {
  const { id } = req.params;
  res.render('make', { data: null });
});

app.get('/dis/u/:id', (req, res) => {
  const { id } = req.params;
  res.render('dis', { data: null });
});

app.get('/chat/c/:CharId', (req, res) => {
  const { CharId } = req.params;
  res.render('chat', { data: null });
});
app.get('/creator/works', async (req, res) => {
  const { creatorId, uid } = req.query;

  if (!creatorId || !uid) {
    console.error('Missing creatorId or uid in query', { creatorId, uid });
    return res.status(400).render('error', { data: { error: 'Missing creator or user ID' } });
  }

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const creator = await User.findOne({ uid: creatorId }).lean();
      if (!creator) {
        console.error('Creator not found:', creatorId);
        return res.status(404).render('error', { data: { error: 'Creator not found' } });
      }

      const user = await User.findOne({ uid });
      let isFollowing = false;

      if (user && Array.isArray(user.following)) {
        isFollowing = user.following.some(id => id.toString() === creator._id.toString());
      }

      const isOwnProfile = creatorId === uid;

      console.log(`Creator works: user ${uid} ${isFollowing ? 'follows' : 'does not follow'} creator ${creatorId}, creator _id: ${creator._id}, user following: ${user ? user.following : 'N/A'}, attempt: ${attempt + 1}`);

      const characters = await Character.find({ creatorId })
        .sort({ createdAt: -1 })
        .lean()
        .then(chars => chars.map(char => ({
          id: char.id.toString(),
          name: char.name || 'Unnamed Character',
          tags: typeof char.tags === 'string'
            ? char.tags.split(' ').filter(tag => tag.startsWith('@') && tag.length > 1).map(tag => tag.substring(1)).slice(0, 5)
            : Array.isArray(char.tags)
              ? char.tags.slice(0, 5)
              : [],
          relationships: char.relationships || 'No description available.',
          creator: char.creator || creator.displayName || 'Unknown Creator',
          creatorId: char.creatorId,
          viewCount: char.viewCount || 0,
          likeCount: char.likeCount || 0,
          liked: user ? char.likedBy.includes(uid) : false,
          link: char.link || 'https://ik.imagekit.io/souravdpal/default-avatar.png'
        })));

      console.log('Creator data fetched:', {
        creatorId,
        characterCount: characters.length,
        isFollowing,
        isOwnProfile
      });

      return res.render('creator', {
        userId: uid,
        data: {
          creator: {
            id: creator.uid,
            name: creator.displayName || 'Unknown Creator',
            photo: creator.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
            bio: creator.bio || 'No bio available.',
            followers: creator.followers || 0,
            isFollowing: isFollowing,
            isOwnProfile: isOwnProfile
          },
          characters: characters
        }
      });
    } catch (error) {
      attempt++;
      console.error(`Error in /creator/works, attempt ${attempt}:`, {
        message: error.message,
        stack: error.stack,
        creatorId,
        uid
      });
      if (attempt === maxRetries) {
        return res.status(500).render('error', {
          data: {
            error: 'Failed to load creator profile',
            details: error.message
          }
        });
      }
    }
  }
});

app.get('/notify/u/:id', (req, res) => {
  const { id } = req.params;
  res.render('not', { data: null });
});

app.get('/plans', async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      console.log('❌ Missing ID in query');
      return res.status(400).json({ error: 'Missing user ID' });
    }

    console.log('🔎 User ID from query:', id);

    
    const existingKey = await ApiKey.findOne({ userId: id });
   
    

    res.render('plans', { val: !!existingKey });
  } catch (error) {
    console.error('❌ Error in /plans route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/post/share', async (req, res) => {
  const { uid, post: postId } = req.query;

  console.log('Received uid:', uid, 'postId:', postId);

  if (!uid || !postId) {
    console.log('❌ Missing parameters');
    return res.status(400).render('error', { data: { error: 'Missing user ID or post ID' } });
  }

  try {
    const post = await Post.findById(postId).lean();
    console.log('Fetched post:', post);

    if (!post) {
      console.log('❌ Post not found in DB');
      return res.status(404).render('error', { data: { error: 'Post not found' } });
    }

    const author = await User.findOne({ uid: post.authorId }).lean();
    console.log('Fetched author:', author);

    if (!author) {
      console.log('❌ Author not found in DB');
      return res.status(404).render('error', { data: { error: 'Author not found' } });
    }

    res.render('home', {
      postShare: true,
      sender: uid,
      postid: post._id,
      authorid: post.authorId,
      authorname: post.authorName,
      authorphoto: author.photo || 'https://ik.imagekit.io/souravdpal/default-avatar.png',
      community: post.community,
      content: post.content,
      imagePostLink: post.image || null,
      likes: post.likeCount,
      commentcount: post.commentCount,
      time: post.createdAt,
    });
  } catch (error) {
    console.error('🔥 Error in /post/share:', error);
    res.status(500).render('error', { data: { error: 'Failed to load shared post' } });
  }
});

// Protected routes with verifyFirebaseToken middleware
app.use('/', authRoutes);
app.use('/' ,postmakerJS)
app.use('/notify', verifyFirebaseToken,notifyUser);
app.use('/', verifyFirebaseToken, imageRoutes);
app.use('/', verifyFirebaseToken, postRoutes);
app.use('/', verifyFirebaseToken, characterRoutes);
app.use('/', verifyFirebaseToken, creatorRoutes);
app.use('/', verifyFirebaseToken, apiKeyRoutes);
app.use('/', verifyFirebaseToken, chatRoutes);
app.use('/py', verifyFirebaseToken, routeai);
app.use('/', verifyFirebaseToken, his);
app.use('/', verifyFirebaseToken, followRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  if (req.path.startsWith('/api') || req.path.startsWith('/cred') || req.path.startsWith('/notify') || req.path.startsWith('/char') || req.path.startsWith('/com')) {
    res.status(500).json({ error: 'Internal server error', details: err.message });
  } else {
    res.status(500).render('error', { data: { error: 'Internal server error', details: err.message } });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});