/**
 * GLM Quiz App - Enhanced Social Services Knowledge Platform
 * Backend Server with Express and SQLite
 * Features: Analytics, Gamification, Learning Mode, Case Studies
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const WebSocket = require('ws');
const {
    ADMIN_PASSWORD,
    ADMIN_TOKEN_SECRET,
    PORT,
    PRIMARY_SERVER_URL,
    SERVER_ROLE,
    SERVER_STARTED_AT,
    USER_TOKEN_SECRET,
    VERSION,
    allowedOrigins,
    hstsEnabled,
    isProductionVPS,
    trustProxy
} = require('./config');
const { createAuth } = require('./auth');
const { createApp } = require('./app');

const app = createApp({ allowedOrigins, hstsEnabled, isProductionVPS, trustProxy });

const {
    adminGuideCookie,
    generateAdminToken,
    generateUserToken,
    getAdminTokenFromRequest,
    requireAdmin,
    requireOwner,
    requireUser,
    verifyAdminPassword,
    verifyAdminToken
} = createAuth({
    adminPassword: ADMIN_PASSWORD,
    adminTokenSecret: ADMIN_TOKEN_SECRET,
    userTokenSecret: USER_TOKEN_SECRET
});

// Suppress debug logging in production (errors are still logged)
if (process.env.NODE_ENV === 'production') {
    console.log = () => {};
    console.warn = () => {};
}

// Simple in-memory cache with TTL and size limits
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 500;

function getCache(key) {
    const item = cache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL) {
        // Move to end (LRU)
        cache.delete(key);
        cache.set(key, item);
        return item.data;
    }
    cache.delete(key);
    return null;
}

function setCache(key, data) {
    // Evict oldest entries if cache is full
    if (cache.size >= CACHE_MAX_SIZE && !cache.has(key)) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, { data, timestamp: Date.now() });
}

function cleanupCache() {
    const now = Date.now();
    for (const [key, item] of cache) {
        if (now - item.timestamp >= CACHE_TTL) {
            cache.delete(key);
        }
    }
}

// Periodic cache cleanup every 60 seconds
setInterval(cleanupCache, 60 * 1000);

// In-memory verification codes for demo/seminar mode (email -> { code, expiresAt })
const verificationCodes = new Map();
const VERIFICATION_CODE_TTL = 10 * 60 * 1000; // 10 minutes

function generateVerificationCode() {
    // 6-digit code: 10^6 combinations, ~17 hours to brute-force at 10/min
    return String(Math.floor(100000 + Math.random() * 900000));
}

function storeVerificationCode(email) {
    cleanupVerificationCodes();
    const code = generateVerificationCode();
    verificationCodes.set(email.toLowerCase(), { code, expiresAt: Date.now() + VERIFICATION_CODE_TTL });
    return code;
}

function verifyCode(email, code) {
    const record = verificationCodes.get(email.toLowerCase());
    if (!record) return false;
    if (record.expiresAt < Date.now()) {
        verificationCodes.delete(email.toLowerCase());
        return false;
    }
    // Optional demo/seminar master code.
    // In production it is disabled unless ALLOW_DEMO_MASTER_IN_PRODUCTION=true
    // and the code itself is strong (>=16 chars) to prevent trivial bypass.
    const masterCode = process.env.DEMO_MASTER_CODE;
    if (masterCode && code === masterCode) {
        if (!isProductionVPS) return true;
        if (process.env.ALLOW_DEMO_MASTER_IN_PRODUCTION === 'true' && masterCode.length >= 16) {
            return true;
        }
    }
    return record.code === code;
}

function cleanupVerificationCodes() {
    const now = Date.now();
    for (const [email, record] of verificationCodes) {
        if (record.expiresAt < now) {
            verificationCodes.delete(email);
        }
    }
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeLike(str) {
    return String(str).replace(/[%_]/g, '\\$&');
}

function sanitizeString(value, maxLength = 255) {
    if (value === null || value === undefined) return null;
    let str = String(value).trim();
    if (str === '') return null;
    // Strip HTML tags to prevent stored XSS (display_name, username, etc.)
    str = str.replace(/<[^>]*>/g, '');
    return str.slice(0, maxLength);
}

const { db, PREPOST_QUESTION_IDS } = require('./db');


// Rate limiting: sliding window counter per IP
const rateLimiter = new Map();
const RATE_LIMIT = 200;
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(ip) {
    const now = Date.now();
    const record = rateLimiter.get(ip) || { count: 0, windowStart: now };

    if (now - record.windowStart >= RATE_WINDOW) {
        record.count = 0;
        record.windowStart = now;
    }

    if (record.count >= RATE_LIMIT) return false;
    record.count++;
    rateLimiter.set(ip, record);
    return true;
}

function cleanupRateLimiter() {
    const now = Date.now();
    for (const [ip, record] of rateLimiter) {
        if (now - record.windowStart >= RATE_WINDOW) {
            rateLimiter.delete(ip);
        }
    }
}

// Periodic rate limiter cleanup every 5 minutes
setInterval(cleanupRateLimiter, 5 * 60 * 1000);

function getClientIp(req) {
    return req.ip || req.connection.remoteAddress || 'unknown';
}

function rateLimitMiddleware(req, res, next) {
    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
        const record = rateLimiter.get(ip);
        const retryAfter = record ? Math.ceil((RATE_WINDOW - (Date.now() - record.windowStart)) / 1000) : 60;
        res.setHeader('Retry-After', String(retryAfter));
        res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT));
        res.setHeader('X-RateLimit-Remaining', '0');
        return res.status(429).json({ error: 'Too many requests', retry_after: retryAfter });
    }
    next();
}

// Stricter rate limiting for certificate lookup endpoints (brute-force protection)
const certRateLimiter = new Map();
const CERT_RATE_LIMIT = 10;
const CERT_RATE_WINDOW = 60 * 1000;

function checkCertRateLimit(ip) {
    const now = Date.now();
    const record = certRateLimiter.get(ip) || { count: 0, windowStart: now };

    if (now - record.windowStart >= CERT_RATE_WINDOW) {
        record.count = 0;
        record.windowStart = now;
    }

    if (record.count >= CERT_RATE_LIMIT) return false;
    record.count++;
    certRateLimiter.set(ip, record);
    return true;
}

function certRateLimitMiddleware(req, res, next) {
    const ip = getClientIp(req);
    if (!checkCertRateLimit(ip)) {
        return res.status(429).json({ error: 'Too many certificate lookup requests' });
    }
    next();
}

// Rate limit for feedback and check-answer (spam protection)
const feedbackRateLimiter = new Map();
const FEEDBACK_RATE_LIMIT = 120;
const FEEDBACK_RATE_WINDOW = 60 * 1000;

function checkFeedbackRateLimit(ip) {
    const now = Date.now();
    const record = feedbackRateLimiter.get(ip) || { count: 0, windowStart: now };
    if (now - record.windowStart >= FEEDBACK_RATE_WINDOW) {
        record.count = 0;
        record.windowStart = now;
    }
    if (record.count >= FEEDBACK_RATE_LIMIT) return false;
    record.count++;
    feedbackRateLimiter.set(ip, record);
    return true;
}

function feedbackRateLimitMiddleware(req, res, next) {
    const ip = getClientIp(req);
    if (!checkFeedbackRateLimit(ip)) {
        return res.status(429).json({ error: 'Too many requests' });
    }
    next();
}

// P0-3: Rate limit for user creation (anti-spam)
// Raised from 5/hour to 60/hour: seminar participants share NAT addresses,
// 5/hour blocked entire classes behind one IP (BUG-05).
const userCreationLimiter = new Map();
const USER_CREATION_LIMIT = 60;  // 60 registrations per IP per hour
const USER_CREATION_WINDOW = 60 * 60 * 1000;

function checkUserCreationRateLimit(ip) {
    const now = Date.now();
    const record = userCreationLimiter.get(ip) || { count: 0, windowStart: now };
    if (now - record.windowStart >= USER_CREATION_WINDOW) {
        record.count = 0;
        record.windowStart = now;
    }
    if (record.count >= USER_CREATION_LIMIT) {
        const retryAfter = Math.ceil((USER_CREATION_WINDOW - (now - record.windowStart)) / 1000);
        return { allowed: false, retryAfter };
    }
    record.count++;
    userCreationLimiter.set(ip, record);
    return { allowed: true };
}

function userCreationRateLimitMiddleware(req, res, next) {
    // P0-3: bypass for E2E tests to avoid rate-limit interference
    if (process.env.DISABLE_USER_RATE_LIMIT === '1') {
        return next();
    }
    const ip = getClientIp(req);
    const result = checkUserCreationRateLimit(ip);
    if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfter));
        res.setHeader('X-RateLimit-Limit', String(USER_CREATION_LIMIT));
        res.setHeader('X-RateLimit-Remaining', '0');
        return res.status(429).json({
            error: 'Registration limit reached. Try again in ' + Math.ceil(result.retryAfter / 60) + ' minutes.',
            retry_after: result.retryAfter
        });
    }
    next();
}

// P1-4: Strict rate limit for admin auth (anti-brute-force)
const adminAuthLimiter = new Map();
const ADMIN_AUTH_LIMIT = 3;  // 3 attempts per IP per minute
const ADMIN_AUTH_WINDOW = 60 * 1000;

function checkAdminAuthRateLimit(ip) {
    const now = Date.now();
    const record = adminAuthLimiter.get(ip) || { count: 0, windowStart: now };
    if (now - record.windowStart >= ADMIN_AUTH_WINDOW) {
        record.count = 0;
        record.windowStart = now;
    }
    if (record.count >= ADMIN_AUTH_LIMIT) {
        const retryAfter = Math.ceil((ADMIN_AUTH_WINDOW - (now - record.windowStart)) / 1000);
        return { allowed: false, retryAfter };
    }
    record.count++;
    adminAuthLimiter.set(ip, record);
    return { allowed: true };
}

function adminAuthRateLimitMiddleware(req, res, next) {
    // P1-4: bypass for E2E tests
    if (process.env.DISABLE_USER_RATE_LIMIT === '1') {
        return next();
    }
    const ip = getClientIp(req);
    const result = checkAdminAuthRateLimit(ip);
    if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfter));
        return res.status(429).json({
            error: 'Too many admin auth attempts. Try again in ' + result.retryAfter + ' seconds.',
            retry_after: result.retryAfter
        });
    }
    next();
}

function formatPublicQuestionRow(q) {
    return {
        id: q.id,
        question: q.question || q.question_text,
        options: Array.isArray(q.options)
            ? q.options
            : [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean),
        category: q.category || 'general',
        difficulty: q.difficulty || 'medium',
        hint: q.hint || null
    };
}

function formatSpacedRepCard(row) {
    const base = formatPublicQuestionRow(row);
    return {
        ...base,
        id: row.question_id || row.id,
        interval: row.interval,
        ease_factor: row.ease_factor,
        repetitions: row.repetitions
    };
}

function cleanupCertRateLimiter() {
    const now = Date.now();
    for (const [ip, record] of certRateLimiter) {
        if (now - record.windowStart >= CERT_RATE_WINDOW) {
            certRateLimiter.delete(ip);
        }
    }
}

// Periodic certificate rate limiter cleanup every 5 minutes
setInterval(cleanupCertRateLimiter, 5 * 60 * 1000);

// Apply rate limiting to all mutating API endpoints
app.use('/api/', (req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        return rateLimitMiddleware(req, res, next);
    }
    next();
});

const routeContext = {
    app, db, PREPOST_QUESTION_IDS,
    ADMIN_PASSWORD, PORT, PRIMARY_SERVER_URL, SERVER_ROLE, SERVER_STARTED_AT, VERSION,
    allowedOrigins, isProductionVPS,
    adminGuideCookie, generateAdminToken, generateUserToken, getAdminTokenFromRequest,
    requireAdmin, requireOwner, requireUser, verifyAdminPassword, verifyAdminToken,
    cache, getCache, setCache, verificationCodes, storeVerificationCode, verifyCode,
    escapeHtml, escapeLike, sanitizeString,
    certRateLimitMiddleware, feedbackRateLimitMiddleware,
    userCreationRateLimitMiddleware, adminAuthRateLimitMiddleware,
    formatPublicQuestionRow, formatSpacedRepCard,
    crypto, path, fs,
    wss: null
};
require('./routes').registerRoutes(routeContext);

// ========== WEBSOCKET SERVER ==========
const server = http.createServer(app);
const wsContext = { server, WebSocket, isProductionVPS, allowedOrigins, db, crypto, escapeHtml };
const { wss, heartbeatInterval } = require('./ws').attachWebSockets(wsContext);
routeContext.wss = wss;


// Start server
server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║              GLM Quiz App - Enhanced Edition                      ║
╠══════════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                     ║
║  WebSocket: Enabled                                               ║
║  Environment: ${process.env.NODE_ENV || 'development'}            ║
╠══════════════════════════════════════════════════════════════════╣
║  Features:                                                        ║
║    • User Question Submissions                                    ║
║    • Analytics & Heat Map                                          ║
║    • Gamification (Achievements, Leaderboard)                     ║
║    • Learning Mode                                                 ║
║    • Case Studies                                                  ║
║    • Realtime Kahoot-style Mode                                    ║
║    • Spaced Repetition (SM-2)                                      ║
║    • Adaptive Testing                                              ║
║    • Manager Dashboard                                             ║
╚══════════════════════════════════════════════════════════════════╝
    `);
});

function shutdown(signal) {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    clearInterval(heartbeatInterval);
    wss.close(() => {
        try {
            db.close();
        } catch (e) {
            console.error('db.close error during shutdown:', e.message);
        }
        server.close(() => {
            process.exit(0);
        });
    });
    // Force exit after 5 seconds if graceful shutdown stalls
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
