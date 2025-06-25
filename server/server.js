const express = require("express");
const cors = require("cors");
const path = require("path");
const admin = require("firebase-admin");
const fs = require("fs").promises;
require("dotenv").config();
const charmake = require("./routes/charmake");
const lis = require("./routes/lis");
const idmake = require("./routes/id");
const pythonRoute = require("./routes/routeai");

const app = express();
const port = process.env.PORT || 3000;

// JSON File Paths
const USERS_FILE = path.join(__dirname, "data", "users.json");
const POSTS_FILE = path.join(__dirname, "data", "posts.json");
const COMMENTS_FILE = path.join(__dirname, "data", "comments.json");

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(require("./fire.json")),
});

// Middleware
app.use(cors());
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Log every request
app.use((req, res, next) => {
  console.log(`Request: ${req.method} ${req.url}`);
  next();
});

// Serve static files with route-aware path resolution
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

// Initialize JSON Files
const initializeFiles = async () => {
  try {
    const dataDir = path.join(__dirname, "data");
    await fs.access(dataDir).catch(() => fs.mkdir(dataDir, { recursive: true }));

    for (const [file] of [[USERS_FILE], [POSTS_FILE], [COMMENTS_FILE]]) {
      try {
        const content = await fs.readFile(file, "utf8");
        if (!content || content.trim() === "") {
          await fs.writeFile(file, JSON.stringify([]));
        } else {
          JSON.parse(content); // Validate JSON
        }
      } catch (err) {
        console.log(`Initializing ${file}`);
        await fs.writeFile(file, JSON.stringify([]));
      }
    }
  } catch (err) {
    console.error("Error initializing files:", err);
  }
};
initializeFiles();

// Helper Functions for JSON Operations
const readJSON = async (filePath) => {
  try {
    const data = await fs.readFile(filePath, "utf8");
    if (!data || data.trim() === "") {
      await fs.writeFile(filePath, JSON.stringify([]));
      return [];
    }
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading JSON from ${filePath}:`, err);
    await fs.writeFile(filePath, JSON.stringify([])); // Reset to empty array on error
    return [];
  }
};

const writeJSON = async (filePath, data) => {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing JSON to ${filePath}:`, err);
    throw err;
  }
};

// Authentication Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token)
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
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
      photo: photo || `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(display_name)}&backgroundColor=1e1e3a`,
      status: "",
      bio: "",
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
      post.likeCount--;
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
      comment.likes--;
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

const data = {
  name: "sourav",
};

app.get("/chat/c/:id", (req, res) => {
  const id = req.params.id;
  res.render("chat", { data, id });
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
app.use("/c", charmake);
app.use("/c", lis);
app.use("/c", idmake);
app.use("/py", pythonRoute);

// Start Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});