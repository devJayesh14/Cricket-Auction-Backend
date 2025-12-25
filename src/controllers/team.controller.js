const Team = require('../models/Team');
const cloudStorage = require('../services/cloudStorage.service');

/**
 * Create a new team
 */
async function createTeam(req, res, next) {
  try {
    const { name, shortName, budget } = req.body;

    // Explicitly set ownerId to null - should only be set when assigning a team owner
    const teamData = {
      name,
      shortName: shortName.toUpperCase(),
      budget: budget || 10000, // Default budget ₹10k
      status: 'active',
      ownerId: null // Always null when creating - will be set when assigning team owner
    };

    // Handle logo upload - use cloud storage if configured, otherwise use local path
    if (req.file) {
      try {
        if (cloudStorage.isConfigured()) {
          // Use cloud storage (works for both local and serverless)
          if (req.file.buffer) {
            // Serverless environment (memory storage)
            console.log('Uploading logo to Cloudinary from buffer (serverless)');
            teamData.logo = await cloudStorage.uploadImage(
              req.file.buffer,
              'teams',
              req.file.originalname
            );
            console.log('Logo uploaded successfully:', teamData.logo);
          } else if (req.file.path) {
            // Local environment (disk storage)
            console.log('Uploading logo to Cloudinary from path:', req.file.path);
            teamData.logo = await cloudStorage.uploadImageFromPath(
              req.file.path,
              'teams'
            );
            console.log('Logo uploaded successfully:', teamData.logo);
          }
        } else if (req.file.path) {
          // Fallback to local storage if cloud storage not configured
          console.log('Cloudinary not configured, using local storage');
          let logoPath = req.file.path.replace(/\\/g, '/');
          const pathParts = logoPath.split('/');
          const uploadsIndex = pathParts.indexOf('uploads');
          if (uploadsIndex !== -1) {
            logoPath = pathParts.slice(uploadsIndex).join('/');
          }
          teamData.logo = logoPath;
          console.log('Logo saved to local path:', teamData.logo);
        } else {
          // Serverless environment but Cloudinary not configured
          console.warn('⚠️ Logo upload skipped: Cloudinary not configured and no file path available (serverless environment).');
          console.warn('⚠️ Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.');
          // Logo will remain null
        }
      } catch (uploadError) {
        console.error('❌ Error uploading logo:', uploadError.message);
        console.error('Stack:', uploadError.stack);
        // Don't fail the request, just log the error and continue without logo
        // You might want to throw the error instead if logo is required
      }
    } else {
      console.log('No file uploaded with team creation request');
    }

    const team = new Team(teamData);
    await team.save();

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: team,
    });
  } catch (error) {
    if (error.code === 11000) {
      // MongoDB duplicate key error
      const field = Object.keys(error.keyPattern)[0];
      let errorMessage;
      
      // Provide more specific error messages for known fields
      if (field === 'name') {
        errorMessage = 'A team with this name already exists';
      } else if (field === 'shortName') {
        errorMessage = 'A team with this short name already exists';
      } else if (field === 'ownerId') {
        errorMessage = 'This user already owns a team. A user can only own one team.';
      } else {
        errorMessage = `Team with this ${field} already exists`;
      }
      
      const err = new Error(errorMessage);
      err.statusCode = 409;
      return next(err);
    }
    next(error);
  }
}

/**
 * Get all teams
 */
