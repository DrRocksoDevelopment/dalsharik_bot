import { getEnv } from './config/config.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const env = getEnv();
import { createBot } from './bot/bot.js';
import { createDataStore } from './storage/data-store.js';
import { initLogger } from './logging/logger.js';
import { DefaultQuestionPublisher } from './game/publisher.js';
import { InMemoryQuestionEngine } from './game/question-engine.js';
import { TelegramPollSender } from './telegram/poll-sender.js';
import { TelegramFinalizerSender } from './telegram/finalizer-sender.js';
import { DefaultQuestionFinalizer } from './game/finalizer.js';
import { processPollAnswer } from './game/answer-processor.js';
import { DefaultScheduler } from './scheduler/scheduler.js';
import { JsonMetricsStore } from './metrics/metrics-store.js';
import { QuestionReloader } from './game/question-reloader.js';
import { TelegramStreamSender, EditTextStreamer } from './telegram/stream.js';
import { AiHost } from './game/show/host.js';
import {
  buildQuestionReviewText,
  buildQuestionReviewKeyboard,
  registerModeration,
} from './bot/moderation-commands.js';
import { registerImport } from './bot/import-commands.js';
import { registerMetricsCommand } from './bot/metrics-commands.js';
import { registerAiCommands } from './bot/ai-commands.js';
import { registerBroadcastCommand } from './bot/broadcast-commands.js';

export async function main(): Promise<void> {
  await fs.mkdir(env.dataDir, { recursive: true });
  let bot: ReturnType<typeof createBot> | null = null;
  const logger = initLogger(() => {
    if (!bot) throw new Error('Бот ещё не создан');
    return bot;
  }, env);
  const store = createDataStore(env.dataDir, logger);
  const metrics = new JsonMetricsStore(store);

  let scheduler: DefaultScheduler | null = null;
  let reloader: QuestionReloader | null = null;

  bot = createBot(env.botToken, {
    logger,
    store,
    adminId: env.botAdminId,
    pollAnswerHandler: (pollAnswer, updateId) =>
      processPollAnswer(pollAnswer, updateId, { logger, store }),
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
    sender: new TelegramPollSender(bot.telegram),
    metrics,
  });

  const streamer = new EditTextStreamer({
    sender: new TelegramStreamSender(bot.telegram),
    logger,
  });
  const host = new AiHost({
    logger,
    store,
    streamer,
    envApiKey: env.openrouterApiKey,
    envModel: env.openrouterModel,
    metrics,
  });

  const finalizer = new DefaultQuestionFinalizer({
    logger,
    store,
    sender: new TelegramFinalizerSender(bot.telegram),
    metrics,
    host,
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

  registerMetricsCommand(bot, {
    logger,
    adminId: env.botAdminId,
    metrics,
  });

  registerAiCommands(bot, {
    logger,
    adminId: env.botAdminId,
    store,
    reloader,
    metrics,
    envApiKey: env.openrouterApiKey,
    envModel: env.openrouterModel,
  });

  registerBroadcastCommand(bot, {
    logger,
    adminId: env.botAdminId,
    store,
  });

  scheduler = new DefaultScheduler({ logger, store, publisher, finalizer });
  await scheduler.start();
  await reloader.start();

  try {
    await bot.launch();
  } catch (err) {
    logger.error('Не удалось запустить бота', { error: err instanceof Error ? err.message : String(err) });
    await bot.stop('launch_error');
    process.exit(1);
  }
  const me = await bot.telegram.getMe();
  logger.info(`Бот запущен: @${me.username}`);

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: reason instanceof Error ? reason.stack ?? reason.message : String(reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message });
    void (async () => {
      await scheduler?.stop();
      await reloader?.stop();
      await bot?.stop('uncaught_exception');
    })().finally(() => process.exit(1));
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

const isEntrypoint =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((err) => {
    console.error('Ошибка запуска:', err);
    process.exit(1);
  });
}
