const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema(
  {
    auctionEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionEvent',
      required: [true, 'Auction event ID is required'],
      index: true,
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: [true, 'Player ID is required'],
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: [true, 'Team ID is required'],
      index: true,
    },
    bidderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Bidder ID is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Bid amount is required'],
      min: [0, 'Bid amount cannot be negative'],
      validate: {
        validator: function(value) {
          // Amount should be positive
          return value > 0;
        },
        message: 'Bid amount must be greater than 0',
      },
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'accepted', 'outbid', 'winning', 'rejected'],
        message: 'Status must be one of: pending, accepted, outbid, winning, rejected',
      },
      default: 'pending',
      required: true,
      index: true,
    },
    isWinningBid: {
      type: Boolean,
      default: false,
      index: true,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },
    bidTime: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    outbidAt: {
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

// Compound indexes for efficient queries
bidSchema.index({ auctionEventId: 1, playerId: 1 });
bidSchema.index({ auctionEventId: 1, playerId: 1, isWinningBid: 1 });
bidSchema.index({ playerId: 1, status: 1 });
bidSchema.index({ teamId: 1, status: 1 });
bidSchema.index({ bidTime: -1 }); // For sorting by latest bids

// Unique constraint: Only one winning bid per player per auction
bidSchema.index(
  { auctionEventId: 1, playerId: 1, isWinningBid: 1 },
  {
    unique: true,
    partialFilterExpression: { isWinningBid: true },
  }
);

// Pre-save middleware to validate bid
bidSchema.pre('save', function(next) {
  // If bid is marked as winning, set status to winning
  if (this.isWinningBid) {
    this.status = 'winning';
  }
  next();
});

// Instance method to mark bid as winning
bidSchema.methods.markAsWinning = async function() {
  // First, mark all other winning bids for this player as outbid
  await mongoose.model('Bid').updateMany(
    {
      auctionEventId: this.auctionEventId,
      playerId: this.playerId,
      isWinningBid: true,
      _id: { $ne: this._id },
    },
    {
      $set: {
        isWinningBid: false,
        status: 'outbid',
        outbidAt: new Date(),
      },
    }
  );

  // Mark this bid as winning
  this.isWinningBid = true;
  this.status = 'winning';
  await this.save();
  return this;
};

// Instance method to mark bid as rejected
bidSchema.methods.markAsRejected = async function(reason) {
  this.status = 'rejected';
  this.rejectionReason = reason;
  this.isWinningBid = false;
  await this.save();
  return this;
};

// Static method to get current winning bid for a player
bidSchema.statics.getWinningBid = async function(auctionEventId, playerId) {
  return await this.findOne({
    auctionEventId,
    playerId,
    isWinningBid: true,
  })
    .populate('teamId', 'name shortName')
    .populate('bidderId', 'name email')
    .populate('playerId', 'name basePrice')
    .sort({ bidTime: -1 });
};

// Static method to get all bids for a player in an auction
bidSchema.statics.getPlayerBids = async function(auctionEventId, playerId) {
  return await this.find({
    auctionEventId,
    playerId,
  })
    .populate('teamId', 'name shortName logo')
    .populate('bidderId', 'name email')
    .sort({ bidTime: -1 });
};

// Static method to get highest bid amount for a player
bidSchema.statics.getHighestBidAmount = async function(auctionEventId, playerId) {
  const highestBid = await this.findOne({
    auctionEventId,
    playerId,
    status: { $in: ['accepted', 'winning'] },
  })
    .sort({ amount: -1 })
    .select('amount');

  return highestBid ? highestBid.amount : 0;
};

module.exports = mongoose.model('Bid', bidSchema);

