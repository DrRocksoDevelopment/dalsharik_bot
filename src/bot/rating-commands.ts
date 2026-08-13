import type { Telegraf } from 'telegraf';
import type { InlineKeyboardMarkup } from '@telegraf/types';
import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import {
  aggregateRatings,
  rateQuestion,
  RATING_LABELS,
  type QuestionRating,
  type QuestionRatingRecord,
} from '../game/question-rating.js';
import { MESSAGES } from '../content/messages.js';

export interface RatingCommandsDeps {
  logger: Logger;
  store: DataStore;
}

export function buildRatingKeyboard(
  questionId: string,
  record?: QuestionRatingRecord | null,
): InlineKeyboardMarkup {
  const counts = aggregateRatings(record ?? null);
  const button = (rating: QuestionRating) => ({
    text: `${RATING_LABELS[rating]} (${counts[rating]})`,
    callback_data: `rate:${rating}:${questionId}`,
  });
  return {
    inline_keyboard: [[button('good'), button('normal'), button('bad')]],
  };
}

export function registerRatingCommands(bot: Telegraf, deps: RatingCommandsDeps): void {
  bot.action(/^rate:(good|normal|bad):(.+)$/, async (ctx) => {
    const rating = ctx.match[1] as QuestionRating;
    const questionId = ctx.match[2]!;
    if (!ctx.from?.id) return;

    await rateQuestion(deps.store, questionId, String(ctx.from.id), rating);

    const record = await deps.store.questionRatings.get(questionId);
    try {
      await ctx.editMessageReplyMarkup(buildRatingKeyboard(questionId, record));
    } catch (err) {
      deps.logger.warn('Не удалось обновить кнопки оценки', { error: String(err) });
    }

    await ctx.answerCbQuery(MESSAGES.ratingSaved(RATING_LABELS[rating]));
  });
}
