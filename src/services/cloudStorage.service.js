const cloudinary = require('cloudinary').v2;
const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = require('../config/environment');

// Configure Cloudinary
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

/**
 * Upload image to Cloudinary
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {String} folder - Folder path in Cloudinary (e.g., 'teams', 'players')
 * @param {String} fileName - Original filename
 * @returns {Promise<String>} - Public URL of uploaded image
 */
async function uploadImage(fileBuffer, folder, fileName) {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: `cricket-auction/${folder}`,
      public_id: fileName.replace(/\.[^/.]+$/, ''), // Remove extension
      resource_type: 'image',
      overwrite: false, // Don't overwrite existing images
      unique_filename: true, // Add unique suffix if filename exists
    };

    // Upload from buffer
    cloudinary.uploader
      .upload_stream(uploadOptions, (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return reject(new Error(`Failed to upload image: ${error.message}`));
        }
        
        // Validate that we got a secure URL
        if (!result || !result.secure_url) {
          console.error('Cloudinary upload succeeded but no secure_url returned:', result);
          return reject(new Error('Upload succeeded but no URL returned from Cloudinary'));
        }
        
        // Ensure the URL is properly formatted (should start with https://)
        const imageUrl = result.secure_url.trim();
        if (!imageUrl.startsWith('https://')) {
          console.warn('Cloudinary URL does not start with https://:', imageUrl);
        }
        
        console.log('Cloudinary upload successful. URL:', imageUrl);
        // Return the secure URL (HTTPS)
        resolve(imageUrl);
      })
      .end(fileBuffer);
  });
}

/**
 * Upload image from file path (for local development)
 * @param {String} filePath - Local file path
 * @param {String} folder - Folder path in Cloudinary
 * @returns {Promise<String>} - Public URL of uploaded image
 */
async function uploadImageFromPath(filePath, folder) {
  try {
    const path = require('path');
    const fileName = path.basename(filePath);
    
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `cricket-auction/${folder}`,
      public_id: fileName.replace(/\.[^/.]+$/, ''),
      resource_type: 'image',
      overwrite: false,
      unique_filename: true,
    });

    // Validate that we got a secure URL
    if (!result || !result.secure_url) {
      console.error('Cloudinary upload succeeded but no secure_url returned:', result);
      throw new Error('Upload succeeded but no URL returned from Cloudinary');
    }
    
    // Ensure the URL is properly formatted
    const imageUrl = result.secure_url.trim();
    if (!imageUrl.startsWith('https://')) {
      console.warn('Cloudinary URL does not start with https://:', imageUrl);
    }
    
    console.log('Cloudinary upload from path successful. URL:', imageUrl);
    return imageUrl;
  } catch (error) {
    console.error('Cloudinary upload from path error:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}

/**
 * Delete image from Cloudinary
 * @param {String} imageUrl - Public URL of the image
 * @returns {Promise<Boolean>} - Success status
 */
async function deleteImage(imageUrl) {
  try {
    // Extract public_id from URL
    // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{version}/{public_id}.{format}
    const urlParts = imageUrl.split('/');
    const uploadIndex = urlParts.indexOf('upload');
    
    if (uploadIndex === -1) {
      console.warn('Invalid Cloudinary URL:', imageUrl);
      return false;
    }

    // Get the part after 'upload' which contains version and public_id
    const afterUpload = urlParts.slice(uploadIndex + 1).join('/');
    const publicId = afterUpload.replace(/\.(jpg|jpeg|png|gif|webp)$/i, ''); // Remove extension
    
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
    });

    return result.result === 'ok';
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return false;
  }
}

/**
 * Check if Cloudinary is configured
 * @returns {Boolean}
 */
function isConfigured() {
  return !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
}

module.exports = {
  uploadImage,
  uploadImageFromPath,
  deleteImage,
  isConfigured,
};

