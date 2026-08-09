import type { DataStore } from '../storage/data-store.js';
import type { Category } from '../types/index.js';
import type { UserProfile } from './user.js';

export interface LeaderboardEntry {
  userId: string;
  score: number;
  currentStreak: number;
  bestStreak: number;
}

export interface UserStats {
  profile: UserProfile;
  answers: number;
  correct: number;
  wrong: number;
  accuracy: number;
  averageReactionMs: number;
  medianReactionMs: number;
  favoriteCategory: Category | null;
}

function toEntry(user: UserProfile): LeaderboardEntry {
  return {
    userId: user.id,
    score: user.score,
    currentStreak: user.currentStreak,
    bestStreak: user.bestStreak,
  };
}

function sortByScore(list: LeaderboardEntry[]): LeaderboardEntry[] {
  return list.sort((a, b) => b.score - a.score || b.bestStreak - a.bestStreak);
}

export async function getChatLeaderboard(
  store: DataStore,
  chatId: string,
  limit: number,
): Promise<LeaderboardEntry[]> {
  const answers = await store.answers.find((a) => a.chatId === chatId);
  const userIds = new Set(answers.map((a) => a.userId));
  const users = await store.users.getAll();
  return sortByScore(users.filter((u) => userIds.has(u.id)).map(toEntry)).slice(0, limit);
}

export async function getGlobalLeaderboard(
  store: DataStore,
  limit: number,
): Promise<LeaderboardEntry[]> {
  const users = await store.users.getAll();
  return sortByScore(users.map(toEntry)).slice(0, limit);
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export async function buildUserStats(
  store: DataStore,
  userId: string,
): Promise<UserStats | null> {
  const profile = await store.users.get(userId);
  if (!profile) return null;

  const records = await store.answers.find((a) => a.userId === userId);
  const answers = records.length;
  const correct = records.filter((a) => a.isCorrect).length;
  const wrong = answers - correct;
  const accuracy = answers === 0 ? 0 : (correct / answers) * 100;

  const times = records.map((a) => a.reactionTimeMs).sort((a, b) => a - b);
  const averageReactionMs =
    times.length === 0 ? 0 : times.reduce((s, t) => s + t, 0) / times.length;
  const medianReactionMs = median(times);

  const questionsById = new Map((await store.questions.getAll()).map((q) => [q.id, q]));
  const categoryCounts = new Map<Category, number>();
  for (const record of records) {
    const question = questionsById.get(record.questionId);
    if (!question) continue;
    categoryCounts.set(question.category, (categoryCounts.get(question.category) ?? 0) + 1);
  }
  let favoriteCategory: Category | null = null;
  let max = 0;
  for (const [category, count] of categoryCounts) {
    if (count > max) {
      max = count;
      favoriteCategory = category;
    }
  }

  return {
    profile,
    answers,
    correct,
    wrong,
    accuracy,
    averageReactionMs,
    medianReactionMs,
    favoriteCategory,
  };
}
