const ImageKit = require('imagekit');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
require('dotenv').config();
const { User, Post, List, CharPersona } = require("./models");

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Compress image using sharp with fallback for large files
async function compressImage(buffer, fileName, isPostImage = false) {
  try {
    const mimeType = fileName.match(/\.(jpeg|jpg|png|gif|webp)$/i)?.[1].toLowerCase();
    if (!mimeType) throw new Error('Unsupported file type');
    let sharpInstance = sharp(buffer);
    const maxSize = isPostImage ? 8 * 1024 * 1024 : 2 * 1024 * 1024;
    let quality = isPostImage ? 85 : 60;
    const maxDimensions = isPostImage ? { width: 1920, height: 1080 } : { width: 800, height: 800 };

    if (mimeType === 'jpeg' || mimeType === 'jpg') {
      sharpInstance = sharpInstance.jpeg({ quality });
    } else if (mimeType === 'png') {
      sharpInstance = sharpInstance.png({ compressionLevel: isPostImage ? 6 : 8 });
    } else if (mimeType === 'webp') {
      sharpInstance = sharpInstance.webp({ quality });
    } else if (mimeType === 'gif') {
      return buffer;
    }
    sharpInstance = sharpInstance.resize({ ...maxDimensions, fit: 'inside', withoutEnlargement: true });
    let compressedBuffer = await sharpInstance.toBuffer();

    if (compressedBuffer.length > maxSize && !isPostImage) {
      console.warn('Compressed image too large, retrying with lower quality', { size: compressedBuffer.length });
      quality = 40;
      sharpInstance = sharp(buffer).jpeg({ quality }).resize({ ...maxDimensions, fit: 'inside', withoutEnlargement: true });
      compressedBuffer = await sharpInstance.toBuffer();
    }

    if (compressedBuffer.length > maxSize) {
      throw new Error(`Compressed image size ${compressedBuffer.length} bytes exceeds limit of ${maxSize} bytes`);
    }

    console.log(`Compressed ${fileName}`, { originalSize: buffer.length, compressedSize: compressedBuffer.length });
    return compressedBuffer;
  } catch (error) {
    console.error(`Failed to compress ${fileName}:`, error.message);
    throw error;
  }
}

async function migrateImages() {
  const imageDirs = [
    { dir: 'charimage', folder: '/charimage', jsonField: 'link', compress: true },
    { dir: 'postimage', folder: '/postimage', jsonField: 'image', compress: true },
    { dir: 'userIMG', folder: '/userimage', jsonField: 'photo', compress: true }
  ];
  const baseDir = path.join(__dirname, 'image');

  // Normalize existing MongoDB data
  await User.updateMany(
    { photo: { $exists: true, $ne: null, $not: /^https:\/\/ik\.imagekit\.io\/souravdpal\// } },
    { $set: { photo: 'https://ik.imagekit.io/souravdpal/default-avatar.png' } }
  );
  await Post.updateMany(
    { authorPhoto: { $exists: true, $ne: null, $not: /^https:\/\/ik\.imagekit\.io\/souravdpal\// } },
    { $set: { authorPhoto: 'https://ik.imagekit.io/souravdpal/default-avatar.png' } }
  );
  await Post.updateMany(
    { image: { $exists: true, $ne: null, $not: /^https:\/\/ik\.imagekit\.io\/souravdpal\// } },
    { $set: { image: null } }
  );
  await List.updateMany(
    { link: { $exists: true, $ne: null, $not: /^https:\/\/ik\.imagekit\.io\/souravdpal\// } },
    { $set: { link: 'https://ik.imagekit.io/souravdpal/default-avatar.png' } }
  );
  await CharPersona.updateMany(
    { link: { $exists: true, $ne: null, $not: /^https:\/\/ik\.imagekit\.io\/souravdpal\// } },
    { $set: { link: 'https://ik.imagekit.io/souravdpal/default-avatar.png' } }
  );

  // Migrate images from local directories
  for (const { dir, folder, jsonField, compress } of imageDirs) {
    const dirPath = path.join(baseDir, dir);
    try {
      const files = await fs.readdir(dirPath).catch(() => []);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        let fileBuffer = await fs.readFile(filePath);
        if (compress) {
          try {
            fileBuffer = await compressImage(fileBuffer, file, dir === 'postimage');
          } catch (error) {
            console.error(`Skipping ${file} due to compression error`);
            continue;
          }
        }
        try {
          const result = await imagekit.upload({
            file: fileBuffer,
            fileName: file,
            folder
          });
          console.log(`Uploaded ${file} to ImageKit: ${result.url}`);
          if (dir === 'userIMG') {
            await User.updateMany(
              { [jsonField]: { $regex: file } },
              { $set: { [jsonField]: result.url } }
            );
          } else if (dir === 'postimage') {
            await Post.updateMany(
              { [jsonField]: { $regex: file } },
              { $set: { [jsonField]: result.url } }
            );
          } else if (dir === 'charimage') {
            await List.updateMany(
              { [jsonField]: { $regex: file } },
              { $set: { [jsonField]: result.url } }
            );
            await CharPersona.updateMany(
              { [jsonField]: { $regex: file } },
              { $set: { [jsonField]: result.url } }
            );
          }
        } catch (error) {
          console.error(`Failed to upload ${file}:`, error.message);
        }
      }
    } catch (error) {
      console.warn(`Directory ${dirPath} not found, skipping: ${error.message}`);
    }
  }
  console.log('MongoDB collections updated with ImageKit URLs');
}

migrateImages().catch(console.error);