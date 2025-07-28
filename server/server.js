const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs").promises;
require("dotenv").config();
const charmake = require("./routes/charmake");
const lis = require("./routes/lis");
const idmake = require("./routes/id");
const pythonRoute = require("./routes/routeai");
const charmakerRoutes = require("./routes/imageRoute");
const creatorRoute = require("./routes/creatorroute");
const sqlite3 = require("sqlite3").verbose();
const bioU = require("./routes/bio");
const app = express();
const port = process.env.PORT || 3000;

// JSON File Paths
const DATA_DIR = path.join(__dirname, "data");
const DB_DIR = path.join(__dirname, "database");
const USER_DB_DIR = path.join(__dirname, "db", "user");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const COMMENTS_FILE = path.join(DATA_DIR, "comments.json");
const LIKES_FILE = path.join(DATA_DIR, "char_likes.json");
const VIEWS_FILE = path.join(DATA_DIR, "char_views.json");
const FOLLOWS_FILE = path.join(DATA_DIR, "follows.json");
const LIST_FILE = path.join(DB_DIR, "list.json");
const CHAR_PERSONA_DIR = path.join(DB_DIR, "charpersona");
const POST_UPLOAD_DIR = path.join(__dirname, "image", "postimage");

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Serve static files for post images
app.use('/api/postimage/uploads', express.static(path.join(__dirname, 'image', 'postimage'), {
  setHeaders: (res, filePath) => {
    console.log(`Serving post image: ${filePath}`);
    res.setHeader('Content-Type', `image/${path.extname(filePath).slice(1)}`);
  },
  fallthrough: (req, res, next) => {
    console.warn(`Post image not found: ${req.path}`);
    res.status(404).send('Image not found');
  }
}));

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const { method, url, headers, body } = req;
  console.log(`[${new Date().toISOString()}] Incoming Request:`);
  console.log(`  Method: ${method}`);
  console.log(`  URL: ${url}`);
  console.log(`  Headers:`, {
    'x-user-id': headers['x-user-id'] || 'None',
    'user-agent': headers['user-agent'] || 'None',
    'content-type': headers['content-type'] || 'None',
  });
  console.log(`  Body:`, body);
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Response:`);
    console.log(`  Method: ${method}`);
    console.log(`  URL: ${url}`);
    console.log(`  Status: ${res.statusCode}`);
    console.log(`  Duration: ${duration}ms`);
  });
  next();
});

// Serve static files
app.use('/images', express.static(path.join(__dirname, "..", "public", "images")));
app.use(express.static(path.join(__dirname, "..", "public"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".js")) {
      res.setHeader("Content-Type", "application/javascript");
    } else if (filePath.endsWith(".css")) {
      res.setHeader("Content-Type", "text/css");
    } else if (filePath.endsWith(".png")) {
      res.setHeader("Content-Type", "image/png");
    }
  },
}));

// Initialize JSON Files and Directories
const initializeFiles = async () => {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(DB_DIR, { recursive: true });
    await fs.mkdir(CHAR_PERSONA_DIR, { recursive: true });
    await fs.mkdir(USER_DB_DIR, { recursive: true });
    await fs.mkdir(path.join(__dirname, "..", "public", "images"), { recursive: true });
    await fs.mkdir(POST_UPLOAD_DIR, { recursive: true });

    const files = [USERS_FILE, POSTS_FILE, COMMENTS_FILE, LIKES_FILE, VIEWS_FILE, FOLLOWS_FILE, LIST_FILE];
    for (const file of files) {
      try {
        const exists = await fs.access(file).then(() => true).catch(() => false);
        if (!exists) {
          console.log(`Creating ${file}`);
          await fs.writeFile(file, JSON.stringify([], null, 2));
        } else {
          const content = await fs.readFile(file, "utf8");
          if (!content || content.trim() === "") {
            console.log(`Initializing empty ${file}`);
            await fs.writeFile(file, JSON.stringify([], null, 2));
          } else {
            JSON.parse(content); // Validate JSON
          }
        }
      } catch (err) {
        console.error(`Error initializing ${file}:`, err.message);
        await fs.writeFile(file, JSON.stringify([], null, 2));
      }
    }

    const list = await readJSON(LIST_FILE);
    const updatedList = list.map(char => ({
      ...char,
      viewCount: char.viewCount || 0,
      link: char.link && !char.link.startsWith('/api/charimage/uploads/') && char.link.startsWith('/charimage/uploads/') ? `/api${char.link}` : char.link
    }));
    await writeJSON(LIST_FILE, updatedList);

    // Ensure default-avatar.png exists
    const avatarPath = path.join(__dirname, "..", "public", "images", "default-avatar.png");
    const exists = await fs.access(avatarPath).then(() => true).catch(() => false);
    if (!exists) {
      console.log(`Creating placeholder default-avatar.png`);
      const placeholderImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAG1BMVEX////MzMz/////zMz/MzMz////zMz/MzMz////4+1IAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAFUlEQVQ4y2NgYGBgYGBgYGBgYGBgYAAAQAAJ0g0EuwAAAABJRU5ErkJggg==', 'base64');
      await fs.writeFile(avatarPath, placeholderImage);
    }
  } catch (err) {
    console.error("Error initializing files:", err.message);
  }
};
initializeFiles();

// Helper Functions for JSON Operations
const readJSON = async (filePath) => {
  try {
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    if (!exists) {
      console.log(`File ${filePath} not found, initializing with empty array`);
      await fs.writeFile(filePath, JSON.stringify([], null, 2));
      return [];
    }
    const data = await fs.readFile(filePath, "utf8");
    if (!data || data.trim() === "") {
      console.log(`File ${filePath} is empty, initializing with empty array`);
      await fs.writeFile(filePath, JSON.stringify([], null, 2));
      return [];
    }
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading JSON from ${filePath}:`, err.message);
    await fs.writeFile(filePath, JSON.stringify([], null, 2));
    return [];
  }
};

