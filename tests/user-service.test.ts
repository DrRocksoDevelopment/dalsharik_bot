import { describe, expect, it } from 'vitest';
import { applyAnswerToUser, newUserProfile } from '../src/game/user-service.js';
import type { UserProfile } from '../src/game/user.js';

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: '42',
    username: 'user42',
    firstName: 'Имя',
    score: 100,
    currentStreak: 0,
    bestStreak: 3,
    streakMultiplier: 1,
    gamesPlayed: 5,
    answers: 10,
    correct: 6,
    wrong: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('user-service', () => {
  it('newUserProfile создаёт пустой профиль из данных Telegram', () => {
    const profile = newUserProfile({
      id: 42,
      username: 'alice',
      first_name: 'Алиса',
      last_name: 'Иванова',
    });
    expect(profile).toMatchObject({
      id: '42',
      username: 'alice',
      firstName: 'Алиса',
      lastName: 'Иванова',
      score: 0,
      currentStreak: 0,
      bestStreak: 0,
      streakMultiplier: 1,
      gamesPlayed: 0,
      answers: 0,
      correct: 0,
      wrong: 0,
    });
    expect(profile.createdAt).toBeTruthy();
  });

  it('newUserProfile корректно обрабатывает отсутствие имени', () => {
    const profile = newUserProfile({ id: 7 });
    expect(profile.username).toBeUndefined();
    expect(profile.firstName).toBeUndefined();
  });

  it('applyAnswerToUser: верный ответ увеличивает серию и очки', () => {
    const result = applyAnswerToUser(makeUser({ currentStreak: 2 }), true, false, 10);
    expect(result).toMatchObject({ score: 110, currentStreak: 3, bestStreak: 3 });
    expect(result.streakMultiplier).toBeGreaterThanOrEqual(1);
  });

  it('applyAnswerToUser: неверный ответ сбрасывает серию', () => {
    const result = applyAnswerToUser(makeUser({ currentStreak: 5 }), false, false, 0);
    expect(result.currentStreak).toBe(0);
    expect(result.score).toBe(100);
  });

  it('applyAnswerToUser: повторный ответ не меняет серию', () => {
    const result = applyAnswerToUser(makeUser({ currentStreak: 4 }), true, true, 5);
    expect(result.currentStreak).toBe(4);
    expect(result.bestStreak).toBe(4);
    expect(result.score).toBe(105);
  });

  it('applyAnswerToUser: новая лучшая серия обновляет bestStreak', () => {
    const result = applyAnswerToUser(makeUser({ currentStreak: 3, bestStreak: 3 }), true, false, 10);
    expect(result.bestStreak).toBe(4);
  });
});
