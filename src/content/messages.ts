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
  help: (botName: string) =>
    `📖 Команды *${botName}*:\n\n` +
    `/start — описание бота\n` +
    `/help — эта справка\n` +
    `/stop — остановить игру в группе\n` +
    `/config — показать конфигурацию\n` +
    `/set_answer_window <сек> — окно ответов (мин 60)\n` +
    `/set_interval <сек> — интервал между вопросами (мин 60)\n` +
    `/set_types <тип1,тип2> — типы вопросов\n` +
    `/set_difficulty <мин> <макс> — диапазон сложности 1–5\n` +
    `/set_timezone ±Ч[:ММ] — часовой пояс группы (по умолчанию Москва +3)\n` +
    `/top — рейтинг группы\n` +
    `/top_global — общий рейтинг\n` +
    `/stats — твоя статистика\n\n` +
    `📦 Админ: отправьте боту JSON-файл с вопросами — импорт в пул (в ЛС)`,
  stop: '⏹ Игра в этой группе остановлена.',
  alreadyStarted: (time?: string, until?: string) =>
    time && until
      ? `ℹ️ Всё по плану, работаем! ⏭ Следующий вопрос — в ${time} (через ~${until}) по местному времени.`
      : 'ℹ️ Всё по плану, работаем! Следующий вопрос появится по расписанию.',
  enabled: '✅ Бот включён.',
  config: (cfg: Record<string, unknown>) => `<pre>${JSON.stringify(cfg, null, 2)}</pre>`,
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
  notAdmin: '❌ Только администратор бота может выполнять эту команду.',
  noPending: '📭 Ожидающих вопросов нет.',
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
