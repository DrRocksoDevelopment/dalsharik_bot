import { afterEach, describe, expect, it } from 'vitest';
import { TelegramPollSender } from '../src/telegram/poll-sender.js';
import { TelegramFinalizerSender } from '../src/telegram/finalizer-sender.js';
import { makeBotHarness, type BotHarness } from './helpers.js';

describe('telegram senders', () => {
  let h: BotHarness;

  afterEach(async () => {
    await h.cleanup();
  });

  it('TelegramPollSender отправляет обычный опрос и возвращает id', async () => {
    h = await makeBotHarness();
    const sender = new TelegramPollSender(h.bot.telegram);

    const sent = await sender.sendPoll({
      chatId: '-100123',
      text: 'Что произошло дальше?',
      options: ['A', 'B', 'C', 'D'],
    });

    expect(sent).toEqual({ messageId: 1, pollId: 'poll-1' });
    const [chatId, question, options, extra] = h.sendPoll.mock.calls[0]!;
    expect(chatId).toBe('-100123');
    expect(question).toBe('Что произошло дальше?');
    expect(options).toEqual(['A', 'B', 'C', 'D']);
    expect(extra).toMatchObject({
      is_anonymous: false,
      type: 'regular',
    });
    expect(extra).not.toHaveProperty('correct_option_id');
    expect(extra).not.toHaveProperty('explanation');
  });

  it('TelegramFinalizerSender закрывает опрос и возвращает явку', async () => {
    h = await makeBotHarness();
    const sender = new TelegramFinalizerSender(h.bot.telegram);

    const count = await sender.closePoll('-100123', 42);
    expect(count).toBe(5);
  });

  it('TelegramFinalizerSender отправляет итоговое сообщение', async () => {
    h = await makeBotHarness();
    const sender = new TelegramFinalizerSender(h.bot.telegram);

    await sender.sendMessage('-100123', 'Итоги раунда');
    expect(h.sendMessage).toHaveBeenCalledWith('-100123', 'Итоги раунда', expect.anything());
  });
});
