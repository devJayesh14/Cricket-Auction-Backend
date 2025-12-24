const mongoose = require('mongoose');

/**
 * TeamEventBudget Model
 * Tracks budget allocation and spending for each team in each event
 * This allows teams to have separate budgets for different events
 */
const teamEventBudgetSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: [true, 'Team ID is required'],
      index: true,
    },
    auctionEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionEvent',
      required: [true, 'Auction event ID is required'],
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
  },
  {
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound index to ensure one budget per team per event
teamEventBudgetSchema.index({ teamId: 1, auctionEventId: 1 }, { unique: true });

// Pre-save middleware to calculate remaining budget
teamEventBudgetSchema.pre('save', function(next) {
  this.remainingBudget = this.budget - this.spent;
  next();
});

// Instance method to check if team can afford a bid in this event
teamEventBudgetSchema.methods.canAfford = function(bidAmount) {
  return this.remainingBudget >= bidAmount;
};

// Instance method to add player purchase and update spent
teamEventBudgetSchema.methods.addPurchase = async function(playerPrice) {
  if (!this.canAfford(playerPrice)) {
    throw new Error('Insufficient budget to purchase player in this event');
  }

  this.spent += playerPrice;
  this.remainingBudget = this.budget - this.spent;
  await this.save();
  return this;
};

// Static method to get or create team event budget
teamEventBudgetSchema.statics.getOrCreate = async function(teamId, eventId, defaultBudget) {
  let budget = await this.findOne({ teamId, auctionEventId: eventId });
  
  if (!budget) {
    budget = new this({
      teamId,
      auctionEventId: eventId,
      budget: defaultBudget || 10000, // Default ₹10k
      spent: 0,
      remainingBudget: defaultBudget || 10000
    });
    await budget.save();
  }
  
  return budget;
};

module.exports = mongoose.model('TeamEventBudget', teamEventBudgetSchema);

