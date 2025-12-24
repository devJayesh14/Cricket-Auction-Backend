/**
 * Pure JavaScript Auction Bidding Rules Logic
 * No Express dependencies - reusable business logic
 */

// ============================================
// CONSTANTS
// ============================================

const AUCTION_CONSTANTS = {
  TIMER_SECONDS: 10,
  BASE_PRICE: 20,
  MAX_BID_PER_PLAYER: 2000, // Max bid ₹2000
  MAX_PLAYERS_PER_TEAM: 10,
  DEFAULT_OWNER_BALANCE: 1000,
  TIMER_BEFORE_FIRST_BID: 20, // 20 seconds before first bid
  TIMER_AFTER_FIRST_BID: 20, // 20 seconds after first bid
  
  // Bid increment rules: [min, max] -> increment
  INCREMENT_RULES: [
    { min: 20, max: 50, increment: 5 },
    { min: 50, max: 100, increment: 10 },
    { min: 100, max: Infinity, increment: 15 },
  ],
};

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Calculates the next valid bid amount based on current bid and increment rules
 * @param {number} currentBid - Current highest bid (or base price if no bids)
 * @returns {number|null} - Next valid bid amount, or null if max bid reached
 */
function getNextBidAmount(currentBid = null) {
  const basePrice = currentBid || AUCTION_CONSTANTS.BASE_PRICE;
  
  // Check if max bid already reached
  if (basePrice >= AUCTION_CONSTANTS.MAX_BID_PER_PLAYER) {
    return null;
  }
  
  // Find applicable increment rule
  const rule = AUCTION_CONSTANTS.INCREMENT_RULES.find(
    (r) => basePrice >= r.min && basePrice < r.max
  );
  
  if (!rule) {
    // Fallback: use the highest increment rule
    const highestRule = AUCTION_CONSTANTS.INCREMENT_RULES[
      AUCTION_CONSTANTS.INCREMENT_RULES.length - 1
    ];
    return Math.min(basePrice + highestRule.increment, AUCTION_CONSTANTS.MAX_BID_PER_PLAYER);
  }
  
  const nextBid = basePrice + rule.increment;
  
  // Ensure we don't exceed max bid
  return Math.min(nextBid, AUCTION_CONSTANTS.MAX_BID_PER_PLAYER);
}

/**
 * Validates if a bid can be placed
 * @param {number} bidAmount - The bid amount to validate
 * @param {number} currentBid - Current highest bid (or base price)
 * @param {number} ownerBalance - Owner's remaining balance
 * @param {number} teamPlayerCount - Current number of players in team
 * @param {Object} options - Additional validation options
 * @param {number} options.currentBidAmount - Current bid amount (if different from currentBid)
 * @param {boolean} options.isOwnerBidding - Whether the owner is placing the bid
 * @returns {Object} - { valid: boolean, reason: string }
 */
