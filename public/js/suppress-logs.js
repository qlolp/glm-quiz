// Suppress debug logging in production
(function() {
    if (window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1' &&
        !window.location.hostname.includes('ngrok')) {
        window.console.log = function() {};
        window.console.warn = function() {};
    }
})();
