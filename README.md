# Дальшарик

Telegram-бот для групповой викторины «Что было дальше?».

## Как запустить

```bash
npm install
copy .env.example .env   # заполнить BOT_TOKEN
npm run dev
```

## Команды

```bash
npm run dev                 # разработка (watch)
npm run build               # сборка в dist/
npm run start               # запуск собранного бота
npm run typecheck           # проверка типов
npm run test                # тесты
npm run seed                # загрузка seed-вопросов
npm run validate-questions  # валидация вопросов
```

## Документация

- `OPENCODE.md` — полная спецификация проекта
- `DEVELOPMENT_PLAN.md` — поэтапный план разработки
- `ROADMAP.md` — статусы по DoD (§42)

## Архитектура

```text
Telegram
   ↓
Telegraf
   ↓
Game Engine
   ├── Question Engine
   ├── Scoring
   ├── Statistics
   ├── Scheduler
   └── Content
         ↓
      JSON Storage
```

Стек: Node.js, TypeScript, Telegraf, Winston, JSON storage. Без Express/SQLite/Redis/Docker.
