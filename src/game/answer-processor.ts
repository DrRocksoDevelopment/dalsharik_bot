import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import type { PollAnswer } from '@telegraf/types';
import { calculatePoints } from './scoring.js';
import { getOrCreateUser, applyAnswerToUser, type TelegramUserInfo } from './user-service.js';
import type { AnswerRecord } from './answer.js';
import type { MetricsStore } from '../metrics/metrics.js';

export interface AnswerProcessorDeps {
  logger: Logger;
  store: DataStore;
  metrics?: MetricsStore;
}

function isActivePoll(status: string | undefined): boolean {
  return status === 'active';
}

export async function processPollAnswer(
  pollAnswer: PollAnswer,
  updateId: number,
  deps: AnswerProcessorDeps,
): Promise<void> {
  const telegramPollId = pollAnswer.poll_id;
  const [poll] = await deps.store.polls.find((p) => p.telegramPollId === telegramPollId);

  if (!poll) {
    deps.logger.warn('Неизвестный poll', { telegramPollId });
    return;
  }

  if (!isActivePoll(poll.status)) {
    deps.logger.warn('Ответ по закрытому poll проигнорирован', {
      telegramPollId,
      status: poll.status,
    });
    return;
  }

  const userInfo = pollAnswer.user;
  if (!userInfo) {
    deps.logger.warn('poll_answer без user', { telegramPollId });
    return;
  }

  const userId = String(userInfo.id);
  const existing = await deps.store.answers.find(
    (a) => a.telegramPollId === telegramPollId && a.userId === userId,
  );
  if (existing.length > 0) {
    deps.logger.warn('Повторная обработка ответа игнорируется', {
      telegramPollId,
      userId,
      updateId,
    });
    return;
  }

  const optionId = pollAnswer.option_ids?.[0];
  if (optionId === undefined || optionId < 0 || optionId >= poll.optionMap.length) {
    deps.logger.warn('Некорректный option_id', { telegramPollId, userId, optionId });
    return;
  }

  const selectedOption = poll.optionMap[optionId]!;
  const question = await deps.store.questions.get(poll.questionId);
  if (!question) {
    deps.logger.error('Вопрос не найден для poll', { questionId: poll.questionId });
    return;
  }

  const answeredAtMs = Date.now();
  const pollCreatedAt = Date.parse(poll.createdAt);
  const reactionTimeMs = Number.isNaN(pollCreatedAt)
    ? 0
    : Math.max(0, answeredAtMs - pollCreatedAt);

  const alreadyAnswered = await isRepeat(deps.store, userId, question.id);
  const user = await getOrCreateUser(deps.store, {
    id: userInfo.id,
    username: userInfo.username,
    first_name: userInfo.first_name,
    last_name: userInfo.last_name,
  });

  const isCorrect = selectedOption === question.correctAnswer;
  const pointsResult = calculatePoints({
    difficulty: question.difficulty,
    streak: user.currentStreak,
    alreadyAnswered,
  });
  const points = isCorrect ? pointsResult.points : 0;

  const answer: AnswerRecord = {
    id: `${telegramPollId}:${userId}`,
    userId,
    chatId: poll.chatId,
    questionId: question.id,
    telegramPollId,
    selectedOption,
    isCorrect,
    answeredAt: new Date(answeredAtMs).toISOString(),
    reactionTimeMs,
    points,
    isRepeat: pointsResult.isRepeat,
    updateId,
  };
  await deps.store.answers.insert(answer);

  const next = applyAnswerToUser(user, isCorrect, pointsResult.isRepeat, points);
  await deps.store.users.update(user.id, {
    ...next,
    answers: user.answers + 1,
    correct: user.correct + (isCorrect ? 1 : 0),
    wrong: user.wrong + (isCorrect ? 0 : 1),
    updatedAt: new Date(answeredAtMs).toISOString(),
  });

  await deps.metrics?.recordAnswer({
    userId,
    chatId: poll.chatId,
    questionId: question.id,
    isCorrect,
    reactionTimeMs,
    selectedOption,
    score: next.score,
    currentStreak: next.currentStreak,
    bestStreak: next.bestStreak,
  });

  deps.logger.info('Ответ обработан', {
    userId,
    chatId: poll.chatId,
    questionId: question.id,
    isCorrect,
    points,
    isRepeat: pointsResult.isRepeat,
    reactionTimeMs,
  });
}

async function isRepeat(store: DataStore, userId: string, questionId: string): Promise<boolean> {
  const [prior] = await store.answers.find(
    (a) => a.userId === userId && a.questionId === questionId,
  );
  return prior !== undefined;
}
