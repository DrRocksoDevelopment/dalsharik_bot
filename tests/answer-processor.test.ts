import { afterEach, describe, expect, it } from 'vitest';
import type { PollAnswer } from '@telegraf/types';
import { processPollAnswer } from '../src/game/answer-processor.js';
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

async function setupStore(questionId = 'event_000001') {
  const t = await makeTempStore();
  tempStores.push(t);
  await t.store.questions.insert(makeQuestion({ id: questionId }));
  await t.store.polls.insert(makePoll({ questionId }));
  return t;
}

describe('answer processor', () => {
  it('правильный ответ начисляет очки и увеличивает серию', async () => {
    const t = await setupStore();
    await processPollAnswer(makePollAnswer(1, [2]), 1001, { logger: makeLogger(), store: t.store });

    const user = await t.store.users.get('1');
    expect(user).not.toBeNull();
    expect(user!.currentStreak).toBe(1);
    expect(user!.bestStreak).toBe(1);
    expect(user!.score).toBe(3);

    const [answer] = await t.store.answers.find((a) => a.userId === '1');
    expect(answer?.isCorrect).toBe(true);
    expect(answer?.isRepeat).toBe(false);
    expect(answer?.selectedOption).toBe('C');
  });

  it('повторный update не начисляет очки дважды', async () => {
    const t = await setupStore();
    const deps = { logger: makeLogger(), store: t.store };
    await processPollAnswer(makePollAnswer(1, [2]), 1001, deps);
    await processPollAnswer(makePollAnswer(1, [2]), 1002, deps);

    const answers = await t.store.answers.find((a) => a.userId === '1');
    expect(answers).toHaveLength(1);

    const user = await t.store.users.get('1');
    expect(user!.score).toBe(3);
  });

  it('повтор вопроса в другом чате даёт 0 очков и не меняет серию', async () => {
    const t = await setupStore();
    const deps = { logger: makeLogger(), store: t.store };
    await processPollAnswer(makePollAnswer(1, [2]), 1001, deps);

    await t.store.polls.insert(makePoll({
      id: 'poll-rec-2',
      telegramPollId: 'telegram-poll-2',
      chatId: '-100456',
      questionId: 'event_000001',
    }));
    await processPollAnswer(makePollAnswer(1, [2], 'telegram-poll-2'), 1002, deps);

    const [repeatAnswer] = await t.store.answers.find(
      (a) => a.telegramPollId === 'telegram-poll-2',
    );
    expect(repeatAnswer?.isRepeat).toBe(true);
    expect(repeatAnswer?.points).toBe(0);

    const user = await t.store.users.get('1');
    expect(user!.currentStreak).toBe(1);
    expect(user!.score).toBe(3);
  });

  it('неправильный ответ сбрасывает серию', async () => {
    const t = await setupStore();
    const deps = { logger: makeLogger(), store: t.store };
    await processPollAnswer(makePollAnswer(1, [2]), 1001, deps);
    await t.store.polls.insert(makePoll({
      id: 'poll-rec-2',
      telegramPollId: 'telegram-poll-2',
      chatId: '-100123',
      questionId: 'event_000002',
    }));
    await t.store.questions.insert(makeQuestion({ id: 'event_000002' }));

    await processPollAnswer(makePollAnswer(1, [0], 'telegram-poll-2'), 1002, deps);

    const user = await t.store.users.get('1');
    expect(user!.currentStreak).toBe(0);
    expect(user!.bestStreak).toBe(1);
    expect(user!.wrong).toBe(1);
    expect(user!.score).toBe(3);
  });

  it('игнорирует ответ по закрытому poll', async () => {
    const t = await setupStore();
    await t.store.polls.update('poll-rec-1', { status: 'completed' });

    await processPollAnswer(makePollAnswer(1, [2]), 1001, { logger: makeLogger(), store: t.store });

    const answers = await t.store.answers.find((a) => a.userId === '1');
    expect(answers).toHaveLength(0);
  });

  it('игнорирует ответ по неизвестному poll', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    await processPollAnswer(makePollAnswer(1, [2]), 1001, { logger: makeLogger(), store: t.store });
    const answers = await t.store.answers.find((a) => a.userId === '1');
    expect(answers).toHaveLength(0);
  });
});
