# AGENTS.md — Инструкция для следующего ИИ-агента

> **Прочитай первым делом** при начале работы над проектом.
> Файл предназначен для ИИ-агентов (Claude Code, Codex, Hermes, Cursor и т.д.).
> Человеку тоже полезен, но оптимизирован под LLM.

---

## 0. Контекст в одном абзаце

**GLM Quiz** — это обучающая викторина для семинара директоров стационарных соцучреждений СПб (25–27 августа 2026). 84 вопроса, 14 категорий, 3 кейса, 4 режима тестирования (обучение/быстрый/аттестация/адаптивный), Kahoot (WebSocket), сертификаты с QR, PWA. **Текущая версия:** `2026.07.07.2`. **Деплой:** VPS `147.45.174.206:80` → Node `:3002`, nginx reverse-proxy, systemd unit `glm-quiz.service`. **БД:** SQLite `server/quiz.db`. **Стек:** Node 18+ / Express / better-sqlite3 / Vanilla JS / ws / QRious.

---

## 1. Быстрый старт (3 минуты до первого действия)

```bash
# 1. Подключиться к VPS
ssh -p 443 -i ~/.ssh/id_ed25519 root@147.45.174.206
cd /root/glm-quiz

# 2. Проверить, что сервис жив
systemctl status glm-quiz
curl -s http://127.0.0.1:3002/api/health

# 3. Посмотреть, что менялось в последних коммитах/деплоях
ls -la *.md
cat version.json | python3 -m json.tool | head

# 4. Запустить тесты
BASE_URL=http://127.0.0.1:3002 ADMIN_PASSWORD=quizadmin2024 node tests/api-e2e.test.cjs
```

**Пароли и токены** — в `.env` на VPS, **НИКОГДА не выкладывать в git/issue/PR**. Содержимое `.env`:
- `PORT=3002`
- `NODE_ENV=production`
- `ADMIN_PASSWORD=quizadmin2024` (для `/api/auth/admin`)
- `USER_TOKEN_SECRET=...` (HMAC для user JWT)
- `ADMIN_TOKEN_SECRET=...` (HMAC для admin JWT)
- `RATE_LIMIT=120`
- `USE_HTTPS=false`

---

## 2. Что было сделано в последних релизах

### v2026.07.07.2 (2026-07-07, текущий) — финальная ревизия агентом

**6 P0/P1 уязвимостей закрыты:**
- helmet `crossOriginResourcePolicy: { policy: 'cross-origin' }` (CDN-скрипты больше не блокируются)
- `requireAdmin` на `/api/analytics`, `/api/stats/dashboard`, `/api/stats/participants`
- `requireUser + req.userId` на `/api/spaced-repetition/due`, `/api/stats`, `/api/quiz/adaptive/start`, `/api/quiz/adaptive/next`
- `/api/users` POST теперь возвращает `token` через `generateUserToken`

**Баг «Адаптивный — не удалось загрузить вопросы»** исправлен end-to-end:
- **Backend:** adaptive endpoints принимают `categories: string[]` + `category: string` (для backward-compat), SQL фильтр `WHERE category IN (...)`.
- **Frontend:** `loadAdaptiveQuiz()` и `loadNextAdaptiveQuestion()` маппят `selectedRole` → `roleCategories[selectedRole]` и шлют массив.
- **Root cause был в фронте:** `const category = selectedRole === 'all' ? 'ethics' : 'general';` — `'general'` нет в БД, → 0 вопросов → ошибка в UI.

### v2026.07.07.1 (2026-07-07, юзер) — ревизия юзером

- Server-side anti-cheat в `/api/quiz/complete` — score пересчитывается по DB
- Все IDOR на progress endpoints (`requireUser + req.userId`)
- `requireAdmin` на `/api/dashboard/manager`, `/api/batch-import`
- WebSocket: origin check, maxPayload, correct_answer убран из WS payload
- Timing-safe HMAC (`crypto.timingSafeEqual`) в auth
- USER_TOKEN_SECRET обязателен на production
- XSS: sanitizeString + escapeHtml
- Frontend escapeHtml в realtime, cases, admin

### v2026.07.06.18 (2026-07-06, юзер) — стабильная версия до ревизии

---

## 3. Архитектура проекта

### Структура файлов

