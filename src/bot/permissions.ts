import type { Context } from 'telegraf';
import { isGroupChat } from './chat-utils.js';

export async function isChatAdminOrSuper(
  ctx: Context,
  superAdminId: number | null,
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
  } catch {
    return false;
  }
}
