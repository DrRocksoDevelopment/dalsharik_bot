import { afterEach, describe, expect, it } from 'vitest';
import { processPollAnswer } from '../src/game/answer-processor.js';
import { DefaultQuestionFinalizer } from '../src/game/finalizer.js';
import type { FinalizerSender } from '../src/telegram/finalizer-sender.js';
import type { PollAnswer } from '@telegraf/types';
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

function makeSender() {
  const calls = { close: 0, messages: 0, lastText: '' };
  const sender: FinalizerSender = {
    async closePoll() {
      calls.close += 1;
    },
    async sendMessage(_chatId, text) {
      calls.messages += 1;
      calls.lastText = text;
    },
  };
  return { sender, calls };
}

async function setupGame() {
  const t = await makeTempStore();
  tempStores.push(t);
  await t.store.questions.insert(makeQuestion());
  await t.store.polls.insert(makePoll());
  return t;
}

describe('игровой цикл', () => {
  it('несколько игроков: очки, серии и итоги корректны', async () => {
    const t = await setupGame();
    const deps = { logger: makeLogger(), store: t.store };

    await processPollAnswer(makePollAnswer(1, [2]), 1001, deps);
    await processPollAnswer(makePollAnswer(2, [2]), 1002, deps);
    await processPollAnswer(makePollAnswer(3, [0]), 1003, deps);

    const { sender, calls } = makeSender();
    const finalizer = new DefaultQuestionFinalizer({ logger: makeLogger(), store: t.store, sender });
    await finalizer.finalize((await t.store.polls.get('poll-rec-1'))!);

    expect(calls.lastText).toContain('Ответили: 3');
    expect(calls.lastText).toContain('✅ Правильно: 2');
    expect(calls.lastText).toContain('❌ Неверно: 1');

    const users = await t.store.users.getAll();
    const byId = new Map(users.map((u) => [u.id, u]));
    expect(byId.get('1')?.currentStreak).toBe(1);
    expect(byId.get('3')?.currentStreak).toBe(0);
    expect(byId.get('3')?.score).toBe(0);
  });

  it('отсутствие ответов: итоги публикуются без ошибок', async () => {
    const t = await setupGame();
    const { sender, calls } = makeSender();
    const finalizer = new DefaultQuestionFinalizer({ logger: makeLogger(), store: t.store, sender });

    await finalizer.finalize((await t.store.polls.get('poll-rec-1'))!);

    expect(calls.close).toBe(1);
    expect(calls.messages).toBe(1);
    expect(calls.lastText).toContain('Ответили: 0');
    expect(calls.lastText).toContain('Точность: 0.0%');
    expect(calls.lastText).toContain('📖 А на самом деле...');

    const stored = await t.store.polls.get('poll-rec-1');
    expect(stored?.status).toBe('completed');
  });

  it('несколько игроков: топ за вопрос и распределение вариантов', async () => {
    const t = await setupGame();
    const deps = { logger: makeLogger(), store: t.store };
    await processPollAnswer(makePollAnswer(1, [2]), 1001, deps);
    await processPollAnswer(makePollAnswer(2, [0]), 1002, deps);

    const { sender, calls } = makeSender();
    const finalizer = new DefaultQuestionFinalizer({ logger: makeLogger(), store: t.store, sender });
    await finalizer.finalize((await t.store.polls.get('poll-rec-1'))!);

    expect(calls.lastText).toContain('🏆 За этот вопрос');
    expect(calls.lastText).toMatch(/Варианты:\n🅰️ 1\n🅱️ 0\n🅲 1\n🅳 0/);
  });
});
