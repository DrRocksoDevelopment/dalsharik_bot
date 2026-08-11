import type { Logger } from 'winston';
import type { GenerationUsage } from './types.js';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 4096;

export interface ModelPricing {
  prompt: number;
  completion: number;
  webSearch: number;
}

export class OpenRouterError extends Error {
  readonly status: number | null;
  constructor(status: number | null, message: string) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
  }
}

interface ChatCompletionMessage {
  role: string;
  content?: string | unknown[] | null;
}

export interface OpenRouterClientDeps {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxTokens?: number;
  fetchFn?: typeof fetch;
  logger?: Logger;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  jsonObject?: boolean;
  webSearch?: boolean;
}

function parsePricingValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function extractContent(message: ChatCompletionMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const t = (part as { text?: unknown }).text;
          if (typeof t === 'string') return t;
        }
        return '';
      })
      .join('')
      .trim();
  }
  throw new OpenRouterError(null, 'модель не вернула текстовый ответ');
}

export class OpenRouterClient {
  private readonly apiKey: string;
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;
  private readonly fetchFn: typeof fetch;
  private readonly logger?: Logger;
  private pricing: ModelPricing | null = null;

  constructor(deps: OpenRouterClientDeps) {
    this.apiKey = deps.apiKey;
    this.model = deps.model;
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.fetchFn = deps.fetchFn ?? globalThis.fetch;
    this.logger = deps.logger;
  }

  private async requestJson(path: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(`${OPENROUTER_BASE}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-OpenRouter-Title': 'Dalsharik',
          ...init?.headers,
        },
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new OpenRouterError(
        null,
        aborted
          ? `таймаут запроса (${Math.round(this.timeoutMs / 1000)} c)`
          : `сеть: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new OpenRouterError(response.status, this.errorForStatus(response.status, body));
    }
    return response.json() as Promise<unknown>;
  }

  private errorForStatus(status: number, body: string): string {
    const detail = body.slice(0, 300).trim();
    switch (status) {
      case 401:
        return 'неверный ключ OpenRouter (401)';
      case 402:
        return 'недостаточно средств на счёте OpenRouter (402)';
      case 429:
        return 'превышен лимит запросов OpenRouter (429)';
      default:
        return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`;
    }
  }

  async getPricing(): Promise<ModelPricing> {
    if (this.pricing) return this.pricing;
    const data = (await this.requestJson('/models')) as {
      data?: { id: string; pricing?: Record<string, unknown> }[];
    };
    const entry = data.data?.find((m) => m.id === this.model);
    const p = entry?.pricing ?? {};
    this.pricing = {
      prompt: parsePricingValue(p.prompt),
      completion: parsePricingValue(p.completion),
      webSearch: parsePricingValue(p.web_search),
    };
    return this.pricing;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<{ rawText: string; usage: GenerationUsage }> {
    const temperature = options?.temperature ?? 0.8;
    const maxTokens = options?.maxTokens ?? this.maxTokens;
    const jsonObject = options?.jsonObject ?? true;
    const webSearch = options?.webSearch ?? true;

    const body: Record<string, unknown> = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    };
    if (jsonObject) body.response_format = { type: 'json_object' };
    if (webSearch) {
      body.tools = [{ type: 'openrouter:web_search', parameters: { max_results: 3 } }];
      body.provider = { require_parameters: true };
    }

    const [data, pricing] = await Promise.all([
      this.requestJson('/chat/completions', {
        method: 'POST',
        body: JSON.stringify(body),
      }) as Promise<{
        choices?: { message?: ChatCompletionMessage }[];
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          cost?: number | string;
          server_tool_use?: { web_search_requests?: number };
        };
      }>,
      this.getPricing(),
    ]);

    const message = data.choices?.[0]?.message;
    if (!message) throw new OpenRouterError(null, 'модель не вернула ответ (пустой choices)');

    const rawText = extractContent(message);
    const usageRaw = data.usage ?? {};
    const promptTokens = usageRaw.prompt_tokens ?? 0;
    const completionTokens = usageRaw.completion_tokens ?? 0;
    const webSearchRequests = usageRaw.server_tool_use?.web_search_requests ?? 0;
    const inferenceCostUsd = promptTokens * pricing.prompt + completionTokens * pricing.completion;
    const searchCostUsd = webSearchRequests * pricing.webSearch;
    const costRaw = usageRaw.cost;
    const totalCostCredits =
      typeof costRaw === 'number' && Number.isFinite(costRaw)
        ? costRaw
        : typeof costRaw === 'string' && costRaw.trim() !== ''
          ? Number(costRaw)
          : undefined;

    const usage: GenerationUsage = {
      promptTokens,
      completionTokens,
      totalTokens: usageRaw.total_tokens ?? promptTokens + completionTokens,
      webSearchRequests,
      totalCostCredits,
      estimatedCostUsd: inferenceCostUsd + searchCostUsd,
      inferenceCostUsd,
      searchCostUsd,
    };

    this.logger?.debug('OpenRouter: генерация завершена', {
      model: this.model,
      tokens: usage.totalTokens,
      webSearchRequests,
      estimatedCostUsd: usage.estimatedCostUsd,
    });

    return { rawText, usage };
  }
}
