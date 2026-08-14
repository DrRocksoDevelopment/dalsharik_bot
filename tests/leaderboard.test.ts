import { afterEach, describe, expect, it } from 'vitest';
import {
  buildUserStats,
  getChatLeaderboard,
  getGlobalLeaderboard,
} from '../src/game/leaderboard.js';
import { makeLogger, makeQuestion, makeTempStore, type TempStore } from './helpers.js';
import type { AnswerRecord } from '../src/game/answer.js';

const tempStores: TempStore[] = [];

afterEach(async () => {
  for (const t of tempStores.splice(0)) await t.cleanup();
});

async function setup() {
  const t = await makeTempStore();
  tempStores.push(t);
  return t;
}

function makeUser(id: string, score: number, streak: number, bestStreak: number) {
  return {
    id,
    username: `user${id}`,
    firstName: `User${id}`,
    score,
    currentStreak: streak,
    bestStreak,
    streakMultiplier: 1,
    gamesPlayed: 0,
    answers: 0,
    correct: 0,
    wrong: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeAnswer(userId: string, chatId: string, questionId: string, isCorrect: boolean, reactionTimeMs: number): AnswerRecord {
  return {
    id: `${chatId}:${userId}:${questionId}`,
    userId,
    chatId,
    questionId,
    telegramPollId: 'telegram-poll-1',
    selectedOption: 2,
    isCorrect,
    answeredAt: '2026-01-01T00:00:10.000Z',
    reactionTimeMs,
    points: isCorrect ? 3 : 0,
    isRepeat: false,
    updateId: 1,
  };
}

describe('leaderboard', () => {
  it('getChatLeaderboard учитывает только участников чата', async () => {
    const t = await setup();
    await t.store.users.insert(makeUser('u1', 120, 3, 5));
    await t.store.users.insert(makeUser('u2', 90, 0, 2));
    await t.store.users.insert(makeUser('u3', 200, 1, 4));
    await t.store.answers.insert(makeAnswer('u1', 'chatA', 'q1', true, 1000));
    await t.store.answers.insert(makeAnswer('u2', 'chatA', 'q1', false, 5000));
    await t.store.answers.insert(makeAnswer('u3', 'chatB', 'q1', true, 1000));

    const top = await getChatLeaderboard(t.store, 'chatA', 10);
    expect(top.map((e) => e.userId)).toEqual(['u1', 'u2']);
    expect(top[0]).toMatchObject({ score: 120, currentStreak: 3, bestStreak: 5 });
  });

  it('getGlobalLeaderboard сортирует всех по очкам', async () => {
    const t = await setup();
    await t.store.users.insert(makeUser('u1', 120, 3, 5));
    await t.store.users.insert(makeUser('u2', 90, 0, 2));
    await t.store.users.insert(makeUser('u3', 200, 1, 4));

    const top = await getGlobalLeaderboard(t.store, 2);
    expect(top.map((e) => e.userId)).toEqual(['u3', 'u1']);
  });

  it('buildUserStats считает агрегаты и любимую категорию', async () => {
    const t = await setup();
    await t.store.users.insert(makeUser('u1', 150, 3, 5));
    await t.store.questions.insert(makeQuestion({ id: 'h1', category: 'history' }));
    await t.store.questions.insert(makeQuestion({ id: 's1', category: 'science' }));
    await t.store.answers.insert(makeAnswer('u1', 'chatA', 'h1', true, 1000));
    await t.store.answers.insert(makeAnswer('u1', 'chatA', 's1', false, 5000));

    const stats = await buildUserStats(t.store, 'u1');
    expect(stats).not.toBeNull();
    expect(stats!.answers).toBe(2);
    expect(stats!.correct).toBe(1);
    expect(stats!.wrong).toBe(1);
    expect(stats!.accuracy).toBe(50);
    expect(stats!.averageReactionMs).toBe(3000);
    expect(stats!.medianReactionMs).toBe(3000);
    expect(stats!.favoriteCategory).toBe('history');
  });

  it('buildUserStats возвращает null для неизвестного пользователя', async () => {
    const t = await setup();
    const stats = await buildUserStats(t.store, 'ghost');
    expect(stats).toBeNull();
  });
});
