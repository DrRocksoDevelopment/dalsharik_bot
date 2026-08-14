import type { AnswerRecord } from './answer.js';

export interface FastestEntry {
  userId: string;
  reactionTimeMs: number;
}

export interface QuestionResults {
  questionId: string;
  chatId: string;
  totalPlayers: number;
  correct: number;
  wrong: number;
  accuracy: number;
  fastestCorrectMs: number | null;
  slowestCorrectMs: number | null;
  fastestCorrect: FastestEntry | null;
  slowestCorrect: FastestEntry | null;
  averageReactionMs: number;
  medianReactionMs: number;
  answerDistribution: Record<string, number>;
  topPlayers: Array<{ userId: string; points: number }>;
}

export function calculateResults(answers: AnswerRecord[]): QuestionResults {
  const correct = answers.filter((a) => a.isCorrect);
  const wrong = answers.length - correct.length;
  const totalPlayers = answers.length;
  const accuracy = totalPlayers === 0 ? 0 : (correct.length / totalPlayers) * 100;

  const correctByTime = [...correct].sort((a, b) => a.reactionTimeMs - b.reactionTimeMs);
  const fastestCorrect = correctByTime.length > 0 ? {
    userId: correctByTime[0]!.userId,
    reactionTimeMs: correctByTime[0]!.reactionTimeMs,
  } : null;
  const slowestCorrect = correctByTime.length > 0 ? {
    userId: correctByTime[correctByTime.length - 1]!.userId,
    reactionTimeMs: correctByTime[correctByTime.length - 1]!.reactionTimeMs,
  } : null;
  const fastestCorrectMs = fastestCorrect?.reactionTimeMs ?? null;
  const slowestCorrectMs = slowestCorrect?.reactionTimeMs ?? null;

  const allTimes = answers.map((a) => a.reactionTimeMs).sort((a, b) => a - b);
  const averageReactionMs = allTimes.length === 0
    ? 0
    : allTimes.reduce((s, t) => s + t, 0) / allTimes.length;
  const medianReactionMs = median(allTimes);

  const answerDistribution: Record<string, number> = {};
  for (const a of answers) {
    const key = String(a.selectedOption);
    answerDistribution[key] = (answerDistribution[key] ?? 0) + 1;
  }

  const byUser = new Map<string, number>();
  for (const a of answers) {
    byUser.set(a.userId, (byUser.get(a.userId) ?? 0) + (a.points ?? 0));
  }
  const topPlayers = [...byUser.entries()]
    .map(([userId, points]) => ({ userId, points }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);

  return {
    questionId: answers[0]?.questionId ?? '',
    chatId: answers[0]?.chatId ?? '',
    totalPlayers,
    correct: correct.length,
    wrong,
    accuracy,
    fastestCorrectMs,
    slowestCorrectMs,
    fastestCorrect,
    slowestCorrect,
    averageReactionMs,
    medianReactionMs,
    answerDistribution,
    topPlayers,
  };
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}
