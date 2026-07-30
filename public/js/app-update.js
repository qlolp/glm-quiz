// App version check and Service Worker update prompt
(function() {
    'use strict';

    const BANNER_ID = 'app-update-banner';

    function showUpdateBanner(message, onUpdate) {
        if (document.getElementById(BANNER_ID)) return;

        const banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; z-index: 20000;
            background: linear-gradient(135deg, #2563eb, #7c3aed);
            color: #fff; padding: 12px 16px; display: flex; align-items: center;
            justify-content: center; gap: 12px; flex-wrap: wrap;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3); font-size: 14px;
        `;
        banner.innerHTML = `
            <span>${message}</span>
            <button type="button" id="app-update-btn" style="
                background: #fff; color: #2563eb; border: none; border-radius: 8px;
                padding: 8px 16px; font-weight: 600; cursor: pointer;
            ">Обновить</button>
            <button type="button" id="app-update-dismiss" style="
                background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.5);
                border-radius: 8px; padding: 8px 12px; cursor: pointer;
            ">Позже</button>
        `;
        document.body.prepend(banner);
        document.body.style.paddingTop = (banner.offsetHeight + 4) + 'px';

        document.getElementById('app-update-btn').addEventListener('click', onUpdate);
        document.getElementById('app-update-dismiss').addEventListener('click', () => banner.remove());
    }

    async function hardRefreshApp() {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter(k => k.startsWith('quiz-v')).map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
        }
        localStorage.removeItem('app_version');
        window.location.reload();
    }

    window.hardRefreshApp = hardRefreshApp;

    async function initAppUpdate() {
        if (!('serviceWorker' in navigator)) return;

        let registration;
        try {
            registration = await navigator.serviceWorker.register('/sw.js');
        } catch (e) {
            console.error('SW registration failed:', e);
            return;
        }

        registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
                if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateBanner('Доступна новая версия приложения.', () => {
                        worker.postMessage({ type: 'SKIP_WAITING' });
                        setTimeout(() => window.location.reload(), 300);
                    });
                }
            });
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            const reloaded = sessionStorage.getItem('sw_reloading');
            if (reloaded) return;
            sessionStorage.setItem('sw_reloading', '1');
            window.location.reload();
        });

        try {
            const res = await fetch('/api/version', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            const stored = localStorage.getItem('app_version');
            if (stored && stored !== data.version) {
                showUpdateBanner(`Обновление ${stored} → ${data.version}. Рекомендуем обновить.`, hardRefreshApp);
            }
            localStorage.setItem('app_version', data.version);
        } catch (e) {
            console.warn('Version check failed:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAppUpdate);
    } else {
        initAppUpdate();
    }
})();