```
/root/glm-quiz/
├── server/
│   ├── server.js          # ВСЁ API + WS в одном файле (~4500 строк)
│   ├── package.json
│   ├── quiz.db            # SQLite (НЕ редактировать руками)
│   └── *.db               # бэкапы quiz.db.YYYYMMDD-HHMMSS
├── public/
│   ├── index.html         # Главная страница (243K, всё в одном файле!)
│   ├── js/                # ~10 модулей
│   │   ├── user.js
│   │   ├── auth.js        # authFetch, setUserSession
│   │   ├── app-update.js  # SW версия
│   │   ├── utils.js
│   │   ├── event-delegation.js
│   │   ├── score-saver.js
│   │   ├── html5-qrcode.min.js
│   │   ├── kahoot-realtime.js
│   │   └── ...
│   ├── css/modern-theme.css  # Светлая тема
│   ├── status.html        # Диагностика (для семинара)
│   ├── guides/            # USER_GUIDE.html, SPEAKER_GUIDE.html
│   ├── sw.js              # Service Worker (с версионированием)
│   ├── manifest.json
│   └── *.png / icons
├── tests/
│   ├── api-e2e.test.cjs   # 24 API теста
│   ├── smoke-browser.mjs  # Playwright 11 тестов
│   ├── load-test.js
│   └── (browser/)         # HTML-страницы для Playwright
├── questions.json         # Банк вопросов (84 шт.)
├── roles.json             # Роли (7 шт.)
├── version.json           # Версия + ченджлог
├── deploy.sh              # Автодеплой
├── *.md                   # документация
└── .env                   # НЕ в git
```

### Что в server/server.js (карта)

| Линии | Секция |
|-------|--------|
| 1–80 | imports, dotenv, helmet setup, express |
| 80–130 | sanitizeString, generateUserToken, verifyUserToken, verifyAdminToken, requireUser, requireAdmin |
| 130–250 | DB schema (CREATE TABLE IF NOT EXISTS), миграции |
| 250–450 | `/api/auth/*` (register, verify, admin, verify admin code) |
| 450–650 | `/api/users` (POST), `/api/profile`, `/api/results` |
| 650–1000 | `/api/questions`, `/api/default-questions`, CRUD |
| 1000–1200 | `/api/analytics`, `/api/quiz/adaptive/*` |
| 1200–1500 | `/api/cases/*`, `/api/learning/complete`, `/api/competency/*` |
| 1500–2000 | `/api/certificates/*` (generate, verify, search, download) |
| 2000–2500 | `/api/stats/*`, `/api/dashboard/manager`, `/api/results` |
| 2500–3000 | `/api/spaced-repetition/*`, `/api/rating`, `/api/achievements` |
| 3000–3500 | `/api/leaderboard`, `/api/export`, `/api/import` |
| 3500–4000 | `/api/batch-*`, admin endpoints, `/api/questions/:id/rate|report` |
| 4000–4200 | static files, `/status.html`, `/guide/*` |
| 4200–4461 | WebSocket: `/ws/kahoot`, `/ws/quiz`, `/ws/case`, verifyClient, wss.on('connection') |

**NB:** Эти линии приблизительные. Перед редактированием **всегда** используй `grep -n "endpoint` или `read_file` с offset для навигации.

### Что в public/index.html (карта)

| Линии | Секция |
|-------|--------|
| 1–50 | HTML head, meta, viewport, CDN-скрипты (после CORP fix работают) |
| 50–500 | Welcome screen, login screen, role selection |
| 500–1500 | Quiz container (training mode, быстрый тест, аттестация) |
| 1500–2500 | Cases container (3 кейса) |
| 2500–3500 | Kahoot container, Real-time container |
| 3500–3800 | Adaptive mode (loadAdaptiveQuiz, loadNextAdaptiveQuestion) |
| 3800–4500 | Admin panel (CRUD, импорт, экспорт, batch) |
| 4500+ | Achievements, certificates, certificates search/download |

### Auth flow

```
Browser                Server
───────                ──────
[Welcome]  →  POST /api/users { username }
                     ↓
              create user
              generateUserToken(user.id)
                     ↓
[Welcome] ←  { user, token }   ← ВАЖНО: token нужен для всех request'ов!
                     ↓
[Role sel] →  GET /api/questions
                     ↓ (без auth — публичный endpoint)
              [Questions loaded]
                     ↓
[Adaptive] → POST /api/quiz/adaptive/start { categories: [...] }
              Authorization: Bearer <token>
                     ↓
              requireUser → req.userId
              SQL: WHERE category IN (...)
                     ↓
              { session_id, question_pools: {easy, medium, hard} }
```

