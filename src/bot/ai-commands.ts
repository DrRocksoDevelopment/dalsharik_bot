import type { Telegraf } from 'telegraf';
import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import type { QuestionReloader } from '../game/question-reloader.js';
import type { Category } from '../types/index.js';
import { DEFAULT_CONFIG } from '../config/config.js';
import { MESSAGES, categoryLabel } from '../content/messages.js';
import { OpenRouterClient, OpenRouterError } from '../ai/openrouter-client.js';
import { buildGenerationPrompt } from '../ai/generate-prompt.js';
import { normalizeGenerated } from '../ai/normalize-generated.js';
import { AI_SETTINGS_ID, type AiSettingsRecord } from '../ai/types.js';
import { DEFAULT_HOST_PROMPT } from '../game/show/host.js';
import {
  buildQuestionReviewKeyboard,
  buildQuestionReviewText,
} from './moderation-commands.js';

const DEFAULT_COUNT = 10;
const MAX_COUNT = 25;
const MAX_REVIEW_CARDS = 10;
const MAX_HOST_PROMPT_LENGTH = 3000;

export interface AiCommandsDeps {
  logger: Logger;
  adminId: number | null;
  store: DataStore;
  reloader: QuestionReloader;
  envApiKey?: string | null;
  envModel?: string | null;
  createClient?: (apiKey: string, model: string) => OpenRouterClient;
}

function defaultClient(apiKey: string, model: string): OpenRouterClient {
  return new OpenRouterClient({ apiKey, model });
}

async function getSettings(store: DataStore): Promise<AiSettingsRecord | null> {
  return store.aiSettings.get(AI_SETTINGS_ID);
}

async function saveSettings(store: DataStore, patch: Partial<AiSettingsRecord>): Promise<void> {
  const existing = await store.aiSettings.get(AI_SETTINGS_ID);
  const now = new Date().toISOString();
  if (!existing) {
    await store.aiSettings.insert({
      id: AI_SETTINGS_ID,
      apiKey: null,
      model: null,
      updatedAt: now,
      ...patch,
    });
    return;
  }
  await store.aiSettings.mutate((items) => {
    const idx = items.findIndex((s) => s.id === AI_SETTINGS_ID);
    if (idx === -1) return;
    items[idx] = { ...items[idx]!, ...patch, id: AI_SETTINGS_ID, updatedAt: now };
  });
}

function maskKey(key: string): string {
  return key.length > 8 ? `${key.slice(0, 8)}…` : '•••';
}

export function parseGenerateArgs(
  text: string,
): { count: number; category: Category | null } | { error: string } {
  const tokens = text.trim().split(/\s+/).slice(1);
  let count = DEFAULT_COUNT;
  let category: Category | null = null;
  const validCategories = DEFAULT_CONFIG.categories as readonly string[];
  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) {
      count = Math.min(MAX_COUNT, Math.max(1, Number(tok)));
    } else if (tok !== 'all' && !validCategories.includes(tok)) {
      return { error: tok };
    } else if (tok !== 'all') {
      category = tok as Category;
    }
  }
  return { count, category };
}

