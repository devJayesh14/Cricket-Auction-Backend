/**
 * Standalone Socket.io Server
 * Deploy this separately on Railway, Render, DigitalOcean, or any service that supports persistent connections
 * 
 * Usage:
 * 1. Deploy this file separately (not on Vercel)
 * 2. Set SOCKET_SERVER_URL environment variable in frontend to point to this server
 * 3. Set MONGODB_URI and JWT_SECRET environment variables
 */

require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('./src/models/User');
const AuctionEvent = require('./src/models/AuctionEvent');
const Player = require('./src/models/Player');
const Bid = require('./src/models/Bid');
const Team = require('./src/models/Team');
const TeamEventBudget = require('./src/models/TeamEventBudget');

const PORT = process.env.SOCKET_PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('MongoDB Connected for Socket.io server');
}).catch(err => {
  console.error('MongoDB Connection Error:', err);
  process.exit(1);
});

// Create HTTP server
const httpServer = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', service: 'socket-server' }));
    return;
  }
  
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow all origins (configure in production)
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  allowUpgrades: true
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
    
    if (!eventId) {
      socket.emit('auction:joined', {
        success: false,
        error: 'Event ID is required'
      });
      return;
    }
    
    const eventIdString = String(eventId);
    const room = `auction:${eventIdString}`;
    socket.join(room);
    console.log(`User ${socket.user.name} joined room: ${room}`);
      
    try {
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

  // Handle bid submission
  socket.on('bid:submit', async (data) => {
    const { eventId, playerId, amount } = data;
    
    try {
      const bidController = require('./src/controllers/bid.controller');
      const req = {
        user: { userId: socket.userId, role: socket.user.role },
        params: { id: eventId, playerId: playerId },
        body: { eventId, playerId, amount }
      };
      const res = {
        status: (code) => ({
          json: (data) => {
            if (code === 200 || code === 201) {
              socket.emit('bid:response', { success: true, data });
            } else {
              socket.emit('bid:response', { success: false, error: data.message || data.error });
            }
          }
        })
      };
      const next = (error) => {
        if (error) {
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

  // Handle player start
  socket.on('player:start', async (data) => {
    const { eventId, playerId } = data;
    
    if (socket.user.role !== 'admin' && socket.user.role !== 'auctioneer') {
      socket.emit('player:start:response', {
        success: false,
        error: 'Unauthorized: Only admin/auctioneer can start player auction'
      });
      return;
    }

    try {
      const eventController = require('./src/controllers/event.controller');
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

// Start server
httpServer.listen(PORT, () => {
  console.log(`Socket.io server running on port ${PORT}`);
  console.log(`CORS enabled for all origins`);
});

// Export for testing
module.exports = { io, httpServer };

