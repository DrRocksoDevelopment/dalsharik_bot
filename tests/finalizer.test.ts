import { afterEach, describe, expect, it } from 'vitest';
import { DefaultQuestionFinalizer } from '../src/game/finalizer.js';
import type { FinalizerSender } from '../src/telegram/finalizer-sender.js';
import { buildResultsMessage } from '../src/content/results.js';
import { calculateResults } from '../src/game/stats.js';
import { makeLogger, makePoll, makeQuestion, makeTempStore, type TempStore } from './helpers.js';
import type { AnswerRecord } from '../src/game/answer.js';

const tempStores: TempStore[] = [];

afterEach(async () => {
  for (const t of tempStores.splice(0)) await t.cleanup();
});

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

describe('finalizer', () => {
  it('завершает вопрос и публикует итоги один раз', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    const question = makeQuestion();
    const poll = makePoll();
    await t.store.questions.insert(question);
    await t.store.polls.insert(poll);
    const answers: AnswerRecord[] = [
      {
        id: 'telegram-poll-1:1',
        userId: '1',
        chatId: '-100123',
        questionId: 'event_000001',
        telegramPollId: 'telegram-poll-1',
        selectedOption: 'C',
        isCorrect: true,
        answeredAt: '2026-01-01T00:00:10.000Z',
        reactionTimeMs: 10_000,
        points: 3,
        isRepeat: false,
        updateId: 1,
      },
      {
        id: 'telegram-poll-1:2',
        userId: '2',
        chatId: '-100123',
        questionId: 'event_000001',
        telegramPollId: 'telegram-poll-1',
        selectedOption: 'A',
        isCorrect: false,
        answeredAt: '2026-01-01T00:00:20.000Z',
        reactionTimeMs: 20_000,
        points: 0,
        isRepeat: false,
        updateId: 2,
      },
    ];
    for (const a of answers) await t.store.answers.insert(a);

    const { sender, calls } = makeSender();
    const finalizer = new DefaultQuestionFinalizer({
      logger: makeLogger(),
      store: t.store,
      sender,
    });

    await finalizer.finalize(poll);
    await finalizer.finalize(poll);

    expect(calls.close).toBe(1);
    expect(calls.messages).toBe(1);
    expect(calls.lastText).toContain('🏁 Итоги');
    expect(calls.lastText).toContain('Ответили: 2');
    expect(calls.lastText).toContain('✅ Правильно: 1');
    expect(calls.lastText).toContain('Объяснение правильного ответа');

    const stored = await t.store.polls.get(poll.id);
    expect(stored?.status).toBe('completed');
  });
});

describe('results message', () => {
  it('содержит статистику, объяснение и слоган', () => {
    const question = makeQuestion();
    const results = calculateResults([
      {
        id: 'r1',
        userId: '1',
        chatId: '-100123',
        questionId: 'event_000001',
        telegramPollId: 'telegram-poll-1',
        selectedOption: 'C',
        isCorrect: true,
        answeredAt: '2026-01-01T00:00:10.000Z',
        reactionTimeMs: 10_000,
        points: 3,
        isRepeat: false,
        updateId: 1,
      },
    ]);

    const text = buildResultsMessage({
      question,
      results,
      users: new Map(),
      slogan: '«История решила иначе.»',
    });

    expect(text).toContain('Точность: 100.0%');
    expect(text).toContain('⚡ Самый быстрый правильный ответ:');
    expect(text).toContain('10.0 сек');
    expect(text).toContain('Варианты:');
    expect(text).toContain('«История решила иначе.»');
  });
});
