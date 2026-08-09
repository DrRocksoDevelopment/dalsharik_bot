export type HelpRole = 'user' | 'admin' | 'super';

export const MESSAGES = {
  start: (botName: string) =>
    `🎯 Привет! Я *${botName}* — бот групповой викторины «Что было дальше?».\n\n` +
    `📜 Я публикую реальное событие, а вы угадываете, что произошло *дальше*.\n\n` +
    `✨ Чем я отличаюсь от обычных ботов-викторин:\n` +
    `• Не проверка фактов «когда/где/кто» — а логика и интуиция: «я знаю, что случилось, но что было дальше?»\n` +
    `• Все события реальные, после раунда — объяснение и источники\n` +
    `• Уровни сложности: от 🟢 до 🔴\n` +
    `• Сложность подстраивается под время суток группы: утром проще, вечером сложнее\n\n` +
    `🤖 Автоматика:\n` +
    `• Вопросы приходят сами по заданному интервалу\n` +
    `• Окно ответов настраивается (по умолчанию 1 час)\n` +
    `• После закрытия опроса — результаты: очки, скорость реакции, серии\n\n` +
    `Справка по командам — /help`,
  help: (botName: string, role: HelpRole = 'user') => {
    const sections: string[] = [
      '👤 Для всех:\n' +
        '/help — эта справка\n' +
        '/top — рейтинг группы\n' +
        '/top_global — общий рейтинг\n' +
        '/stats — твоя статистика',
    ];
    if (role === 'admin' || role === 'super') {
      sections.push(
        '🛠 Админы группы:\n' +
          '/start — включить игру в группе\n' +
          '/stop — остановить игру в группе\n' +
          '/set_answer_window <сек> — окно ответов (мин 60)\n' +
          '/set_interval <сек> — интервал между вопросами (мин 60)\n' +
          '/set_types <тип1,тип2> — типы вопросов\n' +
          '/set_difficulty <мин> <макс> — диапазон сложности 1–5\n' +
          '/set_timezone ±Ч[:ММ] — часовой пояс группы (по умолчанию Москва +3)',
      );
    }
    if (role === 'super') {
      sections.push(
        '📦 Суперадмин: /import (импорт из папки data/imports), отправка JSON-файла в ЛС — импорт в пул, /pending — модерация, /config — конфигурация чата, /metrics — метрики бота, /generate — генерация вопросов ИИ (OpenRouter), /set_ai_key, /set_ai_model, /ai_status — настройка ИИ',
      );
    }
    return `📖 Команды *${botName}*:\n\n${sections.join('\n\n')}`;
  },
  stop: '⏹ Игра в этой группе остановлена.',
  alreadyStarted: (time?: string, until?: string) =>
    time && until
      ? `ℹ️ Всё по плану, работаем! ⏭ Следующий вопрос — в ${time} (через ~${until}) по местному времени.`
      : 'ℹ️ Всё по плану, работаем! Следующий вопрос появится по расписанию.',
  enabled: '✅ Бот включён.',
  config: (cfg: Record<string, unknown>) =>
    `<pre>${escapeHtml(JSON.stringify(cfg, null, 2))}</pre>`,
  configUpdated: (field: string, value: string) =>
    `⚙️ Конфигурация обновлена: ${field} → ${value}`,
  invalidValue: (usage: string) => `❌ Неверный формат. Пример:\n${usage}`,
  onlyGroups: 'Этот бот работает в группах.',
  noConfig: 'Конфигурация для этой группы ещё не создана. Отправьте /start.',
  unknownQuestionType: (types: string) =>
    `❌ Неизвестный тип вопроса. Допустимые:\n${types}`,
  invalidDifficultyRange: '❌ Сложность должна быть от 1 до 5, мин ≤ макс.',
  invalidTimeZone:
    '❌ Неверный часовой пояс. Формат: /set_timezone ±Ч[:ММ], от −12 до +14. Примеры: +3, -5, +5:30.',
  notAdmin: '❌ Эта команда доступна только администраторам (группы или бота).',
  noPending: '📭 Ожидающих вопросов нет.',
  metricsError: '❌ Не удалось получить метрики.',
  metrics: (m: {
    questionsPublished: number;
    questionsCompleted: number;
    totalAnswers: number;
    correctAnswers: number;
    wrongAnswers: number;
    averageReactionMs: number;
    medianReactionMs: number;
    medianCorrectReactionMs: number;
    medianWrongReactionMs: number;
    fastestCorrectMs: number | null;
    slowestCorrectMs: number | null;
    averageRoundParticipants: number | null;
    users: number;
    chats: number;
    topChats: { chatId: string; answersPerDay: number }[];
  }) => {
    const accuracy = m.totalAnswers > 0 ? (m.correctAnswers / m.totalAnswers) * 100 : 0;
    const lines = [
      '📊 Метрики бота',
      '',
      '🎮 Игра:',
      `• Опубликовано вопросов: ${m.questionsPublished}`,
      `• Завершено раундов: ${m.questionsCompleted}`,
      `• Ответов: ${m.totalAnswers} (✅ ${m.correctAnswers} · ❌ ${m.wrongAnswers})`,
      `• Точность: ${accuracy.toFixed(1)}%`,
      `• Средняя скорость ответа: ${formatReactionTime(m.averageReactionMs)} · Медиана: ${formatReactionTime(m.medianReactionMs)}`,
      `• Медиана верных: ${formatReactionTime(m.medianCorrectReactionMs)} · Медиана неверных: ${formatReactionTime(m.medianWrongReactionMs)}`,
      `• Самый быстрый верный: ${m.fastestCorrectMs === null ? '—' : formatReactionTime(m.fastestCorrectMs)} · Самый поздний: ${m.slowestCorrectMs === null ? '—' : formatReactionTime(m.slowestCorrectMs)}`,
      m.averageRoundParticipants === null
        ? ''
        : `• Средняя явка за раунд: ${m.averageRoundParticipants.toFixed(1)} чел.`,
      '',
      `👥 Активных игроков: ${m.users}`,
      `💬 Чатов с игрой: ${m.chats}`,
    ];
    if (m.topChats.length > 0) {
      lines.push('');
      lines.push('🏆 Топ чатов по активности:');
      lines.push(m.topChats.map((c) => `• ${c.chatId} — ${c.answersPerDay.toFixed(1)} ответов/день`).join('\n'));
    }
    return lines.filter((l) => l !== '').join('\n');
  },
  pendingList: (questions: { id: string; event: { title: string }; category: string; difficulty: number }[]) =>
    `📋 Ожидают одобрения (${questions.length}):\n` +
    questions.map((q) => `• ${q.id} — ${q.event.title} (${q.category}, ${q.difficulty}/5)`).join('\n'),
  newQuestionForReview: (q: {
    id: string;
    type: string;
    category: string;
    difficulty: number;
    event: { title: string; context: string };
    question: string;
    answers: { id: string; text: string }[];
    correctAnswer: string;
    explanation: string;
    sources: string[];
  }) =>
    `🆕 Новый вопрос: *${q.event.title}*\n\n` +
    `${q.event.context}\n\n` +
    `❓ *${q.question}*\n\n` +
    q.answers.map((a) => `• ${a.text}${a.id === q.correctAnswer ? ' ✅' : ''}`).join('\n') +
    `\n\n${formatDifficulty(q.difficulty)} · Категория: ${q.category}\n` +
    `Тип: ${q.type}\n\n` +
    `Объяснение: ${q.explanation}\n` +
    `Источники: ${q.sources.join(', ')}`,
  approved: '✅ Вопрос одобрен и добавлен в пул.',
  rejected: '🚫 Вопрос отклонён.',
  importPrivateOnly: 'ℹ️ Импорт вопросов работает только в личных сообщениях бота.',
  importFileTooLarge: '❌ Файл слишком большой (максимум 5 МБ).',
  importInvalidJson: (reason: string) => `❌ Не удалось разобрать файл: ${reason}`,
  importError: '❌ Ошибка при импорте вопросов. Попробуйте ещё раз.',
  importFolderEmpty: (name?: string) =>
    name
      ? `❌ Файл «${name}» не найден в папке data/imports.`
      : '📂 В папке data/imports нет .json-файлов для импорта.',
  importFolderResult: (r: {
    files: {
      file: string;
      error?: string;
      movedTo?: string;
      result?: {
        imported: number;
        renamed: { oldId: string; newId: string }[];
        skipped: { id: string; reason: string }[];
        errors: { id: string; errors: string[] }[];
      };
    }[];
  }) => {
    const blocks: string[] = [];
    for (const f of r.files) {
      const lines = [`📄 ${f.file}:`];
      if (f.error) {
        lines.push(`❌ ${f.error}`);
      } else if (f.result) {
        lines.push(`✅ Импортировано: ${f.result.imported} · Пропущено: ${f.result.skipped.length}`);
        const renamed = f.result.renamed.slice(0, 10).map((x) => `• ${x.oldId} → ${x.newId}`);
        if (renamed.length > 0) lines.push(`🔁 Переименовано:\n${renamed.join('\n')}`);
        const skipped = f.result.skipped.slice(0, 10).map((s) => `• ${s.id} — ${s.reason}`);
        if (skipped.length > 0) lines.push(`Пропущенные:\n${skipped.join('\n')}`);
        const errors = f.result.errors.slice(0, 10).map((e) => `• ${e.id}: ${e.errors.join('; ')}`);
        if (errors.length > 0) lines.push(`Ошибки:\n${errors.join('\n')}`);
      }
      if (f.movedTo) lines.push(`📁 → done/${f.movedTo}`);
      blocks.push(lines.join('\n'));
    }
    return `📦 Импорт из папки data/imports (${r.files.length} файлов):\n\n${blocks.join('\n\n')}`;
  },
  importResult: (r: {
    imported: number;
    renamed: { oldId: string; newId: string }[];
    skipped: { id: string; reason: string }[];
    errors: { id: string; errors: string[] }[];
  }) => {
    const lines = [
      `📦 Импорт завершён:`,
      `✅ Импортировано: ${r.imported}`,
      `⏭ Пропущено: ${r.skipped.length}`,
    ];
    const renamed = r.renamed.slice(0, 10).map((x) => `• ${x.oldId} → ${x.newId}`);
    if (renamed.length > 0) lines.push(`🔁 Переименовано (id заняты):\n${renamed.join('\n')}`);
    const skipped = r.skipped.slice(0, 10).map((s) => `• ${s.id} — ${s.reason}`);
    if (skipped.length > 0) lines.push(`Пропущенные:\n${skipped.join('\n')}`);
    const errors = r.errors.slice(0, 10).map((e) => `• ${e.id}: ${e.errors.join('; ')}`);
    if (errors.length > 0) lines.push(`Ошибки:\n${errors.join('\n')}`);
    return lines.join('\n');
  },
  aiPrivateOnly: 'ℹ️ Настройка ИИ и генерация вопросов работают только в личных сообщениях бота.',
  aiGenerateBusy: '⏳ Генерация уже идёт — дождись завершения.',
  aiKeySet: '🔑 Ключ OpenRouter сохранён.\n\nТеперь задай модель: /set_ai_model <модель>\nНапример: /set_ai_model openrouter/auto\nПроверка настроек: /ai_status',
  aiModelSet: (model: string) => `🤖 Модель сохранена: ${model}`,
  aiKeyMissing: '🔑 Ключ OpenRouter не задан. Отправь: /set_ai_key <ключ> (только в ЛС)',
  aiModelMissing:
    '🤖 Модель не задана. Отправь: /set_ai_model <модель>\nНапример: /set_ai_model openrouter/auto или /set_ai_model google/gemini-2.0-flash-001',
  aiInvalidUsage: (usage: string) => `❌ Неверный формат. Пример:\n${usage}`,
  aiUnknownCategory: (usage: string) =>
    `❌ Неизвестная категория. Допустимые: history, science, technology, culture, geography. Пример:\n${usage}`,
  aiStatus: (s: { model: string | null; keyMasked: string | null; keyFromEnv: boolean }) => {
    const keyLine = s.keyMasked
      ? `• Ключ: ${s.keyMasked}${s.keyFromEnv ? ' (из .env)' : ''}`
      : '• Ключ: не задан';
    const modelLine = s.model ? `• Модель: ${s.model}` : '• Модель: не задана';
    return `🤖 ИИ-генерация вопросов (OpenRouter)\n${modelLine}\n${keyLine}\n\nСменить ключ: /set_ai_key <ключ>\nСменить модель: /set_ai_model <модель>\nСгенерировать: /generate [кол-во] [категория]`;
  },
  aiGenerateStarted: (count: number, category: string) =>
    `🤖 Генерирую ${count} вопросов${category}…\nПроверяю факты и источники через web-поиск.\nЭто может занять 30–120 секунд.`,
  aiGenerateError: (reason: string, usage: UsageSummary | null) => {
    const cost = usage ? `\n\n${formatUsage(usage)}` : '';
    return `❌ Ошибка генерации: ${reason}${cost}`;
  },
  aiGenerateReport: (r: {
    total: number;
    valid: number;
    rejectedCount: number;
    rejected: { errors: string[] }[];
    usage: UsageSummary;
  }) => {
    const lines = [
      '✅ Генерация завершена',
      `• Сгенерировано: ${r.total}`,
      `• Валидных: ${r.valid} — отправлены на модерацию (/pending)`,
      `• С ошибками: ${r.rejectedCount}`,
    ];
    const sample = r.rejected.slice(0, 5).map((x) => `• ${x.errors.join('; ')}`);
    if (sample.length > 0) lines.push('Ошибки:', ...sample);
    return `${lines.join('\n')}\n\n${formatUsage(r.usage)}`;
  },
  noTop: 'Рейтинг пуст. Отвечайте на вопросы, чтобы попасть в топ.',
  noStats: 'У тебя пока нет статистики. Ответь на первый вопрос!',
  topMessage: (title: string, entries: Array<{ name: string; score: number; streak: number }>) => {
    const medals = ['🥇', '🥈', '🥉'];
    const rows = entries.map((e, i) => {
      const medal = i < 3 ? `${medals[i] ?? ''} ` : '';
      const streak = e.streak > 1 ? ` · 🔥${e.streak}` : '';
      return `${medal}${e.name} — ${e.score} очков${streak}`;
    });
    return `${title}\n${rows.join('\n')}`;
  },
  statsMessage: (s: {
    answers: number;
    correct: number;
    wrong: number;
    accuracy: number;
    averageReactionMs: number;
    medianReactionMs: number;
    favoriteCategory: string | null;
    currentStreak: number;
    bestStreak: number;
    score: number;
  }) =>
    `📊 *Твоя статистика*\n\n` +
    `Ответов: ${s.answers} · Точность: ${s.accuracy.toFixed(1)}%\n` +
    `✅ Правильно: ${s.correct} · ❌ Неверно: ${s.wrong}\n` +
    `⚡ Средняя реакция: ${formatReactionTime(s.averageReactionMs)} · Медиана: ${formatReactionTime(s.medianReactionMs)}\n` +
    `🎯 Любимая категория: ${s.favoriteCategory ? categoryLabel(s.favoriteCategory) : '—'}\n` +
    `🔥 Текущая серия: ${s.currentStreak} · Лучшая: ${s.bestStreak}\n` +
    `💎 Очков всего: ${s.score}`,
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  history: 'История',
  science: 'Наука',
  technology: 'Технологии',
  culture: 'Культура',
  geography: 'География',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

const DIFFICULTY_EMOJI: Record<number, string> = {
  1: '🟢',
  2: '🟢',
  3: '🟡',
  4: '🟠',
  5: '🔴',
};

export function formatDifficulty(difficulty: number): string {
  const emoji = DIFFICULTY_EMOJI[difficulty] ?? '⚪';
  const bar = '▰'.repeat(difficulty) + '▱'.repeat(Math.max(0, 5 - difficulty));
  return `${emoji} Сложность: ${bar} ${difficulty}/5`;
}

export function formatReactionTime(ms: number): string {
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)} сек`;
  const min = Math.floor(sec / 60);
  const rest = Math.round(sec % 60);
  return `${min} мин ${rest} сек`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface UsageSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  webSearchRequests: number;
  totalCostCredits?: number;
  estimatedCostUsd: number;
  inferenceCostUsd: number;
  searchCostUsd: number;
}

export function formatUsage(u: UsageSummary): string {
  const inTokens = u.promptTokens.toLocaleString('ru-RU');
  const outTokens = u.completionTokens.toLocaleString('ru-RU');
  const searchLine =
    u.webSearchRequests > 0
      ? `• Web-поиск: ${u.webSearchRequests} запросов`
      : '• Web-поиск: не использовался';
  return (
    `🧾 Потребление:\n` +
    `• Токены: ${inTokens} in / ${outTokens} out\n` +
    `${searchLine}\n` +
    `💰 Стоимость: $${u.estimatedCostUsd.toFixed(4)} (включая поиск)\n` +
    `   • инференс: $${u.inferenceCostUsd.toFixed(4)}\n` +
    `   • поиск: $${u.searchCostUsd.toFixed(4)}`
  );
}
