import type { DataStore } from '../storage/data-store.js';
import { defaultChatConfig, isValidChatConfig } from '../types/index.js';
import type { ChatRecord } from '../game/chat.js';

export function isGroupChat(type: string | undefined): boolean {
  return type === 'group' || type === 'supergroup';
}

export async function getOrCreateChat(
  store: DataStore,
  chatId: string,
): Promise<ChatRecord | null> {
  const existing = await store.chats.get(chatId);
  if (existing && isValidChatConfig(existing)) {
    return existing;
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
