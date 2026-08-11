import { afterEach, describe, expect, it } from 'vitest';
import { DefaultQuestionPublisher } from '../src/game/publisher.js';
import { InMemoryQuestionEngine } from '../src/game/question-engine.js';
import { defaultChatConfig } from '../src/types/index.js';
import type { PollSender, PollPayload } from '../src/telegram/poll-sender.js';
import { makeLogger, makeQuestion, makeTempStore, type TempStore } from './helpers.js';

const tempStores: TempStore[] = [];

afterEach(async () => {
  for (const t of tempStores.splice(0)) await t.cleanup();
});

function makeSender(record: { lastPayload: PollPayload | null }): PollSender {
  return {
    async sendPoll(payload) {
      record.lastPayload = payload;
      return { messageId: 100, pollId: 'telegram-poll-1' };
    },
  };
}

describe('publisher', () => {
  it('публикует poll и сохраняет связь poll→question', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    const question = makeQuestion();
    await t.store.questions.insert(question);
    const recorded: { lastPayload: PollPayload | null } = { lastPayload: null };
    const publisher = new DefaultQuestionPublisher({
      logger: makeLogger(),
      store: t.store,
      engine: new InMemoryQuestionEngine([question]),
      sender: makeSender(recorded),
      now: () => 1_700_000_000_000,
    });

    const poll = await publisher.publish(defaultChatConfig('-100123'));

    expect(poll).not.toBeNull();
    expect(poll!.questionId).toBe('event_000001');
    expect(poll!.optionMap).toHaveLength(4);
    expect(new Set(poll!.optionMap)).toEqual(new Set(['A', 'B', 'C', 'D']));

    expect(recorded.lastPayload).not.toBeNull();
    expect(recorded.lastPayload!.options).toHaveLength(4);
    expect(recorded.lastPayload!.text).toContain('Что произошло дальше?');
    expect(recorded.lastPayload).not.toHaveProperty('correctOptionId');
    expect(recorded.lastPayload).not.toHaveProperty('explanation');

    const stored = await t.store.polls.get(poll!.id);
    expect(stored?.telegramPollId).toBe('telegram-poll-1');

    const history = await t.store.questionHistory.find((h) => h.chatId === '-100123');
    expect(history).toHaveLength(1);
    expect(history[0]!.questionId).toBe('event_000001');
  });

  it('повторно публикует вопрос после исчерпания окна ротации', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    const question = makeQuestion();
    await t.store.questions.insert(question);
    await t.store.questionHistory.insert({
      id: '-100123:event_000001:2026-01-01T00:00:00.000Z',
      chatId: '-100123',
      questionId: 'event_000001',
      publishedAt: '2026-01-01T00:00:00.000Z',
    });
    const publisher = new DefaultQuestionPublisher({
      logger: makeLogger(),
      store: t.store,
      engine: new InMemoryQuestionEngine([question]),
      sender: makeSender({ lastPayload: null }),
      now: () => 1_700_000_000_000,
    });

    const poll = await publisher.publish(defaultChatConfig('-100123'));
    expect(poll).not.toBeNull();
    expect(poll!.questionId).toBe('event_000001');

    const history = await t.store.questionHistory.find((h) => h.chatId === '-100123');
    expect(history).toHaveLength(2);
  });
});