async function getTeams(req, res, next) {
  try {
    const teams = await Team.find()
      .populate('ownerId', 'name email')
      .populate('players', 'name role basePrice photo')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: teams,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get team by ID
 */
async function getTeamById(req, res, next) {
  try {
    const { id } = req.params;
    
    const team = await Team.findById(id)
      .populate('ownerId', 'name email')
      .populate('players', 'name role basePrice photo age soldPrice statistics');

    if (!team) {
      const error = new Error('Team not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      data: team,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get team's players grouped by event (event-wise purchases)
 */
async function getTeamPlayersByEvent(req, res, next) {
  try {
    const { id } = req.params; // teamId
    const Bid = require('../models/Bid');
    
    // Get all winning bids for this team
    const winningBids = await Bid.find({
      teamId: id,
      isWinningBid: true
    })
      .populate('playerId', 'name role basePrice photo age statistics')
      .populate('auctionEventId', 'name startDate status')
      .sort({ bidTime: -1 });
    
    // Group by event
    const eventGroups = {};
    
    for (const bid of winningBids) {
      if (!bid.auctionEventId || !bid.playerId) {
        continue; // Skip if event or player not found
      }
      
      const eventId = bid.auctionEventId._id.toString();
      const eventName = bid.auctionEventId.name || 'Unknown Event';
      
      if (!eventGroups[eventId]) {
        eventGroups[eventId] = {
          eventId: eventId,
          eventName: eventName,
          eventStartDate: bid.auctionEventId.startDate,
          eventStatus: bid.auctionEventId.status,
          players: [],
          totalSpent: 0
        };
      }
      
      eventGroups[eventId].players.push({
        _id: bid.playerId._id,
        name: bid.playerId.name,
        role: bid.playerId.role,
        basePrice: bid.playerId.basePrice,
        photo: bid.playerId.photo,
        age: bid.playerId.age,
        statistics: bid.playerId.statistics,
        soldPrice: bid.amount,
        purchasedAt: bid.bidTime
      });
      
      eventGroups[eventId].totalSpent += bid.amount;
    }
    
    // Convert to array and sort by event start date (newest first)
    const eventWisePlayers = Object.values(eventGroups).sort((a, b) => {
      const dateA = new Date(a.eventStartDate).getTime();
      const dateB = new Date(b.eventStartDate).getTime();
      return dateB - dateA; // Newest first
    });
    
    res.status(200).json({
      success: true,
      data: eventWisePlayers,
      totalEvents: eventWisePlayers.length,
      totalPlayers: winningBids.length
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update team
 */
async function updateTeam(req, res, next) {
  try {
    const { id } = req.params;
    const { ownerId, ...rest } = req.body;
    
    // Do not allow ownerId to be updated directly through this endpoint
    // ownerId should only be set when assigning a team owner via the auth/register endpoint
    const updateData = { ...rest };

    if (updateData.shortName) {
      updateData.shortName = updateData.shortName.toUpperCase();
    }

    // Handle logo upload - use cloud storage if configured, otherwise use local path
    if (req.file) {
      try {
        // Get existing team to delete old logo from cloud storage if needed
        const existingTeam = await Team.findById(id);
        const oldLogoUrl = existingTeam?.logo;

        if (cloudStorage.isConfigured()) {
          // Use cloud storage (works for both local and serverless)
          if (req.file.buffer) {
            // Serverless environment (memory storage)
            updateData.logo = await cloudStorage.uploadImage(
              req.file.buffer,
              'teams',
              req.file.originalname
            );
          } else if (req.file.path) {
            // Local environment (disk storage)
            updateData.logo = await cloudStorage.uploadImageFromPath(
              req.file.path,
              'teams'
            );
          }

          // Delete old logo from cloud storage if it was a cloud URL
          if (oldLogoUrl && oldLogoUrl.includes('cloudinary.com')) {
            await cloudStorage.deleteImage(oldLogoUrl).catch(err => {
              console.error('Error deleting old logo from cloud storage:', err);
              // Don't fail if deletion fails
            });
          }
        } else if (req.file.path) {
          // Fallback to local storage if cloud storage not configured
          let logoPath = req.file.path.replace(/\\/g, '/');
          const pathParts = logoPath.split('/');
          const uploadsIndex = pathParts.indexOf('uploads');
          if (uploadsIndex !== -1) {
            logoPath = pathParts.slice(uploadsIndex).join('/');
          }
          updateData.logo = logoPath;
        } else {
          // Serverless environment but Cloudinary not configured
          console.warn('⚠️ Logo upload skipped: Cloudinary not configured and no file path available (serverless environment).');
          console.warn('⚠️ Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.');
        }
      } catch (uploadError) {
        console.error('❌ Error uploading logo:', uploadError.message);
        // Don't fail the request, just log the error
      }
    }

    const team = await Team.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('ownerId', 'name email')
      .populate('players', 'name role basePrice photo');

    if (!team) {
      const error = new Error('Team not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Team updated successfully',
      data: team,
    });
  } catch (error) {
    if (error.code === 11000) {
      // MongoDB duplicate key error
      const field = Object.keys(error.keyPattern)[0];
      let errorMessage;
      
      // Provide more specific error messages for known fields
      if (field === 'name') {
        errorMessage = 'A team with this name already exists';
      } else if (field === 'shortName') {
        errorMessage = 'A team with this short name already exists';
      } else if (field === 'ownerId') {
        errorMessage = 'This user already owns a team. A user can only own one team.';
      } else {
        errorMessage = `Team with this ${field} already exists`;
      }
      
      const err = new Error(errorMessage);
      err.statusCode = 409;
      return next(err);
    }
    next(error);
  }
}

/**
 * Delete team
 */
async function deleteTeam(req, res, next) {
  try {
    const { id } = req.params;

    const team = await Team.findById(id);
    if (!team) {
      const error = new Error('Team not found');
      error.statusCode = 404;
      throw error;
    }

    if (team.ownerId) {
      const error = new Error('Cannot delete team with assigned owner. Please reassign owner first.');
      error.statusCode = 400;
      throw error;
    }

    await Team.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Team deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get events where team has purchased players
 */
async function getTeamEvents(req, res, next) {
  try {
    const { id } = req.params; // teamId
    const Bid = require('../models/Bid');
    const AuctionEvent = require('../models/AuctionEvent');
    
    // Get all unique event IDs where this team has winning bids
    const eventIds = await Bid.find({
      teamId: id,
      isWinningBid: true
    }).distinct('auctionEventId');
    
    // Get event details
    const events = await AuctionEvent.find({
      _id: { $in: eventIds }
    })
      .select('name description startDate endDate status settings stats')
      .sort({ startDate: -1 }); // Newest first
    
    // For each event, get purchase stats
    const eventsWithStats = await Promise.all(events.map(async (event) => {
      const winningBids = await Bid.find({
        auctionEventId: event._id,
        teamId: id,
        isWinningBid: true
      });
      
      const totalSpent = winningBids.reduce((sum, bid) => sum + bid.amount, 0);
      const playersCount = winningBids.length;
      
      return {
        _id: event._id,
        name: event.name,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate,
        status: event.status,
        settings: event.settings,
        stats: event.stats,
        teamStats: {
          playersPurchased: playersCount,
          totalSpent: totalSpent
        }
      };
    }));
    
    res.status(200).json({
      success: true,
      data: eventsWithStats,
      totalEvents: eventsWithStats.length
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createTeam,
  getTeams,
  getTeamById,
  updateTeam,
  deleteTeam,
  getTeamPlayersByEvent,
  getTeamEvents,
};

