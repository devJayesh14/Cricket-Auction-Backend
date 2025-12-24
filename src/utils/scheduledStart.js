const AuctionEvent = require('../models/AuctionEvent');
const Player = require('../models/Player');
const Bid = require('../models/Bid');
const { emitPlayerUpdate, emitAvailablePlayersUpdate } = require('../socket/socketServer');
const { setPlayerTimer } = require('../utils/timerManager');

// Helper function to get next category in sequence
function getNextCategory(currentCategory) {
  const sequence = ['batsman', 'bowler', 'all-rounder'];
  const currentIndex = sequence.indexOf(currentCategory);
  if (currentIndex === -1 || currentIndex === sequence.length - 1) {
    return sequence[0];
  }
  return sequence[currentIndex + 1];
}

// Helper function to auto move to next available player (role-based sequence)
async function autoMoveToNextPlayer(eventId) {
  try {
    const event = await AuctionEvent.findById(eventId);
    if (!event || event.status !== 'live') {
      return;
    }
    
    let currentCategory = event.currentCategory || 'batsman';
    
    // Get players sold in this event (have winning bid)
    const Bid = require('../models/Bid');
    const soldPlayerIds = await Bid.find({
      auctionEventId: eventId,
      isWinningBid: true
    }).distinct('playerId');
    
    // Get available players (not sold in this event) for current category
    const allPlayersInCategory = await Player.find({
      _id: { $in: event.players },
      role: currentCategory
    }).sort({ basePrice: 1 });
    
    let availablePlayers = allPlayersInCategory.filter(p => 
      !soldPlayerIds.some(soldId => soldId.toString() === p._id.toString())
    );
    
    if (availablePlayers.length === 0) {
      const nextCategory = getNextCategory(currentCategory);
      if (nextCategory === 'batsman' && currentCategory === 'all-rounder') {
        // Check if any players are available in any category
        const allPlayersInEvent = await Player.find({
          _id: { $in: event.players }
        });
        const anyAvailablePlayers = allPlayersInEvent.filter(p => 
          !soldPlayerIds.some(soldId => soldId.toString() === p._id.toString())
        );
        if (anyAvailablePlayers.length === 0) {
          return;
        }
      }
      currentCategory = nextCategory;
      event.currentCategory = nextCategory;
      await event.save();
      
      // Get available players for next category
      const allPlayersNextCategory = await Player.find({
        _id: { $in: event.players },
        role: currentCategory
      }).sort({ basePrice: 1 });
      
      availablePlayers = allPlayersNextCategory.filter(p => 
        !soldPlayerIds.some(soldId => soldId.toString() === p._id.toString())
      );
    }
    
    if (availablePlayers.length > 0) {
      const nextPlayerId = availablePlayers[0]._id.toString();
      setTimeout(async () => {
        try {
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
          
          const timerSeconds = 20;
          const timerDuration = timerSeconds * 1000;
          // Import createTimerCallback from event controller
          const { createTimerCallback } = require('../controllers/event.controller');
          setPlayerTimer(eventId, nextPlayerId, createTimerCallback(eventId), timerDuration);
        } catch (error) {
          console.error('Error auto-starting next player:', error);
        }
      }, 2000);
    }
  } catch (error) {
    console.error('Error in autoMoveToNextPlayer:', error);
  }
}

/**
 * Check for scheduled events that should start
 * This function should be called periodically (e.g., every minute)
 */
async function checkScheduledStarts() {
  try {
    const now = new Date();
    
    // Find events that are scheduled and should start now (within 1 minute window)
    const scheduledEvents = await AuctionEvent.find({
      status: 'scheduled',
      startDate: {
        $lte: new Date(now.getTime() + 60000), // Start within next minute
        $gte: new Date(now.getTime() - 60000)   // Or started in last minute
      }
    });

    for (const event of scheduledEvents) {
      // Check if it's time to start
      if (event.startDate <= now) {
        console.log(`Auto-starting scheduled event: ${event.name} (${event._id})`);
        
        try {
          // Start the auction
          await event.startAuction(event.createdBy);
          
          // Initialize currentCategory to batsman
          event.currentCategory = 'batsman';
          await event.save();
          
          // Auto-start first player (batsman) - use event controller's version
          setTimeout(async () => {
            const eventController = require('../controllers/event.controller');
            await eventController.autoMoveToNextPlayer(event._id.toString());
          }, 2000); // 2 second delay after event start
          
          console.log(`Event ${event.name} started successfully`);
        } catch (error) {
          console.error(`Error auto-starting event ${event._id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error checking scheduled starts:', error);
  }
}

/**
 * Start the scheduled start checker
 * Checks every minute for events that should start
 */
function startScheduledChecker() {
  // Check immediately on startup
  checkScheduledStarts();
  
  // Then check every minute
  setInterval(() => {
    checkScheduledStarts();
  }, 60000); // 60 seconds = 1 minute
  
  console.log('Scheduled start checker initialized');
}

module.exports = {
  checkScheduledStarts,
  startScheduledChecker,
  autoMoveToNextPlayer
};

