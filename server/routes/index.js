const modules = [
    require('./questions'),
    require('./core'),
    require('./cases'),
    require('./question-admin'),
    require('./auth'),
    require('./seminar-admin'),
    require('./quiz'),
    require('./learning'),
    require('./admin'),
    require('./pages'),
];

function registerRoutes(context) {
    for (const register of modules) register(context);
}

module.exports = { registerRoutes };
