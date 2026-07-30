import { icon } from './icons.js';

const navItems = [
    ['/', 'Главная', 'home'],
    ['/learn', 'Обучение', 'learn'],
    ['/cases', 'Кейсы', 'cases'],
    ['/profile', 'Профиль', 'profile']
];

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export { escapeHtml };

function activeNav(route) {
    if (route.startsWith('/quiz') || route.startsWith('/result') || route.startsWith('/start') || route === '/join') {
        return '/';
    }
    if (route.startsWith('/learn')) return '/learn';
    if (route.startsWith('/cases') || route.startsWith('/case')) return '/cases';
    if (route === '/me' || route.startsWith('/profile')) return '/profile';
    if (route.startsWith('/host')) return '';
    return route;
}

export function shell(content, route = '/') {
    const active = activeNav(route);
    const nav = navItems.map(([href, label, iconName]) => `
        <a class="nav-item" href="/v2${href === '/' ? '/' : href}" data-route="${href}"
           ${active === href ? 'aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></a>
    `).join('');

    return `
        <div class="app-shell">
            <header class="topbar">
                <div class="topbar-inner">
                    <a class="brand" href="/v2/" data-route="/">
                        <span class="brand-mark" aria-hidden="true"></span>
                        GLM Quiz
                        <span class="brand-sub">V2</span>
                    </a>
                    <a class="topbar-link" href="/v2/host" data-route="/host">
                        ${icon('presentation')}<span>Спикерам</span>
                    </a>
                </div>
            </header>
            <main id="main" class="page" tabindex="-1">${content}</main>
            <nav class="bottom-nav" aria-label="Основная навигация">
                <div class="bottom-nav-inner">${nav}</div>
            </nav>
        </div>
    `;
}

/**
 * Page header block: eyebrow, serif title and optional lede.
 */
export function pageHead(eyebrow, title, lede = '') {
    return `
        <div class="page-head">
            ${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
            <h1>${escapeHtml(title)}</h1>
            ${lede ? `<p class="lede">${escapeHtml(lede)}</p>` : ''}
        </div>
    `;
}

export function sectionHead(title, text = '') {
    return `
        <div class="section-head">
            <h2>${escapeHtml(title)}</h2>
            ${text ? `<p class="muted">${escapeHtml(text)}</p>` : ''}
        </div>
    `;
}

export function callout(text, { tone = '', iconName = 'info', html = '' } = {}) {
    return `
        <div class="callout ${tone}">
            ${icon(iconName)}
            <div>${html || escapeHtml(text)}</div>
        </div>
    `;
}

/**
 * Determinate step meter. Replaces <progress>, whose fill colour could not be
 * styled consistently across engines.
 */
export function meter(current, total, label = 'Вопрос') {
    const safeTotal = Math.max(1, Number(total) || 1);
    const percent = Math.min(100, Math.round((current / safeTotal) * 100));
    return `
        <div class="meter-wrap">
            <p class="meter-label">
                <span>${escapeHtml(label)} <span class="meter-step">${current} / ${safeTotal}</span></span>
                <span>${percent}%</span>
            </p>
            <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100"
                 aria-valuenow="${percent}" aria-label="${escapeHtml(label)} ${current} из ${safeTotal}">
                <div class="meter-fill" style="width:${percent}%"></div>
            </div>
        </div>
    `;
}

export function loadingState(message = 'Загружаем…') {
    return `
        <section aria-busy="true" aria-label="${escapeHtml(message)}">
            <div class="page-head">
                <p class="eyebrow">${escapeHtml(message)}</p>
            </div>
            <div class="stack">
                <div class="skeleton"></div>
                <div class="skeleton"></div>
                <div class="skeleton"></div>
            </div>
        </section>
    `;
}

export function errorState(message, action = 'Повторить', { home = false } = {}) {
    const control = home
        ? `<a class="button" href="/v2/" data-route="/">${icon('home')}${escapeHtml(action)}</a>`
        : `<button class="button" type="button" data-action="retry">${icon('repeat')}${escapeHtml(action)}</button>`;
    return `
        <section class="state-card reveal-panel" role="alert">
            <span class="state-icon err">${icon('alert')}</span>
            <h1>Что-то пошло не так</h1>
            <p class="muted">${escapeHtml(message)}</p>
            <div class="button-row">
                ${control}
                ${home ? '' : '<a class="button secondary" href="/v2/" data-route="/">На главную</a>'}
            </div>
        </section>
    `;
}

export function emptyState(title, text, href = '/', action = 'На главную', iconName = 'inbox') {
    return `
        <section class="state-card reveal-panel">
            <span class="state-icon">${icon(iconName)}</span>
            <h1>${escapeHtml(title)}</h1>
            <p class="muted">${escapeHtml(text)}</p>
            <a class="button" href="/v2${href}" data-route="${href}">${escapeHtml(action)}${icon('arrowRight')}</a>
        </section>
    `;
}

export function announce(message) {
    const node = document.querySelector('#announcer');
    if (node) node.textContent = message;
}
