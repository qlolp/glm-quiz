function register(context) {
    with (context) {
app.get('/api/analytics/weak-questions', requireAdmin, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT
                dq.id,
                dq.question_text,
                dq.category,
                COALESCE(qs.times_answered, 0) as times_answered,
                COALESCE(qs.times_correct, 0) as times_correct,
                COALESCE(qs.times_wrong, 0) as times_wrong,
                CASE
                    WHEN COALESCE(qs.times_answered, 0) > 0
                    THEN ROUND((qs.times_correct * 100.0 / qs.times_answered), 1)
                    ELSE NULL
                END as accuracy_percent
            FROM default_questions dq
            LEFT JOIN question_stats qs ON dq.id = qs.question_id
            ORDER BY dq.id
        `).all();

        const classified = rows.map(r => {
            const flags = [];
            if (r.times_answered === 0) flags.push('no_answers');
            else if (r.times_answered < 3) flags.push('low_volume');
            if (r.times_answered >= 3 && r.accuracy_percent !== null && r.accuracy_percent <= 40) flags.push('low_accuracy');
            if (r.times_answered >= 5 && r.accuracy_percent === 100) flags.push('always_correct');
            if (r.times_answered >= 5 && r.accuracy_percent === 0) flags.push('always_wrong');
            return { ...r, flags };
        }).filter(r => r.flags.length > 0);

        classified.sort((a, b) => {
            const score = (r) => {
                let s = 0;
                if (r.flags.includes('always_wrong') || r.flags.includes('low_accuracy')) s += 10;
                if (r.flags.includes('always_correct')) s += 5;
                if (r.flags.includes('low_volume') || r.flags.includes('no_answers')) s += 2;
                return s + (r.times_answered || 0) * 0.01;
            };
            return score(b) - score(a);
        });

        res.json({ questions: classified, total: classified.length });
    } catch (error) {
        console.error('Error fetching weak questions:', error);
        res.status(500).json({ error: 'Failed to fetch weak questions' });
    }
});

/**
 * GET /api/analytics/categories
 * Category accuracy for stage heatmap (admin)
 */
app.get('/api/analytics/categories', requireAdmin, (req, res) => {
    try {
        const categories = db.prepare(`
            SELECT
                dq.category,
                COUNT(*) as question_count,
                COALESCE(SUM(qs.times_answered), 0) as times_answered,
                COALESCE(SUM(qs.times_correct), 0) as times_correct,
                CASE
                    WHEN COALESCE(SUM(qs.times_answered), 0) > 0
                    THEN ROUND((SUM(qs.times_correct) * 100.0 / SUM(qs.times_answered)), 1)
                    ELSE 0
                END as accuracy_percent
            FROM default_questions dq
            LEFT JOIN question_stats qs ON dq.id = qs.question_id
            GROUP BY dq.category
            ORDER BY accuracy_percent ASC
        `).all();
        res.json({ categories });
    } catch (error) {
        console.error('Error fetching category analytics:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

/**
 * POST /api/learning/complete
 * Track learning mode completion for achievements
 */
app.post('/api/learning/complete', requireUser, (req, res) => {
    try {
        const user_id = req.userId;

        const update = db.prepare(`
            UPDATE users
            SET learning_mode_used = learning_mode_used + 1,
                last_active = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(user_id);

        if (update.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
        const newAchievements = checkAchievements(user);

        res.json({ success: true, new_achievements: newAchievements });
    } catch (error) {
        console.error('Error tracking learning completion:', error);
        res.status(500).json({ error: 'Failed to track learning completion' });
    }
});

/**
 * PUT /api/questions/:id/moderate
 * Moderate a question (admin)
 */
app.put('/api/questions/:id/moderate', requireAdmin, (req, res) => {
    try {
        const { approved } = req.body;
        const { id } = req.params;

        db.prepare('UPDATE questions SET moderated = ? WHERE id = ?').run(approved ? 1 : 0, id);

        res.json({ success: true });
    } catch (error) {
        console.error('Error moderating question:', error);
        res.status(500).json({ error: 'Failed to moderate question' });
    }
});

/**
 * POST /api/questions/submit
 * Submit a question proposed by a user (goes to moderation queue)
 */
app.post('/api/questions/submit', requireUser, (req, res) => {
    try {
        const { question_text, options, correct_answer, category, explanation, reference_link, user_id } = req.body;

        const trimmedQuestion = sanitizeString(question_text, 1000);
        if (!trimmedQuestion || !options || !Array.isArray(options) || options.length !== 4) {
            return res.status(400).json({ error: 'Invalid question format' });
        }
        const trimmedOptions = options.map(o => sanitizeString(o, 500) || '');
        if (trimmedOptions.some(o => o === '')) {
            return res.status(400).json({ error: 'All options are required' });
        }
        if (correct_answer === undefined || correct_answer < 0 || correct_answer > 3) {
            return res.status(400).json({ error: 'Invalid correct answer' });
        }
        // Category must be a plain slug: latin/digits/underscore only.
        // Prevents attribute injection (quotes/spaces) into admin HTML class="category-...".
        const VALID_CATEGORIES = [
            'ethics', 'rights', 'care_standards', 'emergency', 'safety', 'service_types',
            'communication', 'documentation', 'forms_of_service', 'quality',
            'accessibility', 'mobility', 'mission', 'spb_specific', 'general'
        ];
        const safeCategory = VALID_CATEGORIES.includes(category) ? category : 'general';

        const result = db.prepare(`
            INSERT INTO questions (question_text, option_a, option_b, option_c, option_d, correct_answer, category, explanation, reference_link, moderated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(
            trimmedQuestion,
            trimmedOptions[0], trimmedOptions[1], trimmedOptions[2], trimmedOptions[3],
            correct_answer,
            safeCategory,
            sanitizeString(explanation, 2000),
            sanitizeString(reference_link, 500)
        );

        res.json({ success: true, question_id: result.lastInsertRowid });
    } catch (error) {
        console.error('Error submitting question:', error);
        res.status(500).json({ error: 'Failed to submit question' });
    }
});

/**
 * POST /api/questions/:id/rate
 * Rate a question quality (1 = good, -1 = poor)
 */
app.post('/api/questions/:id/rate', requireUser, (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.userId;
        const { rating } = req.body;

        if (rating !== 1 && rating !== -1) {
            return res.status(400).json({ error: 'Rating must be 1 or -1' });
        }

        db.prepare(`
            INSERT OR REPLACE INTO question_ratings (question_id, user_id, rating)
            VALUES (?, ?, ?)
        `).run(id, user_id, rating);

        // Calculate aggregate rating
        const stats = db.prepare(`
            SELECT SUM(rating) as score, COUNT(*) as votes
            FROM question_ratings
            WHERE question_id = ?
        `).get(id);

        res.json({ success: true, score: stats.score || 0, votes: stats.votes || 0 });
    } catch (error) {
        console.error('Error rating question:', error);
        res.status(500).json({ error: 'Failed to rate question' });
    }
});

/**
 * POST /api/questions/:id/report
 * Report a question issue (wrong answer, unclear, etc.)
 */
app.post('/api/questions/:id/report', requireUser, (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.userId || req.body.user_id || null;
        const { reason, comment } = req.body;
        const trimmedReason = sanitizeString(reason, 100);
        const trimmedComment = sanitizeString(comment, 2000);

        if (!trimmedReason) {
            return res.status(400).json({ error: 'Reason required' });
        }

        const result = db.prepare(`
            INSERT INTO question_reports (question_id, user_id, reason, comment)
            VALUES (?, ?, ?, ?)
        `).run(id, user_id, trimmedReason, trimmedComment);

        res.json({ success: true, report_id: result.lastInsertRowid });
    } catch (error) {
        console.error('Error reporting question:', error);
        res.status(500).json({ error: 'Failed to report question' });
    }
});

/**
 * GET /api/questions/reports
 * Get all user reports for admin review
 */
app.get('/api/questions/reports', requireAdmin, (req, res) => {
    try {
        const reports = db.prepare(`
            SELECT qr.*, q.question_text
            FROM question_reports qr
            JOIN questions q ON qr.question_id = q.id
            ORDER BY qr.created_at DESC
        `).all();
        res.json({ reports });
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

/**
 * PUT /api/questions/reports/:id/status
 * Update report status (admin)
 */
app.put('/api/questions/reports/:id/status', requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status required' });
        }

        db.prepare('UPDATE question_reports SET status = ? WHERE id = ?').run(status, id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating report status:', error);
        res.status(500).json({ error: 'Failed to update report status' });
    }
});

/**
 * DELETE /api/questions/reports/:id
 * Delete a report (admin)
 */
app.delete('/api/questions/reports/:id', requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM question_reports WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

/**
 * POST /api/questions/:id/approve-to-bank
 * Approve a user-submitted question and move it to the default question bank
 */
app.post('/api/questions/:id/approve-to-bank', requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
        if (!q) {
            return res.status(404).json({ error: 'Question not found' });
        }

        db.prepare(`
            INSERT INTO default_questions (question_text, option_a, option_b, option_c, option_d,
                correct_answer, category, explanation, reference_link, difficulty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'medium')
        `).run(q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
             q.correct_answer, q.category || 'general', q.explanation || null, q.reference_link || null);

        db.prepare('UPDATE questions SET moderated = 1 WHERE id = ?').run(id);
        cache.delete('questions_true');
        cache.delete('questions_false');

        res.json({ success: true });
    } catch (error) {
        console.error('Error approving question to bank:', error);
        res.status(500).json({ error: 'Failed to approve question' });
    }
});

/**
 * DELETE /api/questions/:id
 * Delete a question (admin)
 */
app.delete('/api/questions/:id', requireAdmin, (req, res) => {
    try {
        const { id } = req.params;

        const deleteQuestion = db.transaction(() => {
            // Clean up related records first to avoid foreign key constraint errors
            db.prepare('DELETE FROM question_feedback WHERE question_id = ?').run(id);
            db.prepare('DELETE FROM question_ratings WHERE question_id = ?').run(id);
            db.prepare('DELETE FROM question_reports WHERE question_id = ?').run(id);
            db.prepare('DELETE FROM question_stats WHERE question_id = ?').run(id);
            db.prepare('DELETE FROM questions WHERE id = ?').run(id);
        });

        deleteQuestion();

        // Invalidate question caches
        cache.delete('questions_true');
        cache.delete('questions_false');

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting question:', error);
        res.status(500).json({ error: 'Failed to delete question' });
    }
});

/**
 * PUT /api/questions/:id
 * Update a question (admin)
 */
app.put('/api/questions/:id', requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { question_text, options, correct_answer, category, explanation, reference_link } = req.body;

        if (!question_text || !options || !Array.isArray(options) || options.length !== 4) {
            return res.status(400).json({ error: 'Invalid question format' });
        }

        const existing = db.prepare('SELECT id FROM questions WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Question not found' });
        }

        db.prepare(`
            UPDATE questions
            SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?,
                correct_answer = ?, category = ?, explanation = ?, reference_link = ?
            WHERE id = ?
        `).run(question_text, options[0], options[1], options[2], options[3], correct_answer,
             category || 'general', explanation || null, reference_link || null, id);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating question:', error);
        res.status(500).json({ error: 'Failed to update question' });
    }
});

/**
 * POST /api/questions/import
 * Bulk import questions (admin)
 */
app.post('/api/questions/import', requireAdmin, (req, res) => {
    try {
        const { questions } = req.body;
        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Invalid questions array' });
        }

        const insert = db.prepare(`
            INSERT OR REPLACE INTO questions (id, question_text, option_a, option_b, option_c, option_d,
                correct_answer, category, explanation, reference_link, moderated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `);

        const inserted = db.transaction((items) => {
            let count = 0;
            for (const q of items) {
                if (!q.question_text || !Array.isArray(q.options) || q.options.length !== 4) continue;
                insert.run(
                    q.id || null,
                    q.question_text,
                    q.options[0], q.options[1], q.options[2], q.options[3],
                    q.correct_answer,
                    q.category || 'general',
                    q.explanation || null,
                    q.reference_link || null
                );
                count++;
            }
            return count;
        });

        const count = inserted(questions);
        res.json({ success: true, imported: count });
    } catch (error) {
        console.error('Error importing questions:', error);
        res.status(500).json({ error: 'Failed to import questions' });
    }
});

/**
 * GET /api/default-questions
 * Get all default question bank entries (admin)
 */
app.get('/api/default-questions', requireAdmin, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, question_text, option_a, option_b, option_c, option_d,
                   correct_answer as correct, category, explanation, reference_link as reference, difficulty,
                   hint, wrong_explanations
            FROM default_questions
            ORDER BY id
        `).all();
        const questions = rows.map(q => {
            let wrongExplanations = [];
            try {
                wrongExplanations = q.wrong_explanations ? JSON.parse(q.wrong_explanations) : [];
            } catch (e) {
                wrongExplanations = [];
            }
            return {
                id: q.id,
                question: q.question_text,
                options: [q.option_a, q.option_b, q.option_c, q.option_d],
                correct: q.correct,
                category: q.category,
                explanation: q.explanation,
                reference: q.reference,
                difficulty: q.difficulty,
                hint: q.hint || '',
                wrong_explanations: wrongExplanations
            };
        });
        res.json({ questions });
    } catch (error) {
        console.error('Error fetching default questions:', error);
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

/**
 * POST /api/default-questions
 * Add a new question to the default bank (admin)
 */
app.post('/api/default-questions', requireAdmin, (req, res) => {
    try {
        const { question, options, correct, category, explanation, reference, difficulty, hint, wrong_explanations } = req.body;
        if (!question || !options || !Array.isArray(options) || options.length !== 4 || correct === undefined) {
            return res.status(400).json({ error: 'Invalid question format' });
        }
        const wrongJson = Array.isArray(wrong_explanations) ? JSON.stringify(wrong_explanations) : null;
        const result = db.prepare(`
            INSERT INTO default_questions (question_text, option_a, option_b, option_c, option_d,
                correct_answer, category, explanation, reference_link, difficulty, hint, wrong_explanations)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(question, options[0], options[1], options[2], options[3], correct,
             category || 'general', explanation || null, reference || null, difficulty || 'medium',
             hint || null, wrongJson);
        cache.delete('questions_public_v2');
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('Error adding default question:', error);
        res.status(500).json({ error: 'Failed to add question' });
    }
});

/**
 * PUT /api/default-questions/:id
 * Update a default question (admin)
 */
app.put('/api/default-questions/:id', requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { question, options, correct, category, explanation, reference, difficulty, hint, wrong_explanations } = req.body;
        if (!question || !options || !Array.isArray(options) || options.length !== 4 || correct === undefined) {
            return res.status(400).json({ error: 'Invalid question format' });
        }
        const existing = db.prepare('SELECT id FROM default_questions WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Question not found' });
        }
        const wrongJson = Array.isArray(wrong_explanations) ? JSON.stringify(wrong_explanations) : null;
        db.prepare(`
            UPDATE default_questions
            SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?,
                correct_answer = ?, category = ?, explanation = ?, reference_link = ?, difficulty = ?,
                hint = ?, wrong_explanations = ?
            WHERE id = ?
        `).run(question, options[0], options[1], options[2], options[3], correct,
             category || 'general', explanation || null, reference || null, difficulty || 'medium',
             hint || null, wrongJson, id);
        cache.delete('questions_public_v2');
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating default question:', error);
        res.status(500).json({ error: 'Failed to update question' });
    }
});

/**
 * DELETE /api/default-questions/:id
 * Delete a default question (admin)
 */
app.delete('/api/default-questions/:id', requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM default_questions WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting default question:', error);
        res.status(500).json({ error: 'Failed to delete question' });
    }
});

/**
 * POST /api/default-questions/import
 * Bulk import default questions (admin)
 */
app.post('/api/default-questions/import', requireAdmin, (req, res) => {
    try {
        const { questions } = req.body;
        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Invalid questions array' });
        }
        const insert = db.prepare(`
            INSERT OR REPLACE INTO default_questions (id, question_text, option_a, option_b, option_c, option_d,
                correct_answer, category, explanation, reference_link, difficulty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const inserted = db.transaction((items) => {
            let count = 0;
            for (const q of items) {
                const questionText = sanitizeString(q.question, 1000);
                if (!questionText || !Array.isArray(q.options) || q.options.length !== 4 || q.correct === undefined) continue;
                const options = q.options.map(o => sanitizeString(o, 500) || '');
                if (options.some(o => o === '')) continue;
                insert.run(
                    q.id || null,
                    questionText,
                    options[0], options[1], options[2], options[3],
                    q.correct,
                    sanitizeString(q.category) || 'general',
                    sanitizeString(q.explanation, 2000),
                    sanitizeString(q.reference, 500),
                    sanitizeString(q.difficulty) || 'medium'
                );
                count++;
            }
            return count;
        });
        const count = inserted(questions);
        cache.delete('questions_true');
        cache.delete('questions_false');
        res.json({ success: true, imported: count });
    } catch (error) {
        console.error('Error importing default questions:', error);
        res.status(500).json({ error: 'Failed to import questions' });
    }
});

/**
 * GET /api/export
 * Export user questions as JSON
 */
app.get('/api/export', requireAdmin, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, question_text, option_a, option_b, option_c, option_d,
                   correct_answer, category, explanation, reference_link, difficulty
            FROM default_questions
            ORDER BY id
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

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="quiz-questions.json"');
        res.json({ questions });
    } catch (error) {
        console.error('Error exporting questions:', error);
        res.status(500).json({ error: 'Failed to export questions' });
    }
});

/**
 * POST /api/auth/register
 * Register user with email
 */
    }
}

module.exports = register;
