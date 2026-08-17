// Shared in-memory maps for Kahoot / Pulse / Q&A so HTTP lookup can see live rooms.
const gameSessions = new Map();
const playerConnections = new Map();
const pulseSessions = new Map();
const qaSessions = new Map();

module.exports = {
    gameSessions,
    playerConnections,
    pulseSessions,
    qaSessions
};
