import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenRouterClient } from '../src/ai/openrouter-client.js';
import { AI_SETTINGS_ID } from '../src/ai/types.js';
import { calculateResults } from '../src/game/stats.js';
import { AiHost, buildHostPrompt, parseShowPlan } from '../src/game/show/host.js';
import {
  makeLogger,
  makeQuestion,
  makeTempStore,
  type TempStore,
} from './helpers.js';
import type { AnswerRecord } from '../src/game/answer.js';
import type { TextStreamer } from '../src/telegram/stream.js';

const tempStores: TempStore[] = [];

afterEach(async () => {
  for (const t of tempStores.splice(0)) await t.cleanup();
});

function makeResults(answers: Partial<AnswerRecord>[] = []) {
  return calculateResults(answers as AnswerRecord[]);
}

function makeContext(overrides: Partial<Parameters<typeof buildHostPrompt>[0]> = {}) {
  return {
    chatTitle: 'История на ночь',
    question: makeQuestion(),
    results: makeResults(),
    users: new Map(),
    nextEventLocalTime: '15:00',
    ...overrides,
  };
}

function makeClient(lines: string[]) {
  const generate = vi.fn().mockResolvedValue({
    rawText: JSON.stringify({ lines }),
    usage: { totalTokens: 10 },
  });
  return { generate } as unknown as OpenRouterClient;
}

function makeStreamer() {
  const stream = vi.fn().mockResolvedValue(undefined);
  return { stream } as unknown as TextStreamer;
}

describe('buildHostPrompt', () => {
  it('содержит вопрос, правильный ответ, объяснение и распределение', () => {
    const prompt = buildHostPrompt(makeContext());
    expect(prompt).toContain('История на ночь');
    expect(prompt).toContain('Что произошло дальше?');
    expect(prompt).toContain('Правильный ответ: C — вариант C');
    expect(prompt).toContain('Объяснение правильного ответа');
    expect(prompt).toContain('Распределение');
  });

  it('не передаёт ведущему источники и следующее событие', () => {
    const prompt = buildHostPrompt(makeContext());
    expect(prompt).not.toContain('Источники:');
    expect(prompt).not.toContain('Следующее событие');
  });

  it('включает топ и серии при наличии', () => {
    const prompt = buildHostPrompt(
      makeContext({
        results: makeResults([{ userId: '1', selectedOption: 'C', isCorrect: true, points: 3 }]),
        users: new Map([['1', { id: '1', username: 'ivan', score: 3, currentStreak: 1 } as never]]),
        streakHighlights: [{ userId: '1', currentStreak: 1 }],
        chatStreakRecord: 7,
      }),
    );
    expect(prompt).toContain('Топ по очкам');
    expect(prompt).toContain('@ivan');
    expect(prompt).toContain('Серии');
    expect(prompt).toContain('Рекорд чата: 7');
  });
});

describe('parseShowPlan', () => {
  it('парсит валидный JSON-объект с lines', () => {
    const res = parseShowPlan('{"lines": ["Строка 1", "  ", "Строка 2"]}');
    expect(res).toEqual({ ok: true, lines: ['Строка 1', 'Строка 2'] });
  });

  it('принимает JSON в markdown-обёртке', () => {
    const res = parseShowPlan('```json\n{"lines": ["A", "B"]}\n```');
    expect(res.ok && res.lines).toEqual(['A', 'B']);
  });

  it('отклоняет невалидный JSON', () => {
    const res = parseShowPlan('не json');
    expect(res.ok).toBe(false);
  });

  it('отклоняет не тот формат (массив вместо объекта)', () => {
    const res = parseShowPlan('["A", "B"]');
    expect(res.ok).toBe(false);
  });

  it('отклоняет пустой план', () => {
    const res = parseShowPlan('{"lines": []}');
    expect(res.ok).toBe(false);
  });
});

describe('AiHost', () => {
  async function makeHost(options: {
    key?: string | null;
    model?: string | null;
    client?: OpenRouterClient;
    streamer?: TextStreamer;
    envApiKey?: string | null;
    envModel?: string | null;
  }) {
    const t = await makeTempStore();
    tempStores.push(t);
    if (options.key !== undefined || options.model !== undefined) {
      await t.store.aiSettings.insert({
        id: AI_SETTINGS_ID,
        apiKey: options.key ?? null,
        model: options.model ?? null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    }
    const host = new AiHost({
      logger: makeLogger(),
      store: t.store,
      streamer: options.streamer ?? makeStreamer(),
      envApiKey: options.envApiKey ?? null,
      envModel: options.envModel ?? null,
      createClient: () => options.client ?? makeClient([]),
    });
    return { host, store: t.store };
  }

  it('без ключа/модели возвращает static и не вызывает стример', async () => {
    const streamer = makeStreamer();
    const { host } = await makeHost({ key: null, model: null, streamer });
    const mode = await host.show('-100123', makeContext());
    expect(mode).toBe('static');
    expect(streamer.stream).not.toHaveBeenCalled();
  });

  it('использует ключ/модель из env при отсутствии настроек', async () => {
    const client = makeClient(['Привет!']);
    const streamer = makeStreamer();
    const { host } = await makeHost({
      client,
      streamer,
      envApiKey: 'env-key',
      envModel: 'env-model',
    });
    const mode = await host.show('-100123', makeContext());
    expect(mode).toBe('ai');
    expect(client.generate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ temperature: 0.9, maxTokens: 800, webSearch: false }),
    );
    expect(streamer.stream).toHaveBeenCalledWith('-100123', ['Привет!']);
  });

  it('стримит план и возвращает ai', async () => {
    const client = makeClient(['17 человек выбрали Б…', 'Жаль, что неправильно']);
    const streamer = makeStreamer();
    const { host } = await makeHost({ key: 'k', model: 'm', client, streamer });
    const mode = await host.show('-100123', makeContext());
    expect(mode).toBe('ai');
    expect(streamer.stream).toHaveBeenCalledWith('-100123', [
      '17 человек выбрали Б…',
      'Жаль, что неправильно',
    ]);
  });

  it('при невалидном плане возвращает static', async () => {
    const client = makeClient([]);
    client.generate = vi.fn().mockResolvedValue({ rawText: 'не json', usage: {} });
    const streamer = makeStreamer();
    const { host } = await makeHost({ key: 'k', model: 'm', client, streamer });
    const mode = await host.show('-100123', makeContext());
    expect(mode).toBe('static');
    expect(streamer.stream).not.toHaveBeenCalled();
  });

  it('при ошибке генерации возвращает static', async () => {
    const client = makeClient([]);
    client.generate = vi.fn().mockRejectedValue(new Error('сеть'));
    const streamer = makeStreamer();
    const { host } = await makeHost({ key: 'k', model: 'm', client, streamer });
    const mode = await host.show('-100123', makeContext());
    expect(mode).toBe('static');
    expect(streamer.stream).not.toHaveBeenCalled();
  });

  it('при ошибке стриминга возвращает static', async () => {
    const client = makeClient(['А', 'Б']);
    const streamer = makeStreamer();
    (streamer.stream as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('send fail'));
    const { host } = await makeHost({ key: 'k', model: 'm', client, streamer });
    const mode = await host.show('-100123', makeContext());
    expect(mode).toBe('static');
  });
});
