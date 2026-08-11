import type { Telegraf } from 'telegraf';
import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import { MESSAGES } from '../content/messages.js';

export interface BroadcastCommandsDeps {
  logger: Logger;
  adminId: number | null;
  store: DataStore;
  sendMessage?: (chatId: string, text: string) => Promise<void>;
  delayMs?: number;
}

const DEFAULT_BROADCAST_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractBroadcastText(messageText: string): string {
  return messageText.replace(/^\/broadcast(@\w+)?\s*/, '').trim();
}

export function registerBroadcastCommand(bot: Telegraf, deps: BroadcastCommandsDeps): void {
  const delayMs = deps.delayMs ?? DEFAULT_BROADCAST_DELAY_MS;
  const send = deps.sendMessage ?? ((chatId: string, text: string) => bot.telegram.sendMessage(chatId, text));

  bot.command('broadcast', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }

    const text = extractBroadcastText(ctx.message?.text ?? '');
    if (!text) {
      await ctx.reply(MESSAGES.broadcastUsage);
      return;
    }

    const chats = (await deps.store.chats.getAll()).filter((c) => c.enabled);
    if (chats.length === 0) {
      await ctx.reply(MESSAGES.broadcastEmpty);
      return;
    }

    let sent = 0;
    let failed = 0;
    for (const chat of chats) {
      try {
        await send(chat.chatId, text);
        sent += 1;
      } catch (err) {
        failed += 1;
        deps.logger.error('Не удалось доставить broadcast', {
          chatId: chat.chatId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (delayMs > 0) await sleep(delayMs);
    }

    await ctx.reply(MESSAGES.broadcastDone(sent, failed));
  });
}
