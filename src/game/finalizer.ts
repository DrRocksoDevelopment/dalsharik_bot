import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import { DEFAULT_CONFIG } from '../config/config.js';
import type { PollRecord } from './poll.js';
import { calculateResults } from './stats.js';
import { buildResultsMessage } from '../content/results.js';
import { SloganEngine, type SloganContext } from '../content/slogans.js';
import type { FinalizerSender } from '../telegram/finalizer-sender.js';
import type { MetricsStore } from '../metrics/metrics.js';
import { formatLocalTime } from '../utils/timezone.js';

const STREAK_HIGHLIGHT_MIN = 2;

export interface QuestionFinalizerDeps {
  logger: Logger;
  store: DataStore;
  sender: FinalizerSender;
  slogans?: SloganEngine;
  metrics?: MetricsStore;
  now?: () => number;
}

export interface QuestionFinalizer {
  finalize(poll: PollRecord): Promise<void>;
}

const TERMINAL_STATUSES = ['completed', 'cancelled'] as const;

export class DefaultQuestionFinalizer implements QuestionFinalizer {
  constructor(private readonly deps: QuestionFinalizerDeps) {}

  async finalize(poll: PollRecord): Promise<void> {
    const stored = await this.deps.store.polls.get(poll.id);
    if (!stored) {
      this.deps.logger.warn('Poll не найден в хранилище, пропускаю', { pollId: poll.id });
      return;
    }
    if ((TERMINAL_STATUSES as readonly string[]).includes(stored.status)) {
      this.deps.logger.warn('Poll уже завершён, пропускаю', { pollId: poll.id });
      return;
    }

    await this.deps.store.polls.update(poll.id, { status: 'completed' });

    let totalVoterCount = 0;
    try {
      totalVoterCount = await this.deps.sender.closePoll(poll.chatId, poll.messageId);
    } catch (err) {
      this.deps.logger.error('Не удалось закрыть poll в Telegram', {
        pollId: poll.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const question = await this.deps.store.questions.get(poll.questionId);
    if (!question) {
      this.deps.logger.error('Вопрос не найден при завершении', {
        pollId: poll.id,
        questionId: poll.questionId,
      });
      return;
    }

    const answers = await this.deps.store.answers.find(
      (a) => a.telegramPollId === poll.telegramPollId,
    );
    const results = calculateResults(answers);

    const users = new Map<string, import('./user.js').UserProfile>();
    for (const u of await this.deps.store.users.getAll()) users.set(u.id, u);

    const streakHighlights = [...new Set(answers.map((a) => a.userId))]
      .map((userId) => ({ userId, currentStreak: users.get(userId)?.currentStreak ?? 0 }))
      .filter((h) => h.currentStreak >= STREAK_HIGHLIGHT_MIN)
      .sort((a, b) => b.currentStreak - a.currentStreak);

    let chatStreakRecord: number | null = null;
    const chatAnswerers = await this.deps.store.answers.find((a) => a.chatId === poll.chatId);
    for (const id of new Set(chatAnswerers.map((a) => a.userId))) {
      const best = users.get(id)?.bestStreak ?? 0;
      if (chatStreakRecord === null || best > chatStreakRecord) chatStreakRecord = best;
    }

    const chat = await this.deps.store.chats.get(poll.chatId);
    const now = (this.deps.now ?? Date.now)();
    const timezoneOffset =
      chat?.timezoneOffsetMinutes ?? DEFAULT_CONFIG.timezoneOffsetMinutes;
    const nextEventLocalTime =
      chat && Number.isFinite(timezoneOffset)
        ? formatLocalTime(now + chat.questionInterval * 1000, timezoneOffset)
        : undefined;

    const slogan = (this.deps.slogans ?? new SloganEngine()).get({
      isCorrect: results.correct > 0,
      playersCount: results.totalPlayers,
      accuracy: results.accuracy,
      fastestCorrectMs: results.fastestCorrectMs,
      difficulty: question.difficulty,
    } satisfies SloganContext);

    const message = buildResultsMessage({
      question,
      results,
      users,
      slogan,
      streakHighlights,
      chatStreakRecord,
      nextEventLocalTime,
    });

    try {
      await this.deps.sender.sendMessage(poll.chatId, message);
    } catch (err) {
      this.deps.logger.error('Не удалось опубликовать итоги', {
        pollId: poll.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.deps.logger.info('Вопрос завершён', {
      pollId: poll.id,
      chatId: poll.chatId,
      questionId: poll.questionId,
      totalPlayers: results.totalPlayers,
      correct: results.correct,
    });

    await this.deps.metrics?.recordQuestionCompleted(
      poll.chatId,
      poll.questionId,
      totalVoterCount > 0 ? totalVoterCount : results.totalPlayers,
    );
  }
}
