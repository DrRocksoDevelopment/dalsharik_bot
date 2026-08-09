import type { Context } from 'telegraf';
import type { Logger } from 'winston';
import { isGroupChat } from './chat-utils.js';
import type { HelpRole } from '../content/messages.js';

export async function isChatAdminOrSuper(
  ctx: Context,
  superAdminId: number | null,
  logger?: Logger,
): Promise<boolean> {
  const from = ctx.from?.id;
  if (from === undefined) return false;
  if (superAdminId !== null && from === superAdminId) return true;
  if (!ctx.chat || !isGroupChat(ctx.chat.type)) return false;
  try {
    const admins = await ctx.getChatAdministrators();
    return admins.some(
      (m) => m.user.id === from && (m.status === 'creator' || m.status === 'administrator'),
    );
  } catch (err) {
    logger?.warn('Не удалось проверить права администратора', {
      chatId: ctx.chat.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function resolveHelpRole(
  ctx: Context,
  superAdminId: number | null,
  logger?: Logger,
): Promise<HelpRole> {
  if (superAdminId !== null && ctx.from?.id === superAdminId) return 'super';
  if (await isChatAdminOrSuper(ctx, null, logger)) return 'admin';
  return 'user';
}
