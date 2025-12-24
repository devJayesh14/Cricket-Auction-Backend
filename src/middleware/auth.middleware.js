const { verifyToken } = require('../services/auth.service');
const User = require('../models/User');

/**
 * Middleware to authenticate JWT token
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      const error = new Error('Access token is required');
      error.statusCode = 401;
      throw error;
    }

    // Verify token
    const decoded = verifyToken(token);
    
    // Get user from database
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      const error = new Error('Invalid or inactive user');
      error.statusCode = 401;
      throw error;
    }

    // Attach user info to request
    req.user = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  authenticateToken,
};

