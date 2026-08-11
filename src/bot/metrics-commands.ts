import type { Telegraf } from 'telegraf';
import type { Logger } from 'winston';
import type { MetricsStore } from '../metrics/metrics.js';
import { MESSAGES } from '../content/messages.js';

export interface MetricsCommandsDeps {
  logger: Logger;
  adminId: number | null;
  metrics: MetricsStore;
}

const TOP_CHATS_LIMIT = 5;

export function registerMetricsCommand(bot: Telegraf, deps: MetricsCommandsDeps): void {
  bot.command('metrics', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    try {
      const snapshot = await deps.metrics.snapshot();
      const topChats = Object.entries(snapshot.chats)
        .map(([chatId, c]) => ({ chatId, answersPerDay: c.answers_per_day }))
        .sort((a, b) => b.answersPerDay - a.answersPerDay)
        .slice(0, TOP_CHATS_LIMIT);

      await ctx.reply(
        MESSAGES.metrics({
          questionsPublished: snapshot.game.questions_published,
          questionsCompleted: snapshot.game.questions_completed,
          totalAnswers: snapshot.game.total_answers,
          correctAnswers: snapshot.game.correct_answers,
          wrongAnswers: snapshot.game.wrong_answers,
          averageReactionMs: snapshot.game.average_reaction_time,
          medianReactionMs: snapshot.game.median_reaction_time,
          medianCorrectReactionMs: snapshot.game.median_correct_reaction_time,
          medianWrongReactionMs: snapshot.game.median_wrong_reaction_time,
          fastestCorrectMs: snapshot.game.fastest_correct_answer,
          slowestCorrectMs: snapshot.game.slowest_correct_answer,
          averageRoundParticipants:
            snapshot.game.rounds_count > 0 ? snapshot.game.average_round_participants : null,
          users: Object.keys(snapshot.users).length,
          chats: Object.keys(snapshot.chats).length,
          topChats,
          ai: snapshot.ai,
        }),
      );
    } catch (err) {
      deps.logger.error('Ошибка получения метрик', {
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.reply(MESSAGES.metricsError);
    }
  });
}
