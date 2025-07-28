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

router.get("/char/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    console.error("No character ID provided in params");
    return res.status(400).json({ error: "Character ID required" });
  }

  const listDir = path.join(__dirname, "..", "database");
  const listPath = path.join(listDir, "list.json");

  try {
    await fs.mkdir(listDir, { recursive: true });

    let list = [];
    try {
      const exists = await fs.access(listPath).then(() => true).catch(() => false);
      if (exists) {
        const data = await fs.readFile(listPath, "utf8");
        if (data && data.trim() !== "") {
          list = JSON.parse(data);
          if (!Array.isArray(list)) {
            console.warn("Invalid list.json, resetting to empty array");
            list = [];
            await fs.writeFile(listPath, JSON.stringify(list, null, 2));
          }
        } else {
          console.warn("list.json is empty, initializing with empty array");
          await fs.writeFile(listPath, JSON.stringify([], null, 2));
        }
      } else {
        console.warn("list.json not found, creating new");
        await fs.writeFile(listPath, JSON.stringify([], null, 2));
      }
    } catch (error) {
      console.error(`Error reading list.json: ${error.message}`);
      list = [];
      await fs.writeFile(listPath, JSON.stringify(list, null, 2));
    }

    const character = list.find((char) => char.id === id);
    if (!character) {
      console.error(`Character not found in list.json: ${id}`);
      return res.status(404).json({ error: `Character ${id} not found` });
    }

    const charDir = path.join(listDir, "charpersona");
    const charFilePath = path.join(charDir, `${id}.json`);
    let charData = {};

    try {
      await fs.mkdir(charDir, { recursive: true });
      const exists = await fs.access(charFilePath).then(() => true).catch(() => false);
      if (exists) {
        const data = await fs.readFile(charFilePath, "utf8");
        if (data && data.trim() !== "") {
          charData = JSON.parse(data);
        }
      }
    } catch (error) {
      console.warn(`Character file not found or invalid: ${charFilePath}`);
    }

    const responseData = {
      id: character.id,
      name: character.name || charData.name || "Unknown Character",
      creator: character.creator || charData.creator || "Unknown",
      creatorId: character.creatorId || charData.creatorId || null,
      firstLine: charData.firstLine || charData.firstline || "",
      link: normalizeImagePath(character.link || charData.link),
      background: charData.background || "",
      behavior: charData.behavior || "",
      relationships: charData.relationships || {},
      tags: character.tags || charData.tags || []
    };

    console.log(`Fetched character ${id}:`, responseData);
    res.json(responseData);
  } catch (error) {
    console.error(`Error fetching character ${id}:`, error.message);
    res.status(500).json({ error: "Failed to fetch character data", details: error.message });
  }
});

module.exports = router;