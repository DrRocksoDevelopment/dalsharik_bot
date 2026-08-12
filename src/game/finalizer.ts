import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import { DEFAULT_CONFIG } from '../config/config.js';
import type { PollRecord } from './poll.js';
import { scorePollAnswers } from './score-poll.js';
import {
  buildResultsMessage,
  buildEmptyResultsMessage,
  buildShowSummaryMessage,
} from '../content/results.js';
import { SloganEngine, type SloganContext } from '../content/slogans.js';
import type { FinalizerSender } from '../telegram/finalizer-sender.js';
import type { MetricsStore } from '../metrics/metrics.js';
import { formatLocalTime } from '../utils/timezone.js';
import { buildMessageLink } from '../utils/message-link.js';
import { getOrCreateChat } from '../bot/chat-utils.js';
import type { HostContext, ShowHost, ShowMode } from './show/host.js';

const STREAK_HIGHLIGHT_MIN = 2;
const DEFAULT_SHOW_CARD_DELAY_MS = 2000;

export interface QuestionFinalizerDeps {
  logger: Logger;
  store: DataStore;
  sender: FinalizerSender;
  slogans?: SloganEngine;
  metrics?: MetricsStore;
  host?: ShowHost;
  now?: () => number;
  showCardDelayMs?: number;
}

export interface QuestionFinalizer {
  finalize(poll: PollRecord): Promise<void>;
}

const TERMINAL_STATUSES = ['completed', 'cancelled'] as const;

export class DefaultQuestionFinalizer implements QuestionFinalizer {
  constructor(private readonly deps: QuestionFinalizerDeps) {}

  private staticCard(context: {
    question: import('./question.js').Question;
    results: import('./stats.js').QuestionResults;
    users: Map<string, import('./user.js').UserProfile>;
    streakHighlights: { userId: string; currentStreak: number }[];
    chatStreakRecord: number | null;
    nextEventLocalTime?: string;
    messageLink?: string;
  }): string {
    return buildResultsMessage({
      question: context.question,
      results: context.results,
      users: context.users,
      slogan: (this.deps.slogans ?? new SloganEngine()).get({
        isCorrect: context.results.correct > 0,
        playersCount: context.results.totalPlayers,
        accuracy: context.results.accuracy,
        fastestCorrectMs: context.results.fastestCorrectMs,
        difficulty: context.question.difficulty,
      } satisfies SloganContext),
      streakHighlights: context.streakHighlights,
      chatStreakRecord: context.chatStreakRecord,
      nextEventLocalTime: context.nextEventLocalTime,
      messageLink: context.messageLink,
    });
  }

  private async publish(chatId: string, message: string, replyToMessageId?: number): Promise<void> {
    try {
      await this.deps.sender.sendMessage(chatId, message, replyToMessageId);
    } catch (err) {
      this.deps.logger.error('Не удалось опубликовать итоги', {
        chatId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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

    await this.deps.store.polls.update(stored.id, { status: 'finalizing' });

    let totalVoterCount = 0;
    try {
      totalVoterCount = await this.deps.sender.closePoll(stored.chatId, stored.messageId);
    } catch (err) {
      this.deps.logger.error('Не удалось закрыть poll в Telegram', {
        pollId: stored.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const question = await this.deps.store.questions.get(stored.questionId);
    if (!question) {
      this.deps.logger.error('Вопрос не найден при завершении', {
        pollId: stored.id,
        questionId: stored.questionId,
      });
      return;
    }

    const results = await scorePollAnswers(stored, question, {
      logger: this.deps.logger,
      store: this.deps.store,
      metrics: this.deps.metrics,
      now: this.deps.now,
    });

    const answers = await this.deps.store.answers.find(
      (a) => a.telegramPollId === stored.telegramPollId,
    );

    const users = new Map<string, import('./user.js').UserProfile>();
    for (const u of await this.deps.store.users.getAll()) users.set(u.id, u);

    const streakHighlights = [...new Set(answers.map((a) => a.userId))]
      .map((userId) => ({ userId, currentStreak: users.get(userId)?.currentStreak ?? 0 }))
      .filter((h) => h.currentStreak >= STREAK_HIGHLIGHT_MIN)
      .sort((a, b) => b.currentStreak - a.currentStreak);

    let chatStreakRecord: number | null = null;
    const chatAnswerers = await this.deps.store.answers.find((a) => a.chatId === stored.chatId);
    for (const id of new Set(chatAnswerers.map((a) => a.userId))) {
      const best = users.get(id)?.bestStreak ?? 0;
      if (chatStreakRecord === null || best > chatStreakRecord) chatStreakRecord = best;
    }

    const chat = await getOrCreateChat(this.deps.store, stored.chatId);
    const now = (this.deps.now ?? Date.now)();
    const timezoneOffset =
      chat?.timezoneOffsetMinutes ?? DEFAULT_CONFIG.timezoneOffsetMinutes;
    const nextEventLocalTime =
      chat && Number.isFinite(timezoneOffset)
        ? formatLocalTime(now + chat.questionInterval * 1000, timezoneOffset)
        : undefined;

    const hostCtx: HostContext = {
      question,
      results,
      users,
      streakHighlights,
      chatStreakRecord,
      nextEventLocalTime,
      questionMessageId: stored.messageId > 0 ? stored.messageId : undefined,
    };

    const questionMessageId = stored.messageId > 0 ? stored.messageId : undefined;
    const messageLink = buildMessageLink(stored.chatId, stored.messageId) ?? undefined;

    if (results.totalPlayers === 0) {
      await this.publish(
        stored.chatId,
        buildEmptyResultsMessage({ question, nextEventLocalTime, messageLink }),
        questionMessageId,
      );
    } else if (chat?.finalization === 'ai' && this.deps.host) {
      const mode: ShowMode = await this.deps.host.show(stored.chatId, hostCtx);
      if (mode === 'ai') {
        await sleep(this.deps.showCardDelayMs ?? DEFAULT_SHOW_CARD_DELAY_MS);
        await this.publish(
          stored.chatId,
          buildShowSummaryMessage({ question, results, nextEventLocalTime, messageLink }),
          questionMessageId,
        );
      } else {
        await this.publish(
          stored.chatId,
          this.staticCard({ question, results, users, streakHighlights, chatStreakRecord, nextEventLocalTime, messageLink }),
          questionMessageId,
        );
      }
    } else {
      await this.publish(
        stored.chatId,
        this.staticCard({ question, results, users, streakHighlights, chatStreakRecord, nextEventLocalTime, messageLink }),
        questionMessageId,
      );
    }

    this.deps.logger.info('Вопрос завершён', {
      pollId: stored.id,
      chatId: stored.chatId,
      questionId: stored.questionId,
      totalPlayers: results.totalPlayers,
      correct: results.correct,
    });

    await this.deps.metrics?.recordQuestionCompleted(
      stored.chatId,
      stored.questionId,
      totalVoterCount > 0 ? totalVoterCount : results.totalPlayers,
    );

    await this.deps.store.polls.update(stored.id, { status: 'completed' });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
