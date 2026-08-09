import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import type { PollRecord } from '../game/poll.js';
import type { ChatConfig } from '../types/index.js';
import type { ChatRecord } from '../game/chat.js';

export interface PollPublisher {
  publish(chat: ChatConfig): Promise<PollRecord | null>;
}

export interface PollFinalizer {
  finalize(poll: PollRecord): Promise<void>;
}

export interface SchedulerDeps {
  logger: Logger;
  store: DataStore;
  publisher: PollPublisher;
  finalizer: PollFinalizer;
  now?: () => number;
  tickIntervalMs?: number;
  retryDelayMs?: number;
  freshChatDelayMs?: number;
}

export interface Scheduler {
  start(): Promise<void>;
  stop(): Promise<void>;
  recover(): Promise<void>;
  scheduleChat(chatId: string): Promise<void>;
  ensureScheduled(chatId: string): Promise<void>;
  getNextPublishAt(chatId: string): Promise<number | null>;
}

const DEFAULT_TICK_INTERVAL_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 5 * 60_000;
const DEFAULT_FRESH_CHAT_DELAY_MS = 10_000;

export class DefaultScheduler implements Scheduler {
  private readonly now: () => number;
  private readonly tickIntervalMs: number;
  private readonly retryDelayMs: number;
  private readonly freshChatDelayMs: number;
  private pollTimers = new Map<string, NodeJS.Timeout>();
  private publishTimers = new Map<string, NodeJS.Timeout>();
  private publishAt = new Map<string, number>();
  private activePolls = new Map<string, PollRecord>();
  private lastPublished = new Map<string, number>();
  private tickTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly deps: SchedulerDeps) {
    this.now = deps.now ?? Date.now;
    this.tickIntervalMs = deps.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
    this.retryDelayMs = deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.freshChatDelayMs = deps.freshChatDelayMs ?? DEFAULT_FRESH_CHAT_DELAY_MS;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.recover();
    this.tickTimer = setInterval(() => {
      void this.tick().catch((err) => {
        this.deps.logger.error('Ошибка тика планировщика', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.tickIntervalMs);
    if (typeof this.tickTimer.unref === 'function') this.tickTimer.unref();
    this.deps.logger.info('Scheduler запущен');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    for (const t of this.pollTimers.values()) clearTimeout(t);
    for (const t of this.publishTimers.values()) clearTimeout(t);
    this.pollTimers.clear();
    this.publishTimers.clear();
    this.publishAt.clear();
    this.activePolls.clear();
    this.lastPublished.clear();
    this.deps.logger.info('Scheduler остановлен');
  }

  async recover(): Promise<void> {
    const sending = await this.deps.store.polls.find((p) => p.status === 'sending');
    for (const poll of sending) {
      this.deps.logger.info('Очистка зависшего poll (отправка не завершена)', { pollId: poll.id });
      await this.deps.store.polls.delete(poll.id);
    }

    const finalizing = await this.deps.store.polls.find((p) => p.status === 'finalizing');
    for (const poll of finalizing) {
      this.deps.logger.info('Восстановление: повторяю завершение зависшего poll', { pollId: poll.id });
      await this.finalizeAndScheduleNext(poll);
    }

    const activePolls = await this.deps.store.polls.find((p) => p.status === 'active');
    const now = this.now();
    for (const poll of activePolls) {
      this.activePolls.set(poll.chatId, poll);
      const expiresAt = Date.parse(poll.expiresAt);
      if (Number.isNaN(expiresAt) || expiresAt <= now) {
        this.deps.logger.info('Восстановление: завершаю истёкший poll', { pollId: poll.id });
        await this.finalizeAndScheduleNext(poll);
      } else {
        this.schedulePollClose(poll, expiresAt - now);
      }
    }

    const chats = await this.deps.store.chats.getAll();
    for (const chat of chats) {
      if (!chat.enabled) continue;
      if (this.publishTimers.has(chat.chatId)) continue;
      await this.scheduleChat(chat.chatId);
    }
  }

  async scheduleChat(chatId: string): Promise<void> {
    if (!this.running) return;
    const existing = this.publishTimers.get(chatId);
    if (existing) {
      clearTimeout(existing);
      this.publishTimers.delete(chatId);
      this.publishAt.delete(chatId);
    }

    const chat = await this.deps.store.chats.get(chatId);
    if (!chat?.enabled) return;

    if (this.activePolls.has(chatId)) return;

    await this.scheduleNextPublish(chat);
  }

  async ensureScheduled(chatId: string): Promise<void> {
    if (!this.running) return;
    if (this.publishTimers.has(chatId)) return;

    const chat = await this.deps.store.chats.get(chatId);
    if (!chat?.enabled) return;

    if (this.activePolls.has(chatId)) return;

    await this.scheduleNextPublish(chat);
  }

  async getNextPublishAt(chatId: string): Promise<number | null> {
    const scheduled = this.publishAt.get(chatId);
    if (scheduled !== undefined) return scheduled;

    const activePoll = this.activePolls.get(chatId);
    if (activePoll) {
      const chat = await this.deps.store.chats.get(chatId);
      if (chat) {
        const expiresAt = Date.parse(activePoll.expiresAt);
        if (!Number.isNaN(expiresAt)) {
          return expiresAt + chat.questionInterval * 1000;
        }
      }
    }

    const active = await this.deps.store.polls.find(
      (p) => p.chatId === chatId && p.status === 'active',
    );
    if (active.length > 0) {
      const chat = await this.deps.store.chats.get(chatId);
      if (chat) {
        const expiresAt = Date.parse(active[0]!.expiresAt);
        if (!Number.isNaN(expiresAt)) {
          return expiresAt + chat.questionInterval * 1000;
        }
      }
    }
    return null;
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    const chats = await this.deps.store.chats.getAll();
    for (const chat of chats) {
      if (!chat.enabled) continue;
      if (this.publishTimers.has(chat.chatId)) continue;
      if (this.activePolls.has(chat.chatId)) continue;
      await this.scheduleNextPublish(chat);
    }
  }

  private async scheduleNextPublish(chat: ChatConfig, overrideDelayMs?: number): Promise<void> {
    if (!this.running) return;
    if (this.publishTimers.has(chat.chatId)) return;

    let delayMs = overrideDelayMs;
    if (delayMs === undefined) {
      let lastPublished = this.lastPublished.get(chat.chatId);
      if (lastPublished === undefined) {
        const history = await this.deps.store.questionHistory.find(
          (h) => h.chatId === chat.chatId,
        );
        lastPublished = history.length === 0
          ? 0
          : Math.max(...history.map((h) => Date.parse(h.publishedAt)));
        this.lastPublished.set(chat.chatId, lastPublished);
      }
      if (lastPublished === 0) {
        delayMs = this.freshChatDelayMs;
      } else {
        delayMs = Math.max(0, lastPublished + chat.questionInterval * 1000 - this.now());
      }
    }

    const publishAtMs = this.now() + delayMs;
    const timer = setTimeout(() => {
      this.publishTimers.delete(chat.chatId);
      this.publishAt.delete(chat.chatId);
      void this.runPublish(chat);
    }, delayMs);
    if (typeof timer.unref === 'function') timer.unref();
    this.publishTimers.set(chat.chatId, timer);
    this.publishAt.set(chat.chatId, publishAtMs);
  }

  private async runPublish(chat: ChatConfig): Promise<void> {
    if (!this.running) return;
    try {
      const fresh = await this.deps.store.chats.get(chat.chatId);
      if (!fresh?.enabled) return;

      this.deps.logger.debug('Публикация вопроса', { chatId: chat.chatId });
      const poll = await this.deps.publisher.publish(chat);
      if (poll) {
        const publishedAt = Date.parse(poll.createdAt);
        if (!Number.isNaN(publishedAt)) this.lastPublished.set(chat.chatId, publishedAt);
        this.activePolls.set(chat.chatId, poll);
        const delay = Math.max(0, Date.parse(poll.expiresAt) - this.now());
        this.schedulePollClose(poll, delay);
        return;
      }

      this.deps.logger.warn('Нет вопросов для публикации, повторная попытка', {
        chatId: chat.chatId,
      });
      await this.scheduleNextPublish(chat, this.retryDelayMs);
    } catch (err) {
      this.deps.logger.error('Ошибка публикации вопроса', {
        chatId: chat.chatId,
        error: err instanceof Error ? err.message : String(err),
      });
      await this.scheduleNextPublish(chat, this.retryDelayMs);
    }
  }

  private schedulePollClose(poll: PollRecord, delayMs: number): void {
    if (!this.running) return;
    if (this.pollTimers.has(poll.id)) return;
    const timer = setTimeout(() => {
      this.pollTimers.delete(poll.id);
      void this.finalizeAndScheduleNext(poll);
    }, delayMs);
    if (typeof timer.unref === 'function') timer.unref();
    this.pollTimers.set(poll.id, timer);
  }

  private async finalizeAndScheduleNext(poll: PollRecord): Promise<void> {
    try {
      await this.deps.finalizer.finalize(poll);
    } catch (err) {
      this.deps.logger.error('Ошибка завершения poll', {
        pollId: poll.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    this.activePolls.delete(poll.chatId);
    const chat = await this.deps.store.chats.get(poll.chatId);
    if (chat?.enabled) {
      await this.scheduleNextPublish(chat, chat.questionInterval * 1000);
    }
  }

  getTimersInfo(): { pollTimers: number; publishTimers: number } {
    return { pollTimers: this.pollTimers.size, publishTimers: this.publishTimers.size };
  }
}

export type { ChatRecord };
