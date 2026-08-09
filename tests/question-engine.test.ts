import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryQuestionEngine, type QuestionSelectorOptions } from '../src/game/question-engine.js';
import { makeQuestion } from './helpers.js';
import type { Question } from '../src/game/question.js';

const OPTS: QuestionSelectorOptions = {
  questionTypes: ['historical_next_event'],
  categories: ['history'],
  difficultyMin: 1,
  difficultyMax: 5,
  excludeQuestionIds: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('question engine', () => {
  it('фильтрует по типам, категориям и исключённым вопросам', async () => {
    const engine = new InMemoryQuestionEngine([
      makeQuestion({ id: 'q1', type: 'historical_next_event', category: 'history' }),
      makeQuestion({ id: 'q2', type: 'scientific_next_event', category: 'science' }),
      makeQuestion({ id: 'q3', type: 'historical_next_event', category: 'history' }),
    ]);

    const picked = await engine.selectNext({
      ...OPTS,
      excludeQuestionIds: ['q1'],
    });
    expect(picked?.id).toBe('q3');
  });

  it('возвращает null, если подходящих вопросов нет', async () => {
    const engine = new InMemoryQuestionEngine([makeQuestion({ id: 'q1' })]);
    const picked = await engine.selectNext({ ...OPTS, excludeQuestionIds: ['q1'] });
    expect(picked).toBeNull();
  });

  it('учитывает сложность от времени суток (утро -> 1-2)', async () => {
    const pool: Question[] = [];
    for (let d = 1; d <= 5; d++) {
      pool.push(makeQuestion({ id: `d${d}`, difficulty: d }));
    }
    const engine = new InMemoryQuestionEngine(pool);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const utcMorning = Date.parse('2026-08-09T05:00:00.000Z');
    const picked = await engine.selectNext({
      ...OPTS,
      now: utcMorning,
      timezoneOffsetMinutes: 180,
    });
    expect(picked?.difficulty).toBeLessThanOrEqual(2);
  });

  it('при пустом пересечении окна времени суток и диапазона чата использует диапазон чата', async () => {
    const pool: Question[] = [];
    for (let d = 1; d <= 5; d++) {
      pool.push(makeQuestion({ id: `d${d}`, difficulty: d }));
    }
    const engine = new InMemoryQuestionEngine(pool);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const utcMorning = Date.parse('2026-08-09T05:00:00.000Z');
    const picked = await engine.selectNext({
      ...OPTS,
      difficultyMin: 4,
      difficultyMax: 5,
      now: utcMorning,
      timezoneOffsetMinutes: 180,
    });
    expect(picked?.id).toBe('d4');
  });

  it('при вечернем окне, когда вопросы не проходят фильтр времени суток, использует фолбэк на диапазон чата', async () => {
    const engine = new InMemoryQuestionEngine([
      makeQuestion({ id: 'e1', difficulty: 2 }),
      makeQuestion({ id: 'e2', difficulty: 2 }),
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const utcEvening = Date.parse('2026-08-09T18:00:00.000Z');
    const picked = await engine.selectNext({
      ...OPTS,
      now: utcEvening,
      timezoneOffsetMinutes: 180,
      excludeQuestionIds: ['e1'],
    });
    expect(picked?.id).toBe('e2');
  });

  it('возвращает null, если вопросов нет даже с фолбэком на диапазон чата', async () => {
    const engine = new InMemoryQuestionEngine([
      makeQuestion({ id: 'q1', type: 'scientific_next_event' }),
    ]);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const utcEvening = Date.parse('2026-08-09T18:00:00.000Z');
    const picked = await engine.selectNext({
      ...OPTS,
      now: utcEvening,
      timezoneOffsetMinutes: 180,
    });
    expect(picked).toBeNull();
  });

  it('балансирует категории: редко использованная категория получает больший вес', async () => {
    const recentHistoryIds = ['h1', 'h2', 'h3', 'h4'];
    const engine = new InMemoryQuestionEngine([
      makeQuestion({ id: 'h1', category: 'history' }),
      makeQuestion({ id: 'h2', category: 'history' }),
      makeQuestion({ id: 'h3', category: 'history' }),
      makeQuestion({ id: 'h4', category: 'history' }),
      makeQuestion({ id: 'h5', category: 'history' }),
      makeQuestion({ id: 's1', category: 'science' }),
    ]);

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const picked = await engine.selectNext({
      ...OPTS,
      categories: ['history', 'science'],
      excludeQuestionIds: recentHistoryIds,
      recentQuestionIds: recentHistoryIds,
    });
    expect(picked?.id).toBe('s1');
  });

  it('тянет сложность к целевой уровню окна времени суток', async () => {
    const engine = new InMemoryQuestionEngine([
      makeQuestion({ id: 'd3', difficulty: 3 }),
      makeQuestion({ id: 'd4', difficulty: 4 }),
      makeQuestion({ id: 'd5', difficulty: 5 }),
    ]);

    const utcEvening = Date.parse('2026-08-09T19:00:00.000Z');
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const picked = await engine.selectNext({
      ...OPTS,
      now: utcEvening,
      timezoneOffsetMinutes: 0,
    });
    expect(picked?.difficulty).toBe(4);
  });
});
