// Universal user reading - supports both split keys and legacy quiz_user
function getCurrentUser() {
    const userId = localStorage.getItem('userId');
    const username = localStorage.getItem('username');
    const displayName = localStorage.getItem('userDisplayName');
    if (userId) {
        return { id: userId, username: username || displayName || 'Участник', displayName: displayName || username || 'Участник' };
    }
    try {
        const legacy = JSON.parse(localStorage.getItem('quiz_user') || '{}');
        if (legacy.id) {
            return {
                id: legacy.id,
                username: legacy.username || legacy.display_name || 'Участник',
                displayName: legacy.display_name || legacy.username || 'Участник'
            };
        }
    } catch (e) { console.error('Failed to parse quiz_user:', e); }
    return { id: null, username: 'Участник', displayName: 'Участник' };
}

function getUserToken() {
    return localStorage.getItem('userToken') || null;
}

function isLoggedIn() {
    return !!(getCurrentUser().id && getUserToken());
}

function setUserSession(user, token) {
    if (!user) return;
    localStorage.setItem('quiz_user', JSON.stringify(user));
    if (user.id) localStorage.setItem('userId', user.id);
    if (user.username) localStorage.setItem('username', user.username);
    if (user.display_name) localStorage.setItem('userDisplayName', user.display_name);
    if (token) localStorage.setItem('userToken', token);
}

function clearUserSession() {
    localStorage.removeItem('quiz_user');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('userDisplayName');
    localStorage.removeItem('userToken');
}

// Fetch wrapper that attaches the user token for protected endpoints.
// Set redirectOnUnauthorized: false for background saves (quiz results, etc.).
function authFetch(url, options = {}) {
    const { redirectOnUnauthorized = true, ...fetchOptions } = options;
    const token = getUserToken();
    fetchOptions.headers = fetchOptions.headers || {};
    if (token) {
        fetchOptions.headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, fetchOptions).then(response => {
        if (redirectOnUnauthorized && (response.status === 401 || response.status === 403)) {
            clearUserSession();
            window.location.href = '/register.html';
        }
        return response;
    });
}

/** Server-side answer verification (correct answers not in public question list) */
async function checkAnswer(questionId, answer, sessionId) {
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds, doubles each retry

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await authFetch('/api/quiz/check-answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            redirectOnUnauthorized: false,
            body: JSON.stringify({
                questionId,
                answer,
                session_id: sessionId || null
            })
        });

        if (res.ok) return res.json();

        // On 429 (rate limited), retry with backoff — don't lose the answer
        if (res.status === 429 && attempt < maxRetries) {
            const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10);
            const delay = retryAfter > 0 ? retryAfter * 1000 : baseDelay * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, delay));
            continue;
        }

        // Non-429 error or retries exhausted — throw
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || (res.status === 429 ? 'Слишком много запросов. Попробуйте через минуту.' : 'Failed to check answer'));
    }
}

/** Reveal correct answer for study/flashcard modes */
async function revealAnswer(questionId) {
    const res = await authFetch('/api/quiz/check-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirectOnUnauthorized: false,
        body: JSON.stringify({ questionId, reveal: true })
    });
    if (!res.ok) throw new Error('Failed to reveal answer');
    return res.json();
}

async function getAdminToken() {
    const existing = localStorage.getItem('adminToken');
    const expiry = parseInt(localStorage.getItem('adminTokenExpiry') || '0', 10);
    // Expire after 2 hours (server TTL is 24h, but client-side should be shorter for shared computers)
    if (existing && Date.now() < expiry) return existing;
    // Clear expired token
    if (existing) {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminTokenExpiry');
    }

    const password = prompt('Введите пароль администратора:');
    if (!password) return null;

    const res = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (data.valid && data.token) {
        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('adminTokenExpiry', String(Date.now() + 2 * 60 * 60 * 1000));
        return data.token;
    }
    alert('Неверный пароль администратора');
    return null;
}
