const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const express = require('express');
const admin = require('firebase-admin');

const router = express.Router();

// Serve uploaded images statically
router.use('/charimage/uploads', express.static(path.join(__dirname, '..', 'image', 'charimage')));
router.use('/userimage/uploads', express.static(path.join(__dirname, '..', 'image', 'userIMG')));

// Ensure upload directories exist
const uploadDir = path.join(__dirname, '..', 'image', 'charimage');
const userUploadDir = path.join(__dirname, '..', 'image', 'userIMG');

(async () => {
    try {
        if (!await fs.access(uploadDir).catch(() => false)) {
            await fs.mkdir(uploadDir, { recursive: true });
        }
        if (!await fs.access(userUploadDir).catch(() => false)) {
            await fs.mkdir(userUploadDir, { recursive: true });
        }
    } catch (error) {
        console.error('Error creating upload directories:', error);
    }
})();

// Multer storage setup for character images
const charStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        console.log('Saving character image to:', uploadDir);
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const filename = `${req.params.charId}${ext}`;
        console.log('Generated character filename:', filename);
        cb(null, filename);
    }
});

// Multer storage setup for user images
const userStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        console.log('Saving user image to:', userUploadDir);
        cb(null, userUploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const filename = `${req.user.uid}${ext}`;
        console.log('Generated user filename:', filename);
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: charStorage,
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            console.error('Invalid file type:', file.mimetype, file.originalname);
            cb(new Error('Only images (jpeg, jpg, png, gif) are allowed'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const userUpload = multer({
    storage: userStorage,
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            console.error('Invalid file type:', file.mimetype, file.originalname);
            cb(new Error('Only images (jpeg, jpg, png, gif) are allowed'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Authentication middleware
const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

// Character image upload endpoint
router.post('/char/uploads/:charId', upload.single('image'), (req, res) => {
    if (!req.file) {
        console.error('No file uploaded or invalid file type');
        return res.status(400).json({ error: 'No file uploaded or invalid file type' });
    }
    const filePath = `/charimage/uploads/${req.params.charId}${path.extname(req.file.originalname).toLowerCase()}`;
    console.log('Character image saved successfully:', filePath);
    res.json({ msg: 'Image uploaded successfully', path: filePath });
});

// User image upload endpoint
router.post('/user/img', authMiddleware, userUpload.single('image'), async (req, res) => {
    if (!req.file) {
        console.error('No file uploaded or invalid file type');
        return res.status(400).json({ error: 'No file uploaded or invalid file type' });
    }
    try {
        const filePath = `/userimage/uploads/${req.user.uid}${path.extname(req.file.originalname).toLowerCase()}`;
        // Update user data with new image path
        const usersFile = path.join(__dirname, '..', 'data', 'users.json');
        const users = JSON.parse(await fs.readFile(usersFile, 'utf8'));
        const userIndex = users.findIndex(user => user.uid === req.user.uid);
        if (userIndex !== -1) {
            users[userIndex].photo = filePath;
            await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
        }
        console.log('User image saved successfully:', filePath);
        res.json({ msg: 'User image uploaded successfully', path: filePath });
    } catch (error) {
        console.error('Error updating user image:', error);
        res.status(500).json({ error: 'Failed to update user image' });
    }
});

// Get user image endpoint
router.get('/user/saves/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        const usersFile = path.join(__dirname, '..', 'data', 'users.json');
        const users = JSON.parse(await fs.readFile(usersFile, 'utf8'));
        const user = users.find(user => user.uid === userId);
        if (!user || !user.photo) {
            return res.status(404).json({ error: 'User or image not found' });
        }
        res.json({ path: user.photo });
    } catch (error) {
        console.error('Error fetching user image:', error);
        res.status(500).json({ error: 'Failed to fetch user image' });
    }
});

module.exports = router;