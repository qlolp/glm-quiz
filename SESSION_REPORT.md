# GLM Quiz — Аудит сервиса

**Дата:** 7 июля 2026  
**Версия на VPS (до синхронизации):** `2026.07.07.2`  
**Версия после аудита:** `2026.07.07.3`  
**Статус сервиса:** healthy (281 пользователь, 84 вопроса, 43 результата, 24 сертификата)

---

## 1. Сводка

На сервере выполнено серьёзное усиление безопасности (версии `2026.07.07.1`–`.2`). Локальная копия отставала на ~1 день. После синхронизации и аудита выявлены **3 регрессии**, которые исправлены в `2026.07.07.3`.

| Область | Оценка | Комментарий |
|---------|--------|-------------|
| Доступность API | ✅ | `/api/health`, `/api/status` — OK |
| Безопасность auth | ✅ | Bearer-токены, timing-safe HMAC, без query-string auth |
| Античит викторины | ✅ | Сервер пересчитывает score по `default_questions` |
| Frontend ↔ Backend | ⚠️→✅ | Адаптивный режим и spaced-repetition не слали токен — исправлено |
| CSP / кнопки | ⚠️→✅ | `scriptSrcAttr: 'none'` ломал все `onclick` — восстановлено |
| E2E тесты | ⚠️→✅ | Обновлены под новый API-контракт |
| Документация | ⚠️→✅ | Обновлена в этом аудите |

---

## 2. Что улучшено на сервере (2026.07.07.1–.2)

### Безопасность
- **Timing-safe HMAC** для user/admin токенов (`crypto.timingSafeEqual`)
- **Токены только в заголовке** `Authorization: Bearer` — query-string auth убран
- **Коды верификации не отдаются** в ответе `/api/auth/register`
- **Production secrets** — обязательны `USER_TOKEN_SECRET` / `ADMIN_TOKEN_SECRET` на VPS
- **`trust proxy`** для корректного IP за nginx

