const express = require('express');
const router = express.Router();
const bidController = require('../controllers/bid.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { checkRole } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * @route   POST /api/bids
 * @desc    Place a bid on current player
 * @access  Private (team_owner only)
 */
router.post('/', checkRole(['team_owner']), bidController.placeBid);

/**
 * @route   GET /api/bids/event/:eventId/player/:playerId
 * @desc    Get all bids for a player in an auction
 * @access  Private
 */
router.get('/event/:eventId/player/:playerId', bidController.getPlayerBids);

/**
 * @route   GET /api/bids/event/:eventId/current
 * @desc    Get current winning bid for current player
 * @access  Private
 */
router.get('/event/:eventId/current', bidController.getCurrentBid);

module.exports = router;

