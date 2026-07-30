import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/surfaces.css';
import './styles/controls.css';
import './styles/quiz.css';
import './styles/features.css';

import { ApiError } from './core/api.js';
import { currentRoute, installRouter, navigate } from './core/router.js';
import { resetQuiz, state } from './core/state.js';
import { migrateLegacyStorage, setProfile } from './core/storage.js';
import { advanceCase, backToCasesList, casePlayView, casesListView, loadCasesList, openCase, submitCaseAnswer } from './features/cases.js';
import { homeView, identityView, saveName, selectGoal, seminarView } from './features/home.js';
import { copyText, hostView } from './features/host.js';
import {
    learnView,
    loadLearnHub,
    reviewView,
    startCategoryPractice,
    startReviewSession,
    submitReviewAnswer,
    submitReviewQuality
} from './features/learn.js';
import { loadProfileExtras, profileView, saveProfileSettings, submitActionPlan } from './features/profile.js';
import {
    advanceQuiz,
    confirmPendingAnswer,
    loadQuiz,
    quizView,
    selectAnswer,
    speakCurrentQuestion,
    submitAnswer
} from './features/quiz.js';
import { recordResult, resultView } from './features/result.js';
import { icon } from './ui/icons.js';
import { announce, errorState, loadingState, shell } from './ui/shell.js';

const app = document.querySelector('#app');
const offlineBanner = document.querySelector('#offline-banner');
const sessionBanner = document.querySelector('#session-banner');

function routeView(route) {
    if (route === '/') return homeView();
    if (route === '/join') return seminarView();
    if (route.startsWith('/start/')) return identityView(route.split('/').at(-1));
    if (route === '/quiz') return state.questions.length ? quizView() : homeView();
    if (route === '/result') return resultView();
    if (route === '/learn') return learnView();
    if (route === '/learn/review') return reviewView();
    if (route === '/cases') {
        return state.cases.current ? casePlayView() : casesListView();
    }
    if (route === '/profile' || route === '/me') return profileView();
    if (route === '/host') return hostView();
    return errorState('Такой страницы в V2 пока нет.', 'На главную', { home: true });
}

function render({ focus = true } = {}) {
    const route = currentRoute();
    app.innerHTML = shell(routeView(route), route);
    if (focus) {
        const main = document.querySelector('#main');
        main?.focus({ preventScroll: true });
    }
    announce(document.querySelector('h1')?.textContent || 'Страница обновлена');
    if (route === '/quiz') speakCurrentQuestion();
}

function renderLoading(message) {
    app.innerHTML = shell(loadingState(message), currentRoute());
}

function renderFailure(error, retry) {
    state.lastError = error;
    app.innerHTML = shell(errorState(error.message || 'Неизвестная ошибка'), currentRoute());
    app.querySelector('[data-action="retry"]')?.addEventListener('click', retry, { once: true });
}

async function start(goal, displayName = '') {
    saveName(displayName);
    resetQuiz(goal);
    navigate('/quiz', { silent: true });
    renderLoading('Готовим вопросы');
    try {
        await loadQuiz();
        render();
    } catch (error) {
        renderFailure(error, () => start(goal, displayName));
    }
}

async function ensureLearnHub() {
    if (state.learn.stats) {
        render();
        return;
    }
    renderLoading('Открываем обучение');
    try {
        await loadLearnHub();
        render();
    } catch (error) {
        renderFailure(error, ensureLearnHub);
    }
}

async function ensureCases() {
    if (state.cases.list !== null || state.cases.current) {
        render();
        return;
    }
    renderLoading('Загружаем кейсы');
    try {
        await loadCasesList();
        render();
    } catch (error) {
        renderFailure(error, ensureCases);
    }
}

async function ensureProfile() {
    renderLoading('Открываем профиль');
    try {
        await loadProfileExtras();
        render();
    } catch (error) {
        renderFailure(error, ensureProfile);
    }
}

async function handleRouteData() {
    const route = currentRoute();
    if (route === '/learn' && !state.learn.stats) {
        await ensureLearnHub();
        return true;
    }
    if (route === '/cases' && state.cases.list === null && !state.cases.current) {
        await ensureCases();
        return true;
    }
    if ((route === '/profile' || route === '/me') && state.profileExtras.certificates === null) {
        await ensureProfile();
        return true;
    }
    return false;
}

