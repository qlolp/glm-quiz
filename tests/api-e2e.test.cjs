/**
 * GLM Quiz — API end-to-end test
 * Usage: BASE_URL=http://147.45.174.206 ADMIN_PASSWORD=$ADMIN_PASSWORD node tests/api-e2e.test.cjs
 */

const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
    console.error('Set ADMIN_PASSWORD env var');
    process.exit(1);
}
const DEMO_MASTER_CODE = process.env.DEMO_MASTER_CODE;

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

function buildVerifiedAnswers(adminQuestions, count, correctCount) {
    return adminQuestions.slice(0, count).map((q, i) => {
        const correctAnswer = q.correct_answer ?? q.correct;
        return {
            questionId: q.id,
            answer: i < correctCount ? correctAnswer : (correctAnswer + 1) % 4
        };
    });
}

async function runTests() {
    console.log(`\n🧪 GLM Quiz API E2E Tests\nBase: ${BASE_URL}\n`);

    const health = await request('/api/health');
    assert(health.status === 200 && health.body.status === 'healthy', 'Health check');

    const version = await request('/api/version');
    assert(version.status === 200 && version.body.version, 'Version endpoint');

    const questions = await request('/api/questions');
    assert(questions.status === 200 && Array.isArray(questions.body.questions) && questions.body.questions.length === 84, 'Questions: 84 items');
    assert(questions.body.questions.every(q => q.correct === undefined && q.explanation === undefined), 'Questions: no leaked answers');

    const userQuestionsAnon = await request('/api/questions/user');
    assert(userQuestionsAnon.status === 401 || userQuestionsAnon.status === 403, 'User-submitted questions require admin auth');

    const adminAuth = await request('/api/auth/admin', 'POST', { password: ADMIN_PASSWORD });
    assert(adminAuth.status === 200 && adminAuth.body.valid && adminAuth.body.token, 'Admin auth');
    const adminToken = adminAuth.body.token;

    const adminQuestions = await request('/api/default-questions', 'GET', null, adminToken);
    assert(adminQuestions.status === 200 && adminQuestions.body.questions.length >= 84, 'Admin default-questions');

    const userQuestionsAdmin = await request('/api/questions/user', 'GET', null, adminToken);
    assert(userQuestionsAdmin.status === 200 && Array.isArray(userQuestionsAdmin.body.questions), 'Admin can list user-submitted questions');

    // check-answer requires auth (anti-scraping of correct answers via reveal=true)
    const guestCheck = await request('/api/users', 'POST', { username: `guest_${Date.now()}` });
    const guestToken = guestCheck.body.token;
    const check = await request('/api/quiz/check-answer', 'POST', { questionId: 1, answer: 0 }, guestToken);
    assert(check.status === 200 && typeof check.body.correct === 'boolean', 'Check-answer endpoint');
    assert(typeof check.body.wrong_explanation === 'string' || check.body.wrong_explanation === '', 'Check-answer returns wrong_explanation');

    const cases = await request('/api/cases');
    assert(cases.status === 200 && Array.isArray(cases.body.cases) && cases.body.cases.length >= 6, 'Cases: >= 6');
    assert(cases.body.cases.every(c => c.steps_count === 4), 'Cases: each has 4 steps');

    const caseDetail = await request('/api/cases/case_001');
    assert(caseDetail.status === 200 && caseDetail.body.steps.length === 4, 'Case detail: 4 steps');
    assert(caseDetail.body.steps.every(s => s.correct_answer === undefined && s.explanation === undefined), 'Case detail: no leaked answers');

    const caseCheck = await request('/api/cases/case_001/check-step', 'POST', { step_number: 1, answer: 1 }, guestToken);
    assert(caseCheck.status === 200 && caseCheck.body.correct === true && caseCheck.body.explanation, 'Cases check-step correct');
    assert(caseCheck.body.next_step === 2 || caseCheck.body.finished === false, 'Cases check-step next_step');

    const caseCheckWrong = await request('/api/cases/case_004/check-step', 'POST', { step_number: 1, answer: 0 }, guestToken);
    assert(caseCheckWrong.status === 200 && caseCheckWrong.body.correct === false, 'Branching case check-step wrong answer');
    assert(caseCheckWrong.body.next_step === 2, 'Branching case still advances via branches');

    const prepostConfig = await request('/api/prepost/config');
    const prepostIds = Array.isArray(prepostConfig.body.question_ids) ? prepostConfig.body.question_ids : [];
    assert(prepostConfig.status === 200 && prepostIds.length === 7, 'Prepost config: 7 ids');

    const bankIds = new Set(adminQuestions.body.questions.map(q => q.id));
    const missingPrepostIds = prepostIds.filter(id => !bankIds.has(id));
    assert(missingPrepostIds.length === 0, `Prepost ids all exist in question bank${missingPrepostIds.length ? ` (missing: ${missingPrepostIds.join(', ')})` : ''}`);
    assert(new Set(prepostIds).size === prepostIds.length, 'Prepost ids are unique');
    const prepostCategories = new Set(
        adminQuestions.body.questions.filter(q => prepostIds.includes(q.id)).map(q => q.category)
    );
    assert(prepostCategories.size >= 3, `Prepost ids span >= 3 categories (${prepostCategories.size})`);

    // Service worker must be valid JS with the live-session pages cached
    const swSource = await request('/sw.js');
    const swText = String(swSource.body || '');
    assert(swSource.status === 200 && swText.includes("'/pulse-host.html'"), 'SW caches pulse-host.html');
    assert(swText.includes("'/pulse-player.html'") && swText.includes("'/realtime-player.html'") && swText.includes("'/stage-heatmap.html'"), 'SW caches realtime-player, pulse-player, stage-heatmap');
    assert(swText.includes("'/qa-host.html'") && swText.includes("'/qa-player.html'") && swText.includes("'/seminar-digest.html'"), 'SW caches Q&A and seminar digest pages');
    // Derived from version.json so a release bump cannot leave the SW cache stale.
    const expectedVersion = require('../version.json').version;
    assert(swText.includes(`CACHE_VERSION = '${expectedVersion}'`), `SW cache version is ${expectedVersion}`);
    assert(!/,\/realtime-player\.html/.test(swText), 'SW STATIC_CACHE_URLS not malformed');

    const email = `test_${Date.now()}@example.com`;
    const register = await request('/api/auth/register', 'POST', {
        email,
        fio: 'Test User',
        organization: 'Test Org'
    });
    assert(register.status === 200 && register.body.success && register.body.user.id, 'Register user');
    assert(!register.body.code, 'Register does not leak verification code');

    const verifyCode = DEMO_MASTER_CODE || '1234';
    const verify = await request('/api/auth/verify', 'POST', { email, code: verifyCode });
    assert(verify.status === 200 && verify.body.success && verify.body.token, 'Verify with demo master code');
    const userToken = verify.body.token;

    const registerDup = await request('/api/auth/register', 'POST', { email, fio: 'Test User' });
    assert(registerDup.status === 200 && registerDup.body.exists === true, 'Duplicate register returns existing');
    assert(!registerDup.body.user, 'Duplicate register does not leak user record');

    const hijack = await request('/api/users', 'POST', { username: email, display_name: 'Hijack' });
    assert(hijack.status === 409 && hijack.body.requires_verification === true, 'Registered username cannot be guest-tokened');

    const guest = await request('/api/users', 'POST', { username: `guest_${Date.now()}`, display_name: 'Guest' });
    assert(guest.status === 200 && guest.body.user && guest.body.token, 'Guest user receives token');

    const qList = adminQuestions.body.questions;
    const answers = buildVerifiedAnswers(qList, 20, 18);
    const complete = await request('/api/quiz/complete', 'POST', {
        score: 18,
        total_questions: 20,
        mode: 'exam',
        answers
    }, userToken);
    assert(complete.status === 200 && complete.body.success, 'Complete quiz with token (server-verified answers)');

    const completeReplay = await request('/api/quiz/complete', 'POST', {
        score: 18,
        total_questions: 20,
        answers
    }, userToken);
    assert(completeReplay.status === 409, 'Duplicate quiz submission rejected');

    const completeNoAuth = await request('/api/quiz/complete', 'POST', {
        score: 18,
        total_questions: 20,
        answers
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
        score: 4,
        completed: true
    }, userToken);
    assert(caseProgress.status === 200 && caseProgress.body.success, 'Case progress saved with token');

    const caseProgressNoAuth = await request('/api/cases/case_001/progress', 'POST', {
        score: 4,
        completed: true
    });
    assert(caseProgressNoAuth.status === 401, 'Case progress without token rejected');

    const submitQ = await request('/api/questions/submit', 'POST', {
        question_text: 'Test question?',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 0,
        category: 'ethics',
        explanation: 'Because'
    }, userToken);
    assert(submitQ.status === 200 && submitQ.body.success, 'Submit user question with token');

    const feedback = await request('/api/feedback', 'POST', {
        question_id: submitQ.body.question_id,
        feedback_type: 'unclear',
        comment: 'Test feedback'
    }, userToken);
    assert(feedback.status === 200 && feedback.body.success, 'Submit feedback');

    const feedbackNoAuth = await request('/api/feedback', 'POST', {
        question_id: submitQ.body.question_id,
        feedback_type: 'unclear',
        comment: 'Test feedback'
    });
    assert(feedbackNoAuth.status === 401, 'Feedback without token rejected');

    const analyticsNoAuth = await request('/api/analytics');
    assert(analyticsNoAuth.status === 401, 'Analytics without admin token rejected');

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

    // Leaderboard now requires auth (PII protection)
    const leaderboardNoAuth = await request('/api/leaderboard');
    assert(leaderboardNoAuth.status === 401, 'Leaderboard without auth rejected');

    const leaderboard = await request('/api/leaderboard', 'GET', null, guestToken);
    assert(leaderboard.status === 200 && Array.isArray(leaderboard.body.leaderboard), 'Leaderboard');

    const dashboardNoAuth = await request('/api/dashboard/manager?department=Org1');
    assert(dashboardNoAuth.status === 401, 'Manager dashboard without admin token rejected');

    const dashboard = await request('/api/dashboard/manager?department=Org1', 'GET', null, adminToken);
    assert(dashboard.status === 200 && dashboard.body.overview, 'Manager dashboard with admin token');

    const competencyNoAuth = await request('/api/competency/department/Org1');
    assert(competencyNoAuth.status === 401, 'Competency department without admin token rejected');

    const competency = await request('/api/competency/department/Org1', 'GET', null, adminToken);
    assert(competency.status === 200, 'Competency department with admin token');

    // Adaptive session anti-cheat
    const adaptiveStart = await request('/api/quiz/adaptive/start', 'POST', { categories: ['ethics'] }, userToken);
    assert(adaptiveStart.status === 200 && adaptiveStart.body.session_id, 'Adaptive start with token');
    const sessionId = adaptiveStart.body.session_id;

    for (let i = 0; i < 3; i++) {
        const q = qList[i];
        const correctAnswer = q.correct_answer ?? q.correct;
        await request('/api/quiz/check-answer', 'POST', {
            questionId: q.id,
            answer: correctAnswer,
            session_id: sessionId
        }, userToken);
    }

    const adaptiveComplete = await request('/api/quiz/complete', 'POST', {
        score: 3,
        total_questions: 3,
        session_id: sessionId
    }, userToken);
    assert(adaptiveComplete.status === 200 && adaptiveComplete.body.success, 'Adaptive complete via session_id');

    const adaptiveReplay = await request('/api/quiz/complete', 'POST', {
        score: 3,
        total_questions: 3,
        session_id: sessionId
    }, userToken);
    assert(adaptiveReplay.status === 409, 'Duplicate adaptive session submission rejected');

    // Competency update: server verifies answers, ignores client-trusted is_correct
    const competencyInflate = await request('/api/competency/update', 'POST', {
        answers: [{ category: 'ethics', is_correct: true }]
    }, userToken);
    assert(competencyInflate.status === 400, 'Competency inflation with is_correct rejected');

    const firstQuestion = qList[0];
    const competencyUpdate = await request('/api/competency/update', 'POST', {
        answers: [{
            questionId: firstQuestion.id,
            answer: firstQuestion.correct_answer ?? firstQuestion.correct
        }]
    }, userToken);
    assert(competencyUpdate.status === 200 && competencyUpdate.body.success, 'Competency update with verified answers');

    const actionPlan = await request('/api/action-plans', 'POST', {
        text: 'Провести инструктаж по эвакуации на следующей неделе',
        score: 5,
        mode: 'micro'
    }, userToken);
    assert(actionPlan.status === 200 && actionPlan.body.success, 'Action plan saved');

    // Every prepost question is answerable and scored server-side
    const prepostAnswers = prepostIds.map((id, i) => {
        const q = qList.find(item => item.id === id);
        const correctAnswer = q.correct_answer ?? q.correct;
        return { questionId: id, answer: i < 5 ? correctAnswer : (correctAnswer + 1) % 4 };
    });
    assert(prepostAnswers.every(a => typeof a.answer === 'number'), 'Prepost answers resolvable from bank');

    const prepost = await request('/api/prepost/complete', 'POST', {
        phase: 'pre',
        answers: prepostAnswers
    }, userToken);
    assert(prepost.status === 200 && prepost.body.success && prepost.body.phase === 'pre', 'Prepost complete pre phase');
    assert(prepost.body.score === 5 && prepost.body.total === 7, `Prepost score verified server-side (got ${prepost.body.score}/${prepost.body.total})`);

    const prepostInflated = await request('/api/prepost/complete', 'POST', {
        phase: 'post',
        score: 7,
        total: 7,
        answers: prepostAnswers.map(a => ({ ...a }))
    }, userToken);
    assert(prepostInflated.status === 200 && prepostInflated.body.score === 5, 'Prepost ignores client-supplied inflated score');

    const prepostNoAnswers = await request('/api/prepost/complete', 'POST', {
        phase: 'pre',
        score: 7,
        total: 7
    }, userToken);
    assert(prepostNoAnswers.status === 400, 'Prepost without answers rejected');

    const prepostBadId = await request('/api/prepost/complete', 'POST', {
        phase: 'pre',
        answers: [{ questionId: 99999, answer: 0 }]
    }, userToken);
    assert(prepostBadId.status === 400, 'Prepost with question outside set rejected');

    const weakNoAuth = await request('/api/analytics/weak-questions');
    assert(weakNoAuth.status === 401, 'Weak-questions without admin rejected');
    const weak = await request('/api/analytics/weak-questions', 'GET', null, adminToken);
    assert(weak.status === 200 && Array.isArray(weak.body.questions), 'Weak-questions with admin');

    const cats = await request('/api/analytics/categories', 'GET', null, adminToken);
    assert(cats.status === 200 && Array.isArray(cats.body.categories), 'Categories analytics for heatmap');

    const digestNoAuth = await request('/api/seminar/digest?from=2020-01-01&to=2030-01-01');
    assert(digestNoAuth.status === 401, 'Seminar digest requires admin');
    const digest = await request('/api/seminar/digest?from=2020-01-01&to=2030-01-01', 'GET', null, adminToken);
    assert(digest.status === 200 && typeof digest.body.completed_quizzes === 'number', 'Seminar digest returns quiz count');
    assert(typeof digest.body.average_percent === 'number' && Array.isArray(digest.body.weak_categories), 'Seminar digest returns average and weak categories');
    assert(digest.body.prepost && typeof digest.body.prepost.paired_participants === 'number' && digest.body.qa, 'Seminar digest returns pre/post and Q&A summary');

    // Pulse smoke: pages exist (HTTP)
    const pulseHost = await request('/pulse-host.html');
    assert(pulseHost.status === 200 && String(pulseHost.body).includes('Пульс'), 'Pulse host page');
    const pulsePlayer = await request('/pulse-player.html');
    assert(pulsePlayer.status === 200 && String(pulsePlayer.body).includes('Пульс'), 'Pulse player page');
    const stageHeat = await request('/stage-heatmap.html');
    assert(stageHeat.status === 200 && String(stageHeat.body).includes('Heatmap'), 'Stage heatmap page');
    const qaHost = await request('/qa-host.html');
    assert(qaHost.status === 200 && String(qaHost.body).includes('Live Q&A'), 'Q&A host page');
    const qaPlayer = await request('/qa-player.html');
    assert(qaPlayer.status === 200 && String(qaPlayer.body).includes('Вопросы спикеру'), 'Q&A player page');
    const digestPage = await request('/seminar-digest.html');
    assert(digestPage.status === 200 && String(digestPage.body).includes('Дайджест'), 'Seminar digest page');

    if (cert.body.certificate_id) {
        const download = await request(`/api/certificates/${cert.body.certificate_id}/download`);
        assert(download.status === 200 && typeof download.body === 'string' && download.body.includes('verify-certificate'), 'Certificate HTML download');
    }

    const speakerPublic = await request('/guide/speaker');
    assert(speakerPublic.status === 200 && typeof speakerPublic.body === 'string' && speakerPublic.body.includes('Пароль администратора'), 'Speaker guide requires login');
    assert(typeof speakerPublic.body === 'string' && !speakerPublic.body.includes('quizadmin2024'), 'Speaker guide does not leak admin password');

    const speakerAuthed = await request('/guide/speaker', 'GET', null, adminToken);
    assert(speakerAuthed.status === 200 && typeof speakerAuthed.body === 'string' && speakerAuthed.body.includes('Чеклист'), 'Speaker guide with admin token');

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test runner error:', err.message);
    process.exit(1);
});
