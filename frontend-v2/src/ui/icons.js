/*
 * Inline stroke icons. Kept as a tiny map rather than an icon font so the
 * glyphs inherit currentColor, scale with rem sizing and need no extra
 * network request at a seminar venue.
 */

const PATHS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-6h5v6"/>',
    learn: '<path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H9a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H3z"/><path d="M21 5.5A1.5 1.5 0 0 0 19.5 4H15a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H21z"/>',
    cases: '<path d="M4 7h16v13H4z"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M4 12h16"/>',
    profile: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    check: '<path d="M20 6.5 9.5 17 4 11.5"/>',
    cross: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
    arrowRight: '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
    arrowLeft: '<path d="M20 12H5"/><path d="M11 18l-6-6 6-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.75h.01"/>',
    alert: '<path d="M12 3.5 22 20H2z"/><path d="M12 9.5v5"/><path d="M12 17.5h.01"/>',
    offline: '<path d="M3 3l18 18"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><path d="M5 12a10 10 0 0 1 4-2.5"/><path d="M15 9.5A10 10 0 0 1 19 12"/><path d="M12 19h.01"/>',
    play: '<path d="M7 4.5 19 12 7 19.5z"/>',
    repeat: '<path d="M4 11a8 8 0 0 1 13.5-5.5L20 8"/><path d="M20 4v4h-4"/><path d="M20 13a8 8 0 0 1-13.5 5.5L4 16"/><path d="M4 20v-4h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.5 2"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    cards: '<path d="M4 7h11v13H4z"/><path d="M8 4h11v13"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5.5"/><path d="M17 19a6 6 0 0 0-2-4.4"/>',
    presentation: '<path d="M3 4h18"/><path d="M4 4v10h16V4"/><path d="M12 14v3"/><path d="M8.5 20l3.5-3 3.5 3"/>',
    copy: '<path d="M9 9h11v11H9z"/><path d="M15 9V4H4v11h5"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    certificate: '<circle cx="12" cy="9.5" r="5.5"/><path d="M9 14.5 8 21l4-2 4 2-1-6.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3"/><path d="M12 18.5v3"/><path d="M2.5 12h3"/><path d="M18.5 12h3"/><path d="M5.3 5.3l2.1 2.1"/><path d="M16.6 16.6l2.1 2.1"/><path d="M18.7 5.3l-2.1 2.1"/><path d="M7.4 16.6l-2.1 2.1"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    note: '<path d="M5 3.5h14v17H5z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h3"/>',
    pulse: '<path d="M3 12h4l2.5-6 4 12L16 12h5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8"/><path d="M16.5 6.5 19 9"/>',
    activity: '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 4h14l2 9v7H3v-7z"/>'
};

/**
 * Renders a decorative inline icon. Icons here are always paired with a text
 * label, so they stay hidden from assistive technology.
 */
export function icon(name, { size = null } = {}) {
    const body = PATHS[name];
    if (!body) return '';
    const style = size ? ` style="width:${size};height:${size}"` : '';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${style}>${body}</svg>`;
}

export function hasIcon(name) {
    return Boolean(PATHS[name]);
}
