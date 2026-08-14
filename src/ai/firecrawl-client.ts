import type { Logger } from 'winston';

export const FIRECRAWL_CLOUD_BASE = 'https://api.firecrawl.dev';
export const FIRECRAWL_DEFAULT_BASE = 'http://localhost:3002';
const DEFAULT_TIMEOUT_MS = 300_000;

export interface FactPage {
  title: string | null;
  url: string;
  markdown: string | null;
  description: string | null;
  facts: { fact: string; sourceUrl: string }[];
}

export interface FirecrawlSearchOptions {
  limit?: number;
  categories?: string[];
  sources?: string[];
}

export class FirecrawlError extends Error {
  readonly status: number | null;
  constructor(status: number | null, message: string) {
    super(message);
    this.name = 'FirecrawlError';
    this.status = status;
  }
}

export interface FirecrawlClientDeps {
  baseUrl: string;
  apiKey?: string | null;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  logger?: Logger;
}

export interface FirecrawlClient {
  readonly baseUrl: string;
  readonly mode: 'cloud' | 'local';
  search(query: string, options?: FirecrawlSearchOptions): Promise<FactPage[]>;
}

const FACTS_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fact: { type: 'string', description: 'Факт о событии с датой' },
          sourceUrl: { type: 'string', description: 'URL-источник факта' },
        },
      },
    },
  },
};

interface SearchWebItem {
  url?: string;
  title?: string | null;
  markdown?: string | null;
  description?: string | null;
  json?: { facts?: Array<{ fact?: string; sourceUrl?: string }> };
}

export class FirecrawlHttpClient implements FirecrawlClient {
  readonly baseUrl: string;
  readonly mode: 'cloud' | 'local';
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly logger?: Logger;

  constructor(deps: FirecrawlClientDeps) {
    this.baseUrl = deps.baseUrl.replace(/\/+$/, '');
    this.mode = deps.apiKey ? 'cloud' : 'local';
    this.apiKey = deps.apiKey ?? undefined;
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = deps.fetchFn ?? globalThis.fetch;
    this.logger = deps.logger;
  }

  async search(query: string, options?: FirecrawlSearchOptions): Promise<FactPage[]> {
    const limit = options?.limit ?? 5;
    const body: Record<string, unknown> = {
      query,
      limit,
      scrapeOptions: { formats: ['markdown', { type: 'json', schema: FACTS_SCHEMA }] },
    };
    if (options?.categories?.length) body.categories = options.categories;
    if (options?.sources?.length) body.sources = options.sources;

    const data = (await this.requestJson('/v2/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })) as {
      success?: boolean;
      data?: SearchWebItem[] | { web?: SearchWebItem[] } | null;
    };

    const raw = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.data?.web)
        ? data.data.web
        : [];
    const pages = raw
      .filter((item): item is SearchWebItem & { url: string } =>
        typeof item.url === 'string' && item.url !== '',
      )
      .map((item) => ({
        title: item.title ?? null,
        url: item.url,
        markdown: item.markdown ?? null,
        description: item.description ?? null,
        facts: (item.json?.facts ?? [])
          .filter((f): f is { fact: string; sourceUrl: string } =>
            typeof f.fact === 'string' && typeof f.sourceUrl === 'string',
          )
          .map((f) => ({ fact: f.fact, sourceUrl: f.sourceUrl })),
      }));

    this.logger?.debug('Firecrawl: поиск завершён', {
      query,
      baseUrl: this.baseUrl,
      mode: this.mode,
      results: pages.length,
      withFacts: pages.filter((p) => p.facts.length > 0).length,
    });
    return pages;
  }

  private async requestJson(path: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      const headers = new Headers(init?.headers);
      headers.set('Content-Type', 'application/json');
      if (this.apiKey) headers.set('Authorization', `Bearer ${this.apiKey}`);
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
      });
    } catch (err) {
      clearTimeout(timer);
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new FirecrawlError(
        null,
        aborted
          ? `таймаут запроса к Firecrawl (${Math.round(this.timeoutMs / 1000)} c)`
          : `Firecrawl недоступен: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new FirecrawlError(response.status, this.errorForStatus(response.status, bodyText));
      }
      return (await response.json()) as Promise<unknown>;
    } catch (err) {
      if (err instanceof FirecrawlError) throw err;
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new FirecrawlError(
        null,
        aborted
          ? `таймаут чтения ответа Firecrawl (${Math.round(this.timeoutMs / 1000)} c)`
          : `Firecrawl не вернул тело: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private errorForStatus(status: number, body: string): string {
    const detail = body.slice(0, 300).trim();
    switch (status) {
      case 401:
        return 'неверный ключ Firecrawl (401)';
      case 429:
        return 'превышен лимит запросов Firecrawl (429)';
      default:
        return detail ? `Firecrawl HTTP ${status}: ${detail}` : `Firecrawl HTTP ${status}`;
    }
  }
}

export function createFirecrawlClient(
  baseUrl: string,
  apiKey?: string | null,
  timeoutMs?: number,
): FirecrawlClient {
  return new FirecrawlHttpClient({ baseUrl, apiKey, timeoutMs });
}
