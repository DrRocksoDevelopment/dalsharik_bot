import { afterEach, describe, expect, it } from 'vitest';
import { registerModeration } from '../src/bot/moderation-commands.js';
import { MESSAGES } from '../src/content/messages.js';
import { InMemoryQuestionEngine } from '../src/game/question-engine.js';
import { QuestionReloader } from '../src/game/question-reloader.js';
import { makeBotHarness, makeLogger, makeQuestion, makeTempStore, callbackUpdate, type BotHarness } from './helpers.js';

const ADMIN_ID = 42;

function lastCbAnswer(h: BotHarness): { text?: string; show_alert?: boolean } {
  const calls = h.answerCbQuery.mock.calls;
  const last = calls[calls.length - 1];
  return (last?.[0] as { text?: string; show_alert?: boolean }) ?? {};
}

describe('moderation-commands', () => {
  let h: BotHarness;
  let t: Awaited<ReturnType<typeof makeTempStore>>;

  afterEach(async () => {
    await h.cleanup();
    await t.cleanup();
  });

  async function setup(): Promise<{ reloader: QuestionReloader }> {
    h = await makeBotHarness();
    t = await makeTempStore();
    const engine = new InMemoryQuestionEngine([]);
    const reloader = new QuestionReloader({
      logger: makeLogger(),
      store: t.store,
      engine,
      dataDir: t.dir,
    });
    registerModeration(h.bot, {
      logger: makeLogger(),
      adminId: ADMIN_ID,
      reloader,
    });
    return { reloader };
  }

  it('/pending показывает список ожидающих', async () => {
    await setup();
    await t.store.pendingQuestions.insert(makeQuestion({ id: 'event_000002' }));
    await h.bot.handleUpdate({
      update_id: 5,
      message: {
        message_id: 1,
        from: { id: ADMIN_ID, is_bot: false, first_name: 'Test' },
        chat: { id: ADMIN_ID, type: 'private', first_name: 'Test' },
        date: 0,
        text: '/pending',
        entities: [{ type: 'bot_command', offset: 0, length: 8 }],
      },
    } as never);

    const calls = h.sendMessage.mock.calls;
    const last = calls[calls.length - 1]!;
    const text = last[1] as string;
    expect(text).toContain('Ожидают одобрения (1)');
    expect(text).toContain('event_000002');
  });

  it('callback approve переносит вопрос в пул', async () => {
    await setup();
    await t.store.pendingQuestions.insert(makeQuestion({ id: 'event_000002' }));
    await h.bot.handleUpdate(callbackUpdate('approve:event_000002', { fromId: ADMIN_ID }));

    const answer = lastCbAnswer(h);
    expect(answer.text).toBe(MESSAGES.approved);
    expect(answer.show_alert).not.toBe(true);
    expect((await t.store.questions.getAll()).map((q) => q.id)).toContain('event_000002');
    expect((await t.store.pendingQuestions.getAll())).toHaveLength(0);
  });

  it('callback reject удаляет вопрос из ожидающих', async () => {
    await setup();
    await t.store.pendingQuestions.insert(makeQuestion({ id: 'event_000002' }));
    await h.bot.handleUpdate(callbackUpdate('reject:event_000002', { fromId: ADMIN_ID }));

    expect(lastCbAnswer(h).text).toBe(MESSAGES.rejected);
    expect(await t.store.pendingQuestions.getAll()).toHaveLength(0);
    expect(await t.store.questions.getAll()).toHaveLength(0);
  });

  it('callback approve несуществующего вопроса отвечает причиной', async () => {
    await setup();
    await h.bot.handleUpdate(callbackUpdate('approve:event_999999', { fromId: ADMIN_ID }));

    const answer = lastCbAnswer(h);
    expect(answer.show_alert).toBe(true);
    expect(answer.text).toContain('не найден');
  });

  it('callback от не-админа отклоняется', async () => {
    await setup();
    await t.store.pendingQuestions.insert(makeQuestion({ id: 'event_000002' }));
    await h.bot.handleUpdate(callbackUpdate('approve:event_000002', { fromId: 999 }));

    expect(lastCbAnswer(h).text).toBe(MESSAGES.notAdmin);
    expect(await t.store.pendingQuestions.getAll()).toHaveLength(1);
  });
});
