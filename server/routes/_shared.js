// shared state module for routes
// BUG-13: in-memory tracker for asked question IDs in adaptive mode
// Prevents duplicates during rapid-fire /next calls
const inMemoryAskedTracker = new Map();

module.exports = { inMemoryAskedTracker };
