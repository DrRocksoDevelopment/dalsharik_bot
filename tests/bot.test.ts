import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBot } from '../src/bot/bot.js';
import { MESSAGES } from '../src/content/messages.js';
import { makeBotHarness, makeChatRecord, makeLogger, commandUpdate, type BotHarness } from './helpers.js';

const ADMIN_ID = 42;

function lastReply(h: BotHarness): string {
  const calls = h.sendMessage.mock.calls;
  const last = calls[calls.length - 1];
  return typeof last?.[1] === 'string' ? last[1] : '';
}

describe('bot', () => {
  let h: BotHarness;

  afterEach(async () => {
    await h.cleanup();
  });

  it('/start в приватном чате отклоняется', async () => {
    h = await makeBotHarness();
    createBot('test:token', { logger: makeLogger(), store: h.store, adminId: ADMIN_ID }, h.bot);
    await h.bot.handleUpdate(commandUpdate('/start', { chatType: 'private' }));
    expect(lastReply(h)).toContain('работает в группах');
    expect(await h.store.chats.getAll()).toHaveLength(0);
  });

  it('/start суперадмином создаёт чат и приветствует', async () => {
    h = await makeBotHarness();
    const onChatChanged = vi.fn().mockResolvedValue(undefined);
    createBot('test:token', { logger: makeLogger(), store: h.store, adminId: ADMIN_ID, onChatChanged }, h.bot);
    await h.bot.handleUpdate(commandUpdate('/start', { fromId: ADMIN_ID }));
    expect(await h.store.chats.getAll()).toHaveLength(1);
    expect(onChatChanged).toHaveBeenCalledWith('-100123');
    expect(lastReply(h)).toContain('Привет');
  });

  it('/start повторно отвечает временем следующего вопроса', async () => {
    h = await makeBotHarness();
    await h.store.chats.insert(makeChatRecord('-100123'));
    const ensureScheduled = vi.fn().mockResolvedValue(undefined);
    const nextPublishAt = vi.fn().mockResolvedValue(Date.now() + 3_600_000);
    createBot('test:token', { logger: makeLogger(), store: h.store, adminId: ADMIN_ID, ensureScheduled, nextPublishAt }, h.bot);
    await h.bot.handleUpdate(commandUpdate('/start', { fromId: ADMIN_ID }));
    expect(ensureScheduled).toHaveBeenCalledWith('-100123');
    expect(lastReply(h)).toContain('Следующий вопрос — в');
  });

  it('/start не-админом отклоняется', async () => {
    h = await makeBotHarness();
    createBot('test:token', { logger: makeLogger(), store: h.store, adminId: ADMIN_ID }, h.bot);
    await h.bot.handleUpdate(commandUpdate('/start', { fromId: 999 }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
  });

  it('/stop отключает чат', async () => {
    h = await makeBotHarness();
    await h.store.chats.insert(makeChatRecord('-100123'));
    const onChatChanged = vi.fn().mockResolvedValue(undefined);
    createBot('test:token', { logger: makeLogger(), store: h.store, adminId: ADMIN_ID, onChatChanged }, h.bot);
    await h.bot.handleUpdate(commandUpdate('/stop', { fromId: ADMIN_ID }));
    expect((await h.store.chats.get('-100123'))?.enabled).toBe(false);
    expect(onChatChanged).toHaveBeenCalledWith('-100123');
    expect(lastReply(h)).toBe(MESSAGES.stop);
  });

  it('/stop не-админом отклоняется', async () => {
    h = await makeBotHarness();
    await h.store.chats.insert(makeChatRecord('-100123'));
    createBot('test:token', { logger: makeLogger(), store: h.store, adminId: ADMIN_ID }, h.bot);
    await h.bot.handleUpdate(commandUpdate('/stop', { fromId: 999 }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
  });

  it('/help отвечает справкой', async () => {
    h = await makeBotHarness();
    createBot('test:token', { logger: makeLogger(), store: h.store, adminId: ADMIN_ID }, h.bot);
    await h.bot.handleUpdate(commandUpdate('/help'));
    expect(lastReply(h)).toContain('/help');
    expect(lastReply(h)).toContain('/stats');
  });

  it('/config доступен только суперадмину', async () => {
    h = await makeBotHarness();
    createBot('test:token', { logger: makeLogger(), store: h.store, adminId: ADMIN_ID }, h.bot);
    await h.bot.handleUpdate(commandUpdate('/config', { fromId: 999 }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
  });

  it('/config экранирует HTML в конфигурации', async () => {
    h = await makeBotHarness();
    await h.store.chats.insert(makeChatRecord('-100123', {
      note: '<script>alert(1)</script>',
    } as never));
    createBot('test:token', { logger: makeLogger(), store: h.store, adminId: ADMIN_ID }, h.bot);
    await h.bot.handleUpdate(commandUpdate('/config', { fromId: ADMIN_ID }));

    const calls = h.sendMessage.mock.calls;
    const last = calls[calls.length - 1]!;
    const text = last[1] as string;
    expect(text).not.toContain('<script>');
    expect(text).toContain('&lt;script&gt;');
    expect(text).toContain('<pre>');
    expect(last[2]).toMatchObject({ parse_mode: 'HTML' });
  });

  it('poll_answer передаётся в обработчик', async () => {
    h = await makeBotHarness();
    const pollAnswerHandler = vi.fn().mockResolvedValue(undefined);
    createBot('test:token', { logger: makeLogger(), store: h.store, adminId: ADMIN_ID, pollAnswerHandler }, h.bot);
    await h.bot.handleUpdate({
      update_id: 3,
      poll_answer: {
        poll_id: 'poll-1',
        user: { id: ADMIN_ID, is_bot: false, first_name: 'Test' },
        option_ids: [2],
      },
    } as never);

    expect(pollAnswerHandler).toHaveBeenCalledTimes(1);
    const [answer, updateId] = pollAnswerHandler.mock.calls[0]!;
    expect(answer.poll_id).toBe('poll-1');
    expect(answer.user.id).toBe(ADMIN_ID);
    expect(updateId).toBe(3);
  });

  it('ошибка в poll_answer обработчике логируется, но не роняет бота', async () => {
    h = await makeBotHarness();
    const logger = makeLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    createBot('test:token', { logger, store: h.store, adminId: ADMIN_ID, pollAnswerHandler: vi.fn().mockRejectedValue(new Error('boom')) }, h.bot);

    await expect(h.bot.handleUpdate({
      update_id: 3,
      poll_answer: {
        poll_id: 'poll-1',
        user: { id: ADMIN_ID, is_bot: false, first_name: 'Test' },
        option_ids: [0],
      },
    } as never)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith('Ошибка обработки poll_answer', expect.objectContaining({ error: 'boom' }));
  });

  it('ошибка в команде попадает в bot.catch и логируется', async () => {
    h = await makeBotHarness();
    const logger = makeLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    createBot('test:token', { logger, store: h.store, adminId: ADMIN_ID }, h.bot);

    vi.spyOn(h.store.chats, 'get').mockRejectedValueOnce(new Error('storage down'));
    await h.bot.handleUpdate(commandUpdate('/config', { fromId: ADMIN_ID }));

    expect(errorSpy).toHaveBeenCalledWith('Ошибка обработки update', expect.objectContaining({ error: 'storage down' }));
  });
});
