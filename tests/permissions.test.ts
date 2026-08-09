import { describe, expect, it } from 'vitest';
import type { Context } from 'telegraf';
import { isChatAdminOrSuper } from '../src/bot/permissions.js';

function makeCtx(overrides: Record<string, unknown>): Context {
  return overrides as unknown as Context;
}

describe('isChatAdminOrSuper', () => {
  const SUPER = 111;

  it('суперадмин проходит даже без чата', async () => {
    const ctx = makeCtx({ from: { id: SUPER } });
    expect(await isChatAdminOrSuper(ctx, SUPER)).toBe(true);
  });

  it('суперадмин проходит в обычном чате', async () => {
    const ctx = makeCtx({
      from: { id: SUPER },
      chat: { id: -100, type: 'supergroup' },
      getChatAdministrators: async () => [],
    });
    expect(await isChatAdminOrSuper(ctx, SUPER)).toBe(true);
  });

  it('администратор группы допускается', async () => {
    const ctx = makeCtx({
      from: { id: 222 },
      chat: { id: -100, type: 'supergroup' },
      getChatAdministrators: async () => [
        { user: { id: 222 }, status: 'administrator' },
      ],
    });
    expect(await isChatAdminOrSuper(ctx, SUPER)).toBe(true);
  });

  it('создатель группы допускается', async () => {
    const ctx = makeCtx({
      from: { id: 222 },
      chat: { id: -100, type: 'supergroup' },
      getChatAdministrators: async () => [
        { user: { id: 222 }, status: 'creator' },
      ],
    });
    expect(await isChatAdminOrSuper(ctx, SUPER)).toBe(true);
  });

  it('обычный участник не допускается', async () => {
    const ctx = makeCtx({
      from: { id: 222 },
      chat: { id: -100, type: 'supergroup' },
      getChatAdministrators: async () => [
        { user: { id: 111 }, status: 'administrator' },
      ],
    });
    expect(await isChatAdminOrSuper(ctx, SUPER)).toBe(false);
  });

  it('не-групповой чат отклоняется без суперадмина', async () => {
    const ctx = makeCtx({
      from: { id: 222 },
      chat: { id: 123, type: 'private' },
      getChatAdministrators: async () => [
        { user: { id: 222 }, status: 'administrator' },
      ],
    });
    expect(await isChatAdminOrSuper(ctx, SUPER)).toBe(false);
  });

  it('ошибка getChatAdministrators не даёт доступа', async () => {
    const ctx = makeCtx({
      from: { id: 222 },
      chat: { id: -100, type: 'group' },
      getChatAdministrators: async () => {
        throw new Error('not enough rights');
      },
    });
    expect(await isChatAdminOrSuper(ctx, SUPER)).toBe(false);
  });
});
