# GLM Quiz — обучающая викторина по социальному обслуживанию

Интерактивная платформа для проверки и повышения квалификации работников стационарных социальных организаций. Создана к семинару директоров стационарных социальных организаций Санкт-Петербурга (25–27 августа 2026).

**Версия:** `2026.08.01.1` · **84 вопроса** · **14 категорий** · **6 кейсов**

## Сервер

| Роль | URL | Деплой |
|------|-----|--------|
| Production | http://147.45.174.206 | `./deploy-old.sh` (SSH-порт 443) |

Единственная production-цель этой ветки — **`147.45.174.206`**. Скрипт `deploy-old.sh` заблокирован на этот адрес и является канонической точкой входа для деплоя; внутри он вызывает `deploy.sh`.

> Только HTTP. Пока нет TLS, используйте `http://147.45.174.206`, не `https://`.

## Возможности

### Для участника

- **6 режимов**: тренировка (с пояснениями и подсказками), быстрый тест (15 вопросов), микро-квиз (7 вопросов по категории), аттестация (весь банк, сертификат за 90%+), адаптивный, Pre/Post (7 фиксированных вопросов с замером Δ).
- **Оценка уверенности** перед проверкой (уверен / сомневаюсь / угадываю) и инсайт «уверен, но ошибся».
- **Пояснения** после каждого ответа, включая **отдельные пояснения к неверным вариантам** (`wrong_explanations`) и **подсказки** (`hint`) на всех 84 вопросах.
- **Разбор ошибок**, повтор ошибочных вопросов, сохранение **плана действия**.
- **6 кейсов** по 4 шага; кейсы `case_004`–`case_006` — с **ветвлением** сценария (проверка через `/api/cases/:id/check-step`).
- **Сертификаты** — печатный HTML с кодом проверки и страницей верификации.
- **Карточки для повторения** (SM-2, интервальное повторение), матрица компетенций, достижения (6), рейтинг.
- **TTS** — озвучка вопросов через Web Speech API.

### Живые форматы для зала (WebSocket)

- **Kahoot** — реалтайм-викторина с PIN; режимы начисления **классический** и **точность**, командный и личный рейтинг, восстановление сессии.
- **Пульс зала** — анонимный опрос без баллов: вопрос с вариантами (MC) или **шкала/Likert 1–5** с гистограммой и средним.
- **Live Q&A** — анонимные вопросы спикеру с **премодерацией**, одним **upvote** на вопрос, подсветкой и выгрузкой в CSV.

### Для организатора

- **Админ-панель** (`/admin.html`) — CRUD банка вопросов (с `hint`/`wrong_explanations`), модерация вопросов и жалоб, экспорты (CSV/JSON), пакетная регистрация, аналитика.
- **Дайджест дня** (`/seminar-digest.html`) — сводка без ПДн: квизы, слабые категории, Pre/Post-дельта, статистика Q&A.
- **Тепловая карта сцены** (`/stage-heatmap.html`) и раздел «Плохие вопросы».
- **Страница статуса** (`/status.html`), **QR-слайд** (`/qr.html`), автообновление PWA, автобэкап БД (cron 03:00).

### Превью V2

Новый интерфейс участника доступен на **`/v2`** (роуты `/v2/learn`, `/v2/cases`, `/v2/me`, `/v2/host`). Классический UI на `/` остаётся основным. См. раздел «Frontend V2».

## Стек

- **Backend**: Node.js 18+, Express, better-sqlite3 (SQLite), ws (WebSocket).
- **Frontend (legacy)**: Vanilla JS/HTML/CSS + общая тема `public/css/modern-theme.css`, PWA (`sw.js`, `manifest.json`, `app-update.js`).
- **Frontend V2**: Vite + модульный vanilla JS (`frontend-v2/`), сборка в `public/v2`.

## Архитектура сервера

`server/server.js` — тонкий bootstrap: собирает конфиг, Express-приложение, БД, маршруты и WebSocket, запускает HTTP-сервер.

| Модуль | Назначение |
|--------|------------|
| `server/config.js` | Переменные окружения, версия, секреты, флаги |
| `server/app.js` | Создание Express-приложения, middleware, безопасность |
| `server/auth.js` | Токены пользователя/админа, коды подтверждения, rate-limit |
| `server/db/index.js` | Подключение SQLite, схема, миграции, сиды (вопросы, кейсы, достижения), `PREPOST_QUESTION_IDS` |
| `server/routes/` | REST по доменам (см. ниже) |
| `server/ws/` | WebSocket по режимам (см. ниже) |

### REST-маршруты (`server/routes/`)

`index.js` регистрирует домены: `questions`, `core` (results/analytics/users/leaderboard), `cases` (+ Pre/Post, action plans), `question-admin`, `auth`, `seminar-admin` (digest/status/health/version/CSV), `quiz` (check-answer/complete/feedback/batch/achievements), `learning` (spaced repetition, адаптив, компетенции, сертификаты), `admin` (manager dashboard), `pages` (рендер `/guide/*`, отдача `/v2` и SPA).

