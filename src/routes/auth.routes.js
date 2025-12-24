const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { registerValidation, loginValidation } = require('../middleware/validation.middleware');
const { authenticateToken } = require('../middleware/auth.middleware');
const { checkRole } = require('../middleware/role.middleware');

/**
 * @route   POST /auth/register
 * @desc    Register a new team owner (Admin only)
 * @access  Private (Admin only)
 */
router.post('/register', authenticateToken, checkRole(['admin']), registerValidation, authController.register);

/**
 * @route   POST /auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 */
router.post('/login', loginValidation, authController.login);

/**
 * @route   GET /auth/team-owners
 * @desc    Get all team owners
 * @access  Private (Admin only)
 */
router.get('/team-owners', authenticateToken, checkRole(['admin']), authController.getTeamOwners);

/**
 * @route   GET /auth/users/:id
 * @desc    Get user by ID
 * @access  Private (Admin only)
 */
router.get('/users/:id', authenticateToken, checkRole(['admin']), authController.getUserById);

/**
 * @route   PUT /auth/users/:id
 * @desc    Update user
 * @access  Private (Admin only)
 */
router.put('/users/:id', authenticateToken, checkRole(['admin']), authController.updateUser);

/**
 * @route   DELETE /auth/users/:id
 * @desc    Delete user
 * @access  Private (Admin only)
 */
router.delete('/users/:id', authenticateToken, checkRole(['admin']), authController.deleteUser);

module.exports = router;

