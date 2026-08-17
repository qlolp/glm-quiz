/**
 * GLM Quiz — API end-to-end test
 * Usage: BASE_URL=http://147.45.174.206 ADMIN_PASSWORD=quizadmin2024 node tests/api-e2e.test.js
 */

const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'quizadmin2024';
const API_BASE = `${BASE_URL}/api`;

let passed = 0;
let failed = 0;

function request(path, method = 'GET', body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const options = {
            hostname: url.hostname,
            port: url.port || (BASE_URL.startsWith('https') ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${message}`);
    } else {
        failed++;
        console.log(`  ❌ ${message}`);
    }
}

function buildAnswers(count, correct = true) {
    return Array.from({ length: count }, (_, i) => ({
        questionId: i + 1,
        correct
    }));
}

async function runTests() {
    console.log(`\n🧪 GLM Quiz API E2E Tests\nBase: ${BASE_URL}\n`);

    const health = await request('/api/health');
    assert(health.status === 200 && health.body.status === 'healthy', 'Health check');

    const version = await request('/api/version');
    assert(version.status === 200 && version.body.version, 'Version endpoint');

    const questions = await request('/api/questions');
    assert(questions.status === 200 && Array.isArray(questions.body.questions) && questions.body.questions.length === 84, 'Questions: 84 items');

    const cases = await request('/api/cases');
    assert(cases.status === 200 && Array.isArray(cases.body.cases) && cases.body.cases.length >= 3, 'Cases: >= 3');

    const email = `test_${Date.now()}@example.com`;
    const register = await request('/api/auth/register', 'POST', {
        email,
        fio: 'Test User',
        organization: 'Test Org'
    });
    assert(register.status === 200 && register.body.success && register.body.user.id, 'Register user');
    const userId = register.body.user.id;

    const verify = await request('/api/auth/verify', 'POST', { email, code: '1234' });
    assert(verify.status === 200 && verify.body.success && verify.body.token, 'Verify with demo code 1234');
    const userToken = verify.body.token;

    const registerDup = await request('/api/auth/register', 'POST', { email, fio: 'Test User' });
    assert(registerDup.status === 200 && registerDup.body.exists === true, 'Duplicate register returns existing');

    const guest = await request('/api/users', 'POST', { username: `guest_${Date.now()}`, display_name: 'Guest' });
    assert(guest.status === 200 && guest.body.user && guest.body.token, 'Guest user receives token');

    const complete = await request('/api/quiz/complete', 'POST', {
        score: 18,
        total_questions: 20,
        answers: buildAnswers(20, true).map((a, i) => ({ ...a, correct: i < 18 }))
    }, userToken);
    assert(complete.status === 200 && complete.body.success, 'Complete quiz with token');

    const completeNoAuth = await request('/api/quiz/complete', 'POST', {
        score: 18,
        total_questions: 20,
        answers: buildAnswers(20, true)
    });
    assert(completeNoAuth.status === 401, 'Complete quiz without token rejected');

    const cert = await request('/api/certificates/generate', 'POST', {
        score: 18,
        total_questions: 20
    }, userToken);
    assert(cert.status === 200 && cert.body.success && cert.body.certificate_id, 'Generate certificate with matching result');

    const certForgery = await request('/api/certificates/generate', 'POST', {
        score: 19,
        total_questions: 20
    }, userToken);
    assert(certForgery.status === 400, 'Certificate forgery rejected');

    const caseProgress = await request('/api/cases/case_001/progress', 'POST', {
        user_id: userId,
        score: 4,
        completed: true
    });
    assert(caseProgress.status === 200 && caseProgress.body.success, 'Case progress saved');

    const invalidCase = await request('/api/cases/case_001/progress', 'POST', {
        user_id: 'nonexistent_user',
        score: 4,
        completed: true
    });
    assert(invalidCase.status === 400, 'Case progress rejects invalid user');

    const submitQ = await request('/api/questions/submit', 'POST', {
        question_text: 'Test question?',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 0,
        category: 'ethics',
        explanation: 'Because',
        user_id: userId
    });
    assert(submitQ.status === 200 && submitQ.body.success, 'Submit user question');

    const feedback = await request('/api/feedback', 'POST', {
        question_id: submitQ.body.question_id,
        feedback_type: 'unclear',
        comment: 'Test feedback',
        user_id: userId
    });
    assert(feedback.status === 200 && feedback.body.success, 'Submit feedback');

    const adminAuth = await request('/api/auth/admin', 'POST', { password: ADMIN_PASSWORD });
    assert(adminAuth.status === 200 && adminAuth.body.valid && adminAuth.body.token, 'Admin auth');
    const adminToken = adminAuth.body.token;

    const batch = await request('/api/batch-register', 'POST', {
        participants: [
            { name: 'Batch One', email: `batch1_${Date.now()}@example.com`, role: 'user', organization: 'Org1' },
            { name: 'Batch Two', email: `batch2_${Date.now()}@example.com`, role: 'user', organization: 'Org2' }
        ]
    }, adminToken);
    assert(batch.status === 200 && batch.body.imported === 2, 'Batch register 2 users with admin token');

    const batchNoAuth = await request('/api/batch-register', 'POST', {
        participants: [{ name: 'X', email: `x_${Date.now()}@example.com` }]
    });
    assert(batchNoAuth.status === 401, 'Batch register without admin token rejected');

    const leaderboard = await request('/api/leaderboard');
    assert(leaderboard.status === 200 && Array.isArray(leaderboard.body.leaderboard), 'Leaderboard');

    const dashboard = await request('/api/dashboard/manager?department=Org1');
    assert(dashboard.status === 200 && dashboard.body.overview, 'Manager dashboard');

    if (cert.body.certificate_id) {
        const download = await request(`/api/certificates/${cert.body.certificate_id}/download`);
        assert(download.status === 200 && typeof download.body === 'string' && download.body.includes('verify-certificate'), 'Certificate HTML download');
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test runner error:', err.message);
    process.exit(1);
});
