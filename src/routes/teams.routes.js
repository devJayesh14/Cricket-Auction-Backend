const express = require('express');
const router = express.Router();
const teamController = require('../controllers/team.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { checkRole } = require('../middleware/role.middleware');
const { uploadTeamLogo } = require('../middleware/upload.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/teams
 * @desc    Get all teams
 * @access  Private (all authenticated users)
 */
router.get('/', teamController.getTeams);

/**
 * @route   GET /api/teams/:id
 * @desc    Get single team
 * @access  Private
 */
router.get('/:id', teamController.getTeamById);

/**
 * @route   GET /api/teams/:id/players-by-event
 * @desc    Get team's players grouped by event (event-wise purchases)
 * @access  Private
 */
router.get('/:id/players-by-event', teamController.getTeamPlayersByEvent);

/**
 * @route   GET /api/teams/:id/events
 * @desc    Get events where team has purchased players
 * @access  Private
 */
router.get('/:id/events', teamController.getTeamEvents);

/**
 * @route   POST /api/teams
 * @desc    Create new team
 * @access  Private (admin only)
 */
router.post('/', checkRole(['admin']), uploadTeamLogo, teamController.createTeam);

/**
 * @route   PUT /api/teams/:id
 * @desc    Update team
 * @access  Private (admin only)
 */
router.put('/:id', checkRole(['admin']), uploadTeamLogo, teamController.updateTeam);

/**
 * @route   DELETE /api/teams/:id
 * @desc    Delete team
 * @access  Private (admin only)
 */
router.delete('/:id', checkRole(['admin']), teamController.deleteTeam);

module.exports = router;

