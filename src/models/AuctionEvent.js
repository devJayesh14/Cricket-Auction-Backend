const mongoose = require('mongoose');

const auctionEventSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Auction event name is required'],
      trim: true,
      maxlength: [200, 'Auction name cannot exceed 200 characters'],
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
      validate: {
        validator: function(value) {
          // Skip validation if event is already live or completed
          if (this.status === 'live' || this.status === 'completed' || this.status === 'paused') {
            return true;
          }
          return value > new Date();
        },
        message: 'Start date must be in the future',
      },
    },
    endDate: {
      type: Date,
      default: null,
      validate: {
        validator: function(value) {
          if (value != null) {
            return value > this.startDate;
          }
          return true;
        },
        message: 'End date must be after start date',
      },
    },
    status: {
      type: String,
      enum: {
        values: ['draft', 'scheduled', 'live', 'paused', 'completed', 'cancelled'],
        message: 'Status must be one of: draft, scheduled, live, paused, completed, cancelled',
      },
      default: 'draft',
      required: true,
      index: true,
    },
    players: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
      },
    ],
    participatingTeams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
      },
    ],
    currentPlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      default: null,
    },
    currentPlayerStartTime: {
      type: Date,
      default: null,
    },
    currentCategory: {
      type: String,
      enum: ['batsman', 'bowler', 'all-rounder'],
      default: 'batsman',
    },
    settings: {
      bidIncrement: {
        type: Number,
        default: 50, // ₹50 minimum increment
        min: [50, 'Bid increment must be at least ₹50'],
      },
      bidTimer: {
        type: Number,
        default: 60, // 60 seconds
        min: [10, 'Bid timer must be at least 10 seconds'],
        max: [300, 'Bid timer cannot exceed 300 seconds'],
      },
      startingBudget: {
        type: Number,
        default: 10000, // 10k default
        min: [0, 'Starting budget cannot be negative'],
      },
      autoMode: {
        type: Boolean,
        default: true, // Auto mode enabled by default
      },
    },
    stats: {
      totalPlayers: {
        type: Number,
        default: 0,
        min: [0, 'Total players cannot be negative'],
      },
      playersSold: {
        type: Number,
        default: 0,
        min: [0, 'Players sold cannot be negative'],
      },
      playersUnsold: {
        type: Number,
        default: 0,
        min: [0, 'Players unsold cannot be negative'],
      },
      totalAmountSpent: {
        type: Number,
        default: 0,
        min: [0, 'Total amount spent cannot be negative'],
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Auction creator is required'],
    },
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
auctionEventSchema.index({ name: 1 });
auctionEventSchema.index({ status: 1 });
auctionEventSchema.index({ startDate: 1 });
auctionEventSchema.index({ createdBy: 1 });
auctionEventSchema.index({ currentPlayerId: 1 });
auctionEventSchema.index({ status: 1, startDate: 1 });

// Virtual for duration (if completed)
auctionEventSchema.virtual('duration').get(function() {
  if (this.startedAt && this.completedAt) {
    return Math.floor((this.completedAt - this.startedAt) / 1000 / 60); // in minutes
  }
  return null;
});

// Pre-save middleware to update stats
auctionEventSchema.pre('save', function(next) {
  // Update total players count
  if (this.isModified('players')) {
    this.stats.totalPlayers = this.players.length;
  }
  next();
});

// Instance method to start auction
auctionEventSchema.methods.startAuction = async function(userId) {
  if (this.status !== 'draft' && this.status !== 'scheduled') {
    throw new Error('Auction can only be started from draft or scheduled status');
  }

  if (this.players.length === 0) {
    throw new Error('Cannot start auction without players');
  }

  this.status = 'live';
  this.startedBy = userId;
  this.startedAt = new Date();
  await this.save();
  return this;
};

// Instance method to pause auction
auctionEventSchema.methods.pauseAuction = async function() {
  if (this.status !== 'live') {
    throw new Error('Only live auctions can be paused');
  }

  this.status = 'paused';
  await this.save();
  return this;
};

// Instance method to resume auction
auctionEventSchema.methods.resumeAuction = async function() {
  if (this.status !== 'paused') {
    throw new Error('Only paused auctions can be resumed');
  }

  this.status = 'live';
  await this.save();
  return this;
};

// Instance method to complete auction
auctionEventSchema.methods.completeAuction = async function() {
  if (this.status !== 'live' && this.status !== 'paused') {
    throw new Error('Only live or paused auctions can be completed');
  }

  this.status = 'completed';
  this.completedAt = new Date();
  if (!this.endDate) {
    this.endDate = this.completedAt;
  }
  await this.save();
  return this;
};

// Instance method to update stats after player sold
auctionEventSchema.methods.updatePlayerSold = async function(playerPrice) {
  this.stats.playersSold += 1;
  this.stats.totalAmountSpent += playerPrice;
  await this.save();
  return this;
};

// Instance method to update stats after player unsold
auctionEventSchema.methods.updatePlayerUnsold = async function() {
  this.stats.playersUnsold += 1;
  await this.save();
  return this;
};

module.exports = mongoose.model('AuctionEvent', auctionEventSchema);

