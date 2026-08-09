import type { DataStore } from '../storage/data-store.js';
import { defaultChatConfig, isValidChatConfig } from '../types/index.js';
import type { ChatConfig } from '../types/index.js';
import type { ChatRecord } from '../game/chat.js';

export function isGroupChat(type: string | undefined): boolean {
  return type === 'group' || type === 'supergroup';
}

export function normalizeChatConfig(cfg: ChatConfig): ChatConfig {
  const defaults = defaultChatConfig(cfg.chatId);
  return {
    ...defaults,
    ...cfg,
    questionTypes:
      cfg.questionTypes.length > 0 ? cfg.questionTypes : defaults.questionTypes,
    categories: cfg.categories.length > 0 ? cfg.categories : defaults.categories,
    timezoneOffsetMinutes:
      typeof cfg.timezoneOffsetMinutes === 'number'
        ? cfg.timezoneOffsetMinutes
        : defaults.timezoneOffsetMinutes,
  };
}

export async function getOrCreateChat(
  store: DataStore,
  chatId: string,
): Promise<ChatRecord | null> {
  const existing = await store.chats.get(chatId);
  if (existing && isValidChatConfig(existing)) {
    const normalized = normalizeChatConfig(existing);
    const record: ChatRecord = {
      ...normalized,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };
    if (record.timezoneOffsetMinutes !== existing.timezoneOffsetMinutes) {
      await store.chats.update(existing.id, {
        timezoneOffsetMinutes: record.timezoneOffsetMinutes,
        updatedAt: record.updatedAt,
      });
    }
    return record;
  }
  const record: ChatRecord = {
    ...defaultChatConfig(chatId),
    id: chatId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await store.chats.insert(record);
  return record;
}
