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

Предложи {count} разных реальных исторических/научных/технологических событий (по категории), по которым можно составить вопрос «Что произошло дальше?»: игроку показывают контекст события, а он угадывает ПОСЛЕДУЮЩЕЕ событие. Количество тем в твоём ответе должно быть ровно {count}.

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
  existingTopics?: string[];
  existingTexts?: string[];
}): string {
  const topicsCount = Math.min(opts.count, MAX_TOPICS);
  const categoryLine = opts.category
    ? `Категория: ${categoryLabel(opts.category)} (${opts.category})`
    : `Категории: смешай все — ${['history', 'science', 'technology', 'culture', 'geography']
        .map(categoryLabel)
        .join(', ')}`;
  const blacklistTopics =
    opts.existingTopics && opts.existingTopics.length > 0
      ? `\nТемы этих событий УЖЕ ЕСТЬ (не предлагай их):\n${opts.existingTopics
          .slice(0, 100)
          .map((t) => `- ${t}`)
          .join('\n')}`
      : '';
  const blacklistTexts =
    opts.existingTexts && opts.existingTexts.length > 0
      ? `\nВопросы с этими темами УЖЕ ЕСТЬ (не используй их):\n${opts.existingTexts
          .slice(0, 40)
          .map((t) => `- ${t}`)
          .join('\n')}`
      : '';

  return `${DEFAULT_TOPICS_PROMPT.replaceAll('{count}', String(topicsCount))}

${categoryLine}${blacklistTopics}${blacklistTexts}`;
}

function normalizeQuotes(text: string): string {
  let out = '';
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inDouble) {
      out += c;
      if (c === '\\' && text[i + 1] !== undefined) {
        out += text[i + 1]!;
        i += 1;
        continue;
      }
      if (c === '"') inDouble = false;
      continue;
    }
    if (inSingle) {
      if (c === '\\' && text[i + 1] !== undefined) {
        out += c + text[i + 1]!;
        i += 1;
        continue;
      }
      if (c === "'") {
        out += '"';
        inSingle = false;
        continue;
      }
      if (c === '"') {
        out += '\\"';
        continue;
      }
      out += c;
      continue;
    }
    if (c === '"') {
      inDouble = true;
      out += c;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      out += '"';
      continue;
    }
    out += c;
  }
  return out;
}

function quoteKeys(text: string): string {
  let out = '';
  let inStr = false;
  let pendingKey = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      out += c;
      if (c === '\\' && text[i + 1] !== undefined) {
        out += text[i + 1]!;
        i += 1;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      pendingKey = false;
      continue;
    }
    if (c === '{' || c === ',' || c === '[') {
      out += c;
      pendingKey = c !== '[';
      continue;
    }
    if (c === '}' || c === ']') {
      out += c;
      pendingKey = false;
      continue;
    }
    if (pendingKey) {
      if (c === ':') {
        out += c;
        pendingKey = false;
        continue;
      }
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
        out += c;
        continue;
      }
      let j = i;
      let key = '';
      while (j < text.length) {
        const k = text[j]!;
        if (k === ':' || k === '{' || k === '}' || k === '[' || k === ']' || k === ',') break;
        key += k;
        j += 1;
      }
      if (j < text.length && text[j] === ':') {
        out += '"' + key.trim() + '"' + text[j];
        i = j;
        pendingKey = false;
        continue;
      }
      out += c;
      pendingKey = false;
      continue;
    }
    out += c;
  }
  return out;
}

function removeTrailingCommas(text: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      out += c;
      if (c === '\\' && text[i + 1] !== undefined) {
        out += text[i + 1]!;
        i += 1;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      continue;
    }
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j]!)) j += 1;
      if (text[j] === '}' || text[j] === ']') continue;
    }
    out += c;
  }
  return out;
}

function balanceClose(text: string): string {
  const stack: string[] = [];
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}') stack.pop();
    else if (c === ']') stack.pop();
  }
  return stack.reverse().join('');
}

function tryParseClosed(text: string): unknown | null {
  const closers: number[] = [];
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '}' || c === ']') closers.push(i);
  }
  for (const pos of closers.reverse()) {
    const candidate = text.slice(0, pos + 1);
    try {
      return JSON.parse(candidate + balanceClose(candidate));
    } catch {
      // пробуем обрезать раньше
    }
  }
  return null;
}

function tryParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    // невалидный как есть — пробуем починить
  }
  const candidates = [
    normalizeQuotes(text),
    quoteKeys(normalizeQuotes(text)),
    removeTrailingCommas(quoteKeys(normalizeQuotes(text))),
  ];
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // пробуем следующий кандидат
    }
  }
  for (const c of candidates) {
    const recovered = tryParseClosed(c);
    if (recovered !== null) return recovered;
  }
  return null;
}

export function parseTopics(
  text: string,
): { ok: true; topics: TopicCandidate[] } | { ok: false; reason: string } {
  const trimmed = text.trim().replace(/^\uFEFF/, '');
  const fenced = /^```(?:json)?\s*([\s\S]*?)```\s*$/.exec(trimmed);
  const jsonText = fenced ? fenced[1]!.trim() : trimmed;
  const parsed = tryParse(jsonText);
  if (parsed === null) {
    return { ok: false, reason: 'невалидный JSON тем' };
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
        if (page.facts.length > 0 || page.description || page.markdown) pages.push(page);
      }
    } catch {
      // Ошибка отдельного поиска не роняет весь факт-пак: считаем поиск выполненным,
      // страницы не добавляем — итоговый сбой обработается на уровне пустого факт-база.
      searched += 1;
    }
  });
  return { pages, searched };
}