### WebSocket-режимы (`server/ws/`)

`index.js` подключает `shared` (жизненный цикл соединений, heartbeat, сессии), `kahoot`, `pulse`, `qa`.

## Быстрый старт

### Production (VPS)

```bash
ssh -p 443 -i ~/.ssh/id_ed25519 root@147.45.174.206
cd /root/glm-quiz
systemctl status glm-quiz
systemctl restart glm-quiz
```

Сайт: http://147.45.174.206 · Статус: http://147.45.174.206/status.html

### Локальная разработка (legacy UI)

```bash
cd glm-quiz-local/server
npm install
export ADMIN_PASSWORD=your-admin-password
node server.js          # http://localhost:3000 (или PORT=3002)
```

### Frontend V2 (Vite)

Сборка попадает в `public/v2` и отдаётся тем же сервером на `/v2`:

```bash
cd glm-quiz-local
npm install
npm run build           # vite build → public/v2
ADMIN_PASSWORD=your-admin-password PORT=3000 node server/server.js
# http://localhost:3000/v2
```

Горячая перезагрузка V2 (прокси `/api` → localhost:3000):

```bash
npm run dev:v2          # http://localhost:5173/v2/  (сервер должен быть запущен)
```

## Деплой

```bash
cd glm-quiz-local
./deploy-old.sh         # production (147.45.174.206, SSH порт 443)
```

`deploy-old.sh` заблокирован на `147.45.174.206` и вызывает `deploy.sh`, который: собирает staging (включая `public/v2`), удаляет нативные `node_modules`, сохраняет БД на VPS, вырезает правильные ответы из fallback `questions.json`, делает бэкап на VPS, загружает архив, распаковывает, ставит cron бэкапа БД и перезапускает `glm-quiz`, затем прогоняет API smoke-тест.

## Авторизация

Защищённые API требуют Bearer-токен в заголовке `Authorization` (query-string auth убран).

| Роль | Как получить | Где хранится |
|------|--------------|--------------|
| Пользователь | `/api/auth/verify` после регистрации | `localStorage.userToken` |
| Гость | `POST /api/users` (автоматически при старте) | `localStorage.userToken` |
| Админ | `POST /api/auth/admin` с паролем | `localStorage.adminToken` |

Раздел `/guide/speaker` защищён отдельной cookie-сессией, которая выдаётся после проверки пароля администратора.

> Код подтверждения **не возвращается** в ответе `/api/auth/register`. В демо-режиме участники вводят мастер-код (`DEMO_MASTER_CODE` из `.env`, ≥16 символов). Код `1234` в production отключён.

## API (основное)

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | `/api/health` · `/api/status` · `/api/version` | — | Диагностика и версия |
| GET | `/api/questions` | — | Вопросы без правильных ответов (+ `hint`) |
| POST | `/api/quiz/check-answer` | user | Проверка ответа (+ пояснение неверного варианта) |
| POST | `/api/quiz/complete` | user | Завершение теста (score верифицируется сервером) |
| POST | `/api/prepost/complete` · GET `/api/prepost/config` | user/— | Pre/Post замер (7 фиксированных id) |
| POST | `/api/action-plans` | user | Сохранить план действия |
| GET | `/api/cases` · GET `/api/cases/:id` | — | Кейсы и шаги |
| POST | `/api/cases/:id/check-step` · `/progress` | user | Проверка шага (ветвление) и прогресс |
| POST | `/api/certificates/generate` | user | Сертификат (90%+) |
| GET | `/api/certificates/search` · `/:id/verify` · `/:id/download` | — | Проверка и печать сертификата |
| POST | `/api/auth/register` · `/verify` · `/admin` | — | Регистрация, подтверждение, admin-токен |
| GET | `/api/spaced-repetition/due` · `/stats` · POST `/review` | user | Интервальное повторение (SM-2) |
| POST | `/api/quiz/adaptive/start` · `/next` | user | Адаптивный тест |
| GET | `/api/analytics` · `/analytics/weak-questions` · `/analytics/categories` | admin | Аналитика и тепловые карты |
| GET | `/api/dashboard/manager` | admin | Дашборд руководителя |
| GET | `/api/seminar/digest` | admin | Дайджест дня |
| POST | `/api/batch-register` · GET `/api/batch-import` | admin | Пакетная регистрация |
| GET | `/api/export/csv` · `/export/all` · `/qa/export.csv` | admin | Экспорты |
| CRUD | `/api/default-questions` | admin | Банк вопросов (+ `hint`, `wrong_explanations`) |

WebSocket-сообщения (Kahoot/Pulse/Q&A) — на том же порту через `ws`. Полный список маршрутов — в `server/routes/` и `server/ws/`.

## Настройки (`.env` на VPS)

