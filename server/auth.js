const crypto = require('crypto');

const ADMIN_TOKEN_TTL = 24 * 60 * 60 * 1000;
const USER_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000;

function createAuth({ adminPassword, adminTokenSecret, userTokenSecret }) {
    function generateAdminToken() {
        const payload = JSON.stringify({ role: 'admin', iat: Date.now(), exp: Date.now() + ADMIN_TOKEN_TTL });
        const signature = crypto.createHmac('sha256', adminTokenSecret).update(payload).digest('hex');
        return Buffer.from(payload).toString('base64') + '.' + signature;
    }

    function verifyAdminToken(token) {
        if (!token || typeof token !== 'string') return false;
        const parts = token.split('.');
        if (parts.length !== 2) return false;
        const [payloadB64, signature] = parts;
        let payload;
        try {
            payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
        } catch {
            return false;
        }
        const expected = crypto.createHmac('sha256', adminTokenSecret).update(JSON.stringify(payload)).digest('hex');
        if (signature.length !== expected.length) return false;
        if (!crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))) return false;
        if (payload.exp && payload.exp < Date.now()) return false;
        return payload.role === 'admin';
    }

    function parseCookies(req) {
        const cookies = {};
        const header = req.headers.cookie || '';
        header.split(';').forEach((part) => {
            const idx = part.indexOf('=');
            if (idx === -1) return;
            const key = part.slice(0, idx).trim();
            const value = part.slice(idx + 1).trim();
            if (key) cookies[key] = decodeURIComponent(value);
        });
        return cookies;
    }

    function getAdminTokenFromRequest(req) {
        const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
        if (headerToken && verifyAdminToken(headerToken)) return headerToken;
        const cookieToken = parseCookies(req).glm_admin_guide;
        if (cookieToken && verifyAdminToken(cookieToken)) return cookieToken;
        return null;
    }

    function verifyAdminPassword(password) {
        const expected = adminPassword || '';
        const actual = String(password || '');
        if (expected.length !== actual.length) return false;
        return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(actual, 'utf8'));
    }

    function adminGuideCookie(token) {
        const maxAge = Math.floor(ADMIN_TOKEN_TTL / 1000);
        return `glm_admin_guide=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
    }

    function requireAdmin(req, res, next) {
        if (!getAdminTokenFromRequest(req)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    }

    function generateUserToken(userId) {
        const payload = JSON.stringify({ sub: userId, iat: Date.now(), exp: Date.now() + USER_TOKEN_TTL });
        const signature = crypto.createHmac('sha256', userTokenSecret).update(payload).digest('hex');
        return Buffer.from(payload).toString('base64') + '.' + signature;
    }

    function verifyUserToken(token) {
        if (!token || typeof token !== 'string') return null;
        const parts = token.split('.');
        if (parts.length !== 2) return null;
        const [payloadB64, signature] = parts;
        let payload;
        try {
            payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
        } catch {
            return null;
        }
        const expected = crypto.createHmac('sha256', userTokenSecret).update(JSON.stringify(payload)).digest('hex');
        if (signature.length !== expected.length) return null;
        if (!crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))) return null;
        if (payload.exp && payload.exp < Date.now()) return null;
        return payload.sub || null;
    }

    function requireUser(req, res, next) {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const userId = verifyUserToken(token);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        req.userId = userId;
        next();
    }

    function requireOwner(req, res, next) {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const userId = verifyUserToken(token);
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const requestedId = req.params.id || req.params.user_id;
        if (!requestedId || userId !== requestedId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        req.userId = userId;
        next();
    }

    return {
        adminGuideCookie,
        generateAdminToken,
        generateUserToken,
        getAdminTokenFromRequest,
        requireAdmin,
        requireOwner,
        requireUser,
        verifyAdminToken,
        verifyAdminPassword
    };
}

module.exports = { createAuth };
