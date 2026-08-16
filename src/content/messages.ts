import type { AiMetrics } from '../metrics/metrics.js';

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
          '/set_timezone ±Ч[:ММ] — часовой пояс группы (по умолчанию Москва +3)\n' +
          '/set_finalization ai|static — итоги раунда: AI-ведущий или статичная карточка',
      );
    }
    if (role === 'super') {
      sections.push(
        '📦 Суперадмин:\n' +
          '/import — импорт из папки data/imports\n' +
          'Отправка JSON-файла в ЛС — импорт в пул\n' +
          '/pending — модерация\n' +
          '/config — конфигурация чата\n' +
          '/metrics — метрики бота\n' +
          '/generate — генерация вопросов ИИ (OpenRouter)\n' +
          '/set_ai_key, /set_ai_model, /ai_status — настройка ИИ\n' +
          '/set_generate_model, /reset_generate_model — отдельная модель для генерации (по умолчанию — общая)\n' +
          '/set_host_prompt, /reset_host_prompt, /host_prompt — инструкция ведущему (ЛС)\n' +
          '/set_generate_prompt, /reset_generate_prompt, /generate_prompt — промпт генерации (ЛС)\n' +
          '/broadcast <текст> — рассылка во все чаты',
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
  invalidSeconds: (usage: string, min: number) =>
    `❌ Неверное значение: целое число секунд не меньше ${min}. Пример:\n${usage}`,
  onlyGroups: 'Этот бот работает в группах.',
  noConfig: 'Конфигурация для этой группы ещё не создана. Отправьте /start.',
  unknownQuestionType: (types: string) =>
    `❌ Неизвестный тип вопроса. Допустимые:\n${types}`,
  invalidDifficultyRange: '❌ Сложность должна быть от 1 до 5, мин ≤ макс.',
  invalidTimeZone:
    '❌ Неверный часовой пояс. Формат: /set_timezone ±Ч[:ММ], от −12 до +14. Примеры: +3, -5, +5:30.',
  invalidQuietHours:
    '❌ Неверные тихие часы. Формат: /set_quiet_hours ЧЧ:ММ ЧЧ:ММ или /set_quiet_hours off',
  quietHoursSet: (range: string) => `⚙️ Тихие часы: ${range}. В это время бот не публикует вопросы.`,
  quietHoursOff: '⚙️ Тихие часы выключены. Бот публикует круглосуточно.',
  invalidFinalization:
    '❌ Неверный режим финализации. Допустимые: ai, static. Пример: /set_finalization ai',
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
    ai: AiMetrics;
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
    if (m.ai.total.calls > 0) {
      lines.push('');
      lines.push('🤖 AI-расход:');
      if (m.ai.generate.calls > 0) {
        lines.push(
          `• Генерация вопросов: ${m.ai.generate.calls} выз. · ${aiCostLabel(m.ai.generate)}` +
            ` (токены ${m.ai.generate.total_tokens.toLocaleString('ru-RU')}, поиск ${m.ai.generate.web_search_requests})`,
        );
      }
      if (m.ai.host.calls > 0) {
        lines.push(
          `• AI-ведущий: ${m.ai.host.calls} выз. · ${aiCostLabel(m.ai.host)}` +
            ` (токены ${m.ai.host.total_tokens.toLocaleString('ru-RU')})`,
        );
      }
      lines.push(`• Итого: ${aiCostLabel(m.ai.total)}`);
    }
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
    answers: { text: string; correct: boolean }[];
    explanation: string;
    sources: string[];
  }) =>
    `🆕 Новый вопрос: *${q.event.title}*\n\n` +
    `${q.event.context}\n\n` +
    `❓ *${q.question}*\n\n` +
    q.answers.map((a) => `• ${a.text}${a.correct ? ' ✅' : ''}`).join('\n') +
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
  aiKeySet: '🔑 Ключ OpenRouter сохранён.\n\nТеперь задай модель: /set_ai_model <модель>\nПроверка настроек: /ai_status',
  aiModelSet: (model: string) => `🤖 Модель сохранена: ${model}`,
  aiKeyMissing: '🔑 Ключ OpenRouter не задан. Отправь: /set_ai_key <ключ> (только в ЛС)',
  aiModelMissing:
    '🤖 Модель не задана. Отправь: /set_ai_model <модель>\nМодель используется и для генерации, и для финализации. Отдельная модель для генерации: /set_generate_model <модель>',
  aiInvalidUsage: (usage: string) => `❌ Неверный формат. Пример:\n${usage}`,
  aiUnknownCategory: (usage: string) =>
    `❌ Неизвестная категория. Допустимые: history, science, technology, culture, geography. Пример:\n${usage}`,
  aiStatus: (s: {
    model: string | null;
    generateModel: string | null;
    keyMasked: string | null;
    keyFromEnv: boolean;
    hostPromptSet: boolean;
    firecrawlMode: 'cloud' | 'local';
    firecrawlBaseUrl: string;
    firecrawlKeyMasked: string | null;
    firecrawlKeyFromEnv: boolean;
  }) => {
    const keyLine = s.keyMasked
      ? `• Ключ: ${s.keyMasked}${s.keyFromEnv ? ' (из .env)' : ''}`
      : '• Ключ: не задан';
    const modelLine = s.model ? `• Модель: ${s.model}` : '• Модель: не задана';
    const generateModelLine = s.generateModel
      ? `• Модель генерации: ${s.generateModel}`
      : '• Модель генерации: как основная';
    const hostPromptLine = s.hostPromptSet
      ? '• Промпт ведущего: кастомный'
      : '• Промпт ведущего: стандартный';
    const firecrawlLine =
      s.firecrawlMode === 'cloud'
        ? `• Firecrawl: облако (ключ ${s.firecrawlKeyMasked}${s.firecrawlKeyFromEnv ? ' из .env' : ''})`
        : `• Firecrawl: локально (${s.firecrawlBaseUrl})`;
    return `🤖 ИИ-генерация вопросов (OpenRouter)\n${modelLine}\n${generateModelLine}\n${keyLine}\n${firecrawlLine}\n${hostPromptLine}\n\nСменить ключ: /set_ai_key <ключ>\nСменить модель: /set_ai_model <модель>\nМодель генерации: /set_generate_model <модель>, сброс: /reset_generate_model\nFirecrawl: /set_firecrawl_key <ключ>, отзыв: /reset_firecrawl_key; адрес: /set_firecrawl_url <url>, сброс: /reset_firecrawl_url\nПромпт ведущего: /set_host_prompt <текст>, сброс: /reset_host_prompt\nСгенерировать: /generate [кол-во] [категория]`;
  },
  generateModelSet: (model: string) =>
    `🤖 Модель генерации сохранена: ${model}\nСброс к основной модели: /reset_generate_model`,
  generateModelReset: '🤖 Модель генерации сброшена — используется основная (/set_ai_model).',
  firecrawlKeySet:
    '🔥 Ключ Firecrawl сохранён — факт-поиск идёт через облако api.firecrawl.dev.\nОтзыв ключа (переключение на локальный инстанс): /reset_firecrawl_key',
  firecrawlKeyReset:
    '🔥 Ключ Firecrawl отозван — факт-поиск идёт через локальный инстанс (адрес: /set_firecrawl_url, по умолчанию http://localhost:3002).',
  firecrawlUrlSet: (url: string) =>
    `🔥 Адрес локального Firecrawl сохранён: ${url}\nСброс: /reset_firecrawl_url`,
  firecrawlUrlReset:
    '🔥 Адрес локального Firecrawl сброшен — используется значение из .env или http://localhost:3002.',
  hostPromptSet:
    '🎤 Кастомная инструкция ведущему сохранена.\nСброс к стандартной: /reset_host_prompt',
  hostPromptReset: '🎤 Кастомная инструкция ведущему сброшена — используется стандартная.',
  hostPromptShow: (prompt: string | null, defaultPrompt: string) =>
    prompt
      ? `🎤 Текущий промпт ведущего:\n\n${prompt}\n\nСменить: /set_host_prompt <текст>\nСброс: /reset_host_prompt`
      : `🎤 Кастомный промпт не задан — используется стандартный:\n\n${defaultPrompt}\n\nЗадать свой: /set_host_prompt <текст>`,
  generatePromptSet:
    '🧠 Кастомный промпт генерации вопросов сохранён.\nСброс к стандартному: /reset_generate_prompt',
  generatePromptReset:
    '🧠 Кастомный промпт генерации сброшен — используется стандартный.',
  generatePromptTooLong: (max: number) =>
    `❌ Промпт слишком длинный (максимум ${max} символов).`,
  generatePromptShow: (prompt: string | null, defaultPrompt: string) =>
    prompt
      ? `🧠 Текущий промпт генерации вопросов:\n\n${prompt}\n\nСменить: /set_generate_prompt <текст>\nСброс: /reset_generate_prompt`
      : `🧠 Кастомный промпт не задан — используется стандартный:\n\n${defaultPrompt}\n\nЗадать свой: /set_generate_prompt <текст>`,
  hostPromptTooLong: (max: number) =>
    `❌ Инструкция слишком длинная (максимум ${max} символов).`,
  aiGenerateStarted: (count: number, category: string) =>
    `🤖 Генерирую ${count} вопросов${category}…\nПодбираю темы, проверяю факты и источники через Firecrawl.\nЭто может занять 30–120 секунд.`,
  aiGenerateTopicsReady: (total: number, kept: number, skipped: number) =>
    `🗂 Темы подобраны: ${kept} из ${total}${skipped > 0 ? ` (пропущено повторов: ${skipped})` : ''}.\n🔎 Ищу факты и источники через Firecrawl…`,
  aiGenerateFactsReady: (pages: number, searched: number) =>
    `🔎 Факты собраны: ${pages} страниц из ${searched} поисков.\n🧠 Генерирую вопросы…`,
  aiGenerateQuestionProgress: (index: number, total: number, title: string) =>
    `🧠 [${index}/${total}] Генерирую вопрос: «${title}»…`,
  aiGenerateQuestionDone: (index: number, total: number, title: string) =>
    `✅ [${index}/${total}] «${title}» — вопрос готов.`,
  aiGenerateFactProgress: (p: { done: number; total: number; title: string; pages: number; totalPages: number; failed: number }) =>
    `🔎 [${p.done}/${p.total}] «${p.title}» — ${p.pages} стр.${p.failed > 0 ? ` (неудач: ${p.failed})` : ''} (всего ${p.totalPages})`,
  aiGenerateModelReply: (preview: string) => `📄 Ответ модели:\n${preview}`,
  aiGenerateShortfall: (got: number, wanted: number) =>
    `⚠️ Модель вернула только ${got} из ${wanted} — недостающие не сгенерированы. Запусти /generate ещё раз.`,
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
  broadcastUsage: '📣 Использование: /broadcast <текст>',
  broadcastEmpty: '📭 Нет включённых чатов для рассылки.',
  broadcastDone: (sent: number, failed: number) => {
    let text = `📣 Рассылка завершена: доставлено в ${sent} ${pluralRu(sent, ['чат', 'чата', 'чатов'])}.`;
    if (failed > 0) text += ` Не удалось: ${failed}.`;
    return text;
  },
  ratingPrompt: '🤔 Оцени этот вопрос:',
  ratingSaved: (label: string) => `Спасибо! Оценка вопроса: ${label}`,
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

