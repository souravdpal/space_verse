const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs").promises;
const glob = require("glob").promise;
require("dotenv").config();
const charmake = require("./routes/charmake");
const lis = require("./routes/lis");
const idmake = require("./routes/id");
const pythonRoute = require("./routes/routeai");
const charmakerRoutes = require("./routes/imageRoute");
const creatorRoute = require("./routes/creatorroute");
const sqlite3 = require("sqlite3").verbose();

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

// Middleware
app.use(cors());
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Enhanced request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const { method, url, headers, body } = req;
  console.log(`[${new Date().toISOString()}] Incoming Request:`);
  console.log(`  Method: ${method}`);
  console.log(`  URL: ${url}`);
  console.log(`  Headers:`, {
    authorization: headers.authorization || 'None',
    'x-user-id': headers['x-user-id'] || headers['X-User-ID'] || 'None',
    'user-agent': headers['user-agent'] || 'None',
  });
  if (body && typeof body === 'object' && Object.keys(body).length > 0) {
    console.log(`  Body:`, body);
  } else {
    console.log(`  Body: None`);
  }

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
    await fs.mkdir(DATA_DIR, { recursive: true }).catch(err => console.error(`Failed to create ${DATA_DIR}:`, err));
    await fs.mkdir(DB_DIR, { recursive: true }).catch(err => console.error(`Failed to create ${DB_DIR}:`, err));
    await fs.mkdir(CHAR_PERSONA_DIR, { recursive: true }).catch(err => console.error(`Failed to create ${CHAR_PERSONA_DIR}:`, err));
    await fs.mkdir(USER_DB_DIR, { recursive: true }).catch(err => console.error(`Failed to create ${USER_DB_DIR}:`, err));

    const files = [USERS_FILE, POSTS_FILE, COMMENTS_FILE, LIKES_FILE, VIEWS_FILE, FOLLOWS_FILE, LIST_FILE];
    for (const file of files) {
      try {
        await fs.access(file);
        const content = await fs.readFile(file, "utf8");
        if (!content || content.trim() === "") {
          console.log(`Initializing empty ${file}`);
          await fs.writeFile(file, JSON.stringify([]));
        } else {
          JSON.parse(content);
        }
      } catch (err) {
        console.log(`Creating ${file}`);
        await fs.writeFile(file, JSON.stringify([]));
      }
    }

    // Ensure list.json entries have viewCount
    const list = await readJSON(LIST_FILE);
    const updatedList = list.map(char => ({
      ...char,
      viewCount: char.viewCount || 0
    }));
    await writeJSON(LIST_FILE, updatedList);
  } catch (err) {
    console.error("Error initializing files:", err);
  }
};
initializeFiles();

// Helper Functions for JSON Operations
const readJSON = async (filePath) => {
  try {
    await fs.access(filePath);
    const data = await fs.readFile(filePath, "utf8");
    if (!data || data.trim() === "") {
      console.log(`File ${filePath} is empty, initializing with empty array`);
      await fs.writeFile(filePath, JSON.stringify([]));
      return [];
    }
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading JSON from ${filePath}:`, err);
    await fs.writeFile(filePath, JSON.stringify([]));
    return [];
  }
};

const writeJSON = async (filePath, data) => {
  try {
    console.log(`Writing to ${filePath}:`, data);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing JSON to ${filePath}:`, err);
    throw err;
  }
};

// Mock Authentication Middleware
const authMiddleware = async (req, res, next) => {
  console.log(`[${new Date().toISOString()}] Mock Authentication Attempt:`);
  console.log(`  URL: ${req.url}`);
  console.log(`  Query:`, req.query);
  console.log(`  Headers:`, {
    'x-user-id': req.headers['x-user-id'] || req.headers['X-User-ID'] || 'None',
  });

  const userId = req.query.uid || req.headers['x-user-id'] || req.headers['X-User-ID'] || 'mock-user-123';
  if (!userId) {
    console.error(`[${new Date().toISOString()}] Mock Auth Failed: No user ID provided`);
    return res.status(401).json({ error: "Unauthorized: No user ID provided" });
  }

  console.log(`[${new Date().toISOString()}] Mock Auth Success:`);
  console.log(`  User ID: ${userId}`);
  req.user = { uid: userId };
  next();
};

