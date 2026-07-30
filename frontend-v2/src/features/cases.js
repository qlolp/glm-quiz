import {
    checkCaseStep,
    ensureGuestSession,
    getCase,
    getCases,
    saveCaseProgress
} from '../core/api.js';
import { difficultyLabels } from '../core/labels.js';
import { resetCasePlay, state } from '../core/state.js';
import { getProfile } from '../core/storage.js';
import { icon } from '../ui/icons.js';
import { announce, emptyState, escapeHtml, loadingState, pageHead } from '../ui/shell.js';
import { answerOption } from './quiz.js';

export async function loadCasesList() {
    const data = await getCases();
    state.cases.list = data.cases || [];
}

export function casesListView() {
    const list = state.cases.list;
    if (list === null) return loadingState('Загружаем кейсы');
    if (!list.length) {
        return emptyState(
            'Кейсов пока нет',
            'Загляните позже или откройте классическую версию интерфейса.',
            '/',
            'На главную',
            'cases'
        );
    }

    return `
        <section>
            ${pageHead(
                'Кейсы',
                'Разберите рабочую ситуацию',
                'Ответы проверяются на сервере. В части кейсов дальнейший путь зависит от вашего выбора.'
            )}
            <div class="stack">
                ${list.map((item) => `
                    <button class="card card-lead" type="button" data-action="open-case"
                            data-case-id="${escapeHtml(item.id)}">
                        <span class="card-icon" aria-hidden="true">${icon('cases')}</span>
                        <span class="stack-tight">
                            <span class="card-title">${escapeHtml(item.title)}</span>
                            <span class="card-body">${escapeHtml(item.description || '')}</span>
                            <span class="card-meta">
                                <span class="badge">${escapeHtml(difficultyLabels[item.difficulty] || item.difficulty || 'Средний')}</span>
                                <span class="badge">${Number(item.steps_count || 0)} шагов</span>
                            </span>
                        </span>
                    </button>
                `).join('')}
            </div>
        </section>
    `;
}

export async function openCase(caseId) {
    resetCasePlay();
    const profile = getProfile();
    await ensureGuestSession(profile.displayName || '');
    const data = await getCase(caseId);
    const steps = data.steps || [];
    const stepsByNumber = {};
    steps.forEach((step) => {
        stepsByNumber[step.step_number] = step;
    });
    state.cases.current = data.case;
    state.cases.steps = steps;
    state.cases.stepsByNumber = stepsByNumber;
    state.cases.stepNumber = steps[0]?.step_number || 1;
}

function stepRail(session) {
    return `
        <ol class="step-rail" aria-hidden="true">
            ${session.steps.map((step) => {
                const cls = step.step_number === session.stepNumber
                    ? 'is-current'
                    : step.step_number < session.stepNumber ? 'is-done' : '';
                return `<li class="${cls}"></li>`;
            }).join('')}
        </ol>
    `;
}

function finishedView(session) {
    const total = Math.max(session.answered, session.steps.length);
    const percent = Math.round((session.correctCount / total) * 100);
    const message = percent === 100
        ? 'Идеальный разбор ситуации.'
        : percent >= 50
            ? 'Хороший результат — можно пройти ещё раз для закрепления.'
            : 'Есть над чем поработать. Пройдите кейс снова.';

    return `
        <section>
            ${pageHead('Кейс завершён', session.current.title, message)}
            <div class="score-panel">
                <div class="score-dial" style="--dial:${percent}" role="img"
                     aria-label="${session.correctCount} из ${total}">
                    <div class="score-dial-inner">
                        <span class="score-value">${session.correctCount}/${total}</span>
                        <span class="score-unit">${percent}% верно</span>
                    </div>
                </div>
            </div>
            <div class="section">
                <div class="stack">
                    <button class="button block" type="button" data-action="back-cases">
                        ${icon('arrowLeft')}К списку кейсов
                    </button>
                    <button class="button secondary" type="button" data-action="open-case"
                            data-case-id="${escapeHtml(session.current.id)}">${icon('repeat')}Пройти снова</button>
                </div>
            </div>
        </section>
    `;
}

export function casePlayView() {
    const session = state.cases;
    const current = session.current;
    if (!current) return casesListView();
    if (session.finished) return finishedView(session);

    const step = session.stepsByNumber[session.stepNumber];
    if (!step) {
        return `
            <section class="state-card">
                <span class="state-icon err">${icon('alert')}</span>
                <h1>Шаг не найден</h1>
                <p class="muted">Похоже, кейс изменился. Вернитесь к списку и откройте его снова.</p>
                <button class="button" type="button" data-action="back-cases">${icon('arrowLeft')}К списку</button>
            </section>
        `;
    }

    const answers = (step.options || []).map((option, index) => answerOption(option, index, {
        className: session.feedback ? answerClass(session.feedback, index) : '',
        disabled: Boolean(session.feedback) || state.busy,
        action: 'case-answer'
    })).join('');

    return `
        <section>
            ${stepRail(session)}
            <div class="page-head">
                <p class="eyebrow">Шаг ${session.stepNumber} из ${session.steps.length}</p>
                <h1>${escapeHtml(current.title)}</h1>
            </div>
            ${current.scenario ? `<p class="scenario">${escapeHtml(current.scenario)}</p>` : ''}
            <article class="question-card" style="margin-top: var(--sp-4)">
                <p class="q-text">${escapeHtml(step.question)}</p>
                <div class="answers" role="group" aria-label="Варианты действия">${answers}</div>
            </article>
            ${session.feedback ? `
                <section class="feedback reveal-panel ${session.feedback.correct ? 'ok' : 'error'}"
                         role="status" tabindex="-1">
                    <h2 class="verdict">
                        ${icon(session.feedback.correct ? 'check' : 'cross')}${session.feedback.correct ? 'Верно' : 'Неверно'}
                    </h2>
                    <p class="feedback-text">${escapeHtml(session.feedback.explanation || '')}</p>
                    <button class="button block" type="button" data-action="case-next">
                        ${session.feedback.finished ? 'Завершить кейс' : 'Следующий шаг'}${icon('arrowRight')}
                    </button>
                </section>
            ` : ''}
            <p style="margin-top: var(--sp-5)">
                <button class="text-button" type="button" data-action="back-cases">
                    ${icon('arrowLeft')}К списку кейсов
                </button>
            </p>
        </section>
    `;
}

function answerClass(feedback, index) {
    if (index === feedback.correctIndex) return 'is-correct';
    if (index === feedback.selected && !feedback.correct) return 'is-wrong';
    return '';
}

export async function submitCaseAnswer(answer) {
    if (state.busy || state.cases.feedback) return;
    state.busy = true;
    try {
        const result = await checkCaseStep(state.cases.current.id, state.cases.stepNumber, answer);
        state.cases.answered += 1;
        if (result.correct) state.cases.correctCount += 1;
        state.cases.feedback = { ...result, selected: answer };
        state.cases.pendingNext = result.finished ? null : result.next_step;
        announce(result.correct ? 'Верно' : 'Неверно');
    } finally {
        state.busy = false;
    }
}

export async function advanceCase() {
    const session = state.cases;
    if (!session.feedback) return;
    if (session.feedback.finished || session.pendingNext === null) {
        session.finished = true;
        session.feedback = null;
        try {
            await saveCaseProgress(session.current.id, session.correctCount, true);
        } catch {
            /* local completion still shown */
        }
        return;
    }
    session.stepNumber = session.pendingNext;
    session.pendingNext = null;
    session.feedback = null;
}

export function backToCasesList() {
    resetCasePlay();
}
