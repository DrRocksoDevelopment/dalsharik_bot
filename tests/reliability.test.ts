import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processPollAnswer } from '../src/game/answer-processor.js';
import { DefaultQuestionPublisher } from '../src/game/publisher.js';
import { InMemoryQuestionEngine } from '../src/game/question-engine.js';
import { QuestionReloader } from '../src/game/question-reloader.js';
import { defaultChatConfig } from '../src/types/index.js';
import { makeLogger, makePoll, makeQuestion, makeTempStore, type TempStore } from './helpers.js';

const tempStores: TempStore[] = [];

afterEach(async () => {
  for (const t of tempStores.splice(0)) await t.cleanup();
});

function makePollAnswer(userId: number, optionIndex: number, pollId: string) {
  return {
    poll_id: pollId,
    user: { id: userId, is_bot: false, first_name: 'Игрок' },
    option_ids: [optionIndex],
  };
}

describe('надёжность', () => {
  it('параллельные голоса одного пользователя не теряются (атомарный upsert)', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    const question = makeQuestion();
    await t.store.questions.insert(question);
    await t.store.polls.insert(makePoll({ id: 'p1', telegramPollId: 'tp-1' }));
    await t.store.polls.insert(makePoll({ id: 'p2', telegramPollId: 'tp-2' }));

    await Promise.all([
      processPollAnswer(makePollAnswer(42, 2, 'tp-1'), 1, { logger: makeLogger(), store: t.store }),
      processPollAnswer(makePollAnswer(42, 2, 'tp-2'), 2, { logger: makeLogger(), store: t.store }),
    ]);

    const user = await t.store.users.get('42');
    expect(user).not.toBeNull();

    const answers = await t.store.answers.getAll();
    expect(answers).toHaveLength(2);
    expect(answers.map((a) => a.telegramPollId).sort()).toEqual(['tp-1', 'tp-2']);
    expect(answers.every((a) => a.selectedOption === 2)).toBe(true);
  });

  it('poll сохраняется как sending до отправки в Telegram (sendPoll падает)', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    const question = makeQuestion();
    await t.store.questions.insert(question);
    const publisher = new DefaultQuestionPublisher({
      logger: makeLogger(),
      store: t.store,
      engine: new InMemoryQuestionEngine([question]),
      sender: {
        async sendPoll() {
          throw new Error('telegram down');
        },
      },
    });

    await expect(publisher.publish(defaultChatConfig('-100123'))).rejects.toThrow('telegram down');

    const sending = await t.store.polls.find((p) => p.status === 'sending');
    expect(sending).toHaveLength(1);
    const history = await t.store.questionHistory.find((h) => h.chatId === '-100123');
    expect(history).toHaveLength(0);
  });

  it('reloader.start() не падает без каталога dataDir (фолбэк на polling)', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    const dir = join(tmpdir(), `dalsharik-reload-${Date.now()}-${Math.random()}`);

    const reloader = new QuestionReloader({
      logger: makeLogger(),
      store: t.store,
      engine: new InMemoryQuestionEngine([]),
      dataDir: dir,
    });

    await expect(reloader.start()).resolves.toBeUndefined();
    await reloader.stop();
    await rm(dir, { recursive: true, force: true });
  });
});

