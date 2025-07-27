const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const admin = require("firebase-admin");

const router = express.Router();

// JSON File Paths
const USERS_FILE = path.join(__dirname, "..", "data", "users.json");
const FOLLOWS_FILE = path.join(__dirname, "..", "data", "follows.json");

// Helper Functions for JSON Operations
const readJSON = async (filePath) => {
  try {
    await fs.access(filePath); // Check if file exists
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
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing JSON to ${filePath}:`, err);
    throw err;
  }
};

// Authentication Middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

// API endpoint to fetch creator data
router.get("/api/creator/:creatorId", async (req, res) => {
  const creatorId = req.params.creatorId;
  try {
    const users = await readJSON(USERS_FILE);
    if (!users) {
      console.error("Users file is empty or invalid");
      return res.status(500).json({ error: "Invalid user data" });
    }

    const creator = users.find((u) => u.uid === creatorId);
    if (!creator) {
      console.error(`Creator not found: ${creatorId}`);
      return res.status(404).json({ error: "Creator not found" });
    }

    const listPath = path.join(__dirname, "..", "database", "list.json");
    const list = await readJSON(listPath);
    if (!list) {
      console.error(`Character list file is empty or invalid: ${listPath}`);
      return res.status(500).json({ error: "Invalid character list" });
    }

    const characters = list.filter(
      (char) =>
        char.creatorId === creatorId ||
        (char.creator && char.creator.toLowerCase() === creator.name.toLowerCase())
    );

    console.log(`Found ${characters.length} characters for creatorId: ${creatorId}`);

    const follows = await readJSON(FOLLOWS_FILE);
    const followRecord = follows.find((f) => f.targetUid === creator.uid) || { followerCount: 0 };

    res.json({
      creator: {
        uid: creator.uid || '',
        name: creator.name || 'Unknown',
        photo: creator.photo || '/default-avatar.png',
        bio: creator.bio || "Not set",
        followers: creator.followers || 0
      },
      characters
    });
  } catch (error) {
    console.error("Error fetching creator data:", error.message, error.stack);
    res.status(500).json({ error: "Failed to fetch creator data", details: error.message });
  }
});

// Endpoint to handle user follows
router.post("/api/user/:uid/follow", authMiddleware, async (req, res) => {
  const targetUid = req.params.uid;
  const followerUid = req.user.uid;

  if (targetUid === followerUid) {
    return res.status(400).json({ error: "Cannot follow yourself" });
  }

  try {
    const follows = await readJSON(FOLLOWS_FILE);
    let followRecord = follows.find((f) => f.targetUid === targetUid);

    if (!followRecord) {
      followRecord = { targetUid, followerCount: 0, followers: [] };
      follows.push(followRecord);
    }

    if (followRecord.followers.includes(followerUid)) {
      return res.status(400).json({ error: "User already followed" });
    }

    followRecord.followers.push(followerUid);
    followRecord.followerCount++;

    const users = await readJSON(USERS_FILE);
    const targetUser = users.find((u) => u.uid === targetUid);

    if (targetUser) {
      targetUser.followers = (targetUser.followers || 0) + 1;
      await writeJSON(USERS_FILE, users);
    }

    await writeJSON(FOLLOWS_FILE, follows);

    res.json({ followerCount: followRecord.followerCount, followed: true });
  } catch (error) {
    console.error("Error following user:", error);
    res.status(500).json({ error: "Failed to follow user" });
  }
});

// Endpoint to get follow status
router.get("/api/user/:uid/follow", authMiddleware, async (req, res) => {
  const targetUid = req.params.uid;
  const followerUid = req.user.uid;

  try {
    const follows = await readJSON(FOLLOWS_FILE);
    const followRecord = follows.find((f) => f.targetUid === targetUid);

    if (!followRecord) {
      return res.json({ followerCount: 0, followed: false });
    }

    res.json({
      followerCount: followRecord.followerCount || 0,
      followed: followRecord.followers.includes(followerUid)
    });
  } catch (error) {
    console.error("Error getting follow status:", error);
    res.status(500).json({ error: "Failed to fetch follow status" });
  }
});

module.exports = router;
