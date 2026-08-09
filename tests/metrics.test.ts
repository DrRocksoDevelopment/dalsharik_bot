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
    await metrics.recordQuestionPublished('-100123', 'event_000001');
    await metrics.recordQuestionPublished('-100123', 'event_000002');

    const snap = await metrics.snapshot();
    expect(snap.game.questions_published).toBe(2);
    expect(snap.questions['event_000001']!.times_published).toBe(1);
    expect(snap.questions['event_000002']!.times_published).toBe(1);
    expect(snap.chats['-100123']!.questions_per_day).toBeGreaterThan(0);
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

  it('recordQuestionCompleted инкрементирует завершённые вопросы', async () => {
    const { metrics } = await makeStore();
    await metrics.recordQuestionCompleted('-100123', 'event_000001');
    const snap = await metrics.snapshot();
    expect(snap.game.questions_completed).toBe(1);
  });
});
