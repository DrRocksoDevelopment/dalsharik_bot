import type { FactPage } from './firecrawl-client.js';

export interface FactBaseOptions {
  perPageChars?: number;
  totalChars?: number;
}

const DEFAULT_PER_PAGE_CHARS = 2500;
const DEFAULT_TOTAL_CHARS = 18_000;

const BOILERPLATE = [
  'from wikipedia, the free encyclopedia',
  'redirect here.',
  'for other uses, see',
  'this article is about',
  'jump to content',
  'article](https://',
  'talk](https://',
  'view history',
];

function stripMarkdownImages(text: string): string {
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
}

function stripFootnoteRefs(text: string): string {
  return text.replace(/\[\^?\d+\]\([^)]*\)/g, '').replace(/\[(\d+)\]/g, '$1');
}

function stripInlineLinks(text: string): string {
  return text.replace(/\[([^\]]*)\]\(((?:[^()]|\([^)]*\))*)\)/g, '$1');
}

function stripHtmlTags(text: string): string {
  return text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');
}

function stripTocMarks(text: string): string {
  return text.replace(/[#]+/g, '').replace(/\*\*/g, '');
}

function isGarbageLine(line: string): boolean {
  const l = line.trim();
  if (l === '' || l === '|' || l === '|---|') return true;
  if (/^\s*\|/.test(line)) return true;
  if (/^\[\]\(/.test(l)) return true;
  if (/^!?\[/i.test(l) && !/\]\)/.test(l)) return true;
  if (/^[\-*]\s*\[(article|talk|view|watch|edit|read|history|permalink)/i.test(l)) return true;
  if (/^[\-*]\s*$/.test(l)) return true;
  const lower = l.toLowerCase();
  return BOILERPLATE.some((b) => lower.includes(b));
}

export function cleanMarkdown(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n');
  text = stripMarkdownImages(text);
  text = stripFootnoteRefs(text);
  text = stripInlineLinks(text);
  text = stripHtmlTags(text);
  text = stripTocMarks(text);

  const lines = text.split('\n');
  const kept: string[] = [];
  let blank = 0;
  for (const line of lines) {
    if (isGarbageLine(line)) {
      blank = 0;
      continue;
    }
    const clean = line.replace(/\s+/g, ' ').trim();
    if (clean === '') {
      blank += 1;
      if (blank < 2) kept.push('');
      continue;
    }
    blank = 0;
    kept.push(clean);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function pageContent(page: FactPage): string {
  if (page.facts.length > 0) {
    const lines = page.facts.map((f) => `- ${f.fact} (${f.sourceUrl})`);
    return lines.join('\n');
  }
  if (page.description) return page.description.trim();
  if (page.markdown) return cleanMarkdown(page.markdown);
  return '';
}

export function buildFactBase(pages: FactPage[], options?: FactBaseOptions): string {
  const perPageChars = options?.perPageChars ?? DEFAULT_PER_PAGE_CHARS;
  const totalChars = options?.totalChars ?? DEFAULT_TOTAL_CHARS;

  const seen = new Set<string>();
  const blocks: string[] = [];
  let used = 0;

  for (const page of pages) {
    const url = page.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const budget = totalChars - used;
    if (budget <= 0) break;

    const content = pageContent(page);
    if (content === '') continue;

    const body = content.length > perPageChars ? `${content.slice(0, perPageChars)}…` : content;
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
