import { afterEach, describe, expect, it } from 'vitest';
import { registerStatsCommands } from '../src/bot/stats-commands.js';
import { MESSAGES } from '../src/content/messages.js';
import type { AnswerRecord } from '../src/game/answer.js';
import type { UserProfile } from '../src/game/user.js';
import { makeBotHarness, makeLogger, commandUpdate, type BotHarness } from './helpers.js';

const CHAT_ID = '-100123';

function makeUser(id: string, overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id,
    username: `user${id}`,
    firstName: `Имя ${id}`,
    score: 0,
    currentStreak: 0,
    bestStreak: 0,
    streakMultiplier: 1,
    gamesPlayed: 0,
    answers: 0,
    correct: 0,
    wrong: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeAnswer(id: string, overrides: Partial<AnswerRecord> = {}): AnswerRecord {
  return {
    id,
    userId: '42',
    chatId: CHAT_ID,
    questionId: 'event_000001',
    telegramPollId: 'poll-1',
    selectedOption: 'C',
    isCorrect: true,
    answeredAt: '2026-01-01T00:00:00.000Z',
    reactionTimeMs: 1500,
    points: 10,
    isRepeat: false,
    updateId: 1,
    ...overrides,
  };
}

function lastReply(h: BotHarness): string {
  const calls = h.sendMessage.mock.calls;
  const last = calls[calls.length - 1];
  return typeof last?.[1] === 'string' ? last[1] : '';
}

describe('stats-commands', () => {
  let h: BotHarness;

  afterEach(async () => {
    await h.cleanup();
  });

  async function setup(): Promise<BotHarness> {
    const harness = await makeBotHarness();
    registerStatsCommands(harness.bot, { logger: makeLogger(), store: harness.store });
    return harness;
  }

  it('/top в группе показывает рейтинг группы', async () => {
    h = await setup();
    await h.store.users.insert(makeUser('42', { score: 30 }));
    await h.store.users.insert(makeUser('7', { score: 20 }));
    await h.store.answers.insert(makeAnswer('a1', { userId: '42' }));
    await h.store.answers.insert(makeAnswer('a2', { userId: '7' }));

    await h.bot.handleUpdate(commandUpdate('/top'));
    const text = lastReply(h);
    expect(text).toContain('Топ группы');
    expect(text).toContain('@user42');
    expect(text).toContain('30 очков');
    expect(text.indexOf('@user42')).toBeLessThan(text.indexOf('@user7'));
  });

  it('/top без ответов отвечает noTop', async () => {
    h = await setup();
    await h.store.users.insert(makeUser('42', { score: 5 }));
    await h.bot.handleUpdate(commandUpdate('/top'));
    expect(lastReply(h)).toBe(MESSAGES.noTop);
  });

  it('/top в приватном чате игнорируется', async () => {
    h = await setup();
    await h.store.users.insert(makeUser('42', { score: 5 }));
    await h.bot.handleUpdate(commandUpdate('/top', { chatType: 'private' }));
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('/top_global показывает рейтинг всех чатов', async () => {
    h = await setup();
    await h.store.users.insert(makeUser('42', { score: 50 }));
    await h.store.users.insert(makeUser('7', { score: 10 }));
    await h.bot.handleUpdate(commandUpdate('/top_global'));
    const text = lastReply(h);
    expect(text).toContain('Топ всех чатов');
    expect(text).toContain('50 очков');
  });

  it('/stats показывает статистику пользователя', async () => {
    h = await setup();
    await h.store.users.insert(makeUser('42', { score: 40, currentStreak: 3, bestStreak: 5 }));
    await h.store.answers.insert(makeAnswer('a1'));
    await h.store.answers.insert(makeAnswer('a2', { isCorrect: false, reactionTimeMs: 2500 }));

    await h.bot.handleUpdate(commandUpdate('/stats'));
    const text = lastReply(h);
    expect(text).toContain('Твоя статистика');
    expect(text).toContain('Ответов: 2');
    expect(text).toContain('Точность: 50.0%');
    expect(text).toContain('Текущая серия: 3');
    expect(text).toContain('Очков всего: 40');
  });

  it('/stats без профиля отвечает noStats', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/stats'));
    expect(lastReply(h)).toBe(MESSAGES.noStats);
  });
});