### DB Schema (упрощённо)

```sql
-- users
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- UUID
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  role TEXT,                     -- 'social_worker', 'director', ...
  department TEXT,
  total_score INTEGER DEFAULT 0,
  quizzes_completed INTEGER DEFAULT 0,
  created_at TEXT
);

-- default_questions (глобальный банк)
CREATE TABLE default_questions (
  id INTEGER PRIMARY KEY,
  question_text TEXT NOT NULL,
  option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT,
  correct_answer INTEGER,        -- 0/1/2/3
  category TEXT,                 -- 'ethics', 'rights', ...
  difficulty TEXT,               -- 'easy'|'medium'|'hard'
  explanation TEXT
);

-- user_questions (пользовательские)
CREATE TABLE user_questions (
  id INTEGER PRIMARY KEY,
  user_id TEXT,                  -- FTS индексируется
  question_text TEXT, ...
  status TEXT DEFAULT 'pending'  -- 'pending'|'approved'|'rejected'
);

-- quiz_results
CREATE TABLE quiz_results (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  mode TEXT,                     -- 'training'|'quick'|'attestation'|'adaptive'
  score INTEGER,
  total INTEGER,
  answers TEXT,                  -- JSON
  created_at TEXT
);

-- certificates
CREATE TABLE certificates (
  id TEXT PRIMARY KEY,           -- UUID
  user_id TEXT,
  cert_id TEXT UNIQUE,
  score INTEGER,
  issued_at TEXT
);

-- spaced_repetition
CREATE TABLE spaced_repetition (
  user_id TEXT, question_id INTEGER,
  ease_factor REAL, interval INTEGER, repetitions INTEGER,
  next_review TEXT
);

-- batch_imports
CREATE TABLE batch_imports (
  id INTEGER PRIMARY KEY,
  filename TEXT,
  total INTEGER, success INTEGER, failed INTEGER,
  errors TEXT,
  imported_by TEXT,
  imported_at TEXT
);
```

---

## 4. Конвенции кода

### Backend (server/server.js)

1. **Все защищённые endpoint'ы** начинаются с `requireUser` или `requireAdmin`.
2. **`user_id` ВСЕГДА берётся из `req.userId`** (из JWT), **никогда** из `req.body` / `req.query` / `req.params`. Это закрывает IDOR.
3. **SQL** через `better-sqlite3` — используй prepared statements: `db.prepare('SELECT ... WHERE id = ?').get(id)`.
4. **Errors** — `res.status(4xx/5xx).json({ error: '...' })`.
5. **Rate limiting** — `rateLimit({ windowMs: 60_000, max: 120 })` на POST endpoints.
6. **XSS** — `sanitizeString(str)` для user-input (≤500 chars, strip HTML).
7. **CSRF** — сейчас нет, только Bearer. На HTTPS добавить.

### Frontend (public/index.html + public/js/*)

1. **Нет фреймворков.** Vanilla JS, модули через `<script>` или `import *`.
2. **Стиль** — функциональный, не ООП. `function loadAdaptiveQuiz() { ... }`.
3. **API_BASE** — константа в начале файла: `const API_BASE = '/api'`.
4. **AuthFetch** — обёртка из `public/js/auth.js`, **всегда через неё** (добавляет Authorization header).
5. **Темы** — общая тема `public/css/modern-theme.css`. Для новых экранов добавлять классы, не inline-стили.
6. **HTML escape** — для user-generated content использовать `escapeHtml()` (определена локально).
7. **PWA** — после изменения `version.json` бампать `CACHE_VERSION` в `public/sw.js`.
8. **Mobile-first** — большинство участников семинара на телефонах.

### Именование

- camelCase для JS / переменных
- snake_case для SQL columns
- kebab-case для URL (`/api/spaced-repetition/due`)
- UPPER_SNAKE_CASE для env vars и констант

---

## 5. Типичные задачи и рецепты

### Добавить новый вопрос в банк

```bash
# 1. Локально отредактировать questions.json (там все 84 вопроса)
# 2. Залить на VPS:
scp -P 443 -i ~/.ssh/id_ed25519 questions.json root@147.45.174.206:/root/glm-quiz/

# 3. На VPS: перезапустить сервис (БД перезальётся из JSON)
ssh -p 443 -i ~/.ssh/id_ed25519 root@147.45.174.206 'cd /root/glm-quiz && systemctl restart glm-quiz'

# 4. Проверить
curl http://127.0.0.1:3002/api/questions | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d["questions"]))'
```

