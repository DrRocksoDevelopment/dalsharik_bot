import { Telegraf } from 'telegraf';
import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import type { PollAnswer } from '@telegraf/types';
import { MESSAGES } from '../content/messages.js';
import { formatLocalTime, formatRelativeDuration } from '../utils/timezone.js';
import { isChatAdminOrSuper, resolveHelpRole } from './permissions.js';
import { registerConfigCommands } from './config-commands.js';
import { registerStatsCommands } from './stats-commands.js';
import { getOrCreateChat, isGroupChat, normalizeChatConfig } from './chat-utils.js';

export interface BotDeps {
  logger: Logger;
  store: DataStore;
  adminId: number | null;
  pollAnswerHandler?: (pollAnswer: PollAnswer, updateId: number) => Promise<void>;
  onChatChanged?: (chatId: string) => Promise<void>;
  ensureScheduled?: (chatId: string) => Promise<void>;
  nextPublishAt?: (chatId: string) => Promise<number | null>;
}

export function createBot(token: string, deps: BotDeps, botInstance?: Telegraf): Telegraf {
  const bot = botInstance ?? new Telegraf(token);

  bot.use((ctx, next) => {
    const chat = ctx.chat?.id?.toString();
    if (chat) {
      deps.logger.debug('Получен update', {
        updateId: ctx.update.update_id,
        chat,
        type: ctx.updateType,
      });
    }
    return next();
  });

  registerConfigCommands(bot, deps);
  registerStatsCommands(bot, deps);

  if (deps.pollAnswerHandler) {
    bot.on('poll_answer', async (ctx, next) => {
      try {
        await deps.pollAnswerHandler!(ctx.pollAnswer, ctx.update.update_id);
      } catch (err) {
        deps.logger.error('Ошибка обработки poll_answer', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await next();
    });
  }

  bot.command('start', async (ctx) => {
    if (!isGroupChat(ctx.chat?.type)) {
      await ctx.reply(MESSAGES.onlyGroups);
      return;
    }
    if (!(await isChatAdminOrSuper(ctx, deps.adminId, deps.logger))) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    const chatId = ctx.chat.id.toString();
    const before = await deps.store.chats.get(chatId);
    const alreadyEnabled = before?.enabled === true;
    const record = await getOrCreateChat(deps.store, chatId);
    if (!record) return;
    await deps.store.chats.update(chatId, {
      enabled: true,
      updatedAt: new Date().toISOString(),
    });
    deps.logger.info('Бот включён в группе', { chatId });

    if (alreadyEnabled) {
      await deps.ensureScheduled?.(chatId);
      const at = await deps.nextPublishAt?.(chatId);
      if (at === null || at === undefined) {
        await ctx.reply(MESSAGES.alreadyStarted());
      } else {
        const time = formatLocalTime(at, record.timezoneOffsetMinutes);
        const until = formatRelativeDuration(Math.max(0, at - Date.now()));
        await ctx.reply(MESSAGES.alreadyStarted(time, until));
      }
      return;
    }

    await deps.onChatChanged?.(chatId);
    await ctx.reply(MESSAGES.start(ctx.botInfo?.first_name ?? 'Дальшарик'));
  });

  bot.command('help', async (ctx) => {
    const role = await resolveHelpRole(ctx, deps.adminId, deps.logger);
    await ctx.reply(MESSAGES.help(ctx.botInfo?.first_name ?? 'Дальшарик', role));
  });

  bot.command('stop', async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;
    if (!(await isChatAdminOrSuper(ctx, deps.adminId, deps.logger))) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    await deps.store.chats.update(chatId, {
      enabled: false,
      updatedAt: new Date().toISOString(),
    });
    deps.logger.info('Бот выключен в группе', { chatId });
    await deps.onChatChanged?.(chatId);
    await ctx.reply(MESSAGES.stop);
  });

  bot.command('config', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;
    const stored = await deps.store.chats.get(chatId);
    if (!stored) {
      await ctx.reply(MESSAGES.noConfig);
      return;
    }
    const cfg = normalizeChatConfig(stored);
    await ctx.reply(MESSAGES.config(cfg as unknown as Record<string, unknown>), {
      parse_mode: 'HTML',
    });
  });

  bot.catch((err, ctx) => {
    deps.logger.error('Ошибка обработки update', {
      error: err instanceof Error ? err.message : String(err),
      updateId: ctx.update.update_id,
    });
  });

  return bot;
}
