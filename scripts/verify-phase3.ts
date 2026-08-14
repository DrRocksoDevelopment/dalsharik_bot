import fs from 'node:fs';
import { OpenRouterClient } from '../src/ai/openrouter-client.js';
import { createFirecrawlClient } from '../src/ai/firecrawl-client.js';
import { buildFactBase } from '../src/ai/fact-base.js';
import { buildTopicsPrompt, parseTopics, searchFactPages } from '../src/ai/fact-search.js';
import { buildGenerationPrompt } from '../src/ai/generate-prompt.js';
import { normalizeGenerated } from '../src/ai/normalize-generated.js';
import {
  buildTopicBlacklist,
  extractUsedTopics,
  filterRepeatedTopics,
} from '../src/ai/used-topics.js';
import { resolveFirecrawlConfig } from '../src/bot/ai-commands.js';
import type { Question } from '../src/game/question.js';

const settings = JSON.parse(fs.readFileSync('data/settings.json', 'utf8')) as Array<{
  id?: string;
  apiKey?: string | null;
  model?: string | null;
  firecrawlBaseUrl?: string | null;
}>;
const rec = settings.find((s) => s.id === 'ai') ?? settings[0]!;
const apiKey = rec.apiKey;
const model = rec.model;
if (!apiKey || !model) {
  console.error('Нет apiKey/model в data/settings.json');
  process.exit(1);
}

const count = Number(process.argv[2] ?? '10');
const genModel = process.argv[3] ?? model;

const timeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS ?? '300000');
const firecrawlTimeoutMs = Number(process.env.FIRECRAWL_TIMEOUT_MS ?? '300000');

const client = new OpenRouterClient({ apiKey, model: genModel, timeoutMs });
const firecrawlConfig = resolveFirecrawlConfig(
  { id: 'ai', apiKey: null, model: null, updatedAt: '', firecrawlBaseUrl: rec.firecrawlBaseUrl ?? null },
  { envFirecrawlApiKey: null, envFirecrawlBaseUrl: null },
);
const firecrawl = createFirecrawlClient(firecrawlConfig.baseUrl, firecrawlConfig.apiKey, firecrawlTimeoutMs);

const t = (ms: number): string => `${(ms / 1000).toFixed(1)} c`;
const started = Date.now();

const pool = (() => {
  try {
    const raw = JSON.parse(fs.readFileSync('data/questions.json', 'utf8')) as Question[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
})();
const existingTopics = extractUsedTopics(pool);
const blacklistTopics = buildTopicBlacklist(existingTopics);
const existingTexts = pool.map((q) => q.question);
const existingIds = pool.map((q) => q.id);

console.log(
  `\n=== /generate ${count} — end-to-end (${genModel}, firecrawl: ${firecrawlConfig.baseUrl}, в пуле ${pool.length} вопросов) ===`,
);

// Фаза 1: темы
const t1 = Date.now();
const topicsResult = await client.generate(
  buildTopicsPrompt({ count, category: null, existingTopics: blacklistTopics, existingTexts }),
  {
    webSearch: false,
    jsonObject: true,
    maxTokens: 2000,
    reasoning: { enabled: false },
    cache: false,
  },
);
const topics = parseTopics(topicsResult.rawText);
console.log(`\n[Фаза 1] темы: ${topics.ok ? topics.topics.length : 'ОШИБКА: ' + topics.reason}`);
console.log(`  usage: ${topicsResult.usage.completionTokens} out, ${topicsResult.usage.promptTokens} in`);
console.log(`  время: ${t(Date.now() - t1)}`);
if (!topics.ok) process.exit(1);

const filtered = filterRepeatedTopics(topics.topics, existingTopics);
console.log(`  после фильтра повторов: ${filtered.kept.length} (отброшено ${filtered.skipped.length})`);
if (filtered.skipped.length > 0) {
  console.log(`  отброшено: ${filtered.skipped.map((t) => `«${t.title}»`).join(', ')}`);
}
if (filtered.kept.length === 0) process.exit(1);

// Фаза 2: поиск фактов
const t2 = Date.now();
const { pages, searched } = await searchFactPages(firecrawl, filtered.kept);
const withFacts = pages.filter((p) => p.facts.length > 0).length;
const factBase = buildFactBase(pages);
console.log(`\n[Фаза 2] поисков: ${searched}, страниц: ${pages.length} (с LLM-фактами: ${withFacts})`);
console.log(`  factBase: ${factBase.length} символов`);
console.log(`  время: ${t(Date.now() - t2)}`);
fs.writeFileSync('scripts/factbase-dump.txt', factBase);
if (!factBase) {
  console.error('Пустой факт-баз — Firecrawl ничего не вернул');
  process.exit(1);
}

// Фаза 3: генерация вопросов
const t3 = Date.now();
const genResult = await client.generate(
  buildGenerationPrompt({ count, category: null, existingTexts, factBase }),
  { webSearch: false, jsonObject: true, reasoning: { enabled: false }, maxTokens: 8192 },
);
fs.writeFileSync('scripts/phase3-raw.txt', genResult.rawText);
const normalized = normalizeGenerated(genResult.rawText, {
  existingIds,
  existingTexts,
  existingTopics,
});

console.log(`\n[Фаза 3] сырой ответ: ${genResult.rawText.length} символов`);
console.log(`  usage: ${genResult.usage.completionTokens} out, ${genResult.usage.promptTokens} in, ${genResult.usage.totalTokens} total`);
console.log(`  время: ${t(Date.now() - t3)}`);

if (!normalized.ok) {
  console.error(`\n[Фаза 3] ОШИБКА normalize: ${normalized.reason}`);
  console.log(`  последние 300 символов ответа:\n${genResult.rawText.slice(-300)}`);
  process.exit(1);
}

console.log(`\n=== ИТОГ ===`);
console.log(`Запрошено вопросов:  ${count}`);
console.log(`Полных валидных:      ${normalized.questions.length}`);
console.log(`Отклонено:            ${normalized.rejected.length}`);
const texts = new Set(normalized.questions.map((q) => q.question));
console.log(`Уникальных текстов:   ${texts.size}`);
console.log(`Общее время: ${t(Date.now() - started)}`);

if (normalized.questions.length < count) {
  console.log('\nРЕЗУЛЬТАТ: полных генераций МЕНЬШЕ запрошенного количества.');
  const diffs = new Set(normalized.rejected.map((r) => r.errors.join('; ')));
  if (diffs.size > 0) {
    console.log('Причины отклонения:');
    for (const d of diffs) console.log(`  - ${d}`);
  }
  process.exit(2);
}
console.log('\nРЕЗУЛЬТАТ: все запрошенные вопросы получены полностью.');
