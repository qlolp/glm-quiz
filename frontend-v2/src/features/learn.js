import {
    checkAnswer,
    ensureGuestSession,
    getQuestions,
    getSpacedDue,
    getSpacedStats,
    reviewSpacedCard
} from '../core/api.js';
import { labelCategory } from '../core/labels.js';
import { resetLearn, resetQuiz, state } from '../core/state.js';
import { getProfile } from '../core/storage.js';
import { icon } from '../ui/icons.js';
import { announce, escapeHtml, meter, pageHead, sectionHead } from '../ui/shell.js';
import { answerOption } from './quiz.js';

const QUALITY = [
    { value: 0, label: 'Снова', hint: 'Не вспомнил' },
    { value: 3, label: 'Трудно', hint: 'С трудом' },
    { value: 4, label: 'Хорошо', hint: 'Уверенно' },
    { value: 5, label: 'Легко', hint: 'Сразу' }
];

const CATEGORIES = {
    ethics: 'Этика',
    rights: 'Права',
    care_standards: 'Уход',
    safety: 'Безопасность',
    emergency: 'Экстренное',
    communication: 'Коммуникация',
    documentation: 'Документы',
    quality: 'Качество'
};

export async function loadLearnHub() {
    const profile = getProfile();
    await ensureGuestSession(profile.displayName || '');
    try {
        state.learn.stats = await getSpacedStats();
    } catch {
        state.learn.stats = { total_cards: 0, due_today: 0, mature_cards: 0 };
    }
}

export function learnView() {
    const stats = state.learn.stats || {};
    const due = Number(stats.due_today || 0);
    const total = Number(stats.total_cards || 0);
    const mature = Number(stats.mature_cards || 0);

    return `
        <section>
            ${pageHead(
                'Обучение',
                'Закрепляйте знания системно',
                'Интервальные повторения и практика по темам — по алгоритму SM-2.'
            )}

            <div class="stat-grid">
                <div class="stat">
                    <span class="stat-value">${due}</span>
                    <span class="stat-label">к повтору</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${total}</span>
                    <span class="stat-label">в колоде</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${mature}</span>
                    <span class="stat-label">закреплено</span>
                </div>
            </div>

            <div class="grid-2" style="margin-top: var(--sp-5)">
                <button class="card card-lead" type="button" data-action="start-review">
                    <span class="card-icon" aria-hidden="true">${icon('cards')}</span>
                    <span class="stack-tight">
                        <span class="card-title">Повторение на сегодня</span>
                        <span class="card-body">Карточки по алгоритму SM-2. Новые вопросы добавляются автоматически.</span>
                        <span class="card-meta">
                            <span class="badge ${due ? 'primary' : ''}">${due} к повтору</span>
                        </span>
                    </span>
                </button>
                <a class="card card-lead" href="/v2/start/training" data-route="/start/training">
                    <span class="card-icon" aria-hidden="true">${icon('learn')}</span>
                    <span class="stack-tight">
                        <span class="card-title">Свободная тренировка</span>
                        <span class="card-body">10 случайных вопросов с пояснениями после каждого ответа.</span>
                        <span class="card-meta"><span class="badge">около 5 минут</span></span>
                    </span>
                </a>
            </div>

            <div class="section">
                ${sectionHead('Практика по теме', 'По 7 вопросов из выбранной категории.')}
                <div class="chip-grid">
                    ${Object.entries(CATEGORIES).map(([id, label]) => `
                        <button class="chip" type="button" data-action="start-category" data-category="${id}">
                            ${escapeHtml(label)}
                        </button>
                    `).join('')}
                </div>
            </div>
        </section>
    `;
}

export async function startReviewSession() {
    resetLearn();
    state.learn.mode = 'review';
    const profile = getProfile();
    await ensureGuestSession(profile.displayName || '');
    const data = await getSpacedDue(20);
    const cards = [...(data.due || []), ...(data.new || [])];
    if (!cards.length) {
        throw new Error('Пока нет карточек. Пройдите тренировку — вопросы попадут в колоду.');
    }
    state.learn.cards = cards;
    state.learn.index = 0;
    state.learn.finished = false;
}

