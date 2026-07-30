import { checkAnswer, completeQuiz, ensureGuestSession, getQuestions } from '../core/api.js';
import { labelCategory } from '../core/labels.js';
import { state } from '../core/state.js';
import { clearQuizProgress, getPreferences, getProfile, saveQuizProgress } from '../core/storage.js';
import { icon } from '../ui/icons.js';
import { announce, escapeHtml, meter } from '../ui/shell.js';

const LETTERS = ['А', 'Б', 'В', 'Г'];
const LIMITS = { quick: 7, training: 10 };
let spokenQuestionId = null;

function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
}

export async function loadQuiz() {
    state.busy = true;
    state.lastError = null;
    try {
        const profile = getProfile();
        const [data] = await Promise.all([
            getQuestions(),
            ensureGuestSession(profile.displayName || '')
        ]);
        const valid = (data.questions || []).filter((question) =>
            Number.isFinite(question.id)
            && question.question
            && Array.isArray(question.options)
            && question.options.length === 4
        );
        if (!valid.length) throw new Error('В банке пока нет доступных вопросов.');
        state.questions = shuffle(valid).slice(0, LIMITS[state.goal] || LIMITS.quick);
        state.index = 0;
        state.score = 0;
        state.answers = [];
        state.pendingAnswer = null;
        state.feedback = null;
        saveProgress();
    } catch (error) {
        state.lastError = error;
        throw error;
    } finally {
        state.busy = false;
    }
}

function saveProgress() {
    saveQuizProgress({
        goal: state.goal,
        questions: state.questions,
        index: state.index,
        score: state.score,
        answers: state.answers
    });
}

/**
 * Resolves the visual state of one option once an answer has been graded.
 */
function answerClass(feedback, index) {
    if (!feedback) return state.pendingAnswer === index ? 'is-selected' : '';
    if (index === feedback.correctIndex) return 'is-correct';
    if (index === feedback.selected && !feedback.correct) return 'is-wrong';
    return '';
}

function stateIcon(className) {
    if (className === 'is-correct') return `<span class="answer-state">${icon('check')}</span>`;
    if (className === 'is-wrong') return `<span class="answer-state">${icon('cross')}</span>`;
    return '<span class="answer-state"></span>';
}

export function answerOption(option, index, { className, disabled, action = null }) {
    const attrs = action ? `data-action="${action}" data-answer="${index}"` : `data-answer="${index}"`;
    return `
        <button class="answer ${className}" type="button" ${attrs} ${disabled ? 'disabled' : ''}>
            <span class="answer-mark" aria-hidden="true">${LETTERS[index] || index + 1}</span>
            <span>${escapeHtml(option)}</span>
            ${stateIcon(className)}
        </button>
    `;
}

export function quizView() {
    const question = state.questions[state.index];
    if (!question) return '';
    const locked = Boolean(state.feedback) || state.busy || state.pendingAnswer !== null;
    const answers = question.options.map((option, index) => answerOption(option, index, {
        className: answerClass(state.feedback, index),
        disabled: locked
    })).join('');

    return `
        <section>
            ${meter(state.index + 1, state.questions.length, 'Вопрос')}
            <article class="question-card">
                <div class="question-head">
                    <span class="badge accent">${escapeHtml(labelCategory(question.category))}</span>
                    ${question.difficulty
                        ? `<span class="badge">${escapeHtml(difficultyLabel(question.difficulty))}</span>`
                        : ''}
                </div>
                <p class="q-text">${escapeHtml(question.question)}</p>
                <div class="answers" role="group" aria-label="Варианты ответа">${answers}</div>
            </article>
            ${state.pendingAnswer !== null && !state.feedback ? confidenceView() : ''}
            ${state.feedback ? feedbackView() : ''}
        </section>
    `;
}

function difficultyLabel(value) {
    return { easy: 'Легкий', medium: 'Средний', hard: 'Сложный' }[value] || value;
}

