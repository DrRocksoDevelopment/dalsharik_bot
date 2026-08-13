import type { Logger } from 'winston';

export const FIRECRAWL_CLOUD_BASE = 'https://api.firecrawl.dev';
export const FIRECRAWL_DEFAULT_BASE = 'http://localhost:3002';
const DEFAULT_TIMEOUT_MS = 60_000;

export interface FactPage {
  title: string | null;
  url: string;
  markdown: string | null;
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
      scrapeOptions: { formats: ['markdown'] },
    };
    if (options?.categories?.length) body.categories = options.categories;
    if (options?.sources?.length) body.sources = options.sources;

    const data = (await this.requestJson('/v2/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })) as {
      success?: boolean;
      data?: Array<{ url?: string; title?: string | null; markdown?: string | null }>;
    };

    const items = Array.isArray(data.data) ? data.data : [];
    const pages = items
      .filter((item): item is { url: string; title?: string | null; markdown?: string | null } =>
        typeof item.url === 'string' && item.url !== '',
      )
      .map((item) => ({
        title: item.title ?? null,
        url: item.url,
        markdown: item.markdown ?? null,
      }));

    this.logger?.debug('Firecrawl: поиск завершён', {
      query,
      baseUrl: this.baseUrl,
      mode: this.mode,
      results: pages.length,
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
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new FirecrawlError(
        null,
        aborted
          ? `таймаут запроса к Firecrawl (${Math.round(this.timeoutMs / 1000)} c)`
          : `Firecrawl недоступен: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new FirecrawlError(response.status, this.errorForStatus(response.status, bodyText));
    }
    return response.json() as Promise<unknown>;
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
): FirecrawlClient {
  return new FirecrawlHttpClient({ baseUrl, apiKey });
}
