const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const express = require('express');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Serve uploaded images statically
router.use('/charimage/uploads', express.static(path.join(__dirname, '..', 'image', 'charimage')));
router.use('/userimage/uploads', express.static(path.join(__dirname, '..', 'image', 'userIMG')));
router.use('/postimage/uploads', express.static(path.join(__dirname, '..', 'image', 'postimage')));

// Ensure upload directories exist
const uploadDir = path.join(__dirname, '..', 'image', 'charimage');
const userUploadDir = path.join(__dirname, '..', 'image', 'userIMG');
const postUploadDir = path.join(__dirname, '..', 'image', 'postimage');

(async () => {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.mkdir(userUploadDir, { recursive: true });
    await fs.mkdir(postUploadDir, { recursive: true });
    console.log('Upload directories initialized:', { uploadDir, userUploadDir, postUploadDir });
  } catch (error) {
    console.error('Error creating upload directories:', error.message);
  }
})();

// Multer storage setup for character images
const charStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('Saving character image to:', uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${req.params.charId}${ext}`;
    console.log('Generated character filename:', filename);
    cb(null, filename);
  }
});

// Multer storage setup for user images
const userStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('Saving user image to:', userUploadDir);
    cb(null, userUploadDir);
  },
  filename: (req, file, cb) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      console.error('Missing x-user-id header for user image upload');
      return cb(new Error('Missing user ID'));
    }
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${userId}${ext}`;
    console.log('Generated user filename:', filename);
    cb(null, filename);
  }
});

// Multer storage setup for post images
const postStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('Saving post image to:', postUploadDir);
    cb(null, postUploadDir);
  },
  filename: (req, file, cb) => {
    const imageName = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${imageName}${ext}`;
    console.log('Generated post filename:', filename);
    req.imageName = imageName;
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: charStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      console.error('Invalid file type:', file.mimetype, file.originalname);
      cb(new Error('Only images (jpeg, jpg, png, gif) are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

const userUpload = multer({
  storage: userStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      console.error('Invalid file type:', file.mimetype, file.originalname);
      cb(new Error('Only images (jpeg, jpg, png, gif) are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

const postUpload = multer({
  storage: postStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      console.error('Invalid file type:', file.mimetype, file.originalname);
      cb(new Error('Only images (jpeg, jpg, png, gif) are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Handle character image upload
router.post('/char/:charId/img', upload.single('image'), async (req, res) => {
  console.log('Handling /char/img', {
    charId: req.params.charId,
    file: req.file
  });
  try {
    if (!req.file) {
      console.error('No file uploaded for character image');
      return res.status(400).json({ error: 'No image uploaded' });
    }
    const filePath = `/charimage/uploads/${req.file.filename}`;
    console.log('Character image uploaded successfully:', { charId: req.params.charId, filePath });
    res.json({ path: filePath });
  } catch (error) {
    console.error('Error uploading character image:', error.message);
    res.status(500).json({ error: 'Failed to upload character image', details: error.message });
  }
});

// Handle user image upload
router.post('/user/img', userUpload.single('image'), async (req, res) => {
  console.log('Handling /user/img', {
    userId: req.headers['x-user-id'],
    file: req.file
  });
  try {
    if (!req.file) {
      console.error('No file uploaded for user image');
      return res.status(400).json({ error: 'No image uploaded' });
    }
    if (!req.headers['x-user-id']) {
      console.error('Missing x-user-id header');
      return res.status(400).json({ error: 'Missing user ID' });
    }
    const filePath = `/userimage/uploads/${req.file.filename}`;
    const usersFile = path.join(__dirname, '..', 'data', 'users.json');
    const users = await fs.readFile(usersFile, 'utf8').then(JSON.parse).catch(() => []);
    const userIndex = users.findIndex(u => u.uid === req.headers['x-user-id']);
    if (userIndex === -1) {
      console.error('User not found:', req.headers['x-user-id']);
      return res.status(404).json({ error: 'User not found' });
    }
    users[userIndex].photo = filePath;
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
    console.log('User image updated successfully:', { userId: req.headers['x-user-id'], filePath });
    res.json({ path: filePath });
  } catch (error) {
    console.error('Error uploading user image:', error.message);
    res.status(500).json({ error: 'Failed to upload user image', details: error.message });
  }
});

// Handle post image upload
router.post('/posts/image', postUpload.single('image'), async (req, res) => {
  console.log('Handling /posts/image', {
    userId: req.headers['x-user-id'],
    file: req.file
  });
  try {
    if (!req.file) {
      console.error('No file uploaded for post image');
      return res.status(400).json({ error: 'No image uploaded' });
    }
    const filePath = `/api/postimage/uploads/${req.file.filename}`;
    console.log('Post image uploaded successfully:', { filePath, imageName: req.imageName });
    res.json({ path: filePath, imageName: req.imageName });
  } catch (error) {
    console.error('Error uploading post image:', error.message);
    res.status(500).json({ error: 'Failed to upload post image', details: error.message });
  }
});

module.exports = router;