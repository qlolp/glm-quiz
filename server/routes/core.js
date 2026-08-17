function register(context) {
    with (context) {
app.post('/api/results', requireUser, (req, res) => {
    try {
        const user_id = req.userId;
        const { score, total_questions = 50, answers } = req.body;

        if (typeof score !== 'number') {
            return res.status(400).json({ error: 'Invalid score' });
        }

        const user = db.prepare('SELECT username FROM users WHERE id = ?').get(user_id);
        const result = saveResult(user_id, user ? user.username : null, score, total_questions, answers);

        res.json({
            success: true,
            result_id: result.lastInsertRowid
        });
    } catch (error) {
        console.error('Error saving result:', error);
        res.status(500).json({ error: 'Failed to save result' });
    }
});

function saveResult(user_id, username, score, total_questions, answers = null, mode = null) {
    const result = db.prepare(`
        INSERT INTO results (user_id, username, score, total_questions, answers_json, mode)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(user_id, username, score, total_questions, answers ? JSON.stringify(answers) : null, mode);

    // Invalidate relevant caches
    cache.delete('results');
    cache.delete('leaderboard');

    return result;
}

function hasRecentDuplicateResult(user_id, answers, windowMinutes = 5) {
    const answersJson = answers ? JSON.stringify(answers) : null;
    const existing = db.prepare(`
        SELECT id FROM results
        WHERE user_id = ? AND answers_json = ? AND created_at > datetime('now', '-${windowMinutes} minutes')
        LIMIT 1
    `).get(user_id, answersJson);
    return !!existing;
}

/**
 * GET /api/results
 * Get statistics
 */
app.get('/api/results', requireAdmin, (req, res) => {
    try {
        const total = db.prepare('SELECT COUNT(*) as count FROM results').get();
        const average = db.prepare('SELECT AVG(score) as avg FROM results').get();
        const scores = db.prepare('SELECT score, username FROM results ORDER BY score DESC LIMIT 100').all();

        res.json({
            total_users: total.count,
            average_score: Math.round(average.avg * 10) / 10 || 0,
            scores: scores.map(r => ({ score: r.score, username: r.username || 'Аноним' }))
        });
    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

/**
 * GET /api/analytics
 * Get detailed analytics (admin)
 */
app.get('/api/analytics', requireAdmin, (req, res) => {
    try {
        // Question statistics (heat map)
        const questionStats = db.prepare(`
            SELECT
                dq.id,
                dq.question_text,
                dq.category,
                COALESCE(qs.times_answered, 0) as times_answered,
                COALESCE(qs.times_correct, 0) as times_correct,
                CASE
                    WHEN qs.times_answered > 0 THEN ROUND((qs.times_correct * 100.0 / qs.times_answered), 1)
                    ELSE 0
                END as accuracy_percent
            FROM default_questions dq
            LEFT JOIN question_stats qs ON dq.id = qs.question_id
            ORDER BY accuracy_percent ASC, times_answered DESC
        `).all();

        // Category breakdown
        const categoryStats = db.prepare(`
            SELECT
                category,
                COUNT(*) as question_count,
                AVG(CASE WHEN qs.times_answered > 0 THEN (qs.times_correct * 100.0 / qs.times_answered) ELSE 0 END) as avg_accuracy
            FROM default_questions dq
            LEFT JOIN question_stats qs ON dq.id = qs.question_id
            GROUP BY category
        `).all();

        // Recent activity
        const recentResults = db.prepare(`
            SELECT score, total_questions, username, created_at
            FROM results
            ORDER BY created_at DESC
            LIMIT 20
        `).all();

        res.json({
            question_stats: questionStats,
            category_breakdown: categoryStats,
            recent_activity: recentResults
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

/**
 * POST /api/analytics/question/:id
 * Update question statistics (called after quiz completion)
 */
app.post('/api/analytics/question/:id', requireUser, (req, res) => {
    try {
        const { id } = req.params;
        const { correct } = req.body;

        const updateStats = db.transaction(() => {
            const row = db.prepare('SELECT times_answered, times_correct FROM question_stats WHERE question_id = ?').get(id);
            const timesAnswered = (row ? row.times_answered : 0) + 1;
            const timesCorrect = (row ? row.times_correct : 0) + (correct ? 1 : 0);
            const difficultyScore = calculateDifficultyScore(timesAnswered, timesCorrect);

            db.prepare(`
                INSERT INTO question_stats (question_id, times_answered, times_correct, difficulty_score)
                VALUES (?, 1, ?, ?)
                ON CONFLICT(question_id) DO UPDATE SET
                    times_answered = times_answered + 1,
                    times_correct = times_correct + excluded.times_correct,
                    difficulty_score = excluded.difficulty_score
            `).run(id, correct ? 1 : 0, difficultyScore);
        });

        updateStats();

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating question stats:', error);
        res.status(500).json({ error: 'Failed to update stats' });
    }
});

function calculateDifficultyScore(total, correct) {
    const accuracy = correct / total;
    // Lower score = harder question (if accuracy is low)
    return Math.max(0, Math.min(1, 1 - accuracy));
}

/**
 * GET /api/users/:id
 * Get user profile
 */
app.get('/api/users/:id', requireOwner, (req, res) => {
    try {
        const { id } = req.params;
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const achievements = db.prepare(`
            SELECT a.* FROM user_achievements ua
            JOIN achievements a ON ua.achievement_id = a.id
            WHERE ua.user_id = ?
        `).all(id);

        res.json({ user, achievements });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

/**
 * POST /api/users
 * Create or get user
 */
app.post('/api/users', userCreationRateLimitMiddleware, (req, res) => {
    try {
        const username = sanitizeString(req.body.username, 100);
        const display_name = sanitizeString(req.body.display_name, 200);

        if (!username) {
            return res.status(400).json({ error: 'Username required' });
        }

        // Check if exists
        let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

        if (user && user.email) {
            // Registered account: issuing a token here would let anyone sign in
            // as this user by username alone. Require email verification instead.
            return res.status(409).json({ error: 'Account requires email verification', requires_verification: true });
        }

        if (!user) {
            const userId = crypto.randomBytes(16).toString('hex');
            user = {
                id: userId,
                username,
                display_name: display_name || username
            };

            db.prepare(`
                INSERT INTO users (id, username, display_name)
                VALUES (?, ?, ?)
            `).run(user.id, user.username, user.display_name);
        }

        // Issue auth token so guest users can call protected endpoints
        const token = generateUserToken(user.id);
        // Guest users are unverified — certificates require verified status (via /api/auth/verify)
        res.json({ user: { ...user, verified: !!(user.email) }, token, verified: !!(user.email) });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * PUT /api/users/:id
 * Update user profile (display name, organization, etc.)
 */
app.put('/api/users/:id', requireOwner, (req, res) => {
    try {
        const { id } = req.params;
        const { display_name, organization, avatar } = req.body;

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updates = [];
        const values = [];
        if (display_name !== undefined) {
            const sanitized = sanitizeString(display_name);
            if (sanitized === null) {
                return res.status(400).json({ error: 'Invalid display_name' });
            }
            updates.push('display_name = ?');
            values.push(sanitized);
        }
        if (organization !== undefined) {
            updates.push('organization = ?');
            values.push(sanitizeString(organization));
        }
        if (avatar !== undefined) {
            const sanitizedAvatar = sanitizeString(avatar, 500);
            updates.push('avatar = ?');
            values.push(sanitizedAvatar || 'default');
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        db.prepare(`UPDATE users SET ${updates.join(', ')}, last_active = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);

        const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        res.json({ success: true, user: updated });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * GET /api/achievements
 * Get all achievements
 */
app.get('/api/achievements', (req, res) => {
    try {
        const achievements = db.prepare('SELECT * FROM achievements').all();
        res.json({ achievements });
    } catch (error) {
        console.error('Error fetching achievements:', error);
        res.status(500).json({ error: 'Failed to fetch achievements' });
    }
});

/**
 * GET /api/leaderboard
 * Get top users (PII-protected: requires auth, masks usernames)
 */
app.get('/api/leaderboard', requireUser, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const rows = db.prepare(`
            SELECT username, display_name, total_score, quizzes_completed
            FROM users
            WHERE total_score > 0
            ORDER BY total_score DESC
            LIMIT ?
        `).all(limit);

        // PII protection: never expose real usernames/display names publicly.
        // Show only first name from display_name (or 'Участник' fallback).
        const leaderboard = rows.map((row, i) => {
            const raw = row.display_name || row.username;
            // Take only the first word and cap at 20 chars
            const firstWord = raw.split(/\s+/)[0] || 'Участник';
            const nickname = firstWord.slice(0, 20);
            return {
                rank: i + 1,
                username: nickname,
                total_score: row.total_score,
                quizzes_completed: row.quizzes_completed
            };
        });

        res.json({ leaderboard });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

/**
 * GET /api/cases
 * Get all case studies
 */

        Object.assign(context, { saveResult, hasRecentDuplicateResult, calculateDifficultyScore });
    }
}

module.exports = register;
