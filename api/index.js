// Vercel serverless function entry point
// Set Vercel environment variable before requiring server
process.env.VERCEL = '1';

let app;
try {
  console.log('Loading server...');
  app = require('../src/server');
  console.log('Server loaded successfully');
} catch (error) {
  console.error('Error loading server:', error);
  console.error('Error stack:', error.stack);
  // Create a minimal error handler app
  const express = require('express');
  app = express();
  
  // Add CORS
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(204).send();
    }
    next();
  });
  
  app.use((req, res) => {
    res.status(500).json({
      success: false,
      message: 'Server initialization error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  });
}

// Export handler for Vercel serverless functions
module.exports = app;

