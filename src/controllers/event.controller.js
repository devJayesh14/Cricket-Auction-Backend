const AuctionEvent = require('../models/AuctionEvent');
const Player = require('../models/Player');
const Team = require('../models/Team');
const TeamEventBudget = require('../models/TeamEventBudget');

// Helper function to get next category in sequence
function getNextCategory(currentCategory) {
  const sequence = ['batsman', 'bowler', 'all-rounder'];
  const currentIndex = sequence.indexOf(currentCategory);
  if (currentIndex === -1 || currentIndex === sequence.length - 1) {
    return sequence[0]; // Start from beginning if at end
  }
  return sequence[currentIndex + 1];
}

// Helper function to auto move to next available player (role-based sequence)
// Uses the implementation from scheduledStart to avoid duplication
async function autoMoveToNextPlayer(eventId) {
  const { autoMoveToNextPlayer: scheduledAutoMove } = require('../utils/scheduledStart');
  return scheduledAutoMove(eventId);
}

// Legacy implementation - keeping for reference but redirecting to scheduledStart
async function autoMoveToNextPlayerLegacy(eventId) {
  try {
    const event = await AuctionEvent.findById(eventId);
    if (!event || event.status !== 'live') {
      return;
    }
    
    // Get current category (default to 'batsman')
    let currentCategory = event.currentCategory || 'batsman';
    
    // Try to find next player in current category
    let availablePlayers = await Player.find({
      _id: { $in: event.players },
      status: 'available',
      role: currentCategory
    }).sort({ basePrice: 1 }); // Sort by basePrice ascending
    
    // If no players in current category, move to next category
    if (availablePlayers.length === 0) {
      const nextCategory = getNextCategory(currentCategory);
      console.log(`No more ${currentCategory} players. Moving to ${nextCategory} category.`);
      
      // Check if we've completed all categories
      if (nextCategory === 'batsman' && currentCategory === 'all-rounder') {
        // Check if there are any available players left in any category
        const anyAvailablePlayers = await Player.find({
          _id: { $in: event.players },
          status: 'available'
        });
        
        if (anyAvailablePlayers.length === 0) {
          console.log('All players have been auctioned.');
          return; // All players sold, auction will be completed elsewhere
        }
      }
      
      currentCategory = nextCategory;
      event.currentCategory = nextCategory;
      await event.save();
      
      // Get players from new category
      availablePlayers = await Player.find({
        _id: { $in: event.players },
        status: 'available',
        role: currentCategory
      }).sort({ basePrice: 1 });
    }
    
    if (availablePlayers.length > 0) {
      const nextPlayerId = availablePlayers[0]._id.toString();
      // Small delay before starting next player
      setTimeout(async () => {
        try {
          const { emitPlayerUpdate } = require('../socket/socketServer');
          const Bid = require('../models/Bid');
          const { setPlayerTimer } = require('../utils/timerManager');
          
          const currentEvent = await AuctionEvent.findById(eventId);
          if (!currentEvent || currentEvent.status !== 'live') {
            return;
          }
          
          currentEvent.currentPlayerId = nextPlayerId;
          currentEvent.currentPlayerStartTime = new Date();
          await currentEvent.save();
          
          const nextPlayer = await Player.findById(nextPlayerId);
          const currentWinningBid = await Bid.getWinningBid(eventId, nextPlayerId);
          const currentBidAmount = currentWinningBid ? currentWinningBid.amount : nextPlayer.basePrice;
          
          emitPlayerUpdate(eventId, {
            playerId: nextPlayerId,
            player: {
              _id: nextPlayer._id,
              name: nextPlayer.name,
              age: nextPlayer.age,
              role: nextPlayer.role,
              basePrice: nextPlayer.basePrice,
              photo: nextPlayer.photo,
              statistics: nextPlayer.statistics
            },
            currentBid: currentWinningBid ? {
              amount: currentWinningBid.amount,
              teamId: currentWinningBid.teamId._id?.toString() || currentWinningBid.teamId.toString(),
              teamName: currentWinningBid.teamId.name
            } : null,
            currentBidAmount: currentBidAmount,
            startTime: currentEvent.currentPlayerStartTime.toISOString()
          });
          
          // Set timer for next player using the same callback logic
          // Timer: 20 seconds before first bid, 20 seconds after first bid
          const nextPlayerWinningBid = await Bid.getWinningBid(eventId, nextPlayerId);
          const timerSeconds = 20; // Always 20 seconds
          const timerDuration = timerSeconds * 1000;
          console.log(`Setting timer for next player ${nextPlayerId}: ${timerSeconds} seconds`);
          setPlayerTimer(eventId, nextPlayerId, createTimerCallback(eventId), timerDuration);
        } catch (error) {
          console.error('Error auto-starting next player:', error);
        }
      }, 2000); // 2 second delay
    }
  } catch (error) {
    console.error('Error in autoMoveToNextPlayer:', error);
  }
}

