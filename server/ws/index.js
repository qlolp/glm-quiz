const registerShared = require('./shared');
const registerKahoot = require('./kahoot');
const registerPulse = require('./pulse');
const registerQa = require('./qa');

function attachWebSockets(context) {
    registerShared(context);
    registerKahoot(context);
    registerPulse(context);
    registerQa(context);
    return { wss: context.wss, heartbeatInterval: context.heartbeatInterval };
}

module.exports = { attachWebSockets };
