import type { Telegraf } from 'telegraf';
import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import type { QuestionReloader } from '../game/question-reloader.js';
import type { Category } from '../types/index.js';
import { DEFAULT_CONFIG } from '../config/config.js';
import { MESSAGES, categoryLabel } from '../content/messages.js';
import { OpenRouterClient, OpenRouterError, getOrCreateClient } from '../ai/openrouter-client.js';
import {
  FIRECRAWL_CLOUD_BASE,
  FIRECRAWL_DEFAULT_BASE,
  createFirecrawlClient,
  type FirecrawlClient,
} from '../ai/firecrawl-client.js';
import { buildFactBase } from '../ai/fact-base.js';
import { buildTopicsPrompt, parseTopics, searchFactPages } from '../ai/fact-search.js';
import {
  buildTopicBlacklist,
  extractUsedTopics,
  filterRepeatedTopics,
} from '../ai/used-topics.js';
import { buildGenerationPrompt, DEFAULT_GENERATION_PROMPT } from '../ai/generate-prompt.js';
import { normalizeGenerated } from '../ai/normalize-generated.js';
import {
  AI_SETTINGS_ID,
  type AiSettingsRecord,
  type GenerationUsage,
  type NormalizedGeneration,
} from '../ai/types.js';
import type { Question } from '../game/question.js';
import { DEFAULT_HOST_PROMPT } from '../game/show/host.js';
import type { MetricsStore } from '../metrics/metrics.js';
import {
  buildQuestionReviewKeyboard,
  buildQuestionReviewText,
} from './moderation-commands.js';

const DEFAULT_COUNT = 5;
const MAX_COUNT = 25;
const MAX_REVIEW_CARDS = 10;
const MAX_HOST_PROMPT_LENGTH = 3000;
const MAX_GENERATE_PROMPT_LENGTH = 3000;
const TOPICS_MAX_TOKENS = 2000;
const GENERATION_MAX_TOKENS = 8192;

