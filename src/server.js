const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth.routes');
const eventRoutes = require('./routes/events.routes');
const playerRoutes = require('./routes/players.routes');
const errorHandler = require('./middleware/error.middleware');
const { PORT, MONGODB_URI, CORS_ORIGIN } = require('./config/environment');

// Only import socket.io and scheduled tasks if not on Vercel
const isVercelEnv = process.env.VERCEL === '1' || process.env.VERCEL;
let initializeSocket, startScheduledChecker;

if (!isVercelEnv) {
  try {
    initializeSocket = require('./socket/socketServer').initializeSocket;
    startScheduledChecker = require('./utils/scheduledStart').startScheduledChecker;
  } catch (err) {
    console.warn('Could not load socket/scheduled tasks:', err.message);
  }
}

const app = express();
const httpServer = http.createServer(app);

// CORS - Manual headers to ensure all requests are allowed (FIRST MIDDLEWARE)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }
  next();
});

// CORS middleware (backup)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  exposedHeaders: ['Authorization'],
}));

app.use(express.json({ limit: '50mb' })); // Increased limit for large JSON payloads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files statically (only works in non-serverless environments)
// For Vercel, you'll need to use Vercel Blob Storage or similar
if (!process.env.VERCEL) {
  app.use('/uploads', express.static('uploads'));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'Cricket Auction API is running',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Middleware to ensure MongoDB connection for API routes (serverless)
if (isVercel) {
  app.use('/api', async (req, res, next) => {
    // Check MongoDB connection
    if (mongoose.connection.readyState === 0) {
      // Not connected, try to connect
      try {
        await connectDB();
      } catch (err) {
        return res.status(503).json({
          success: false,
          message: 'Database connection unavailable',
          error: 'Please try again in a moment'
        });
      }
    }
    
    // If connection is in progress, wait a bit
    if (mongoose.connection.readyState === 2) {
      // Connecting state, wait a moment
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    next();
  });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/teams', require('./routes/teams.routes'));
app.use('/api/bids', require('./routes/bids.routes'));

// TODO: Add other routes here
// app.use('/api/players', playerRoutes);
// app.use('/api/teams', teamRoutes);
// app.use('/api/auctions', auctionRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Check if running on Vercel (already set above)
const isVercel = isVercelEnv;

// MongoDB connection string - use from environment config
const MONGODB_URI_ACTUAL = MONGODB_URI;

// Connect to MongoDB
// For serverless, reuse existing connection if available
const connectDB = async () => {
  try {
    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      return; // Already connected
    }

    // Connect with shorter timeout for serverless
    await mongoose.connect(MONGODB_URI_ACTUAL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: isVercel ? 3000 : 5000,
      socketTimeoutMS: isVercel ? 3000 : 45000,
    });
    
    console.log(isVercel ? 'MongoDB Connected (Serverless)' : 'MongoDB Connected');
  } catch (err) {
    console.error('MongoDB Connection Error:', err.message);
    // Don't throw in serverless - let it retry on next request
    if (!isVercel) {
      console.error('MongoDB connection failed, exiting...');
      process.exit(1);
    }
    // In serverless, continue without connection - will retry on next request
  }
};

// Connect to MongoDB (non-blocking for serverless)
if (isVercel) {
  // For serverless, connect asynchronously without blocking
  connectDB().catch(err => {
    console.error('Initial MongoDB connection failed (will retry):', err.message);
  });
} else {
  // For regular server, connect synchronously
  connectDB();
}

// Only start HTTP server and Socket.io if NOT on Vercel
if (!isVercel) {
  // Initialize Socket.io (only for non-serverless)
  if (initializeSocket) {
    initializeSocket(httpServer);
    console.log('Socket.io initialized');
  }
  
  // Start scheduled start checker
  if (startScheduledChecker) {
    startScheduledChecker();
  }
  
  // Start server
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