function canPlaceBid(
  bidAmount,
  currentBid = AUCTION_CONSTANTS.BASE_PRICE,
  ownerBalance = AUCTION_CONSTANTS.DEFAULT_OWNER_BALANCE,
  teamPlayerCount = 0,
  options = {}
) {
  const {
    currentBidAmount = currentBid,
    isOwnerBidding = false,
  } = options;
  
  // Validation 1: Bid must be a positive number
  if (typeof bidAmount !== 'number' || bidAmount <= 0 || !Number.isFinite(bidAmount)) {
    return {
      valid: false,
      reason: 'Bid amount must be a positive number',
    };
  }
  
  // Validation 2: Check if max bid per player is exceeded
  if (bidAmount > AUCTION_CONSTANTS.MAX_BID_PER_PLAYER) {
    return {
      valid: false,
      reason: `Maximum bid per player is ${AUCTION_CONSTANTS.MAX_BID_PER_PLAYER}`,
    };
  }
  
  // Validation 3: Check if bid is higher than current bid
  const minimumRequiredBid = getNextBidAmount(currentBidAmount);
  
  if (minimumRequiredBid === null) {
    return {
      valid: false,
      reason: 'Maximum bid for this player has already been reached',
    };
  }
  
  if (bidAmount < minimumRequiredBid) {
    return {
      valid: false,
      reason: `Bid must be at least ${minimumRequiredBid} (current: ${currentBidAmount}, increment: ${minimumRequiredBid - currentBidAmount})`,
    };
  }
  
  // Validation 4: Check if bid follows increment rules exactly (optional strict validation)
  // Allow bids that are valid increments
  const expectedNextBid = getNextBidAmount(currentBidAmount);
  if (bidAmount !== expectedNextBid && bidAmount < expectedNextBid) {
    return {
      valid: false,
      reason: `Bid must follow increment rules. Next valid bid is ${expectedNextBid}`,
    };
  }
  
  // Validation 5: Check if owner has sufficient balance
  if (bidAmount > ownerBalance) {
    return {
      valid: false,
      reason: `Insufficient balance. Required: ${bidAmount}, Available: ${ownerBalance}`,
    };
  }
  
  // Validation 6: Check if team has reached max players
  if (teamPlayerCount >= AUCTION_CONSTANTS.MAX_PLAYERS_PER_TEAM) {
    return {
      valid: false,
      reason: `Team has reached maximum player limit of ${AUCTION_CONSTANTS.MAX_PLAYERS_PER_TEAM}`,
    };
  }
  
  // Validation 7: Check if bid exceeds remaining balance after considering current commitment
  // (if owner already has a winning bid, they need balance for that too)
  if (isOwnerBidding) {
    // This is a simplified check - in real scenario, you'd check all pending/winning bids
    if (bidAmount > ownerBalance) {
      return {
        valid: false,
        reason: 'Insufficient balance to place this bid',
      };
    }
  }
  
  return {
    valid: true,
    reason: 'Bid is valid',
  };
}

/**
 * Finalizes player sale and updates team/player state
 * @param {Object} player - Player object to finalize
 * @param {Object} team - Team object purchasing the player
 * @param {number} bidAmount - Final bid amount
 * @returns {Object} - { success: boolean, updatedPlayer: Object, updatedTeam: Object, error: string }
 */
