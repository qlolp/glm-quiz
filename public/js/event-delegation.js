// public/js/event-delegation.js
// Universal [data-action] click delegation to replace inline event handlers.
(function() {
    'use strict';

    function parseArg(value) {
        if (value === undefined) return undefined;
        const str = String(value).trim();
        if (str === '') return undefined;
        if (/^-?\d+$/.test(str)) return parseInt(str, 10);
        return str;
    }

    document.addEventListener('click', function(e) {
        const el = e.target.closest('[data-action]');
        if (!el) return;

        const action = el.dataset.action;
        const argRaw = el.dataset.arg;
        const valRaw = el.dataset.val;
        const extraRaw = el.dataset.extra;

        // Built-in actions that don't need a global function
        if (action === 'closeParent') {
            el.parentElement.remove();
            return;
        }
        if (action === 'clickElement') {
            const target = document.getElementById(argRaw);
            if (target) target.click();
            return;
        }
        if (action === 'navigateTo') {
            window.location.href = argRaw;
            return;
        }
        if (action === 'reloadPage') {
            location.reload();
            return;
        }

        const fn = window[action];
        if (typeof fn !== 'function') {
            console.warn('No global handler for data-action:', action);
            return;
        }

        // Handlers that expect the click event as the first argument
        if (action === 'showTab' || action === 'selectFeedback') {
            // Preserve the original event but make currentTarget point to the
            // [data-action] element, matching the behavior of inline handlers.
            const syntheticEvent = Object.create(e);
            Object.defineProperty(syntheticEvent, 'currentTarget', {
                value: el,
                configurable: true
            });
            const args = [syntheticEvent];
            if (argRaw !== undefined) args.push(parseArg(argRaw));
            return fn.apply(null, args);
        }

        // Generic handlers: numeric/string arguments from data-arg, data-val, data-extra
        const args = [];
        if (argRaw !== undefined) args.push(parseArg(argRaw));
        if (valRaw !== undefined) args.push(parseArg(valRaw));
        if (extraRaw !== undefined) args.push(parseArg(extraRaw));

        return fn.apply(null, args);
    });
})();
