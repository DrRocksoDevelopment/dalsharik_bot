import { describe, expect, it } from 'vitest';
import { DefaultScheduler, type PollPublisher, type PollFinalizer } from '../src/scheduler/scheduler.js';
import type { ChatConfig } from '../src/types/index.js';
import type { PollRecord } from '../src/game/poll.js';
import type { ChatRecord } from '../src/game/chat.js';
import type { DataStore } from '../src/storage/data-store.js';
import { makeLogger, makeTempStore } from './helpers.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makeChat(chatId: string, overrides: Partial<ChatConfig> = {}): ChatRecord {
  return {
    id: chatId,
    chatId,
    enabled: true,
    answerWindow: 3600,
    questionInterval: 7200,
    questionTypes: ['historical_next_event'],
    categories: ['history'],
    difficultyMin: 1,
    difficultyMax: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeActivePoll(
  chatId: string,
  opts: { id?: string; expiresInMs?: number } = {},
): PollRecord {
  const now = Date.now();
  return {
    id: opts.id ?? 'poll-1',
    telegramPollId: `tg-${opts.id ?? 'poll-1'}`,
    chatId,
    questionId: 'event_000001',
    messageId: 1,
    optionMap: ['A', 'B', 'C', 'D'],
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (opts.expiresInMs ?? 60_000)).toISOString(),
    status: 'active',
  };
}

function makePublisher(store: DataStore, records: PollRecord[] = []) {
  const published: ChatConfig[] = [];
  const publisher: PollPublisher = {
    async publish(chat) {
      published.push(chat);
      const idx = published.length - 1;
      const poll = records[idx] ?? null;
      if (poll) {
        await store.polls.insert({ ...poll, chatId: chat.chatId });
      }
      return poll;
    },
  };
  return { publisher, published };
}

function makeFinalizer(store: DataStore) {
  const finalized: string[] = [];
  const finalizer: PollFinalizer = {
    async finalize(poll) {
      finalized.push(poll.id);
      await store.polls.update(poll.id, { status: 'completed' });
    },
  };
  return { finalizer, finalized };
}

describe('scheduler', () => {
  it('публикует вопрос для свежего чата после начальной задержки', async () => {
    const t = await makeTempStore();
    await t.store.chats.insert(makeChat('-100123'));
    const poll = makeActivePoll('-100123', { expiresInMs: 60_000 });
    const { publisher, published } = makePublisher(t.store, [poll]);
    const { finalizer } = makeFinalizer(t.store);

    const scheduler = new DefaultScheduler({
      logger: makeLogger(),
      store: t.store,
      publisher,
      finalizer,
      freshChatDelayMs: 20,
    });
    await scheduler.start();

    await sleep(120);
    expect(published).toHaveLength(1);
    const stored = await t.store.polls.find((p) => p.chatId === '-100123');
    expect(stored).toHaveLength(1);

    await scheduler.stop();
    await t.cleanup();
  });

  it('закрывает истёкший poll при восстановлении', async () => {
    const t = await makeTempStore();
    await t.store.chats.insert(makeChat('-100123'));
    await t.store.polls.insert(makeActivePoll('-100123', { id: 'expired', expiresInMs: -5000 }));
    const { publisher } = makePublisher(t.store, []);
    const { finalizer, finalized } = makeFinalizer(t.store);

    const scheduler = new DefaultScheduler({
      logger: makeLogger(),
      store: t.store,
      publisher,
      finalizer,
    });
    await scheduler.start();

    expect(finalized).toEqual(['expired']);
    const stored = await t.store.polls.get('expired');
    expect(stored?.status).toBe('completed');

    await scheduler.stop();
    await t.cleanup();
  });

  it('восстанавливает таймер активного poll и завершает по истечении', async () => {
    const t = await makeTempStore();
    await t.store.chats.insert(makeChat('-100123'));
    await t.store.polls.insert(makeActivePoll('-100123', { id: 'future', expiresInMs: 60 }));
    const { publisher } = makePublisher(t.store, []);
    const { finalizer, finalized } = makeFinalizer(t.store);

    const scheduler = new DefaultScheduler({
      logger: makeLogger(),
      store: t.store,
      publisher,
      finalizer,
    });
    await scheduler.start();

    expect(finalized).toHaveLength(0);
    await sleep(150);
    expect(finalized).toEqual(['future']);

    await scheduler.stop();
    await t.cleanup();
  });

  it('планирует повторную попытку, если вопросов нет', async () => {
    const t = await makeTempStore();
    await t.store.chats.insert(makeChat('-100123'));
    const { publisher, published } = makePublisher(t.store, []);
    const { finalizer } = makeFinalizer(t.store);

    const scheduler = new DefaultScheduler({
      logger: makeLogger(),
      store: t.store,
      publisher,
      finalizer,
      freshChatDelayMs: 20,
      retryDelayMs: 30,
    });
    await scheduler.start();

    await sleep(120);
    expect(published.length).toBeGreaterThanOrEqual(2);

    await scheduler.stop();
    await t.cleanup();
  });

  it('не публикует для отключённого чата', async () => {
    const t = await makeTempStore();
    await t.store.chats.insert(makeChat('-100123', { enabled: false }));
    const { publisher, published } = makePublisher(t.store, [makeActivePoll('-100123')]);
    const { finalizer } = makeFinalizer(t.store);

    const scheduler = new DefaultScheduler({
      logger: makeLogger(),
      store: t.store,
      publisher,
      finalizer,
      freshChatDelayMs: 20,
    });
    await scheduler.start();

    await sleep(120);
    expect(published).toHaveLength(0);

    await scheduler.stop();
    await t.cleanup();
  });

  it('ошибка публикации (удалённый чат) не роняет scheduler и планирует повтор', async () => {
    const t = await makeTempStore();
    await t.store.chats.insert(makeChat('-100123'));
    let attempts = 0;
    const publisher: PollPublisher = {
      async publish() {
        attempts += 1;
        throw new Error('chat not found');
      },
    };
    const { finalizer } = makeFinalizer(t.store);

    const scheduler = new DefaultScheduler({
      logger: makeLogger(),
      store: t.store,
      publisher,
      finalizer,
      freshChatDelayMs: 20,
      retryDelayMs: 30,
    });
    await scheduler.start();

    await sleep(160);
    expect(attempts).toBeGreaterThanOrEqual(2);

    await scheduler.stop();
    await t.cleanup();
  });
});
