import { describe, expect, it } from 'vitest';
import { buildFactBase } from '../src/ai/fact-base.js';
import type { FactPage } from '../src/ai/firecrawl-client.js';

function page(url: string, markdown: string, title?: string): FactPage {
  return { url, markdown, title: title ?? null };
}

describe('buildFactBase', () => {
  it('пустой список → пустая строка', () => {
    expect(buildFactBase([])).toBe('');
  });

  it('страницы без markdown пропускаются', () => {
    expect(buildFactBase([page('https://a.com', '')])).toBe('');
    expect(buildFactBase([page('https://a.com', '   ')])).toBe('');
  });

  it('дедуплицирует по URL', () => {
    const base = buildFactBase([
      page('https://a.com', 'Факт A'),
      page('https://a.com', 'Факт A копия'),
      page('https://b.com', 'Факт B'),
    ]);
    expect(base).toContain('Факт A');
    expect(base).not.toContain('Факт A копия');
    expect(base).toContain('Факт B');
  });

  it('включает URL страниц и заголовки', () => {
    const base = buildFactBase([page('https://a.com', 'Текст', 'Заголовок')]);
    expect(base).toContain('## FACT BASE');
    expect(base).toContain('### Заголовок');
    expect(base).toContain('URL: https://a.com');
  });

  it('обрезает длинный markdown до лимита на страницу', () => {
    const base = buildFactBase([page('https://a.com', 'x'.repeat(5000))], { perPageChars: 100 });
    const body = base.slice(base.indexOf('URL: https://a.com'));
    expect(body.length).toBeLessThan(300);
    expect(body).toContain('…');
  });

  it('уважает общий бюджет', () => {
    const base = buildFactBase(
      [page('https://a.com', 'A'.repeat(2000)), page('https://b.com', 'B'.repeat(2000))],
      { totalChars: 500 },
    );
    expect(base).toContain('A'.repeat(500));
    expect(base).not.toContain('https://b.com');
  });
});
