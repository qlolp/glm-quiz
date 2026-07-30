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
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to check answer');
    }
    return res.json();
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
    if (existing) return existing;

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
        return data.token;
    }
    alert('Неверный пароль администратора');
    return null;
}
