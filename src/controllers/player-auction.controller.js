const AuctionEvent = require('../models/AuctionEvent');
const Player = require('../models/Player');
const Bid = require('../models/Bid');
const Team = require('../models/Team');
const TeamEventBudget = require('../models/TeamEventBudget');
const User = require('../models/User');
const { emitPlayerSold, emitPlayerUnsold, emitTeamBalanceUpdate } = require('../socket/socketServer');

/**
 * Finalize player as sold (admin action)
 */
async function finalizePlayerSold(req, res, next) {
  try {
    const { eventId } = req.params;
    const { playerId } = req.body;

    const event = await AuctionEvent.findById(eventId);
    if (!event) {
      const error = new Error('Auction event not found');
      error.statusCode = 404;
      throw error;
    }

    if (event.status !== 'live') {
      const error = new Error('Auction is not live');
      error.statusCode = 400;
      throw error;
    }

    // Get current winning bid
    const winningBid = await Bid.getWinningBid(eventId, playerId);
    if (!winningBid) {
      const error = new Error('No winning bid found for this player');
      error.statusCode = 400;
      throw error;
    }

    // Get player, team, and owner details
    const player = await Player.findById(playerId);
    if (!player) {
      const error = new Error('Player not found');
      error.statusCode = 404;
      throw error;
    }

    const team = await Team.findById(winningBid.teamId).populate('ownerId', 'name email');
    if (!team) {
      const error = new Error('Team not found');
      error.statusCode = 404;
      throw error;
    }

    const owner = team.ownerId ? (typeof team.ownerId === 'object' ? team.ownerId : await User.findById(team.ownerId)) : null;

    // Mark player as sold
    await player.markAsSold(team._id, winningBid.amount, eventId);
    
    // Update event-wise budget instead of global team budget
    const eventBudget = event.settings?.startingBudget || 10000;
    const teamEventBudget = await TeamEventBudget.getOrCreate(
      team._id,
      eventId,
      eventBudget
    );
    await teamEventBudget.addPurchase(winningBid.amount);
    
    // Add player to team (for reference, but budget is event-wise)
    if (!team.players.includes(playerId)) {
      team.players.push(playerId);
      await team.save();
    }

    // Update event stats
    await event.updatePlayerSold(winningBid.amount);

    // Clear current player
    event.currentPlayerId = null;
    event.currentPlayerStartTime = null;
    await event.save();

    // Emit socket event
    emitPlayerSold(eventId, {
      player: {
        _id: player._id,
        name: player.name,
        role: player.role,
        photo: player.photo,
        basePrice: player.basePrice,
        soldPrice: winningBid.amount
      },
      team: {
        _id: team._id,
        name: team.name,
        shortName: team.shortName,
        logo: team.logo
      },
      owner: owner ? {
        _id: owner._id,
        name: owner.name,
        email: owner.email,
        photo: null // Can add owner photo if available
      } : null,
      bidAmount: winningBid.amount
    });

    // Emit team balance update (event-wise budget)
    // Refresh the budget after purchase to ensure latest balance
    if (owner) {
      const updatedEventBudget = await TeamEventBudget.findOne({ 
        teamId: team._id, 
        auctionEventId: eventId 
      }).lean();
      
      if (updatedEventBudget) {
        const updatedBalance = Math.max(0, updatedEventBudget.remainingBudget);
        console.log(`Updating balance for team ${team._id} (owner ${owner._id}): ${updatedBalance}`);
        emitTeamBalanceUpdate(eventId, owner._id, updatedBalance);
      }
    }

    res.status(200).json({
      success: true,
      message: `Player ${player.name} sold to ${team.name} for ₹${winningBid.amount}`,
      data: {
        player,
        team,
        bidAmount: winningBid.amount
      }
    });

  } catch (error) {
    next(error);
  }
}

/**
 * Finalize player as unsold (auto or admin action)
 */
async function finalizePlayerUnsold(req, res, next) {
  try {
    const { eventId } = req.params;
    const { playerId } = req.body;

    const event = await AuctionEvent.findById(eventId);
    if (!event) {
      const error = new Error('Auction event not found');
      error.statusCode = 404;
      throw error;
    }

    if (event.status !== 'live') {
      const error = new Error('Auction is not live');
      error.statusCode = 400;
      throw error;
    }

    const player = await Player.findById(playerId);
    if (!player) {
      const error = new Error('Player not found');
      error.statusCode = 404;
      throw error;
    }

    // Mark player as unsold
    await player.markAsUnsold();

    // Update event stats
    await event.updatePlayerUnsold();

    // Clear timer
    const { clearPlayerTimer } = require('../utils/timerManager');
    clearPlayerTimer(eventId);

    // Clear current player
    event.currentPlayerId = null;
    event.currentPlayerStartTime = null;
    await event.save();

    // Emit socket event
    emitPlayerUnsold(eventId, {
      player: {
        _id: player._id,
        name: player.name,
        role: player.role,
        photo: player.photo,
        basePrice: player.basePrice
      }
    });

    res.status(200).json({
      success: true,
      message: `Player ${player.name} marked as unsold`,
      data: {
        player
      }
    });

  } catch (error) {
    next(error);
  }
}

module.exports = {
  finalizePlayerSold,
  finalizePlayerUnsold,
};

