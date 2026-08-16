import { describe, expect, it, vi } from 'vitest';
import { buildTopicsPrompt, parseTopics, searchFactPages } from '../src/ai/fact-search.js';
import type { FirecrawlClient, FactPage } from '../src/ai/firecrawl-client.js';

describe('buildTopicsPrompt', () => {
  it('предлагает ровно столько тем, сколько запрошено', () => {
    const prompt = buildTopicsPrompt({ count: 5, category: 'history', existingTexts: [] });
    expect(prompt).toContain('Предложи 5 разных реальных');
    expect(prompt).toContain('ровно 5');
    expect(prompt).toContain('История (history)');
  });

  it('ограничивает число тем сверху', () => {
    const prompt = buildTopicsPrompt({ count: 25, category: null, existingTexts: [] });
    expect(prompt).toContain('ровно 24');
  });

  it('передаёт чёрный список существующих вопросов', () => {
    const prompt = buildTopicsPrompt({
      count: 3,
      category: null,
      existingTexts: ['Вопрос про Рим'],
    });
    expect(prompt).toContain('Вопрос про Рим');
  });

  it('передаёт чёрный список существующих тем событий', () => {
    const prompt = buildTopicsPrompt({
      count: 3,
      category: null,
      existingTopics: ['Падение Рима'],
    });
    expect(prompt).toContain('Падение Рима');
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

  function page(url: string, markdown: string | null, extra: Partial<FactPage> = {}): FactPage {
    return { title: 't', url, markdown, description: null, facts: [], ...extra };
  }

  it('собирает страницы с фактами, описанием или markdown', async () => {
    const fc = stubFirecrawl({
      'тема 1': [
        page('https://a.com', 'факты A'),
        page('https://b.com', null),
        page('https://d.com', null, { description: 'описание' }),
        page('https://e.com', 'x', { facts: [{ fact: 'LLM-факт', sourceUrl: 'https://e.com' }] }),
      ],
      'тема 2': [page('https://c.com', 'факты C')],
    });
    const { pages, searched } = await searchFactPages(fc, [
      { title: 'Т1', query: 'тема 1' },
      { title: 'Т2', query: 'тема 2' },
    ]);
    expect(searched).toBe(2);
    expect(pages.map((p) => p.url)).toEqual([
      'https://a.com',
      'https://d.com',
      'https://e.com',
      'https://c.com',
    ]);
  });

  it('ошибка отдельного поиска не роняет остальные', async () => {
    const fc = stubFirecrawl(
      { 'тема 2': [page('https://c.com', 'факты C')] },
      new Set(['тема 1']),
    );
    const { pages, searched } = await searchFactPages(fc, [
      { title: 'Т1', query: 'тема 1' },
      { title: 'Т2', query: 'тема 2' },
    ]);
    expect(searched).toBe(2);
    expect(pages).toHaveLength(1);
  });

  it('onProgress вызывается после каждой темы с накопленным числом', async () => {
    const fc = stubFirecrawl({
      'тема 1': [page('https://a.com', 'факты A')],
      'тема 2': [page('https://b.com', 'факты B')],
    });
    const progress: Array<{ done: number; total: number; pages: number }> = [];
    await searchFactPages(
      fc,
      [
        { title: 'Т1', query: 'тема 1' },
        { title: 'Т2', query: 'тема 2' },
      ],
      {
        concurrency: 1,
        onProgress: (p) => {
          progress.push({ done: p.done, total: p.total, pages: p.totalPages });
        },
      },
    );
    expect(progress).toEqual([
      { done: 1, total: 2, pages: 1 },
      { done: 2, total: 2, pages: 2 },
    ]);
  });

  it('onProgress помечает неудачные темы', async () => {
    const fc = stubFirecrawl({ 'тема 2': [page('https://b.com', 'факты B')] }, new Set(['тема 1']));
    const failed: number[] = [];
    await searchFactPages(
      fc,
      [
        { title: 'Т1', query: 'тема 1' },
        { title: 'Т2', query: 'тема 2' },
      ],
      {
        concurrency: 1,
        onProgress: (p) => {
          failed.push(p.failed);
        },
      },
    );
    expect(failed).toEqual([1, 1]);
  });
});
