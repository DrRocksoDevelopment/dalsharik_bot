export const MESSAGES = {
  start: (botName: string) =>
    `🎯 Дальшарик готов играть!\n\nЯ публикую событие, а вы угадываете, что было дальше.\n\nКоманды:\n/start — включить\n/stop — выключить\n/config — показать конфигурацию\n/set_answer_window <сек> — окно ответов\n/set_interval <сек> — интервал между вопросами\n/set_types <тип1,тип2> — типы вопросов\n/set_difficulty <мин> <макс> — диапазон сложности`,
  stop: '⏹ Игра в этой группе остановлена.',
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
    `\n\nСложность: ${q.difficulty}/5 · Категория: ${q.category}\n` +
    `Тип: ${q.type}\n\n` +
    `Объяснение: ${q.explanation}\n` +
    `Источники: ${q.sources.join(', ')}`,
  approved: '✅ Вопрос одобрен и добавлен в пул.',
  rejected: '🚫 Вопрос отклонён.',
} as const;

export function formatReactionTime(ms: number): string {
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)} сек`;
  const min = Math.floor(sec / 60);
  const rest = Math.round(sec % 60);
  return `${min} мин ${rest} сек`;
}
