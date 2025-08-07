const express = require('express');
const router = express.Router();
const Notification = require('../models/getnot.js');
const { ObjectId } = require('mongoose').Types;

// POST /notify/add
router.post('/add', async (req, res) => {
    const { uid, not: message, category } = req.body;
    console.log("🔔 /notify/add Body:", req.body);

    if (!uid || !message) {
        return res.status(400).json({ error: 'Missing user ID or message' });
    }

    try {
        
        const notifyUser = new Notification({
            id: uid,
            message,
            category,
            time: new Date(),
            status: false
        });

        await notifyUser.save();
        console.log("✅ Notification saved:", notifyUser);

        res.status(200).json({ message: 'Notification added successfully' });
    } catch (err) {
        console.error("❌ Error in /notify/add:", err);
        res.status(500).json({ error: 'Failed to add notification' });
    }
});

// GET /notify/data
router.get('/data', async (req, res) => {
    const { uid } = req.query;

    if (!uid) {
        return res.status(400).json({ error: 'Missing user ID' });
    }

    try {
        const notifications = await Notification.find({ id: uid });
        console.log(Notification)
        res.status(200).json(notifications);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error getting user notifications' });
    }
});

// GET /notify/read
router.get('/read', async (req, res) => {
    const { notid } = req.query;

    if (!notid) {
        return res.status(400).json({ error: 'Missing notification ID' });
    }

    try {
        const updated = await Notification.updateOne(
            { _id: new ObjectId(notid) },
            { $set: { status: true } }
        );

        res.status(200).json(updated);
        console.log(updated)
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error updating notification status' });
    }
});

// GET /notify/number
// GET /notify/number
router.get('/number', async (req, res) => {
    const { uid } = req.query;

    if (!uid) {
        return res.status(400).json({ error: 'Missing user ID' });
    }

    try {
        const count = await Notification.countDocuments({ id: uid, status: false });
        console.log(count)
        res.status(200).json({ unreadCount: count });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error getting notification count' });
    }
});

router.delete('/delete', async (req, res) => {
    const { notid } = req.query;
    if (!notid) {
        return res.status(400).json({ error: 'Missing notification ID' });
    }
    try {
        await Notification.deleteOne({ _id: new ObjectId(notid) });
        res.status(200).json({ message: 'Notification deleted' });
    } catch (err) {
        console.error('Error deleting notification:', err);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

module.exports = router;
