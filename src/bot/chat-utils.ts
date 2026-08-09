import type { DataStore } from '../storage/data-store.js';
import { defaultChatConfig, isValidChatConfig } from '../types/index.js';
import type { ChatConfig, QuestionType } from '../types/index.js';
import { LEGACY_DEFAULT_QUESTION_TYPES } from '../config/config.js';
import type { ChatRecord } from '../game/chat.js';

export function isGroupChat(type: string | undefined): boolean {
  return type === 'group' || type === 'supergroup';
}

function isLegacyDefaultQuestionTypes(types: QuestionType[]): boolean {
  return (
    types.length === LEGACY_DEFAULT_QUESTION_TYPES.length &&
    types.every((t, i) => t === LEGACY_DEFAULT_QUESTION_TYPES[i])
  );
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function normalizeChatConfig(cfg: ChatConfig): ChatConfig {
  const defaults = defaultChatConfig(cfg.chatId);
  return {
    ...defaults,
    ...cfg,
    questionTypes:
      cfg.questionTypes.length > 0 && !isLegacyDefaultQuestionTypes(cfg.questionTypes)
        ? cfg.questionTypes
        : defaults.questionTypes,
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
    const patch: Partial<ChatRecord> = { updatedAt: record.updatedAt };
    if (record.timezoneOffsetMinutes !== existing.timezoneOffsetMinutes) {
      patch.timezoneOffsetMinutes = record.timezoneOffsetMinutes;
    }
    if (!sameStringArray(record.questionTypes, existing.questionTypes)) {
      patch.questionTypes = record.questionTypes;
    }
    if (Object.keys(patch).length > 1) {
      await store.chats.update(existing.id, patch);
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