// Create timer callback function for auto mode
function createTimerCallback(eventId) {
  return async (eventIdParam, playerId) => {
    try {
      console.log(`Timer expired for player ${playerId} in event ${eventIdParam}`);
      const currentEvent = await AuctionEvent.findById(eventIdParam);
      
      if (!currentEvent) {
        console.log('Event not found:', eventIdParam);
        return;
      }
      
      if (currentEvent.currentPlayerId?.toString() !== playerId) {
        console.log(`Player ${playerId} is no longer current player. Current: ${currentEvent.currentPlayerId}`);
        return;
      }
      
      const Bid = require('../models/Bid');
      const Player = require('../models/Player');
      const Team = require('../models/Team');
      const User = require('../models/User');
      const { emitPlayerSold } = require('../socket/socketServer');
      
      const winningBid = await Bid.getWinningBid(eventIdParam, playerId);
      const player = await Player.findById(playerId);
      
      if (!player) {
        console.log('Player not found:', playerId);
        return;
      }
      
      if (player.status !== 'available') {
        console.log(`Player ${playerId} is not available. Status: ${player.status}`);
        return;
      }
      
      console.log(`Processing timer expiration. Winning bid:`, winningBid ? winningBid.amount : 'none');
      
      // Auto mode: automatically finalize player when timer expires
      if (currentEvent.settings?.autoMode !== false) {
        if (winningBid) {
          // Player has winning bid - auto finalize as sold
          console.log(`Auto-finalizing player ${playerId} as sold to team ${winningBid.teamId} for ${winningBid.amount}`);
          const team = await Team.findById(winningBid.teamId).populate('ownerId', 'name email');
          if (team) {
            await player.markAsSold(team._id, winningBid.amount, eventIdParam);
            
            // Update event-wise budget instead of global team budget
            const eventBudget = currentEvent.settings?.startingBudget || 10000;
            const teamEventBudget = await TeamEventBudget.getOrCreate(
              team._id,
              eventIdParam,
              eventBudget
            );
            await teamEventBudget.addPurchase(winningBid.amount);
            
            // Add player to team (for reference, but budget is event-wise)
            if (!team.players.includes(playerId)) {
              team.players.push(playerId);
              await team.save();
            }
            
            await currentEvent.updatePlayerSold(winningBid.amount);
            
            const owner = team.ownerId ? (typeof team.ownerId === 'object' ? team.ownerId : await User.findById(team.ownerId)) : null;
            
            currentEvent.currentPlayerId = null;
            currentEvent.currentPlayerStartTime = null;
            await currentEvent.save();
            
          console.log(`Emitting player:sold event for player ${playerId}`);
          const { emitTeamBalanceUpdate, emitAvailablePlayersUpdate } = require('../socket/socketServer');
          
          emitPlayerSold(eventIdParam, {
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
              photo: null
            } : null,
            bidAmount: winningBid.amount
          });

          // Emit team balance update for the team that bought the player (event-wise budget)
          // Refresh the budget after purchase to ensure latest balance
          const updatedEventBudget = await TeamEventBudget.findOne({ 
            teamId: team._id, 
            auctionEventId: eventIdParam 
          }).lean();
          
          if (updatedEventBudget && owner) {
            const updatedBalance = Math.max(0, updatedEventBudget.remainingBudget);
            console.log(`Updating balance for team ${team._id} (owner ${owner._id}): ${updatedBalance}`);
            emitTeamBalanceUpdate(eventIdParam, owner._id || team.ownerId, updatedBalance);
          }

          // Emit available players update
          await emitAvailablePlayersUpdate(eventIdParam);
            
            // Check if all players are sold in this event (using Bid model)
            const updatedEvent = await AuctionEvent.findById(eventIdParam);
            const Bid = require('../models/Bid');
            const soldPlayerIds = await Bid.find({
              auctionEventId: eventIdParam,
              isWinningBid: true
            }).distinct('playerId');
            
            // Check if all players in event have winning bids (sold)
            const allPlayerIds = updatedEvent.players.map(p => p.toString());
            const allSold = allPlayerIds.length > 0 && 
              allPlayerIds.every(playerId => 
                soldPlayerIds.some(soldId => soldId.toString() === playerId)
              );
            
            if (allSold) {
              // All players sold - complete the event
              console.log('All players sold! Completing auction event...');
              await updatedEvent.completeAuction();
              
              // Emit auction ended event
              const { emitAuctionEnded } = require('../socket/socketServer');
              await emitAuctionEnded(eventIdParam);
            } else {
              // Auto move to next player if available
              await autoMoveToNextPlayer(eventIdParam);
            }
          } else {
            console.error('Team not found for winning bid:', winningBid.teamId);
          }
        } else {
          // No bid received - put player back in loop (don't mark as unsold)
          console.log(`No bid received for player ${playerId}, moving to next player`);
          // Clear current player and move to next available player
          currentEvent.currentPlayerId = null;
          currentEvent.currentPlayerStartTime = null;
          await currentEvent.save();
          
          // Auto move to next player (this player will come back in rotation)
          await autoMoveToNextPlayer(eventIdParam);
        }
      } else {
        // Manual mode - if no bid, put player back in loop and move to next
        if (!winningBid) {
          console.log(`Manual mode: No bid for player ${playerId}, moving to next`);
          currentEvent.currentPlayerId = null;
          currentEvent.currentPlayerStartTime = null;
          await currentEvent.save();
          // Auto move to next player (this player will come back in rotation)
          await autoMoveToNextPlayer(eventIdParam);
        }
      }
    } catch (error) {
      console.error('Error in timer callback:', error);
      console.error('Stack trace:', error.stack);
    }
  };
}

