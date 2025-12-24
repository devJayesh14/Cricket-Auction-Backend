const express = require('express');
const router = express.Router();
const playerController = require('../controllers/player.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { checkRole } = require('../middleware/role.middleware');
const { createPlayerValidation } = require('../middleware/validation.middleware');
const { uploadPlayerPhoto, uploadCSV } = require('../middleware/upload.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/players
 * @desc    Get all players
 * @access  Private
 */
router.get('/', playerController.getPlayers);

/**
 * @route   GET /api/players/:id
 * @desc    Get single player
 * @access  Private
 */
router.get('/:id', playerController.getPlayerById);

/**
 * @route   POST /api/players
 * @desc    Create new player
 * @access  Private (admin only)
 */
router.post('/', checkRole(['admin']), uploadPlayerPhoto, createPlayerValidation, playerController.createPlayer);

/**
 * @route   PUT /api/players/:id
 * @desc    Update player
 * @access  Private (admin only)
 */
router.put('/:id', checkRole(['admin']), uploadPlayerPhoto, playerController.updatePlayer);

/**
 * @route   DELETE /api/players/:id
 * @desc    Delete player
 * @access  Private (admin only)
 */
router.delete('/:id', checkRole(['admin']), playerController.deletePlayer);

/**
 * @route   POST /api/players/bulk-import
 * @desc    Bulk import players from CSV file
 * @access  Private (admin only)
 */
router.post('/bulk-import', checkRole(['admin']), uploadCSV, playerController.bulkImportPlayers);

module.exports = router;

