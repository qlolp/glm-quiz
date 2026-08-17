/**
 * GLM Quiz App - Service Worker
 * PWA + Offline-first functionality
 */

const CACHE_VERSION = '2026.08.17.2';
const CACHE_NAME = `quiz-v${CACHE_VERSION}`;

// Static assets to cache immediately
const STATIC_CACHE_URLS = [
    '/',
    '/index.html',
    '/learning.html',
    '/cases.html',
    '/gamification.html',
    '/rating.html',
    '/register.html',
    '/admin.html',
    '/analytics.html',
    '/my-certificates.html',
    '/verify-certificate.html',
    '/manager-dashboard.html',
    '/spaced-repetition.html',
    '/realtime-host.html',
    '/realtime-player.html',
    '/pulse-host.html',
    '/pulse-player.html',
    '/qa-host.html',
    '/qa-player.html',
    '/seminar-digest.html',
    '/stage-heatmap.html',
    '/join',
    '/host',
    '/offline.html',
    '/manifest.json',
    '/questions.json',
    '/status.html',
    '/js/utils.js',
    '/js/app-update.js',
    '/js/user.js',
    '/js/event-delegation.js',
    '/js/suppress-logs.js',
    '/css/modern-theme.css',
    '/css/guide.css'
];

// API endpoints that use Network First strategy
const API_ENDPOINTS = [
    '/api/questions',
    '/api/results',
    '/api/achievements',
    '/api/users',
    '/api/leaderboard',
    '/api/rating',
    '/api/cases',
    '/api/analytics',
    '/api/stats/dashboard',
    '/api/health',
    '/api/version',
    '/api/status'
];

// Offline fallback page
const OFFLINE_FALLBACK = '/offline.html';

// ========== INSTALL ==========

self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                console.log('[SW] Static assets cached');
                return self.skipWaiting(); // Activate immediately
            })
            .catch((error) => {
                console.error('[SW] Failed to cache static assets:', error);
            })
    );
});

// ========== ACTIVATE ==========

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // Delete old caches
                        if (cacheName !== CACHE_NAME && cacheName.startsWith('quiz-v')) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Service Worker activated');
                return self.clients.claim(); // Take control immediately
            })
    );
});

// ========== FETCH STRATEGIES ==========

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. API requests - Network First with Cache fallback
    if (API_ENDPOINTS.some(endpoint => url.pathname.startsWith(endpoint))) {
        event.respondWith(networkFirstStrategy(request));
        return;
    }

    // 2. V2 HTML is always network-first; hashed Vite assets are network-only.
    if (url.pathname === '/v2' || url.pathname.startsWith('/v2/')) {
        const accept = request.headers.get('accept') || '';
        event.respondWith(accept.includes('text/html') ? htmlStrategy(request) : fetch(request));
        return;
    }

    // 3. Static assets - Cache First with Network fallback
    if (request.method === 'GET' && STATIC_CACHE_URLS.some(path => url.pathname === path || url.pathname.endsWith(path))) {
        event.respondWith(cacheFirstStrategy(request));
        return;
    }

    // 4. HTML pages - Network First, fallback to cache, then offline page
    const accept = request.headers.get('accept');
    if (accept && accept.includes('text/html')) {
        event.respondWith(htmlStrategy(request));
        return;
    }

    // 5. Other requests - Network only
    event.respondWith(fetch(request));
});

/**
 * Network First Strategy for API requests
 * Try network first, fallback to cache if offline
 */
async function networkFirstStrategy(request) {
    const cache = await caches.open(CACHE_NAME);

    try {
        // Try network first
        const networkResponse = await fetch(request);

        // Cache the response for future use
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);

        // Fallback to cache
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        // Return offline error response
        return new Response(
            JSON.stringify({
                error: 'offline',
                message: 'Нет подключения к интернету. Используйте сохранённые данные.'
            }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

/**
 * Cache First Strategy for static assets
 * Use cache first, update from network in background
 */
async function cacheFirstStrategy(request) {
    const cache = await caches.open(CACHE_NAME);

    // Try cache first
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        // Update cache in background
        fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
                cache.put(request, networkResponse);
            }
        }).catch(() => {}); // Ignore network errors

        return cachedResponse;
    }

    // Fallback to network
    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed for static asset:', request.url);

        // Return a basic fallback response
        return new Response('Ресурс недоступен оффлайн', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

/**
 * HTML Strategy for pages
 * Network First -> Cache -> Offline page
 */
async function htmlStrategy(request) {
    const cache = await caches.open(CACHE_NAME);
    const url = new URL(request.url);

    try {
        // Try network first
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache for HTML');

        // Try cache
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        // Fallback to offline page (if not already requesting it)
        if (!url.pathname.includes('offline')) {
            const offlineResponse = await cache.match(new URL(OFFLINE_FALLBACK, location.origin));

            if (offlineResponse) {
                return offlineResponse;
            }
        }

        // Last resort - basic offline HTML
        return new Response(
            `<!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Оффлайн режим</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        background: #0c0c0e;
                        color: #ffffff;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 20px;
                    }
                    .offline-container {
                        max-width: 400px;
                        text-align: center;
                    }
                    .offline-icon {
                        font-size: 64px;
                        margin-bottom: 20px;
                    }
                    h1 {
                        font-size: 24px;
                        margin-bottom: 16px;
                    }
                    p {
                        color: #9fa0a0;
                        line-height: 1.6;
                        margin-bottom: 24px;
                    }
                    button {
                        padding: 12px 24px;
                        background: #ffffff;
                        color: #0c0c0e;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        cursor: pointer;
                    }
                </style>
            </head>
            <body>
                <div class="offline-container">
                    <div class="offline-icon">📡</div>
                    <h1>Нет подключения к интернету</h1>
                    <p>Проверьте соединение и обновите страницу. Некоторые функции могут быть недоступны.</p>
                    <button onclick="location.reload()">Обновить</button>
                </div>
            </body>
            </html>`,
            {
                status: 503,
                headers: { 'Content-Type': 'text/html' }
            }
        );
    }
}

// ========== BACKGROUND SYNC ==========

self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);

    if (event.tag === 'sync-results') {
        event.waitUntil(syncResults());
    }
});

/**
 * Sync pending results when connection is restored
 */
async function syncResults() {
    try {
        console.log('[SW] Background sync not yet implemented');
    } catch (error) {
        console.error('[SW] Failed to sync results:', error);
    }
}

// ========== PUSH NOTIFICATIONS ==========

self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');

    let data = {
        title: 'Уведомление',
        body: 'У вас новое уведомление',
        icon: '/manifest.json'
    };

    if (event.data) {
        try {
            data = JSON.parse(event.data.text());
        } catch (e) {
            console.error('[SW] Failed to parse push data:', e);
        }
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: '/manifest.json',
            vibrate: [200, 100, 200],
            tag: 'quiz-notification',
            requireInteraction: false
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.openWindow('/')
    );
});

// ========== MESSAGE HANDLING ==========

self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);

    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(CACHE_NAME)
                .then((cache) => cache.addAll(event.data.urls))
        );
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME).then(() => {
                console.log('[SW] Cache cleared');
            })
        );
    }
});
