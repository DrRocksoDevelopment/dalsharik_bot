import type { FactPage } from './firecrawl-client.js';

export interface FactBaseOptions {
  perPageChars?: number;
  totalChars?: number;
}

const DEFAULT_PER_PAGE_CHARS = 2500;
const DEFAULT_TOTAL_CHARS = 18_000;

export function buildFactBase(pages: FactPage[], options?: FactBaseOptions): string {
  const perPageChars = options?.perPageChars ?? DEFAULT_PER_PAGE_CHARS;
  const totalChars = options?.totalChars ?? DEFAULT_TOTAL_CHARS;

  const seen = new Set<string>();
  const blocks: string[] = [];
  let used = 0;

  for (const page of pages) {
    const url = page.url.trim();
    if (!url || seen.has(url)) continue;
    if (!page.markdown || page.markdown.trim() === '') continue;
    seen.add(url);

    const budget = totalChars - used;
    if (budget <= 0) break;

    const raw = page.markdown.trim();
    const body = raw.length > perPageChars ? `${raw.slice(0, perPageChars)}…` : raw;
    const text = body.slice(0, budget);
    used += text.length;

    const title = page.title?.trim() ?? url;
    blocks.push(`### ${title}\nURL: ${url}\n\n${text}`);
  }

  if (blocks.length === 0) return '';

  return `## FACT BASE — проверенные факты и источники из веб-поиска

Используй ТОЛЬКО эти факты для создания вопросов. Ссылки в sources бери ТОЛЬКО из URL ниже. Не выдумывай ничего за пределами фактов из этого блока.

${blocks.join('\n\n---\n\n')}`;
}
