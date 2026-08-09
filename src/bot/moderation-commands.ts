import { Markup, type Telegraf, type Context } from 'telegraf';
import type { Logger } from 'winston';
import type { Question } from '../game/question.js';
import type { QuestionReloader } from '../game/question-reloader.js';
import { MESSAGES } from '../content/messages.js';

export interface ModerationDeps {
  logger: Logger;
  adminId: number | null;
  reloader: QuestionReloader;
}

export function buildQuestionReviewText(question: Question): string {
  return MESSAGES.newQuestionForReview(question);
}

export function buildQuestionReviewKeyboard(questionId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Одобрить', `approve:${questionId}`),
      Markup.button.callback('🚫 Отклонить', `reject:${questionId}`),
    ],
  ]);
}

export function registerModeration(bot: Telegraf, deps: ModerationDeps): void {
  bot.command('pending', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    const pending = await deps.reloader.getPending();
    if (pending.length === 0) {
      await ctx.reply(MESSAGES.noPending);
      return;
    }
    await ctx.reply(MESSAGES.pendingList(pending));
  });

  async function runAction(ctx: Context, approve: boolean, questionId: string): Promise<void> {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.answerCbQuery(MESSAGES.notAdmin);
      return;
    }
    const result = approve
      ? await deps.reloader.approve(questionId)
      : await deps.reloader.reject(questionId);

    if (result.ok) {
      try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      } catch (err) {
        deps.logger.warn('Не удалось убрать кнопки', { error: String(err) });
      }
    }
    await ctx.answerCbQuery(
      result.ok ? (approve ? MESSAGES.approved : MESSAGES.rejected) : result.reason,
      { show_alert: !result.ok },
    );
  }

  bot.action(/^approve:(.+)$/, async (ctx) => {
    await runAction(ctx, true, ctx.match[1]!);
  });
  bot.action(/^reject:(.+)$/, async (ctx) => {
    await runAction(ctx, false, ctx.match[1]!);
  });
}
