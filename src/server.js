const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth.routes');
const eventRoutes = require('./routes/events.routes');
const playerRoutes = require('./routes/players.routes');
const errorHandler = require('./middleware/error.middleware');
const { PORT, MONGODB_URI, CORS_ORIGIN } = require('./config/environment');
const { initializeSocket } = require('./socket/socketServer');
const { startScheduledChecker } = require('./utils/scheduledStart');

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
    message: 'Cricket Auction API is running'
  });
});

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

// Check if running on Vercel
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL;

// MongoDB connection string - use from environment config
const MONGODB_URI_ACTUAL = MONGODB_URI;

// Connect to MongoDB
// For serverless, reuse existing connection if available
if (mongoose.connection.readyState === 0) {
  mongoose.connect(MONGODB_URI_ACTUAL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  })
  .then(() => {
    console.log(isVercel ? 'MongoDB Connected (Serverless)' : 'MongoDB Connected');
  })
  .catch(err => {
    console.error('MongoDB Connection Error:', err);
    // Don't throw in serverless - let it retry on next request
    if (!isVercel) {
      process.exit(1);
    }
  });
}

// Only start HTTP server and Socket.io if NOT on Vercel
if (!isVercel) {
  // Initialize Socket.io (only for non-serverless)
  initializeSocket(httpServer);
  console.log('Socket.io initialized');
  
  // Start scheduled start checker
  startScheduledChecker();
  
  // Start server
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
