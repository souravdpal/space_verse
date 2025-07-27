const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const admin = require("firebase-admin");

const router = express.Router();

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
router.post("/char", authMiddleware, async (req, res) => {
  console.log("Body received:", req.body);
  const { id, name, background, behavior, relationships, tags, image, firstLine, creator, creatorId } = req.body;

  if (!id || !name || !creatorId || creatorId !== req.user.uid) {
    console.error("Invalid fields:", { id, name, creatorId, userId: req.user.uid });
    return res.status(400).json({ error: "Missing or invalid fields (id, name, creatorId must match authenticated user)" });
  }

  const charData = { id, name, background, behavior, relationships, tags, link: image, firstLine, creator, creatorId };
  const listDir = path.join(__dirname, "..", "database");
  const charDir = path.join(listDir, "charpersona");
  const charFilePath = path.join(charDir, `${id}.json`);
  const listFilePath = path.join(listDir, "list.json");

  try {
    await fs.mkdir(listDir, { recursive: true });
    await fs.mkdir(charDir, { recursive: true });

    await fs.writeFile(charFilePath, JSON.stringify(charData, null, 2));
    console.log(`Character file written: ${charFilePath}`);

    let list = [];
    try {
      await fs.access(listFilePath);
      list = await fs.readFile(listFilePath, "utf8").then(JSON.parse);
      if (!Array.isArray(list)) {
        console.warn("Invalid list.json, resetting to empty array");
        list = [];
      }
    } catch (err) {
      console.warn(`Creating new list.json: ${err.message}`);
    }

    if (!list.some((char) => char.id === id)) {
      list.push({ id, name, tags, relationships, link: image, creator, creatorId, viewCount: 0 });
      await fs.writeFile(listFilePath, JSON.stringify(list, null, 2));
      console.log(`Updated list.json with character: ${id}`);
    }

    res.json({ msg: "Character added successfully!" });
  } catch (err) {
    console.error(`Error saving character ${id}:`, err);
    res.status(500).json({ error: "Failed to save character", details: err.message });
  }
});

module.exports = router;