// Fetch user data
const getUserData = async (uid) => {
  try {
    const users = await readJSON(USERS_FILE);
    const user = users.find((user) => user.uid === uid) || {
      photo: '/default-avatar.png',
      name: 'Guest',
      bio: 'Not set',
      status: 'Offline',
      uid: uid,
      followers: 0,
    };
    return user;
  } catch (error) {
    console.error("Error fetching user data:", error);
    return {
      photo: '/default-avatar.png',
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
    return posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
  } catch (error) {
    console.error("Error fetching posts:", error);
    return [];
  }
};

// Count unique users who interacted with a character
const getChatInteractionCount = async (charId) => {
  try {
    const dbFiles = await glob(path.join(USER_DB_DIR, `his-*-${charId}.db`));
    return dbFiles.length || 0;
  } catch (error) {
    console.error(`Error counting chat interactions for ${charId}:`, error);
    return 0;
  }
};

// Endpoint to handle user follows
app.post("/api/user/:id/follow", authMiddleware, async (req, res) => {
  const creatorId = req.params.id;
  const userId = req.user.uid;
  console.log(`[${new Date().toISOString()}] Follow Attempt:`);
  console.log(`  Creator ID: ${creatorId}, User ID: ${userId}`);

  try {
    const users = await readJSON(USERS_FILE);
    const creator = users.find((u) => u.uid === creatorId);
    if (!creator) {
      console.error(`Creator ${creatorId} not found in users.json`);
      return res.status(404).json({ error: "Creator not found" });
    }

    const follows = await readJSON(FOLLOWS_FILE);
    console.log(`Current follows.json:`, follows);
    let followRecord = follows.find((f) => f.targetUid === creatorId);

    if (!followRecord) {
      followRecord = { targetUid: creatorId, followerCount: 0, followers: [] };
      follows.push(followRecord);
    }

    const followed = followRecord.followers.includes(userId);
    if (followed) {
      followRecord.followers = followRecord.followers.filter(id => id !== userId);
      followRecord.followerCount = Math.max(0, followRecord.followerCount - 1);
      console.log(`User ${userId} unfollowed ${creatorId}, new followerCount: ${followRecord.followerCount}`);
    } else {
      followRecord.followers.push(userId);
      followRecord.followerCount++;
      console.log(`User ${userId} followed ${creatorId}, new followerCount: ${followRecord.followerCount}`);
    }

    await writeJSON(FOLLOWS_FILE, follows);
    res.json({
      followed: !followed,
      followerCount: followRecord.followerCount
    });
  } catch (error) {
    console.error(`Error toggling follow for ${creatorId} by ${userId}:`, error);
    res.status(500).json({ error: "Failed to toggle follow", details: error.message });
  }
});

// Endpoint to fetch chat history
app.get('/history', authMiddleware, async (req, res) => {
  const { user_id, char_id } = req.query;
  if (!user_id || !char_id) {
    console.error("Missing user_id or char_id in history request");
    return res.status(400).json({ error: 'Missing user_id or char_id' });
  }

  const dbPath = path.join(USER_DB_DIR, `his-${user_id}-${char_id}.db`);

  try {
    await fs.mkdir(USER_DB_DIR, { recursive: true });
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        console.error(`Error opening history database ${dbPath}:`, err);
        return res.status(500).json({ error: 'Failed to open history database' });
      }
    });

    await new Promise((resolve, reject) => {
      db.run(`CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT,
        message TEXT,
        timestamp TEXT
      )`, (err) => {
        if (err) {
          console.error('Error creating history table:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    const history = await new Promise((resolve, reject) => {
      db.all('SELECT sender, message, timestamp FROM history ORDER BY timestamp ASC LIMIT 50', [], (err, rows) => {
        if (err) {
          console.error('Error querying history:', err);
          reject(err);
        } else {
          resolve(rows.map(row => ({
            sender: row.sender,
            message: row.message,
            timestamp: row.timestamp
          })));
        }
      });
    });

    db.close((err) => {
      if (err) console.error('Error closing database:', err);
    });

    console.log(`Fetched ${history.length} history entries for user ${user_id}, char ${char_id}`);
    res.json(history);
  } catch (error) {
    console.error(`Error fetching history for ${dbPath}:`, error);
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

// Endpoint to handle character likes
app.post("/api/char/:id/like", authMiddleware, async (req, res) => {
  const charId = req.params.id;
  const userId = req.user.uid;
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
    console.error("Error liking character:", error);
    res.status(500).json({ error: "Failed to like character" });
  }
});

// Endpoint to get character like status
app.get("/api/char/:id/like", authMiddleware, async (req, res) => {
  const charId = req.params.id;
  const userId = req.user.uid;
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
    console.error("Error fetching character like status:", error);
    res.status(500).json({ error: "Failed to fetch like status" });
  }
});

// Chat page with authentication
app.get("/chat/c/:id", authMiddleware, async (req, res) => {
  const charId = req.params.id;
  const userId = req.user.uid;

  try {
    const list = await readJSON(LIST_FILE);
    const char = list.find(c => c.id === charId);

    if (!char) {
      console.error(`Character ${charId} not found in list.json`);
      return res.status(404).render("error", { message: `Character ${charId} not found` });
    }

    // Increment view count
    const views = await readJSON(VIEWS_FILE);
    if (!views.some(view => view.charId === charId && view.userId === userId)) {
      views.push({ charId, userId });
      char.viewCount = (char.viewCount || 0) + 1;
      await Promise.all([
        writeJSON(VIEWS_FILE, views),
        writeJSON(LIST_FILE, list)
      ]);
      console.log(`Incremented view count for ${charId} by user ${userId}`);
    }

    const chatCount = await getChatInteractionCount(charId);
    res.render("chat", { id: charId, userId, viewCount: char.viewCount, chatCount });
  } catch (error) {
    console.error(`Error processing chat page for ${charId}:`, error);
    res.status(500).json({ error: "Failed to load chat page", details: error.message });
  }
});

// Creator works page with authentication
app.get("/creator/works", authMiddleware, async (req, res) => {
  const { creatorId } = req.query;
  if (!creatorId) {
    console.error("No creatorId provided in query");
    return res.status(400).json({ error: "No creator ID provided" });
  }
  try {
    console.log(`Fetching creator data for creatorId: ${creatorId}`);
    const users = await readJSON(USERS_FILE);
    if (!users) {
      console.error("Users file is empty or invalid");
      return res.status(500).json({ error: "Invalid user data" });
    }
    const creator = users.find((u) => u.uid === creatorId);
    if (!creator) {
      console.error(`Creator ${creatorId} not found`);
      return res.status(404).json({ error: "Creator not found" });
    }
    const list = await readJSON(LIST_FILE);
    if (!list) {
      console.error(`Character list file is empty or invalid: ${LIST_FILE}`);
      return res.status(500).json({ error: "Invalid character list" });
    }
    const likes = await readJSON(LIKES_FILE);
    const views = await readJSON(VIEWS_FILE);
    const userId = req.user.uid;
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
          console.warn(`Failed to read persona for ${char.id}: ${err.message}`);
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
    console.log(`Found ${characters.length} characters for creatorId: ${creatorId}`);
    const follows = await readJSON(FOLLOWS_FILE);
    const followRecord = follows.find((f) => f.targetUid === creator.uid) || { followerCount: 0, followers: [] };
    res.render("creator", {
      creator: {
        uid: creator.uid || '',
        name: creator.name || 'Unknown',
        photo: creator.photo || '/default-avatar.png',
        bio: creator.bio || "Not set",
        followers: followRecord.followerCount || 0
      },
      characters,
      userId,
      isFollowing: followRecord.followers.includes(userId)
    });
  } catch (error) {
    console.error("Error fetching creator works:", error.message, error.stack);
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
    console.error("Error fetching comments:", error);
    return {};
  }
};

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "root.html"));
});

