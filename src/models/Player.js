const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Player name is required'],
      trim: true,
      maxlength: [100, 'Player name cannot exceed 100 characters'],
      index: true,
    },
    age: {
      type: Number,
      required: [true, 'Age is required'],
      min: [16, 'Age must be at least 16'],
      max: [50, 'Age cannot exceed 50'],
    },
    role: {
      type: String,
      required: [true, 'Player role is required'],
      enum: {
        values: ['batsman', 'bowler', 'all-rounder', 'wicket-keeper', 'wicket-keeper-batsman'],
        message: 'Role must be one of: batsman, bowler, all-rounder, wicket-keeper, wicket-keeper-batsman',
      },
      index: true,
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Base price cannot be negative'],
    },
    currentPrice: {
      type: Number,
      default: null,
      min: [0, 'Current price cannot be negative'],
    },
    photo: {
      type: String,
      default: null,
      trim: true,
    },
    statistics: {
      matches: {
        type: Number,
        default: 0,
        min: [0, 'Matches cannot be negative'],
      },
      runs: {
        type: Number,
        default: 0,
        min: [0, 'Runs cannot be negative'],
      },
      wickets: {
        type: Number,
        default: 0,
        min: [0, 'Wickets cannot be negative'],
      },
      average: {
        type: Number,
        default: 0,
        min: [0, 'Average cannot be negative'],
      },
    },
    status: {
      type: String,
      enum: {
        values: ['available', 'sold', 'unsold', 'retired'],
        message: 'Status must be one of: available, sold, unsold, retired',
      },
      default: 'available',
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
      validate: {
        validator: function(value) {
          // Team ID is required only if player is sold
          if (this.status === 'sold') {
            return value != null;
          }
          return true;
        },
        message: 'Team ID is required when player status is sold',
      },
    },
    soldPrice: {
      type: Number,
      default: null,
      min: [0, 'Sold price cannot be negative'],
      validate: {
        validator: function(value) {
          // Sold price is required only if player is sold
          if (this.status === 'sold') {
            return value != null && value >= this.basePrice;
          }
          return true;
        },
        message: 'Sold price must be set and at least equal to base price when player is sold',
      },
    },
    auctionEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionEvent',
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
playerSchema.index({ name: 1 });
playerSchema.index({ role: 1 });
playerSchema.index({ status: 1 });
playerSchema.index({ teamId: 1 });
playerSchema.index({ auctionEventId: 1 });
playerSchema.index({ status: 1, teamId: 1 });

// Compound index for common queries
playerSchema.index({ status: 1, role: 1 });

// Pre-save middleware to set current price
playerSchema.pre('save', function(next) {
  // If player is sold and soldPrice is set, update currentPrice
  if (this.status === 'sold' && this.soldPrice != null) {
    this.currentPrice = this.soldPrice;
  }
  // If player is available, reset currentPrice to basePrice
  else if (this.status === 'available') {
    this.currentPrice = this.basePrice;
  }
  next();
});

// Instance method to mark player as sold
// NOTE: This method is kept for backward compatibility but doesn't change global status
// Player status remains 'available' so they can participate in multiple events
// Event-wise sold status is tracked via Bid model (winning bid = sold in that event)
playerSchema.methods.markAsSold = async function(teamId, soldPrice) {
  if (soldPrice < this.basePrice) {
    throw new Error('Sold price cannot be less than base price');
  }

  // Don't change global status - keep as 'available' for multi-event support
  // Only update soldPrice and currentPrice for reference
  // Event-wise sold status is tracked via Bid.isWinningBid
  this.soldPrice = soldPrice;
  this.currentPrice = soldPrice;
  // Note: teamId and status are NOT updated here - they're event-specific
  await this.save();
  return this;
};

// Instance method to mark player as unsold
playerSchema.methods.markAsUnsold = async function() {
  this.status = 'unsold';
  this.teamId = null;
  this.soldPrice = null;
  this.currentPrice = this.basePrice;
  await this.save();
  return this;
};

module.exports = mongoose.model('Player', playerSchema);

