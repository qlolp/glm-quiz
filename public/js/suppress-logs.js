// Suppress verbose debug logging in production, but keep warn+error for diagnostics
(function() {
    if (window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1' &&
        !window.location.hostname.includes('ngrok')) {
        window.console.log = function() {};
        // Keep console.warn and console.error active for debugging during seminar
    }
})();
