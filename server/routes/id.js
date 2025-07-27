const express = require("express");
const fs = require("fs").promises;
const path = require("path");

const router = express.Router();

router.get("/id/", async (req, res) => {
  const { id } = req.query;
  if (!id) {
    console.error("No character ID provided in query");
    return res.status(400).json({ error: "Character ID required" });
  }

  const listDir = path.join(__dirname, "..", "database");
  const listPath = path.join(listDir, "list.json");

  try {
    // Ensure database directory exists
    await fs.mkdir(listDir, { recursive: true }).catch((err) => {
      console.error(`Failed to create directory ${listDir}:`, err.message);
      throw err;
    });

    // Check if list.json exists, create empty array if not
    let list;
    try {
      await fs.access(listPath);
      list = await fs.readFile(listPath, "utf8").then(JSON.parse);
      if (!Array.isArray(list)) throw new Error("list.json is not an array");
    } catch (error) {
      console.warn(`Initializing list.json: ${error.message || "File not found"}`);
      list = [];
      await fs.writeFile(listPath, JSON.stringify(list, null, 2));
    }

    // Find character in list.json
    const character = list.find((char) => char.id === id);
    if (!character) {
      console.error(`Character not found in list.json: ${id}`);
      return res.status(404).json({ error: `Character ${id} not found` });
    }

    // Fetch character data from charpersona/<id>.json
    const charDir = path.join(listDir, "charpersona");
    const charFilePath = path.join(charDir, `${id}.json`);
    let charData;

    try {
      await fs.mkdir(charDir, { recursive: true });
      await fs.access(charFilePath);
      charData = await fs.readFile(charFilePath, "utf8").then(JSON.parse);
    } catch (error) {
      console.warn(`Character file not found or invalid: ${charFilePath}, using list.json data`);
      charData = {};
    }

    // Merge data, prioritizing list.json
    const responseData = {
      id: character.id,
      name: character.name || charData.name || "Unknown Character",
      creator: character.creator || charData.creator || "Unknown",
      creatorId: character.creatorId || charData.creatorId || null,
      firstline: charData.firstLine || charData.firstline || "",
      link: character.link || charData.link || null,
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