export interface AiCommandsDeps {
  logger: Logger;
  adminId: number | null;
  store: DataStore;
  reloader: QuestionReloader;
  metrics?: MetricsStore;
  envApiKey?: string | null;
  envModel?: string | null;
  envOpenrouterTimeoutMs?: number;
  envFirecrawlApiKey?: string | null;
  envFirecrawlBaseUrl?: string | null;
  envFirecrawlTimeoutMs?: number;
  createClient?: (apiKey: string, model: string, timeoutMs?: number) => OpenRouterClient;
  createFirecrawlClient?: (
    baseUrl: string,
    apiKey: string | null,
    timeoutMs?: number,
  ) => FirecrawlClient;
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

function preview(text: string, max = 400): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export interface FirecrawlConfig {
  mode: 'cloud' | 'local';
  baseUrl: string;
  apiKey: string | null;
}

export function resolveFirecrawlConfig(
  settings: AiSettingsRecord | null,
  deps: Pick<AiCommandsDeps, 'envFirecrawlApiKey' | 'envFirecrawlBaseUrl'>,
): FirecrawlConfig {
  const apiKey = settings?.firecrawlApiKey ?? deps.envFirecrawlApiKey ?? null;
  if (apiKey) {
    return { mode: 'cloud', baseUrl: FIRECRAWL_CLOUD_BASE, apiKey };
  }
  const baseUrl = settings?.firecrawlBaseUrl ?? deps.envFirecrawlBaseUrl ?? FIRECRAWL_DEFAULT_BASE;
  return { mode: 'local', baseUrl, apiKey: null };
}

export function sumUsage(a: GenerationUsage, b: GenerationUsage): GenerationUsage {
  const cost =
    a.totalCostCredits !== undefined && b.totalCostCredits !== undefined
      ? a.totalCostCredits + b.totalCostCredits
      : undefined;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    webSearchRequests: a.webSearchRequests + b.webSearchRequests,
    totalCostCredits: cost,
    estimatedCostUsd: a.estimatedCostUsd + b.estimatedCostUsd,
    inferenceCostUsd: a.inferenceCostUsd + b.inferenceCostUsd,
    searchCostUsd: a.searchCostUsd + b.searchCostUsd,
  };
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
      await ctx.reply(MESSAGES.aiInvalidUsage('/set_ai_model <модель>'));
      return;
    }
    await saveSettings(deps.store, { model });
    deps.logger.info('Сохранена модель OpenRouter', { model });
    await ctx.reply(MESSAGES.aiModelSet(model));
  });

  bot.command('set_generate_model', async (ctx) => {
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
      await ctx.reply(MESSAGES.aiInvalidUsage('/set_generate_model <модель>'));
      return;
    }
    await saveSettings(deps.store, { generateModel: model });
    deps.logger.info('Сохранена модель генерации OpenRouter', { model });
    await ctx.reply(MESSAGES.generateModelSet(model));
  });

  bot.command('reset_generate_model', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.aiPrivateOnly);
      return;
    }
    await saveSettings(deps.store, { generateModel: undefined });
    deps.logger.info('Сброшена модель генерации OpenRouter');
    await ctx.reply(MESSAGES.generateModelReset);
  });

  bot.command('set_firecrawl_key', async (ctx) => {
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
      await ctx.reply(MESSAGES.aiInvalidUsage('/set_firecrawl_key fc-…'));
      return;
    }
    await saveSettings(deps.store, { firecrawlApiKey: key });
    deps.logger.info('Сохранён ключ Firecrawl');
    await ctx.reply(MESSAGES.firecrawlKeySet);
  });

  bot.command('reset_firecrawl_key', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.aiPrivateOnly);
      return;
    }
    await saveSettings(deps.store, { firecrawlApiKey: undefined });
    deps.logger.info('Отозван ключ Firecrawl');
    await ctx.reply(MESSAGES.firecrawlKeyReset);
  });

  bot.command('set_firecrawl_url', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.aiPrivateOnly);
      return;
    }
    const url = ctx.message.text.replace(/^\/\S+\s*/, '').trim();
    if (!url) {
      await ctx.reply(MESSAGES.aiInvalidUsage('/set_firecrawl_url http://localhost:3002'));
      return;
    }
    await saveSettings(deps.store, { firecrawlBaseUrl: url });
    deps.logger.info('Сохранён адрес локального Firecrawl', { url });
    await ctx.reply(MESSAGES.firecrawlUrlSet(url));
  });

  bot.command('reset_firecrawl_url', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.aiPrivateOnly);
      return;
    }
    await saveSettings(deps.store, { firecrawlBaseUrl: undefined });
    deps.logger.info('Сброшен адрес локального Firecrawl');
    await ctx.reply(MESSAGES.firecrawlUrlReset);
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
    const firecrawl = resolveFirecrawlConfig(settings, deps);
    const firecrawlKeyFromSettings = settings?.firecrawlApiKey ?? null;
    const firecrawlKeyFromEnv = firecrawl.apiKey !== null && firecrawlKeyFromSettings === null;
    await ctx.reply(
      MESSAGES.aiStatus({
        model,
        generateModel: settings?.generateModel ?? null,
        keyMasked: key ? maskKey(key) : null,
        keyFromEnv,
        hostPromptSet: settings?.hostPrompt !== undefined,
        firecrawlMode: firecrawl.mode,
        firecrawlBaseUrl: firecrawl.baseUrl,
        firecrawlKeyMasked: firecrawl.apiKey ? maskKey(firecrawl.apiKey) : null,
        firecrawlKeyFromEnv,
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

  bot.command('set_generate_prompt', async (ctx) => {
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
      await ctx.reply(MESSAGES.aiInvalidUsage('/set_generate_prompt <инструкция генератору>'));
      return;
    }
    if (prompt.length > MAX_GENERATE_PROMPT_LENGTH) {
      await ctx.reply(MESSAGES.generatePromptTooLong(MAX_GENERATE_PROMPT_LENGTH));
      return;
    }
    await saveSettings(deps.store, { generatePrompt: prompt });
    deps.logger.info('Сохранён кастомный промпт генерации вопросов');
    await ctx.reply(MESSAGES.generatePromptSet);
  });

  bot.command('reset_generate_prompt', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.aiPrivateOnly);
      return;
    }
    await saveSettings(deps.store, { generatePrompt: undefined });
    deps.logger.info('Сброшен кастомный промпт генерации вопросов');
    await ctx.reply(MESSAGES.generatePromptReset);
  });

  bot.command('generate_prompt', async (ctx) => {
    if (ctx.from?.id !== deps.adminId) {
      await ctx.reply(MESSAGES.notAdmin);
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply(MESSAGES.aiPrivateOnly);
      return;
    }
    const settings = await getSettings(deps.store);
    await ctx.reply(
      MESSAGES.generatePromptShow(settings?.generatePrompt ?? null, DEFAULT_GENERATION_PROMPT),
    );
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
    const model = settings?.generateModel ?? settings?.model ?? deps.envModel ?? null;
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
      const existingTopics = extractUsedTopics([...pool, ...pending]);
      const blacklistTopics = buildTopicBlacklist(existingTopics);

      const client = (deps.createClient ?? getOrCreateClient)(
        apiKey,
        model,
        deps.envOpenrouterTimeoutMs,
      );
      const firecrawlConfig = resolveFirecrawlConfig(settings, deps);
      const firecrawl = (deps.createFirecrawlClient ?? createFirecrawlClient)(
        firecrawlConfig.baseUrl,
        firecrawlConfig.apiKey,
        deps.envFirecrawlTimeoutMs,
      );

      const topicsResult = await client.generate(buildTopicsPrompt({
        count: parsed.count,
        category: parsed.category,
        existingTopics: blacklistTopics,
        existingTexts,
      }), {
        webSearch: false,
        jsonObject: true,
        maxTokens: TOPICS_MAX_TOKENS,
        reasoning: { enabled: false },
        cache: false,
      });
      const topics = parseTopics(topicsResult.rawText);
      if (!topics.ok) {
        await ctx.reply(
          `${MESSAGES.aiGenerateError(topics.reason, topicsResult.usage)}\n\n${MESSAGES.aiGenerateModelReply(preview(topicsResult.rawText))}`,
        );
        return;
      }
      const filtered = filterRepeatedTopics(topics.topics, existingTopics);
      if (filtered.kept.length === 0) {
        await ctx.reply(
          MESSAGES.aiGenerateError(
            `Модель предложила только повторяющиеся темы (${filtered.skipped.length} шт.). Повтори ещё раз.`,
            topicsResult.usage,
          ),
        );
        return;
      }
      deps.logger.info('Факт-поиск: темы предложены', {
        topics: topics.topics.length,
        skipped: filtered.skipped.length,
        mode: firecrawlConfig.mode,
      });
      await ctx.reply(MESSAGES.aiGenerateTopicsReady(topics.topics.length, filtered.kept.length, filtered.skipped.length));

      const { pages, searched, byTopic } = await searchFactPages(firecrawl, filtered.kept, {
        onProgress: (p) =>
          ctx
            .reply(
              MESSAGES.aiGenerateFactProgress({
                done: p.done,
                total: p.total,
                title: p.topicTitle,
                pages: p.topicPages,
                totalPages: p.totalPages,
                failed: p.failed,
              }),
            )
            .then(() => undefined),
      });
      const totalFactBase = buildFactBase(pages);
      if (!totalFactBase) {
        await ctx.reply(
          MESSAGES.aiGenerateError(
            `Firecrawl (${firecrawlConfig.baseUrl}) не вернул ни одной страницы с содержимым. Проверь, что инстанс запущен${firecrawlConfig.apiKey ? '' : ' и настроен адрес локального инстанса (/set_firecrawl_url)'}.`,
            null,
          ),
        );
        return;
      }
      await ctx.reply(MESSAGES.aiGenerateFactsReady(pages.length, searched));

      let questionsUsage: GenerationUsage | null = null;
      const questions: Question[] = [];
      let rejected: NormalizedGeneration['rejected'] = [];
      const usedIds = [...existingIds];
      const usedTexts = [...existingTexts];
      const usedTopics = [...existingTopics];

      for (let i = 0; i < byTopic.length; i++) {
        const { topic, pages: topicPages } = byTopic[i]!;
        const topicFactBase = buildFactBase(topicPages);
        if (!topicFactBase) {
          await ctx.reply(MESSAGES.aiGenerateError(`Нет фактов для темы «${topic.title}» — пропускаю.`, null));
          continue;
        }
        await ctx.reply(MESSAGES.aiGenerateQuestionProgress(i + 1, byTopic.length, topic.title));

        const prompt = buildGenerationPrompt(
          {
            count: 1,
            category: parsed.category,
            existingTexts: usedTexts,
            factBase: topicFactBase,
            alreadyGenerated: questions.map((q) => q.question),
          },
          settings?.generatePrompt ?? DEFAULT_GENERATION_PROMPT,
        );
        const { rawText, usage } = await client.generate(prompt, {
          webSearch: false,
          jsonObject: true,
          reasoning: { enabled: false },
          maxTokens: GENERATION_MAX_TOKENS,
        });
        questionsUsage = questionsUsage ? sumUsage(questionsUsage, usage) : usage;
        const normalized = normalizeGenerated(rawText, {
          existingIds: usedIds,
          existingTexts: usedTexts,
          existingTopics: usedTopics,
        });
        if (!normalized.ok) {
          await ctx.reply(
            `${MESSAGES.aiGenerateError(normalized.reason, usage)}\n\n${MESSAGES.aiGenerateModelReply(preview(rawText))}`,
          );
          continue;
        }
        for (const q of normalized.questions) {
          usedIds.push(q.id);
          usedTexts.push(q.question);
          usedTopics.push(q.event.title);
          questions.push(q);
          await deps.store.pendingQuestions.insert(q);
          await ctx.reply(buildQuestionReviewText(q), buildQuestionReviewKeyboard(q.id));
          await ctx.reply(MESSAGES.aiGenerateQuestionDone(i + 1, byTopic.length, topic.title));
        }
        rejected = rejected.concat(normalized.rejected);
      }

      const combinedUsage = sumUsage(topicsResult.usage, {
        ...(questionsUsage ?? {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          totalCostCredits: undefined,
          estimatedCostUsd: 0,
          inferenceCostUsd: 0,
          searchCostUsd: 0,
        }),
        webSearchRequests: searched,
      });
      await deps.metrics?.recordAiUsage({ kind: 'generate', ...combinedUsage });

      await ctx.reply(
        MESSAGES.aiGenerateReport({
          total: questions.length + rejected.length,
          valid: questions.length,
          rejectedCount: rejected.length,
          rejected,
          usage: combinedUsage,
        }),
      );
      if (questions.length < parsed.count) {
        await ctx.reply(MESSAGES.aiGenerateShortfall(questions.length, parsed.count));
      }
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
