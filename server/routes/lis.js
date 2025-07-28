const express = require("express");
const fs = require("fs").promises;
const path = require("path");

const router = express.Router();

// Normalize image path
const normalizeImagePath = (path) => {
  if (path && path.startsWith('/charimage/uploads/') && !path.startsWith('/api')) {
    return `/api${path}`;
  }
  return path || null;
};

router.get("/list", async (req, res) => {
  const listDir = path.join(__dirname, "..", "database");
  const listFilePath = path.join(listDir, "list.json");

  try {
    await fs.mkdir(listDir, { recursive: true });

    let json = [];
    try {
      const data = await fs.readFile(listFilePath, "utf8");
      if (!data || data.trim() === "") {
        console.warn("list.json is empty, initializing with empty array");
        await fs.writeFile(listFilePath, JSON.stringify([], null, 2));
      } else {
        json = JSON.parse(data);
        if (!Array.isArray(json)) {
          console.warn("list.json is not an array, resetting to empty array");
          json = [];
          await fs.writeFile(listFilePath, JSON.stringify(json, null, 2));
        }
      }
      json = json.map(char => ({
        ...char,
        viewCount: char.viewCount || 0,
        link: normalizeImagePath(char.link)
      }));
    } catch (err) {
      if (err.code === "ENOENT") {
        console.warn(`list.json not found, creating new: ${err.message}`);
        await fs.writeFile(listFilePath, JSON.stringify([], null, 2));
      } else {
        console.error("Error reading or parsing list.json:", err.message);
        return res.status(500).json({ error: "Server error", details: err.message });
      }
    }
    console.log(`Fetched list.json with ${json.length} characters`);
    res.json(json);
  } catch (err) {
    console.error("Unexpected error in /list route:", err.message);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;