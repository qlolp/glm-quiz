function register(context) {
    with (context) {
app.post('/api/auth/register', (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const fio = sanitizeString(req.body.fio, 200);
        const organization = sanitizeString(req.body.organization);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!email || !emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email' });
        }
        if (!fio || fio.length < 3) {
            return res.status(400).json({ error: 'Invalid name' });
        }

        // Check if user exists by email OR username (both are unique)
        const existing = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(email, email);

        if (existing) {
            // Still generate a code so existing users can re-verify if needed.
            // Do NOT return the user record: this endpoint is public and the
            // response would disclose account data for any known email.
            storeVerificationCode(email);
            return res.json({ success: true, exists: true });
        }

        // Create new user — wrap in try/catch to handle race-condition UNIQUE violation
        const userId = 'user_' + crypto.randomBytes(16).toString('hex');
        try {
            db.prepare(`
                INSERT INTO users (id, username, display_name, email, organization)
                VALUES (?, ?, ?, ?, ?)
            `).run(userId, email, fio, email, organization);
        } catch (insertErr) {
            // Race condition: another request created the user between SELECT and INSERT
            const raced = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(email, email);
            if (raced) {
                storeVerificationCode(email);
                return res.json({ success: true, exists: true });
            }
            throw insertErr;
        }

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        storeVerificationCode(email);
        res.json({ success: true, user });
    } catch (error) {
        console.error('Error registering:', error);
        res.status(500).json({ error: 'Failed to register' });
    }
});

/**
 * POST /api/auth/verify
 * Verify email code
 */
app.post('/api/auth/verify', certRateLimitMiddleware, (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({ error: 'Email and code required' });
        }

        if (!verifyCode(email, code)) {
            return res.status(400).json({ error: 'Invalid or expired verification code' });
        }

        // Code is valid, remove it so it cannot be reused
        verificationCodes.delete(email.toLowerCase());

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (user) {
            const token = generateUserToken(user.id);
            res.json({ success: true, user, token });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error verifying code:', error);
        res.status(500).json({ error: 'Failed to verify' });
    }
});

/**
 * POST /api/auth/admin
 * Verify admin password
 */
app.post('/api/auth/admin', adminAuthRateLimitMiddleware, certRateLimitMiddleware, (req, res) => {
    try {
        const { password } = req.body;
        const expected = ADMIN_PASSWORD || '';
        const actual = String(password || '');
        const isValid = expected.length === actual.length &&
            crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(actual, 'utf8'));
        if (isValid) {
            const token = generateAdminToken();
            res.json({ valid: true, token });
        } else {
            res.status(401).json({ valid: false, error: 'Invalid password' });
        }
    } catch (error) {
        res.status(500).json({ valid: false, error: 'Authentication failed' });
    }
});

/**
 * GET /api/export/csv
 * Export results as CSV
 */
    }
}

module.exports = register;