| Параметр | Значение | Описание |
|----------|----------|----------|
| `PORT` | `3002` | Nginx проксирует на 80 |
| `NODE_ENV` | `production` | |
| `ADMIN_PASSWORD` | (секрет) | Пароль админки |
| `USER_TOKEN_SECRET` | случайная строка | Стабильность пользовательских сессий |
| `ADMIN_TOKEN_SECRET` | случайная строка | Стабильность admin-сессий |
| `RATE_LIMIT` | `120` | POST-запросов в минуту с IP |
| `ENABLE_HSTS` | `false` | `1` только при HTTPS |
| `DEMO_MASTER_CODE` | (секрет, ≥16 симв.) | Мастер-код регистрации на семинаре |
| `ALLOW_DEMO_MASTER_IN_PRODUCTION` | `true` | Разрешить мастер-код в production |
| `SERVER_ROLE` / `ALLOWED_ORIGIN` | — | Роль сервера и разрешённый origin |

> На HTTP-сервере HTTPS/HSTS должны быть выключены (`ENABLE_HSTS=false`), иначе браузер попытается открыть `https://` без сертификата.

## Категории вопросов

| Категория | Описание |
|-----------|----------|
| `ethics` | Профессиональная этика |
| `rights` | Права получателей |
| `care_standards` | Стандарты ухода |
| `safety` | Безопасность |
| `emergency` | Экстренные ситуации |
| `forms_of_service` | Формы обслуживания |
| `service_types` | Виды услуг |
| `communication` | Коммуникация |
| `documentation` | Документооборот |
| `quality` | Оценка качества |
| `accessibility` | Доступная среда |
| `mobility` | Мобильность |
| `mission` | Миссия соцобслуживания |
| `spb_specific` | Особенности СПб |

## Инструкции

| Документ | Аудитория |
|----------|-----------|
| `USER_GUIDE.md` → http://147.45.174.206/guide/user | Участники семинара |
| `SPEAKER_GUIDE.md` → http://147.45.174.206/guide/speaker | Организаторы (вход по паролю админки) |
| `CONTINUE.md` | Точка входа для разработки |
| `README.md` | Обзор проекта (этот файл) |

Страницы `/guide/*` рендерятся сервером из `.md`-файлов собственным парсером Markdown (`server/routes/pages.js`), поддерживающим контейнеры `:::hero`/`:::links`, callout-блоки `> [!TYPE]`, таблицы, списки и код.

## Тестирование

```bash
# API end-to-end (нужен DEMO_MASTER_CODE из .env)
BASE_URL=http://147.45.174.206 ADMIN_PASSWORD=your-admin-password DEMO_MASTER_CODE=... node tests/api-e2e.test.cjs

# WebSocket-режимы
node tests/kahoot-scoring-ws.test.cjs
node tests/pulse-ws.test.cjs
node tests/qa-ws.test.cjs

# Frontend V2 (unit): роутер, storage, сборка, features
npm run test:v2      # node --test tests/v2/*.test.mjs

# Браузерный smoke-тест (Playwright)
cd tests && npm install && npx playwright install chromium
BASE_URL=http://147.45.174.206 node smoke-browser.mjs

# Нагрузочный тест (30 пользователей, 30 секунд)
node tests/load-test.cjs 30 30
```

Ориентировочные объёмы проверок: **api-e2e ≈77**, **pulse ≈18**, **qa ≈12**, **kahoot ≈6**, плюс набор тестов **V2** (`tests/v2/`).

## Структура проекта

```
glm-quiz-local/
├── server/
│   ├── server.js            # bootstrap: config + app + db + routes + ws
│   ├── config.js  app.js  auth.js
│   ├── db/index.js          # SQLite: схема, миграции, сиды
│   ├── routes/              # REST по доменам
│   │   ├── index.js questions.js core.js cases.js quiz.js learning.js
│   │   ├── auth.js question-admin.js seminar-admin.js admin.js pages.js
│   └── ws/                  # WebSocket по режимам
│       ├── index.js shared.js kahoot.js pulse.js qa.js
├── frontend-v2/             # Исходники V2 (Vite)
│   ├── index.html  package.json
│   └── src/{core,features,ui,styles}
├── public/                  # Legacy frontend + PWA + собранный public/v2
│   ├── index.html  admin.html  cases.html  register.html
│   ├── realtime-*.html  pulse-*.html  qa-*.html
│   ├── seminar-digest.html  stage-heatmap.html  status.html  qr.html
│   ├── my-certificates.html  verify-certificate.html  offline.html
│   ├── css/  js/  sw.js  manifest.json  v2/
├── tests/                   # api-e2e, ws-тесты, load, smoke, v2/
├── scripts/backup-db.sh     # Бэкап SQLite (cron на VPS)
├── questions.json  roles.json  version.json
├── deploy.sh  deploy-old.sh  vite.config.js
└── *.md                     # Документация
```

## Схема версий

Версия хранится в `version.json` в формате `ГОД.МЕСЯЦ.ДЕНЬ.РЕВИЗИЯ` (например, `2026.07.17.6`) и отдаётся через `/api/version` и `/api/status`. Там же — `last_updated`, `total_questions`, список категорий и журнал изменений (`changes.current` + `changes.history`). При релизе увеличивайте последнюю ревизию и добавляйте запись в историю.

## Лицензия

Внутренний проект для семинара. Не для распространения.
