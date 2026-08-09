import { randomUUID } from 'node:crypto';
import type { Logger } from 'winston';
import { formatDifficulty } from '../content/messages.js';
import type { DataStore } from '../storage/data-store.js';
import type { ChatConfig } from '../types/index.js';
import type { Question } from './question.js';
import type { PollRecord } from './poll.js';
import type { QuestionEngine } from './question-engine.js';
import type { QuizSender } from '../telegram/quiz-sender.js';
import { shuffle } from '../utils/shuffle.js';
import type { MetricsStore } from '../metrics/metrics.js';

export interface QuestionPublisherDeps {
  logger: Logger;
  store: DataStore;
  engine: QuestionEngine;
  sender: QuizSender;
  metrics?: MetricsStore;
  now?: () => number;
}

const ROTATION_WINDOW = 20;

export interface QuestionPublisher {
  publish(chat: ChatConfig): Promise<PollRecord | null>;
  buildQuizPayload(question: Question): {
    text: string;
    options: string[];
    correctOptionId: number;
    explanation: string;
    optionMap: string[];
  };
}

export class DefaultQuestionPublisher implements QuestionPublisher {
  constructor(private readonly deps: QuestionPublisherDeps) {}

  buildQuizPayload(question: Question) {
    const correctIndex = question.answers.findIndex((a) => a.id === question.correctAnswer);
    if (correctIndex === -1) {
      throw new Error(`Вопрос ${question.id}: правильный ответ не найден в вариантах`);
    }
    const order = shuffle(question.answers);
    const optionMap = order.map((a) => a.id);
    const options = order.map((a) => a.text);
    const correctOptionId = order.findIndex((a) => a.id === question.correctAnswer);
    const text = `${question.event.title}\n\n${question.question}\n\n${formatDifficulty(question.difficulty)}`;
    return { text, options, correctOptionId, explanation: question.explanation, optionMap };
  }

  async publish(chat: ChatConfig): Promise<PollRecord | null> {
    const history = await this.deps.store.questionHistory.find((h) => h.chatId === chat.chatId);
    const sorted = [...history].sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    );
    const window = sorted.slice(0, ROTATION_WINDOW);
    const usedIds = window.map((h) => h.questionId);
    const recentIds = window.map((h) => h.questionId);

    const selector = {
      questionTypes: chat.questionTypes,
      categories: chat.categories,
      difficultyMin: chat.difficultyMin,
      difficultyMax: chat.difficultyMax,
      recentQuestionIds: recentIds,
      now: (this.deps.now ?? Date.now)(),
      timezoneOffsetMinutes: chat.timezoneOffsetMinutes,
    };

    let question = await this.deps.engine.selectNext({
      ...selector,
      excludeQuestionIds: usedIds,
    });

    if (!question) {
      this.deps.logger.debug('Пул в окне ротации исчерпан, разрешаю повторное использование', {
        chatId: chat.chatId,
      });
      question = await this.deps.engine.selectNext({
        ...selector,
        excludeQuestionIds: [],
      });
    }

    if (!question) {
      this.deps.logger.warn('Нет доступных вопросов для чата', { chatId: chat.chatId });
      return null;
    }

    const payload = this.buildQuizPayload(question);
    const now = (this.deps.now ?? Date.now)();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + chat.answerWindow * 1000).toISOString();

    const poll: PollRecord = {
      id: randomUUID(),
      telegramPollId: '',
      chatId: chat.chatId,
      questionId: question.id,
      messageId: 0,
      optionMap: payload.optionMap,
      createdAt,
      expiresAt,
      status: 'sending',
    };

    await this.deps.store.polls.insert(poll);

    const sent = await this.deps.sender.sendQuiz({
      chatId: chat.chatId,
      text: payload.text,
      options: payload.options,
      correctOptionId: payload.correctOptionId,
      explanation: payload.explanation,
    });

    await this.deps.store.polls.update(poll.id, {
      telegramPollId: sent.pollId,
      messageId: sent.messageId,
      status: 'active',
    });

    await this.deps.store.questionHistory.insert({
      id: `${chat.chatId}:${question.id}:${createdAt}`,
      chatId: chat.chatId,
      questionId: question.id,
      publishedAt: createdAt,
    });

    await this.deps.metrics?.recordQuestionPublished(chat.chatId, {
      id: question.id,
      type: question.type,
      category: question.category,
      difficulty: question.difficulty,
    });

    this.deps.logger.info('Опубликован вопрос', {
      chatId: chat.chatId,
      questionId: question.id,
      pollId: poll.telegramPollId,
      expiresAt,
    });

    return poll;
  }
}
