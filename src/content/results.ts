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
  streakHighlights?: StreakHighlight[];
  chatStreakRecord?: number | null;
  nextEventLocalTime?: string;
}

function formatDistribution(results: QuestionResults, question: Question): string {
  const lines: string[] = [];
  for (const answer of question.answers) {
    const correct = answer.id === question.correctAnswer;
    const marker = correct ? '🟢' : '🔴';
    lines.push(`${marker} ${answer.id} — ${results.answerDistribution[answer.id] ?? 0}`);
  }
  return lines.join('\n');
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
  const { question, results, users, slogan } = context;
  const parts: string[] = [];

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
  parts.push(formatDistribution(results, question));
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