function finalizePlayer(player, team, bidAmount) {
  // Validate inputs
  if (!player || typeof player !== 'object') {
    return {
      success: false,
      error: 'Invalid player object',
    };
  }
  
  if (!team || typeof team !== 'object') {
    return {
      success: false,
      error: 'Invalid team object',
    };
  }
  
  if (typeof bidAmount !== 'number' || bidAmount <= 0 || !Number.isFinite(bidAmount)) {
    return {
      success: false,
      error: 'Invalid bid amount',
    };
  }
  
  // Validation 1: Check if player is available
  if (player.status && player.status !== 'available') {
    return {
      success: false,
      error: `Player is not available for purchase. Current status: ${player.status}`,
    };
  }
  
  // Validation 2: Check if team can afford the bid
  const teamBalance = team.remainingBudget !== undefined 
    ? team.remainingBudget 
    : (team.budget || 0) - (team.spent || 0);
  
  if (bidAmount > teamBalance) {
    return {
      success: false,
      error: `Team cannot afford this player. Required: ${bidAmount}, Available: ${teamBalance}`,
    };
  }
  
  // Validation 3: Check if team has space for more players
  const currentPlayerCount = Array.isArray(team.players) 
    ? team.players.length 
    : (team.playerCount || 0);
  
  if (currentPlayerCount >= AUCTION_CONSTANTS.MAX_PLAYERS_PER_TEAM) {
    return {
      success: false,
      error: `Team has reached maximum player limit of ${AUCTION_CONSTANTS.MAX_PLAYERS_PER_TEAM}`,
    };
  }
  
  // Validation 4: Check if bid amount is valid (at least base price, not exceeding max)
  if (bidAmount < (player.basePrice || AUCTION_CONSTANTS.BASE_PRICE)) {
    return {
      success: false,
      error: `Bid amount must be at least the base price of ${player.basePrice || AUCTION_CONSTANTS.BASE_PRICE}`,
    };
  }
  
  if (bidAmount > AUCTION_CONSTANTS.MAX_BID_PER_PLAYER) {
    return {
      success: false,
      error: `Bid amount exceeds maximum allowed bid of ${AUCTION_CONSTANTS.MAX_BID_PER_PLAYER}`,
    };
  }
  
  // Create updated player object
  const updatedPlayer = {
    ...player,
    status: 'sold',
    soldPrice: bidAmount,
    currentPrice: bidAmount,
    teamId: team._id || team.id,
  };
  
  // Create updated team object
  const currentSpent = team.spent || 0;
  const updatedTeam = {
    ...team,
    spent: currentSpent + bidAmount,
    remainingBudget: teamBalance - bidAmount,
    players: Array.isArray(team.players) 
      ? [...team.players, player._id || player.id]
      : [player._id || player.id],
  };
  
  // Add player count if not in players array
  if (!Array.isArray(team.players)) {
    updatedTeam.playerCount = (team.playerCount || 0) + 1;
  }
  
  return {
    success: true,
    updatedPlayer,
    updatedTeam,
    message: `Player ${player.name || 'Unknown'} sold to ${team.name || 'Unknown'} for ${bidAmount}`,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Gets the increment amount for a given bid amount
 * @param {number} currentBid - Current bid amount
 * @returns {number} - Increment amount
 */
function getIncrementAmount(currentBid) {
  const nextBid = getNextBidAmount(currentBid);
  if (nextBid === null) return 0;
  return nextBid - (currentBid || AUCTION_CONSTANTS.BASE_PRICE);
}

/**
 * Validates bid amount against increment rules
 * @param {number} bidAmount - Bid amount to validate
 * @param {number} currentBid - Current highest bid
 * @returns {boolean} - True if bid follows increment rules
 */
function isValidIncrement(bidAmount, currentBid) {
  const expectedNext = getNextBidAmount(currentBid);
  if (expectedNext === null) return false;
  
  // Allow exact increment or higher (but should be validated separately for max)
  return bidAmount >= expectedNext;
}

/**
 * Timer utility - calculates remaining time
 * @param {Date} startTime - Auction start time for current player
 * @returns {number} - Remaining seconds
 */
function getRemainingTime(startTime) {
  if (!startTime || !(startTime instanceof Date)) {
    return AUCTION_CONSTANTS.TIMER_SECONDS;
  }
  
  const elapsed = Math.floor((new Date() - startTime) / 1000);
  const remaining = Math.max(0, AUCTION_CONSTANTS.TIMER_SECONDS - elapsed);
  
  return remaining;
}

/**
 * Checks if timer has expired
 * @param {Date} startTime - Auction start time for current player
 * @returns {boolean} - True if timer has expired
 */
function isTimerExpired(startTime) {
  return getRemainingTime(startTime) === 0;
}

/**
 * Resets constants (useful for testing or configuration)
 * @param {Object} newConstants - New constant values
 */
function setConstants(newConstants) {
  Object.assign(AUCTION_CONSTANTS, newConstants);
}

/**
 * Gets current constants (for reference)
 * @returns {Object} - Copy of current constants
 */
function getConstants() {
  return { ...AUCTION_CONSTANTS };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Core functions
  getNextBidAmount,
  canPlaceBid,
  finalizePlayer,
  
  // Utility functions
  getIncrementAmount,
  isValidIncrement,
  getRemainingTime,
  isTimerExpired,
  
  // Configuration
  setConstants,
  getConstants,
  
  // Constants (read-only access)
  CONSTANTS: Object.freeze({ ...AUCTION_CONSTANTS }),
};

