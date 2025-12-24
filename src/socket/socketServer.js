const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/environment');
const User = require('../models/User');
const AuctionEvent = require('../models/AuctionEvent');
const Player = require('../models/Player');
const Bid = require('../models/Bid');
const Team = require('../models/Team');
const TeamEventBudget = require('../models/TeamEventBudget');

let io;

/**
 * Initialize Socket.io server
 */
function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*', // Allow all origins
      methods: ["GET", "POST"]
    }
  });

  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId).populate('teamId', 'name shortName logo remainingBudget');
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = decoded.userId;
      socket.user = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: user.teamId,
        team: user.teamId
      };
      
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.user.role})`);

    // Join auction room
    socket.on('join:auction', async (data) => {
      const { eventId } = data;
      
      // Validate eventId
      if (!eventId) {
        console.error('join:auction called without eventId');
        socket.emit('auction:joined', {
          success: false,
          error: 'Event ID is required'
        });
        return;
      }
      
      // Ensure eventId is a string
      const eventIdString = String(eventId);
      const room = `auction:${eventIdString}`;
        socket.join(room);
      console.log(`User ${socket.user.name} joined room: ${room} with eventId: ${eventIdString}`);
        
      try {
        // Load full event data
        const event = await AuctionEvent.findById(eventIdString)
          .populate('currentPlayerId', 'name role basePrice photo statistics age')
          .populate('players', 'name role basePrice photo status');
        
        if (!event) {
          socket.emit('auction:joined', {
            success: false,
            error: 'Event not found'
          });
          return;
        }

        // Get current player data
        let currentPlayerData = null;
        let currentBidAmount = 0;
        let winningBid = null;
        
        if (event.currentPlayerId) {
          const currentWinningBid = await Bid.getWinningBid(eventIdString, event.currentPlayerId._id);
          currentBidAmount = currentWinningBid ? currentWinningBid.amount : event.currentPlayerId.basePrice;
          
          if (currentWinningBid) {
            await currentWinningBid.populate('teamId', 'name shortName logo');
            winningBid = {
              teamId: currentWinningBid.teamId._id.toString(),
              teamName: currentWinningBid.teamId.name
            };
          }

          currentPlayerData = {
            playerId: event.currentPlayerId._id.toString(),
            player: {
              _id: event.currentPlayerId._id,
              name: event.currentPlayerId.name,
              age: event.currentPlayerId.age,
              role: event.currentPlayerId.role,
              basePrice: event.currentPlayerId.basePrice,
              photo: event.currentPlayerId.photo,
              statistics: event.currentPlayerId.statistics
            },
            currentBidAmount: currentBidAmount,
            currentBid: winningBid,
            startTime: event.currentPlayerStartTime ? event.currentPlayerStartTime.toISOString() : null
          };
        }

        // Get available players (exclude players sold in this event)
        const soldPlayerIds = await Bid.find({
          auctionEventId: eventIdString,
          isWinningBid: true
        }).distinct('playerId');
        
        const allPlayers = await Player.find({
          _id: { $in: event.players }
        }).select('name role basePrice photo age statistics');
        
        const availablePlayers = allPlayers.filter(p => 
          !soldPlayerIds.some(soldId => soldId.toString() === p._id.toString())
        );

        // Get event-wise team balance for team owners
        let teamBalance = null;
        if (socket.user.teamId) {
          const eventBudget = event.settings?.startingBudget || 10000;
          const teamEventBudget = await TeamEventBudget.getOrCreate(
            socket.user.teamId,
            eventIdString,
            eventBudget
          );
          teamBalance = Math.max(0, teamEventBudget.remainingBudget);
        }

        // Send comprehensive event data
        socket.emit('auction:joined', {
          success: true,
          eventId: eventIdString,
          room: room,
          event: {
            _id: event._id,
            name: event.name,
            status: event.status,
            settings: event.settings,
            stats: event.stats,
            currentPlayerStartTime: event.currentPlayerStartTime
          },
          currentPlayer: currentPlayerData,
          availablePlayers: availablePlayers.map(p => ({
            _id: p._id,
            name: p.name,
            role: p.role,
            basePrice: p.basePrice,
            photo: p.photo,
            age: p.age,
            statistics: p.statistics
          })),
          teamBalance: teamBalance
        });
      } catch (error) {
        console.error('Error loading event data for join:', error);
        socket.emit('auction:joined', {
          success: false,
          error: 'Failed to load event data'
        });
      }
    });

    // Handle bid submission via socket
    socket.on('bid:submit', async (data) => {
      const { eventId, playerId, amount } = data;
      
      try {
        // Import bid controller function
        const bidController = require('../controllers/bid.controller');
        const req = {
          user: { userId: socket.userId, role: socket.user.role },
          params: { id: eventId, playerId: playerId },
          body: { eventId, playerId, amount }
        };
        const res = {
          status: (code) => ({
            json: (data) => {
              if (code === 200 || code === 201) {
                // Success - socket events already emitted by controller
                socket.emit('bid:response', { success: true, data });
              } else {
                socket.emit('bid:response', { success: false, error: data.message || data.error });
              }
            }
          })
        };
        const next = (error) => {
          if (error) {
            console.error('Error in bid controller:', error);
            socket.emit('bid:response', {
              success: false,
              error: error.message || 'Failed to place bid'
            });
          }
        };
        
        await bidController.placeBid(req, res, next);
      } catch (error) {
        console.error('Error handling bid submission:', error);
        socket.emit('bid:response', {
          success: false,
          error: error.message || 'Failed to place bid'
        });
      }
    });

    // Handle player start via socket (admin only)
    socket.on('player:start', async (data) => {
      const { eventId, playerId } = data;
      
      // Check if user is admin/auctioneer
      if (socket.user.role !== 'admin' && socket.user.role !== 'auctioneer') {
        socket.emit('player:start:response', {
          success: false,
          error: 'Unauthorized: Only admin/auctioneer can start player auction'
        });
        return;
      }

      try {
        const eventController = require('../controllers/event.controller');
        const req = {
          user: { userId: socket.userId, role: socket.user.role },
          params: { id: eventId },
          body: { playerId: playerId }
        };
        const res = {
          status: (code) => ({
            json: (data) => {
              if (code === 200 || code === 201) {
                socket.emit('player:start:response', { success: true, data });
              } else {
                socket.emit('player:start:response', { success: false, error: data.message || data.error });
              }
            }
          })
        };
        const next = (error) => {
          if (error) {
            console.error('Error in event controller:', error);
            socket.emit('player:start:response', {
              success: false,
              error: error.message || 'Failed to start player auction'
            });
          }
        };
        
        await eventController.startPlayerAuction(req, res, next);
      } catch (error) {
        console.error('Error starting player auction:', error);
        socket.emit('player:start:response', {
          success: false,
          error: error.message || 'Failed to start player auction'
        });
      }
    });

    // Leave auction room
    socket.on('leave:auction', (data) => {
      const { eventId } = data;
      if (eventId) {
        const room = `auction:${eventId}`;
        socket.leave(room);
        console.log(`User ${socket.user.name} left room: ${room}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.name}`);
    });
  });

  return io;
}

/**
 * Get Socket.io instance
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocket first.');
  }
  return io;
}

/**
 * Emit bid received event to all clients in auction room
 */
function emitBidReceived(eventId, bidData) {
  const io = getIO();
  io.to(`auction:${eventId}`).emit('bid:received', bidData);
}

/**
 * Emit current player update to all clients in auction room
 */
function emitPlayerUpdate(eventId, playerData) {
  const io = getIO();
  io.to(`auction:${eventId}`).emit('player:current', playerData);
}

/**
 * Emit auction status update
 */
function emitAuctionStatus(eventId, statusData) {
  const io = getIO();
  io.to(`auction:${eventId}`).emit('auction:status', statusData);
}

/**
 * Emit player sold event with animation data
 */
function emitPlayerSold(eventId, soldData) {
  const io = getIO();
  console.log(`Emitting player:sold to room auction:${eventId}`, soldData);
  io.to(`auction:${eventId}`).emit('player:sold', soldData);
}

/**
 * Emit player unsold event
 */
function emitPlayerUnsold(eventId, unsoldData) {
  const io = getIO();
  io.to(`auction:${eventId}`).emit('player:unsold', unsoldData);
}

/**
 * Emit team balance update to specific user
 */
function emitTeamBalanceUpdate(eventId, userId, teamBalance) {
  const io = getIO();
  io.to(`auction:${eventId}`).to(userId.toString()).emit('team:balance', {
    teamBalance: teamBalance
  });
}

/**
 * Emit available players list update
 */
async function emitAvailablePlayersUpdate(eventId) {
  const io = getIO();
  try {
    const event = await AuctionEvent.findById(eventId);
    if (!event) return;

    const Bid = require('../models/Bid');
    
    // Get all players in the event
    const allPlayers = await Player.find({
      _id: { $in: event.players }
    }).select('name role basePrice photo age statistics');

    // Get players that are sold in this event (have winning bid)
    const soldPlayerIds = await Bid.find({
      auctionEventId: eventId,
      isWinningBid: true
    }).distinct('playerId');

    // Filter out sold players - only show available players for this event
    const availablePlayers = allPlayers.filter(p => 
      !soldPlayerIds.some(soldId => soldId.toString() === p._id.toString())
    );

    io.to(`auction:${eventId}`).emit('players:available', {
      players: availablePlayers.map(p => ({
        _id: p._id,
        name: p.name,
        role: p.role,
        basePrice: p.basePrice,
        photo: p.photo,
        age: p.age,
        statistics: p.statistics
      }))
    });
  } catch (error) {
    console.error('Error emitting available players update:', error);
  }
}

/**
 * Emit event update
 */
function emitEventUpdate(eventId, eventData) {
  const io = getIO();
  io.to(`auction:${eventId}`).emit('event:update', eventData);
}

/**
 * Emit auction ended event
 */
async function emitAuctionEnded(eventId) {
  try {
    const io = getIO();
    const event = await AuctionEvent.findById(eventId)
      .populate('players', 'name role basePrice soldPrice status teamId')
      .populate('participatingTeams', 'name shortName logo');
    
    if (!event) {
      console.error('Event not found for auction:ended event');
      return;
    }

    // Get all sold players
    const soldPlayers = await Player.find({ 
      _id: { $in: event.players },
      status: 'sold'
    }).populate('teamId', 'name shortName');

    // Calculate stats
    const totalPlayers = event.players.length;
    const playersSold = soldPlayers.length;
    const totalAmountSpent = event.stats.totalAmountSpent || 0;
    const averagePlayerPrice = playersSold > 0 ? totalAmountSpent / playersSold : 0;

    // Find highest bid
    const Bid = require('../models/Bid');
    let highestBid = null;
    if (soldPlayers.length > 0) {
      const allBids = await Bid.find({ eventId, playerId: { $in: soldPlayers.map(p => p._id) } })
        .sort({ amount: -1 })
        .limit(1)
        .populate('playerId', 'name')
        .populate('teamId', 'name');
      
      if (allBids.length > 0) {
        highestBid = {
          playerId: allBids[0].playerId._id.toString(),
          playerName: allBids[0].playerId.name,
          teamId: allBids[0].teamId._id.toString(),
          teamName: allBids[0].teamId.name,
          amount: allBids[0].amount
        };
      }
    }

    // Find most expensive player
    let mostExpensivePlayer = null;
    if (soldPlayers.length > 0) {
      const sortedByPrice = soldPlayers.sort((a, b) => (b.soldPrice || 0) - (a.soldPrice || 0));
      const mostExpensive = sortedByPrice[0];
      mostExpensivePlayer = {
        playerId: mostExpensive._id.toString(),
        playerName: mostExpensive.name,
        teamId: mostExpensive.teamId?._id?.toString() || mostExpensive.teamId?.toString(),
        teamName: mostExpensive.teamId?.name || 'Unknown',
        price: mostExpensive.soldPrice || 0
      };
    }

    // Get team summaries
    const teamSummaries = [];
    const teamsMap = new Map();
    
    for (const player of soldPlayers) {
      const teamId = player.teamId?._id?.toString() || player.teamId?.toString();
      if (!teamId) continue;
      
      if (!teamsMap.has(teamId)) {
        const team = await Team.findById(teamId);
        if (team) {
          teamsMap.set(teamId, {
            teamId: team._id.toString(),
            teamName: team.name,
            playersCount: 0,
            totalSpent: 0,
            remainingBudget: team.remainingBudget || 0,
            players: []
          });
        }
      }
      
      const summary = teamsMap.get(teamId);
      if (summary) {
        summary.playersCount++;
        summary.totalSpent += player.soldPrice || 0;
        summary.players.push({
          playerId: player._id.toString(),
          playerName: player.name,
          price: player.soldPrice || 0
        });
      }
    }
    
    teamSummaries.push(...teamsMap.values());

    io.to(`auction:${eventId}`).emit('auction:ended', {
      auctionId: eventId,
      status: 'completed',
      endedAt: event.completedAt?.toISOString() || new Date().toISOString(),
      finalStats: {
        totalPlayers,
        playersSold,
        playersUnsold: totalPlayers - playersSold,
        totalAmountSpent,
        averagePlayerPrice,
        highestBid,
        mostExpensivePlayer
      },
      teamSummaries
    });
  } catch (error) {
    console.error('Error emitting auction ended event:', error);
  }
}

module.exports = {
  initializeSocket,
  getIO,
  emitBidReceived,
  emitPlayerUpdate,
  emitAuctionStatus,
  emitPlayerSold,
  emitPlayerUnsold,
  emitTeamBalanceUpdate,
  emitAvailablePlayersUpdate,
  emitEventUpdate,
  emitAuctionEnded
};

