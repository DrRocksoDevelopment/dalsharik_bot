import type { Category } from '../types/index.js';
import { categoryLabel } from '../content/messages.js';
import type { FirecrawlClient, FactPage } from './firecrawl-client.js';

const MAX_TOPICS = 24;
const DEFAULT_SEARCH_LIMIT = 2;
const DEFAULT_CONCURRENCY = 3;

export interface TopicCandidate {
  title: string;
  query: string;
}

export const DEFAULT_TOPICS_PROMPT = `Ты — составитель тем для викторины «Что было дальше?».

## Задача

Предложи {count} разных реальных исторических/научных/технологических событий (по категории), по которым можно составить вопрос «Что произошло дальше?»: игроку показывают контекст события, а он угадывает ПОСЛЕДУЮЩЕЕ событие.

## Требования

- События — только реальные, известные и проверяемые.
- Тема должна давать «продолжение»: после события произошло что-то конкретное и однозначное.
- Разнообразь события (разные эпохи, регионы, сферы), не повторяй темы между собой.
- Избегай тем, совпадающих с уже существующими вопросами (список ниже).

## Формат ответа

Верни ТОЛЬКО валидный JSON без markdown-обёрток, объект с полем "topics":
{
  "topics": [
    { "title": "Краткое название события", "query": "Поисковый запрос для подтверждения фактов (на русском или английском)" }
  ]
}`;

export function buildTopicsPrompt(opts: {
  count: number;
  category: Category | null;
  existingTexts: string[];
}): string {
  const topicsCount = Math.min(opts.count + 5, MAX_TOPICS);
  const categoryLine = opts.category
    ? `Категория: ${categoryLabel(opts.category)} (${opts.category})`
    : `Категории: смешай все — ${['history', 'science', 'technology', 'culture', 'geography']
        .map(categoryLabel)
        .join(', ')}`;
  const blacklist =
    opts.existingTexts.length > 0
      ? `\nТемы этих вопросов УЖЕ ЕСТЬ (не используй их):\n${opts.existingTexts
          .slice(0, 40)
          .map((t) => `- ${t}`)
          .join('\n')}`
      : '';

  return `${DEFAULT_TOPICS_PROMPT}

${categoryLine}
Предложи ${topicsCount} тем.${blacklist}`;
}

export function parseTopics(
  text: string,
): { ok: true; topics: TopicCandidate[] } | { ok: false; reason: string } {
  const trimmed = text.trim().replace(/^\uFEFF/, '');
  const fenced = /^```(?:json)?\s*([\s\S]*?)```\s*$/.exec(trimmed);
  const jsonText = fenced ? fenced[1]!.trim() : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return { ok: false, reason: `невалидный JSON тем: ${err instanceof Error ? err.message : String(err)}` };
  }
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed as { topics?: unknown } | null)?.topics;
  if (!Array.isArray(list)) {
    return { ok: false, reason: 'ожидался массив тем или объект с полем "topics"' };
  }
  const topics: TopicCandidate[] = [];
  for (const raw of list) {
    const rec = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    const query = typeof rec.query === 'string' ? rec.query.trim() : '';
    if (title && query) topics.push({ title, query });
  }
  if (topics.length === 0) return { ok: false, reason: 'нет валидных тем' };
  return { ok: true, topics };
}

async function withConcurrency<T>(items: T[], concurrency: number, run: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index]!;
      index += 1;
      await run(item);
    }
  });
  await Promise.all(workers);
}

export async function searchFactPages(
  firecrawl: FirecrawlClient,
  topics: TopicCandidate[],
  options?: { limit?: number; concurrency?: number },
): Promise<{ pages: FactPage[]; searched: number }> {
  const limit = options?.limit ?? DEFAULT_SEARCH_LIMIT;
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
  const pages: FactPage[] = [];
  let searched = 0;
  await withConcurrency(topics, concurrency, async (topic) => {
    try {
      const found = await firecrawl.search(topic.query, { limit });
      searched += 1;
      for (const page of found) {
        if (page.markdown) pages.push(page);
      }
    } catch {
      // Ошибка отдельного поиска не роняет весь факт-пак: считаем поиск выполненным,
      // страницы не добавляем — итоговый сбой обработается на уровне пустого факт-база.
      searched += 1;
    }
  });
  return { pages, searched };
}