function finishedView(learn) {
    const percent = learn.reviewed
        ? Math.round((learn.correct / learn.reviewed) * 100)
        : 0;
    return `
        <section>
            ${pageHead('Повторение', 'Сессия завершена', 'Карточки сохранены в расписании повторений.')}
            <div class="score-panel">
                <div class="score-dial" style="--dial:${percent}" role="img"
                     aria-label="${learn.correct} из ${learn.reviewed}">
                    <div class="score-dial-inner">
                        <span class="score-value">${learn.correct}/${learn.reviewed}</span>
                        <span class="score-unit">${percent}% верно</span>
                    </div>
                </div>
            </div>
            <div class="section">
                <div class="stack">
                    <button class="button block" type="button" data-action="start-review">
                        ${icon('repeat')}Ещё одна сессия
                    </button>
                    <a class="button secondary" href="/v2/learn" data-route="/learn">${icon('arrowLeft')}К обучению</a>
                </div>
            </div>
        </section>
    `;
}

export function reviewView() {
    const learn = state.learn;
    if (learn.finished) return finishedView(learn);

    const card = learn.cards[learn.index];
    if (!card) return '';
    const answers = (card.options || []).map((option, index) => answerOption(option, index, {
        className: learn.feedback ? answerClass(learn.feedback, index) : '',
        disabled: Boolean(learn.feedback) || state.busy,
        action: 'review-answer'
    })).join('');

    return `
        <section>
            ${meter(learn.index + 1, learn.cards.length, 'Карточка')}
            <article class="question-card">
                <div class="question-head">
                    <span class="badge accent">${escapeHtml(labelCategory(card.category))}</span>
                </div>
                <p class="q-text">${escapeHtml(card.question)}</p>
                <div class="answers" role="group" aria-label="Варианты ответа">${answers}</div>
            </article>
            ${learn.feedback ? reviewFeedback(learn) : ''}
        </section>
    `;
}

function reviewFeedback(learn) {
    return `
        <section class="feedback reveal-panel ${learn.feedback.correct ? 'ok' : 'error'}" role="status" tabindex="-1">
            <h2 class="verdict">
                ${icon(learn.feedback.correct ? 'check' : 'cross')}${learn.feedback.correct ? 'Верно' : 'Неверно'}
            </h2>
            <p class="feedback-text">${escapeHtml(learn.feedback.explanation || 'Пояснение появится после оценки.')}</p>
            ${learn.awaitingQuality ? `
                <p class="field-hint">Насколько легко было вспомнить ответ?</p>
                <div class="quality-row">
                    ${QUALITY.map((item) => `
                        <button class="button secondary" type="button"
                                data-action="review-quality" data-quality="${item.value}"
                                title="${escapeHtml(item.hint)}">${escapeHtml(item.label)}</button>
                    `).join('')}
                </div>
            ` : ''}
        </section>
    `;
}

function answerClass(feedback, index) {
    if (index === feedback.correctIndex) return 'is-correct';
    if (index === feedback.selected && !feedback.correct) return 'is-wrong';
    return '';
}

export async function submitReviewAnswer(answer) {
    if (state.busy || state.learn.feedback) return;
    state.busy = true;
    try {
        const card = state.learn.cards[state.learn.index];
        const feedback = await checkAnswer(card.id, answer);
        state.learn.feedback = { ...feedback, selected: answer };
        state.learn.awaitingQuality = true;
        if (feedback.correct) state.learn.correct += 1;
        announce(feedback.correct ? 'Верно' : 'Неверно');
    } finally {
        state.busy = false;
    }
}

export async function submitReviewQuality(quality) {
    if (state.busy || !state.learn.awaitingQuality) return;
    state.busy = true;
    try {
        const card = state.learn.cards[state.learn.index];
        await reviewSpacedCard(card.id, Number(quality));
        state.learn.reviewed += 1;
        state.learn.awaitingQuality = false;
        state.learn.feedback = null;
        if (state.learn.index + 1 < state.learn.cards.length) {
            state.learn.index += 1;
        } else {
            state.learn.finished = true;
        }
    } finally {
        state.busy = false;
    }
}

export async function startCategoryPractice(category) {
    resetQuiz('category');
    state.goal = 'category';
    const profile = getProfile();
    const [data] = await Promise.all([
        getQuestions(),
        ensureGuestSession(profile.displayName || '')
    ]);
    const valid = (data.questions || []).filter((question) =>
        question.category === category
        && Number.isFinite(question.id)
        && question.question
        && Array.isArray(question.options)
        && question.options.length === 4
    );
    if (!valid.length) {
        throw new Error(`В теме «${labelCategory(category)}» пока нет вопросов.`);
    }
    const shuffled = [...valid].sort(() => Math.random() - 0.5);
    state.questions = shuffled.slice(0, Math.min(7, shuffled.length));
    state.index = 0;
    state.score = 0;
    state.answers = [];
    state.feedback = null;
}
