import { afterEach, describe, expect, it, vi } from 'vitest';
import { Telegram } from 'telegraf';
import { registerConfigCommands } from '../src/bot/config-commands.js';
import { MESSAGES } from '../src/content/messages.js';
import { makeBotHarness, makeChatRecord, makeLogger, commandUpdate, type BotHarness } from './helpers.js';

const ADMIN_ID = 42;

function lastReply(h: BotHarness): string {
  const calls = h.sendMessage.mock.calls;
  const last = calls[calls.length - 1];
  return typeof last?.[1] === 'string' ? last[1] : '';
}

describe('config-commands', () => {
  let h: BotHarness;

  afterEach(async () => {
    await h.cleanup();
  });

  async function setup(): Promise<BotHarness> {
    const harness = await makeBotHarness();
    await harness.store.chats.insert(makeChatRecord('-100123'));
    const onChatChanged = vi.fn().mockResolvedValue(undefined);
    registerConfigCommands(harness.bot, {
      logger: makeLogger(),
      store: harness.store,
      adminId: ADMIN_ID,
      onChatChanged,
    });
    return harness;
  }

  it('/set_answer_window обновляет конфигурацию', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_answer_window 3600', { fromId: ADMIN_ID }));
    expect((await h.store.chats.get('-100123'))?.answerWindow).toBe(3600);
    expect(lastReply(h)).toContain('answerWindow');
  });

  it('/set_answer_window суперадмин ставит меньше 60 сек', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_answer_window 30', { fromId: ADMIN_ID }));
    expect((await h.store.chats.get('-100123'))?.answerWindow).toBe(30);
    expect(lastReply(h)).toContain('answerWindow');
  });

  it('/set_answer_window суперадмин не может поставить 0', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_answer_window 0', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toBe(MESSAGES.invalidSeconds('/set_answer_window 3600', 1));
    expect((await h.store.chats.get('-100123'))?.answerWindow).toBe(3600);
  });

  it('/set_answer_window меньше 60 сек отклоняется у админа группы', async () => {
    h = await setup();
    vi.mocked(Telegram.prototype.callApi).mockImplementation(((
      method: string,
      payload: Record<string, unknown>,
    ) => {
      if (method === 'getChatAdministrators') {
        return Promise.resolve([{ user: { id: 999, is_bot: false, first_name: 'Admin' }, status: 'administrator' }]);
      }
      if (method === 'sendMessage') {
        h.sendMessage(payload.chat_id, payload.text, payload);
        return Promise.resolve({ message_id: 1 });
      }
      return Promise.resolve({});
    }) as never);

    await h.bot.handleUpdate(commandUpdate('/set_answer_window 30', { fromId: 999 }));
    expect(lastReply(h)).toBe(MESSAGES.invalidSeconds('/set_answer_window 3600', 60));
    expect((await h.store.chats.get('-100123'))?.answerWindow).toBe(3600);
  });

  it('/set_interval обновляет конфигурацию', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_interval 7200', { fromId: ADMIN_ID }));
    expect((await h.store.chats.get('-100123'))?.questionInterval).toBe(7200);
    expect(lastReply(h)).toContain('questionInterval');
  });

  it('/set_interval суперадмин ставит меньше 60 сек', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_interval 10', { fromId: ADMIN_ID }));
    expect((await h.store.chats.get('-100123'))?.questionInterval).toBe(10);
    expect(lastReply(h)).toContain('questionInterval');
  });

  it('/set_interval меньше 60 сек отклоняется у админа группы', async () => {
    h = await setup();
    vi.mocked(Telegram.prototype.callApi).mockImplementation(((
      method: string,
      payload: Record<string, unknown>,
    ) => {
      if (method === 'getChatAdministrators') {
        return Promise.resolve([{ user: { id: 999, is_bot: false, first_name: 'Admin' }, status: 'administrator' }]);
      }
      if (method === 'sendMessage') {
        h.sendMessage(payload.chat_id, payload.text, payload);
        return Promise.resolve({ message_id: 1 });
      }
      return Promise.resolve({});
    }) as never);

    await h.bot.handleUpdate(commandUpdate('/set_interval 30', { fromId: 999 }));
    expect(lastReply(h)).toBe(MESSAGES.invalidSeconds('/set_interval 7200', 60));
    expect((await h.store.chats.get('-100123'))?.questionInterval).toBe(7200);
  });

  it('/set_types обновляет типы', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_types culture_next_event,geography_next_event', { fromId: ADMIN_ID }));
    expect((await h.store.chats.get('-100123'))?.questionTypes).toEqual([
      'culture_next_event',
      'geography_next_event',
    ]);
    expect(lastReply(h)).toContain('culture_next_event');
  });

  it('/set_types с неизвестным типом отклоняется', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_types bogus_type', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toContain('Неизвестный тип вопроса');
    expect((await h.store.chats.get('-100123'))?.questionTypes).toEqual(['historical_next_event']);
  });

  it('/set_difficulty обновляет диапазон', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_difficulty 1 5', { fromId: ADMIN_ID }));
    const chat = (await h.store.chats.get('-100123'))!;
    expect(chat.difficultyMin).toBe(1);
    expect(chat.difficultyMax).toBe(5);
    expect(lastReply(h)).toContain('difficulty');
  });

  it('/set_difficulty с неверным диапазоном отклоняется', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_difficulty 6 2', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toBe(MESSAGES.invalidDifficultyRange);
  });

  it('/set_timezone обновляет часовой пояс', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_timezone -5', { fromId: ADMIN_ID }));
    expect((await h.store.chats.get('-100123'))?.timezoneOffsetMinutes).toBe(-300);
    expect(lastReply(h)).toContain('UTC-5');
  });

  it('/set_timezone с неверным значением отклоняется', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_timezone +99', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toBe(MESSAGES.invalidTimeZone);
  });

  it('/set_finalization ai обновляет режим', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_finalization ai', { fromId: ADMIN_ID }));
    expect((await h.store.chats.get('-100123'))?.finalization).toBe('ai');
    expect(lastReply(h)).toContain('AI-ведущий');
  });

  it('/set_finalization static обновляет режим', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_finalization static', { fromId: ADMIN_ID }));
    expect((await h.store.chats.get('-100123'))?.finalization).toBe('static');
    expect(lastReply(h)).toContain('статичная карточка');
  });

  it('/set_finalization с неизвестным значением отклоняется', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_finalization bogus', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toBe(MESSAGES.invalidFinalization);
    expect((await h.store.chats.get('-100123'))?.finalization).toBeUndefined();
  });

  it('не-админ не может менять конфигурацию', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_answer_window 3600', { fromId: 999 }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
    expect((await h.store.chats.get('-100123'))?.answerWindow).toBe(3600);
  });

  it('/set_finalization отклоняет не-админа', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_finalization static', { fromId: 999 }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
  });

  it('/set_quiet_hours включает тихие часы', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_quiet_hours 23:00 09:00', { fromId: ADMIN_ID }));
    const chat = (await h.store.chats.get('-100123'))!;
    expect(chat.quietHoursEnabled).toBe(true);
    expect(chat.quietHoursStart).toBe(1380);
    expect(chat.quietHoursEnd).toBe(540);
    expect(lastReply(h)).toBe(MESSAGES.quietHoursSet('23:00–09:00'));
  });

  it('/set_quiet_hours off выключает тихие часы', async () => {
    h = await setup();
    await h.store.chats.update('-100123', {
      quietHoursEnabled: true,
      quietHoursStart: 1380,
      quietHoursEnd: 540,
    });
    await h.bot.handleUpdate(commandUpdate('/set_quiet_hours off', { fromId: ADMIN_ID }));
    const chat = (await h.store.chats.get('-100123'))!;
    expect(chat.quietHoursEnabled).toBe(false);
    expect(lastReply(h)).toBe(MESSAGES.quietHoursOff);
  });

  it('/set_quiet_hours с неверным форматом отклоняется', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_quiet_hours 25:00 09:00', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toBe(MESSAGES.invalidQuietHours);
    expect((await h.store.chats.get('-100123'))?.quietHoursEnabled).toBe(false);
  });

  it('/set_quiet_hours с равными временами отклоняется', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_quiet_hours 08:00 08:00', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toBe(MESSAGES.invalidQuietHours);
  });

  it('/set_quiet_hours отклоняет не-админа', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_quiet_hours 23:00 09:00', { fromId: 999 }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
    expect((await h.store.chats.get('-100123'))?.quietHoursEnabled).toBe(false);
  });
});