const writeJSON = async (filePath, data) => {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing JSON to ${filePath}:`, err.message);
    throw err;
  }
};

// Fetch user data
const getUserData = async (uid) => {
  try {
    const users = await readJSON(USERS_FILE);
    const user = users.find((user) => user.uid === uid);
    return user || {
      photo: '/images/default-avatar.png',
      name: 'Guest',
      bio: 'Not set',
      status: 'Offline',
      uid: uid,
      followers: 0,
    };
  } catch (error) {
    console.error("Error fetching user data:", error.message);
    return {
      photo: '/images/default-avatar.png',
      name: 'Guest',
      bio: 'Not set',
      status: 'Offline',
      uid: uid,
      followers: 0,
    };
  }
};

// Fetch posts
const getPosts = async () => {
  try {
    const posts = await readJSON(POSTS_FILE);
    const users = await readJSON(USERS_FILE);
    return await Promise.all(
      posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10)
        .map(async (post) => {
          const user = users.find((user) => user.uid === post.authorId) || {
            photo: '/images/default-avatar.png',
            name: 'Guest'
          };
          let imageExists = false;
          let validatedImage = post.image;
          if (post.image && post.image.startsWith('/api/postimage/uploads/')) {
            const fullPath = path.join(POST_UPLOAD_DIR, path.basename(post.image));
            try {
              await fs.access(fullPath);
              imageExists = true;
              console.log(`Image exists for post ${post._id}: ${fullPath}`);
            } catch (err) {
              console.warn(`Image not found for post ${post._id}: ${fullPath}`);
              validatedImage = null;
            }
          } else if (post.image) {
            console.warn(`Invalid image path for post ${post._id}: ${post.image}`);
            validatedImage = null;
          }
          return {
            ...post,
            authorPhoto: user.photo,
            image: imageExists ? post.image : null
          };
        })
    );
  } catch (error) {
    console.error("Error fetching posts:", error.message);
    return [];
  }
};

// Count unique users who interacted with a character
const getChatInteractionCount = async (charId) => {
  try {
    const files = await fs.readdir(USER_DB_DIR);
    const dbFiles = files.filter(f => f.startsWith(`his-`) && f.endsWith(`-${charId}.db`));
    return dbFiles.length || 0;
  } catch (error) {
    console.error(`Error counting chat interactions for ${charId}:`, error.message);
    return 0;
  }
};

// Endpoint to handle user follows
app.post("/api/user/:id/follow", async (req, res) => {
  const creatorId = req.params.id;
  const userId = req.headers['x-user-id'] || req.query.uid || 'anonymous';
  try {
    const users = await readJSON(USERS_FILE);
    const creator = users.find((u) => u.uid === creatorId);
    if (!creator) {
      return res.status(404).json({ error: "Creator not found" });
    }
    const follows = await readJSON(FOLLOWS_FILE);
    let followRecord = follows.find((f) => f.targetUid === creatorId);
    if (!followRecord) {
      followRecord = { targetUid: creatorId, followerCount: 0, followers: [] };
      follows.push(followRecord);
    }
    const followed = followRecord.followers.includes(userId);
    if (followed) {
      followRecord.followers = followRecord.followers.filter(id => id !== userId);
      followRecord.followerCount = Math.max(0, followRecord.followerCount - 1);
    } else {
      followRecord.followers.push(userId);
      followRecord.followerCount++;
    }
    await writeJSON(FOLLOWS_FILE, follows);
    res.json({
      followed: !followed,
      followerCount: followRecord.followerCount
    });
  } catch (error) {
    console.error(`Error toggling follow for ${creatorId}:`, error.message);
    res.status(500).json({ error: "Failed to toggle follow", details: error.message });
  }
});

// Endpoint to fetch chat history
app.get('/history', async (req, res) => {
  const { user_id, char_id } = req.query;
  if (!user_id || !char_id) {
    return res.status(400).json({ error: 'Missing user_id or char_id' });
  }
  const dbPath = path.join(USER_DB_DIR, `his-${user_id}-${char_id}.db`);
  try {
    await fs.mkdir(USER_DB_DIR, { recursive: true });
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
    try {
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender TEXT,
          message TEXT,
          timestamp TEXT
        )`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      const history = await new Promise((resolve, reject) => {
        db.all('SELECT sender, message, timestamp FROM history ORDER BY timestamp ASC LIMIT 50', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => ({
            sender: row.sender,
            message: row.message,
            timestamp: row.timestamp
          })));
        });
      });
      res.json(history);
    } finally {
      db.close((err) => {
        if (err) console.error('Error closing database:', err.message);
      });
    }
  } catch (error) {
    console.error(`Error fetching history for ${dbPath}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

// Endpoint to handle character likes
app.post("/api/char/:id/like", async (req, res) => {
  const charId = req.params.id;
  const userId = req.headers['x-user-id'] || req.query.uid || 'anonymous';
  try {
    const likes = await readJSON(LIKES_FILE);
    let charLike = likes.find((like) => like.charId === charId);
    if (!charLike) {
      charLike = { charId, likeCount: 0, likedBy: [] };
      likes.push(charLike);
    }
    if (charLike.likedBy.includes(userId)) {
      charLike.likedBy = charLike.likedBy.filter(id => id !== userId);
      charLike.likeCount = Math.max(0, charLike.likeCount - 1);
    } else {
      charLike.likedBy.push(userId);
      charLike.likeCount++;
    }
    await writeJSON(LIKES_FILE, likes);
    res.json({ likeCount: charLike.likeCount, liked: charLike.likedBy.includes(userId) });
  } catch (error) {
    console.error("Error liking character:", error.message);
    res.status(500).json({ error: "Failed to like character" });
  }
});

// Endpoint to get character like status
app.get("/api/char/:id/like", async (req, res) => {
  const charId = req.params.id;
  const userId = req.headers['x-user-id'] || req.query.uid || 'anonymous';
  try {
    const likes = await readJSON(LIKES_FILE);
    const charLike = likes.find((like) => like.charId === charId);
    if (!charLike) {
      return res.json({ likeCount: 0, liked: false });
    }
    res.json({
      likeCount: charLike.likeCount,
      liked: charLike.likedBy.includes(userId)
    });
  } catch (error) {
    console.error("Error fetching character like status:", error.message);
    res.status(500).json({ error: "Failed to fetch like status" });
  }
});

// Chat page
app.get("/chat/c/:id", async (req, res) => {
  const charId = req.params.id;
  const userId = req.headers['x-user-id'] || req.query.uid || 'anonymous';
  try {
    const list = await readJSON(LIST_FILE);
    const char = list.find(c => c.id === charId);
    if (!char) {
      return res.status(404).render("error", { message: `Character ${charId} not found` });
    }
    const views = await readJSON(VIEWS_FILE);
    if (!views.some(view => view.charId === charId && view.userId === userId)) {
      views.push({ charId, userId });
      char.viewCount = (char.viewCount || 0) + 1;
      await Promise.all([
        writeJSON(VIEWS_FILE, views),
        writeJSON(LIST_FILE, list)
      ]);
    }
    const chatCount = await getChatInteractionCount(charId);
    res.render("chat", { id: charId, userId, viewCount: char.viewCount, chatCount });
  } catch (error) {
    console.error(`Error processing chat page for ${charId}:`, error.message);
    res.status(500).json({ error: "Failed to load chat page", details: error.message });
  }
});

// Creator works page
app.get("/creator/works", async (req, res) => {
  const { creatorId } = req.query;
  if (!creatorId) {
    return res.status(400).json({ error: "No creator ID provided" });
  }
  const userId = req.headers['x-user-id'] || req.query.uid || 'anonymous';
  try {
    const users = await readJSON(USERS_FILE);
    const creator = users.find((u) => u.uid === creatorId);
    if (!creator) {
      return res.status(404).json({ error: "Creator not found" });
    }
    const list = await readJSON(LIST_FILE);
    const likes = await readJSON(LIKES_FILE);
    const views = await readJSON(VIEWS_FILE);
    const characters = await Promise.all(
      list.filter((char) => char.creatorId === creatorId).map(async (char) => {
        const charLike = likes.find(like => like.charId === char.id) || { likeCount: 0, likedBy: [] };
        const viewCount = views.filter(view => view.charId === char.id).length || 0;
        const chatCount = await getChatInteractionCount(char.id);
        let background = char.relationships || "No background available";
        try {
          const charData = await readJSON(path.join(CHAR_PERSONA_DIR, `${char.id}.json`));
          background = charData.background || background;
        } catch (err) {
          console.warn(`Failed to read persona for ${char.id}:`, err.message);
        }
        return {
          ...char,
          background,
          likeCount: charLike.likeCount || 0,
          liked: charLike.likedBy.includes(userId),
          viewCount: char.viewCount || viewCount,
          chatCount: chatCount || 0
        };
      })
    );
    const follows = await readJSON(FOLLOWS_FILE);
    const followRecord = follows.find((f) => f.targetUid === creator.uid) || { followerCount: 0, followers: [] };
    res.render("creator", {
      creator: {
        uid: creator.uid || '',
        name: creator.name || 'Unknown',
        photo: creator.photo || '/images/default-avatar.png',
        bio: creator.bio || "Not set",
        followers: followRecord.followerCount || 0
      },
      characters,
      userId,
      isFollowing: followRecord.followers.includes(userId)
    });
  } catch (error) {
    console.error("Error fetching creator works:", error.message);
    res.status(500).json({ error: "Failed to fetch creator works", details: error.message });
  }
});

// Fetch comments
const getComments = async () => {
  try {
    const comments = await readJSON(COMMENTS_FILE);
    return comments.reduce((acc, comment) => {
      acc[comment.postId] = acc[comment.postId] || [];
      acc[comment.postId].push(comment);
      return acc;
    }, {});
  } catch (error) {
    console.error("Error fetching comments:", error.message);
    return {};
  }
};

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "root.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

app.post("/data", async (req, res) => {
  const { uid, display_name, email, photo } = req.body;
  if (!uid || !display_name || !email) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const users = await readJSON(USERS_FILE);
    if (users.find((user) => user.uid === uid)) {
      return res.status(400).json({ error: "User already exists" });
    }
    const newUser = {
      uid,
      name: display_name,
      photo: photo && !photo.startsWith('/api/userimage/uploads/') && photo.startsWith('/userimage/uploads/') ? `/api${photo}` : (photo || `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(display_name)}&backgroundColor=1e1e3a`),
      status: "",
      bio: "",
      followers: 0,
    };
    users.push(newUser);
    await writeJSON(USERS_FILE, users);
    res.status(201).json({ message: "User saved", user: newUser });
  } catch (error) {
    console.error("Error saving user:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/cred", async (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: "UID required" });
  try {
    const users = await readJSON(USERS_FILE);
    const user = users.find((user) => user.uid === uid);
    if (!user) return res.status(404).json({ msg: "none" });
    res.json({
      photo: user.photo,
      name: user.name,
      bio: user.bio || "Not set",
      status: user.status || "Offline",
      followers: user.followers || 0,
    });
  } catch (error) {
    console.error("Error fetching credentials:", error.message);
    res.status(500).json({ error: "Error fetching credentials" });
  }
});

app.get("/api/posts", async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const community = req.query.community || "all";
  try {
    let posts = await getPosts();
    if (community !== "all") {
      posts = posts.filter((post) => post.community === community);
    }
    posts = posts.slice((page - 1) * limit, page * limit);
    res.status(200).json(posts);
  } catch (error) {
    console.error("Error fetching posts:", error.message);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

app.post("/api/posts", async (req, res) => {
  const { content, community, authorId, image, imageName } = req.body;
  console.log('Received post creation request:', { content, community, authorId, image, imageName });

  if (!content || !authorId) return res.status(400).json({ error: "Content and authorId required" });

  try {
    const users = await readJSON(USERS_FILE);
    const user = users.find((user) => user.uid === authorId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let validatedImage = null;
    let validatedImageName = null;

    if (image && imageName) {
      validatedImage = image.startsWith('/api/postimage/uploads/') ? image : `/api/postimage/uploads/${imageName}${path.extname(image)}`;
      validatedImageName = imageName;
      const fullPath = path.join(POST_UPLOAD_DIR, path.basename(validatedImage));
      try {
        await fs.access(fullPath);
        console.log('✅ Image file exists:', fullPath);
      } catch (err) {
        console.warn(`⚠️ Image not found for post: ${fullPath}, proceeding without image`);
        validatedImage = null;
        validatedImageName = null;
      }
    } else {
      console.log('ℹ️ No image provided for post');
    }

    const posts = await readJSON(POSTS_FILE);
    const newPost = {
      _id: Date.now().toString(),
      authorId,
      authorName: user.name,
      authorPhoto: user.photo,
      content,
      community: community || "General",
      createdAt: new Date().toISOString(),
      likeCount: 0,
      likedBy: [],
      commentCount: 0,
      image: validatedImage,
      imageName: validatedImageName
    };

    posts.push(newPost);
    await writeJSON(POSTS_FILE, posts);

    console.log('✅ Post created successfully:', {
      postId: newPost._id,
      image: validatedImage,
      imageName: validatedImageName
    });

    res.status(201).json(newPost);
  } catch (error) {
    console.error("❌ Error creating post:", error.message);
    res.status(500).json({ error: "Failed to create post", details: error.message });
  }
});

app.post("/api/posts/:id/like", async (req, res) => {
  const postId = req.params.id;
  const userId = req.headers['x-user-id'] || req.query.uid || 'anonymous';
  try {
    const posts = await readJSON(POSTS_FILE);
    const post = posts.find((post) => post._id === postId);
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (post.likedBy.includes(userId)) {
      post.likedBy = post.likedBy.filter((id) => id !== userId);
      post.likeCount = Math.max(0, post.likeCount - 1);
    } else {
      post.likedBy.push(userId);
      post.likeCount++;
    }
    await writeJSON(POSTS_FILE, posts);
    res.json({ likeCount: post.likeCount, likedBy: post.likedBy });
  } catch (error) {
    console.error("Error liking post:", error.message);
    res.status(500).json({ error: "Failed to like post" });
  }
});

app.post("/com", async (req, res) => {
  const { query: postId } = req.body;
  if (!postId) return res.status(400).json({ error: "Post ID required" });
  try {
    const comments = await readJSON(COMMENTS_FILE);
    const filteredComments = comments
      .filter((comment) => comment.postId === postId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    res.status(200).json(filteredComments);
  } catch (error) {
    console.error("Error fetching comments:", error.message);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

app.post("/add/comment", async (req, res) => {
  const { postid, content, authorId } = req.body;
  if (!postid || !content || !authorId) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const posts = await readJSON(POSTS_FILE);
    const post = posts.find((post) => post._id === postid);
    if (!post) {
      return res.status(404).json({ error: "Post does not exist" });
    }
    const users = await readJSON(USERS_FILE);
    const user = users.find((user) => user.uid === authorId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const comments = await readJSON(COMMENTS_FILE);
    const newComment = {
      _id: Date.now().toString(),
      postId: postid,
      authorId,
      authorName: user.name,
      authorPhoto: user.photo,
      content,
      community: post.community,
      createdAt: new Date().toISOString(),
      likes: 0,
      likedBy: [],
      replyTo: null,
    };
    comments.push(newComment);
    post.commentCount++;
    await Promise.all([
      writeJSON(COMMENTS_FILE, comments),
      writeJSON(POSTS_FILE, posts),
    ]);
    res.status(201).json({ message: "Comment added", comment: newComment });
  } catch (error) {
    console.error("Error adding comment:", error.message);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

app.post("/api/comments/:id/like", async (req, res) => {
  const commentId = req.params.id;
  const userId = req.headers['x-user-id'] || req.query.uid || 'anonymous';
  try {
    const comments = await readJSON(COMMENTS_FILE);
    const comment = comments.find((comment) => comment._id === commentId);
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    if (comment.likedBy.includes(userId)) {
      comment.likedBy = comment.likedBy.filter((id) => id !== userId);
      comment.likes = Math.max(0, comment.likes - 1);
    } else {
      comment.likedBy.push(userId);
      comment.likes++;
    }
    await writeJSON(COMMENTS_FILE, comments);
    res.json({ likes: comment.likes, likedBy: comment.likedBy });
  } catch (error) {
    console.error("Error liking comment:", error.message);
    res.status(500).json({ error: "Failed to like comment" });
  }
});

app.get("/get", (req, res) => {
  const data = req.query;
  res.json(data);
});

app.get("/view/u/:id", (req, res) => {
  const id = req.params.id;
  res.render("home", { id });
});

app.get("/post/u/:id", async (req, res) => {
  const id = req.params.id;
  const user = await getUserData(id);
  const posts = await getPosts();
  const comments = await getComments();
  res.render("post", { id, user, posts, comments });
});

app.get("/dis/u/:id", (req, res) => {
  const id = req.params.id;
  res.render("dis", { id });
});

app.get("/make/u/:id", (req, res) => {
  const id = req.params.id;
  res.render("make", { id });
});

app.get("/notify/u/:id", (req, res) => {
  const id = req.params.id;
  res.render("not", { id });
});

app.get("/home", (req, res) => {
  res.render("home", { id: "null" });
});
app.get("/post/share", (req, res) => {
  const {id} = req.query;
  const {uid} =req.query
  res.render("home", {id,uid});
});


// Route Handlers
app.use("/c", idmake);
app.use("/c", lis);
app.use("/char", charmake);
app.use("/py", pythonRoute);
app.use("/api", charmakerRoutes);
app.use("/", charmakerRoutes);
app.use("/", creatorRoute);
app.use('/api', bioU);

// Start Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});