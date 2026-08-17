function register(context) {
    with (context) {
app.get('/api/export/csv', requireAdmin, (req, res) => {
    try {
        const results = db.prepare(`
            SELECT r.id, r.username, r.score, r.total_questions, r.created_at
            FROM results r
            ORDER BY r.created_at DESC
        `).all();

        let csv = 'ID,Username,Score,Total,Date\n';
        results.forEach(r => {
            // Strip CSV-formula injection prefixes and escape quotes
            let safeUsername = (r.username || 'Аноним').replace(/"/g, '""');
            safeUsername = safeUsername.replace(/^[+=\-@\t\r]+/, '');
            csv += `${r.id},"${safeUsername}",${r.score},${r.total_questions},${r.created_at}\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="quiz-results.csv"');
        res.send('﻿' + csv); // UTF-8 BOM
    } catch (error) {
        console.error('Error exporting CSV:', error);
        res.status(500).json({ error: 'Failed to export CSV' });
    }
});

function csvSafe(value) {
    return String(value ?? '').replace(/^[+=\-@\t\r]+/, '').replace(/"/g, '""');
}

app.get('/api/qa/export.csv', requireAdmin, (req, res) => {
    try {
        const sessionId = String(req.query.session_id || '').trim().toUpperCase();
        const rows = sessionId
            ? db.prepare('SELECT session_id, text, status, votes, highlighted, created_at FROM qa_questions WHERE session_id = ? ORDER BY votes DESC, created_at').all(sessionId)
            : db.prepare('SELECT session_id, text, status, votes, highlighted, created_at FROM qa_questions ORDER BY created_at DESC').all();
        let csv = 'Session,Question,Status,Votes,Highlighted,Date\n';
        rows.forEach((row) => {
            csv += `"${csvSafe(row.session_id)}","${csvSafe(row.text)}","${csvSafe(row.status)}",${row.votes},${row.highlighted},${row.created_at}\n`;
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="qa-${sessionId || 'all'}.csv"`);
        res.send('﻿' + csv);
    } catch (error) {
        console.error('Error exporting Q&A CSV:', error);
        res.status(500).json({ error: 'Failed to export Q&A' });
    }
});

function parseDigestRange(fromValue, toValue) {
    const now = new Date();
    const from = fromValue ? new Date(fromValue) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = toValue ? new Date(toValue) : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return null;
    if (toValue && /^\d{4}-\d{2}-\d{2}$/.test(String(toValue))) to.setDate(to.getDate() + 1);
    return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * GET /api/seminar/digest?from=&to=
 * Admin-only daily summary. Does not expose email or other PII.
 */
app.get('/api/seminar/digest', requireAdmin, (req, res) => {
    try {
        const range = parseDigestRange(req.query.from, req.query.to);
        if (!range) return res.status(400).json({ error: 'Invalid date range' });

        const resultRows = db.prepare(`
            SELECT r.score, r.total_questions, r.answers_json, r.created_at,
                   COALESCE(u.display_name, r.username, 'Участник') AS display_name
            FROM results r
            LEFT JOIN users u ON u.id = r.user_id
            WHERE r.created_at >= datetime(?) AND r.created_at < datetime(?)
            ORDER BY r.created_at DESC
        `).all(range.from, range.to);

        const questionRows = db.prepare('SELECT id, category, correct_answer FROM default_questions').all();
        const questionMap = new Map(questionRows.map(q => [q.id, q]));
        const categoryTotals = new Map();
        resultRows.forEach((row) => {
            let answers = [];
            try { answers = JSON.parse(row.answers_json || '[]'); } catch (e) { answers = []; }
            answers.forEach((answer) => {
                const questionId = Number(answer.questionId ?? answer.question_id);
                const question = questionMap.get(questionId);
                if (!question || typeof answer.answer !== 'number') return;
                const stats = categoryTotals.get(question.category) || { category: question.category, answered: 0, correct: 0 };
                stats.answered++;
                if (answer.answer === question.correct_answer) stats.correct++;
                categoryTotals.set(question.category, stats);
            });
        });
        const weak_categories = Array.from(categoryTotals.values())
            .map(item => ({ ...item, accuracy_percent: item.answered ? Math.round(item.correct * 1000 / item.answered) / 10 : null }))
            .sort((a, b) => a.accuracy_percent - b.accuracy_percent)
            .slice(0, 5);

        const prepostRows = db.prepare(`
            SELECT user_id, phase, percentage, created_at
            FROM prepost_results
            WHERE created_at >= datetime(?) AND created_at < datetime(?)
            ORDER BY created_at
        `).all(range.from, range.to);
        const pairs = new Map();
        prepostRows.forEach(row => {
            const pair = pairs.get(row.user_id) || {};
            pair[row.phase] = row.percentage;
            pairs.set(row.user_id, pair);
        });
        const deltas = Array.from(pairs.values()).filter(p => Number.isFinite(p.pre) && Number.isFinite(p.post)).map(p => p.post - p.pre);
        const qa = db.prepare(`
            SELECT COUNT(DISTINCT s.id) AS sessions,
                   COUNT(q.id) AS submitted,
                   COALESCE(SUM(CASE WHEN q.status = 'approved' THEN 1 ELSE 0 END), 0) AS approved
            FROM qa_sessions s
            LEFT JOIN qa_questions q ON q.session_id = s.id
            WHERE s.created_at >= datetime(?) AND s.created_at < datetime(?)
        `).get(range.from, range.to);

        const average = resultRows.length
            ? Math.round(resultRows.reduce((sum, row) => sum + (row.total_questions > 0 ? row.score * 100 / row.total_questions : 0), 0) * 10 / resultRows.length) / 10
            : null;
        res.json({
            from: range.from,
            to: range.to,
            completed_quizzes: resultRows.length,
            average_percent: average,
            participants: resultRows.map(row => ({ display_name: row.display_name, percentage: Math.round(row.score * 1000 / row.total_questions) / 10, created_at: row.created_at })),
            weak_categories,
            prepost: {
                paired_participants: deltas.length,
                average_delta: deltas.length ? Math.round(deltas.reduce((a, b) => a + b, 0) * 10 / deltas.length) / 10 : null
            },
            qa: { sessions: qa.sessions || 0, submitted: qa.submitted || 0, approved: qa.approved || 0 }
        });
    } catch (error) {
        console.error('Error building seminar digest:', error);
        res.status(500).json({ error: 'Failed to build seminar digest' });
    }
});

/**
 * GET /api/stats/dashboard
 * Get dashboard statistics
 */
app.get('/api/stats/dashboard', requireAdmin, (req, res) => {
    try {
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        const totalQuizzes = db.prepare('SELECT COUNT(*) as count FROM results').get();
        const avgScore = db.prepare('SELECT AVG(score) as avg FROM results').get();
        const todayResults = db.prepare(`
            SELECT COUNT(*) as count FROM results
            WHERE DATE(created_at) = DATE('now')
        `).get();
        const topScore = db.prepare('SELECT MAX(score) as max FROM results').get();

        // Last 7 days activity
        const weeklyActivity = db.prepare(`
            SELECT
                DATE(created_at) as date,
                COUNT(*) as count,
                AVG(score) as avg_score
            FROM results
            WHERE DATE(created_at) >= DATE('now', '-7 days')
            GROUP BY DATE(created_at)
            ORDER BY date
        `).all();

        res.json({
            total_users: totalUsers.count,
            total_quizzes: totalQuizzes.count,
            average_score: Math.round((avgScore.avg || 0) * 10) / 10,
            today_results: todayResults.count,
            top_score: topScore.max || 0,
            weekly_activity: weeklyActivity
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    try {
        // Check database connection
        const dbCheck = db.prepare('SELECT 1').get();

        // Check memory usage
        const memUsage = process.memoryUsage();

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: dbCheck ? 'connected' : 'error',
            uptime: process.uptime(),
            memory: {
                heap_used: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
                heap_total: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
                rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB'
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'unhealthy', error: error.message });
    }
});

/**
 * GET /api/status
 * Extended status endpoint for the status page
 */
app.get('/api/status', (req, res) => {
    try {
        const counts = {
            users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
            questions: db.prepare('SELECT COUNT(*) AS c FROM default_questions').get().c,
            cases: db.prepare('SELECT COUNT(*) AS c FROM cases').get().c,
            results: db.prepare('SELECT COUNT(*) AS c FROM results').get().c,
            certificates: db.prepare('SELECT COUNT(*) AS c FROM certificates').get().c
        };
        const memUsage = process.memoryUsage();

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime_seconds: Math.round(process.uptime()),
            counts: {
                questions: counts.questions,
                cases: counts.cases
            },
            websocket_sessions: wss ? wss.clients.size : 0,
            recent_errors: []
        });
    } catch (error) {
        console.error('Error fetching status:', error);
        res.status(500).json({ status: 'unhealthy' });
    }
});

/**
 * GET /api/version
 * Get current question bank version
 */
app.get('/api/version', (req, res) => {
    try {
        const versionPath = path.join(__dirname, '../../version.json');
        const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        res.json({
            version: versionData.version,
            last_updated: versionData.last_updated,
            total_questions: versionData.total_questions,
            categories: versionData.categories,
            changes: versionData.changes
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read version info', message: error.message });
    }
});

/**
 * GET /api/seminar-packs
 * Named Kahoot/Pulse playlists for the two seminar talks (no correct answers).
 */
app.get('/api/seminar-packs', (req, res) => {
    try {
        const { loadSeminarPacks, publicPackSummary } = require('../seminar-packs');
        res.json({ packs: loadSeminarPacks().map(publicPackSummary) });
    } catch (error) {
        console.error('Seminar packs error:', error);
        res.status(500).json({ error: 'Failed to load seminar packs' });
    }
});

/**
 * GET /api/join/lookup?code=
 * Resolve a live PIN/code to the player page (Kahoot / Pulse / Q&A).
 */
app.get('/api/join/lookup', (req, res) => {
    const { gameSessions, pulseSessions, qaSessions } = require('../live-sessions');
    const code = String(req.query.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!code || code.length < 4) {
        return res.status(400).json({ found: false, error: 'code required' });
    }

    const matches = [];
    if (gameSessions.has(code)) {
        matches.push({
            type: 'kahoot',
            path: `/realtime-player.html?game=${encodeURIComponent(code)}`
        });
    }
    if (pulseSessions.has(code)) {
        matches.push({
            type: 'pulse',
            path: `/pulse-player.html?code=${encodeURIComponent(code)}`
        });
    }
    if (qaSessions.has(code)) {
        matches.push({
            type: 'qa',
            path: `/qa-player.html?code=${encodeURIComponent(code)}`
        });
    }

    if (matches.length === 1) {
        return res.json({ found: true, code, ...matches[0] });
    }
    if (matches.length > 1) {
        return res.json({ found: false, code, ambiguous: true, matches });
    }
    return res.json({ found: false, code });
});

        Object.assign(context, { csvSafe, parseDigestRange });
    }
}

module.exports = register;
