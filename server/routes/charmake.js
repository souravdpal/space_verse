const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const multer = require("multer");

const router = express.Router();

// Configure Multer to store files in /image/charimage
const uploadDir = path.join(__dirname, "../image/charimage");
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });

router.post("/uploads/:idcb", upload.single("image"), async (req, res) => {
  console.log("Body received:", req.body);
  console.log("File received:", req.file);

  const { name, background, behavior, relationships, tags, firstLine, creator, creatorId } = req.body;
  const { idcb } = req.params;
  const id = req.body.id || idcb;

  if (!id || !name || !creatorId) {
    console.error("Invalid fields:", { id, name, creatorId });
    return res.status(400).json({ error: "Missing required fields (id, name, creatorId)" });
  }

  const imageLink = req.file ? `/api/charimage/uploads/${req.file.filename}` : null;

  const charData = {
    id,
    name,
    background,
    behavior,
    relationships,
    tags,
    link: imageLink,
    firstLine,
    creator,
    creatorId
  };

  const listDir = path.join(__dirname, "..", "database");
  const charDir = path.join(listDir, "charpersona");
  const charFilePath = path.join(charDir, `${id}.json`);
  const listFilePath = path.join(listDir, "list.json");

  try {
    // Ensure directories exist
    await fs.mkdir(listDir, { recursive: true });
    await fs.mkdir(charDir, { recursive: true });

    // Read or initialize list.json
    let list = [];
    try {
      const listData = await fs.readFile(listFilePath, "utf8");
      list = listData && listData.trim() !== "" ? JSON.parse(listData) : [];
    } catch (err) {
      console.warn(`Creating new list.json: ${err.message}`);
      await fs.writeFile(listFilePath, JSON.stringify([], null, 2));
    }

    // Check for duplicate character ID
    if (list.some(char => char.id === id)) {
      console.error("Character ID already exists:", id);
      return res.status(400).json({ error: "Character ID already exists" });
    }

    // Add character to list.json
    list.push({
      id,
      name,
      link: imageLink || null,
      creator,
      creatorId,
      viewCount: 0
    });

    // Write character data to charpersona/<id>.json
    await fs.writeFile(charFilePath, JSON.stringify(charData, null, 2));
    console.log(`Character data saved to ${charFilePath}`);

    // Update list.json
    await fs.writeFile(listFilePath, JSON.stringify(list, null, 2));
    console.log(`Character added to ${listFilePath}`);

    res.status(201).json({ message: "Character created successfully", character: charData });
  } catch (error) {
    console.error("Error creating character:", error.message);
    res.status(500).json({ error: "Failed to create character", details: error.message });
  }
});

module.exports = router;
