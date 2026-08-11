import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import type { MetricsStore } from '../metrics/metrics.js';
import type { PollRecord } from './poll.js';
import type { Question } from './question.js';
import type { UserProfile } from './user.js';
import { calculatePoints, calculateStreakMultiplier } from './scoring.js';
import { calculateResults, type QuestionResults } from './stats.js';
import { newUserProfile } from './user-service.js';

export interface ScorePollDeps {
  logger: Logger;
  store: DataStore;
  metrics?: MetricsStore;
  now?: () => number;
}

export interface ScoredAnswer {
  id: string;
  isCorrect: boolean;
  points: number;
}

export interface UserScoring {
  user: UserProfile;
  scored: ScoredAnswer[];
  post?: {
    score: number;
    currentStreak: number;
    bestStreak: number;
  };
}

export async function scorePollAnswers(
  poll: PollRecord,
  question: Question,
  deps: ScorePollDeps,
): Promise<QuestionResults> {
  const pollAnswers = await deps.store.answers.find(
    (a) => a.telegramPollId === poll.telegramPollId,
  );
  const scoredAt = new Date((deps.now ?? Date.now)()).toISOString();
  const affected = [...new Set(pollAnswers.map((a) => a.userId))];

  const scoring = new Map<string, UserScoring>();
  for (const userId of affected) {
    scoring.set(userId, await recomputeUser(userId, poll, question, deps));
  }

  const stamps = new Map<string, ScoredAnswer>();
  for (const s of scoring.values()) {
    for (const scored of s.scored) stamps.set(scored.id, scored);
  }

  await deps.store.answers.mutate((items) => {
    for (const item of items) {
      const stamp = stamps.get(item.id);
      if (stamp) {
        item.isCorrect = stamp.isCorrect;
        item.points = stamp.points;
        item.scoredAt = scoredAt;
      }
    }
  });

  await deps.store.users.mutate((users) => {
    for (const userId of affected) {
      const s = scoring.get(userId)!;
      const existing = users.find((u) => u.id === userId);
      const user = existing ?? newUserProfile({ id: Number(userId) });
      user.score = s.user.score;
      user.currentStreak = s.user.currentStreak;
      user.bestStreak = s.user.bestStreak;
      user.streakMultiplier = s.user.streakMultiplier;
      user.answers = s.user.answers;
      user.correct = s.user.correct;
      user.wrong = s.user.wrong;
      user.updatedAt = scoredAt;
      if (!existing) users.push(user);
    }
  });

  for (const userId of affected) {
    const s = scoring.get(userId)!;
    if (!s.post) continue;
    const answer = pollAnswers.find((a) => a.userId === userId && a.scoredAt === undefined);
    if (!answer) continue;
    const scored = s.scored[0]!;
    await deps.metrics?.recordAnswer({
      userId,
      chatId: answer.chatId,
      questionId: answer.questionId,
      isCorrect: scored.isCorrect,
      reactionTimeMs: answer.reactionTimeMs,
      selectedOption: answer.selectedOption,
      score: s.post.score,
      currentStreak: s.post.currentStreak,
      bestStreak: s.post.bestStreak,
    });
  }

  return calculateResults(
    await deps.store.answers.find((a) => a.telegramPollId === poll.telegramPollId),
  );
}

async function recomputeUser(
  userId: string,
  poll: PollRecord,
  question: Question,
  deps: ScorePollDeps,
): Promise<UserScoring> {
  const all = (await deps.store.answers.find((a) => a.userId === userId)).sort(
    (a, b) => a.answeredAt.localeCompare(b.answeredAt) || a.updateId - b.updateId,
  );

  const current = all.find((a) => a.telegramPollId === poll.telegramPollId);
  const currentUnscored = current && current.scoredAt === undefined ? current : undefined;

  let score = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  let answers = 0;
  let correct = 0;
  let wrong = 0;

  for (const ans of all) {
    if (ans.id === currentUnscored?.id) continue;
    const isCorrect = ans.isCorrect ?? false;
    score += ans.points ?? 0;
    answers += 1;
    if (isCorrect) correct += 1;
    else wrong += 1;
    if (!ans.isRepeat) {
      currentStreak = isCorrect ? currentStreak + 1 : 0;
      bestStreak = Math.max(bestStreak, currentStreak);
    }
  }

  const scored: ScoredAnswer[] = [];
  let post: UserScoring['post'];
  if (currentUnscored) {
    const isCorrect = currentUnscored.selectedOption === question.correctAnswer;
    const calc = calculatePoints({
      difficulty: question.difficulty,
      streak: currentStreak,
      alreadyAnswered: currentUnscored.isRepeat,
    });
    const points = isCorrect ? calc.points : 0;
    scored.push({ id: currentUnscored.id, isCorrect, points });

    score += points;
    answers += 1;
    if (isCorrect) correct += 1;
    else wrong += 1;
    if (!currentUnscored.isRepeat) {
      currentStreak = isCorrect ? currentStreak + 1 : 0;
      bestStreak = Math.max(bestStreak, currentStreak);
    }
    post = { score, currentStreak, bestStreak };
  }

  const user =
    (await deps.store.users.get(userId)) ?? newUserProfile({ id: Number(userId) });
  user.score = score;
  user.currentStreak = currentStreak;
  user.bestStreak = bestStreak;
  user.streakMultiplier = calculateStreakMultiplier(currentStreak);
  user.answers = answers;
  user.correct = correct;
  user.wrong = wrong;

  return { user, scored, post };
}
