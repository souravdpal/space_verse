const express = require("express");
const fs = require("fs").promises;
const path = require("path");

const router = express.Router();

router.get("/list", async (req, res) => {
  const listDir = path.join(__dirname, "..", "database");
  const listFilePath = path.join(listDir, "list.json");

  try {
    await fs.mkdir(listDir, { recursive: true });
    let json;
    try {
      await fs.access(listFilePath);
      json = await fs.readFile(listFilePath, "utf8").then(JSON.parse);
      if (!Array.isArray(json)) throw new Error("list.json is not an array");
      // Ensure viewCount exists
      json = json.map(char => ({ ...char, viewCount: char.viewCount || 0 }));
    } catch (err) {
      console.warn(`Creating new list.json: ${err.message}`);
      json = [];
      await fs.writeFile(listFilePath, JSON.stringify(json, null, 2));
    }
    console.log(`Fetched list.json with ${json.length} characters`);
    res.json(json);
  } catch (err) {
    console.error("Failed to read or parse list.json:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;