export function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
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

function aiCostLabel(m: { total_cost_credits: number; estimated_cost_usd: number }): string {
  return m.total_cost_credits > 0
    ? `$${m.total_cost_credits.toFixed(4)} (факт)`
    : `$${m.estimated_cost_usd.toFixed(4)} (оценка)`;
}

export function formatUsage(u: UsageSummary): string {
  const inTokens = u.promptTokens.toLocaleString('ru-RU');
  const outTokens = u.completionTokens.toLocaleString('ru-RU');
  const searchLine =
    u.webSearchRequests > 0
      ? `• Web-поиск: ${u.webSearchRequests} запросов`
      : '• Web-поиск: не использовался';
  const hasActual = typeof u.totalCostCredits === 'number' && Number.isFinite(u.totalCostCredits);
  const costLine = hasActual
    ? `💰 Стоимость: $${(u.totalCostCredits as number).toFixed(4)} (факт по счёту OpenRouter)`
    : `💰 Стоимость: $${u.estimatedCostUsd.toFixed(4)} (оценка по прайс-листу)`;
  const breakdownLine = hasActual
    ? `   • оценка по прайс-листу: инференс $${u.inferenceCostUsd.toFixed(4)} · поиск $${u.searchCostUsd.toFixed(4)}`
    : `   • инференс: $${u.inferenceCostUsd.toFixed(4)}\n   • поиск: $${u.searchCostUsd.toFixed(4)}`;
  return (
    `🧾 Потребление:\n` +
    `• Токены: ${inTokens} in / ${outTokens} out\n` +
    `${searchLine}\n` +
    `${costLine}\n` +
    breakdownLine
  );
}
