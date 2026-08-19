import type { QuestionResults } from '../game/stats.js';
import type { Question } from '../game/question.js';
import type { UserProfile } from '../game/user.js';
import { formatReactionTime } from './messages.js';

function displayName(user: UserProfile | undefined, userId: string): string {
  if (!user) return `@${userId}`;
  if (user.username) return `@${user.username}`;
  return user.firstName ?? `@${userId}`;
}

export interface StreakHighlight {
  userId: string;
  currentStreak: number;
}

export interface ResultsContext {
  question: Question;
  results: QuestionResults;
  users: Map<string, UserProfile>;
  slogan: string;
  optionMap?: number[];
  streakHighlights?: StreakHighlight[];
  chatStreakRecord?: number | null;
  nextEventLocalTime?: string;
  messageLink?: string;
}

export interface EmptyResultsContext {
  question: Question;
  optionMap?: number[];
  nextEventLocalTime?: string;
  messageLink?: string;
}

function messageLinkLine(messageLink?: string): string {
  return messageLink ? `🔗 Исходный вопрос: ${messageLink}` : '';
}

export function buildEmptyResultsMessage(context: EmptyResultsContext): string {
  const { question, optionMap, nextEventLocalTime } = context;
  const parts: string[] = [];

  const link = messageLinkLine(context.messageLink);
  if (link) parts.push(link);

  parts.push('🙊 Никто не ответил.');
  parts.push('');
  parts.push(`✅ ${formatCorrectAnswer(question, optionMap)}`);
  parts.push('');
  parts.push('📖 А на самом деле...');
  parts.push('');
  parts.push(question.explanation);
  parts.push('');

  if (question.sources.length > 0) {
    parts.push(`Источники: ${question.sources.join(', ')}`);
  }

  if (nextEventLocalTime) {
    parts.push('');
    parts.push(`⏭ Следующее событие — в ${nextEventLocalTime} по местному времени`);
  }

  return parts.join('\n');
}

export function buildShowSummaryMessage(context: {
  question: Question;
  results: QuestionResults;
  optionMap?: number[];
  nextEventLocalTime?: string;
  messageLink?: string;
}): string {
  const { question, results, optionMap, nextEventLocalTime } = context;
  const parts: string[] = [];

  const link = messageLinkLine(context.messageLink);
  if (link) parts.push(link);

  parts.push('📇 Разбор завершён');
  parts.push('');
  parts.push(`Ответили: ${results.totalPlayers}`);
  parts.push('');
  parts.push('Варианты:');
  parts.push(formatDistribution(results, question, optionMap));
  parts.push('');
  parts.push(`✅ ${formatCorrectAnswer(question, optionMap)}`);

  if (question.sources.length > 0) {
    parts.push('');
    parts.push(`Источники: ${question.sources.join(', ')}`);
  }

  if (nextEventLocalTime) {
    parts.push('');
    parts.push(`⏭ Следующее событие — в ${nextEventLocalTime} по местному времени`);
  }

  return parts.join('\n');
}

function formatDistribution(results: QuestionResults, question: Question, optionMap?: number[]): string {
  const lines: string[] = [];
  const map = optionMap ?? question.answers.map((_, i) => i);
  for (let pollPos = 0; pollPos < map.length; pollPos += 1) {
    const answerIdx = map[pollPos]!;
    const answer = question.answers[answerIdx]!;
    const letter = String.fromCharCode(65 + pollPos);
    const marker = answer.correct ? '🟢' : '🔴';
    lines.push(`${marker} ${letter} — ${results.answerDistribution[String(answerIdx)] ?? 0}`);
  }
  return lines.join('\n');
}

function formatCorrectAnswer(question: Question, optionMap?: number[]): string {
  const correctIdx = question.answers.findIndex((a) => a.correct);
  if (correctIdx === -1) return 'Правильный ответ: не указан';
  const map = optionMap ?? question.answers.map((_, i) => i);
  const pollPos = map.indexOf(correctIdx);
  const letter = String.fromCharCode(65 + (pollPos === -1 ? correctIdx : pollPos));
  return `Правильный ответ: ${letter} — ${question.answers[correctIdx]!.text}`;
}

function formatTopPlayers(results: QuestionResults, users: Map<string, UserProfile>): string {
  if (results.topPlayers.length === 0) return '';
  const lines = results.topPlayers.map((p) => {
    return `${displayName(users.get(p.userId), p.userId)} +${p.points}`;
  });
  return `🏆 За этот вопрос\n${lines.join('\n')}\n`;
}

function formatStreaks(
  highlights: StreakHighlight[],
  chatStreakRecord: number | null,
  users: Map<string, UserProfile>,
): string {
  if (highlights.length === 0) return '';
  const lines = highlights.map((h) => {
    let line = `${displayName(users.get(h.userId), h.userId)} — ${h.currentStreak}`;
    if (
      chatStreakRecord !== null &&
      h.currentStreak < chatStreakRecord &&
      h.currentStreak + 1 >= chatStreakRecord
    ) {
      line += ` · до рекорда чата (${chatStreakRecord}) ещё ${chatStreakRecord - h.currentStreak}`;
    }
    return line;
  });
  return `🔥 Серии\n${lines.join('\n')}\n`;
}

export function buildResultsMessage(context: ResultsContext): string {
  const { question, results, users, slogan, optionMap } = context;
  const parts: string[] = [];

  const link = messageLinkLine(context.messageLink);
  if (link) parts.push(link);

  parts.push('🏁 Итоги');
  parts.push('');
  parts.push(`Ответили: ${results.totalPlayers}`);
  parts.push('');
  parts.push(`✅ Правильно: ${results.correct}`);
  parts.push(`❌ Неверно: ${results.wrong}`);
  parts.push('');
  parts.push(`Точность: ${results.accuracy.toFixed(1)}%`);
  parts.push('');

  if (results.fastestCorrect && results.slowestCorrect) {
    parts.push(`⚡ Самый быстрый правильный ответ:\n${displayName(users.get(results.fastestCorrect.userId), results.fastestCorrect.userId)} — ${formatReactionTime(results.fastestCorrect.reactionTimeMs)}`);
    parts.push('');
    parts.push(`🐢 Самый поздний правильный:\n${displayName(users.get(results.slowestCorrect.userId), results.slowestCorrect.userId)} — ${formatReactionTime(results.slowestCorrect.reactionTimeMs)}`);
    parts.push('');
  }

  parts.push('Варианты:');
  parts.push(formatDistribution(results, question, optionMap));
  parts.push('');

  const top = formatTopPlayers(results, users);
  if (top) {
    parts.push(top);
    parts.push('');
  }

  const streaks = formatStreaks(context.streakHighlights ?? [], context.chatStreakRecord ?? null, users);
  if (streaks) {
    parts.push(streaks);
    parts.push('');
  }

  parts.push('📖 А на самом деле...');
  parts.push('');
  parts.push(question.explanation);
  parts.push('');

  if (question.sources.length > 0) {
    parts.push(`Источники: ${question.sources.join(', ')}`);
    parts.push('');
  }

  parts.push(slogan);

  if (context.nextEventLocalTime) {
    parts.push('');
    parts.push(`⏭ Следующее событие — в ${context.nextEventLocalTime} по местному времени`);
  }

  return parts.join('\n');
}
