# Hotfix v2026.07.07.13 — HSTS env-gating

Дата: 2026-07-08
Контекст: seminar в локальной сети без HTTPS.

═══════════════════════════════════════════════
 Что изменилось
═══════════════════════════════════════════════

В server.js (~server.js:267-294) Helmet выставлял
Strict-Transport-Security: max-age=15552000; includeSubDomains
**по дефолту**, что для HTTP-only origin'а смертельно для
локалки: браузер залочит участника seminar-а на HTTPS на 180
дней, и повторный визит закончится ошибкой.

Теперь HSTS включается только если выставлен флаг
ENABLE_HSTS=1 в .env. По дефолту (на seminar'е) — заголовок
не отдаётся.

Фикс:
```js
const hstsEnabled = process.env.ENABLE_HSTS === '1';
app.use(helmet({
    // ... existing CSP/CORP config ...
    strictTransportSecurity: hstsEnabled
        ? { maxAge: 15552000, includeSubDomains: true }
        : false
}));
```

Когда выйдешь на HTTPS (свой домен + certbot/nginx) — просто
поставь в /root/glm-quiz/.env:
  ENABLE_HSTS=1
и перезапусти.

═══════════════════════════════════════════════
 Тесты
═══════════════════════════════════════════════

Добавлен tests/helmet-headers.test.cjs:
  - Static: грэппит server.js на правильные helmet-флаги
    (env-gate, upgradeInsecureRequests=null, CSP connect-src
    ws:/wss:, frame-ancestors none, CORP cross-origin)
  - Live (опционально, BASE_URL=...): curl /api/health и
    проверка заголовков на runtime
  - Проверяет что без ENABLE_HSTS строгий HSTS отсутствует
  - Проверяет что с ENABLE_HSTS=1 он есть и валидный

Запустить:
  node tests/helmet-headers.test.cjs
  BASE_URL=http://147.45.174.206 node tests/helmet-headers.test.cjs
  ENABLE_HSTS=1 BASE_URL=http://147.45.174.206 node tests/helmet-headers.test.cjs

═══════════════════════════════════════════════
 Deploy на VPS — заблокирован в этом сеансе
═══════════════════════════════════════════════

Текущая сессия Hermes не имеет SSH-доступа к VPS 147.45.174.206:

  $ ssh -p 443 -i /root/.ssh/id_ed25519 root@147.45.174.206
  Permission denied (publickey)

Ключ /root/.ssh/id_ed25519 не авторизован на VPS для root.
Варианты:
  1. Залить мой публичный ключ в VPS authorized_keys
  2. Использовать пароль (интерактивно, через terminal pty=true)
  3. Сделать deploy вручную:
       - скопировать server/server.js + version.json +
         tests/helmet-headers.test.cjs через scp
       - systemctl restart glm-quiz

Подскажи как разворачивать, и я пройду deploy-скрипт.

═══════════════════════════════════════════════
 Файлы изменены (локально)
═══════════════════════════════════════════════

  server/server.js             — HSTS env-gate
  version.json                  — bumped to 2026.07.07.13
  tests/helmet-headers.test.cjs — new (static + live)

═══════════════════════════════════════════════
 Что НЕ менялось
═══════════════════════════════════════════════

  - Все P0/P1/P2 фиксы v7-v12 — нетронуты
  - CSP, CORP, COOP, X-Content-Type-Options — на месте
  - upgradeInsecureRequests=null — сохранён (правильно для HTTP)
  - API E2E / browser smoke / WebSocket — без изменений