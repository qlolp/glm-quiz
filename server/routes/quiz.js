function register(context) {
    with (context) {
app.post('/api/quiz/check-answer', requireUser, feedbackRateLimitMiddleware, (req, res) => {
    try {
        const { questionId, answer, session_id, reveal } = req.body;

        if (typeof questionId !== 'number') {
            return res.status(400).json({ error: 'Invalid questionId' });
        }

        const question = db.prepare(`
            SELECT correct_answer, explanation, reference_link, wrong_explanations
            FROM default_questions WHERE id = ?
        `).get(questionId);

        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        let wrongExplanations = [];
        try {
            wrongExplanations = question.wrong_explanations
                ? JSON.parse(question.wrong_explanations)
                : [];
        } catch (e) {
            wrongExplanations = [];
        }

        if (reveal === true) {
            return res.json({
                correctIndex: question.correct_answer,
                explanation: question.explanation || '',
                reference_link: question.reference_link || null,
                wrong_explanations: wrongExplanations
            });
        }

        if (typeof answer !== 'number' || answer < 0 || answer > 3) {
            return res.status(400).json({ error: 'Invalid answer' });
        }

        const isCorrect = answer === question.correct_answer;
        const wrongExplanation = (!isCorrect && Array.isArray(wrongExplanations))
            ? (wrongExplanations[answer] || '')
            : '';

        if (session_id && typeof session_id === 'string' && session_id.length <= 64) {
            const session = db.prepare('SELECT id, user_id FROM adaptive_sessions WHERE id = ? AND user_id = ?').get(session_id, req.userId);
            if (session) {
                db.prepare(`
                    INSERT INTO adaptive_session_answers (session_id, question_id, user_answer, is_correct)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(session_id, question_id) DO UPDATE SET
                        user_answer = excluded.user_answer,
                        is_correct = excluded.is_correct,
                        answered_at = CURRENT_TIMESTAMP
                `).run(session_id, questionId, answer, isCorrect ? 1 : 0);
            }
        }

        res.json({
            correct: isCorrect,
            correctIndex: question.correct_answer,
            explanation: question.explanation || '',
            wrong_explanation: wrongExplanation,
            reference_link: question.reference_link || null
        });
    } catch (error) {
        console.error('Error checking answer:', error);
        res.status(500).json({ error: 'Failed to check answer' });
    }
});

/**
 * POST /api/quiz/complete
 * Complete quiz and update user stats
 */
app.post('/api/quiz/complete', requireUser, (req, res) => {
    try {
        const user_id = req.userId;
        const { score, total_questions, answers, session_id } = req.body;

        // Adaptive mode: score from server-tracked session answers
        if (session_id && typeof session_id === 'string') {
            const session = db.prepare('SELECT id FROM adaptive_sessions WHERE id = ? AND user_id = ?').get(session_id, user_id);
            if (!session) {
                return res.status(400).json({ error: 'Invalid session' });
            }

            const sessionAnswers = db.prepare(`
                SELECT is_correct FROM adaptive_session_answers WHERE session_id = ?
            `).all(session_id);

            if (sessionAnswers.length < 1) {
                return res.status(400).json({ error: 'No answers in session' });
            }

            const correctCount = sessionAnswers.filter(a => a.is_correct === 1).length;
            const total = sessionAnswers.length;

            if (typeof score !== 'number' || score !== correctCount || total_questions !== total) {
                return res.status(400).json({ error: 'Score does not match session answers' });
            }

            // Prevent replay: one adaptive session = one result
            if (hasRecentDuplicateResult(user_id, [{ session_id, adaptive: true }], 60)) {
                return res.status(409).json({ error: 'Quiz result already recorded for this session' });
            }

            const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const completeQuiz = db.transaction(() => {
                db.prepare(`
                    UPDATE users
                    SET total_score = total_score + ?,
                        quizzes_completed = quizzes_completed + 1,
                        high_score = MAX(high_score, ?),
                        last_active = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(score, score, user_id);

                saveResult(user_id, null, score, total, [{ session_id, adaptive: true }]);
                return db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
            });

            const updatedUser = completeQuiz();
            const achievements = checkAchievements(updatedUser, { score, total_questions: total });

            return res.json({
                success: true,
                new_achievements: achievements,
                total_score: updatedUser.total_score
            });
        }

        if (typeof score !== 'number' || typeof total_questions !== 'number') {
            return res.status(400).json({ error: 'Invalid request' });
        }

        if (score < 0 || total_questions <= 0 || score > total_questions) {
            return res.status(400).json({ error: 'Invalid score or total_questions' });
        }

        // Server-side anti-cheat: validate answers consistency
        if (!Array.isArray(answers) || answers.length !== total_questions) {
            return res.status(400).json({ error: 'Invalid answers data' });
        }

        for (const a of answers) {
            if (!a) {
                return res.status(400).json({ error: 'Malformed answer entry' });
            }
            const hasStandard = typeof a.questionId === 'number' && typeof a.answer === 'number';
            const hasAdaptive = typeof a.question_index === 'number' && typeof a.is_correct === 'boolean';
            if (!hasStandard && !hasAdaptive) {
                return res.status(400).json({ error: 'Malformed answer entry' });
            }
        }

        // Verify standard answers against the database and recompute correct count.
        // Legacy client-trusted adaptive entries (question_index + is_correct) are no longer accepted;
        // adaptive mode must use a server-tracked session_id.
        let correctCount = 0;
        for (const a of answers) {
            if (typeof a.questionId !== 'number' || typeof a.answer !== 'number') {
                return res.status(400).json({ error: 'Malformed answer entry' });
            }
            const question = db.prepare('SELECT correct_answer FROM default_questions WHERE id = ?').get(a.questionId);
            if (!question) {
                return res.status(400).json({ error: 'Invalid question id' });
            }
            if (a.answer === question.correct_answer) {
                correctCount++;
            }
        }
        if (score !== correctCount) {
            return res.status(400).json({ error: 'Score does not match answers' });
        }

        // Prevent replay of identical answer sets within a short window
        if (hasRecentDuplicateResult(user_id, answers, 5)) {
            return res.status(409).json({ error: 'Duplicate quiz submission' });
        }

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const completeQuiz = db.transaction(() => {
            // Update user stats
            db.prepare(`
                UPDATE users
                SET total_score = total_score + ?,
                    quizzes_completed = quizzes_completed + 1,
                    high_score = MAX(high_score, ?),
                    last_active = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(score, score, user_id);

            // Save result
            saveResult(user_id, null, score, total_questions, answers);

            // Re-fetch user with updated stats
            return db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
        });

        const updatedUser = completeQuiz();
        const achievements = checkAchievements(updatedUser, { score, total_questions });

        res.json({
            success: true,
            new_achievements: achievements,
            total_score: updatedUser.total_score
        });
    } catch (error) {
        console.error('Error completing quiz:', error);
        res.status(500).json({ error: 'Failed to complete quiz' });
    }
});

/**
 * POST /api/feedback
 * Submit feedback for a question
 */
app.post('/api/feedback', requireUser, feedbackRateLimitMiddleware, (req, res) => {
    try {
        const { question_id, feedback_type, comment } = req.body;
        const user_id = req.userId;
        const trimmedComment = sanitizeString(comment, 2000);
        const trimmedFeedbackType = sanitizeString(feedback_type);

        if (!trimmedFeedbackType || !question_id) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const validTypes = ['unclear', 'error', 'wrong_answer', 'suggest'];
        if (!validTypes.includes(trimmedFeedbackType)) {
            return res.status(400).json({ error: 'Invalid feedback type' });
        }

        // Save feedback to database
        const stmt = db.prepare(`
            INSERT INTO question_feedback (question_id, feedback_type, comment, user_id, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        const result = stmt.run(question_id, trimmedFeedbackType, trimmedComment || '', user_id || null);

        res.json({
            success: true,
            id: result.lastInsertRowid,
            message: 'Спасибо за обратную связь!'
        });
    } catch (error) {
        console.error('Error saving feedback:', error);
        res.status(500).json({ error: 'Failed to save feedback' });
    }
});

/**
 * POST /api/batch-register
 * Batch register participants from CSV
 */
app.post('/api/batch-register', requireAdmin, (req, res) => {
    try {
        const { participants } = req.body;

        if (!Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ error: 'Invalid participants data' });
        }

        const results = {
            success: true,
            imported: 0,
            failed: 0,
            errors: []
        };

        // The batch_import table is created on server startup with columns:
        // id, user_id, username, display_name, role, organization, imported_at
        const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO batch_import (user_id, username, display_name, role, organization)
            VALUES (?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((participants) => {
            for (let i = 0; i < participants.length; i++) {
                const p = participants[i];

                if (!p.name || !p.email) {
                    results.failed++;
                    results.errors.push({
                        row: i + 1,
                        error: 'Missing name or email'
                    });
                    continue;
                }

                // Validate email format
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(p.email)) {
                    results.failed++;
                    results.errors.push({
                        row: i + 1,
                        error: 'Invalid email format'
                    });
                    continue;
                }

                const org = sanitizeString(p.organization || p.department);
                const role = sanitizeString(p.role);
                const name = sanitizeString(p.name);
                const email = String(p.email).trim().toLowerCase();

                // Upsert user in users table by email
                const userId = 'batch_' + crypto.randomBytes(8).toString('hex');
                db.prepare(`
                    INSERT INTO users (id, username, display_name, email, organization)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(email) DO UPDATE SET
                        display_name = excluded.display_name,
                        organization = excluded.organization
                `).run(userId, email, name, email, org);

                // Capture the actual user id (existing or newly inserted)
                const userRow = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
                const actualUserId = userRow ? userRow.id : userId;

                // Track in batch_import for this event
                const batchResult = insertStmt.run(
                    actualUserId,
                    email,
                    name,
                    role,
                    org
                );

                if (batchResult.changes > 0) {
                    results.imported++;
                } else {
                    // Already imported into batch_import; user may already exist, that's fine
                    results.failed++;
                    results.errors.push({
                        row: i + 1,
                        error: 'Already imported'
                    });
                }
            }
        });

        insertMany(participants);

        res.json(results);
    } catch (error) {
        console.error('Batch registration error:', error);
        res.status(500).json({ error: 'Failed to process batch registration' });
    }
});

/**
 * GET /api/batch-import
 * Get all imported participants
 */
app.get('/api/batch-import', requireAdmin, (req, res) => {
    try {
        const participants = db.prepare(`
            SELECT * FROM batch_import
            ORDER BY imported_at DESC
        `).all();

        res.json({ participants });
    } catch (error) {
        console.error('Error fetching batch import:', error);
        res.status(500).json({ error: 'Failed to fetch imported participants' });
    }
});

/**
 * GET /api/stats/participants
 * Get participant statistics
 */
app.get('/api/stats/participants', requireAdmin, (req, res) => {
    try {
        const total = db.prepare('SELECT COUNT(*) as count FROM batch_import').get();
        const today = db.prepare(`
            SELECT COUNT(*) as count FROM batch_import
            WHERE DATE(imported_at) = DATE('now')
        `).get();

        // Get quiz results
        const avgScore = db.prepare('SELECT AVG(score) as avg FROM results').get();
        const totalResults = db.prepare('SELECT COUNT(*) as count FROM results').get();
        const completionRate = totalResults.count > 0 ? avgScore.avg / 50 : 0;

        // Top performers
        const topPerformers = db.prepare(`
            SELECT username, score, created_at
            FROM results
            ORDER BY score DESC
            LIMIT 10
        `).all();

        // By role (from batch_import)
        const byRole = db.prepare(`
            SELECT role, COUNT(*) as count
            FROM batch_import
            WHERE role IS NOT NULL
            GROUP BY role
        `).all();

        res.json({
            total_participants: total.count || 0,
            active_today: today.count || 0,
            average_score: Math.round((avgScore.avg || 0) * 10) / 10,
            completion_rate: Math.round(completionRate * 100) / 100,
            total_quizzes: totalResults.count || 0,
            top_performers: topPerformers,
            by_role: byRole.reduce((acc, r) => ({ ...acc, [r.role]: r.count }), {})
        });
    } catch (error) {
        console.error('Error fetching participant stats:', error);
        res.status(500).json({ error: 'Failed to fetch participant stats' });
    }
});

/**
 * GET /api/export/all
 * Export all data (questions, results, participants)
 */
app.get('/api/export/all', requireAdmin, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, question_text, option_a, option_b, option_c, option_d,
                   correct_answer, category, explanation, reference_link, difficulty
            FROM default_questions
        `).all();
        const questions = rows.map(q => ({
            id: q.id,
            question: q.question_text,
            options: [q.option_a, q.option_b, q.option_c, q.option_d],
            correct: q.correct_answer,
            category: q.category,
            explanation: q.explanation,
            reference: q.reference_link,
            difficulty: q.difficulty
        }));

        const results = db.prepare(`
            SELECT id, username, score, total_questions, created_at
            FROM results
            ORDER BY created_at DESC
        `).all();

        const participants = db.prepare(`
            SELECT * FROM batch_import
            ORDER BY imported_at DESC
        `).all();

        const exportData = {
            export_date: new Date().toISOString(),
            questions: questions,
            results: results,
            participants: participants
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="quiz-export-all.json"');
        res.json(exportData);
    } catch (error) {
        console.error('Error exporting all data:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

/**
 * GET /api/user/:id/achievements
 * Get user achievement passport
 */
app.get('/api/user/:id/achievements', requireOwner, (req, res) => {
    try {
        const { id } = req.params;

        // User info
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // User achievements
        const achievements = db.prepare(`
            SELECT a.*, ua.earned_at
            FROM user_achievements ua
            JOIN achievements a ON ua.achievement_id = a.id
            WHERE ua.user_id = ?
            ORDER BY ua.earned_at DESC
        `).all(id);

        // User quiz history
        const history = db.prepare(`
            SELECT score, total_questions, created_at
            FROM results
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 20
        `).all(id);

        // Calculate stats
        const avgScore = history.length > 0
            ? history.reduce((sum, h) => sum + h.score, 0) / history.length
            : 0;

        // Certificates (quizzes with 90%+ score)
        const certificates = history.filter(h => (h.score / h.total_questions) >= 0.9);

        res.json({
            user: {
                id: user.id,
                username: user.username,
                display_name: user.display_name,
                total_score: user.total_score,
                quizzes_completed: user.quizzes_completed
            },
            achievements,
            stats: {
                average_score: Math.round(avgScore * 10) / 10,
                total_quizzes: history.length,
                certificates_count: certificates.length
            },
            history,
            certificates: certificates.map((c, i) => ({
                id: `cert_${id}_${i}`,
                date: c.created_at,
                score: c.score,
                total: c.total_questions
            }))
        });
    } catch (error) {
        console.error('Error fetching user achievements:', error);
        res.status(500).json({ error: 'Failed to fetch user achievements' });
    }
});

/**
 * Check and award achievements
 * @param {Object} user - user row from DB
 * @param {Object} quizData - optional { score, total_questions }
 */
function checkAchievements(user, quizData = {}) {
    if (!user || !user.id) return [];
    const existing = db.prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?').all(user.id);
    const existingSet = new Set(existing.map(r => r.achievement_id));

    const toInsert = [];
    if (user.quizzes_completed >= 1 && !existingSet.has('first_quiz')) toInsert.push('first_quiz');
    if (user.quizzes_completed >= 10 && !existingSet.has('quiz_master')) toInsert.push('quiz_master');
    if (user.high_score >= 400 && !existingSet.has('expert')) toInsert.push('expert');
    if (quizData.total_questions > 0 && quizData.score >= quizData.total_questions && !existingSet.has('perfect_score')) toInsert.push('perfect_score');
    if (user.learning_mode_used >= 5 && !existingSet.has('learner')) toInsert.push('learner');
    if (user.cases_completed >= 5 && !existingSet.has('case_solver')) toInsert.push('case_solver');

    if (toInsert.length === 0) return [];

    const placeholders = toInsert.map(() => '(?, ?)').join(', ');
    const values = [];
    toInsert.forEach(id => {
        values.push(user.id, id);
    });

    db.prepare(`
        INSERT OR IGNORE INTO user_achievements (user_id, achievement_id)
        VALUES ${placeholders}
    `).run(...values);

    return toInsert;
}

/**
 * GET /api/rating
 * Get user leaderboard (cached)
 */
app.get('/api/rating', (req, res) => {
    try {
        // Check cache
        const cached = getCache('leaderboard');
        if (cached) {
            return res.json(cached);
        }

        const leaderboard = db.prepare(`
            SELECT id, username, display_name, total_score, quizzes_completed
            FROM users
            WHERE total_score > 0
            ORDER BY total_score DESC, quizzes_completed DESC, created_at ASC
            LIMIT 100
        `).all();

        const response = { leaderboard };
        setCache('leaderboard', response);
        res.json(response);
    } catch (error) {
        console.error('Error fetching rating:', error);
        res.status(500).json({ error: 'Failed to fetch rating' });
    }
});


        Object.assign(context, { checkAchievements });
    }
}

module.exports = register;
