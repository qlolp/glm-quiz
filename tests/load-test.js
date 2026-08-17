/**
 * GLM Quiz — Simple load test
 * Usage: BASE_URL=http://147.45.174.206 node tests/load-test.js [concurrency] [durationSeconds]
 */

const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CONCURRENCY = parseInt(process.argv[2], 10) || 30;
const DURATION_MS = (parseInt(process.argv[3], 10) || 30) * 1000;

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

async function userScenario(id) {
    const guest = await request('/api/users', 'POST', {
        username: `load_${id}_${Date.now()}`,
        display_name: `Load ${id}`
    });
    if (!guest.body || !guest.body.token) throw new Error('Guest failed');
    const token = guest.body.token;

    const questions = await request('/api/questions');
    if (!questions.body || !questions.body.questions.length) throw new Error('Questions failed');

    const q1 = questions.body.questions[0];
    const check = await request('/api/quiz/check-answer', 'POST', { questionId: q1.id, answer: 0 });
    if (check.status !== 200) throw new Error('Check-answer failed');

    const complete = await request('/api/quiz/complete', 'POST', {
        score: 1,
        total_questions: 1,
        answers: [{ questionId: q1.id, answer: check.body.correctIndex }]
    }, token);
    if (!complete.body || !complete.body.success) throw new Error('Complete failed');

    return true;
}

async function runWorker(workerId, endTime) {
    let count = 0;
    let errors = 0;
    while (Date.now() < endTime) {
        try {
            await userScenario(`${workerId}_${count}`);
            count++;
        } catch (e) {
            errors++;
        }
    }
    return { count, errors };
}

async function run() {
    console.log(`\n🔥 Load Test: ${CONCURRENCY} concurrent users, ${DURATION_MS / 1000}s duration\n`);
    const endTime = Date.now() + DURATION_MS;
    const workers = Array.from({ length: CONCURRENCY }, (_, i) => runWorker(i, endTime));
    const results = await Promise.all(workers);

    const total = results.reduce((s, r) => s + r.count, 0);
    const errors = results.reduce((s, r) => s + r.errors, 0);
    const rps = (total / (DURATION_MS / 1000)).toFixed(1);

    console.log(`✅ Completed scenarios: ${total}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`⚡ Throughput: ~${rps} scenarios/sec\n`);
    process.exit(errors > total * 0.1 ? 1 : 0);
}

run().catch(err => {
    console.error('Load test error:', err.message);
    process.exit(1);
});
