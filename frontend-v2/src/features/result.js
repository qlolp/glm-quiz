import { labelCategory } from '../core/labels.js';
import { state } from '../core/state.js';
import { addHistory, keys, read, write } from '../core/storage.js';
import { icon } from '../ui/icons.js';
import { callout, escapeHtml, pageHead, sectionHead } from '../ui/shell.js';

function weakCategory() {
    const misses = new Map();
    state.answers.filter((answer) => !answer.correct).forEach((answer) => {
        misses.set(answer.category, (misses.get(answer.category) || 0) + 1);
    });
    return [...misses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

export function recordResult() {
    const percentage = Math.round((state.score / state.questions.length) * 100);
    addHistory({
        score: state.score,
        total: state.questions.length,
        percentage,
        goal: state.goal,
        completedAt: new Date().toISOString()
    });
    const onboarding = read(keys.onboarding, {});
    write(keys.onboarding, { ...onboarding, result: true });
}

function verdict(percentage) {
    if (percentage >= 90) return { title: 'Отличный результат', text: 'Материал освоен уверенно.' };
    if (percentage >= 70) return { title: 'Хороший результат', text: 'Осталось закрепить отдельные темы.' };
    if (percentage >= 50) return { title: 'Проверка завершена', text: 'Есть темы, которые стоит повторить.' };
    return { title: 'Проверка завершена', text: 'Рекомендуем пройти тренировку с пояснениями.' };
}

export function resultView() {
    const total = state.questions.length;
    if (!total) {
        return `
            <section class="state-card">
                <span class="state-icon">${icon('inbox')}</span>
                <h1>Результат не найден</h1>
                <p class="muted">Начните новую проверку знаний с главной страницы.</p>
                <a class="button" href="/v2/" data-route="/">${icon('home')}На главную</a>
            </section>
        `;
    }

    const percentage = Math.round((state.score / total) * 100);
    const weak = weakCategory();
    const errors = state.answers.filter((answer) => !answer.correct);
    const { title, text } = verdict(percentage);

    return `
        <section>
            ${pageHead('Результат', title, text)}

            <div class="score-panel">
                <div class="score-dial" style="--dial:${percentage}" role="img"
                     aria-label="${state.score} из ${total}, ${percentage} процентов">
                    <div class="score-dial-inner">
                        <span class="score-value">${state.score}/${total}</span>
                        <span class="score-unit">${percentage}% верно</span>
                    </div>
                </div>
                <div class="stat-grid" style="width:100%">
                    <div class="stat">
                        <span class="stat-value">${state.score}</span>
                        <span class="stat-label">верно</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${errors.length}</span>
                        <span class="stat-label">ошибок</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${total}</span>
                        <span class="stat-label">вопросов</span>
                    </div>
                </div>
            </div>

            ${state.lastError
                ? callout('Результат показан, но сервер не смог его сохранить. Локальная история сохранена.', { tone: 'err', iconName: 'alert' })
                : ''}

            ${weak
                ? `<div style="margin-top: var(--sp-4)">${callout(`Стоит повторить тему «${labelCategory(weak)}».`, { tone: 'info', iconName: 'target' })}</div>`
                : ''}

            <div class="section">
                ${sectionHead('Что дальше')}
                <div class="stack">
                    ${errors.length
                        ? `<button class="button block" type="button" data-action="retry-errors">${icon('repeat')}Повторить ошибки (${errors.length})</button>`
                        : `<a class="button block" href="/v2/cases" data-route="/cases">${icon('cases')}Перейти к кейсам</a>`}
                    <div class="button-row">
                        <a class="button secondary" href="/v2/learn" data-route="/learn">${icon('learn')}К обучению</a>
                        <a class="button secondary" href="/v2/" data-route="/">Другой режим</a>
                    </div>
                </div>
            </div>

            <div class="section">
                <details class="disclosure">
                    <summary>Посмотреть все ответы (${state.answers.length})</summary>
                    <ul class="review-list">
                        ${state.answers.map((answer) => `
                            <li class="review-item ${answer.correct ? 'ok' : 'err'}">
                                ${icon(answer.correct ? 'check' : 'cross')}
                                <div>
                                    <span>${escapeHtml(answer.question)}</span>
                                    <span class="card-meta">${escapeHtml(labelCategory(answer.category))}</span>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                </details>
            </div>
        </section>
    `;
}
