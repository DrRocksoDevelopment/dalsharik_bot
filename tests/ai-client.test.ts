import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterClient, OpenRouterError, getOrCreateClient } from '../src/ai/openrouter-client.js';

const PRICING_BODY = JSON.stringify({
  data: [
    {
      id: 'test/model',
      pricing: { prompt: '0.000001', completion: '0.000002', web_search: '0.001' },
    },
  ],
});

function completionBody(content: string, usage: Record<string, unknown> = {}) {
  return JSON.stringify({
    choices: [{ message: { role: 'assistant', content } }],
    usage: {
      prompt_tokens: 1000,
      completion_tokens: 500,
      total_tokens: 1500,
      ...usage,
    },
  });
}

function makeFetchMock(): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/models')) {
      return new Response(PRICING_BODY, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(completionBody('[{"ok":true}]'), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OpenRouterClient.generate', () => {
  it('шлёт запрос в chat/completions с web_search tool', async () => {
    const fetchMock = makeFetchMock();
    const client = new OpenRouterClient({ apiKey: 'k', model: 'test/model', fetchFn: fetchMock as unknown as typeof fetch });
    await client.generate('сгенерируй');
    const url = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/chat/completions'));
    expect(url).toBeTruthy();
    const init = url![1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('test/model');
    expect(body.tools).toEqual([
      { type: 'openrouter:web_search', parameters: { max_results: 3 } },
    ]);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(init.headers).toMatchObject({ Authorization: 'Bearer k' });
  });

  it('заголовок X-OpenRouter-Title содержит только ASCII-символы', async () => {
    const fetchMock = makeFetchMock();
    const client = new OpenRouterClient({ apiKey: 'k', model: 'test/model', fetchFn: fetchMock as unknown as typeof fetch });
    await client.generate('сгенерируй');
    const url = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/chat/completions'));
    const init = url![1] as RequestInit;
    const title = (init.headers as Record<string, string>)['X-OpenRouter-Title'];
    expect(title).toBe('Dalsharik');
    expect([...title!].every((c) => c.charCodeAt(0) <= 255)).toBe(true);
  });

  it('рассчитывает стоимость с учётом web-поиска', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
    if (url.endsWith('/models')) {
        return new Response(PRICING_BODY, { status: 200 });
      }
      return new Response(
        completionBody('[{"ok":true}]', {
          server_tool_use: { web_search_requests: 3 },
          cost: 0.5,
        }),
        { status: 200 },
      );
    });
    const client = new OpenRouterClient({ apiKey: 'k', model: 'test/model', fetchFn: fetchMock as unknown as typeof fetch });
    const { rawText, usage } = await client.generate('prompt');
    expect(rawText).toBe('[{"ok":true}]');
    expect(usage.promptTokens).toBe(1000);
    expect(usage.completionTokens).toBe(500);
    expect(usage.webSearchRequests).toBe(3);
    expect(usage.inferenceCostUsd).toBeCloseTo(1000 * 0.000001 + 500 * 0.000002);
    expect(usage.searchCostUsd).toBeCloseTo(3 * 0.001);
    expect(usage.estimatedCostUsd).toBeCloseTo(usage.inferenceCostUsd + usage.searchCostUsd);
    expect(usage.totalCostCredits).toBe(0.5);
  });

  it('считает поиск по нулевой цене, если у модели нет pricing.web_search', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
    if (url.endsWith('/models')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'test/model', pricing: { prompt: '0', completion: '0' } }] }),
          { status: 200 },
        );
      }
      return new Response(
        completionBody('[]', { server_tool_use: { web_search_requests: 2 } }),
        { status: 200 },
      );
    });
    const client = new OpenRouterClient({ apiKey: 'k', model: 'test/model', fetchFn: fetchMock as unknown as typeof fetch });
    const { usage } = await client.generate('prompt');
    expect(usage.searchCostUsd).toBe(0);
    expect(usage.webSearchRequests).toBe(2);
  });

  it('кэширует прайс модели между вызовами', async () => {
    const fetchMock = makeFetchMock();
    const client = new OpenRouterClient({ apiKey: 'k', model: 'test/model', fetchFn: fetchMock as unknown as typeof fetch });
    await client.generate('a');
    await client.generate('b');
    const modelsCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/models'));
    expect(modelsCalls).toHaveLength(1);
  });

  it('без web_search не шлёт tools/provider и применяет свои temperature/max_tokens', async () => {
    const fetchMock = makeFetchMock();
    const client = new OpenRouterClient({ apiKey: 'k', model: 'test/model', fetchFn: fetchMock as unknown as typeof fetch });
    await client.generate('план шоу', { temperature: 0.9, maxTokens: 800, webSearch: false });

    const url = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/chat/completions'));
    const init = url![1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.temperature).toBe(0.9);
    expect(body.max_tokens).toBe(800);
    expect(body.tools).toBeUndefined();
    expect(body.provider).toBeUndefined();
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('мапит 401 на «неверный ключ»', async () => {
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const client = new OpenRouterClient({ apiKey: 'bad', model: 'm', fetchFn: fetchMock as unknown as typeof fetch });
    await expect(client.generate('x')).rejects.toMatchObject({ status: 401 });
    await expect(client.generate('x')).rejects.toThrow('неверный ключ');
  });

  it('мапит 429 на «превышен лимит»', async () => {
    const fetchMock = vi.fn(async () => new Response('slow down', { status: 429 }));
    const client = new OpenRouterClient({ apiKey: 'k', model: 'm', fetchFn: fetchMock as unknown as typeof fetch });
    await expect(client.generate('x')).rejects.toMatchObject({ status: 429 });
  });

  it('бросает OpenRouterError на сетевой сбой', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const client = new OpenRouterClient({ apiKey: 'k', model: 'm', fetchFn: fetchMock as unknown as typeof fetch });
    const err = await client.generate('x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect((err as Error).message).toContain('сеть');
  });

  it('бросает OpenRouterError на таймаут (AbortError)', async () => {
    const fetchMock = vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    });
    const client = new OpenRouterClient({ apiKey: 'k', model: 'm', fetchFn: fetchMock as unknown as typeof fetch });
    const err = await client.generate('x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect((err as Error).message).toContain('таймаут');
  });

  it('обрабатывает content как массив частей (некоторые модели с tools)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
    if (url.endsWith('/models')) {
        return new Response(PRICING_BODY, { status: 200 });
      }
      return new Response(
        JSON.stringify({
          choices: [
            { message: { role: 'assistant', content: [{ type: 'text', text: '[{"a":1}]' }] } },
          ],
        }),
        { status: 200 },
      );
    });
    const client = new OpenRouterClient({ apiKey: 'k', model: 'test/model', fetchFn: fetchMock as unknown as typeof fetch });
    const { rawText } = await client.generate('x');
    expect(rawText).toBe('[{"a":1}]');
  });

  it('прокидывает reasoning в тело запроса', async () => {
    const fetchMock = makeFetchMock();
    const client = new OpenRouterClient({ apiKey: 'k', model: 'test/model', fetchFn: fetchMock as unknown as typeof fetch });
    await client.generate('темы', { reasoning: { effort: 'low' } });
    const url = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/chat/completions'));
    const init = url![1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.reasoning).toEqual({ effort: 'low' });
  });

  it('без reasoning не добавляет поле в тело', async () => {
    const fetchMock = makeFetchMock();
    const client = new OpenRouterClient({ apiKey: 'k', model: 'test/model', fetchFn: fetchMock as unknown as typeof fetch });
    await client.generate('темы');
    const url = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/chat/completions'));
    const init = url![1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.reasoning).toBeUndefined();
  });

  it('понятная ошибка, если модель потратила токены на размышления без текста', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/models')) {
        return new Response(PRICING_BODY, { status: 200 });
      }
      return new Response(
        JSON.stringify({
          choices: [
            { message: { role: 'assistant', content: null, reasoning: 'размышления...' } },
          ],
        }),
        { status: 200 },
      );
    });
    const client = new OpenRouterClient({ apiKey: 'k', model: 'test/model', fetchFn: fetchMock as unknown as typeof fetch });
    await expect(client.generate('x')).rejects.toThrow('размышления');
  });
});

describe('getOrCreateClient', () => {
  it('возвращает один инстанс на пару ключ+модель', () => {
    const a = getOrCreateClient('k1', 'm1');
    const b = getOrCreateClient('k1', 'm1');
    const otherModel = getOrCreateClient('k1', 'm2');
    const otherKey = getOrCreateClient('k2', 'm1');
    expect(a).toBe(b);
    expect(a).not.toBe(otherModel);
    expect(a).not.toBe(otherKey);
  });

  it('переиспользованный клиент не дёргает /models повторно', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/models')) {
        return new Response(PRICING_BODY, { status: 200 });
      }
      return new Response(completionBody('[{"ok":true}]'), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = getOrCreateClient('shared-key', 'shared/model');
    const second = getOrCreateClient('shared-key', 'shared/model');
    await first.generate('a');
    await second.generate('b');

    const modelsCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/models'));
    expect(modelsCalls).toHaveLength(1);

    vi.unstubAllGlobals();
  });
});