document.addEventListener('click', async (event) => {
    const goal = event.target.closest('[data-goal]')?.dataset.goal;
    if (goal) {
        navigate(selectGoal(goal));
        return;
    }

    const answerBtn = event.target.closest('[data-answer]');
    if (answerBtn && !answerBtn.dataset.action) {
        try {
            const answer = Number(answerBtn.dataset.answer);
            if (selectAnswer(answer)) {
                render({ focus: false });
                document.querySelector('.confidence-prompt')?.focus?.();
                return;
            }
            await submitAnswer(answer);
            render({ focus: false });
            document.querySelector('.feedback')?.focus?.();
        } catch (error) {
            renderFailure(error, render);
        }
        return;
    }

    const actionNode = event.target.closest('[data-action]');
    const action = actionNode?.dataset.action;
    if (!action) return;

    if (action === 'skip-name') {
        const goalName = currentRoute().split('/').at(-1);
        await start(goalName);
    }
    if (action === 'next-question') {
        const finished = await advanceQuiz();
        if (finished) {
            recordResult();
            navigate('/result', { silent: true });
            render();
        } else {
            render();
        }
    }
    if (action === 'confirm-answer') {
        try {
            await confirmPendingAnswer(actionNode.dataset.confidence || null);
            render({ focus: false });
            document.querySelector('.feedback')?.focus?.();
        } catch (error) {
            renderFailure(error, render);
        }
    }
    if (action === 'retry-errors') {
        const wrongIds = new Set(state.answers.filter((item) => !item.correct).map((item) => item.questionId));
        state.questions = state.questions.filter((question) => wrongIds.has(question.id));
        state.index = 0;
        state.score = 0;
        state.answers = [];
        state.pendingAnswer = null;
        state.feedback = null;
        state.lastError = null;
        navigate('/quiz', { silent: true });
        render();
    }
    if (action === 'start-review') {
        navigate('/learn/review', { silent: true });
        renderLoading('Готовим карточки');
        try {
            await startReviewSession();
            render();
        } catch (error) {
            renderFailure(error, () => {
                navigate('/learn');
            });
        }
    }
    if (action === 'start-category') {
        const category = actionNode.dataset.category;
        navigate('/quiz', { silent: true });
        renderLoading('Готовим практику по теме');
        try {
            await startCategoryPractice(category);
            render();
        } catch (error) {
            renderFailure(error, () => navigate('/learn'));
        }
    }
    if (action === 'review-answer') {
        try {
            await submitReviewAnswer(Number(actionNode.dataset.answer));
            render({ focus: false });
        } catch (error) {
            renderFailure(error, render);
        }
    }
    if (action === 'review-quality') {
        try {
            await submitReviewQuality(Number(actionNode.dataset.quality));
            render();
        } catch (error) {
            renderFailure(error, render);
        }
    }
    if (action === 'open-case') {
        const caseId = actionNode.dataset.caseId;
        navigate('/cases', { silent: true });
        renderLoading('Открываем кейс');
        try {
            await openCase(caseId);
            render();
        } catch (error) {
            renderFailure(error, ensureCases);
        }
    }
    if (action === 'case-answer') {
        try {
            await submitCaseAnswer(Number(actionNode.dataset.answer));
            render({ focus: false });
        } catch (error) {
            renderFailure(error, render);
        }
    }
    if (action === 'case-next') {
        await advanceCase();
        render();
    }
    if (action === 'back-cases') {
        backToCasesList();
        if (state.cases.list === null) {
            await ensureCases();
        } else {
            render();
        }
    }
    if (action === 'copy-link') {
        try {
            await copyText(actionNode.dataset.copy || '');
            announce('Ссылка скопирована');
            // Preserve the inline icon markup while the label is swapped.
            const previous = actionNode.innerHTML;
            actionNode.innerHTML = `${icon('check')}Скопировано`;
            window.setTimeout(() => {
                actionNode.innerHTML = previous;
            }, 1600);
        } catch {
            announce('Не удалось скопировать');
        }
    }
});

document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (form.dataset.form === 'identity') {
        event.preventDefault();
        const goal = currentRoute().split('/').at(-1);
        await start(goal, new FormData(form).get('displayName') || '');
    }
    if (form.dataset.form === 'seminar') {
        event.preventDefault();
        const data = new FormData(form);
        const code = String(data.get('code') || '').trim().toUpperCase();
        const name = String(data.get('name') || '').trim();
        setProfile({ displayName: name });
        localStorage.setItem('glm_game_id', code);
        localStorage.setItem('glm_player_name', name);
        window.location.assign('/realtime-player.html');
    }
    if (form.dataset.form === 'profile-settings') {
        event.preventDefault();
        saveProfileSettings(new FormData(form));
        announce('Настройки сохранены');
        render({ focus: false });
    }
    if (form.dataset.form === 'action-plan') {
        event.preventDefault();
        const text = String(new FormData(form).get('text') || '').trim();
        if (text.length < 3) {
            announce('Опишите план чуть подробнее');
            return;
        }
        try {
            await submitActionPlan(text);
            render({ focus: false });
            announce('План действия сохранён');
        } catch (error) {
            renderFailure(error, render);
        }
    }
});

function updateConnectivity() {
    offlineBanner.hidden = navigator.onLine;
}

window.addEventListener('online', updateConnectivity);
window.addEventListener('offline', updateConnectivity);
window.addEventListener('glm:auth-expired', () => {
    sessionBanner.hidden = false;
    announce('Сессия истекла. Создаём новую гостевую сессию.');
    window.setTimeout(() => {
        sessionBanner.hidden = true;
    }, 5000);
});

window.addEventListener('error', (event) => {
    if (event.error instanceof ApiError) return;
    console.error(event.error);
});

migrateLegacyStorage();
installRouter(() => {
    handleRouteData().then((handled) => {
        if (!handled) render();
    });
});
updateConnectivity();
handleRouteData().then((handled) => {
    if (!handled) render({ focus: false });
});
