import { afterEach, describe, expect, it } from 'vitest';
import { JsonMetricsStore } from '../src/metrics/metrics-store.js';
import { makeTempStore, type TempStore } from './helpers.js';

const tempStores: TempStore[] = [];

afterEach(async () => {
  for (const t of tempStores.splice(0)) await t.cleanup();
});

async function makeStore(): Promise<{ store: TempStore; metrics: JsonMetricsStore }> {
  const t = await makeTempStore();
  tempStores.push(t);
  return { store: t, metrics: new JsonMetricsStore(t.store) };
}

const answerInput = {
  userId: '1',
  chatId: '-100123',
  questionId: 'event_000001',
  isCorrect: true,
  reactionTimeMs: 5000,
  selectedOption: 'C',
  score: 6,
  currentStreak: 2,
  bestStreak: 2,
};

const questionMeta = (id: string) => ({ id, type: 'historical', category: 'space', difficulty: 3 });

describe('metrics store', () => {
  it('пустой снапшот без данных', async () => {
    const { metrics } = await makeStore();
    const snap = await metrics.snapshot();
    expect(snap.game.questions_published).toBe(0);
    expect(snap.game.questions_completed).toBe(0);
    expect(snap.game.total_answers).toBe(0);
    expect(Object.keys(snap.users)).toHaveLength(0);
    expect(Object.keys(snap.chats)).toHaveLength(0);
    expect(Object.keys(snap.questions)).toHaveLength(0);
  });

  it('recordQuestionPublished увеличивает счётчики публикаций', async () => {
    const { metrics } = await makeStore();
    await metrics.recordQuestionPublished('-100123', questionMeta('event_000001'));
    await metrics.recordQuestionPublished('-100123', questionMeta('event_000002'));

    const snap = await metrics.snapshot();
    expect(snap.game.questions_published).toBe(2);
    expect(snap.questions['event_000001']!.times_published).toBe(1);
    expect(snap.questions['event_000002']!.times_published).toBe(1);
    expect(snap.questions['event_000001']!.type).toBe('historical');
    expect(snap.questions['event_000001']!.category).toBe('space');
    expect(snap.questions['event_000001']!.difficulty).toBe(3);
    expect(snap.chats['-100123']!.questions_per_day).toBeGreaterThan(0);
    expect(Object.keys(snap.game.daily)).toHaveLength(1);
    expect(snap.game.daily[Object.keys(snap.game.daily)[0]!]!.questions_published).toBe(2);
  });

  it('recordAnswer корректного ответа обновляет глобальные метрики', async () => {
    const { metrics } = await makeStore();
    await metrics.recordAnswer({ ...answerInput, reactionTimeMs: 4000 });
    await metrics.recordAnswer({ ...answerInput, isCorrect: false, reactionTimeMs: 8000 });

    const snap = await metrics.snapshot();
    expect(snap.game.total_answers).toBe(2);
    expect(snap.game.correct_answers).toBe(1);
    expect(snap.game.wrong_answers).toBe(1);
    expect(snap.game.fastest_correct_answer).toBe(4000);
    expect(snap.game.slowest_correct_answer).toBe(4000);
    expect(snap.game.average_reaction_time).toBe(6000);
    expect(snap.game.median_reaction_time).toBe(6000);
    expect(snap.game.median_correct_reaction_time).toBe(4000);
    expect(snap.game.median_wrong_reaction_time).toBe(8000);
    const day = snap.game.daily[Object.keys(snap.game.daily)[0]!]!;
    expect(day).toMatchObject({ answers: 2, correct: 1, wrong: 1 });
  });

  it('персистентность метрик в metrics.json', async () => {
    const { store, metrics } = await makeStore();
    await metrics.recordAnswer(answerInput);

    const reloaded = new JsonMetricsStore(store.store);
    const snap = await reloaded.snapshot();
    expect(snap.game.total_answers).toBe(1);
    expect(snap.users['1']!.score).toBe(6);
  });

  it('user-метрики отражают очки, серии и accuracy', async () => {
    const { metrics } = await makeStore();
    await metrics.recordAnswer({ ...answerInput, isCorrect: true, currentStreak: 2, bestStreak: 3 });
    await metrics.recordAnswer({ ...answerInput, isCorrect: false, currentStreak: 0, bestStreak: 3 });

    const snap = await metrics.snapshot();
    const u = snap.users['1']!;
    expect(u.answers).toBe(2);
    expect(u.correct).toBe(1);
    expect(u.accuracy).toBe(0.5);
    expect(u.score).toBe(6);
    expect(u.current_streak).toBe(0);
    expect(u.best_streak).toBe(3);
    expect(u.first_seen).not.toBeNull();
    expect(u.last_seen).not.toBeNull();
    expect(u.first_seen).toBeLessThanOrEqual(u.last_seen!);
  });

  it('games_played считает уникальные вопросы', async () => {
    const { metrics } = await makeStore();
    await metrics.recordAnswer({ ...answerInput, questionId: 'event_000001' });
    await metrics.recordAnswer({ ...answerInput, questionId: 'event_000001' });
    await metrics.recordAnswer({ ...answerInput, questionId: 'event_000002' });

    const snap = await metrics.snapshot();
    expect(snap.users['1']!.games_played).toBe(2);
  });

  it('chat-метрики: активные игроки и распределение ответов вопроса', async () => {
    const { metrics } = await makeStore();
    await metrics.recordAnswer({ ...answerInput, userId: '1', selectedOption: 'C' });
    await metrics.recordAnswer({ ...answerInput, userId: '2', selectedOption: 'A', isCorrect: false });

    const snap = await metrics.snapshot();
    expect(snap.chats['-100123']!.active_players).toBe(2);
    expect(snap.questions['event_000001']!.times_answered).toBe(2);
    expect(snap.questions['event_000001']!.answer_distribution).toEqual({ C: 1, A: 1 });
    expect(snap.questions['event_000001']!.correct_rate).toBe(0.5);
  });

  it('recordQuestionCompleted инкрементирует завершённые вопросы и явку', async () => {
    const { metrics } = await makeStore();
    await metrics.recordQuestionCompleted('-100123', 'event_000001', 10);
    await metrics.recordQuestionCompleted('-100123', 'event_000001', 5);

    const snap = await metrics.snapshot();
    expect(snap.game.questions_completed).toBe(2);
    expect(snap.game.rounds_count).toBe(2);
    expect(snap.game.average_round_participants).toBe(7.5);
    expect(snap.chats['-100123']!.rounds_count).toBe(2);
    expect(snap.chats['-100123']!.average_round_participants).toBe(7.5);
    const day = snap.game.daily[Object.keys(snap.game.daily)[0]!]!;
    expect(day.questions_completed).toBe(2);
  });

  it('legacy-снапшот без новых полей читается с нулями', async () => {
    const { store, metrics } = await makeStore();
    await store.store.metrics.mutate((items) => {
      items.push({
        id: 'global',
        data: {
          game: {
            questions_published: 3,
            questions_completed: 2,
            total_answers: 5,
            correct_answers: 3,
            wrong_answers: 2,
            reaction_time_sum: 25000,
            fastest_correct_answer: 3000,
            slowest_correct_answer: 8000,
            recent_reaction_times: [3000, 4000, 5000, 6000, 8000],
          },
          users: { '1': { answers: 5, correct: 3, score: 10, current_streak: 1, best_streak: 4, question_ids: [] } },
          chats: { '-100123': { questions_published: 3, answers: 5, correct: 3, reaction_time_sum: 25000, first_seen: Date.now(), players: ['1'] } },
          questions: {},
        },
      });
    });
    const snap = await metrics.snapshot();
    expect(snap.game.rounds_count).toBe(0);
    expect(snap.game.average_round_participants).toBe(0);
    expect(snap.game.median_correct_reaction_time).toBe(0);
    expect(snap.game.daily).toEqual({});
    expect(snap.users['1']!.first_seen).toBeNull();
    expect(snap.users['1']!.last_seen).toBeNull();
    expect(snap.chats['-100123']!.rounds_count).toBe(0);
  });

  it('recordAiUsage накапливает фактические стоимости и включает их в total', async () => {
    const { metrics } = await makeStore();
    const base = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      webSearchRequests: 0,
      estimatedCostUsd: 0.001,
      inferenceCostUsd: 0.001,
      searchCostUsd: 0,
    };
    await metrics.recordAiUsage({ kind: 'generate', ...base, totalCostCredits: 0.0012 });
    await metrics.recordAiUsage({ kind: 'generate', ...base, totalCostCredits: 0.0018 });
    await metrics.recordAiUsage({ kind: 'host', ...base, totalCostCredits: 0.0005 });

    const snap = await metrics.snapshot();
    expect(snap.ai.generate.calls).toBe(2);
    expect(snap.ai.generate.total_cost_credits).toBeCloseTo(0.003, 6);
    expect(snap.ai.host.total_cost_credits).toBeCloseTo(0.0005, 6);
    expect(snap.ai.total.total_cost_credits).toBeCloseTo(0.0035, 6);
    expect(snap.ai.total.estimated_cost_usd).toBeCloseTo(0.003, 6);
  });

  it('recordAiUsage игнорирует отсутствующий факт и остаётся на оценке', async () => {
    const { metrics } = await makeStore();
    await metrics.recordAiUsage({
      kind: 'generate',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      webSearchRequests: 0,
      estimatedCostUsd: 0.001,
      inferenceCostUsd: 0.001,
      searchCostUsd: 0,
    });

    const snap = await metrics.snapshot();
    expect(snap.ai.generate.total_cost_credits).toBe(0);
    expect(snap.ai.generate.estimated_cost_usd).toBeCloseTo(0.001, 6);
  });

  it('legacy ai-метрики без total_cost_credits читаются с нулями', async () => {
    const { store, metrics } = await makeStore();
    await store.store.metrics.mutate((items) => {
      items.push({
        id: 'global',
        data: {
          game: {},
          users: {},
          chats: {},
          questions: {},
          ai: {
            generate: {
              calls: 2,
              prompt_tokens: 300,
              completion_tokens: 150,
              total_tokens: 450,
              web_search_requests: 0,
              estimated_cost_usd: 0.003,
              inference_cost_usd: 0.003,
              search_cost_usd: 0,
            },
            host: {
              calls: 1,
              prompt_tokens: 50,
              completion_tokens: 25,
              total_tokens: 75,
              web_search_requests: 0,
              estimated_cost_usd: 0.0005,
              inference_cost_usd: 0.0005,
              search_cost_usd: 0,
            },
          },
        },
      });
    });
    const snap = await metrics.snapshot();
    expect(snap.ai.generate.total_cost_credits).toBe(0);
    expect(snap.ai.host.total_cost_credits).toBe(0);
    expect(snap.ai.generate.calls).toBe(2);
  });
});
