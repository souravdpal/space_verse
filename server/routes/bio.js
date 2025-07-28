const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

// User bio update endpoint
router.post('/user/bio', async (req, res) => {
  const { bio } = req.body;
  const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
  if (!bio) {
    return res.status(400).json({ error: 'Bio is required' });
  }
  if (bio.length > 100) {
    return res.status(400).json({ error: 'Bio must be 100 characters or less' });
  }
  try {
    const usersFile = path.join(__dirname, '..', 'data', 'users.json');
    let users = [];
    try {
      const data = await fs.readFile(usersFile, 'utf8');
      users = data && data.trim() !== "" ? JSON.parse(data) : [];
    } catch (err) {
      console.warn(`Creating new users.json: ${err.message}`);
      await fs.writeFile(usersFile, JSON.stringify([], null, 2));
    }
    const userIndex = users.findIndex(user => user.uid === userId);
    if (userIndex !== -1) {
      users[userIndex].bio = bio;
      await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
      console.log('User bio updated successfully:', { userId, bio });
      res.json({ msg: 'Bio updated successfully', bio });
    } else {
      return res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error updating user bio:', error.message);
    res.status(500).json({ error: 'Failed to update bio', details: error.message });
  }
});

module.exports = router;