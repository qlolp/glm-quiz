const BASE = '/v2';

export function currentRoute() {
    const path = window.location.pathname;
    if (path === BASE || path === `${BASE}/`) return '/';
    return path.startsWith(`${BASE}/`) ? path.slice(BASE.length) : '/';
}

export function navigate(route, { replace = false, silent = false } = {}) {
    const normalized = route === '/' ? `${BASE}/` : `${BASE}${route}`;
    history[replace ? 'replaceState' : 'pushState']({}, '', normalized);
    if (!silent) window.dispatchEvent(new CustomEvent('glm:navigate'));
}

export function installRouter(render) {
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[data-route]');
        if (!link || event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(link.dataset.route);
    });
    window.addEventListener('popstate', render);
    window.addEventListener('glm:navigate', render);
}
