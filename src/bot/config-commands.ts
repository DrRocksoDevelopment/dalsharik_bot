import type { Telegraf } from 'telegraf';
import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import { isQuestionType } from '../types/index.js';
import { MESSAGES } from '../content/messages.js';
import { isGroupChat } from './chat-utils.js';
import { formatTimezoneOffset, parseTimezoneOffset } from '../utils/timezone.js';
import { isChatAdminOrSuper } from './permissions.js';

export interface ConfigCommandsDeps {
  logger: Logger;
  store: DataStore;
  adminId: number | null;
  onChatChanged?: (chatId: string) => Promise<void>;
}

export function registerConfigCommands(bot: Telegraf, deps: ConfigCommandsDeps): void {
  bot.command('set_answer_window', async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (!chatId || !isGroupChat(ctx.chat?.type)) return;
    if (!(await isChatAdminOrSuper(ctx, deps.adminId, deps.logger))) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    const value = Number(ctx.message.text.split(/\s+/)[1]);
    if (!Number.isInteger(value) || value < 60) {
      await ctx.reply(MESSAGES.invalidValue('/set_answer_window 3600'));
      return;
    }
    await deps.store.chats.update(chatId, {
      answerWindow: value,
      updatedAt: new Date().toISOString(),
    });
    deps.logger.info('Установлено окно ответов', { chatId, value });
    await deps.onChatChanged?.(chatId);
    await ctx.reply(MESSAGES.configUpdated('answerWindow', `${value} сек`));
  });

  bot.command('set_interval', async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (!chatId || !isGroupChat(ctx.chat?.type)) return;
    if (!(await isChatAdminOrSuper(ctx, deps.adminId, deps.logger))) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    const value = Number(ctx.message.text.split(/\s+/)[1]);
    if (!Number.isInteger(value) || value < 60) {
      await ctx.reply(MESSAGES.invalidValue('/set_interval 7200'));
      return;
    }
    await deps.store.chats.update(chatId, {
      questionInterval: value,
      updatedAt: new Date().toISOString(),
    });
    deps.logger.info('Установлен интервал вопросов', { chatId, value });
    await deps.onChatChanged?.(chatId);
    await ctx.reply(MESSAGES.configUpdated('questionInterval', `${value} сек`));
  });

  bot.command('set_types', async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (!chatId || !isGroupChat(ctx.chat?.type)) return;
    if (!(await isChatAdminOrSuper(ctx, deps.adminId, deps.logger))) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    const raw = ctx.message.text.split(/\s+/).slice(1).join('').trim();
    if (!raw) {
      await ctx.reply(MESSAGES.invalidValue('/set_types historical_next_event,culture_next_event'));
      return;
    }
    const types = raw.split(',').map((t) => t.trim()).filter(isQuestionType);
    if (types.length === 0) {
      await ctx.reply(MESSAGES.unknownQuestionType(
        'historical_next_event, scientific_next_event, technology_next_event, business_next_event, culture_next_event, geography_next_event',
      ));
      return;
    }
    await deps.store.chats.update(chatId, {
      questionTypes: types,
      updatedAt: new Date().toISOString(),
    });
    deps.logger.info('Установлены типы вопросов', { chatId, types });
    await deps.onChatChanged?.(chatId);
    await ctx.reply(MESSAGES.configUpdated('questionTypes', types.join(', ')));
  });

  bot.command('set_difficulty', async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (!chatId || !isGroupChat(ctx.chat?.type)) return;
    if (!(await isChatAdminOrSuper(ctx, deps.adminId, deps.logger))) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    const parts = ctx.message.text.split(/\s+/).slice(1);
    const min = Number(parts[0]);
    const max = Number(parts[1]);
    if (
      !Number.isInteger(min) || !Number.isInteger(max) ||
      min < 1 || max > 5 || min > max
    ) {
      await ctx.reply(MESSAGES.invalidDifficultyRange);
      return;
    }
    await deps.store.chats.update(chatId, {
      difficultyMin: min,
      difficultyMax: max,
      updatedAt: new Date().toISOString(),
    });
    deps.logger.info('Установлен диапазон сложности', { chatId, min, max });
    await deps.onChatChanged?.(chatId);
    await ctx.reply(MESSAGES.configUpdated('difficulty', `${min}–${max}`));
  });

  bot.command('set_timezone', async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (!chatId || !isGroupChat(ctx.chat?.type)) return;
    if (!(await isChatAdminOrSuper(ctx, deps.adminId, deps.logger))) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    const raw = ctx.message.text.split(/\s+/)[1];
    if (raw === undefined) {
      await ctx.reply(MESSAGES.invalidValue('/set_timezone +3'));
      return;
    }
    const offset = parseTimezoneOffset(raw);
    if (offset === null) {
      await ctx.reply(MESSAGES.invalidTimeZone);
      return;
    }
    await deps.store.chats.update(chatId, {
      timezoneOffsetMinutes: offset,
      updatedAt: new Date().toISOString(),
    });
    deps.logger.info('Установлен часовой пояс', { chatId, offset });
    await deps.onChatChanged?.(chatId);
    await ctx.reply(MESSAGES.configUpdated('timezone', formatTimezoneOffset(offset)));
  });

  bot.command('set_finalization', async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (!chatId || !isGroupChat(ctx.chat?.type)) return;
    if (!(await isChatAdminOrSuper(ctx, deps.adminId, deps.logger))) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    const value = ctx.message.text.split(/\s+/)[1];
    if (value !== 'ai' && value !== 'static') {
      await ctx.reply(MESSAGES.invalidFinalization);
      return;
    }
    const now = new Date().toISOString();
    await deps.store.chats.mutate((chats) => {
      const idx = chats.findIndex((c) => c.chatId === chatId);
      if (idx === -1) return;
      chats[idx] = { ...chats[idx]!, finalization: value, updatedAt: now };
    });
    deps.logger.info('Установлен режим финализации', { chatId, value });
    await deps.onChatChanged?.(chatId);
    await ctx.reply(
      MESSAGES.configUpdated(
        'finalization',
        value === 'ai' ? 'AI-ведущий' : 'статичная карточка',
      ),
    );
  });
}
