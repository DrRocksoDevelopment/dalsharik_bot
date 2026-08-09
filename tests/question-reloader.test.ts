import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QuestionReloader } from '../src/game/question-reloader.js';
import { InMemoryQuestionEngine, type QuestionSelectorOptions } from '../src/game/question-engine.js';
import { makeLogger, makeQuestion, makeTempStore, type TempStore } from './helpers.js';
import type { Question } from '../src/game/question.js';

const tempStores: TempStore[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const t of tempStores.splice(0)) await t.cleanup();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function setup() {
  const t = await makeTempStore();
  tempStores.push(t);
  dirs.push(t.dir);
  const engine = new InMemoryQuestionEngine([]);
  const notifyAdmin = vi.fn<(q: Question) => Promise<void>>();
  const reloader = new QuestionReloader({
    logger: makeLogger(),
    store: t.store,
    engine,
    dataDir: t.dir,
    notifyAdmin,
  });
  return { t, engine, notifyAdmin, reloader };
}

async function writeJson(dir: string, file: string, data: unknown) {
  await writeFile(join(dir, file), JSON.stringify(data, null, 2), 'utf-8');
}

const NEXT_OPTS: QuestionSelectorOptions = {
  questionTypes: ['historical_next_event'],
  categories: ['history'],
  difficultyMin: 1,
  difficultyMax: 5,
  excludeQuestionIds: [],
};

