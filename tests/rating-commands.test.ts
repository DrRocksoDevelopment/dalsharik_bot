import { afterEach, describe, expect, it } from 'vitest';
import {
  buildRatingKeyboard,
  registerRatingCommands,
} from '../src/bot/rating-commands.js';
import { aggregateRatings } from '../src/game/question-rating.js';
import { MESSAGES } from '../src/content/messages.js';
import {
  makeBotHarness,
  makeLogger,
  makeTempStore,
  callbackUpdate,
  type BotHarness,
} from './helpers.js';

type KbButton = { text?: string; callback_data?: string };

function lastCbAnswer(h: BotHarness): { text?: string; show_alert?: boolean } {
  const calls = h.answerCbQuery.mock.calls;
  const last = calls[calls.length - 1];
  return (last?.[0] as { text?: string; show_alert?: boolean }) ?? {};
}

function lastEditMarkup(h: BotHarness): { inline_keyboard?: KbButton[][] } {
  const calls = h.editMessageReplyMarkup.mock.calls;
  const last = calls[calls.length - 1];
  const payload = (last?.[0] ?? {}) as { reply_markup?: { inline_keyboard?: KbButton[][] } };
  return payload.reply_markup ?? {};
}

describe('rating-commands', () => {
  let h: BotHarness;
  let t: Awaited<ReturnType<typeof makeTempStore>>;

  afterEach(async () => {
    await h?.cleanup();
    await t?.cleanup();
  });

  async function setup(): Promise<void> {
    h = await makeBotHarness();
    t = await makeTempStore();
    registerRatingCommands(h.bot, { logger: makeLogger(), store: t.store });
  }

  it('строит клавиатуру с тремя кнопками оценок', () => {
    const kb = buildRatingKeyboard('event_000001') as { inline_keyboard: KbButton[][] };
    expect(kb.inline_keyboard).toHaveLength(1);
    const row = kb.inline_keyboard[0]!;
    expect(row.map((b) => b.callback_data)).toEqual([
      'rate:good:event_000001',
      'rate:normal:event_000001',
      'rate:bad:event_000001',
    ]);
    expect(row.map((b) => b.text)).toEqual(['👍 Хорошо (0)', '👌 Нормально (0)', '👎 Плохо (0)']);
  });

  it('callback rate фиксирует оценку и подтверждает', async () => {
    await setup();
    await h.bot.handleUpdate(callbackUpdate('rate:good:event_000001', { fromId: 42 }));

    const record = await t.store.questionRatings.get('event_000001');
    expect(record?.ratings).toEqual({ '42': 'good' });
    expect(lastCbAnswer(h).text).toBe(MESSAGES.ratingSaved('👍 Хорошо'));

    const edited = lastEditMarkup(h);
    expect(edited.inline_keyboard?.[0]?.map((b) => b.text)).toEqual([
      '👍 Хорошо (1)',
      '👌 Нормально (0)',
      '👎 Плохо (0)',
    ]);
  });

  it('повторная оценка тем же пользователем перезаписывается', async () => {
    await setup();
    await h.bot.handleUpdate(callbackUpdate('rate:good:event_000001', { fromId: 42 }));
    await h.bot.handleUpdate(callbackUpdate('rate:bad:event_000001', { fromId: 42 }));

    const record = await t.store.questionRatings.get('event_000001');
    expect(record?.ratings).toEqual({ '42': 'bad' });
    expect(aggregateRatings(record)).toEqual({ good: 0, normal: 0, bad: 1, total: 1 });
  });

  it('разные пользователи учитываются по отдельности', async () => {
    await setup();
    await h.bot.handleUpdate(callbackUpdate('rate:good:event_000001', { fromId: 42 }));
    await h.bot.handleUpdate(callbackUpdate('rate:normal:event_000001', { fromId: 43 }));

    const record = await t.store.questionRatings.get('event_000001');
    expect(record?.ratings).toEqual({ '42': 'good', '43': 'normal' });
    expect(aggregateRatings(record)).toEqual({ good: 1, normal: 1, bad: 0, total: 2 });
  });

  it('сторонний callback не перехватывается', async () => {
    await setup();
    await h.bot.handleUpdate(callbackUpdate('rate:unknown:event_000001', { fromId: 42 }));

    expect(await t.store.questionRatings.getAll()).toHaveLength(0);
    expect(h.answerCbQuery.mock.calls).toHaveLength(0);
  });
});
