function register(context) {
    with (context) {
// ========== SPACED REPETITION (SM-2 Algorithm) ==========

/**
 * POST /api/spaced-repetition/review
 * Record a review and update the schedule
 */
app.post('/api/spaced-repetition/review', requireUser, (req, res) => {
    try {
        const user_id = req.userId;
        const { question_id, quality } = req.body;

        if (!question_id || quality === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (quality < 0 || quality > 5) {
            return res.status(400).json({ error: 'Quality must be between 0 and 5' });
        }

        // Get existing record or create default
        let record = db.prepare('SELECT * FROM spaced_repetition WHERE user_id = ? AND question_id = ?').get(user_id, question_id);

        if (!record) {
            record = {
                ease_factor: 2.5,
                interval: 1,
                repetitions: 0
            };
        }

        // SM-2 Algorithm
        let { ease_factor, interval, repetitions } = record;

        if (quality >= 3) {
            // Correct response
            if (repetitions === 0) {
                interval = 1;
            } else if (repetitions === 1) {
                interval = 6;
            } else {
                interval = Math.round(interval * ease_factor);
            }
            repetitions++;
        } else {
            // Incorrect response - reset
            repetitions = 0;
            interval = 1;
        }

        // Update ease factor
        ease_factor = Math.max(1.3, ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

        // Calculate next review date
        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + interval);

        // Upsert record
        db.prepare(`
            INSERT OR REPLACE INTO spaced_repetition
            (user_id, question_id, ease_factor, interval, repetitions, next_review_date, last_reviewed_at, quality)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        `).run(user_id, question_id, ease_factor, interval, repetitions, nextReviewDate.toISOString(), quality);

        res.json({
            success: true,
            next_review: nextReviewDate.toISOString(),
            interval,
            ease_factor,
            repetitions
        });
    } catch (error) {
        console.error('Error recording review:', error);
        res.status(500).json({ error: 'Failed to record review' });
    }
});

/**
 * GET /api/spaced-repetition/due
 * Get questions due for review
 */
app.get('/api/spaced-repetition/due', requireUser, (req, res) => {
    try {
        const user_id = req.userId;
        const limit = parseInt(req.query.limit) || 20;

        const dueQuestions = db.prepare(`
            SELECT sr.*, dq.question_text as question, dq.option_a, dq.option_b, dq.option_c, dq.option_d,
                   dq.correct_answer, dq.category, dq.explanation
            FROM spaced_repetition sr
            JOIN default_questions dq ON sr.question_id = dq.id
            WHERE sr.user_id = ? AND sr.next_review_date <= CURRENT_TIMESTAMP
            ORDER BY sr.next_review_date ASC
            LIMIT ?
        `).all(user_id, parseInt(limit));

        // Also get new questions to learn
        const learnedQuestionIds = db.prepare(`
            SELECT DISTINCT question_id FROM spaced_repetition WHERE user_id = ?
        `).all(user_id).map(row => row.question_id);

        let newQuestions = [];
        if (learnedQuestionIds.length < 50) {
            const placeholders = learnedQuestionIds.length > 0 ? learnedQuestionIds.map(() => '?').join(',') : 'NULL';
            const newLimit = parseInt(limit) - dueQuestions.length;

            if (newLimit > 0) {
                let newQuery = `
                    SELECT dq.id, dq.question_text as question, dq.option_a, dq.option_b, dq.option_c, dq.option_d,
                           dq.correct_answer, dq.category, dq.explanation,
                           0 as interval, 2.5 as ease_factor, 0 as repetitions
                    FROM default_questions dq
                    ${learnedQuestionIds.length > 0 ? `WHERE dq.id NOT IN (${placeholders})` : ''}
                    ORDER BY dq.id
                    LIMIT ?
                `;

                newQuestions = learnedQuestionIds.length > 0
                    ? db.prepare(newQuery).all(...learnedQuestionIds, newLimit)
                    : db.prepare(newQuery).all(newLimit);
            }
        }

        res.json({
            due: dueQuestions.map(formatSpacedRepCard),
            new: newQuestions.map(formatSpacedRepCard),
            total: dueQuestions.length + newQuestions.length,
            learned_count: learnedQuestionIds.length
        });
    } catch (error) {
        console.error('Error fetching due questions:', error);
        res.status(500).json({ error: 'Failed to fetch due questions' });
    }
});

/**
 * GET /api/spaced-repetition/stats
 * Get spaced repetition statistics
 */
app.get('/api/spaced-repetition/stats', requireUser, (req, res) => {
    try {
        const user_id = req.userId;

        const stats = db.prepare(`
            SELECT
                COUNT(*) as total_cards,
                SUM(CASE WHEN next_review_date <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END) as due_today,
                SUM(CASE WHEN repetitions >= 3 THEN 1 ELSE 0 END) as mature_cards,
                AVG(ease_factor) as avg_ease_factor
            FROM spaced_repetition
            WHERE user_id = ?
        `).get(user_id);

        // Get by category
        const byCategory = db.prepare(`
            SELECT
                dq.category,
                COUNT(*) as count,
                SUM(CASE WHEN next_review_date <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END) as due,
                AVG(ease_factor) as avg_ease
            FROM spaced_repetition sr
            JOIN default_questions dq ON sr.question_id = dq.id
            WHERE sr.user_id = ?
            GROUP BY dq.category
        `).all(user_id);

        res.json({
            total_cards: stats.total_cards || 0,
            due_today: stats.due_today || 0,
            mature_cards: stats.mature_cards || 0,
            avg_ease_factor: (stats.avg_ease_factor || 2.5).toFixed(2),
            by_category: byCategory
        });
    } catch (error) {
        console.error('Error fetching SR stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ========== ADAPTIVE TESTING ==========

/**
 * POST /api/quiz/adaptive/start
 * Start an adaptive quiz session
 */
app.post('/api/quiz/adaptive/start', requireUser, (req, res) => {
    try {
        const user_id = req.userId;
        // Support both single category and array of categories (for role-based filtering)
        let categories = null;
        if (Array.isArray(req.body.categories)) {
            categories = req.body.categories.filter(c => typeof c === 'string' && c.length > 0);
        } else if (typeof req.body.category === 'string' && req.body.category !== 'general') {
            categories = [req.body.category];
        }

        // Get user's historical performance
        const userHistory = db.prepare(`
            SELECT AVG(score) as avg_score, COUNT(*) as quiz_count
            FROM results
            WHERE user_id = ?
        `).get(user_id);

        const baselineScore = userHistory.avg_score || 25; // Default to 50%
        const quizCount = userHistory.quiz_count || 0;

        // Determine starting difficulty
        let startingLevel;
        if (baselineScore >= 45) startingLevel = 'hard';
        else if (baselineScore >= 35) startingLevel = 'medium';
        else startingLevel = 'easy';

        // Select appropriate questions
        let questionQuery = `
            SELECT id, question_text as question, option_a, option_b, option_c, option_d,
                   correct_answer, category, explanation, difficulty
            FROM default_questions
        `;
        const params = [];

        if (categories && categories.length > 0) {
            const placeholders = categories.map(() => '?').join(',');
            questionQuery += ` WHERE category IN (${placeholders})`;
            params.push(...categories);
        }

        questionQuery += ' ORDER BY id LIMIT 100';

        const allQuestions = db.prepare(questionQuery).all(...params);

        // Split by difficulty - use stats if available, otherwise use question difficulty field
        const easyQuestions = [];
        const mediumQuestions = [];
        const hardQuestions = [];

        // Fetch stats for all candidate questions in one query (avoid N+1)
        const questionIds = allQuestions.map(q => q.id);
        const placeholders = questionIds.map(() => '?').join(',');
        const statsRows = questionIds.length > 0
            ? db.prepare(`SELECT question_id, times_correct, times_answered FROM question_stats WHERE question_id IN (${placeholders})`).all(...questionIds)
            : [];
        const statsMap = new Map(statsRows.map(s => [s.question_id, s]));

        allQuestions.forEach(q => {
            const stat = statsMap.get(q.id);
            if (stat && stat.times_answered >= 5) {
                const accuracy = stat.times_correct / stat.times_answered;
                if (accuracy >= 0.7) easyQuestions.push(q);
                else if (accuracy >= 0.4) mediumQuestions.push(q);
                else hardQuestions.push(q);
            } else {
                // Use question difficulty field as fallback for new questions
                const difficulty = q.difficulty || 'medium';
                if (difficulty === 'easy') easyQuestions.push(q);
                else if (difficulty === 'hard') hardQuestions.push(q);
                else mediumQuestions.push(q);
            }
        });

        const sessionId = crypto.randomBytes(16).toString('hex');
        db.prepare('INSERT INTO adaptive_sessions (id, user_id) VALUES (?, ?)').run(sessionId, user_id);

        res.json({
            session_id: sessionId,
            starting_level: startingLevel,
            baseline_score: baselineScore,
            question_pools: {
                easy: easyQuestions.length,
                medium: mediumQuestions.length,
                hard: hardQuestions.length
            }
        });
    } catch (error) {
        console.error('Error starting adaptive quiz:', error);
        res.status(500).json({ error: 'Failed to start adaptive quiz' });
    }
});

/**
 * POST /api/quiz/adaptive/next
 * Get next adaptive question based on performance
 */
app.post('/api/quiz/adaptive/next', requireUser, (req, res) => {
    try {
        const { session_id, recent_answers } = req.body;
        const user_id = req.userId;
        // Support both single category and array (role-based filtering)
        let categories = null;
        if (Array.isArray(req.body.categories)) {
            categories = req.body.categories.filter(c => typeof c === 'string' && c.length > 0);
        } else if (typeof req.body.category === 'string' && req.body.category !== 'general') {
            categories = [req.body.category];
        }

        // Calculate recent performance
        const recentCorrect = recent_answers ? recent_answers.filter(a => a).length : 0;
        const recentTotal = recent_answers ? recent_answers.length : 0;
        const recentAccuracy = recentTotal > 0 ? recentCorrect / recentTotal : 0.5;

        // Determine current difficulty level
        let targetLevel;
        if (recentAccuracy >= 0.7) targetLevel = 'hard';
        else if (recentAccuracy >= 0.4) targetLevel = 'medium';
        else targetLevel = 'easy';

        // Get questions for target level
        let questionQuery = `
            SELECT dq.id, dq.question_text as question, dq.option_a, dq.option_b, dq.option_c, dq.option_d,
                   dq.correct_answer, dq.category, dq.explanation,
                   COALESCE(qs.times_correct, 0) as times_correct,
                   COALESCE(qs.times_answered, 0) as times_answered
            FROM default_questions dq
            LEFT JOIN question_stats qs ON dq.id = qs.question_id
        `;

        const params = [];
        const conditions = [];

        if (categories && categories.length > 0) {
            const placeholders = categories.map(() => '?').join(',');
            conditions.push(`dq.category IN (${placeholders})`);
            params.push(...categories);
        }

        // Filter by difficulty based on stats
        if (targetLevel === 'easy') {
            conditions.push('(qs.times_answered < 5 OR (qs.times_correct * 1.0 / qs.times_answered) >= 0.7)');
        } else if (targetLevel === 'hard') {
            conditions.push('qs.times_answered >= 5 AND (qs.times_correct * 1.0 / qs.times_answered) < 0.4');
        } else {
            conditions.push('(qs.times_answered < 5 OR ((qs.times_correct * 1.0 / qs.times_answered) >= 0.4 AND (qs.times_correct * 1.0 / qs.times_answered) < 0.7))');
        }

        if (conditions.length > 0) {
            questionQuery += ' WHERE ' + conditions.join(' AND ');
        }

        questionQuery += ' ORDER BY RANDOM() LIMIT 1';

        const question = db.prepare(questionQuery).get(...params);

        if (!question) {
            // Fallback to any question if no match
            let fallbackQuery = `
                SELECT id, question_text as question, option_a, option_b, option_c, option_d,
                       correct_answer, category, explanation
                FROM default_questions
            `;
            const fallbackParams = [];
            if (categories && categories.length > 0) {
                const placeholders = categories.map(() => '?').join(',');
                fallbackQuery += ` WHERE category IN (${placeholders})`;
                fallbackParams.push(...categories);
            }
            fallbackQuery += ' ORDER BY RANDOM() LIMIT 1';
            const fallbackQuestion = db.prepare(fallbackQuery).get(...fallbackParams);

            return res.json({
                question: formatPublicQuestionRow(fallbackQuestion),
                current_level: targetLevel,
                confidence: 0.5
            });
        }

        res.json({
            question: formatPublicQuestionRow(question),
            current_level: targetLevel,
            confidence: question.times_answered >= 5 ? Math.min(0.95, question.times_answered / 10) : 0.5
        });
    } catch (error) {
        console.error('Error getting adaptive question:', error);
        res.status(500).json({ error: 'Failed to get adaptive question' });
    }
});

// ========== COMPETENCY MATRIX ==========

/**
 * POST /api/competency/update
 * Update competency matrix after quiz
 */
app.post('/api/competency/update', requireUser, (req, res) => {
    try {
        const user_id = req.userId;
        const { answers } = req.body;

        if (!answers || !Array.isArray(answers)) {
            return res.status(400).json({ error: 'Invalid request' });
        }

        // Server-side verification: look up each question and compute correctness/category.
        // Reject client-trusted is_correct to prevent competency inflation.
        const categoryStats = {};
        for (const answer of answers) {
            if (typeof answer.questionId !== 'number' || typeof answer.answer !== 'number') {
                return res.status(400).json({ error: 'Malformed answer entry' });
            }
            if (answer.answer < 0 || answer.answer > 3) {
                continue;
            }
            const question = db.prepare(`
                SELECT correct_answer, category FROM default_questions WHERE id = ?
            `).get(answer.questionId);
            if (!question) {
                // Skip unknown questions rather than failing the whole batch
                continue;
            }
            const cat = question.category || 'general';
            if (!categoryStats[cat]) {
                categoryStats[cat] = { correct: 0, total: 0 };
            }
            categoryStats[cat].total++;
            if (answer.answer === question.correct_answer) {
                categoryStats[cat].correct++;
            }
        }

        // Update competency matrix atomically
        const updateCompetency = db.transaction((categories) => {
            const insert = db.prepare(`
                INSERT INTO competency_matrix (user_id, category, correct_count, total_count)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, category) DO UPDATE SET
                    correct_count = correct_count + excluded.correct_count,
                    total_count = total_count + excluded.total_count,
                    last_updated = CURRENT_TIMESTAMP
            `);
            Object.keys(categories).forEach(category => {
                const stats = categories[category];
                insert.run(user_id, category, stats.correct, stats.total);
            });
        });

        updateCompetency(categoryStats);

        res.json({ success: true, updated_categories: Object.keys(categoryStats) });
    } catch (error) {
        console.error('Error updating competency:', error);
        res.status(500).json({ error: 'Failed to update competency' });
    }
});

/**
 * GET /api/competency/:user_id
 * Get user competency matrix
 */
app.get('/api/competency/:user_id', requireOwner, (req, res) => {
    try {
        const { user_id } = req.params;

        const competencies = db.prepare(`
            SELECT category, correct_count, total_count,
                   ROUND((correct_count * 100.0 / total_count), 1) as proficiency_percent
            FROM competency_matrix
            WHERE user_id = ?
            ORDER BY category
        `).all(user_id);

        // Calculate overall proficiency
        let totalCorrect = 0, totalQuestions = 0;
        competencies.forEach(c => {
            totalCorrect += c.correct_count;
            totalQuestions += c.total_count;
        });

        const overallProficiency = totalQuestions > 0 ? (totalCorrect / totalQuestions * 100).toFixed(1) : 0;

        // Generate recommendations
        const recommendations = competencies
            .filter(c => c.proficiency_percent < 60)
            .map(c => ({
                category: c.category,
                current_score: c.proficiency_percent,
                priority: c.proficiency_percent < 40 ? 'high' : 'medium',
                suggested_actions: [
                    'Пройдите вопросы по этой категории в режиме обучения',
                    'Используйте карточки для запоминания',
                    'Изучите справочные материалы по теме'
                ]
            }));

        res.json({
            user_id,
            overall_proficiency: parseFloat(overallProficiency),
            competencies,
            recommendations,
            total_questions_answered: totalQuestions
        });
    } catch (error) {
        console.error('Error fetching competency:', error);
        res.status(500).json({ error: 'Failed to fetch competency' });
    }
});

/**
 * GET /api/competency/department/:dept_name
 * Get department-level competency matrix (for managers)
 */
app.get('/api/competency/department/:dept_name', requireAdmin, (req, res) => {
    try {
        const { dept_name } = req.params;

        const deptUsers = db.prepare(`
            SELECT id, display_name, total_score, quizzes_completed
            FROM users
            WHERE organization LIKE ? ESCAPE '\\'
        `).all(`%${escapeLike(dept_name)}%`);

        const userIds = deptUsers.map(u => u.id);

        if (userIds.length === 0) {
            return res.json({
                department: dept_name,
                total_members: 0,
                categories: []
            });
        }

        const placeholders = userIds.map(() => '?').join(',');
        const categories = db.prepare(`
            SELECT category,
                   SUM(correct_count) as total_correct,
                   SUM(total_count) as total_questions,
                   COUNT(DISTINCT user_id) as member_count
            FROM competency_matrix
            WHERE user_id IN (${placeholders})
            GROUP BY category
            ORDER BY category
        `).all(...userIds);

        const formattedCategories = categories.map(c => ({
            category: c.category,
            proficiency_percent: ((c.total_correct / c.total_questions) * 100).toFixed(1),
            total_questions: c.total_questions,
            coverage_percent: ((c.member_count / userIds.length) * 100).toFixed(1)
        }));

        res.json({
            department: dept_name,
            total_members: userIds.length,
            categories: formattedCategories,
            top_performers: deptUsers.slice(0, 5).map(u => ({
                id: u.id,
                name: u.display_name,
                score: u.total_score,
                quizzes: u.quizzes_completed
            }))
        });
    } catch (error) {
        console.error('Error fetching department competency:', error);
        res.status(500).json({ error: 'Failed to fetch department competency' });
    }
});

// ========== CERTIFICATES ==========

/**
 * POST /api/certificates/generate
 * Generate a certificate for a completed quiz
 */
app.post('/api/certificates/generate', requireUser, (req, res) => {
    try {
        const user_id = req.userId;
        const { score, total_questions } = req.body;

        if (typeof score !== 'number' || typeof total_questions !== 'number') {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (score < 0 || total_questions <= 0 || score > total_questions) {
            return res.status(400).json({ error: 'Invalid score or total_questions' });
        }

        // Verify the user exists to satisfy foreign key constraint
        const user = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(user_id);
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        const percentage = (score / total_questions) * 100;

        // Only generate certificates for scores >= 90%
        if (percentage < 90) {
            return res.status(400).json({ error: 'Certificate requires 90%+ score' });
        }

        // Anti-forgery: require a matching recent result and insert atomically
        const generateCert = db.transaction(() => {
            const recentResult = db.prepare(`
                SELECT id FROM results
                WHERE user_id = ? AND score = ? AND total_questions = ? AND created_at >= datetime('now', '-24 hours')
                ORDER BY created_at DESC
                LIMIT 1
            `).get(user_id, score, total_questions);

            if (!recentResult) {
                throw new Error('No matching quiz result found');
            }

            // Check if certificate already exists for this result to ensure idempotency
            const existing = db.prepare(`
                SELECT id FROM certificates
                WHERE user_id = ? AND score = ? AND total_questions = ? AND issue_date >= datetime('now', '-24 hours')
                ORDER BY issue_date DESC
                LIMIT 1
            `).get(user_id, score, total_questions);

            if (existing) {
                return existing.id;
            }

            // Generate unique verification code
            const verificationCode = crypto.randomBytes(16).toString('hex').toUpperCase();
            const certId = `CERT_${Date.now()}_${verificationCode.substring(0, 8)}`;

            // Save certificate record
            db.prepare(`
                INSERT INTO certificates (id, user_id, score, total_questions, percentage, verification_code)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(certId, user_id, score, total_questions, percentage, verificationCode);

            return certId;
        });

        const certId = generateCert();
        const cert = db.prepare('SELECT * FROM certificates WHERE id = ?').get(certId);

        res.json({
            success: true,
            certificate_id: certId,
            verification_code: cert.verification_code,
            issue_date: new Date().toISOString(),
            score: `${score}/${total_questions} (${percentage.toFixed(1)}%)`,
            download_url: `/api/certificates/${certId}/download`
        });
    } catch (error) {
        if (error.message === 'No matching quiz result found') {
            return res.status(400).json({ error: 'No matching quiz result found. Certificate can only be generated for a recently completed quiz.' });
        }
        console.error('Error generating certificate:', error);
        res.status(500).json({ error: 'Failed to generate certificate' });
    }
});

/**
 * GET /api/certificates/search
 * Search certificate by verification code
 */
app.get('/api/certificates/search', certRateLimitMiddleware, (req, res) => {
    try {
        const { code } = req.query;

        if (!code) {
            return res.status(400).json({ error: 'Verification code required' });
        }

        const cert = db.prepare(`
            SELECT c.*, u.display_name, u.organization
            FROM certificates c
            JOIN users u ON c.user_id = u.id
            WHERE c.verification_code = ?
        `).get(code.toUpperCase());

        if (!cert) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        res.json({
            certificate: {
                id: cert.id,
                holder_name: cert.display_name,
                organization: cert.organization,
                score: `${cert.score}/${cert.total_questions}`,
                percentage: cert.percentage,
                issue_date: cert.issue_date,
                verification_code: cert.verification_code
            }
        });
    } catch (error) {
        console.error('Error searching certificate:', error);
        res.status(500).json({ error: 'Failed to search certificate' });
    }
});

/**
 * GET /api/certificates/:cert_id/verify
 * Verify a certificate
 */
app.get('/api/certificates/:cert_id/verify', certRateLimitMiddleware, (req, res) => {
    try {
        const { cert_id } = req.params;

        const cert = db.prepare(`
            SELECT c.*, u.display_name, u.organization
            FROM certificates c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `).get(cert_id);

        if (!cert) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        res.json({
            valid: true,
            certificate: {
                id: cert.id,
                holder_name: cert.display_name,
                organization: cert.organization,
                score: `${cert.score}/${cert.total_questions}`,
                percentage: cert.percentage,
                issue_date: cert.issue_date,
                verification_code: cert.verification_code
            }
        });
    } catch (error) {
        console.error('Error verifying certificate:', error);
        res.status(500).json({ error: 'Failed to verify certificate' });
    }
});

/**
 * GET /api/certificates/:cert_id/download
 * Return a printable HTML certificate (browsers can print/save as PDF)
 */
app.get('/api/certificates/:cert_id/download', (req, res) => {
    try {
        const { cert_id } = req.params;

        const cert = db.prepare(`
            SELECT c.*, u.display_name, u.organization
            FROM certificates c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `).get(cert_id);

        if (!cert) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        const host = req.get('host') || process.env.PUBLIC_HOST || 'localhost';
        const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
        const baseUrl = `${protocol}://${host}`;

        const issueDate = cert.issue_date
            ? new Date(cert.issue_date).toLocaleDateString('ru-RU')
            : new Date().toLocaleDateString('ru-RU');
        const percentage = Number(cert.percentage || 0).toFixed(1);

        const html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Сертификат — ${escapeHtml(cert.display_name || 'Участник')}</title>
    <style>
        @page { size: A4 landscape; margin: 0; }
        body { margin: 0; font-family: Georgia, serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .certificate { width: 90%; max-width: 1000px; background: #fff; border: 12px double #1a5276; padding: 50px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); text-align: center; }
        .header { color: #1a5276; font-size: 18px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px; }
        .title { font-size: 46px; font-weight: bold; color: #1a5276; margin: 20px 0; }
        .subtitle { font-size: 20px; color: #555; margin-bottom: 30px; }
        .name { font-size: 34px; font-weight: bold; color: #333; margin: 30px 0; border-bottom: 2px solid #1a5276; display: inline-block; padding: 0 40px 10px; }
        .details { font-size: 18px; color: #444; margin: 25px 0; line-height: 1.6; }
        .score { font-size: 28px; color: #1a5276; font-weight: bold; margin: 20px 0; }
        .footer { margin-top: 50px; display: flex; justify-content: space-between; font-size: 16px; color: #666; }
        .verify { margin-top: 30px; font-size: 14px; color: #777; }
        .no-print { margin-top: 30px; }
        @media print { .no-print { display: none; } body { background: #fff; } .certificate { box-shadow: none; border: 10px double #1a5276; } }
        button { padding: 12px 24px; font-size: 16px; cursor: pointer; background: #1a5276; color: #fff; border: none; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="certificate">
        <div class="header">GLM Quiz App</div>
        <div class="title">Сертификат</div>
        <div class="subtitle">подтверждает, что</div>
        <div class="name">${escapeHtml(cert.display_name || 'Участник')}</div>
        <div class="details">
            ${cert.organization ? `организация: <strong>${escapeHtml(cert.organization)}</strong><br>` : ''}
            успешно завершил(а) викторину по социальному обслуживанию
        </div>
        <div class="score">Результат: ${cert.score} из ${cert.total_questions} (${percentage}%)</div>
        <div class="footer">
            <span>Дата выдачи: <strong>${issueDate}</strong></span>
            <span>Код проверки: <strong>${cert.verification_code}</strong></span>
        </div>
        <div class="verify">Проверить подлинность: ${baseUrl}/verify-certificate.html</div>
        <div class="no-print"><button onclick="window.print()">Сохранить / Печать PDF</button></div>
    </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('Error downloading certificate:', error);
        res.status(500).json({ error: 'Failed to download certificate' });
    }
});

/**
 * GET /api/certificates/user/:user_id
 * Get all certificates for a user
 */
app.get('/api/certificates/user/:user_id', requireOwner, (req, res) => {
    try {
        const { user_id } = req.params;

        const certificates = db.prepare(`
            SELECT id, score, total_questions, percentage, issue_date, verification_code
            FROM certificates
            WHERE user_id = ?
            ORDER BY issue_date DESC
        `).all(user_id);

        res.json({ certificates });
    } catch (error) {
        console.error('Error fetching user certificates:', error);
        res.status(500).json({ error: 'Failed to fetch certificates' });
    }
});

// ========== MANAGER DASHBOARD ==========

/**
 * GET /api/dashboard/manager
 * Get comprehensive dashboard data for managers
 */
    }
}

module.exports = register;
