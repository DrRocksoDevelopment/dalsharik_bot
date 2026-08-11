import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PollAnswer } from '@telegraf/types';
import { processPollAnswer } from '../src/game/answer-processor.js';
import { scorePollAnswers } from '../src/game/score-poll.js';
import type { MetricsStore } from '../src/metrics/metrics.js';
import { makeLogger, makePoll, makeQuestion, makeTempStore, type TempStore } from './helpers.js';

const tempStores: TempStore[] = [];

afterEach(async () => {
  for (const t of tempStores.splice(0)) await t.cleanup();
});

function makePollAnswer(userId: number, optionIds: number[], pollId = 'telegram-poll-1'): PollAnswer {
  return {
    poll_id: pollId,
    user: { id: userId, is_bot: false, first_name: 'Игрок' },
    option_ids: optionIds,
  };
}

async function vote(
  store: TempStore['store'],
  userId: number,
  optionIds: number[],
  pollId: string,
  updateId: number,
): Promise<void> {
  await processPollAnswer(makePollAnswer(userId, optionIds, pollId), updateId, {
    logger: makeLogger(),
    store,
  });
}

async function setup() {
  const t = await makeTempStore();
  tempStores.push(t);
  await t.store.questions.insert(makeQuestion());
  return t;
}

function noopMetrics(): MetricsStore {
  return {
    recordQuestionPublished: vi.fn(),
    recordQuestionCompleted: vi.fn(),
    recordAnswer: vi.fn(),
    snapshot: vi.fn(),
  } as unknown as MetricsStore;
}