/**
 * Create a new auction event
 */
async function createEvent(req, res, next) {
  try {
    const { name, description, startDate, settings, players, participatingTeams } = req.body;
    
    const event = new AuctionEvent({
      name,
      description,
      startDate: startDate ? new Date(startDate) : new Date(),
      players: players || [],
      participatingTeams: participatingTeams || [],
      settings: settings || {
        bidIncrement: 50,
        bidTimer: 10,
        startingBudget: 10000,
      },
      createdBy: req.user.userId,
    });

    await event.save();

    res.status(201).json({
      success: true,
      message: 'Auction event created successfully',
      data: event,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all auction events
 */
async function getEvents(req, res, next) {
  try {
    const events = await AuctionEvent.find()
      .populate('players', 'name role basePrice photo')
      .populate('participatingTeams', 'name shortName logo')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get single auction event by ID
 */
async function getEventById(req, res, next) {
  try {
    const { id } = req.params;
    
    const event = await AuctionEvent.findById(id)
      .populate('players', 'name role basePrice photo statistics')
      .populate('participatingTeams', 'name shortName logo budget')
      .populate('currentPlayerId', 'name role basePrice photo')
      .populate('createdBy', 'name email');

    if (!event) {
      const error = new Error('Auction event not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update auction event
 */
async function updateEvent(req, res, next) {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Only admin can update event status and date/time
    if (req.user.role !== 'admin') {
      const error = new Error('Only admin can update event');
      error.statusCode = 403;
      throw error;
    }

    const event = await AuctionEvent.findById(id);
    if (!event) {
      const error = new Error('Auction event not found');
      error.statusCode = 404;
      throw error;
    }

    // Allow admin to change status (e.g., from live back to scheduled/draft)
    if (updateData.status) {
      // If changing from live/paused to scheduled/draft, clear current player
      if ((event.status === 'live' || event.status === 'paused') && 
          (updateData.status === 'scheduled' || updateData.status === 'draft')) {
        event.currentPlayerId = null;
        event.currentPlayerStartTime = null;
        event.currentCategory = 'batsman'; // Reset category
      }
      event.status = updateData.status;
    }

    // Allow admin to change startDate and endDate
    if (updateData.startDate) {
      event.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate !== undefined) {
      event.endDate = updateData.endDate ? new Date(updateData.endDate) : null;
    }

    // Update other fields
    if (updateData.name) event.name = updateData.name;
    if (updateData.description !== undefined) event.description = updateData.description;
    if (updateData.players) event.players = updateData.players;
    if (updateData.participatingTeams) event.participatingTeams = updateData.participatingTeams;
    if (updateData.settings) {
      event.settings = { ...event.settings, ...updateData.settings };
    }

    await event.save({ validateBeforeSave: true });

    const updatedEvent = await AuctionEvent.findById(id)
      .populate('players')
      .populate('participatingTeams');

    res.status(200).json({
      success: true,
      message: 'Auction event updated successfully',
      data: updatedEvent,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Start auction event
 */
async function startEvent(req, res, next) {
  try {
    const { id } = req.params;

    const event = await AuctionEvent.findById(id);
    if (!event) {
      const error = new Error('Auction event not found');
      error.statusCode = 404;
      throw error;
    }

    await event.startAuction(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Auction started successfully',
      data: event,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Start player auction (set current player)
 */
async function startPlayerAuction(req, res, next) {
  try {
    const { id } = req.params;
    const { playerId } = req.body;

    // Only admin can start player auction
    if (req.user.role !== 'admin') {
      const error = new Error('Only admin can start player auction');
      error.statusCode = 403;
      throw error;
    }

    const event = await AuctionEvent.findById(id);
    if (!event) {
      const error = new Error('Auction event not found');
      error.statusCode = 404;
      throw error;
    }

    if (event.status !== 'live') {
      const error = new Error('Auction must be live to start player auction');
      error.statusCode = 400;
      throw error;
    }

    // Check if player exists and is in event
    const player = await Player.findById(playerId);
    if (!player) {
      const error = new Error('Player not found');
      error.statusCode = 404;
      throw error;
    }

    if (!event.players.includes(playerId)) {
      const error = new Error('Player is not part of this auction event');
      error.statusCode = 400;
      throw error;
    }

    // Ensure player is available (not sold or unsold) - player should remain available until sold
    if (player.status !== 'available') {
      const error = new Error(`Player cannot be put on auction. Current status: ${player.status}. Only available players can be auctioned.`);
      error.statusCode = 400;
      throw error;
    }

    // Initialize currentCategory if not set (start with batsman)
    if (!event.currentCategory) {
      event.currentCategory = 'batsman';
    }
    
    // Set current player and start time (skip validation for startDate since event is already live)
    event.currentPlayerId = playerId;
    event.currentPlayerStartTime = new Date();
    await event.save({ validateBeforeSave: true });

    // Set timer with auto mode callback
    // Timer: 20 seconds before first bid, 20 seconds after first bid
    const { setPlayerTimer } = require('../utils/timerManager');
    const Bid = require('../models/Bid');
    const currentWinningBid = await Bid.getWinningBid(id, playerId);
    // Always use 20 seconds
    const timerSeconds = 20;
    const timerDuration = timerSeconds * 1000;
    console.log(`Setting timer for player ${playerId}: ${timerSeconds} seconds (${currentWinningBid ? 'after first bid' : 'before first bid'})`);
    setPlayerTimer(id, playerId, createTimerCallback(id), timerDuration);

    await event.populate('currentPlayerId', 'name role basePrice photo statistics age');

    // Emit socket event for real-time updates
    const { emitPlayerUpdate, emitAvailablePlayersUpdate } = require('../socket/socketServer');
    const currentWinningBidForEmit = await Bid.getWinningBid(id, playerId);
    const currentBidAmount = currentWinningBidForEmit ? currentWinningBidForEmit.amount : event.currentPlayerId.basePrice;
    
    emitPlayerUpdate(id, {
      playerId: playerId,
      player: {
        _id: event.currentPlayerId._id,
        name: event.currentPlayerId.name,
        age: event.currentPlayerId.age,
        role: event.currentPlayerId.role,
        basePrice: event.currentPlayerId.basePrice,
        photo: event.currentPlayerId.photo,
        statistics: event.currentPlayerId.statistics
      },
      currentBid: currentWinningBidForEmit ? {
        amount: currentWinningBidForEmit.amount,
        teamId: currentWinningBidForEmit.teamId._id?.toString() || currentWinningBidForEmit.teamId.toString(),
        teamName: currentWinningBidForEmit.teamId.name
      } : null,
      currentBidAmount: currentBidAmount,
      startTime: event.currentPlayerStartTime.toISOString()
    });

    // Emit available players update
    await emitAvailablePlayersUpdate(id);

    res.status(200).json({
      success: true,
      message: 'Player auction started successfully',
      data: event,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete auction event
 */
async function deleteEvent(req, res, next) {
  try {
    const { id } = req.params;

    const event = await AuctionEvent.findByIdAndDelete(id);
    if (!event) {
      const error = new Error('Auction event not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Auction event deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get sold players for a specific event
 */
async function getSoldPlayers(req, res, next) {
  try {
    const { id } = req.params; // eventId
    
    const Bid = require('../models/Bid');
    const Player = require('../models/Player');
    
    // Get all winning bids for this event
    const winningBids = await Bid.find({
      auctionEventId: id,
      isWinningBid: true
    })
      .populate('playerId', 'name role basePrice photo age statistics')
      .populate('teamId', 'name shortName logo')
      .populate('bidderId', 'name email')
      .sort({ bidTime: -1 });
    
    // Format response with player and team details
    const soldPlayers = winningBids.map(bid => ({
      _id: bid.playerId._id,
      name: bid.playerId.name,
      role: bid.playerId.role,
      basePrice: bid.playerId.basePrice,
      photo: bid.playerId.photo,
      age: bid.playerId.age,
      statistics: bid.playerId.statistics,
      soldPrice: bid.amount,
      teamId: {
        _id: bid.teamId._id,
        name: bid.teamId.name,
        shortName: bid.teamId.shortName,
        logo: bid.teamId.logo
      },
      soldAt: bid.bidTime,
      bidder: {
        _id: bid.bidderId._id,
        name: bid.bidderId.name,
        email: bid.bidderId.email
      }
    }));
    
    res.status(200).json({
      success: true,
      data: soldPlayers,
      count: soldPlayers.length
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  startEvent,
  startPlayerAuction,
  deleteEvent,
  createTimerCallback,
  autoMoveToNextPlayer,
  getSoldPlayers,
};

