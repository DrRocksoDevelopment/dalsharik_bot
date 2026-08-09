import { afterEach, describe, expect, it } from 'vitest';
import { getOrCreateChat } from '../src/bot/chat-utils.js';
import { makeTempStore, type TempStore } from './helpers.js';
import type { ChatRecord } from '../src/game/chat.js';

const tempStores: TempStore[] = [];

afterEach(async () => {
  for (const t of tempStores.splice(0)) await t.cleanup();
});

const ALL_TYPES = [
  'historical_next_event',
  'scientific_next_event',
  'technology_next_event',
  'business_next_event',
  'culture_next_event',
  'geography_next_event',
];

function legacyRecord(overrides: Partial<ChatRecord> = {}): ChatRecord {
  return {
    chatId: '-100123',
    enabled: true,
    answerWindow: 300,
    questionInterval: 7200,
    questionTypes: ['historical_next_event'],
    categories: ['history'],
    difficultyMin: 1,
    difficultyMax: 5,
    id: '-100123',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as ChatRecord;
}

describe('chat-utils backfill', () => {
  it('расширяет legacy questionTypes и заполняет таймзону', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    await t.store.chats.insert(legacyRecord());

    const record = await getOrCreateChat(t.store, '-100123');
    expect(record?.questionTypes).toEqual(ALL_TYPES);
    expect(record?.timezoneOffsetMinutes).toBe(180);

    const stored = await t.store.chats.get('-100123');
    expect(stored?.questionTypes).toEqual(ALL_TYPES);
    expect(stored?.timezoneOffsetMinutes).toBe(180);
  });

  it('не трогает явно заданные типы', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    await t.store.chats.insert(
      legacyRecord({ questionTypes: ['technology_next_event'], timezoneOffsetMinutes: 180 }),
    );

    const record = await getOrCreateChat(t.store, '-100123');
    expect(record?.questionTypes).toEqual(['technology_next_event']);
  });
});
