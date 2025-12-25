const express = require('express');
const router = express.Router();
const cloudStorage = require('../services/cloudStorage.service');
const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = require('../config/environment');

/**
 * Test endpoint to check Cloudinary configuration
 * GET /api/test/cloudinary
 */
router.get('/cloudinary', (req, res) => {
  const isConfigured = cloudStorage.isConfigured();
  
  res.json({
    success: true,
    cloudinary: {
      configured: isConfigured,
      hasCloudName: !!CLOUDINARY_CLOUD_NAME,
      hasApiKey: !!CLOUDINARY_API_KEY,
      hasApiSecret: !!CLOUDINARY_API_SECRET,
      cloudName: CLOUDINARY_CLOUD_NAME ? `${CLOUDINARY_CLOUD_NAME.substring(0, 4)}...` : 'not set',
      message: isConfigured 
        ? 'Cloudinary is configured and ready to use!' 
        : 'Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.'
    },
    environment: process.env.NODE_ENV || 'development',
    isVercel: !!(process.env.VERCEL === '1' || process.env.VERCEL),
  });
});

module.exports = router;