describe('question reloader', () => {
  it('при валидном questions.json обновляет пул движка и пишет backup', async () => {
    const { t, engine, reloader } = await setup();
    await writeJson(t.dir, 'questions.json', [makeQuestion()]);
    await reloader.refresh();

    const pool = await engine.selectNext({ ...NEXT_OPTS, excludeQuestionIds: [] });
    expect(pool).toMatchObject({ id: 'event_000001' });
    const backup = JSON.parse(await readFile(join(t.dir, 'questions_backup.json'), 'utf-8'));
    expect(backup).toHaveLength(1);
  });

  it('при битом JSON восстанавливает последнюю хорошую версию', async () => {
    const { t, engine, reloader } = await setup();
    await writeJson(t.dir, 'questions.json', [makeQuestion()]);
    await reloader.refresh();

    await writeFile(join(t.dir, 'questions.json'), '{ сломанный json', 'utf-8');
    await reloader.refresh();

    const restored = JSON.parse(await readFile(join(t.dir, 'questions.json'), 'utf-8'));
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe('event_000001');
    const pool = await engine.selectNext({ ...NEXT_OPTS, excludeQuestionIds: [] });
    expect(pool?.id).toBe('event_000001');
  });

  it('при невалидных вопросах откатывается к последней хорошей версии', async () => {
    const { t, engine, reloader } = await setup();
    await writeJson(t.dir, 'questions.json', [makeQuestion()]);
    await reloader.refresh();

    await writeJson(t.dir, 'questions.json', [makeQuestion({ difficulty: 99 })]);
    await reloader.refresh();

    const restored = JSON.parse(await readFile(join(t.dir, 'questions.json'), 'utf-8'));
    expect(restored[0].difficulty).toBe(3);
  });

  it('новый вопрос в pending уведомляет админа один раз', async () => {
    const { notifyAdmin, reloader, t } = await setup();

    await writeJson(t.dir, 'questions_pending.json', [makeQuestion({ id: 'event_000002' })]);
    await reloader.refresh();
    await reloader.refresh();

    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    expect(notifyAdmin).toHaveBeenCalledWith(expect.objectContaining({ id: 'event_000002' }));
  });

  it('невалидный вопрос в pending не уведомляет админа', async () => {
    const { notifyAdmin, reloader, t } = await setup();

    await writeJson(t.dir, 'questions_pending.json', [makeQuestion({ difficulty: 99 })]);
    await reloader.refresh();

    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('approve переносит вопрос в активный пул и удаляет из pending', async () => {
    const { t, engine, reloader } = await setup();
    await writeJson(t.dir, 'questions.json', [makeQuestion()]);
    await writeJson(t.dir, 'questions_pending.json', [makeQuestion({ id: 'event_000002', question: 'Что было дальше?' })]);
    await reloader.refresh();

    const result = await reloader.approve('event_000002');
    expect(result.ok).toBe(true);

    const active = await t.store.questions.getAll();
    expect(active.map((q) => q.id)).toEqual(['event_000001', 'event_000002']);
    expect(await t.store.pendingQuestions.get('event_000002')).toBeNull();

    const pool = await engine.selectNext({
      ...NEXT_OPTS,
      excludeQuestionIds: ['event_000001'],
    });
    expect(pool?.id).toBe('event_000002');
  });

  it('approve невалидного вопроса возвращает ошибку', async () => {
    const { t, reloader } = await setup();
    await writeJson(t.dir, 'questions_pending.json', [makeQuestion({ difficulty: 99 })]);
    await reloader.refresh();

    const result = await reloader.approve('event_000001');
    expect(result.ok).toBe(false);
    expect(await t.store.pendingQuestions.get('event_000001')).not.toBeNull();
  });

  it('approve с существующим id не добавляет дубликат', async () => {
    const { t, reloader } = await setup();
    await writeJson(t.dir, 'questions.json', [makeQuestion({ id: 'event_000001' })]);
    await writeJson(t.dir, 'questions_pending.json', [makeQuestion({ id: 'event_000001' })]);
    await reloader.refresh();

    const result = await reloader.approve('event_000001');
    expect(result.ok).toBe(false);
    expect(await t.store.questions.getAll()).toHaveLength(1);
  });

  it('reject удаляет вопрос из pending и уведомлений', async () => {
    const { t, reloader } = await setup();
    await writeJson(t.dir, 'questions_pending.json', [makeQuestion({ id: 'event_000002' })]);
    await reloader.refresh();

    expect(await t.store.questionNotifications.get('event_000002')).not.toBeNull();
    const result = await reloader.reject('event_000002');
    expect(result.ok).toBe(true);
    expect(await t.store.pendingQuestions.get('event_000002')).toBeNull();
    expect(await t.store.questionNotifications.get('event_000002')).toBeNull();
  });
});

describe('question reloader: import', () => {
  it('добавляет валидные вопросы в пул и движок, заполняя createdAt', async () => {
    const { t, engine, reloader } = await setup();
    const result = await reloader.importQuestions([
      makeQuestion({ id: 'event_000002', question: 'Вопрос номер два?' }),
      makeQuestion({
        id: 'event_000010',
        question: 'Вопрос номер десять?',
        createdAt: undefined as unknown as string,
      }),
    ]);

    expect(result.imported).toBe(2);
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);

    const active = await t.store.questions.getAll();
    expect(active.map((q) => q.id).sort()).toEqual(['event_000002', 'event_000010']);
    expect(active.every((q) => typeof q.createdAt === 'string' && q.createdAt.length > 0)).toBe(true);

    const pool = await engine.selectNext({ ...NEXT_OPTS, excludeQuestionIds: [] });
    expect(['event_000002', 'event_000010']).toContain(pool?.id);
  });

  it('переименовывает вопросы с id из активного пула вместо пропуска', async () => {
    const { t, reloader } = await setup();
    await writeJson(t.dir, 'questions.json', [makeQuestion()]);
    await reloader.refresh();

    const result = await reloader.importQuestions([
      makeQuestion({ id: 'event_000001', question: 'Другой текст?' }),
    ]);
    expect(result.imported).toBe(1);
    expect(result.renamed).toEqual([{ oldId: 'event_000001', newId: 'event_000002' }]);

    const active = await t.store.questions.getAll();
    expect(active.map((q) => q.id)).toEqual(['event_000001', 'event_000002']);
  });

  it('не добавляет невалидные вопросы', async () => {
    const { t, reloader } = await setup();
    const result = await reloader.importQuestions([makeQuestion({ difficulty: 99 })]);

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.id).toBe('event_000001');
    expect(await t.store.questions.getAll()).toHaveLength(0);
  });

  it('исправляет опечатку типа history_next_event', async () => {
    const { t, reloader } = await setup();
    const result = await reloader.importQuestions([
      makeQuestion({
        id: 'event_000020',
        type: 'history_next_event' as never,
        question: 'Вопрос с опечаткой типа?',
      }),
    ]);

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
    const stored = await t.store.questions.get('event_000020');
    expect(stored?.type).toBe('historical_next_event');
  });

  it('пропускает вопрос с текстом, который уже есть в пуле', async () => {
    const { t, reloader } = await setup();
    await writeJson(t.dir, 'questions.json', [makeQuestion()]);
    await reloader.refresh();

    const result = await reloader.importQuestions([
      makeQuestion({ id: 'event_000020', question: 'Что произошло дальше?' }),
    ]);
    expect(result.imported).toBe(0);
    expect(result.skipped).toEqual([
      { id: 'event_000020', reason: 'такой вопрос уже есть в пуле' },
    ]);
  });

  it('частично импортирует валидные из смешанного файла', async () => {
    const { t, reloader } = await setup();
    const result = await reloader.importQuestions([
      makeQuestion({ id: 'event_000001', question: 'Вопрос 1?' }),
      makeQuestion({ id: 'event_000002', question: 'Вопрос 2?', difficulty: 99 }),
      makeQuestion({ id: 'event_000003', question: 'Вопрос 3?' }),
      makeQuestion({ id: 'event_000001', question: 'Дубликат 1?' }),
    ]);

    expect(result.imported).toBe(3);
    expect(result.renamed).toEqual([{ oldId: 'event_000001', newId: 'event_000004' }]);
    expect(result.errors.map((e) => e.id)).toEqual(['event_000002']);

    const active = await t.store.questions.getAll();
    expect(active.map((q) => q.id)).toEqual(['event_000001', 'event_000003', 'event_000004']);
  });
});
