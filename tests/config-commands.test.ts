import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('/set_answer_window с задержкой меньше 60 сек отклоняется', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_answer_window 30', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toBe(MESSAGES.invalidValue('/set_answer_window 3600'));
    expect((await h.store.chats.get('-100123'))?.answerWindow).toBe(3600);
  });

  it('/set_interval обновляет конфигурацию', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/set_interval 7200', { fromId: ADMIN_ID }));
    expect((await h.store.chats.get('-100123'))?.questionInterval).toBe(7200);
    expect(lastReply(h)).toContain('questionInterval');
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
});
