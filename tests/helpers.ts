import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import winston from 'winston';
import { createDataStore, type DataStore } from '../src/storage/data-store.js';
import type { Question } from '../src/game/question.js';
import type { PollRecord } from '../src/game/poll.js';

export function makeLogger(): winston.Logger {
  return winston.createLogger({ silent: true });
}

export interface TempStore {
  store: DataStore;
  dir: string;
  cleanup(): Promise<void>;
}

export async function makeTempStore(): Promise<TempStore> {
  const dir = await mkdtemp(join(tmpdir(), 'dalsharik-test-'));
  return {
    store: createDataStore(dir),
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

export function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'event_000001',
    type: 'historical_next_event',
    category: 'history',
    difficulty: 3,
    eventDate: '1969-07-20',
    event: {
      title: 'Высадка Apollo 11',
      context: '20 июля 1969 года...',
    },
    question: 'Что произошло дальше?',
    answers: [
      { id: 'A', text: 'вариант A' },
      { id: 'B', text: 'вариант B' },
      { id: 'C', text: 'вариант C' },
      { id: 'D', text: 'вариант D' },
    ],
    correctAnswer: 'C',
    explanation: 'Объяснение правильного ответа',
    sources: ['https://example.com'],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makePoll(overrides: Partial<PollRecord> = {}): PollRecord {
  return {
    id: 'poll-rec-1',
    telegramPollId: 'telegram-poll-1',
    chatId: '-100123',
    questionId: 'event_000001',
    messageId: 42,
    optionMap: ['A', 'B', 'C', 'D'],
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T01:00:00.000Z',
    status: 'active',
    ...overrides,
  };
}
