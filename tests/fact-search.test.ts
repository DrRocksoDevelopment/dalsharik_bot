import { describe, expect, it, vi } from 'vitest';
import { buildTopicsPrompt, parseTopics, searchFactPages } from '../src/ai/fact-search.js';
import type { FirecrawlClient, FactPage } from '../src/ai/firecrawl-client.js';

describe('buildTopicsPrompt', () => {
  it('предлагает ровно столько тем, сколько запрошено', () => {
    const prompt = buildTopicsPrompt({ count: 5, category: 'history', existingTexts: [] });
    expect(prompt).toContain('Предложи 5 тем');
    expect(prompt).toContain('История (history)');
  });

  it('ограничивает число тем сверху', () => {
    const prompt = buildTopicsPrompt({ count: 25, category: null, existingTexts: [] });
    expect(prompt).toContain('Предложи 24 тем');
  });

  it('передаёт чёрный список существующих вопросов', () => {
    const prompt = buildTopicsPrompt({
      count: 3,
      category: null,
      existingTexts: ['Вопрос про Рим'],
    });
    expect(prompt).toContain('Вопрос про Рим');
  });
});

describe('parseTopics', () => {
  it('парсит объект с полем topics', () => {
    const res = parseTopics(
      '{"topics":[{"title":"Аполлон-11","query":"высадка на Луну 1969"},{"title":"Падение Рима","query":"падение Западной Римской империи"}]}',
    );
    expect(res).toEqual({
      ok: true,
      topics: [
        { title: 'Аполлон-11', query: 'высадка на Луну 1969' },
        { title: 'Падение Рима', query: 'падение Западной Римской империи' },
      ],
    });
  });

  it('парсит массив напрямую', () => {
    const res = parseTopics('[{"title":"А","query":"q"}]');
    expect(res.ok).toBe(true);
  });

  it('снимает markdown-обёртку', () => {
    const res = parseTopics('```json\n{"topics":[{"title":"А","query":"q"}]}\n```');
    expect(res.ok).toBe(true);
  });

  it('невалидный JSON → причина', () => {
    const res = parseTopics('это не JSON');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('невалидный JSON');
  });

  it('пустые поля отбрасываются, пустой результат → причина', () => {
    const res = parseTopics('{"topics":[{"title":"","query":""}]}');
    expect(res).toEqual({ ok: false, reason: 'нет валидных тем' });
  });

  it('восстанавливает JSON с одинарными кавычками', () => {
    const res = parseTopics(
      "{'topics':[{'title':'Аполлон-11','query':'высадка на Луну 1969'},{'title':'Падение Рима','query':'падение Римской империи'}]}",
    );
    expect(res).toEqual({
      ok: true,
      topics: [
        { title: 'Аполлон-11', query: 'высадка на Луну 1969' },
        { title: 'Падение Рима', query: 'падение Римской империи' },
      ],
    });
  });

  it('восстанавливает JSON с ключами без кавычек', () => {
    const res = parseTopics(
      '{topics: [{title: "Аполлон-11", query: "высадка на Луну 1969"}, {title: "Падение Рима", query: "падение Римской империи"}]}',
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.topics).toHaveLength(2);
  });

  it('убирает хвостовые запятые', () => {
    const res = parseTopics(
      '{"topics":[{"title":"А","query":"q"},{"title":"Б","query":"r"},]}',
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.topics).toHaveLength(2);
  });

  it('спасает темы из обрезанного JSON (модель оборвала ответ)', () => {
    const truncated =
      '{"topics":[{"title":"Аполлон-11","query":"высадка на Луну 1969"},{"title":"Падение Рима","query":"падение Римской империи"}';
    const res = parseTopics(truncated);
    expect(res).toEqual({
      ok: true,
      topics: [
        { title: 'Аполлон-11', query: 'высадка на Луну 1969' },
        { title: 'Падение Рима', query: 'падение Римской империи' },
      ],
    });
  });
});

describe('searchFactPages', () => {
  function stubFirecrawl(pagesByQuery: Record<string, FactPage[]>, fails?: Set<string>): FirecrawlClient {
    return {
      mode: 'local',
      baseUrl: 'http://localhost:3002',
      search: vi.fn(async (query: string) => {
        if (fails?.has(query)) throw new Error('boom');
        return pagesByQuery[query] ?? [];
      }),
    };
  }

  it('собирает страницы только с markdown', async () => {
    const fc = stubFirecrawl({
      'тема 1': [
        { title: 'A', url: 'https://a.com', markdown: 'факты A' },
        { title: 'B', url: 'https://b.com', markdown: null },
      ],
      'тема 2': [{ title: 'C', url: 'https://c.com', markdown: 'факты C' }],
    });
    const { pages, searched } = await searchFactPages(fc, [
      { title: 'Т1', query: 'тема 1' },
      { title: 'Т2', query: 'тема 2' },
    ]);
    expect(searched).toBe(2);
    expect(pages.map((p) => p.url)).toEqual(['https://a.com', 'https://c.com']);
  });

  it('ошибка отдельного поиска не роняет остальные', async () => {
    const fc = stubFirecrawl(
      { 'тема 2': [{ title: 'C', url: 'https://c.com', markdown: 'факты C' }] },
      new Set(['тема 1']),
    );
    const { pages, searched } = await searchFactPages(fc, [
      { title: 'Т1', query: 'тема 1' },
      { title: 'Т2', query: 'тема 2' },
    ]);
    expect(searched).toBe(2);
    expect(pages).toHaveLength(1);
  });
});
