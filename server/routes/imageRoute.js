require('dotenv').config();
const express = require('express');
const ImageKit = require('imagekit');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const router = express.Router();

// Initialize ImageKit with error handling
let imagekit;
try {
  if (!process.env.IMAGEKIT_PUBLIC_KEY) throw new Error('Missing IMAGEKIT_PUBLIC_KEY in environment variables');
  if (!process.env.IMAGEKIT_PRIVATE_KEY) throw new Error('Missing IMAGEKIT_PRIVATE_KEY in environment variables');
  imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/souravdpal',
  });
  console.log('ImageKit initialized successfully');
} catch (error) {
  console.error('Failed to initialize ImageKit:', error.message);
  imagekit = null;
}

// Multer for in-memory storage
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      console.error('Invalid file type:', file.mimetype, file.originalname);
      cb(new Error('Only images (JPEG, PNG, GIF, WebP) are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Middleware to check ImageKit initialization
const checkImageKit = (req, res, next) => {
  if (!imagekit) {
    console.error('ImageKit not initialized; cannot process image upload');
    return res.status(503).json({ error: 'Image upload service unavailable' });
  }
  next();
};

// Compress image using sharp with fallback for large files
async function compressImage(buffer, mimeType, isPostImage = false) {
  try {
    let sharpInstance = sharp(buffer);
    const maxSize = isPostImage ? 8 * 1024 * 1024 : 2 * 1024 * 1024; // 8MB for posts, 2MB for others
    let quality = isPostImage ? 85 : 60; // Higher quality for posts
    const maxDimensions = isPostImage ? { width: 1920, height: 1080 } : { width: 800, height: 800 };

    // Initial compression
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      sharpInstance = sharpInstance.jpeg({ quality });
    } else if (mimeType === 'image/png') {
      sharpInstance = sharpInstance.png({ compressionLevel: isPostImage ? 6 : 8 });
    } else if (mimeType === 'image/webp') {
      sharpInstance = sharpInstance.webp({ quality });
    } else if (mimeType === 'image/gif') {
      return buffer; // Skip compression for GIFs
    }
    sharpInstance = sharpInstance.resize({ ...maxDimensions, fit: 'inside', withoutEnlargement: true });
    let compressedBuffer = await sharpInstance.toBuffer();

    // Fallback: retry with lower quality if still too large
    if (compressedBuffer.length > maxSize && !isPostImage) {
      console.warn('Compressed image too large, retrying with lower quality', { size: compressedBuffer.length });
      quality = 40;
      sharpInstance = sharp(buffer).jpeg({ quality }).resize({ ...maxDimensions, fit: 'inside', withoutEnlargement: true });
      compressedBuffer = await sharpInstance.toBuffer();
    }

    if (compressedBuffer.length > maxSize) {
      throw new Error(`Compressed image size ${compressedBuffer.length} bytes exceeds limit of ${maxSize} bytes`);
    }

    console.log('Image compressed', { originalSize: buffer.length, compressedSize: compressedBuffer.length });
    return compressedBuffer;
  } catch (error) {
    console.error('Image compression failed:', error.message);
    throw error;
  }
}

// Handle character image upload
router.post('/char/:charId/img', checkImageKit, upload.single('image'), async (req, res) => {
  console.log('Handling /char/img', { 
    charId: req.params.charId, 
    file: req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file received'
  });
  try {
    if (!req.file) {
      console.error('No file uploaded for character image');
      return res.status(400).json({ error: 'No image uploaded' });
    }

    // Compress image
    let fileBuffer = req.file.buffer;
    try {
      fileBuffer = await compressImage(req.file.buffer, req.file.mimetype, false);
    } catch (error) {
      console.error('Compression failed for character image:', error.message);
      return res.status(400).json({ error: 'Failed to compress image', details: error.message });
    }

    console.log('Attempting ImageKit upload for character:', { charId: req.params.charId });
    let uploadResponse;
    try {
      uploadResponse = await imagekit.upload({
        file: fileBuffer,
        fileName: `${req.params.charId}${path.extname(req.file.originalname).toLowerCase()}`,
        folder: '/charimage/uploads',
      });
      console.log('Character image uploaded to ImageKit:', { charId: req.params.charId, url: uploadResponse.url });
    } catch (imageKitError) {
      console.error('ImageKit upload failed for character:', {
        message: imageKitError.message,
        charId: req.params.charId,
        fileName: req.file.originalname
      });
      return res.status(500).json({ error: 'Failed to upload image to ImageKit', details: imageKitError.message });
    }

    res.json({ path: uploadResponse.url });
  } catch (error) {
    console.error('Error uploading character image:', {
      message: error.message,
      stack: error.stack,
      charId: req.params.charId,
      file: req.file ? req.file.originalname : 'none'
    });
    res.status(500).json({ error: 'Failed to upload character image', details: error.message });
  }
});

// Handle user image upload
router.post('/user/img', checkImageKit, upload.single('image'), async (req, res) => {
  const userId = req.headers['x-user-id'];
  console.log('Handling /user/img', { 
    userId, 
    file: req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file received'
  });

  try {
    if (!req.file) {
      console.error('No file uploaded for user image');
      return res.status(400).json({ error: 'No image uploaded' });
    }
    if (!userId) {
      console.error('Missing x-user-id header');
      return res.status(400).json({ error: 'Missing user ID' });
    }

    // Validate file type and size
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(req.file.mimetype)) {
      console.error('Invalid file type:', req.file.mimetype);
      return res.status(400).json({ error: 'Only JPEG, PNG, GIF, or WebP images are allowed' });
    }

    // Compress image
    let fileBuffer = req.file.buffer;
    try {
      fileBuffer = await compressImage(req.file.buffer, req.file.mimetype, false);
    } catch (error) {
      console.error('Compression failed for user image:', error.message);
      return res.status(400).json({ error: 'Failed to compress image', details: error.message });
    }

    // Attempt ImageKit upload
    console.log('Attempting ImageKit upload for:', { userId, fileName: req.file.originalname });
    let uploadResponse;
    try {
      uploadResponse = await imagekit.upload({
        file: fileBuffer,
        fileName: `${userId}-${uuidv4()}${path.extname(req.file.originalname).toLowerCase()}`,
        folder: '/userimage/uploads',
      });
      console.log('Image uploaded to ImageKit:', { userId, filePath: uploadResponse.url });
    } catch (imageKitError) {
      console.error('ImageKit upload failed:', {
        message: imageKitError.message,
        userId,
        fileName: req.file.originalname
      });
      return res.status(500).json({ error: 'Failed to upload image to ImageKit', details: imageKitError.message });
    }

    const filePath = uploadResponse.url;

    // Attempt MongoDB update
    console.log('Attempting MongoDB update for user:', { userId });
    const User = require('../models/User');
    let user;
    try {
      user = await User.findOneAndUpdate(
        { uid: userId },
        { $set: { photo: filePath } },
        { new: true }
      );
    } catch (dbError) {
      console.error('MongoDB update failed:', {
        message: dbError.message,
        userId,
        filePath
      });
      return res.status(500).json({ error: 'Failed to update user profile in database', details: dbError.message });
    }

    if (!user) {
      console.error('User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('User image updated successfully:', { userId, filePath });
    res.json({ path: filePath });
  } catch (error) {
    console.error('Error in /user/img:', {
      message: error.message,
      stack: error.stack,
      userId,
      file: req.file ? req.file.originalname : 'none'
    });
    res.status(500).json({ error: 'Failed to upload profile image', details: error.message });
  }
});

// Handle post image upload (light compression)
router.post('/posts/image', checkImageKit, upload.single('image'), async (req, res) => {
  const userId = req.headers['x-user-id'];
  console.log('Handling /posts/image', { 
    userId, 
    file: req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file received'
  });

  try {
    if (!req.file) {
      console.error('No file uploaded for post image');
      return res.status(400).json({ error: 'No image uploaded' });
    }
    if (!userId) {
      console.error('Missing x-user-id header');
      return res.status(400).json({ error: 'Missing user ID' });
    }

    // Validate file type and size
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(req.file.mimetype)) {
      console.error('Invalid file type:', req.file.mimetype);
      return res.status(400).json({ error: 'Only JPEG, PNG, GIF, or WebP images are allowed' });
    }

    // Compress image
    let fileBuffer = req.file.buffer;
    try {
      fileBuffer = await compressImage(req.file.buffer, req.file.mimetype, true);
    } catch (error) {
      console.error('Compression failed for post image:', error.message);
      return res.status(400).json({ error: 'Failed to compress image', details: error.message });
    }

    // Attempt ImageKit upload
    console.log('Attempting ImageKit upload for post:', { userId, fileName: req.file.originalname });
    let uploadResponse;
    try {
      const imageName = uuidv4();
      uploadResponse = await imagekit.upload({
        file: fileBuffer,
        fileName: `${imageName}${path.extname(req.file.originalname).toLowerCase()}`,
        folder: '/postimage/uploads',
      });
      console.log('Post image uploaded successfully:', { filePath: uploadResponse.url, imageName });
    } catch (imageKitError) {
      console.error('ImageKit upload failed for post:', {
        message: imageKitError.message,
        userId,
        fileName: req.file.originalname
      });
      return res.status(500).json({ error: 'Failed to upload image to ImageKit', details: imageKitError.message });
    }

    const filePath = uploadResponse.url;
    res.json({ path: filePath, imageName: uploadResponse.fileName });
  } catch (error) {
    console.error('Error in /posts/image:', {
      message: error.message,
      stack: error.stack,
      userId,
      file: req.file ? req.file.originalname : 'none'
    });
    res.status(500).json({ error: 'Failed to upload post image', details: error.message });
  }
});

// Global error handler for multer errors
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', {
      message: err.message,
      code: err.code,
      field: err.field,
      path: req.path
    });
    return res.status(400).json({ error: 'File upload error', details: err.message });
  }
  next(err);
});

module.exports = router;