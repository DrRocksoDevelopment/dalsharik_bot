import type { DataStore } from '../storage/data-store.js';
import type { UserProfile } from './user.js';
import { calculateStreakMultiplier } from './scoring.js';

export interface TelegramUserInfo {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export function newUserProfile(user: TelegramUserInfo): UserProfile {
  const now = new Date().toISOString();
  return {
    id: String(user.id),
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    score: 0,
    currentStreak: 0,
    bestStreak: 0,
    streakMultiplier: 1,
    gamesPlayed: 0,
    answers: 0,
    correct: 0,
    wrong: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getOrCreateUser(
  store: DataStore,
  user: TelegramUserInfo,
): Promise<UserProfile> {
  const id = String(user.id);
  const existing = await store.users.get(id);
  if (existing) {
    if (user.username !== existing.username || user.first_name !== existing.firstName) {
      await store.users.update(id, {
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        updatedAt: new Date().toISOString(),
      });
    }
    return existing;
  }
  const profile = newUserProfile(user);
  await store.users.insert(profile);
  return profile;
}

export interface UserAfterAnswer {
  score: number;
  currentStreak: number;
  bestStreak: number;
  streakMultiplier: number;
}

export function applyAnswerToUser(user: UserProfile, isCorrect: boolean, isRepeat: boolean, points: number): UserAfterAnswer {
  const currentStreak = !isRepeat
    ? (isCorrect ? user.currentStreak + 1 : 0)
    : user.currentStreak;
  const bestStreak = Math.max(user.bestStreak, currentStreak);
  const streakMultiplier = calculateStreakMultiplier(currentStreak);
  return {
    score: user.score + points,
    currentStreak,
    bestStreak,
    streakMultiplier,
  };
}
