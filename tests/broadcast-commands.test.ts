import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBroadcastCommand } from '../src/bot/broadcast-commands.js';
import { MESSAGES } from '../src/content/messages.js';
import { makeBotHarness, makeLogger, commandUpdate, makeChatRecord, type BotHarness } from './helpers.js';

const ADMIN_ID = 42;

function lastReply(h: BotHarness): string {
  const calls = h.sendMessage.mock.calls;
  const last = calls[calls.length - 1];
  return typeof last?.[1] === 'string' ? last[1] : '';
}

describe('broadcast-commands', () => {
  let h: BotHarness;

  afterEach(async () => {
    await h.cleanup();
  });

  async function setup(chats: string[], opts: { delayMs?: number } = {}) {
    h = await makeBotHarness();
    for (const chatId of chats) {
      await h.store.chats.insert(makeChatRecord(chatId));
    }
    registerBroadcastCommand(h.bot, {
      logger: makeLogger(),
      adminId: ADMIN_ID,
      store: h.store,
      delayMs: opts.delayMs ?? 0,
    });
    return h;
  }

  it('/broadcast доступен только суперадмину', async () => {
    await setup([]);
    await h.bot.handleUpdate(commandUpdate('/broadcast всем привет', { fromId: 999 }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
    expect(h.sendMessage.mock.calls.some(([chatId]) => chatId === '-1001')).toBe(false);
  });

  it('/broadcast без текста показывает usage', async () => {
    await setup([]);
    await h.bot.handleUpdate(commandUpdate('/broadcast', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toBe(MESSAGES.broadcastUsage);
  });

  it('/broadcast без чатов показывает пустоту', async () => {
    await setup([]);
    await h.bot.handleUpdate(commandUpdate('/broadcast всем привет', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toBe(MESSAGES.broadcastEmpty);
  });

  it('рассылает текст во все включённые чаты', async () => {
    await setup(['-1001', '-1002', '-1003']);
    await h.bot.handleUpdate(commandUpdate('/broadcast всем привет', { fromId: ADMIN_ID }));

    for (const chatId of ['-1001', '-1002', '-1003']) {
      expect(
        h.sendMessage.mock.calls.some(([c, text]) => c === chatId && text === 'всем привет'),
      ).toBe(true);
    }
    expect(lastReply(h)).toContain('доставлено в 3');
  });

  it('пропускает отключённые чаты', async () => {
    h = await makeBotHarness();
    await h.store.chats.insert(makeChatRecord('-1001'));
    await h.store.chats.insert(makeChatRecord('-1002', { enabled: false }));
    registerBroadcastCommand(h.bot, {
      logger: makeLogger(),
      adminId: ADMIN_ID,
      store: h.store,
      delayMs: 0,
    });

    await h.bot.handleUpdate(commandUpdate('/broadcast всем привет', { fromId: ADMIN_ID }));

    expect(
      h.sendMessage.mock.calls.some(([c, text]) => c === '-1001' && text === 'всем привет'),
    ).toBe(true);
    expect(h.sendMessage.mock.calls.some(([c]) => c === '-1002')).toBe(false);
    expect(lastReply(h)).toContain('доставлено в 1');
  });

  it('ошибка в одном чате не прерывает рассылку и попадает в отчёт', async () => {
    h = await makeBotHarness();
    await h.store.chats.insert(makeChatRecord('-1001'));
    await h.store.chats.insert(makeChatRecord('-1002'));
    await h.store.chats.insert(makeChatRecord('-1003'));
    const sendMessage = vi.fn(async (chatId: string, text: string) => {
      if (chatId === '-1002') throw new Error('boom');
    });
    registerBroadcastCommand(h.bot, {
      logger: makeLogger(),
      adminId: ADMIN_ID,
      store: h.store,
      sendMessage,
      delayMs: 0,
    });

    await h.bot.handleUpdate(commandUpdate('/broadcast всем привет', { fromId: ADMIN_ID }));

    expect(sendMessage.mock.calls.map((c) => c[0])).toEqual(['-1001', '-1002', '-1003']);
    expect(lastReply(h)).toContain('доставлено в 2');
    expect(lastReply(h)).toContain('Не удалось: 1');
  });

  it('учитывает @имя бота после команды', async () => {
    await setup(['-1001']);
    await h.bot.handleUpdate(
      commandUpdate('/broadcast@dalsharik_test_bot всем привет', { fromId: ADMIN_ID }),
    );

    expect(
      h.sendMessage.mock.calls.some(([c, text]) => c === '-1001' && text === 'всем привет'),
    ).toBe(true);
  });
});
