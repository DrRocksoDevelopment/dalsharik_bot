import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAiCommands, parseGenerateArgs } from '../src/bot/ai-commands.js';
import { OpenRouterError, type OpenRouterClient } from '../src/ai/openrouter-client.js';
import type { GenerationUsage } from '../src/ai/types.js';
import { AI_SETTINGS_ID } from '../src/ai/types.js';
import { DEFAULT_HOST_PROMPT } from '../src/game/show/host.js';
import { DEFAULT_GENERATION_PROMPT } from '../src/ai/generate-prompt.js';
import { MESSAGES } from '../src/content/messages.js';
import { InMemoryQuestionEngine } from '../src/game/question-engine.js';
import { QuestionReloader } from '../src/game/question-reloader.js';
import { makeBotHarness, makeLogger, makeQuestion, makeTempStore, commandUpdate, type BotHarness } from './helpers.js';

const ADMIN_ID = 42;

const USAGE: GenerationUsage = {
  promptTokens: 100,
  completionTokens: 50,
  totalTokens: 150,
  webSearchRequests: 2,
  estimatedCostUsd: 0.001,
  inferenceCostUsd: 0.0005,
  searchCostUsd: 0.0005,
};

function lastReply(h: BotHarness): string {
  const calls = h.sendMessage.mock.calls;
  const last = calls[calls.length - 1];
  return typeof last?.[1] === 'string' ? last[1] : '';
}

interface SetupOptions {
  envApiKey?: string | null;
  envModel?: string | null;
  createClient?: (apiKey: string, model: string) => OpenRouterClient;
}

describe('parseGenerateArgs', () => {
  it('по умолчанию 10 вопросов без категории', () => {
    expect(parseGenerateArgs('/generate')).toEqual({ count: 10, category: null });
  });

  it('разбирает количество', () => {
    expect(parseGenerateArgs('/generate 5')).toEqual({ count: 5, category: null });
  });

  it('разбирает количество и категорию', () => {
    expect(parseGenerateArgs('/generate 5 history')).toEqual({ count: 5, category: 'history' });
  });

  it('ограничивает количество сверху (25)', () => {
    const parsed = parseGenerateArgs('/generate 999');
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.count).toBe(25);
  });

  it('ограничивает количество снизу (1)', () => {
    const parsed = parseGenerateArgs('/generate 0');
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.count).toBe(1);
  });

  it('all не задаёт категорию', () => {
    expect(parseGenerateArgs('/generate all')).toEqual({ count: 10, category: null });
  });

  it('неизвестная категория возвращает ошибку', () => {
    expect(parseGenerateArgs('/generate foo')).toEqual({ error: 'foo' });
  });
});