**Лучше** добавлять через admin-панель (`/admin.html` → CRUD), но только для live-правок. В банк для production идёт через `questions.json`.

### Добавить новый endpoint

Пример с правильной структурой:

```javascript
// server/server.js

// 1. Если нужна авторизация:
app.post('/api/my-endpoint', requireUser, async (req, res) => {
    try {
        const user_id = req.userId;  // ВСЕГДА из JWT, не из body!
        const { field1, field2 } = req.body;

        // 2. Валидация
        if (!field1) return res.status(400).json({ error: 'field1 required' });

        // 3. SQL через prepared statement
        const result = db.prepare(
            'INSERT INTO my_table (user_id, field1, field2) VALUES (?, ?, ?)'
        ).run(user_id, sanitizeString(field1), sanitizeString(field2));

        // 4. Response
        res.json({ ok: true, id: result.lastInsertRowid });
    } catch (error) {
        console.error('My endpoint error:', error);
        res.status(500).json({ error: 'Internal error' });
    }
});
```

### Добавить новый тест

```javascript
// tests/api-e2e.test.cjs (там уже есть 24 теста — следуй паттерну)
const test = async () => {
    const res = await fetch(`${BASE_URL}/api/my-endpoint`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ field1: 'test' })
    });
    assert.strictEqual(res.status, 200);
};
```

### Деплой

```bash
# На ЛОКАЛЬНОЙ машине (где есть рабочая копия):
./deploy.sh

# Или вручную:
cd /root/glm-quiz-local
tar czf /tmp/update.tar.gz --exclude='server/node_modules' --exclude='tests/node_modules' \
  public server/server.js questions.json roles.json version.json deploy.sh tests \
  USER_GUIDE.md SPEAKER_GUIDE.md README.md CONTINUE.md ROADMAP.md SEMINAR.md CHECKPOINT.md AGENTS.md
scp -P 443 -i ~/.ssh/id_ed25519 /tmp/update.tar.gz root@147.45.174.206:/tmp/
ssh -p 443 -i ~/.ssh/id_ed25519 root@147.45.174.206 'cd /root/glm-quiz && tar xzf /tmp/update.tar.gz --overwrite && systemctl restart glm-quiz && sleep 2 && curl -s http://127.0.0.1:3002/api/health'
```

### Бэкап БД

```bash
# Ручной:
ssh -p 443 -i ~/.ssh/id_ed25519 root@147.45.174.206 'cp /root/glm-quiz/server/quiz.db /root/glm-quiz/server/quiz.db.$(date +%Y%m%d-%H%M%S)'

# Скачать бэкап:
scp -P 443 -i ~/.ssh/id_ed25519 root@147.45.174.206:/root/glm-quiz/server/quiz.db.20260707-* ./
```

---

## 6. Известные проблемы и gotchas

### Frontend

1. **`roleCategories`** определена в index.html (строка ~3610). Используется и для обычных режимов, и для адаптивного. После фикса v2026.07.07.2 маппинг работает.
2. **`getCurrentUser()`** — обёртка над localStorage. Возвращает `{ id, username, display_name, role, department }` или null.
3. **Адаптивный режим** — теперь работает для всех ролей. Backend принимает `categories: []` (массив).
4. **`loadAdaptiveQuiz()` / `loadNextAdaptiveQuestion()`** — обе используют один и тот же маппинг role→categories. **Если меняешь логику — меняй в обоих местах.**

### Backend

1. **better-sqlite3** — синхронный API. Не await'ить. Не блокирует event loop (нативный binding).
2. **JWT verify** — `verifyUserToken(token)` декодирует и проверяет HMAC. Возвращает `{ userId }` или null.
3. **`requireUser`** — middleware читает `Authorization: Bearer ...`, выставляет `req.userId`.
4. **`requireAdmin`** — аналогично, но с `ADMIN_TOKEN_SECRET`.
5. **Rate limiting** на POST — глобально, не per-endpoint.
6. **`USE_HTTPS=false`** — на HTTP-сервере. CSP без `upgrade-insecure-requests`.

### Деплой

1. **`systemctl restart glm-quiz`** — мгновенный рестарт (порт освобождается).
2. **БД персистится** — `quiz.db` не теряется при рестарте.
3. **`deploy.sh`** сам делает smoke-test после деплоя.
4. **После бампа `version.json`** — пользователи получают баннер "Доступна новая версия" через SW.
5. **`public/sw.js`** — при изменении кэшируемого контента бампать `CACHE_VERSION` (строка в начале файла).

