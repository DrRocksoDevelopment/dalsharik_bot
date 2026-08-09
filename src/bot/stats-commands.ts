import type { Telegraf } from 'telegraf';
import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import { MESSAGES } from '../content/messages.js';
import { isGroupChat } from './chat-utils.js';
import { displayName } from '../utils/display-name.js';
import {
  buildUserStats,
  getChatLeaderboard,
  getGlobalLeaderboard,
} from '../game/leaderboard.js';

export interface StatsCommandsDeps {
  logger: Logger;
  store: DataStore;
}

const TOP_LIMIT = 10;

export function registerStatsCommands(bot: Telegraf, deps: StatsCommandsDeps): void {
  bot.command('top', async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (!chatId || !isGroupChat(ctx.chat?.type)) return;
    const entries = await getChatLeaderboard(deps.store, chatId, TOP_LIMIT);
    if (entries.length === 0) {
      await ctx.reply(MESSAGES.noTop);
      return;
    }
    const users = new Map((await deps.store.users.getAll()).map((u) => [u.id, u]));
    await ctx.reply(
      MESSAGES.topMessage(
        '🏆 Топ группы',
        entries.map((e) => ({
          name: displayName(users.get(e.userId), e.userId),
          score: e.score,
          streak: e.currentStreak,
        })),
      ),
    );
  });

  bot.command('top_global', async (ctx) => {
    const entries = await getGlobalLeaderboard(deps.store, TOP_LIMIT);
    if (entries.length === 0) {
      await ctx.reply(MESSAGES.noTop);
      return;
    }
    const users = new Map((await deps.store.users.getAll()).map((u) => [u.id, u]));
    await ctx.reply(
      MESSAGES.topMessage(
        '🌍 Топ всех чатов',
        entries.map((e) => ({
          name: displayName(users.get(e.userId), e.userId),
          score: e.score,
          streak: e.currentStreak,
        })),
      ),
    );
  });

  bot.command('stats', async (ctx) => {
    const userId = ctx.from?.id.toString();
    if (!userId) return;
    const stats = await buildUserStats(deps.store, userId);
    if (!stats) {
      await ctx.reply(MESSAGES.noStats);
      return;
    }
    await ctx.reply(
      MESSAGES.statsMessage({
        answers: stats.answers,
        correct: stats.correct,
        wrong: stats.wrong,
        accuracy: stats.accuracy,
        averageReactionMs: stats.averageReactionMs,
        medianReactionMs: stats.medianReactionMs,
        favoriteCategory: stats.favoriteCategory,
        currentStreak: stats.profile.currentStreak,
        bestStreak: stats.profile.bestStreak,
        score: stats.profile.score,
      }),
    );
  });
}