describe('registerAiCommands', () => {
  let h: BotHarness;
  let t: Awaited<ReturnType<typeof makeTempStore>>;

  afterEach(async () => {
    await h.cleanup();
    await t.cleanup();
  });

  async function setup(opts: SetupOptions = {}): Promise<{ reloader: QuestionReloader }> {
    h = await makeBotHarness();
    t = await makeTempStore();
    const engine = new InMemoryQuestionEngine([]);
    const reloader = new QuestionReloader({
      logger: makeLogger(),
      store: t.store,
      engine,
      dataDir: t.dir,
    });
    registerAiCommands(h.bot, {
      logger: makeLogger(),
      adminId: ADMIN_ID,
      store: t.store,
      reloader,
      envApiKey: opts.envApiKey ?? null,
      envModel: opts.envModel ?? null,
      createClient: opts.createClient,
    });
    return { reloader };
  }

  async function saveSettings(patch: { apiKey?: string; model?: string }): Promise<void> {
    await t.store.aiSettings.insert({
      id: AI_SETTINGS_ID,
      apiKey: patch.apiKey ?? null,
      model: patch.model ?? null,
      updatedAt: new Date().toISOString(),
    });
  }

  function privateHelp(cmd: string): ReturnType<typeof commandUpdate> {
    return commandUpdate(cmd, { fromId: ADMIN_ID, chatId: ADMIN_ID, chatType: 'private' });
  }

  function validRawQuestions(): string {
    return JSON.stringify([makeQuestion()]);
  }

  function stubClient(rawText = validRawQuestions()) {
    return {
      generate: vi.fn().mockResolvedValue({ rawText, usage: USAGE }),
    } as unknown as OpenRouterClient;
  }

  it('/set_ai_key отклоняет не-админа', async () => {
    await setup();
    await h.bot.handleUpdate(commandUpdate('/set_ai_key sk-or-test', { fromId: 999, chatId: 999, chatType: 'private' }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
    expect(await t.store.aiSettings.getAll()).toHaveLength(0);
  });

  it('/set_ai_key работает только в ЛС', async () => {
    await setup();
    await h.bot.handleUpdate(commandUpdate('/set_ai_key sk-or-test', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toBe(MESSAGES.aiPrivateOnly);
  });

  it('/set_ai_key требует ключ', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/set_ai_key'));
    expect(lastReply(h)).toContain('/set_ai_key');
  });

  it('/set_ai_key сохраняет ключ', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/set_ai_key sk-or-test'));
    expect(lastReply(h)).toBe(MESSAGES.aiKeySet);
    expect((await t.store.aiSettings.get(AI_SETTINGS_ID))?.apiKey).toBe('sk-or-test');
  });

  it('/set_ai_model сохраняет модель', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/set_ai_model openrouter/auto'));
    expect(lastReply(h)).toBe(MESSAGES.aiModelSet('openrouter/auto'));
    expect((await t.store.aiSettings.get(AI_SETTINGS_ID))?.model).toBe('openrouter/auto');
  });

  it('/set_host_prompt отклоняет не-админа', async () => {
    await setup();
    await h.bot.handleUpdate(commandUpdate('/set_host_prompt Будь дерзким', { fromId: 999, chatId: 999, chatType: 'private' }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
    expect(await t.store.aiSettings.getAll()).toHaveLength(0);
  });

  it('/set_host_prompt работает только в ЛС', async () => {
    await setup();
    await h.bot.handleUpdate(commandUpdate('/set_host_prompt Будь дерзким', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toBe(MESSAGES.aiPrivateOnly);
  });

  it('/set_host_prompt требует текст', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/set_host_prompt'));
    expect(lastReply(h)).toContain('/set_host_prompt');
  });

  it('/set_host_prompt сохраняет инструкцию', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/set_host_prompt Будь дерзким и коротко подводи итоги'));
    expect(lastReply(h)).toBe(MESSAGES.hostPromptSet);
    expect((await t.store.aiSettings.get(AI_SETTINGS_ID))?.hostPrompt).toBe(
      'Будь дерзким и коротко подводи итоги',
    );
  });

  it('/set_host_prompt дописывает поле на legacy-настройках', async () => {
    await setup();
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });
    await h.bot.handleUpdate(privateHelp('/set_host_prompt Новый промпт'));
    expect((await t.store.aiSettings.get(AI_SETTINGS_ID))?.hostPrompt).toBe('Новый промпт');
    expect((await t.store.aiSettings.get(AI_SETTINGS_ID))?.apiKey).toBe('sk-or-secret-123456');
  });

  it('/reset_host_prompt удаляет инструкцию', async () => {
    await setup();
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });
    await h.bot.handleUpdate(privateHelp('/set_host_prompt Временный промпт'));
    await h.bot.handleUpdate(privateHelp('/reset_host_prompt'));
    expect(lastReply(h)).toBe(MESSAGES.hostPromptReset);
    expect((await t.store.aiSettings.get(AI_SETTINGS_ID))?.hostPrompt).toBeUndefined();
  });

  it('/host_prompt без кастомного показывает стандартный', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/host_prompt'));
    const text = lastReply(h);
    expect(text).toContain('Кастомный промпт не задан');
    expect(text).toContain(DEFAULT_HOST_PROMPT);
  });

  it('/host_prompt показывает кастомный промпт', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/set_host_prompt Будь дерзким'));
    await h.bot.handleUpdate(privateHelp('/host_prompt'));
    const text = lastReply(h);
    expect(text).toContain('Текущий промпт ведущего');
    expect(text).toContain('Будь дерзким');
    expect(text).not.toContain('Кастомный промпт не задан');
  });

  it('/host_prompt отклоняет не-админа', async () => {
    await setup();
    await h.bot.handleUpdate(commandUpdate('/host_prompt', { fromId: 999, chatId: 999, chatType: 'private' }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
  });

  it('/set_generate_prompt сохраняет инструкцию', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/set_generate_prompt Делай вопросы только про космос'));
    expect(lastReply(h)).toBe(MESSAGES.generatePromptSet);
    expect((await t.store.aiSettings.get(AI_SETTINGS_ID))?.generatePrompt).toBe(
      'Делай вопросы только про космос',
    );
  });

  it('/set_generate_prompt требует текст', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/set_generate_prompt'));
    expect(lastReply(h)).toContain('/set_generate_prompt');
  });

  it('/reset_generate_prompt удаляет инструкцию', async () => {
    await setup();
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });
    await h.bot.handleUpdate(privateHelp('/set_generate_prompt Временный промпт'));
    await h.bot.handleUpdate(privateHelp('/reset_generate_prompt'));
    expect(lastReply(h)).toBe(MESSAGES.generatePromptReset);
    expect((await t.store.aiSettings.get(AI_SETTINGS_ID))?.generatePrompt).toBeUndefined();
  });

  it('/generate_prompt без кастомного показывает стандартный', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/generate_prompt'));
    const text = lastReply(h);
    expect(text).toContain('Кастомный промпт не задан');
    expect(text).toContain(DEFAULT_GENERATION_PROMPT);
  });

  it('/generate_prompt показывает кастомный промпт', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/set_generate_prompt Про космос'));
    await h.bot.handleUpdate(privateHelp('/generate_prompt'));
    const text = lastReply(h);
    expect(text).toContain('Текущий промпт генерации');
    expect(text).toContain('Про космос');
    expect(text).not.toContain('Кастомный промпт не задан');
  });

  it('/generate использует кастомный промпт генерации', async () => {
    const client = stubClient();
    await setup({ createClient: () => client });
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });
    await h.bot.handleUpdate(privateHelp('/set_generate_prompt Вопросы только про море'));

    await h.bot.handleUpdate(privateHelp('/generate 1 history'));

    const prompt = vi.mocked(client.generate).mock.calls[0]![0];
    expect(prompt).toContain('Вопросы только про море');
    expect(prompt).toContain('1 новых вопросов');
    expect(prompt).not.toContain(DEFAULT_GENERATION_PROMPT);
  });

  it('/generate без кастомного использует стандартный промпт', async () => {
    const client = stubClient();
    await setup({ createClient: () => client });
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });

    await h.bot.handleUpdate(privateHelp('/generate 1 history'));

    const prompt = vi.mocked(client.generate).mock.calls[0]![0];
    expect(prompt).toContain('Ты — генератор вопросов для Telegram-викторины');
  });

  it('/ai_status показывает состояние промпта ведущего', async () => {
    await setup();
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });
    await h.bot.handleUpdate(privateHelp('/ai_status'));
    expect(lastReply(h)).toContain('Промпт ведущего: стандартный');

    await h.bot.handleUpdate(privateHelp('/set_host_prompt Особый'));
    await h.bot.handleUpdate(privateHelp('/ai_status'));
    expect(lastReply(h)).toContain('Промпт ведущего: кастомный');
  });

  it('/ai_status без настроек показывает «не задан»', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/ai_status'));
    const text = lastReply(h);
    expect(text).toContain('Ключ: не задан');
    expect(text).toContain('Модель: не задана');
  });

  it('/ai_status показывает сохранённые ключ и модель', async () => {
    await setup();
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'google/gemini-2.0-flash-001' });
    await h.bot.handleUpdate(privateHelp('/ai_status'));
    const text = lastReply(h);
    expect(text).toContain('google/gemini-2.0-flash-001');
    expect(text).toContain('sk-or-se');
    expect(text).not.toContain('из .env');
  });

  it('/ai_status показывает ключ из env', async () => {
    await setup({ envApiKey: 'sk-or-env-123456789', envModel: 'env/model' });
    await h.bot.handleUpdate(privateHelp('/ai_status'));
    const text = lastReply(h);
    expect(text).toContain('env/model');
    expect(text).toContain('из .env');
  });

  it('/generate отклоняет не-админа', async () => {
    await setup();
    await h.bot.handleUpdate(commandUpdate('/generate', { fromId: 999, chatId: 999, chatType: 'private' }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
  });

  it('/generate работает только в ЛС', async () => {
    await setup();
    await h.bot.handleUpdate(commandUpdate('/generate', { fromId: ADMIN_ID }));
    expect(lastReply(h)).toBe(MESSAGES.aiPrivateOnly);
  });

  it('/generate с неизвестной категорией сообщает об ошибке', async () => {
    await setup();
    await h.bot.handleUpdate(privateHelp('/generate 5 foo'));
    expect(lastReply(h)).toContain('Неизвестная категория');
  });

  it('/generate без ключа сообщает о ключе', async () => {
    await setup({ envModel: 'env/model' });
    await h.bot.handleUpdate(privateHelp('/generate'));
    expect(lastReply(h)).toBe(MESSAGES.aiKeyMissing);
  });

  it('/generate без модели сообщает о модели', async () => {
    await setup({ envApiKey: 'sk-or-env-123456789' });
    await h.bot.handleUpdate(privateHelp('/generate'));
    expect(lastReply(h)).toBe(MESSAGES.aiModelMissing);
  });

  it('/generate генерирует, сохраняет в ожидающие и шлёт отчёт', async () => {
    const client = stubClient();
    await setup({ createClient: () => client });
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });

    await h.bot.handleUpdate(privateHelp('/generate 1 history'));

    expect(client.generate).toHaveBeenCalledTimes(1);
    const pending = await t.store.pendingQuestions.getAll();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.category).toBe('history');
    const text = lastReply(h);
    expect(text).toContain('Генерация завершена');
    expect(text).toContain('Валидных: 1');
  });

  it('/generate отчёт показывает факт по счёту, когда usage.cost есть', async () => {
    const client = stubClient();
    vi.mocked(client.generate).mockResolvedValue({
      rawText: validRawQuestions(),
      usage: { ...USAGE, totalCostCredits: 0.00234 },
    });
    await setup({ createClient: () => client });
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });

    await h.bot.handleUpdate(privateHelp('/generate 1'));

    const text = lastReply(h);
    expect(text).toContain('$0.0023 (факт по счёту OpenRouter)');
    expect(text).not.toContain('(оценка по прайс-листу)');
  });

  it('/generate отчёт показывает оценку, когда usage.cost отсутствует', async () => {
    const client = stubClient();
    await setup({ createClient: () => client });
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });

    await h.bot.handleUpdate(privateHelp('/generate 1'));

    const text = lastReply(h);
    expect(text).toContain('$0.0010 (оценка по прайс-листу)');
    expect(text).not.toContain('(факт по счёту OpenRouter)');
  });

  it('/generate передаёт клиенту ключ и модель', async () => {
    const client = stubClient();
    const createClient = vi.fn(() => client);
    await setup({ createClient });
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });

    await h.bot.handleUpdate(privateHelp('/generate'));

    expect(createClient).toHaveBeenCalledWith('sk-or-secret-123456', 'test/model');
  });

  it('/generate при ошибке OpenRouter показывает причину', async () => {
    const client = {
      generate: vi.fn().mockRejectedValue(new OpenRouterError(500, 'HTTP 500: boom')),
    } as unknown as OpenRouterClient;
    await setup({ createClient: () => client });
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });

    await h.bot.handleUpdate(privateHelp('/generate'));

    expect(lastReply(h)).toContain('Ошибка генерации: HTTP 500: boom');
    expect(await t.store.pendingQuestions.getAll()).toHaveLength(0);
  });

  it('/generate при невалидном JSON от ИИ отвечает причиной', async () => {
    const client = stubClient('это не JSON');
    await setup({ createClient: () => client });
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });

    await h.bot.handleUpdate(privateHelp('/generate'));

    expect(lastReply(h)).toContain('Ошибка генерации');
    expect(lastReply(h)).toContain('невалидный JSON');
  });

  it('/generate повторный вызов во время генерации отвечает busy', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = {
      generate: vi.fn(async () => {
        await gate;
        return { rawText: validRawQuestions(), usage: USAGE };
      }),
    } as unknown as OpenRouterClient;
    await setup({ createClient: () => client });
    await saveSettings({ apiKey: 'sk-or-secret-123456', model: 'test/model' });

    const first = h.bot.handleUpdate(privateHelp('/generate'));
    await new Promise((r) => setTimeout(r, 0));
    await h.bot.handleUpdate(privateHelp('/generate'));
    expect(lastReply(h)).toBe(MESSAGES.aiGenerateBusy);

    release();
    await first;
  });
});
