import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const ENV_KEYS = ['BOT_TOKEN', 'LOG_LEVEL', 'LOG_CHAT_ID', 'LOG_FILE', 'DATA_DIR', 'BOT_ADMIN_ID', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'FIRECRAWL_API_KEY', 'FIRECRAWL_BASE_URL'];

const saved: Record<string, string | undefined> = {};

function saveEnv(): void {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
}

describe('loadEnv', () => {
  beforeEach(saveEnv);

  afterEach(() => {
    restoreEnv();
    vi.unstubAllEnvs();
  });

  it('читает обязательные и опциональные переменные', () => {
    for (const [name, value] of Object.entries({
      BOT_TOKEN: '123:token',
      LOG_LEVEL: 'debug',
      LOG_CHAT_ID: '-100123',
      LOG_FILE: 'logs/custom.log',
      DATA_DIR: 'data/custom',
      BOT_ADMIN_ID: '42',
      OPENROUTER_API_KEY: 'sk-or-test',
      OPENROUTER_MODEL: 'openrouter/auto',
      FIRECRAWL_API_KEY: 'fc-test',
      FIRECRAWL_BASE_URL: 'http://localhost:3002',
    })) {
      process.env[name] = value;
    }
    expect(loadEnv()).toEqual({
      botToken: '123:token',
      logLevel: 'debug',
      logChatId: '-100123',
      logFile: 'logs/custom.log',
      dataDir: 'data/custom',
      botAdminId: 42,
      openrouterApiKey: 'sk-or-test',
      openrouterModel: 'openrouter/auto',
      firecrawlApiKey: 'fc-test',
      firecrawlBaseUrl: 'http://localhost:3002',
    });
  });

  it('применяет значения по умолчанию', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.BOT_TOKEN = '123:token';
    expect(loadEnv()).toEqual({
      botToken: '123:token',
      logLevel: 'info',
      logChatId: null,
      logFile: 'logs/app.log',
      dataDir: 'data',
      botAdminId: null,
      openrouterApiKey: null,
      openrouterModel: null,
      firecrawlApiKey: null,
      firecrawlBaseUrl: 'http://localhost:3002',
    });
  });

  it('BOT_ADMIN_ID: нечисловое значение превращается в null', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.BOT_TOKEN = '123:token';
    process.env.BOT_ADMIN_ID = 'abc';
    expect(loadEnv().botAdminId).toBeNull();
  });

  it('обрезает пробелы вокруг значений', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.BOT_TOKEN = '  123:token  ';
    process.env.LOG_CHAT_ID = '  -100123  ';
    expect(loadEnv().botToken).toBe('123:token');
    expect(loadEnv().logChatId).toBe('-100123');
  });

  it('без BOT_TOKEN выбрасывает ошибку', () => {
    for (const key of ENV_KEYS) delete process.env[key];
    expect(() => loadEnv()).toThrow('Отсутствует обязательная переменная окружения: BOT_TOKEN');
  });
});
