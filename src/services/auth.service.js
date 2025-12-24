const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET, JWT_EXPIRE } = require('../config/environment');

/**
 * Generate JWT token for user
 * @param {string} userId - User ID
 * @returns {string} - JWT token
 */
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRE,
  });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} - Decoded token payload
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @param {string} userData.email - User email
 * @param {string} userData.password - User password
 * @param {string} userData.name - User name
 * @param {string} userData.role - User role (admin, auctioneer, team_owner)
 * @param {string} [userData.teamId] - Team ID (required for team_owner)
 * @returns {Object} - User object and token
 */
async function registerUser(userData) {
  const { email, password, name, role = 'team_owner', teamId } = userData;

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    const error = new Error('User with this email already exists');
    error.statusCode = 409;
    throw error;
  }

  // Allow team_owner to register without teamId - team can be created/assigned later
  // Team ID will be set when team is created and linked to the owner

  // Create new user
  const user = new User({
    email: email.toLowerCase(),
    password, // Will be hashed by pre-save middleware
    name,
    role,
    teamId: teamId || null,
  });

  await user.save();

  // Generate token
  const token = generateToken(user._id.toString());

  // Return user without password
  const userObject = user.toJSON();

  return {
    user: userObject,
    token,
  };
}

/**
 * Login user
 * @param {Object} credentials - Login credentials
 * @param {string} credentials.email - User email
 * @param {string} credentials.password - User password
 * @returns {Object} - User object and token
 */
async function loginUser(credentials) {
  const { email, password } = credentials;

  // Find user with password (using select('+password') since password has select: false)
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  
  if (!user) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  // Check if user is active
  if (!user.isActive) {
    const error = new Error('Account is deactivated. Please contact administrator');
    error.statusCode = 403;
    throw error;
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  // Update last login
  await user.updateLastLogin();

  // Populate team data if user has a team (include budget and remainingBudget)
  if (user.teamId) {
    await user.populate('teamId', 'name shortName logo budget remainingBudget spent');
  }

  // Generate token
  const token = generateToken(user._id.toString());

  // Return user without password
  const userObject = user.toJSON();

  return {
    user: userObject,
    token,
  };
}

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Object} - User object
 */
async function getUserById(userId) {
  const user = await User.findById(userId).populate('teamId', 'name shortName logo budget remainingBudget spent');
  
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return user.toJSON();
}

module.exports = {
  generateToken,
  verifyToken,
  registerUser,
  loginUser,
  getUserById,
};