### Защита endpoints
- **`requireAdmin`:** analytics, stats/dashboard, stats/participants, batch-import, results, manager dashboard
- **`requireUser`:** quiz/complete, certificates/generate, cases/progress, learning/complete, questions/submit|rate|report, spaced-repetition/*, quiz/adaptive/*, competency/update

### Целостность данных
- **Серверная проверка ответов** в `/api/quiz/complete` — score сверяется с БД
- **Upserts** для `question_stats`, `competency_matrix`, `batch-register` по email
- **Дедупликация case_steps** (из предыдущих версий)

### WebSocket (Kahoot)
- `maxPayload: 65536`, проверка origin в production
- Санитизация `player_name`, XSS-escape
- `correct_answer` не утекает в `answer_result` (только в `answer_reveal`)

### Frontend (index.html)
- `escapeHtml()` для динамического контента
- Адаптивный режим: `categories[]` вместо несуществующей `category='general'`
- `ensureUserExists()` до загрузки вопросов
- Quiz complete отправляет `{ questionId, answer }` вместо `{ correct: boolean }`

---

## 3. Найденные проблемы и исправления (2026.07.07.3)

### P0 — Кнопки не нажимаются
**Причина:** `scriptSrcAttr: ["'none'"]` в helmet CSP блокирует все inline `onclick`.  
**Затронуто:** 17 HTML-страниц, ~90 обработчиков.  
**Исправление:** `scriptSrcAttr: ["'unsafe-inline'"]`.  
**Альтернатива на будущее:** миграция на `addEventListener` и nonce-based CSP.

### P0 — Адаптивный режим 401
**Причина:** `/api/quiz/adaptive/start|next` защищены `requireUser`, но `index.html` вызывал `fetch` без Bearer.  
**Исправление:** заменено на `authFetch`, `user_id` убран из body (берётся из токена).

### P1 — Spaced repetition 401
**Причина:** `GET /api/spaced-repetition/stats|due` требуют токен, страница слала `?user_id=`.  
**Исправление:** `authFetch` без `user_id` в query.

### P1 — E2E тесты устарели
**Причина:** тесты слали `{ correct: boolean }`, сервер ждёт `{ answer: number }`; не передавали токены на защищённые endpoints.  
**Исправление:** `buildVerifiedAnswers()` из реальных вопросов; токены на progress/submit/dashboard.

---

## 4. Оставшиеся риски (backlog)

| Приоритет | Риск | Рекомендация |
|-----------|------|--------------|
| P1 | `GET /api/questions` отдаёт `correct_answer` | Отдельный endpoint для викторины без ответов |
| P1 | Адаптивный античит: `is_correct` доверяется клиенту | Серверная сессия adaptive с хранением вопросов |
| P2 | `POST /api/feedback` без auth | Добавить `requireUser` или rate limit |
| P2 | `GET /api/certificates/:id/download` публичный | Токен или verification_code в URL |
| P2 | Только HTTP | HTTPS + домен до семинара |
| P3 | Нет автобэкапа `quiz.db` | cron на VPS |
| P3 | Inline onclick + unsafe-inline CSP | Постепенная миграция на event listeners |

---

## 5. Метрики (7 июля 2026)

```
GET /api/status:
  users: 281
  questions: 84
  cases: 3
  results: 43
  certificates: 24
  memory: ~68 MB RSS
  uptime: ~3 ч (на момент аудита)
```

**API E2E (после исправлений):** 27/27 ожидается после деплоя `.3`

---

## 6. Защищённые endpoints (справочник)

### requireUser
`POST /api/results`, `/api/quiz/complete`, `/api/analytics/question/:id`, `/api/cases/:id/progress`, `/api/learning/complete`, `/api/questions/submit`, `/api/questions/:id/rate`, `/api/questions/:id/report`, `/api/spaced-repetition/*`, `/api/quiz/adaptive/*`, `/api/competency/update`, `/api/certificates/generate`

### requireAdmin
`POST/PUT/DELETE /api/questions*`, `/api/default-questions*`, `GET /api/export*`, `POST /api/batch-register`, `GET /api/batch-import`, `GET /api/results`, `GET /api/analytics`, `GET /api/stats/*`, `GET /api/dashboard/manager`

### Публичные (намеренно)
`GET /api/questions`, `/api/cases`, `/api/leaderboard`, `/api/achievements`, `POST /api/users`, `/api/auth/*`, `GET /api/health`, `/api/status`, `/api/version`, `POST /api/feedback`, `GET /api/certificates/:id/verify|download`

---

## 7. Рекомендации до семинара (25–27 августа)

1. **Задеплоить `2026.07.07.3`** и прогнать smoke-тесты
2. **HTTPS + домен** — Let's Encrypt, `USE_HTTPS=true`
3. **Автобэкап БД** — `0 3 * * *` tar `/root/glm-quiz/server/quiz.db`
4. **Репетиция Kahoot** — 10+ устройств на Wi‑Fi площадки
5. **QR-код** на слайд с http://147.45.174.206
6. **Проверить гостевой flow** end-to-end: имя → викторина → сертификат (после регистрации)

---

## 8. Команды проверки

```bash
# Статус
curl -s http://147.45.174.206/api/status | python3 -m json.tool

# API тесты
BASE_URL=http://147.45.174.206 ADMIN_PASSWORD=your-admin-password node tests/api-e2e.test.cjs

# Browser smoke
cd tests && BASE_URL=http://147.45.174.206 node smoke-browser.mjs

# Деплой
./deploy.sh
```

---

## 9. Дополнение (версии `.7.4`–`.7.6`, 7 июля 2026)

После аудита `.7.3` выполнены доработки до семинара:

| Версия | Изменения |
|--------|-----------|
| `.7.4` | Адаптивный режим: authFetch, фикс ложной ошибки «не удалось загрузить вопросы» |
| `.7.5` | Скрытие correct из API, `POST /api/quiz/check-answer`, adaptive sessions в БД, rate limit feedback, автобэкап cron, QR-страница |
| `.7.6` | QR: локальная генерация на canvas (CSP блокировал внешний api.qrserver.com) |

**Текущее состояние:** `2026.07.07.6`, API e2e 32/32, готово к живому тесту.

**Выполнено из рекомендаций §7:**
- ✅ Автобэкап БД (`scripts/backup-db.sh`, cron 03:00)
- ✅ QR-слайд `/qr.html`
- ⏸️ HTTPS + домен — отложено
- 🔄 Репетиция Kahoot на Wi‑Fi — впереди
- 🔄 Живой тест всех кнопок — в процессе

**Документация обновлена:** `USER_GUIDE.md`, `SPEAKER_GUIDE.md`, `README.md`, `ROADMAP.md`, `SEMINAR.md`, `CHECKPOINT.md`, `CONTINUE.md`.

---

## 10. Аудит после доработок на VPS (9 июля 2026)

**Версия на VPS:** `2026.07.08.3` → после синхронизации `2026.07.09.1`  
**API e2e:** 40/40 ✅ (с `DEMO_MASTER_CODE` из `.env`)  
**Статус сервера:** healthy, 84 вопроса, без `recent_errors`

### Что сделано на VPS (7–8 июля, версии `.7.7`–`.08.3`)

| # | Изменение | Оценка |
|---|-----------|--------|
| 1 | `check-answer` требует `requireUser` — нельзя скрапить ответы анонимно | ✅ Критично |
| 2 | Adaptive: authFetch, session_id, отказ от client-trusted `is_correct` | ✅ |
| 3 | `quiz/complete`: replay protection (5 мин / per-session) | ✅ |
| 4 | Cases: без утечки `correct_answer` в публичном API | ✅ |
| 5 | Competency: серверная верификация, игнор out-of-range | ✅ |
| 6 | Feedback: requireUser, `req.userId` | ✅ |
| 7 | Kahoot WS: correct_answer только хосту | ✅ |
| 8 | Admin password: timingSafeEqual | ✅ |
| 9 | Verification: 6 цифр; мастер-код gated (≥16 chars + env flag) | ✅ |
| 10 | trust proxy: loopback only | ✅ |
| 11 | CSV export: anti formula-injection | ✅ |
| 12 | HSTS: `ENABLE_HSTS=1` opt-in | ✅ |
| 13 | Graceful shutdown: WS → DB → HTTP (фикс SEGV) | ✅ |
| 14 | deploy.sh: DEMO_MASTER_CODE для smoke-тестов | ✅ |

### Найденные проблемы при аудите

| Проблема | Серьёзность | Статус |
|----------|-------------|--------|
| `register.html` / docs ссылались на код `1234`, сервер уже на 6-digit + master | 🔴 UX | ✅ Исправлено в `.09.1` |
| `sw.js` CACHE_VERSION отставал (`2026.07.07.6`) | 🟡 PWA | ✅ → `2026.07.09.1` |
| Локальная копия отставала от VPS на ~4KB server.js | 🟡 Sync | ✅ Синхронизировано |
| Мастер-код на VPS — 64-символьный hex, неудобен для участников | 🟡 UX | ⚠️ Рекомендация: сменить на читаемый ≥16 символов |

### Рекомендации организатору

1. Задать `DEMO_MASTER_CODE` в `.env` — короткая фраза для диктовки (≥16 символов)
2. Объявить код на семинаре; не публиковать в открытых материалах
3. Прогнать живой тест по `SPEAKER_GUIDE.md`
4. После деплоя участникам — «Обновить» при баннере PWA

### Команды проверки

```bash
curl -s http://147.45.174.206/api/status | python3 -m json.tool
./deploy.sh   # 40 API checks
```