### Nginx

Nginx reverse-proxy на `/etc/nginx/sites-enabled/glm-quiz` (проверить, если нужен HTTPS):

```
server {
    listen 80;
    server_name 147.45.174.206;
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;  # для WebSocket
    }
}
```

---

## 7. Следующие шаги (по приоритету)

### P0 (до семинара 25.08.2026)

1. **HTTPS + домен** — Let's Encrypt, `USE_HTTPS=true`. Без этого админка без TLS, рискованно.
2. **Автобэкап БД** — cron `/opt/quiz-backup.sh` каждый день в 03:00, хранить 7 дней.
3. **Репетиция Kahoot** на Wi-Fi площадки (Kahoot ~30 стаб. WS — реально ли 60+?).
4. **Перезапустить тесты** после v2026.07.07.2:
   ```bash
   BASE_URL=http://127.0.0.1:3002 ADMIN_PASSWORD=quizadmin2024 node tests/api-e2e.test.cjs
   cd tests && BASE_URL=http://127.0.0.1:3002 node smoke-browser.mjs
   ```
   Возможно что-то из старых тестов сломалось из-за `requireUser`/`requireAdmin`.

### P1 (после семинара)

1. **CSRF tokens** — после HTTPS.
2. **Sessions table** — для logout/revoke.
3. **Refresh tokens**.
4. **Audit log** для admin-действий.
5. **Export в Excel/PDF** для отчётности.

### P2 (когда будет время)

1. Расширение банка вопросов (модерация user-submitted).
2. Мультиязычность.
3. Push-уведомления.
4. Mobile app (Capacitor).

---

## 8. Что **НЕ надо делать**

1. **НЕ удалять БД** без бэкапа. Если нужно сбросить — `cp quiz.db quiz.db.bak && rm quiz.db && systemctl restart glm-quiz` (сервер пересоздаст схему).
2. **НЕ редактировать `quiz.db`** SQL-клиентом, пока сервер работает — `better-sqlite3` лочит файл. Остановить → отредактировать → запустить.
3. **НЕ включать `USE_HTTPS=true`** без TLS-сертификата — сломается загрузка.
4. **НЕ трогать `package-lock.json`** без причины — `better-sqlite3` собирается нативно, любая смена Node-версии требует `npm rebuild`.
5. **НЕ выкладывать `.env`** в git или issue.
6. **НЕ заливать `node_modules`** в tar — `deploy.sh` его исключает.
7. **НЕ менять `correct_answer` в seed-данных кейсов** — там в строках 629, 891, 697–712 (server.js) — это **намеренно**, нужно для инициализации БД.
8. **НЕ доверять client-sent `score`** в `/api/quiz/complete` — он пересчитывается по DB.

---

## 9. Связанные документы

| Файл | Что внутри |
|------|------------|
| `README.md` | Обзор + быстрый старт + API-таблица |
| `CONTINUE.md` | Что сделано, что в работе, следующие шаги |
| `ROADMAP.md` | Статус готовности, метрики, техдолг |
| `SEMINAR.md` | План семинара (расписание, спикеры) |
| `USER_GUIDE.md` | Инструкция участника |
| `SPEAKER_GUIDE.md` | Инструкция спикера |
| `CHECKPOINT.md` | Снапшоты состояния |
| `SESSION_REPORT.md` | Отчёт по сессиям разработки |
| `/root/glm-quiz-audit-revision-2.md` | **Полный отчёт security-ревзии (на хосте, не в репо)** |

---

## 10. Экстренные контакты и мета

- **Версия этого файла:** синхронизирован с v2026.07.07.2 (2026-07-07)
- **Автор:** агент MiniMax-M3 (предыдущая сессия)
- **Обновлять при:** изменении API, добавлении endpoints, изменении auth-flow, изменении deploy-процедуры.

**Если ты — следующий ИИ-агент:**
1. Прочитай этот файл целиком.
2. Проверь текущее состояние (`curl /api/version`, `systemctl status`).
3. Запусти тесты.
4. **Не верь слепо комментариям в коде** — они могут быть устаревшими. Верь коду и фактическому поведению API.
5. **Перед большим изменением** — прочитай `/root/glm-quiz-audit-revision-2.md` (security-контекст).
6. После значимых изменений — обнови `version.json`, бампни `public/sw.js` CACHE_VERSION, обнови AGENTS.md / CONTINUE.md / ROADMAP.md.