import { Telegraf } from 'telegraf';
import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import type { PollAnswer } from '@telegraf/types';
import { MESSAGES } from '../content/messages.js';
import { registerConfigCommands } from './config-commands.js';
import { getOrCreateChat, isGroupChat } from './chat-utils.js';

export interface BotDeps {
  logger: Logger;
  store: DataStore;
  pollAnswerHandler?: (pollAnswer: PollAnswer, updateId: number) => Promise<void>;
  onChatChanged?: (chatId: string) => Promise<void>;
}

export function createBot(token: string, deps: BotDeps): Telegraf {
  const bot = new Telegraf(token);

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
    const chatId = ctx.chat.id.toString();
    const record = await getOrCreateChat(deps.store, chatId);
    if (!record) return;
    await deps.store.chats.update(chatId, {
      enabled: true,
      updatedAt: new Date().toISOString(),
    });
    deps.logger.info('Бот включён в группе', { chatId });
    await deps.onChatChanged?.(chatId);
    await ctx.reply(MESSAGES.start(ctx.botInfo?.first_name ?? 'Дальшарик'));
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(MESSAGES.help(ctx.botInfo?.first_name ?? 'Дальшарик'));
  });

  bot.command('stop', async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;
    await deps.store.chats.update(chatId, {
      enabled: false,
      updatedAt: new Date().toISOString(),
    });
    deps.logger.info('Бот выключен в группе', { chatId });
    await deps.onChatChanged?.(chatId);
    await ctx.reply(MESSAGES.stop);
  });

  bot.command('config', async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;
    const cfg = await deps.store.chats.get(chatId);
    if (!cfg) {
      await ctx.reply(MESSAGES.noConfig);
      return;
    }
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
