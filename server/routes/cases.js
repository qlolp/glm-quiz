function register(context) {
    with (context) {
app.get('/api/cases', (req, res) => {
    try {
        const cases = db.prepare(`
            SELECT c.*,
                (SELECT COUNT(*) FROM case_steps WHERE case_id = c.id) as steps_count
            FROM cases c
            ORDER BY c.created_at DESC
        `).all();

        res.json({ cases });
    } catch (error) {
        console.error('Error fetching cases:', error);
        res.status(500).json({ error: 'Failed to fetch cases' });
    }
});

/**
 * GET /api/cases/:id
 * Get case with steps
 */
app.get('/api/cases/:id', (req, res) => {
    try {
        const { id } = req.params;
        const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(id);

        if (!caseData) {
            return res.status(404).json({ error: 'Case not found' });
        }

        const steps = db.prepare(`
            SELECT step_number, question, options
            FROM case_steps
            WHERE case_id = ?
            ORDER BY step_number
        `).all(id);

        steps.forEach(s => {
            s.options = JSON.parse(s.options);
        });

        res.json({ case: caseData, steps });
    } catch (error) {
        console.error('Error fetching case:', error);
        res.status(500).json({ error: 'Failed to fetch case' });
    }
});

/**
 * POST /api/cases/:id/progress
 * Save case progress
 */
app.post('/api/cases/:id/progress', requireUser, (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.userId;
        const { score, completed } = req.body;

        // Validate user exists
        const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
        if (!userExists) {
            return res.status(400).json({ error: 'User not found' });
        }

        // Validate case exists
        const caseExists = db.prepare('SELECT id FROM cases WHERE id = ?').get(id);
        if (!caseExists) {
            return res.status(404).json({ error: 'Case not found' });
        }

        const numericScore = typeof score === 'number' ? score : 0;
        const isCompleted = completed === true || completed === 1;

        const saveProgress = db.transaction(() => {
            const existing = db.prepare('SELECT completed FROM user_case_progress WHERE user_id = ? AND case_id = ?').get(user_id, id);
            const wasCompleted = existing && existing.completed === 1;

            if (existing) {
                db.prepare(`
                    UPDATE user_case_progress
                    SET score = ?, completed = ?, completed_at = ?
                    WHERE user_id = ? AND case_id = ?
                `).run(numericScore, isCompleted ? 1 : 0, isCompleted ? new Date().toISOString() : null, user_id, id);
            } else {
                db.prepare(`
                    INSERT INTO user_case_progress (user_id, case_id, score, completed, completed_at)
                    VALUES (?, ?, ?, ?, ?)
                `).run(user_id, id, numericScore, isCompleted ? 1 : 0, isCompleted ? new Date().toISOString() : null);
            }

            // Count newly completed distinct case once per user
            if (isCompleted && !wasCompleted) {
                db.prepare(`
                    UPDATE users
                    SET cases_completed = cases_completed + 1,
                        last_active = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(user_id);
            }
        });

        saveProgress();

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
        const newAchievements = user ? checkAchievements(user) : [];

        res.json({ success: true, new_achievements: newAchievements });
    } catch (error) {
        console.error('Error saving case progress:', error);
        res.status(500).json({ error: 'Failed to save progress' });
    }
});

/**
 * POST /api/cases/:id/check-step
 * Verify a case step answer server-side (correct_answer not exposed in GET)
 */
app.post('/api/cases/:id/check-step', requireUser, feedbackRateLimitMiddleware, (req, res) => {
    try {
        const { id } = req.params;
        const { step_number, answer } = req.body;

        if (typeof step_number !== 'number' || typeof answer !== 'number' || answer < 0 || answer > 3) {
            return res.status(400).json({ error: 'Invalid step_number or answer' });
        }

        const step = db.prepare(`
            SELECT step_number, correct_answer, explanation, branches, options
            FROM case_steps
            WHERE case_id = ? AND step_number = ?
        `).get(id, step_number);

        if (!step) {
            return res.status(404).json({ error: 'Step not found' });
        }

        const isCorrect = answer === step.correct_answer;
        let branches = null;
        try {
            branches = step.branches ? JSON.parse(step.branches) : null;
        } catch (e) {
            branches = null;
        }

        let nextStep = step_number + 1;
        if (branches && Object.prototype.hasOwnProperty.call(branches, String(answer))) {
            const mapped = branches[String(answer)];
            nextStep = mapped === null || mapped === undefined ? null : mapped;
        }

        const maxStep = db.prepare('SELECT MAX(step_number) as m FROM case_steps WHERE case_id = ?').get(id);
        const finished = nextStep === null || nextStep > (maxStep?.m || step_number);

        res.json({
            correct: isCorrect,
            correctIndex: step.correct_answer,
            explanation: step.explanation || '',
            next_step: finished ? null : nextStep,
            finished
        });
    } catch (error) {
        console.error('Error checking case step:', error);
        res.status(500).json({ error: 'Failed to check step' });
    }
});

/**
 * POST /api/action-plans
 * Save a post-quiz action plan commitment
 */
app.post('/api/action-plans', requireUser, (req, res) => {
    try {
        const user_id = req.userId;
        const text = sanitizeString(req.body.text, 2000);
        const score = typeof req.body.score === 'number' ? req.body.score : null;
        const mode = sanitizeString(req.body.mode, 40) || null;

        if (!text || text.length < 3) {
            return res.status(400).json({ error: 'Text required' });
        }

        const result = db.prepare(`
            INSERT INTO action_plans (user_id, text, score, mode)
            VALUES (?, ?, ?, ?)
        `).run(user_id, text, score, mode);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('Error saving action plan:', error);
        res.status(500).json({ error: 'Failed to save action plan' });
    }
});

/**
 * POST /api/prepost/complete
 * Record pre or post assessment result
 */
app.post('/api/prepost/complete', requireUser, (req, res) => {
    try {
        const user_id = req.userId;
        const { phase, answers } = req.body;

        if (phase !== 'pre' && phase !== 'post') {
            return res.status(400).json({ error: 'phase must be pre or post' });
        }
        if (!Array.isArray(answers) || answers.length === 0) {
            return res.status(400).json({ error: 'answers required' });
        }
        if (answers.length > PREPOST_QUESTION_IDS.length) {
            return res.status(400).json({ error: 'Too many answers' });
        }

        // Score is always derived server-side from the fixed prepost set
        const seen = new Set();
        let correctCount = 0;
        for (const a of answers) {
            if (!a || typeof a.questionId !== 'number' || typeof a.answer !== 'number') {
                return res.status(400).json({ error: 'Malformed answers' });
            }
            if (!PREPOST_QUESTION_IDS.includes(a.questionId)) {
                return res.status(400).json({ error: 'Question not in prepost set' });
            }
            if (seen.has(a.questionId)) {
                return res.status(400).json({ error: 'Duplicate question in answers' });
            }
            seen.add(a.questionId);
            const q = db.prepare('SELECT correct_answer FROM default_questions WHERE id = ?').get(a.questionId);
            if (q && a.answer === q.correct_answer) correctCount++;
        }

        const score = correctCount;
        const total = answers.length;
        const percentage = Math.round((score / total) * 1000) / 10;
        db.prepare(`
            INSERT INTO prepost_results (user_id, phase, score, total, percentage, answers_json)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(user_id, phase, score, total, percentage, answers ? JSON.stringify(answers) : null);

        const pre = db.prepare(`
            SELECT score, total, percentage, created_at FROM prepost_results
            WHERE user_id = ? AND phase = 'pre' ORDER BY created_at DESC LIMIT 1
        `).get(user_id);
        const post = db.prepare(`
            SELECT score, total, percentage, created_at FROM prepost_results
            WHERE user_id = ? AND phase = 'post' ORDER BY created_at DESC LIMIT 1
        `).get(user_id);

        let delta = null;
        if (pre && post) {
            delta = {
                score: post.score - pre.score,
                percentage: Math.round((post.percentage - pre.percentage) * 10) / 10
            };
        }

        res.json({
            success: true,
            phase,
            score,
            total,
            percentage,
            pre,
            post,
            delta,
            question_ids: PREPOST_QUESTION_IDS
        });
    } catch (error) {
        console.error('Error saving prepost result:', error);
        res.status(500).json({ error: 'Failed to save prepost result' });
    }
});

/**
 * GET /api/prepost/config
 * Fixed question IDs for pre/post mode
 */
app.get('/api/prepost/config', (req, res) => {
    res.json({ question_ids: PREPOST_QUESTION_IDS, count: PREPOST_QUESTION_IDS.length });
});

/**
 * GET /api/analytics/weak-questions
 * Questions with low accuracy / high volume / always wrong / always correct / low volume
 */
    }
}

module.exports = register;
