const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const VERSION = (() => {
    try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, '../version.json'), 'utf8')).version;
    } catch {
        return 'unknown';
    }
})();

// On the VPS systemd unit PORT is 3002; locally it defaults to development.
const isProductionVPS = process.env.PORT === '3002' || process.env.NODE_ENV === 'production';
if (isProductionVPS) {
    process.env.NODE_ENV = 'production';
} else if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development';
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD environment variable is required');
}
if (isProductionVPS && !process.env.ADMIN_TOKEN_SECRET) {
    throw new Error('ADMIN_TOKEN_SECRET environment variable is required in production');
}
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || (() => {
    const secret = crypto.randomBytes(32).toString('hex');
    console.warn('Warning: ADMIN_TOKEN_SECRET not set, using a random secret. Sessions will not survive restart.');
    return secret;
})();

if (isProductionVPS && !process.env.USER_TOKEN_SECRET) {
    throw new Error('USER_TOKEN_SECRET environment variable is required in production');
}
const USER_TOKEN_SECRET = process.env.USER_TOKEN_SECRET || (() => {
    const secret = crypto.randomBytes(32).toString('hex');
    if (process.env.NODE_ENV !== 'production') {
        console.warn('Warning: USER_TOKEN_SECRET not set, using a random secret. Sessions will not survive restart.');
    }
    return secret;
})();

const SERVER_STARTED_AT = new Date().toISOString();
const SERVER_ROLE = process.env.SERVER_ROLE === 'alternative' ? 'alternative' : 'primary';
const PRIMARY_SERVER_URL = (process.env.PRIMARY_SERVER_URL || '').trim() || null;
const allowedOrigins = process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(',').map((origin) => origin.trim())
    : [];
const hstsEnabled = process.env.ENABLE_HSTS === '1';
const databasePath = process.env.DB_PATH || path.join(__dirname, 'quiz.db');
const trustProxy = process.env.TRUST_PROXY || ['loopback', '127.0.0.1'];

module.exports = {
    ADMIN_PASSWORD,
    ADMIN_TOKEN_SECRET,
    PORT,
    PRIMARY_SERVER_URL,
    SERVER_ROLE,
    SERVER_STARTED_AT,
    USER_TOKEN_SECRET,
    VERSION,
    allowedOrigins,
    databasePath,
    hstsEnabled,
    isProductionVPS,
    trustProxy
};
