const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

router.get('/id', (req, res) => {
  const id = req.query.id;

  const filePath = path.join(__dirname, 'database', 'charpersona',`${id}.json`);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Character not found' });
  }

  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(data);
    res.json(json); // ✅ Send the JSON to frontend
  } catch (err) {
    console.error('Failed to read or parse JSON:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