function confidenceView() {
    return `
        <section class="feedback reveal-panel confidence-prompt" role="group"
                 aria-labelledby="confidence-title" tabindex="-1">
            <h2 class="verdict" id="confidence-title">${icon('info')}Насколько вы уверены?</h2>
            <p class="feedback-text">Ответ ещё не отправлен. Оценка уверенности помогает точнее подобрать повторение.</p>
            <div class="confidence-actions">
                <button class="button secondary" type="button" data-action="confirm-answer" data-confidence="low">Не уверен</button>
                <button class="button secondary" type="button" data-action="confirm-answer" data-confidence="medium">Скорее уверен</button>
                <button class="button" type="button" data-action="confirm-answer" data-confidence="high">Уверен</button>
            </div>
        </section>
    `;
}

function feedbackView() {
    const feedback = state.feedback;
    const explanation = feedback.correct
        ? feedback.explanation
        : feedback.wrong_explanation || feedback.explanation;
    const last = state.index + 1 === state.questions.length;
    return `
        <section class="feedback reveal-panel ${feedback.correct ? 'ok' : 'error'}" role="status" tabindex="-1">
            <h2 class="verdict">
                ${icon(feedback.correct ? 'check' : 'cross')}${feedback.correct ? 'Верно' : 'Неверно'}
            </h2>
            <p class="feedback-text">${escapeHtml(explanation || 'Пояснение к этому вопросу пока не добавлено.')}</p>
            ${!feedback.correct && feedback.hint
                ? `<p class="feedback-text"><strong>Подсказка на будущее:</strong> ${escapeHtml(feedback.hint)}</p>`
                : ''}
            <button class="button block" type="button" data-action="next-question">
                ${last ? 'Показать результат' : 'Следующий вопрос'}${icon('arrowRight')}
            </button>
        </section>
    `;
}

export function selectAnswer(answer) {
    if (state.busy || state.feedback || state.pendingAnswer !== null) return false;
    if (getPreferences().confidencePrompt !== false) {
        state.pendingAnswer = answer;
        return true;
    }
    return false;
}

export async function submitAnswer(answer, confidence = null) {
    if (state.busy || state.feedback) return;
    state.busy = true;
    try {
        const question = state.questions[state.index];
        const feedback = await checkAnswer(question.id, answer);
        state.feedback = { ...feedback, selected: answer };
        state.answers.push({
            questionId: question.id,
            question: question.question,
            category: question.category,
            answer,
            confidence,
            correct: feedback.correct
        });
        if (feedback.correct) state.score += 1;
        state.pendingAnswer = null;
        saveProgress();
        announce(feedback.correct ? 'Верно' : 'Неверно');
        playFeedbackSound(feedback.correct);
    } finally {
        state.busy = false;
    }
}

export async function confirmPendingAnswer(confidence) {
    if (state.pendingAnswer === null) return;
    await submitAnswer(state.pendingAnswer, confidence);
}

export function speakCurrentQuestion({ force = false } = {}) {
    const preferences = getPreferences();
    const question = state.questions[state.index];
    if (!preferences.tts || !question || !globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) return;
    if (!force && spokenQuestionId === question.id) return;
    spokenQuestionId = question.id;
    try {
        globalThis.speechSynthesis.cancel();
        const options = question.options.map((option, index) => `${LETTERS[index]}. ${option}`).join('. ');
        const utterance = new globalThis.SpeechSynthesisUtterance(`${question.question}. ${options}`);
        utterance.lang = 'ru-RU';
        utterance.rate = Number.isFinite(preferences.speechRate) ? preferences.speechRate : 1;
        if (Number.isFinite(preferences.speechPitch)) utterance.pitch = preferences.speechPitch;
        globalThis.speechSynthesis.speak(utterance);
    } catch {
        // Speech is optional and must never interrupt the quiz.
    }
}

function playFeedbackSound(correct) {
    if (getPreferences().sound === false) return;
    try {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return;
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = correct ? 660 : 220;
        gain.gain.setValueAtTime(0.05, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.14);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.14);
        oscillator.addEventListener('ended', () => context.close().catch(() => {}), { once: true });
    } catch {
        // Audio cues are optional and must never interrupt the quiz.
    }
}

export async function advanceQuiz() {
    if (state.index + 1 < state.questions.length) {
        state.index += 1;
        state.pendingAnswer = null;
        state.feedback = null;
        saveProgress();
        return false;
    }

    try {
        await completeQuiz(state.score, state.answers);
        state.lastError = null;
    } catch (error) {
        state.lastError = error;
    }
    clearQuizProgress();
    return true;
}
