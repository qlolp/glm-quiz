function register(context) {
    with (context) {
app.get('/api/dashboard/manager', requireAdmin, (req, res) => {
    try {
        const { department, date_from, date_to } = req.query;

        // Date filtering
        let dateFilter = '';
        const dateParams = [];
        if (date_from) {
            dateFilter = ' AND DATE(created_at) >= ?';
            dateParams.push(date_from);
        }
        if (date_to) {
            dateFilter += ' AND DATE(created_at) <= ?';
            dateParams.push(date_to);
        }

        // Base metrics
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        const totalQuizzes = db.prepare('SELECT COUNT(*) as count FROM results').get();
        const avgScore = db.prepare('SELECT AVG(score) as avg FROM results').get();

        // Recent activity
        const recentActivity = db.prepare(`
            SELECT username, score, total_questions, created_at
            FROM results
            WHERE 1=1 ${dateFilter}
            ORDER BY created_at DESC
            LIMIT 20
        `).all(...dateParams);

        // Top performers
        const topPerformers = db.prepare(`
            SELECT id, username, display_name, total_score, quizzes_completed
            FROM users
            WHERE total_score > 0
            ORDER BY total_score DESC
            LIMIT 10
        `).all();

        // Department breakdown (if applicable)
        let departmentStats = [];
        if (department) {
            departmentStats = db.prepare(`
                SELECT
                    COUNT(DISTINCT r.id) as quiz_count,
                    AVG(r.score) as avg_score,
                    MAX(r.score) as max_score
                FROM results r
                JOIN users u ON r.user_id = u.id
                WHERE u.organization LIKE ? ESCAPE '\\' ${dateFilter}
            `).all(`%${escapeLike(department)}%`, ...dateParams);
        }

        // Category performance
        const categoryPerformance = db.prepare(`
            SELECT
                dq.category,
                COUNT(qs.question_id) as question_count,
                AVG(CAST(qs.times_correct AS REAL) / qs.times_answered) * 100 as avg_accuracy
            FROM question_stats qs
            JOIN default_questions dq ON qs.question_id = dq.id
            WHERE qs.times_answered >= 5
            GROUP BY dq.category
            ORDER BY avg_accuracy ASC
        `).all();

        // Weekly activity trend
        const weeklyTrend = db.prepare(`
            SELECT
                DATE(created_at) as date,
                COUNT(*) as quiz_count,
                AVG(score) as avg_score
            FROM results
            WHERE DATE(created_at) >= DATE('now', '-7 days')
            GROUP BY DATE(created_at)
            ORDER BY date
        `).all();

        // Weak areas (categories with low performance)
        const weakAreas = categoryPerformance
            .filter(c => c.avg_accuracy < 60)
            .map(c => ({
                category: c.category,
                accuracy: c.avg_accuracy.toFixed(1),
                priority: c.avg_accuracy < 40 ? 'critical' : 'attention'
            }));

        res.json({
            overview: {
                total_users: totalUsers.count,
                total_quizzes: totalQuizzes.count,
                average_score: (avgScore.avg || 0).toFixed(1),
                completion_rate: totalUsers.count > 0 ? ((totalQuizzes.count / totalUsers.count) * 100).toFixed(1) : 0
            },
            recent_activity: recentActivity,
            top_performers: topPerformers,
            department_stats: departmentStats,
            category_performance: categoryPerformance,
            weak_areas: weakAreas,
            weekly_trend: weeklyTrend
        });
    } catch (error) {
        console.error('Error fetching manager dashboard:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// Removed AI generator — explicitly return 404 so it doesn't fall back to index.html
    }
}

module.exports = register;
