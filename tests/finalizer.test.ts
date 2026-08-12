import { afterEach, describe, expect, it } from 'vitest';
import { DefaultQuestionFinalizer } from '../src/game/finalizer.js';
import type { FinalizerSender } from '../src/telegram/finalizer-sender.js';
import { buildResultsMessage } from '../src/content/results.js';
import { calculateResults } from '../src/game/stats.js';
import { makeLogger, makePoll, makeQuestion, makeTempStore, type TempStore } from './helpers.js';
import type { AnswerRecord } from '../src/game/answer.js';
import type { UserProfile } from '../src/game/user.js';
import type { ChatRecord } from '../src/game/chat.js';
import type { PollRecord } from '../src/game/poll.js';

const tempStores: TempStore[] = [];

afterEach(async () => {
  for (const t of tempStores.splice(0)) await t.cleanup();
});

function makeSender() {
  const calls = { close: 0, messages: 0, lastText: '', lastReplyTo: undefined as number | undefined };
  const sender: FinalizerSender = {
    async closePoll() {
      calls.close += 1;
      return 4;
    },
    async sendMessage(_chatId, text, replyTo) {
      calls.messages += 1;
      calls.lastText = text;
      calls.lastReplyTo = replyTo;
    },
  };
  return { sender, calls };
}

describe('finalizer', () => {
  it('завершает вопрос и публикует итоги один раз', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    const question = makeQuestion();
    const poll = makePoll();
    await t.store.questions.insert(question);
    await t.store.polls.insert(poll);
    const answers: AnswerRecord[] = [
      {
        id: 'telegram-poll-1:1',
        userId: '1',
        chatId: '-100123',
        questionId: 'event_000001',
        telegramPollId: 'telegram-poll-1',
        selectedOption: 'C',
        isCorrect: true,
        answeredAt: '2026-01-01T00:00:10.000Z',
        reactionTimeMs: 10_000,
        points: 3,
        isRepeat: false,
        updateId: 1,
      },
      {
        id: 'telegram-poll-1:2',
        userId: '2',
        chatId: '-100123',
        questionId: 'event_000001',
        telegramPollId: 'telegram-poll-1',
        selectedOption: 'A',
        isCorrect: false,
        answeredAt: '2026-01-01T00:00:20.000Z',
        reactionTimeMs: 20_000,
        points: 0,
        isRepeat: false,
        updateId: 2,
      },
    ];
    for (const a of answers) await t.store.answers.insert(a);

    const { sender, calls } = makeSender();
    const finalizer = new DefaultQuestionFinalizer({
      logger: makeLogger(),
      store: t.store,
      sender,
    });

    await finalizer.finalize(poll);
    await finalizer.finalize(poll);

    expect(calls.close).toBe(1);
    expect(calls.messages).toBe(1);
    expect(calls.lastText).toContain('🏁 Итоги');
    expect(calls.lastText).toContain('Ответили: 2');
    expect(calls.lastText).toContain('✅ Правильно: 1');
    expect(calls.lastText).toContain('Объяснение правильного ответа');

    const stored = await t.store.polls.get(poll.id);
    expect(stored?.status).toBe('completed');
  });

  it('прицепляет ссылку на сообщение с вопросом и шлёт итоги как реплай', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    const question = makeQuestion();
    const poll = makePoll({ chatId: '-1001234567890', messageId: 777 });
    await t.store.questions.insert(question);
    await t.store.polls.insert(poll);
    await t.store.answers.insert({
      id: 'telegram-poll-1:1',
      userId: '1',
      chatId: '-1001234567890',
      questionId: 'event_000001',
      telegramPollId: 'telegram-poll-1',
      selectedOption: 'C',
      isCorrect: true,
      answeredAt: '2026-01-01T00:00:10.000Z',
      reactionTimeMs: 10_000,
      points: 3,
      isRepeat: false,
      updateId: 1,
    });

    const { sender, calls } = makeSender();
    const finalizer = new DefaultQuestionFinalizer({
      logger: makeLogger(),
      store: t.store,
      sender,
    });

    await finalizer.finalize(poll);

    expect(calls.lastText).toContain('https://t.me/c/1234567890/777');
    expect(calls.lastReplyTo).toBe(777);
  });

  it('в пустых итогах тоже есть ссылка на вопрос', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    const question = makeQuestion();
    const poll = makePoll();
    await t.store.questions.insert(question);
    await t.store.polls.insert(poll);

    const { sender, calls } = makeSender();
    const finalizer = new DefaultQuestionFinalizer({
      logger: makeLogger(),
      store: t.store,
      sender,
    });

    await finalizer.finalize(poll);

    expect(calls.lastText).toContain('🙊 Никто не ответил');
    expect(calls.lastText).toContain('https://t.me/c/100123/42');
    expect(calls.lastReplyTo).toBe(42);
  });

  it('использует свежую запись из хранилища при устаревшем объекте poll', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    const question = makeQuestion();
    const poll = makePoll();
    await t.store.questions.insert(question);
    await t.store.polls.insert(poll);
    await t.store.answers.insert({
      id: 'telegram-poll-1:1',
      userId: '1',
      chatId: '-100123',
      questionId: 'event_000001',
      telegramPollId: 'telegram-poll-1',
      selectedOption: 'C',
      isCorrect: true,
      answeredAt: '2026-01-01T00:00:10.000Z',
      reactionTimeMs: 10_000,
      points: 3,
      isRepeat: false,
      updateId: 1,
    });

    const stale: PollRecord = { ...poll, telegramPollId: '', messageId: 0 };
    const { sender, calls } = makeSender();
    const finalizer = new DefaultQuestionFinalizer({
      logger: makeLogger(),
      store: t.store,
      sender,
    });

    await finalizer.finalize(stale);

    expect(calls.close).toBe(1);
    expect(calls.lastText).toContain('Ответили: 1');
    expect(calls.lastText).not.toContain('Никто не ответил');
  });

  it('не выводит NaN в превью для legacy-чата без таймзоны', async () => {
    const t = await makeTempStore();
    tempStores.push(t);
    const question = makeQuestion();
    const poll = makePoll();
    await t.store.questions.insert(question);
    await t.store.polls.insert(poll);
    await t.store.chats.insert({
      chatId: '-100123',
      enabled: true,
      answerWindow: 300,
      questionInterval: 7200,
      questionTypes: ['historical_next_event'],
      categories: ['history'],
      difficultyMin: 1,
      difficultyMax: 5,
      id: '-100123',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as ChatRecord);

    const { sender, calls } = makeSender();
    const finalizer = new DefaultQuestionFinalizer({
      logger: makeLogger(),
      store: t.store,
      sender,
    });

    await finalizer.finalize(poll);

    expect(calls.lastText).not.toContain('NaN');
    expect(calls.lastText).toContain('⏭ Следующее событие');
  });
});

