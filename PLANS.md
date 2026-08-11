# Планы

Технический долг и план исправлений по итогам аудита кода (09.08.2026).

Статусы: `[ ]` не начато · `[~]` в работе · `[x]` готово

## Надёжность и потеря данных

- [x] **Падение на старте без `data/`** — `src/game/question-reloader.ts:66` вызывает `fs.watch(dataDir)`, каталог нигде не создаётся. На свежем клоне бот не запустится.
  - Фикс: `fs.mkdir(env.dataDir, { recursive: true })` в `main()` до `reloader.start()`; `watch()` в try/catch с фолбэком на polling.
- [x] **Опрос отправлен в Telegram до сохранения** — `src/game/publisher.ts:74-94`: `sendQuiz` → потом `polls.insert`. Падение в окне = опрос-«сирота»: ответы игнорируются, опрос не закроется, вопрос может опубликоваться повторно.
  - Фикс: вставлять poll со статусом `'sending'` до отправки, после `sendQuiz` — `update` в `'active'`; свип зависших `'sending'`/`'finalizing'` при старте (`scheduler.recover`).
- [x] **Гонка начисления очков/серий** — `src/game/answer-processor.ts:79-84`: `getOrCreateUser` и `users.update` — две независимые блокировки; параллельные ответы одного игрока теряют начисления, новому игроку может упасть insert.
  - Фикс: «get-or-create + `calculatePoints` + `applyAnswerToUser`» в одном `store.users.mutate()`.
- [x] **Финализатор ставит `completed` до side-эффектов** — `src/game/finalizer.ts:43`. После падения ретрай невозможен.
  - Фикс: промежуточный статус `'finalizing'` → `closePoll` + итоги → `'completed'`; свип ретраит зависшие `'finalizing'`.
- [x] **Две цепочки записи questions.json без общего лока** — `applyPool` пишет через свой `writeJson` в обход `JsonStorage.lock`; параллельные `approve`/`import` могут перетереть друг друга.
  - Фикс: сначала backup, затем `store.questions.mutate()` под общей блокировкой.
- [x] **Исчерпание пула без ротации** — `usedIds` = вся `questionHistory`, история растёт вечно; пустые ретраи scheduler каждые 5 мин.
  - Фикс: окно последних N публикаций (ROTATION_WINDOW=20); при исчерпании — `selectNext` с `exclude: []`; id истории — с временем публикации.

## Обработка ошибок

- [x] **Unhandled rejection** — `bot.launch().then(...)` без `.catch()` (`src/index.ts:108`), нет глобальных `unhandledRejection`/`uncaughtException`, fire-and-forget `void this.reloadPool()`/`tick()`.
  - Фикс: `try/await bot.launch()` с выходом, глобальные хендлеры, `.catch` на fire-and-forget.
- [x] **Глухие catch** (`permissions.ts:17`, `import-commands.ts:46`, `lock.ts:36`) — логировать warn/debug.
- [x] **`FileLock.acquire` при сбое оставляет блокировку навсегда** — обернуть acquire в try/catch.
- [x] **Конфиг-модуль читает env при импорте** (`logging/logger.ts:4`) — ленивая инициализация (env передаётся параметром в `initLogger`).

## Производительность

- [ ] Каждый ответ = ~8 полных чтений/перезаписей JSON под локом (индексы в памяти / SQLite).
  - **Решение (10.08.2026):** остаёмся на JSON. Масштаб бота (сотни записей/день) не требует БД; SQLite и lowdb отклонены. При росте до ~50–100 тыс. записей/файл — пересмотреть: кэш чтения/ротация файлов без БД либо SQLite за абстракцией `Storage` (`src/storage/storage.ts`).
- [x] `/stats` читает questions.json N раз (`leaderboard.ts:81-85`) — один `getAll()` + Map.
- [ ] Тик планировщика = O(чатов × полных чтений) каждые 30 c — состояние в памяти.
- [ ] Неограниченный рост `metrics.json`: массивы `chat.players`/`user.question_ids` → счётчики.
  - **Решение (10.08.2026):** без SQLite; при необходимости — ротация/архивирование файла или SQLite за интерфейсом `Storage`.
