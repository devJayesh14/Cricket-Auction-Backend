/**
 * Timer Manager for Player Auctions
 * Manages timers for each player auction
 */

const timers = new Map(); // eventId -> timeoutId

/**
 * Set timer for player auction
 * @param {string} eventId - Event ID
 * @param {string} playerId - Player ID
 * @param {Function} callback - Callback to execute when timer expires
 * @param {number} duration - Timer duration in milliseconds (default: 60000 = 60 seconds)
 */
function setPlayerTimer(eventId, playerId, callback, duration = 60000) {
  // Clear existing timer for this event
  clearPlayerTimer(eventId);

  console.log(`Setting timer for event ${eventId}, player ${playerId}, duration: ${duration}ms`);
  
  // Set new timer with specified duration
  const timeoutId = setTimeout(async () => {
    console.log(`Timer expired for event ${eventId}, player ${playerId}`);
    timers.delete(eventId);
    try {
      await callback(eventId, playerId);
    } catch (error) {
      console.error('Error executing timer callback:', error);
    }
  }, duration);

  timers.set(eventId, { timeoutId, playerId });
  console.log(`Timer set successfully. Will expire in ${duration}ms`);
}

/**
 * Clear timer for event
 * @param {string} eventId - Event ID
 */
function clearPlayerTimer(eventId) {
  const timerData = timers.get(eventId);
  if (timerData) {
    clearTimeout(timerData.timeoutId);
    timers.delete(eventId);
  }
}

/**
 * Get remaining time for event
 * @param {Date} startTime - Start time from event
 * @returns {number} - Remaining seconds
 */
function getRemainingTime(startTime) {
  if (!startTime) return 60;
  const elapsed = Math.floor((new Date() - new Date(startTime)) / 1000);
  const remaining = Math.max(0, 60 - elapsed);
  return remaining;
}

module.exports = {
  setPlayerTimer,
  clearPlayerTimer,
  getRemainingTime
};

