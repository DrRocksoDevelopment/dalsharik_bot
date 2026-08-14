import { afterEach, describe, expect, it } from 'vitest';
import { registerMetricsCommand } from '../src/bot/metrics-commands.js';
import { MESSAGES } from '../src/content/messages.js';
import { JsonMetricsStore } from '../src/metrics/metrics-store.js';
import { makeBotHarness, makeLogger, commandUpdate, type BotHarness } from './helpers.js';

const ADMIN_ID = 42;

function lastReply(h: BotHarness): string {
  const calls = h.sendMessage.mock.calls;
  const last = calls[calls.length - 1];
  return typeof last?.[1] === 'string' ? last[1] : '';
}

describe('metrics-commands', () => {
  let h: BotHarness;
  let metrics: JsonMetricsStore;

  afterEach(async () => {
    await h.cleanup();
  });

  async function setup(): Promise<BotHarness> {
    const harness = await makeBotHarness();
    metrics = new JsonMetricsStore(harness.store);
    registerMetricsCommand(harness.bot, {
      logger: makeLogger(),
      adminId: ADMIN_ID,
      metrics,
    });
    return harness;
  }

  it('/metrics доступен только суперадмину', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/metrics', { fromId: 999 }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
  });

  it('/metrics с пустыми данными показывает нули', async () => {
    h = await setup();
    await h.bot.handleUpdate(commandUpdate('/metrics', { fromId: ADMIN_ID }));
    const text = lastReply(h);
    expect(text).toContain('Метрики бота');
    expect(text).toContain('Опубликовано вопросов: 0');
    expect(text).toContain('Ответов: 0');
    expect(text).toContain('Активных игроков: 0');
  });

  it('/metrics показывает накопленные метрики и топ чатов', async () => {
    h = await setup();
    await metrics.recordQuestionPublished('-100123', {
      id: 'event_000001',
      type: 'historical_next_event',
      category: 'history',
      difficulty: 3,
    });
    await metrics.recordQuestionPublished('-200456', {
      id: 'event_000002',
      type: 'historical_next_event',
      category: 'history',
      difficulty: 2,
    });
    await metrics.recordQuestionCompleted('-100123', 'event_000001', 4);
    await metrics.recordAnswer({
      userId: '42',
      chatId: '-100123',
      questionId: 'event_000001',
      isCorrect: true,
      reactionTimeMs: 1500,
      selectedOption: 2,
      score: 10,
      currentStreak: 1,
      bestStreak: 1,
    });
    await metrics.recordAnswer({
      userId: '7',
      chatId: '-100123',
      questionId: 'event_000001',
      isCorrect: false,
      reactionTimeMs: 3000,
      selectedOption: 0,
      score: 0,
      currentStreak: 0,
      bestStreak: 0,
    });

    await h.bot.handleUpdate(commandUpdate('/metrics', { fromId: ADMIN_ID }));
    const text = lastReply(h);
    expect(text).toContain('Опубликовано вопросов: 2');
    expect(text).toContain('Завершено раундов: 1');
    expect(text).toContain('Ответов: 2 (✅ 1 · ❌ 1)');
    expect(text).toContain('Активных игроков: 2');
    expect(text).toContain('Чатов с игрой: 2');
    expect(text).toContain('Топ чатов по активности');
    expect(text).toContain('-100123');
  });

  it('/metrics показывает факт и оценку AI-расхода', async () => {
    h = await setup();
    await metrics.recordAiUsage({
      kind: 'generate',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      webSearchRequests: 2,
      estimatedCostUsd: 0.001,
      inferenceCostUsd: 0.0005,
      searchCostUsd: 0.0005,
      totalCostCredits: 0.0009,
    });
    await metrics.recordAiUsage({
      kind: 'host',
      promptTokens: 40,
      completionTokens: 20,
      totalTokens: 60,
      webSearchRequests: 0,
      estimatedCostUsd: 0.0004,
      inferenceCostUsd: 0.0004,
      searchCostUsd: 0,
    });

    await h.bot.handleUpdate(commandUpdate('/metrics', { fromId: ADMIN_ID }));
    const text = lastReply(h);
    expect(text).toContain('🤖 AI-расход:');
    expect(text).toContain('• Генерация вопросов: 1 выз. · $0.0009 (факт)');
    expect(text).toContain('• AI-ведущий: 1 выз. · $0.0004 (оценка)');
    expect(text).toContain('• Итого: $0.0009 (факт)');
  });
});
