import { getProfile, keys, read, setProfile, write } from '../core/storage.js';
import { icon } from '../ui/icons.js';
import { callout, escapeHtml, pageHead, sectionHead } from '../ui/shell.js';

const goals = {
    quick: {
        title: 'Проверить себя',
        meta: '7 вопросов · около 3 минут',
        description: 'Короткий срез знаний. Результат и разбор ошибок сразу после теста.'
    },
    training: {
        title: 'Потренироваться',
        meta: '10 вопросов · с пояснениями',
        description: 'Спокойный режим без таймера: пояснение появляется после каждого ответа.'
    }
};

const modes = [
    {
        goal: 'quick',
        iconName: 'target',
        title: 'Проверить себя',
        body: 'Короткий срез знаний с результатом сразу.',
        meta: ['7 вопросов', 'около 3 минут']
    },
    {
        goal: 'training',
        iconName: 'learn',
        title: 'Потренироваться',
        body: 'Пояснение появляется сразу после ответа.',
        meta: ['10 вопросов', 'без таймера']
    },
    {
        goal: 'seminar',
        iconName: 'users',
        title: 'Войти в семинар',
        body: 'Подключиться к общей игре по коду ведущего.',
        meta: ['нужен код', 'и имя']
    }
];

const steps = [
    ['Выберите режим', 'Проверка знаний, тренировка с пояснениями или живая игра в зале.'],
    ['Ответьте на вопросы', 'Каждый ответ проверяется на сервере, объяснение доступно сразу.'],
    ['Разберите результат', 'Слабые темы попадают в обучение и в план действия.']
];

function modeCard({ goal, iconName, title, body, meta }) {
    return `
        <button class="card card-lead" type="button" data-goal="${goal}">
            <span class="card-icon" aria-hidden="true">${icon(iconName)}</span>
            <span class="stack-tight">
                <span class="card-title">${escapeHtml(title)}</span>
                <span class="card-body">${escapeHtml(body)}</span>
                <span class="card-meta">
                    ${meta.map((item) => `<span class="badge">${escapeHtml(item)}</span>`).join('')}
                </span>
            </span>
        </button>
    `;
}

export function homeView() {
    const showTip = !read(keys.onboarding, {}).goal;
    const profile = getProfile();

    return `
        <section>
            ${pageHead(
                'Семинар «Не просто накормить»',
                'Знания для практики в соцобслуживании',
                'Проверка и обучение для директоров и специалистов: стандарты ухода, этика и осторожное применение ИИ в ежедневной работе.'
            )}

            ${showTip
                ? callout('Начните с короткой проверки — около трёх минут, без таймера давления.', { tone: 'info' })
                : ''}

            <div class="stack" style="margin-top: var(--sp-5)">
                ${modes.map(modeCard).join('')}
            </div>

            <div class="section">
                ${sectionHead('Как это работает', 'Три шага от старта до плана действия.')}
                <ol class="steps">
                    ${steps.map(([title, text]) => `
                        <li class="step">
                            <div>
                                <span class="step-title">${escapeHtml(title)}</span>
                                <span class="step-text">${escapeHtml(text)}</span>
                            </div>
                        </li>
                    `).join('')}
                </ol>
            </div>

            <div class="section">
                ${sectionHead('Контекст семинара', 'Банк вопросов шире одной темы — так устроены реальные рабочие задачи.')}
                <p class="muted" style="max-width: 36rem">
                    Материал опирается на практику организаций социального обслуживания:
                    питание и качество ухода, права получателей услуг, коммуникация команды
                    и этичные решения там, где появляется ИИ.
                </p>
            </div>

            <div class="section">
                ${sectionHead('Полезное рядом')}
                <div class="link-list">
                    <a href="/guide/user">${icon('note')}<span>Инструкция участника</span>${icon('arrowRight')}</a>
                    <a href="/v2/learn" data-route="/learn">${icon('layers')}<span>Повторение и практика по темам</span>${icon('arrowRight')}</a>
                    <a href="/v2/host" data-route="/host">${icon('presentation')}<span>Кабинет спикера</span>${icon('arrowRight')}</a>
                </div>
                ${profile.displayName
                    ? `<p class="meta" style="margin-top: var(--sp-4)">Вы продолжаете как ${escapeHtml(profile.displayName)}.</p>`
                    : ''}
            </div>
        </section>
    `;
}

export function identityView(goal) {
    const config = goals[goal] || goals.quick;
    const profile = getProfile();
    return `
        <section>
            ${pageHead(config.meta, config.title, config.description)}
            <form class="stack" data-form="identity">
                <div class="field">
                    <label for="display-name">Как к вам обращаться?</label>
                    <p class="field-hint" id="display-name-hint">
                        Необязательно. Имя видно только вам и ведущему семинара.
                    </p>
                    <input id="display-name" name="displayName" maxlength="60"
                           autocomplete="name" aria-describedby="display-name-hint"
                           value="${escapeHtml(profile.displayName || '')}">
                </div>
                <div class="button-row">
                    <button class="button" type="submit">${icon('play')}Начать</button>
                    <button class="button secondary" type="button" data-action="skip-name">Без имени</button>
                </div>
            </form>

            <div class="section">
                <details class="disclosure">
                    <summary>Дополнительные настройки</summary>
                    <p class="muted" style="margin-top: var(--sp-3)">
                        Категории подбираются автоматически. Озвучку вопросов и звуковые
                        подсказки можно включить в профиле.
                    </p>
                </details>
            </div>
        </section>
    `;
}

export function seminarView() {
    const profile = getProfile();
    return `
        <section>
            ${pageHead('Живой семинар', 'Введите код ведущего', 'Код показан на экране в зале.')}
            <form class="stack" data-form="seminar">
                <div class="field">
                    <label for="seminar-code">Код игры</label>
                    <input id="seminar-code" class="code-input" name="code" required maxlength="12"
                           inputmode="latin" autocapitalize="characters" autocomplete="one-time-code"
                           placeholder="ABC123">
                </div>
                <div class="field">
                    <label for="seminar-name">Ваше имя</label>
                    <input id="seminar-name" name="name" required maxlength="20"
                           autocomplete="name" value="${escapeHtml(profile.displayName || '')}">
                </div>
                <button class="button block" type="submit">${icon('arrowRight')}Перейти в зал</button>
            </form>
            <div class="section">
                ${callout('Если код не подходит, попросите ведущего показать его ещё раз — код меняется для каждой игры.', { tone: 'info' })}
            </div>
        </section>
    `;
}

export function selectGoal(goal) {
    const onboarding = read(keys.onboarding, {});
    write(keys.onboarding, { ...onboarding, goal: true });
    return goal === 'seminar' ? '/join' : `/start/${goal}`;
}

export function saveName(displayName) {
    const value = displayName.trim();
    if (value) setProfile({ ...getProfile(), displayName: value });
    return value;
}
