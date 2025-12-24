const express = require('express');
const router = express.Router();
const eventController = require('../controllers/event.controller');
const playerAuctionController = require('../controllers/player-auction.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { checkRole } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/events
 * @desc    Get all auction events
 * @access  Private (all authenticated users)
 */
router.get('/', eventController.getEvents);

/**
 * @route   GET /api/events/:id
 * @desc    Get single auction event
 * @access  Private
 */
router.get('/:id', eventController.getEventById);

/**
 * @route   POST /api/events
 * @desc    Create new auction event
 * @access  Private (admin only)
 */
router.post('/', checkRole(['admin']), eventController.createEvent);

/**
 * @route   PUT /api/events/:id
 * @desc    Update auction event
 * @access  Private (admin only)
 */
router.put('/:id', checkRole(['admin']), eventController.updateEvent);

/**
 * @route   POST /api/events/:id/start
 * @desc    Start auction event
 * @access  Private (admin, auctioneer)
 */
router.post('/:id/start', checkRole(['admin', 'auctioneer']), eventController.startEvent);

/**
 * @route   POST /api/events/:id/start-player
 * @desc    Start player auction (set current player)
 * @access  Private (admin only)
 */
router.post('/:id/start-player', checkRole(['admin']), eventController.startPlayerAuction);

/**
 * @route   DELETE /api/events/:id
 * @desc    Delete auction event
 * @access  Private (admin only)
 */
router.delete('/:id', checkRole(['admin']), eventController.deleteEvent);

/**
 * @route   POST /api/events/:eventId/player/finalize-sold
 * @desc    Finalize player as sold
 * @access  Private (admin, auctioneer)
 */
router.post('/:eventId/player/finalize-sold', checkRole(['admin', 'auctioneer']), playerAuctionController.finalizePlayerSold);

/**
 * @route   POST /api/events/:eventId/player/finalize-unsold
 * @desc    Finalize player as unsold
 * @access  Private (admin, auctioneer)
 */
router.post('/:eventId/player/finalize-unsold', checkRole(['admin', 'auctioneer']), playerAuctionController.finalizePlayerUnsold);

/**
 * @route   GET /api/events/:id/sold-players
 * @desc    Get sold players for a specific event
 * @access  Private
 */
router.get('/:id/sold-players', eventController.getSoldPlayers);

module.exports = router;

