import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DefaultScheduler, type PollPublisher, type PollFinalizer } from '../src/scheduler/scheduler.js';
import type { ChatConfig } from '../src/types/index.js';
import type { PollRecord } from '../src/game/poll.js';
import type { ChatRecord } from '../src/game/chat.js';
import type { DataStore } from '../src/storage/data-store.js';
import { makeLogger, makeTempStore, type TempStore } from './helpers.js';

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
    timezoneOffsetMinutes: 180,
    finalization: 'ai',
    subscription: false,
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
    optionMap: [0, 1, 2, 3],
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
  let t: TempStore;

  beforeEach(async () => {
    t = await makeTempStore();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it('публикует вопрос для свежего чата после начальной задержки', async () => {
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
  });

  it('закрывает истёкший poll при восстановлении', async () => {
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
  });

  it('ошибка финализации не зависает чат: повтор через retryDelayMs', async () => {
    await t.store.chats.insert(makeChat('-100123'));
    await t.store.polls.insert(makeActivePoll('-100123', { id: 'stuck', expiresInMs: -5000 }));
    const { publisher } = makePublisher(t.store, []);
    const finalized: string[] = [];
    const finalizer: PollFinalizer = {
      async finalize(poll) {
        finalized.push(poll.id);
        if (finalized.length === 1) throw new Error('boom');
        await t.store.polls.update(poll.id, { status: 'completed' });
      },
    };

    const scheduler = new DefaultScheduler({
      logger: makeLogger(),
      store: t.store,
      publisher,
      finalizer,
      retryDelayMs: 50,
    });
    await scheduler.start();

    await sleep(250);
    expect(finalized).toEqual(['stuck', 'stuck']);
    expect((await t.store.polls.get('stuck'))?.status).toBe('completed');
    expect(await scheduler.getNextPublishAt('-100123')).not.toBeNull();

    await scheduler.stop();
  });

  it('восстанавливает таймер активного poll и завершает по истечении', async () => {
    await t.store.polls.insert(makeActivePoll('-100123', { id: 'future', expiresInMs: 1500 }));
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
    await sleep(1700);
    expect(finalized).toEqual(['future']);

    await scheduler.stop();
  });

  it('планирует повторную попытку, если вопросов нет', async () => {
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
  });

  it('не публикует для отключённого чата', async () => {
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
  });

  it('ошибка публикации (удалённый чат) не роняет scheduler и планирует повтор', async () => {
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
  });

  it('getNextPublishAt возвращает время публикации по таймеру', async () => {
    await t.store.chats.insert(makeChat('-100123'));
    const { publisher } = makePublisher(t.store, []);
    const { finalizer } = makeFinalizer(t.store);

    const now = 1_000_000;
    const scheduler = new DefaultScheduler({
      logger: makeLogger(),
      store: t.store,
      publisher,
      finalizer,
      now: () => now,
      freshChatDelayMs: 3_600_000,
    });
    await scheduler.start();
    await scheduler.scheduleChat('-100123');

    expect(await scheduler.getNextPublishAt('-100123')).toBe(now + 3_600_000);

    await scheduler.stop();
  });

  it('ensureScheduled не пересоздаёт существующий таймер', async () => {
    await t.store.chats.insert(makeChat('-100123'));
    const { publisher } = makePublisher(t.store, []);
    const { finalizer } = makeFinalizer(t.store);

    const now = 1_000_000;
    const scheduler = new DefaultScheduler({
      logger: makeLogger(),
      store: t.store,
      publisher,
      finalizer,
      now: () => now,
      freshChatDelayMs: 3_600_000,
    });
    await scheduler.start();
    await scheduler.scheduleChat('-100123');

    const before = await scheduler.getNextPublishAt('-100123');
    await scheduler.ensureScheduled('-100123');
    const after = await scheduler.getNextPublishAt('-100123');

    expect(after).toBe(before);
    expect(scheduler.getTimersInfo().publishTimers).toBe(1);

    await scheduler.stop();
  });

  it('ensureScheduled создаёт таймер, если его нет', async () => {
    await t.store.chats.insert(makeChat('-100123', { enabled: false }));
    const { publisher } = makePublisher(t.store, []);
    const { finalizer } = makeFinalizer(t.store);

    const now = 1_000_000;
    const scheduler = new DefaultScheduler({
      logger: makeLogger(),
      store: t.store,
      publisher,
      finalizer,
      now: () => now,
      freshChatDelayMs: 3_600_000,
    });
    await scheduler.start();

    expect(await scheduler.getNextPublishAt('-100123')).toBeNull();
    await t.store.chats.update('-100123', { enabled: true });
    await scheduler.ensureScheduled('-100123');

    expect(await scheduler.getNextPublishAt('-100123')).toBe(now + 3_600_000);
    expect(scheduler.getTimersInfo().publishTimers).toBe(1);

    await scheduler.stop();
  });

  it('getNextPublishAt при активном опросе возвращает expiresAt + интервал', async () => {
    await t.store.chats.insert(makeChat('-100123'));
    await t.store.polls.insert(makeActivePoll('-100123', { id: 'p', expiresInMs: 60_000 }));
    const { publisher } = makePublisher(t.store, []);
    const { finalizer } = makeFinalizer(t.store);

    const scheduler = new DefaultScheduler({
      logger: makeLogger(),
      store: t.store,
      publisher,
      finalizer,
      now: () => Date.now(),
    });
    await scheduler.start();

    const poll = (await t.store.polls.get('p'))!;
    expect(await scheduler.getNextPublishAt('-100123')).toBe(Date.parse(poll.expiresAt) + 7200 * 1000);

    await scheduler.stop();
  });

  it('getNextPublishAt возвращает null для отключённого чата', async () => {
    await t.store.chats.insert(makeChat('-100123', { enabled: false }));
    const { publisher } = makePublisher(t.store, []);
    const { finalizer } = makeFinalizer(t.store);

    const scheduler = new DefaultScheduler({
      logger: makeLogger(),
      store: t.store,
      publisher,
      finalizer,
      freshChatDelayMs: 3_600_000,
    });
    await scheduler.start();

    expect(await scheduler.getNextPublishAt('-100123')).toBeNull();

    await scheduler.stop();
  });
});
