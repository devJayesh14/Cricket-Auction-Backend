const Bid = require('../models/Bid');
const AuctionEvent = require('../models/AuctionEvent');
const Player = require('../models/Player');
const Team = require('../models/Team');
const TeamEventBudget = require('../models/TeamEventBudget');
const { canPlaceBid, getNextBidAmount } = require('../utils/auctionRules');

/**
 * Place a bid on the current player
 */
async function placeBid(req, res, next) {
  try {
    const { eventId, playerId, amount } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Only team owners can bid
    if (userRole !== 'team_owner') {
      const error = new Error('Only team owners can place bids');
      error.statusCode = 403;
      throw error;
    }

    // Validate inputs
    if (!eventId || !playerId || !amount) {
      const error = new Error('Event ID, Player ID, and amount are required');
      error.statusCode = 400;
      throw error;
    }

    // Get event
    const event = await AuctionEvent.findById(eventId);
    if (!event) {
      const error = new Error('Auction event not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if auction is live
    if (event.status !== 'live') {
      const error = new Error('Auction is not live');
      error.statusCode = 400;
      throw error;
    }

    // Check if player is current player
    if (event.currentPlayerId?.toString() !== playerId) {
      const error = new Error('This player is not currently on auction');
      error.statusCode = 400;
      throw error;
    }

    // Get player
    const player = await Player.findById(playerId);
    if (!player) {
      const error = new Error('Player not found');
      error.statusCode = 404;
      throw error;
    }

    // Get user's team
    const User = require('../models/User');
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    if (!user.teamId) {
      const error = new Error('User does not have a team assigned');
      error.statusCode = 400;
      throw error;
    }

    const team = await Team.findById(user.teamId);
    if (!team) {
      const error = new Error('Team not found');
      error.statusCode = 404;
      throw error;
    }

    // Get or create event-wise budget for this team
    const eventBudget = event.settings?.startingBudget || 10000;
    const teamEventBudget = await TeamEventBudget.getOrCreate(
      team._id,
      eventId,
      eventBudget
    );

    // Get current winning bid
    const currentWinningBid = await Bid.getWinningBid(eventId, playerId);
    const currentBidAmount = currentWinningBid ? currentWinningBid.amount : player.basePrice;

    // Validate bid using event-wise budget
    const validation = canPlaceBid(
      amount,
      currentBidAmount,
      teamEventBudget.remainingBudget,
      team.players?.length || 0,
      { currentBidAmount, isOwnerBidding: true }
    );

    if (!validation.valid) {
      const error = new Error(validation.reason);
      error.statusCode = 400;
      throw error;
    }

    // Create bid
    const bid = new Bid({
      auctionEventId: eventId,
      playerId: playerId,
      teamId: team._id,
      bidderId: userId,
      amount: amount,
      status: 'accepted',
      isWinningBid: true,
    });

    // Mark previous winning bid as outbid
    if (currentWinningBid) {
      await currentWinningBid.markAsRejected('Outbid by higher bid');
    }

    // Save new bid
    await bid.save();
    await bid.markAsWinning();

    // Populate bid data
    await bid.populate('teamId', 'name shortName logo');
    await bid.populate('bidderId', 'name email');

    // Calculate next bid amount using event's bid increment
    const bidIncrement = event.settings?.bidIncrement || 50;
    const nextBidAmount = amount + bidIncrement;

    // Reset timer when bid is placed
    const { clearPlayerTimer, setPlayerTimer } = require('../utils/timerManager');
    clearPlayerTimer(eventId);
    
    // Reset timer for another period using the same auto mode callback
    // Timer: 20 seconds after first bid (since bid was just placed)
    const { createTimerCallback } = require('./event.controller');
    const timerDuration = 20 * 1000; // 20 seconds after bid
    console.log(`Resetting timer after bid: 20 seconds`);
    setPlayerTimer(eventId, playerId, createTimerCallback(eventId), timerDuration);

    // Update event start time for timer reset
    event.currentPlayerStartTime = new Date();
    await event.save();

    // Emit socket event for real-time updates
    const { emitBidReceived, emitTeamBalanceUpdate } = require('../socket/socketServer');
    emitBidReceived(eventId, {
      bidId: bid._id.toString(),
      playerId: playerId,
      teamId: team._id.toString(),
      teamName: team.name,
      teamShortName: team.shortName,
      teamLogo: team.logo,
      bidderId: userId,
      bidderName: user.name,
      amount: amount,
      nextBidAmount: nextBidAmount,
      isWinningBid: true,
      previousBid: currentWinningBid ? {
        teamId: currentWinningBid.teamId._id?.toString() || currentWinningBid.teamId.toString(),
        teamName: currentWinningBid.teamId.name,
        amount: currentWinningBid.amount
      } : null,
      bidTime: bid.bidTime,
      timerReset: true
    });

    // Emit team balance update for the bidding team (event-wise budget)
    const updatedEventBudget = await TeamEventBudget.findOne({ 
      teamId: team._id, 
      auctionEventId: eventId 
    });
    if (updatedEventBudget) {
      emitTeamBalanceUpdate(eventId, userId, Math.max(0, updatedEventBudget.remainingBudget));
    }

    res.status(201).json({
      success: true,
      message: 'Bid placed successfully',
      data: bid,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all bids for a player in an auction
 */
async function getPlayerBids(req, res, next) {
  try {
    const { eventId, playerId } = req.params;

    const bids = await Bid.getPlayerBids(eventId, playerId);

    res.status(200).json({
      success: true,
      data: bids,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current winning bid for current player
 */
async function getCurrentBid(req, res, next) {
  try {
    const { eventId } = req.params;

    const event = await AuctionEvent.findById(eventId).populate('currentPlayerId');
    if (!event) {
      const error = new Error('Auction event not found');
      error.statusCode = 404;
      throw error;
    }

    if (!event.currentPlayerId) {
      return res.status(200).json({
        success: true,
        data: {
          currentPlayer: null,
          currentBid: null,
        },
      });
    }

    const currentWinningBid = await Bid.getWinningBid(eventId, event.currentPlayerId._id.toString());
    const currentBidAmount = currentWinningBid ? currentWinningBid.amount : event.currentPlayerId.basePrice;

    res.status(200).json({
      success: true,
      data: {
        currentPlayer: event.currentPlayerId,
        currentBid: currentWinningBid,
        currentBidAmount: currentBidAmount,
        nextBidAmount: getNextBidAmount(currentBidAmount),
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  placeBid,
  getPlayerBids,
  getCurrentBid,
};

