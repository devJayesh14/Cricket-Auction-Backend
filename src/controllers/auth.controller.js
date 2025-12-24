const authService = require('../services/auth.service');

/**
 * Register a new user (Admin only for team_owner role)
 */
async function register(req, res, next) {
  try {
    const { name, email, password, role = 'team_owner', teamId } = req.body;

    // Only admin can register, and only team_owner role is allowed
    if (role !== 'team_owner') {
      const error = new Error('Only team_owner role can be registered through this endpoint');
      error.statusCode = 400;
      throw error;
    }

    // If teamId is provided, verify team exists and update team's ownerId
    if (teamId) {
      const Team = require('../models/Team');
      const team = await Team.findById(teamId);
      if (!team) {
        const error = new Error('Team not found');
        error.statusCode = 404;
        throw error;
      }
      if (team.ownerId) {
        const error = new Error('Team already has an owner assigned');
        error.statusCode = 400;
        throw error;
      }
    }

    const result = await authService.registerUser({
      name,
      email,
      password,
      role: 'team_owner', // Force team_owner role
      teamId: teamId || null,
    });

    // If teamId was provided, update team's ownerId and ensure budget is set
    if (teamId && result.user._id) {
      const Team = require('../models/Team');
      const team = await Team.findById(teamId);
      if (team) {
        // Ensure team has budget (use default if 0)
        const updateData = { ownerId: result.user._id };
        if (!team.budget || team.budget === 0) {
          updateData.budget = 10000; // Default budget ₹10k
          updateData.remainingBudget = 10000;
        }
        await Team.findByIdAndUpdate(teamId, updateData);
      }
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Login user
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const result = await authService.loginUser({
      email,
      password,
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all team owners
 */
async function getTeamOwners(req, res, next) {
  try {
    const User = require('../models/User');
    const users = await User.find({ role: 'team_owner' })
      .populate('teamId', 'name shortName logo budget remainingBudget')
      .select('-password')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user by ID
 */
async function getUserById(req, res, next) {
  try {
    const { id } = req.params;
    const User = require('../models/User');
    const user = await User.findById(id)
      .populate('teamId', 'name shortName logo budget remainingBudget')
      .select('-password');

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update user
 */
async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { name, email, isActive } = req.body;
    const User = require('../models/User');

    const user = await User.findByIdAndUpdate(
      id,
      { name, email, isActive },
      { new: true, runValidators: true }
    )
      .populate('teamId', 'name shortName logo budget remainingBudget')
      .select('-password');

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete user
 */
async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    const User = require('../models/User');

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  getTeamOwners,
  getUserById,
  updateUser,
  deleteUser,
};
