# CONTINUE — точка входа для разработки

**Обновлено:** 30 июля 2026 · **Версия:** `2026.07.17.6`

## Сервер этой ветки

Единственная production-цель: **`http://147.45.174.206`**, SSH-порт `443`, деплой **только** через `./deploy-old.sh` (он заблокирован на этот адрес и вызывает `deploy.sh`).

В `.env` на этом сервере: `SERVER_ROLE=alternative`, `ALLOWED_ORIGIN=http://147.45.174.206`, `DEMO_MASTER_CODE` (≥16 символов), `ADMIN_PASSWORD`, секреты токенов.

> Только HTTP: `ENABLE_HSTS=false`, работаем по `http://`, не по `https://`.

## Архитектура (модульный backend)

`server/server.js` — тонкий bootstrap, собирающий всё вместе:

- `server/config.js` — окружение, версия, секреты, флаги (`isProductionVPS`, `SERVER_ROLE` и т.д.).
- `server/app.js` — Express-приложение, middleware, безопасность (helmet/CSP, CORS, rate-limit).
- `server/auth.js` — токены пользователя/админа, коды подтверждения, cookie раздела спикера.
- `server/db/index.js` — SQLite: схема, миграции, сиды (84 вопроса, 6 кейсов, 6 достижений), `PREPOST_QUESTION_IDS = [1,5,12,15,24,36,48]`.
- `server/routes/` — REST по доменам: `questions`, `core`, `cases`, `question-admin`, `auth`, `seminar-admin`, `quiz`, `learning`, `admin`, `pages` (регистрируются в `routes/index.js`).
- `server/ws/` — WebSocket по режимам: `shared` (lifecycle/heartbeat/сессии), `kahoot`, `pulse`, `qa` (подключаются в `ws/index.js`).

`server/routes/pages.js` рендерит `/guide/user` и `/guide/speaker` из `USER_GUIDE.md`/`SPEAKER_GUIDE.md` собственным Markdown-парсером (контейнеры `:::hero`/`:::links`, callout `> [!TYPE]`, таблицы, списки, код). Раздел спикера — за cookie-сессией после проверки пароля админа. Отдаёт `/v2/*` и SPA-fallback на `public/index.html`.

## Frontend V2

Исходники в `frontend-v2/` (Vite, vanilla-модули), сборка → `public/v2`, отдаётся сервером на `/v2`.

- `src/core/` — `router` (base `/v2`), `api`, `state`, `storage`, `labels`.
- `src/features/` — `home`, `quiz`, `result`, `learn`, `cases`, `profile`, `host`.
- Роуты: `/v2` (главная: «проверить себя» 7 / «потренироваться» 10 / «войти в семинар»), `/v2/learn`, `/v2/cases`, `/v2/me`, `/v2/host` (кабинет спикера со ссылками на хост-инструменты).

Legacy-интерфейс на `/` остаётся основным; `/v2` — превью, использует те же API.

```bash
npm run build      # vite build → public/v2
npm run dev:v2     # http://localhost:5173/v2/ (сервер должен быть запущен на :3000)
npm run test:v2    # node --test tests/v2/*.test.mjs
```

## Ключевая функциональность

- **Режимы**: training, quick (15), micro (7 по категории), exam (сертификат 90%+), adaptive, prepost (Pre/Post с Δ).
- **Confidence** перед проверкой, **подсказки** (`hint`) в training/micro, **план действия**, разбор/повтор ошибок, инсайт «уверен, но ошибся».
- Пояснения неверных вариантов (`wrong_explanations`) + `hint` на всех 84 вопросах.
- **6 кейсов**, `case_004`–`006` — с ветвлением (`branches` в `case_steps`, проверка `/api/cases/:id/check-step`).
- **Kahoot**: режимы `classic`/`accuracy`, команды (`team_name`), сложные вопросы сессии на хосте.
- **Пульс**: MC или шкала/Likert с гистограммой и средним (`/pulse-host.html`, `/pulse-player.html`).
- **Live Q&A**: премодерация, один upvote на вопрос, подсветка, CSV-экспорт (`/qa-host.html`, `/qa-player.html`).
- **Дайджест дня** (`/seminar-digest.html`, admin), **heatmap сцены** (`/stage-heatmap.html`), «плохие вопросы» в админке.

## Проверка перед деплоем

```bash
# локально: собрать V2 и прогнать unit-тесты V2
npm run build && npm run test:v2

# WebSocket-режимы
node tests/kahoot-scoring-ws.test.cjs
node tests/pulse-ws.test.cjs
node tests/qa-ws.test.cjs

# деплой (только 147.45.174.206) и smoke
./deploy-old.sh
curl http://147.45.174.206/api/status      # "status":"healthy", "questions":84
BASE_URL=http://147.45.174.206 ADMIN_PASSWORD=... DEMO_MASTER_CODE=... node tests/api-e2e.test.cjs
```

## Версионирование

`version.json` — формат `ГОД.МЕСЯЦ.ДЕНЬ.РЕВИЗИЯ`, отдаётся через `/api/version` и `/api/status`. При релизе поднимите ревизию и добавьте запись в `changes.history`.

## Документация

`README.md` · `USER_GUIDE.md` · `SPEAKER_GUIDE.md` · `ROADMAP.md` · `SEMINAR.md` · `SESSION_REPORT.md`
