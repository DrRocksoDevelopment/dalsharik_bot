import { afterEach, describe, expect, it } from 'vitest';
import { TelegramTransport } from '../src/logging/telegram-transport.js';
import { makeBotHarness, type BotHarness } from './helpers.js';

const nextTick = () => new Promise<void>((r) => setImmediate(r));

function log(transport: TelegramTransport, level: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    transport.log({ level, message }, () => resolve());
  });
}

function lastText(h: BotHarness): string | undefined {
  const calls = h.sendMessage.mock.calls;
  const last = calls[calls.length - 1];
  return typeof last?.[1] === 'string' ? last[1] : undefined;
}

describe('TelegramTransport', () => {
  let h: BotHarness;

  afterEach(async () => {
    await h.cleanup();
  });

  it('отправляет сообщения уровня error', async () => {
    h = await makeBotHarness();
    const transport = new TelegramTransport({ bot: h.bot, chatId: '-100123' });

    await log(transport, 'error', 'Что-то сломалось');
    await nextTick();

    expect(lastText(h)).toBe('[ERROR] Что-то сломалось');
  });

  it('не отправляет сообщения ниже порога', async () => {
    h = await makeBotHarness();
    const transport = new TelegramTransport({ bot: h.bot, chatId: '-100123', level: 'error' });

    await log(transport, 'debug', 'отладка');
    await nextTick();

    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('обрезает сообщение до maxLength', async () => {
    h = await makeBotHarness();
    const transport = new TelegramTransport({
      bot: h.bot,
      chatId: '-100123',
      level: 'error',
      maxLength: 50,
    });

    await log(transport, 'error', 'x'.repeat(500));
    await nextTick();

    const text = lastText(h)!;
    expect(text.length).toBe(50);
    expect(text.endsWith('...')).toBe(true);
  });

  it('не урезает короткое сообщение', async () => {
    h = await makeBotHarness();
    const transport = new TelegramTransport({ bot: h.bot, chatId: '-100123', maxLength: 50 });

    await log(transport, 'error', 'короткое');
    await nextTick();

    expect(lastText(h)).toBe('[ERROR] короткое');
  });

  it('ограничивает частоту отправки (10 за 10 сек)', async () => {
    h = await makeBotHarness();
    const transport = new TelegramTransport({ bot: h.bot, chatId: '-100123' });

    for (let i = 0; i < 12; i += 1) {
      await log(transport, 'error', `ошибка ${i}`);
    }
    await nextTick();

    expect(h.sendMessage).toHaveBeenCalledTimes(10);
  });
});
