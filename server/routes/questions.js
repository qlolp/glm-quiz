function register(context) {
    with (context) {
// ========== ROUTES ==========

/**
 * GET /api/questions
 * Get all questions with optional learning mode (cached)
 */
app.get('/api/questions', (req, res) => {
    try {
        const { seminarCategoryFilter } = require('../seminar-packs');
        const cacheKey = 'questions_public_v4';

        const cached = getCache(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const core = seminarCategoryFilter('dq.category');
        const rows = db.prepare(`
            SELECT
                dq.id,
                dq.question_text as question,
                dq.option_a,
                dq.option_b,
                dq.option_c,
                dq.option_d,
                dq.category,
                dq.difficulty,
                dq.hint
            FROM default_questions dq
            WHERE ${core.sql}
            ORDER BY dq.id
        `).all(...core.params);

        const questions = rows.map(formatPublicQuestionRow);
        const response = { questions };
        setCache(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('Error fetching questions:', error);
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

/**
 * GET /api/questions/user
 * Get user-submitted questions (admin)
 */
app.get('/api/questions/user', requireAdmin, (req, res) => {
    try {
        const questions = db.prepare(`
            SELECT
                id,
                question_text,
                option_a,
                option_b,
                option_c,
                option_d,
                correct_answer,
                created_at,
                moderated,
                category
            FROM questions
            ORDER BY created_at DESC
        `).all();

        res.json({ questions });
    } catch (error) {
        console.error('Error fetching user questions:', error);
        res.status(500).json({ error: 'Failed to fetch user questions' });
    }
});

/**
 * POST /api/questions
 * Submit a new question
 */
app.post('/api/questions', requireAdmin, (req, res) => {
    try {
        const { question_text, options, correct_answer, score, category, explanation, reference_link } = req.body;

        if (!question_text || !options || !Array.isArray(options) || options.length !== 4) {
            return res.status(400).json({ error: 'Invalid question format' });
        }

        if (correct_answer < 0 || correct_answer > 3) {
            return res.status(400).json({ error: 'Invalid correct answer' });
        }

        const result = db.prepare(`
            INSERT INTO questions (question_text, option_a, option_b, option_c, option_d, correct_answer, category, explanation, reference_link)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(question_text, options[0], options[1], options[2], options[3], correct_answer, category || 'general', explanation || null, reference_link || null);

        if (typeof score === 'number') {
            saveResult(null, null, score, 50);
        }

        res.json({ success: true, question_id: result.lastInsertRowid });
    } catch (error) {
        console.error('Error saving question:', error);
        res.status(500).json({ error: 'Failed to save question' });
    }
});

/**
 * POST /api/results
 * Save quiz result
 */
    }
}

module.exports = register;