export function registerAiCommands(bot: Telegraf, deps: AiCommandsDeps): void {
  bot.command('set_ai_key', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.aiPrivateOnly);
      return;
    }
    const key = ctx.message.text.replace(/^\/\S+\s*/, '').trim();
    if (!key) {
      await ctx.reply(MESSAGES.aiInvalidUsage('/set_ai_key sk-or-v1-…'));
      return;
    }
    await saveSettings(deps.store, { apiKey: key });
    deps.logger.info('Сохранён ключ OpenRouter');
    await ctx.reply(MESSAGES.aiKeySet);
  });

  bot.command('set_ai_model', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.aiPrivateOnly);
      return;
    }
    const model = ctx.message.text.replace(/^\/\S+\s*/, '').trim();
    if (!model) {
      await ctx.reply(MESSAGES.aiInvalidUsage('/set_ai_model openrouter/auto'));
      return;
    }
    await saveSettings(deps.store, { model });
    deps.logger.info('Сохранена модель OpenRouter', { model });
    await ctx.reply(MESSAGES.aiModelSet(model));
  });

  bot.command('ai_status', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    const settings = await getSettings(deps.store);
    const savedModel = settings?.model ?? null;
    const savedKey = settings?.apiKey ?? null;
    const model = savedModel ?? deps.envModel ?? null;
    const key = savedKey ?? deps.envApiKey ?? null;
    const keyFromEnv = key !== null && key === deps.envApiKey && savedKey === null;
    await ctx.reply(
      MESSAGES.aiStatus({
        model,
        keyMasked: key ? maskKey(key) : null,
        keyFromEnv,
        hostPromptSet: settings?.hostPrompt !== undefined,
      }),
    );
  });

  bot.command('host_prompt', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.aiPrivateOnly);
      return;
    }
    const settings = await getSettings(deps.store);
    await ctx.reply(MESSAGES.hostPromptShow(settings?.hostPrompt ?? null, DEFAULT_HOST_PROMPT));
  });

  bot.command('set_host_prompt', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.aiPrivateOnly);
      return;
    }
    const prompt = ctx.message.text.replace(/^\/\S+\s*/, '').trim();
    if (!prompt) {
      await ctx.reply(MESSAGES.aiInvalidUsage('/set_host_prompt <инструкция ведущему>'));
      return;
    }
    if (prompt.length > MAX_HOST_PROMPT_LENGTH) {
      await ctx.reply(MESSAGES.hostPromptTooLong(MAX_HOST_PROMPT_LENGTH));
      return;
    }
    await saveSettings(deps.store, { hostPrompt: prompt });
    deps.logger.info('Сохранён кастомный промпт ведущего');
    await ctx.reply(MESSAGES.hostPromptSet);
  });

  bot.command('reset_host_prompt', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.aiPrivateOnly);
      return;
    }
    await saveSettings(deps.store, { hostPrompt: undefined });
    deps.logger.info('Сброшен кастомный промпт ведущего');
    await ctx.reply(MESSAGES.hostPromptReset);
  });

  let generating = false;

  bot.command('generate', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.aiPrivateOnly);
      return;
    }
    const parsed = parseGenerateArgs(ctx.message.text);
    if ('error' in parsed) {
      await ctx.reply(
        MESSAGES.aiUnknownCategory('/generate 10 history — кол-во и категория, необязательные'),
      );
      return;
    }
    const settings = await getSettings(deps.store);
    const apiKey = settings?.apiKey ?? deps.envApiKey ?? null;
    const model = settings?.model ?? deps.envModel ?? null;
    if (!apiKey) {
      await ctx.reply(MESSAGES.aiKeyMissing);
      return;
    }
    if (!model) {
      await ctx.reply(MESSAGES.aiModelMissing);
      return;
    }
    if (generating) {
      await ctx.reply(MESSAGES.aiGenerateBusy);
      return;
    }

    generating = true;
    try {
      const categoryLabelText = parsed.category ? ` (${categoryLabel(parsed.category)})` : '';
      await ctx.reply(MESSAGES.aiGenerateStarted(parsed.count, categoryLabelText));

      const pool = await deps.reloader.getPool();
      const pending = await deps.reloader.getPending();
      const existingIds = [...pool.map((q) => q.id), ...pending.map((q) => q.id)];
      const existingTexts = [...pool.map((q) => q.question), ...pending.map((q) => q.question)];

      const client = (deps.createClient ?? defaultClient)(apiKey, model);
      const prompt = buildGenerationPrompt({
        count: parsed.count,
        category: parsed.category,
        existingTexts,
      });
      const { rawText, usage } = await client.generate(prompt);
      const normalized = normalizeGenerated(rawText, { existingIds, existingTexts });

      if (!normalized.ok) {
        await ctx.reply(MESSAGES.aiGenerateError(normalized.reason, usage));
        return;
      }

      for (const q of normalized.questions) {
        await deps.store.pendingQuestions.insert(q);
      }
      for (const q of normalized.questions.slice(0, MAX_REVIEW_CARDS)) {
        await ctx.reply(buildQuestionReviewText(q), buildQuestionReviewKeyboard(q.id));
      }
      await ctx.reply(
        MESSAGES.aiGenerateReport({
          total: normalized.questions.length + normalized.rejected.length,
          valid: normalized.questions.length,
          rejectedCount: normalized.rejected.length,
          rejected: normalized.rejected,
          usage,
        }),
      );
    } catch (err) {
      deps.logger.error('Ошибка генерации вопросов', {
        error: err instanceof Error ? err.message : String(err),
      });
      const message =
        err instanceof OpenRouterError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      await ctx.reply(MESSAGES.aiGenerateError(message, null));
    } finally {
      generating = false;
    }
  });
}