describe('скоринг на финализации', () => {
  it('проставляет isCorrect/points/scoredAt и пересчитывает пользователей', async () => {
    const t = await setup();
    await t.store.polls.insert(makePoll());
    await vote(t.store, 1, [2], 'telegram-poll-1', 1001);
    await vote(t.store, 2, [0], 'telegram-poll-1', 1002);

    const results = await scorePollAnswers(
      (await t.store.polls.get('poll-rec-1'))!,
      (await t.store.questions.get('event_000001'))!,
      { logger: makeLogger(), store: t.store, now: () => Date.parse('2026-01-01T01:00:00.000Z') },
    );

    expect(results.correct).toBe(1);
    expect(results.wrong).toBe(1);

    const answers = await t.store.answers.getAll();
    const a1 = answers.find((a) => a.userId === '1')!;
    expect(a1.isCorrect).toBe(true);
    expect(a1.points).toBe(3);
    expect(a1.scoredAt).toBe('2026-01-01T01:00:00.000Z');
    const a2 = answers.find((a) => a.userId === '2')!;
    expect(a2.isCorrect).toBe(false);
    expect(a2.points).toBe(0);

    const u1 = await t.store.users.get('1');
    expect(u1?.score).toBe(3);
    expect(u1?.currentStreak).toBe(1);
    expect(u1?.bestStreak).toBe(1);
    expect(u1?.answers).toBe(1);
    expect(u1?.correct).toBe(1);
    const u2 = await t.store.users.get('2');
    expect(u2?.score).toBe(0);
    expect(u2?.currentStreak).toBe(0);
    expect(u2?.wrong).toBe(1);
  });

  it('накапливает серию через несколько финализаций', async () => {
    const t = await setup();
    await t.store.polls.insert(makePoll());
    await vote(t.store, 1, [2], 'telegram-poll-1', 1001);
    await scorePollAnswers(
      (await t.store.polls.get('poll-rec-1'))!,
      (await t.store.questions.get('event_000001'))!,
      { logger: makeLogger(), store: t.store },
    );

    await t.store.questions.insert(makeQuestion({ id: 'event_000002', createdAt: '2026-01-02T00:00:00.000Z' }));
    await t.store.polls.insert(makePoll({
      id: 'poll-rec-2',
      telegramPollId: 'telegram-poll-2',
      questionId: 'event_000002',
      createdAt: '2026-01-02T00:00:00.000Z',
    }));
    await vote(t.store, 1, [2], 'telegram-poll-2', 1002);
    await scorePollAnswers(
      (await t.store.polls.get('poll-rec-2'))!,
      (await t.store.questions.get('event_000002'))!,
      { logger: makeLogger(), store: t.store },
    );

    const u1 = await t.store.users.get('1');
    expect(u1?.currentStreak).toBe(2);
    expect(u1?.score).toBe(6);
    expect(u1?.answers).toBe(2);
  });

  it('идемпотентен: повторная финализация не меняет очки и метрики', async () => {
    const t = await setup();
    const metrics = noopMetrics();
    await t.store.polls.insert(makePoll());
    await vote(t.store, 1, [2], 'telegram-poll-1', 1001);

    await scorePollAnswers(
      (await t.store.polls.get('poll-rec-1'))!,
      (await t.store.questions.get('event_000001'))!,
      { logger: makeLogger(), store: t.store, metrics },
    );
    const scoredAtAfterFirst = (await t.store.answers.getAll())[0]!.scoredAt;
    expect(metrics.recordAnswer).toHaveBeenCalledTimes(1);

    await scorePollAnswers(
      (await t.store.polls.get('poll-rec-1'))!,
      (await t.store.questions.get('event_000001'))!,
      { logger: makeLogger(), store: t.store, metrics },
    );

    const u1 = await t.store.users.get('1');
    expect(u1?.score).toBe(3);
    expect(u1?.currentStreak).toBe(1);
    const answers = await t.store.answers.getAll();
    expect(answers[0]!.scoredAt).toBe(scoredAtAfterFirst);
    expect(metrics.recordAnswer).toHaveBeenCalledTimes(1);
  });

  it('повтор вопроса начисляется как repeat: 0 очков, серия не растёт', async () => {
    const t = await setup();
    await t.store.polls.insert(makePoll());
    await vote(t.store, 1, [2], 'telegram-poll-1', 1001);
    await scorePollAnswers(
      (await t.store.polls.get('poll-rec-1'))!,
      (await t.store.questions.get('event_000001'))!,
      { logger: makeLogger(), store: t.store },
    );

    await t.store.polls.insert(makePoll({ id: 'poll-rec-2', telegramPollId: 'telegram-poll-2' }));
    await vote(t.store, 1, [2], 'telegram-poll-2', 1002);
    const answersBefore = await t.store.answers.find((a) => a.telegramPollId === 'telegram-poll-2');
    expect(answersBefore[0]!.isRepeat).toBe(true);

    await scorePollAnswers(
      (await t.store.polls.get('poll-rec-2'))!,
      (await t.store.questions.get('event_000001'))!,
      { logger: makeLogger(), store: t.store },
    );

    const u1 = await t.store.users.get('1');
    expect(u1?.currentStreak).toBe(1);
    expect(u1?.score).toBe(3);
    const repeat = (await t.store.answers.find((a) => a.telegramPollId === 'telegram-poll-2'))[0]!;
    expect(repeat.isCorrect).toBe(true);
    expect(repeat.points).toBe(0);
  });

  it('пишет метрики с финальным isCorrect', async () => {
    const t = await setup();
    const metrics = noopMetrics();
    await t.store.polls.insert(makePoll());
    await vote(t.store, 1, [2], 'telegram-poll-1', 1001);
    await vote(t.store, 2, [0], 'telegram-poll-1', 1002);

    await scorePollAnswers(
      (await t.store.polls.get('poll-rec-1'))!,
      (await t.store.questions.get('event_000001'))!,
      { logger: makeLogger(), store: t.store, metrics },
    );

    expect(metrics.recordAnswer).toHaveBeenCalledTimes(2);
    expect(metrics.recordAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '1', isCorrect: true, score: 3, currentStreak: 1 }),
    );
    expect(metrics.recordAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '2', isCorrect: false, score: 0, currentStreak: 0 }),
    );
  });
});
