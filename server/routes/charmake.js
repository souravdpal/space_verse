const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

router.post("/char", (req, res) => {
    console.log("Body received:", req.body);
    const { id, name, background, behavior, relationships, tags, link , firstline } = req.body; // ✅ now includes link

    if (!id || !name) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const charData = { id, name, background, behavior, relationships, tags, link ,firstline};
    const charFilePath = path.join(__dirname, "database", "charpersona", `${id}.json`);
    const listFilePath = path.join(__dirname, "database", "list.json");

    fs.mkdirSync(path.dirname(charFilePath), { recursive: true });

    try {
        fs.writeFileSync(charFilePath, JSON.stringify(charData, null, 2));
    } catch (err) {
        console.error("Write error (char persona):", err);
        return res.status(500).json({ error: "Failed to save character" });
    }

    let list = [];
    if (fs.existsSync(listFilePath)) {
        try {
            list = JSON.parse(fs.readFileSync(listFilePath, "utf-8"));
        } catch {
            console.warn("Invalid list.json, resetting it.");
        }
    }

    list.push({ id, name, tags, relationships, link  }); 

    try {
        fs.writeFileSync(listFilePath, JSON.stringify(list, null, 2));
    } catch (err) {
        console.error("Write error (list):", err);
        return res.status(500).json({ error: "Failed to update list" });
    }

    res.json({ msg: "Character added successfully!" });
});

module.exports = router;