- [x] Бэкап вопросов перезаписывается каждые 60 c без изменений — только при изменении.

## Безопасность и типы

- [x] **HTML-инъекция в `/config`** (`bot.ts:123`, `messages.ts:38`) — экранировать или слать без parse_mode.
- [ ] Сырой markdown без parse_mode в сообщениях — включить MarkdownV2 с экранированием или убрать разметку.
- [x] `asStored` в `metrics-store.ts` без runtime-валидации — нормализация/валидация при чтении.
- [x] Лишние поля patch тихо персистятся в `json-storage.ts:87` — валидация ключей (миграция схемы — через `mutate` в `getOrCreateChat`).
- [x] Рассинхрон: `/config` в `/help` указан «для всех», а реально суперадминский — поправить help.

## Зависимости и сборка

- [x] **vitest 2.x → 4.x** — чинит critical/high уязвимости (vite/esbuild/vite-node), dev-only. `npm audit`: 0 уязвимостей. Добавлен `vitest.config.mts` (include только `tests/**/*.test.ts`, чтобы vitest 4 не подхватывал скомпилированные тесты из `dist/`).
- [x] **`@telegraf/types@^7.1.0` явно в dependencies** (сейчас транзитивно через telegraf).
- [ ] `lint` = дубль `typecheck` — реальный линтер (eslint) или убрать.
- [x] `rootDir: "."` собирает в dist также `tests/` и `scripts/` — поправить (уже `rootDir: "src"`).
- [x] Удалить легаси `data/stats.json` (уже отсутствует).

## Тесты (добавить)

- [x] Гонка: параллельные `processPollAnswer` одного пользователя.
- [x] Сбой send-before-persist (после `sendQuiz` до `polls.insert`).
- [x] `reloader.start()` при отсутствующем dataDir.
- [x] `src/bot/bot.ts` (start/stop/help/config/poll_answer/бота.catch).
- [x] `config-commands.ts`, `moderation-commands.ts`, `stats-commands.ts`.
- [x] `logging/` (rate-limit, обрезка 4000).
- [x] `index.ts` (отсутствие env, ошибка launch, graceful shutdown).
- [x] Гигиена: `t.cleanup()` в `afterEach` в `scheduler.test.ts`.

## Фича: «Шоу» — обычные опросы + AI-ведущий со стримингом

Идея: вместо викторин — обычные опросы; правильный ответ и объяснение раскрываются
на финализации, когда AI-«ведущий» вживую стримит разбор результатов.
Ветка: `feature/show-mode`.

Решения (11.08.2026):
- Обычный опрос вместо викторины; `is_anonymous: false`; голоса можно менять/отзывать,
  «последний голос побеждает».
- Скоринг на финализации, идемпотентный: источник истины — `answers`, пользователи
  пересчитываются из всех их ответов.
- Стриминг — `sendMessage` + прогрессивный `editMessageText` (`sendMessageDraft` в группах
  невозможен: по Bot API работает только в private-чатах, `TEXTDRAFT_PEER_INVALID`).
- Финализация по умолчанию `'ai'`; без ключа/модели/при ошибке — тихий фолбэк на статику.
- После шоу — компактная стат-карточка (варианты, источники, превью следующего события).
- `totalPlayers === 0` → без AI и карточки: компактное статичное раскрытие ответа
  («Никто не ответил. Правильный ответ: …» + объяснение + источники + превью). Порог жёсткий = 1.
- Промпт ведущего: единый дефолтный образ в коде; суперадмин правит через
  `/set_host_prompt` / `/reset_host_prompt` (`AiSettingsRecord.hostPrompt`).
- `ChatConfig.subscription: boolean` (default `false`) — флаг-заглушка подписочного режима,
  пока ничего не гейтит.

