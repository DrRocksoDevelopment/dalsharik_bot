import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import winston from 'winston';
import { vi } from 'vitest';
import { Telegraf, Telegram } from 'telegraf';
import type { Update } from '@telegraf/types';
import { createDataStore, type DataStore } from '../src/storage/data-store.js';
import type { Question } from '../src/game/question.js';
import type { PollRecord } from '../src/game/poll.js';
import type { ChatRecord } from '../src/game/chat.js';

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
    store: createDataStore(dir, makeLogger()),
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

export function makeChatRecord(chatId: string, overrides: Partial<ChatRecord> = {}): ChatRecord {
  return {
    id: chatId,
    chatId,
    enabled: true,
    answerWindow: 3600,
    questionInterval: 7200,
    questionTypes: ['historical_next_event'],
    categories: ['history'],
    difficultyMin: 1,
    difficultyMax: 5,
    timezoneOffsetMinutes: 180,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as ChatRecord;
}

export interface BotHarness {
  bot: Telegraf;
  store: DataStore;
  sendMessage: ReturnType<typeof vi.fn>;
  sendPoll: ReturnType<typeof vi.fn>;
  answerCbQuery: ReturnType<typeof vi.fn>;
  getChatAdministrators: ReturnType<typeof vi.fn>;
  editMessageReplyMarkup: ReturnType<typeof vi.fn>;
  getMe: ReturnType<typeof vi.fn>;
  cleanup(): Promise<void>;
}

export async function makeBotHarness(): Promise<BotHarness> {
  const dir = await mkdtemp(join(tmpdir(), 'dalsharik-bot-test-'));
  const store = createDataStore(dir, makeLogger());
  const bot = new Telegraf('test:token');

  const sendMessage = vi.fn();
  const sendPoll = vi.fn();
  const answerCbQuery = vi.fn();
  const getChatAdministrators = vi.fn();
  const editMessageReplyMarkup = vi.fn();
  const getMe = vi.fn();

  const callApi = vi.spyOn(Telegram.prototype, 'callApi').mockImplementation(((
    method: string,
    payload: Record<string, unknown>,
  ) => {
    switch (method) {
      case 'getMe':
        getMe();
        return Promise.resolve({
          id: 1,
          is_bot: true,
          first_name: 'Дальшарик',
          username: 'dalsharik_test_bot',
          can_join_groups: true,
          can_read_all_group_messages: true,
          supports_inline_queries: false,
        });
      case 'sendMessage':
        sendMessage(payload.chat_id, payload.text, payload);
        return Promise.resolve({ message_id: 1 });
      case 'sendPoll':
        sendPoll(payload.chat_id, payload.question, payload.options, payload);
        return Promise.resolve({ poll_id: 'poll-1', message_id: 1, poll: { id: 'poll-1' } });
      case 'sendQuiz':
        sendPoll(payload.chat_id, payload.question, payload.options, payload);
        return Promise.resolve({ message_id: 1, poll: { id: 'poll-1' } });
      case 'stopPoll':
        return Promise.resolve({ total_voter_count: 5 });
      case 'answerCallbackQuery':
        answerCbQuery(payload);
        return Promise.resolve(true);
      case 'getFile':
        return Promise.resolve({ file_id: payload.file_id, file_path: 'import/questions.json' });
      case 'getChatAdministrators':
        getChatAdministrators(payload.chat_id);
        return Promise.resolve([]);
      case 'editMessageReplyMarkup':
        editMessageReplyMarkup(payload);
        return Promise.resolve(true);
      default:
        return Promise.resolve({});
    }
  }) as never);

  return {
    bot,
    store,
    sendMessage,
    sendPoll,
    answerCbQuery,
    getChatAdministrators,
    editMessageReplyMarkup,
    getMe,
    cleanup: async () => {
      callApi.mockRestore();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function commandUpdate(
  text: string,
  opts: { fromId?: number; chatId?: number; chatType?: 'group' | 'supergroup' | 'private' } = {},
): Update {
  const cmdLen = (/^\/\S+/.exec(text) ?? [''])[0].length;
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: opts.fromId ?? 42, is_bot: false, first_name: 'Test', username: 'tester' },
      chat: {
        id: opts.chatId ?? -100123,
        type: opts.chatType ?? 'supergroup',
        title: 'Test Group',
      },
      date: 0,
      text,
      entities: [{ type: 'bot_command', offset: 0, length: cmdLen }],
    },
  } as unknown as Update;
}

export function callbackUpdate(
  data: string,
  opts: { fromId?: number; chatId?: number } = {},
): Update {
  return {
    update_id: 2,
    callback_query: {
      id: 'cb-1',
      from: { id: opts.fromId ?? 42, is_bot: false, first_name: 'Test', username: 'tester' },
      message: {
        message_id: 1,
        from: { id: 1, is_bot: true, first_name: 'Bot' },
        chat: {
          id: opts.chatId ?? -100123,
          type: 'supergroup',
          title: 'Test Group',
        },
        date: 0,
        text: 'review',
      },
      chat_instance: '1',
      data,
    },
  } as unknown as Update;
}

export function documentUpdate(
  opts: {
    fromId?: number;
    chatType?: 'private' | 'group' | 'supergroup';
    fileSize?: number;
    fileName?: string;
  } = {},
): Update {
  return {
    update_id: 3,
    message: {
      message_id: 2,
      from: { id: opts.fromId ?? 42, is_bot: false, first_name: 'Test', username: 'tester' },
      chat: {
        id: opts.fromId ?? 42,
        type: opts.chatType ?? 'private',
        first_name: 'Test',
      },
      date: 0,
      document: {
        file_id: 'file-1',
        file_name: opts.fileName ?? 'questions.json',
        file_size: opts.fileSize ?? 1024,
        mime_type: 'application/json',
      },
    },
  } as unknown as Update;
}
