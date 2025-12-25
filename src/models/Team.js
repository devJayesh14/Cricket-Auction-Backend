const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Team name is required'],
      unique: true,
      trim: true,
      maxlength: [100, 'Team name cannot exceed 100 characters'],
      index: true,
    },
    shortName: {
      type: String,
      required: [true, 'Team short name is required'],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [10, 'Short name cannot exceed 10 characters'],
    },
    logo: {
      type: String,
      default: null,
      trim: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    budget: {
      type: Number,
      required: [true, 'Budget is required'],
      min: [0, 'Budget cannot be negative'],
      default: 0,
    },
    spent: {
      type: Number,
      default: 0,
      min: [0, 'Spent amount cannot be negative'],
      validate: {
        validator: function(value) {
          return value <= this.budget;
        },
        message: 'Spent amount cannot exceed budget',
      },
    },
    remainingBudget: {
      type: Number,
      default: 0,
    },
    players: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
      },
    ],
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'suspended'],
        message: 'Status must be either active, inactive, or suspended',
      },
      default: 'active',
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
teamSchema.index({ name: 1 });
// Sparse index on ownerId - only indexes non-null values, allowing multiple nulls
teamSchema.index({ ownerId: 1 }, { sparse: true });
teamSchema.index({ status: 1 });

// Pre-save middleware to calculate remaining budget
teamSchema.pre('save', function(next) {
  this.remainingBudget = this.budget - this.spent;
  next();
});

// Instance method to check if team can afford a bid
teamSchema.methods.canAfford = function(bidAmount) {
  return this.remainingBudget >= bidAmount && this.status === 'active';
};

// Instance method to add player and update spent
teamSchema.methods.addPlayer = async function(playerId, playerPrice) {
  if (!this.canAfford(playerPrice)) {
    throw new Error('Insufficient budget to purchase player');
  }

  this.players.push(playerId);
  this.spent += playerPrice;
  this.remainingBudget = this.budget - this.spent;
  await this.save();
  return this;
};

module.exports = mongoose.model('Team', teamSchema);

