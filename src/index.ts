import { getEnv } from './config/config.js';
import { join } from 'node:path';

const env = getEnv();
import { createBot } from './bot/bot.js';
import { createDataStore } from './storage/data-store.js';
import { initLogger } from './logging/logger.js';
import { DefaultQuestionPublisher } from './game/publisher.js';
import { InMemoryQuestionEngine } from './game/question-engine.js';
import { TelegramQuizSender } from './telegram/quiz-sender.js';
import { TelegramFinalizerSender } from './telegram/finalizer-sender.js';
import { DefaultQuestionFinalizer } from './game/finalizer.js';
import { processPollAnswer } from './game/answer-processor.js';
import { DefaultScheduler } from './scheduler/scheduler.js';
import { JsonMetricsStore } from './metrics/metrics-store.js';
import { QuestionReloader } from './game/question-reloader.js';
import {
  buildQuestionReviewText,
  buildQuestionReviewKeyboard,
  registerModeration,
} from './bot/moderation-commands.js';
import { registerImport } from './bot/import-commands.js';

export async function main(): Promise<void> {
  const store = createDataStore();
  let bot: ReturnType<typeof createBot> | null = null;
  const logger = initLogger(() => {
    if (!bot) throw new Error('Бот ещё не создан');
    return bot;
  });
  const metrics = new JsonMetricsStore(store);

  let scheduler: DefaultScheduler | null = null;
  let reloader: QuestionReloader | null = null;

  bot = createBot(env.botToken, {
    logger,
    store,
    pollAnswerHandler: (pollAnswer, updateId) =>
      processPollAnswer(pollAnswer, updateId, { logger, store, metrics }),
    onChatChanged: (chatId) => scheduler?.scheduleChat(chatId) ?? Promise.resolve(),
    ensureScheduled: (chatId) => scheduler?.ensureScheduled(chatId) ?? Promise.resolve(),
    nextPublishAt: (chatId) => scheduler?.getNextPublishAt(chatId) ?? Promise.resolve(null),
  });

  const questions = await store.questions.getAll();
  const engine = new InMemoryQuestionEngine(questions);
  const publisher = new DefaultQuestionPublisher({
    logger,
    store,
    engine,
    sender: new TelegramQuizSender(bot.telegram),
    metrics,
  });

  const finalizer = new DefaultQuestionFinalizer({
    logger,
    store,
    sender: new TelegramFinalizerSender(bot.telegram),
    metrics,
  });

  reloader = new QuestionReloader({
    logger,
    store,
    engine,
    dataDir: env.dataDir,
    notifyAdmin: async (question) => {
      if (env.botAdminId === null) {
        logger.warn('BOT_ADMIN_ID не задан, уведомление о новом вопросе пропущено', {
          questionId: question.id,
        });
        return;
      }
      await bot!.telegram.sendMessage(
        env.botAdminId,
        buildQuestionReviewText(question),
        buildQuestionReviewKeyboard(question.id),
      );
    },
  });

  registerModeration(bot, {
    logger,
    adminId: env.botAdminId,
    reloader,
  });

  registerImport(bot, {
    logger,
    adminId: env.botAdminId,
    reloader,
    importDir: join(env.dataDir, 'imports'),
  });

  scheduler = new DefaultScheduler({ logger, store, publisher, finalizer });
  await scheduler.start();
  await reloader.start();

  bot.launch().then(async () => {
    const me = await bot!.telegram.getMe();
    logger.info(`Бот запущен: @${me.username}`);
  });

  process.once('SIGINT', async () => {
    await scheduler?.stop();
    await reloader?.stop();
    await bot!.stop('SIGINT');
  });
  process.once('SIGTERM', async () => {
    await scheduler?.stop();
    await reloader?.stop();
    await bot!.stop('SIGTERM');
  });
}

main().catch((err) => {
  console.error('Ошибка запуска:', err);
  process.exit(1);
});