describe('results message', () => {
  it('содержит статистику, объяснение и слоган', () => {
    const question = makeQuestion();
    const results = calculateResults([
      {
        id: 'r1',
        userId: '1',
        chatId: '-100123',
        questionId: 'event_000001',
        telegramPollId: 'telegram-poll-1',
        selectedOption: 'C',
        isCorrect: true,
        answeredAt: '2026-01-01T00:00:10.000Z',
        reactionTimeMs: 10_000,
        points: 3,
        isRepeat: false,
        updateId: 1,
      },
    ]);

    const text = buildResultsMessage({
      question,
      results,
      users: new Map(),
      slogan: '«История решила иначе.»',
    });

    expect(text).toContain('Точность: 100.0%');
    expect(text).toContain('⚡ Самый быстрый правильный ответ:');
    expect(text).toContain('10.0 сек');
    expect(text).toContain('Варианты:');
    expect(text).toContain('«История решила иначе.»');
  });

  it('содержит серии и рекорд чата при наличии highlight', () => {
    const question = makeQuestion();
    const results = calculateResults([
      {
        id: 'r1',
        userId: '1',
        chatId: '-100123',
        questionId: 'event_000001',
        telegramPollId: 'telegram-poll-1',
        selectedOption: 'C',
        isCorrect: true,
        answeredAt: '2026-01-01T00:00:10.000Z',
        reactionTimeMs: 10_000,
        points: 3,
        isRepeat: false,
        updateId: 1,
      },
    ]);

    const ivan: UserProfile = {
      id: '1',
      username: 'ivan',
      score: 10,
      currentStreak: 6,
      bestStreak: 7,
      streakMultiplier: 1.6,
      gamesPlayed: 1,
      answers: 1,
      correct: 1,
      wrong: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:10.000Z',
    };
    const text = buildResultsMessage({
      question,
      results,
      users: new Map([['1', ivan]]),
      slogan: '«История решила иначе.»',
      streakHighlights: [{ userId: '1', currentStreak: 6 }],
      chatStreakRecord: 7,
    });

    expect(text).toContain('🔥 Серии');
    expect(text).toContain('@ivan — 6');
    expect(text).toContain('до рекорда чата (7) ещё 1');
  });

  it('содержит превью следующего события', () => {
    const question = makeQuestion();
    const results = calculateResults([]);

    const text = buildResultsMessage({
      question,
      results,
      users: new Map(),
      slogan: '«История решила иначе.»',
      nextEventLocalTime: '15:00',
    });

    expect(text).toContain('⏭ Следующее событие — в 15:00 по местному времени');
  });

  it('подсвечивает верный вариант зелёным, неверные — красным', () => {
    const question = makeQuestion();
    const results = calculateResults([]);

    const text = buildResultsMessage({
      question,
      results,
      users: new Map(),
      slogan: '«История решила иначе.»',
    });

    expect(text).toContain('🔴 A — 0');
    expect(text).toContain('🔴 B — 0');
    expect(text).toContain('🟢 C — 0');
    expect(text).toContain('🔴 D — 0');
  });

  it('содержит ссылку на исходный вопрос при messageLink', () => {
    const question = makeQuestion();
    const results = calculateResults([]);

    const text = buildResultsMessage({
      question,
      results,
      users: new Map(),
      slogan: '«История решила иначе.»',
      messageLink: 'https://t.me/c/100123/42',
    });

    expect(text).toContain('🔗 Исходный вопрос: https://t.me/c/100123/42');
  });
});