### 1. Обычный опрос вместо викторины
- `src/telegram/quiz-sender.ts` → `sendPoll` без `correct_option_id`/`explanation`; `is_anonymous: false`.
- `src/game/publisher.ts` `buildQuizPayload` → `buildPollPayload` (текст/варианты/optionMap; без правильного).
- `Question`/`PollRecord` не меняются; флаг типа опроса не нужен.

### 2. Регистрация голосов (answer-processor)
- `processPollAnswer` перестаёт начислять очки/серии/метрики:
  - пустые `option_ids` → отзыв голоса (удалить `AnswerRecord` `id = ${telegramPollId}:${userId}`);
  - иначе UPSERT последнего голоса (вариант + время побеждают);
  - обновлять только отображаемые данные пользователя (имена).
- `AnswerRecord`: `isCorrect?`, `points?`, `scoredAt?`.

### 3. Скоринг на финализации
- Новая функция `scorePollAnswers(...)`: `isCorrect = selectedOption === question.correctAnswer`,
  очки по `calculatePoints` с учётом серии.
- `finalizer.ts`:
  1. `answers.mutate` — проставить `isCorrect`/`points`/`scoredAt`;
  2. `users.mutate` — пересчёт затронутых пользователей из всех их answers (идемпотентно);
  3. `metrics.recordAnswer` (с финальным `isCorrect`) переносится сюда.
- 0 участников → компактное раскрытие; 1+ → шоу/карточка.

### 4. Стриминг текста (`src/telegram/stream.ts`)
- Интерфейс `TextStreamer`: `stream(chatId, chunks: AsyncIterable<string>)`.
- `EditTextStreamer` (основной, группы): `sendMessage` первой порцией → повторные
  `editMessageText` с суффиксом «…», пауза ≥1 c, финальный flush; при ошибке edit — деградация
  до обычного `sendMessage`.
- `DraftTextStreamer` — опционально за флагом `STREAM_BACKEND`; DM-only, вне группового флоу.
- telegraf 4.16.3 типизирует `editMessageText`; `callApi` нужен только для draft.

### 5. AI-ведущий
- `OpenRouterClient.streamGenerate(prompt): AsyncIterable<string>` — SSE (`stream: true`),
  без `json_object`/web_search, `temperature ~0.9`, `max_tokens ~800`.
- `src/game/show/host.ts`:
  - `buildHostPrompt(ctx)` — вопрос + контекст + правильный ответ + объяснение + источники,
    распределение голосов, топ, серии, название чата, превью следующего события;
    живой ведущий, русский, без markdown, ≤ ~250 слов.
  - `AiHost` — резолв ключа/модели (`aiSettings ?? env`) и `hostPrompt ?? default`;
    стрим в `TextStreamer`; любая ошибка/таймаут/нет ключа → статичная карточка.

### 6. Конфиг и команды
- `ChatConfig.finalization: 'ai' | 'static'` (default `'ai'`), `ChatConfig.subscription: boolean`
  (default `false`); `isValidChatConfig` + нормализация.
- `AiSettingsRecord.hostPrompt?: string` + миграция ключа в старых записях settings
  (`update()` фильтрует ключи по существующим).
- Команды: `/set_finalization ai|static` (админ), `/set_host_prompt` / `/reset_host_prompt`
  (суперадмин, ЛС), help.

### 7. Порядок работ
1. `refactor:` sender/publisher → обычный poll + тесты.
2. `refactor:` answer-processor → фиксация голосов (upsert/отзыв) + тесты.
3. `feat:` скоринг на финализации (идемпотентно) + тесты.
4. `feat:` stream.ts (edit-стриминг) + тесты.
5. `feat:` AI-ведущий (SSE + фолбэк) + тесты.
6. `feat:` `/set_finalization`, `/set_host_prompt`, `/reset_host_prompt`, help + тесты.
7. `feat:` интеграция + game-flow тесты; CHANGELOG + релиз minor.

## Стратегия коммитов

- `fix:` — надёжность (п. 1–6, обработка ошибок).
- `perf:` — производительность.
- `chore:` — зависимости, сборка, типы.
- `test:` — новые тесты.
- Перед коммитом: `npm run build` и `npm test` должны проходить (AGENTS.md).