app.get("/login", (req, res) => {
  res.json({ uid: 'mock-user-123', name: 'Mock User', email: 'mock@example.com' });
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
      photo: photo || `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(display_name)}&backgroundColor=1e1e3a`,
      status: "",
      bio: "",
      followers: 0,
    };
    users.push(newUser);
    await writeJSON(USERS_FILE, users);
    res.status(201).json({ message: "User saved", user: newUser });
  } catch (error) {
    console.error("Error saving user:", error);
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
    console.error("Error fetching credentials:", error);
    res.status(500).json({ error: "Error fetching credentials" });
  }
});

app.get("/api/posts", async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const community = req.query.community || "all";
  try {
    let posts = await readJSON(POSTS_FILE);
    if (community !== "all") {
      posts = posts.filter((post) => post.community === community);
    }
    posts = posts
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice((page - 1) * limit, page * limit);
    res.status(200).json(posts);
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

app.post("/api/posts", authMiddleware, async (req, res) => {
  const { content, community } = req.body;
  if (!content) return res.status(400).json({ error: "Content required" });
  try {
    const users = await readJSON(USERS_FILE);
    const user = users.find((user) => user.uid === req.user.uid);
    if (!user) return res.status(404).json({ error: "User not found" });
    const posts = await readJSON(POSTS_FILE);
    const newPost = {
      _id: Date.now().toString(),
      authorId: req.user.uid,
      authorName: user.name,
      authorPhoto: user.photo,
      content,
      community: community || "General",
      createdAt: new Date().toISOString(),
      likeCount: 0,
      likedBy: [],
      commentCount: 0,
    };
    posts.push(newPost);
    await writeJSON(POSTS_FILE, posts);
    res.status(201).json(newPost);
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Failed to create post" });
  }
});

app.post("/api/posts/:id/like", authMiddleware, async (req, res) => {
  const postId = req.params.id;
  const userId = req.user.uid;
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
    console.error("Error liking post:", error);
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
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

app.post("/add/comment", authMiddleware, async (req, res) => {
  const { postid, content } = req.body;
  if (!postid || !content) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const posts = await readJSON(POSTS_FILE);
    const post = posts.find((post) => post._id === postid);
    if (!post) {
      return res.status(404).json({ error: "Post does not exist" });
    }
    const users = await readJSON(USERS_FILE);
    const user = users.find((user) => user.uid === req.user.uid);
    if (!user) return res.status(404).json({ error: "User not found" });
    const comments = await readJSON(COMMENTS_FILE);
    const newComment = {
      _id: Date.now().toString(),
      postId: postid,
      authorId: req.user.uid,
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
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

app.post("/api/comments/:id/like", authMiddleware, async (req, res) => {
  const commentId = req.params.id;
  const userId = req.user.uid;
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
    console.error("Error liking comment:", error);
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

// Route Handlers
app.use("/c", idmake);
app.use("/c", lis);
app.use("/c", charmake);
app.use("/py", pythonRoute);
app.use("/", charmakerRoutes);
app.use("/", creatorRoute);

// Start Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});