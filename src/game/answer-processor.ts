import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import type { PollAnswer } from '@telegraf/types';
import type { AnswerRecord } from './answer.js';
import { newUserProfile } from './user-service.js';

export interface AnswerProcessorDeps {
  logger: Logger;
  store: DataStore;
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

  if (poll.status !== 'active') {
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
  const answerId = `${telegramPollId}:${userId}`;
  const optionIds = pollAnswer.option_ids ?? [];

  if (optionIds.length === 0) {
    const [existing] = await deps.store.answers.find((a) => a.id === answerId);
    if (existing) {
      await deps.store.answers.delete(answerId);
      deps.logger.info('Голос отозван', { telegramPollId, userId, updateId });
    } else {
      deps.logger.debug('Отзыв без сохранённого голоса', { telegramPollId, userId });
    }
    return;
  }

  const optionId = optionIds[0]!;
  if (optionId < 0 || optionId >= poll.optionMap.length) {
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

  const [existingAnswer] = await deps.store.answers.find((a) => a.id === answerId);
  const alreadyAnswered = existingAnswer?.isRepeat ?? (await isRepeat(deps.store, userId, question.id));

  const record: AnswerRecord = {
    ...existingAnswer,
    id: answerId,
    userId,
    chatId: poll.chatId,
    questionId: question.id,
    telegramPollId,
    selectedOption,
    answeredAt: new Date(answeredAtMs).toISOString(),
    reactionTimeMs,
    isRepeat: alreadyAnswered,
    updateId,
  };

  await deps.store.answers.mutate((items) => {
    const idx = items.findIndex((a) => a.id === answerId);
    if (idx === -1) items.push(record);
    else items[idx] = record;
  });

  await deps.store.users.mutate((users) => {
    let user = users.find((u) => u.id === userId);
    if (!user) {
      user = newUserProfile({
        id: userInfo.id,
        username: userInfo.username,
        first_name: userInfo.first_name,
        last_name: userInfo.last_name,
      });
      user.createdAt = new Date(answeredAtMs).toISOString();
      users.push(user);
    } else if (
      userInfo.username !== user.username ||
      userInfo.first_name !== user.firstName ||
      userInfo.last_name !== user.lastName
    ) {
      user.username = userInfo.username;
      user.firstName = userInfo.first_name;
      user.lastName = userInfo.last_name;
      user.updatedAt = new Date(answeredAtMs).toISOString();
    }
  });

  deps.logger.info('Голос зафиксирован', {
    telegramPollId,
    userId,
    chatId: poll.chatId,
    questionId: question.id,
    selectedOption,
    isRepeat: alreadyAnswered,
    reactionTimeMs,
    updateId,
  });
}

async function isRepeat(store: DataStore, userId: string, questionId: string): Promise<boolean> {
  const [prior] = await store.answers.find(
    (a) => a.userId === userId && a.questionId === questionId,
  );
  return prior !== undefined;
}
