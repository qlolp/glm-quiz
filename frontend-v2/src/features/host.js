import { icon } from '../ui/icons.js';
import { callout, escapeHtml, pageHead, sectionHead } from '../ui/shell.js';

const TOOLS = [
    {
        title: 'Kahoot',
        href: '/realtime-host.html',
        iconName: 'users',
        meta: 'Живая викторина с PIN',
        body: 'Создайте комнату на хосте. Участники входят по коду через «Войти в семинар».',
        participant: '/realtime-player.html'
    },
    {
        title: 'Пульс зала',
        href: '/pulse-host.html',
        iconName: 'pulse',
        meta: 'Анонимный опрос без очков',
        body: 'Вопрос с вариантами или шкала Likert с гистограммой и средним значением.',
        participant: '/pulse-player.html'
    },
    {
        title: 'Live Q&A',
        href: '/qa-host.html',
        iconName: 'chat',
        meta: 'Вопросы с премодерацией',
        body: 'Модерация и голосование за вопросы на стороне ведущего.',
        participant: '/qa-player.html'
    },
    {
        title: 'Дайджест дня',
        href: '/seminar-digest.html',
        iconName: 'inbox',
        meta: 'Нужен вход администратора',
        body: 'Сводка квизов, слабых тем, pre/post и Q&A за выбранные даты.'
    },
    {
        title: 'Heatmap сцены',
        href: '/stage-heatmap.html',
        iconName: 'activity',
        meta: 'Категории и слабые места',
        body: 'Визуализация для обсуждения на проекторе.'
    },
    {
        title: 'Админка',
        href: '/admin.html',
        iconName: 'settings',
        meta: 'Пароль администратора',
        body: 'Вопросы, аналитика, «плохие вопросы», пакетная регистрация.'
    },
    {
        title: 'QR-слайд',
        href: '/qr.html',
        iconName: 'target',
        meta: 'На проектор или в чат',
        body: 'Участники сканируют QR и попадают на главную викторины.'
    },
    {
        title: 'Статус',
        href: '/status.html',
        iconName: 'activity',
        meta: 'Диагностика на площадке',
        body: 'Здоровье API, сброс кэша, версия сборки.'
    },
    {
        title: 'Гайд спикера',
        href: '/guide/speaker',
        iconName: 'note',
        meta: 'Чеклист семинара',
        body: 'Полная инструкция: коды, Kahoot, пульс, Q&A, сценарии.'
    }
];

function absoluteUrl(path) {
    try {
        return new URL(path, window.location.origin).href;
    } catch {
        return path;
    }
}

function copyRow(label, value) {
    return `
        <div class="copy-row">
            <div class="stack-tight">
                <span class="copy-label">${escapeHtml(label)}</span>
                <code class="copy-value">${escapeHtml(value)}</code>
            </div>
            <button class="button secondary" type="button" data-action="copy-link"
                    data-copy="${escapeHtml(value)}">${icon('copy')}Копировать</button>
        </div>
    `;
}

function toolCard(tool) {
    return `
        <article class="card card-lead">
            <span class="card-icon" aria-hidden="true">${icon(tool.iconName)}</span>
            <div class="stack-tight">
                <span class="card-title">${escapeHtml(tool.title)}</span>
                <span class="card-meta"><span class="badge">${escapeHtml(tool.meta)}</span></span>
                <p class="card-body">${escapeHtml(tool.body)}</p>
                <div class="button-row" style="margin-top: var(--sp-2)">
                    <a class="button" href="${escapeHtml(tool.href)}">${icon('external')}Открыть</a>
                    ${tool.participant
                        ? `<button class="button secondary" type="button" data-action="copy-link"
                                   data-copy="${escapeHtml(absoluteUrl(tool.participant))}">${icon('copy')}Ссылка игрока</button>`
                        : ''}
                </div>
            </div>
        </article>
    `;
}

export function hostView() {
    return `
        <section>
            ${pageHead(
                'Кабинет спикера',
                'Инструменты ведущего',
                'Единая точка входа во все режимы зала и ссылки для участников.'
            )}

            ${callout('', {
                tone: 'info',
                iconName: 'presentation',
                html: '<strong>Как запустить зал:</strong> откройте нужный хост, покажите PIN или QR, затем дайте участникам ссылку из списка ниже.'
            })}

            <div class="section">
                ${sectionHead('Ссылки участникам')}
                <div class="stack">
                    ${copyRow('Новый интерфейс (V2)', absoluteUrl('/v2/'))}
                    ${copyRow('Вход в семинар (V2)', absoluteUrl('/v2/join'))}
                    ${copyRow('Классическая главная', absoluteUrl('/'))}
                    ${copyRow('Kahoot-игрок', absoluteUrl('/realtime-player.html'))}
                    ${copyRow('Пульс-игрок', absoluteUrl('/pulse-player.html'))}
                    ${copyRow('Q&A-участник', absoluteUrl('/qa-player.html'))}
                </div>
            </div>

            <div class="section">
                ${sectionHead('Хост-инструменты')}
                <div class="stack">
                    ${TOOLS.map(toolCard).join('')}
                </div>
            </div>

            <div class="section">
                <div class="link-list">
                    <a href="/guide/speaker">${icon('note')}<span>Гайд спикера</span><span class="link-arrow">${icon('external')}</span></a>
                    <a href="/status.html">${icon('activity')}<span>Статус сервиса</span><span class="link-arrow">${icon('external')}</span></a>
                    <a href="/v2/" data-route="/">${icon('home')}<span>К интерфейсу участника</span><span class="link-arrow">${icon('arrowRight')}</span></a>
                </div>
            </div>
        </section>
    `;
}

export async function copyText(value) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
}
