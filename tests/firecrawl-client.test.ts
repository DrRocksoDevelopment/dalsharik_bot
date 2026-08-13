import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FirecrawlError,
  FIRECRAWL_CLOUD_BASE,
  createFirecrawlClient,
  type FirecrawlHttpClient,
} from '../src/ai/firecrawl-client.js';

function jsonResponse(body: unknown, init: Partial<Response> = {}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => '',
    ...init,
  } as Response;
}

describe('FirecrawlHttpClient', () => {
  let fetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function firstFetchCall(): [string, RequestInit] {
    return fetchFn.mock.calls[0] as [string, RequestInit];
  }

  it('облако: шлёт запрос с Authorization Bearer', async () => {
    fetchFn.mockResolvedValue(
      jsonResponse({
        success: true,
        data: [{ url: 'https://example.com', title: 'Пример', markdown: 'Текст' }],
      }),
    );
    const client = createFirecrawlClient(
      FIRECRAWL_CLOUD_BASE,
      'fc-test',
    ) as FirecrawlHttpClient;
    const pages = await client.search('историческое событие', { limit: 3 });

    const [url, init] = firstFetchCall();
    expect(url).toBe(`${FIRECRAWL_CLOUD_BASE}/v2/search`);
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer fc-test');
    expect(headers.get('Content-Type')).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ query: 'историческое событие', limit: 3 });
    expect(body.scrapeOptions.formats).toContain('markdown');
    expect(pages).toEqual([{ title: 'Пример', url: 'https://example.com', markdown: 'Текст' }]);
    expect(client.mode).toBe('cloud');
  });

  it('локально: шлёт запрос без Authorization', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ data: [] }));
    const client = createFirecrawlClient('http://localhost:3002', null) as FirecrawlHttpClient;
    await client.search('запрос');

    const [, init] = firstFetchCall();
    const headers = new Headers(init.headers);
    expect(headers.has('Authorization')).toBe(false);
    expect(client.mode).toBe('local');
  });

  it('отбрасывает записи без URL, оставляет остальные как есть', async () => {
    fetchFn.mockResolvedValue(
      jsonResponse({
        data: [
          { url: 'https://a.com', markdown: 'ok' },
          { url: '', markdown: 'no url' },
          { title: 'no url at all' },
          { url: 'https://b.com', markdown: null },
        ],
      }),
    );
    const client = createFirecrawlClient('http://localhost:3002', null) as FirecrawlHttpClient;
    const pages = await client.search('q');
    expect(pages).toEqual([
      { title: null, url: 'https://a.com', markdown: 'ok' },
      { title: null, url: 'https://b.com', markdown: null },
    ]);
  });

  it('401 → FirecrawlError с понятным сообщением', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ success: false }, { ok: false, status: 401 }));
    const client = createFirecrawlClient(FIRECRAWL_CLOUD_BASE, 'bad') as FirecrawlHttpClient;
    await expect(client.search('q')).rejects.toThrow('неверный ключ Firecrawl (401)');
  });

  it('429 → FirecrawlError с лимитом', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ success: false }, { ok: false, status: 429 }));
    const client = createFirecrawlClient(FIRECRAWL_CLOUD_BASE, 'k') as FirecrawlHttpClient;
    const err = await client.search('q').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FirecrawlError);
    expect((err as FirecrawlError).message).toContain('лимит');
    expect((err as FirecrawlError).status).toBe(429);
  });

  it('сетевой сбой → FirecrawlError (не глотает)', async () => {
    fetchFn.mockRejectedValue(new Error('ECONNREFUSED'));
    const client = createFirecrawlClient('http://localhost:3002', null) as FirecrawlHttpClient;
    const err = await client.search('q').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FirecrawlError);
    expect((err as FirecrawlError).message).toContain('Firecrawl недоступен');
  });
});
