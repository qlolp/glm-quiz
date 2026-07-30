import { clearSession, getSession, setSession } from './storage.js';

export class ApiError extends Error {
    constructor(message, status = 0, code = 'request_failed') {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

async function request(path, options = {}) {
    const { auth = false, retryAuth = false, ...fetchOptions } = options;
    const headers = new Headers(fetchOptions.headers || {});
    const token = getSession().token;

    if (auth && token) headers.set('Authorization', `Bearer ${token}`);
    if (fetchOptions.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    let response;
    try {
        response = await fetch(path, {
            ...fetchOptions,
            headers,
            cache: fetchOptions.cache || 'no-store'
        });
    } catch {
        throw new ApiError(
            navigator.onLine ? 'Сервер временно недоступен.' : 'Нет подключения к интернету.',
            0,
            navigator.onLine ? 'network' : 'offline'
        );
    }

    if (auth && (response.status === 401 || response.status === 403)) {
        clearSession();
        window.dispatchEvent(new CustomEvent('glm:auth-expired'));
        if (retryAuth) {
            await ensureGuestSession();
            return request(path, { ...options, retryAuth: false });
        }
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new ApiError(
            body.error || `Ошибка запроса (${response.status})`,
            response.status,
            response.status === 401 || response.status === 403 ? 'auth_expired' : 'api'
        );
    }
    return body;
}

export async function ensureGuestSession(displayName = '') {
    const existing = getSession();
    if (existing.token && existing.userId) return existing;

    const suffix = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const data = await request('/api/users', {
        method: 'POST',
        body: JSON.stringify({
            username: `guest_${suffix}`,
            display_name: displayName.trim() || 'Участник'
        })
    });
    setSession(data.user, data.token);
    return getSession();
}

export function getQuestions() {
    return request('/api/questions');
}

export function checkAnswer(questionId, answer) {
    return request('/api/quiz/check-answer', {
        method: 'POST',
        auth: true,
        retryAuth: true,
        body: JSON.stringify({ questionId, answer })
    });
}

export function completeQuiz(score, answers) {
    return request('/api/quiz/complete', {
        method: 'POST',
        auth: true,
        retryAuth: true,
        body: JSON.stringify({
            score,
            total_questions: answers.length,
            answers: answers.map(({ questionId, answer }) => ({ questionId, answer }))
        })
    });
}

export function getCases() {
    return request('/api/cases');
}

export function getCase(id) {
    return request(`/api/cases/${encodeURIComponent(id)}`);
}

export function checkCaseStep(caseId, stepNumber, answer) {
    return request(`/api/cases/${encodeURIComponent(caseId)}/check-step`, {
        method: 'POST',
        auth: true,
        retryAuth: true,
        body: JSON.stringify({ step_number: stepNumber, answer })
    });
}

export function saveCaseProgress(caseId, score, completed = true) {
    return request(`/api/cases/${encodeURIComponent(caseId)}/progress`, {
        method: 'POST',
        auth: true,
        retryAuth: true,
        body: JSON.stringify({ score, completed })
    });
}

export function getSpacedDue(limit = 20) {
    return request(`/api/spaced-repetition/due?limit=${limit}`, {
        auth: true,
        retryAuth: true
    });
}

export function getSpacedStats() {
    return request('/api/spaced-repetition/stats', {
        auth: true,
        retryAuth: true
    });
}

export function reviewSpacedCard(questionId, quality) {
    return request('/api/spaced-repetition/review', {
        method: 'POST',
        auth: true,
        retryAuth: true,
        body: JSON.stringify({ question_id: questionId, quality })
    });
}

export function saveActionPlan(text, score = null, mode = 'v2') {
    return request('/api/action-plans', {
        method: 'POST',
        auth: true,
        retryAuth: true,
        body: JSON.stringify({ text, score, mode })
    });
}

export function getUserCertificates(userId) {
    return request(`/api/certificates/user/${encodeURIComponent(userId)}`, {
        auth: true,
        retryAuth: true
    });
}
