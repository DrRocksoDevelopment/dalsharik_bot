import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listImportFiles,
  moveToDone,
  parseQuestionsFile,
  importFolder,
} from '../src/bot/import-commands.js';
import { QuestionReloader } from '../src/game/question-reloader.js';
import { InMemoryQuestionEngine } from '../src/game/question-engine.js';
import { makeLogger, makeQuestion, makeTempStore } from './helpers.js';

describe('parseQuestionsFile', () => {
  it('разбирает массив вопросов', () => {
    const r = parseQuestionsFile('[{"id":"q1"}]');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.questions).toEqual([{ id: 'q1' }]);
  });

  it('разбирает обёртку { questions: [...] }', () => {
    const r = parseQuestionsFile('{"questions":[{"id":"q1"}]}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.questions).toHaveLength(1);
  });

  it('срезает BOM', () => {
    const r = parseQuestionsFile('\uFEFF[{"id":"q1"}]');
    expect(r.ok).toBe(true);
  });

  it('возвращает ошибку на битый JSON', () => {
    const r = parseQuestionsFile('{ сломанный json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('невалидный JSON');
  });

  it('возвращает ошибку, если не массив и не обёртка', () => {
    expect(parseQuestionsFile('{"foo":1}').ok).toBe(false);
    expect(parseQuestionsFile('42').ok).toBe(false);
    expect(parseQuestionsFile('null').ok).toBe(false);
  });
});

describe('импорт из папки data/imports', () => {
  const dirs: string[] = [];

  async function makeImportDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'dalsharik-import-'));
    dirs.push(dir);
    return dir;
  }

  async function writeQuestionFile(dir: string, name: string, question = makeQuestion()): Promise<void> {
    await writeFile(join(dir, name), JSON.stringify([question], null, 2), 'utf-8');
  }

  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });

  it('список файлов: только .json верхнего уровня, без подпапок', async () => {
    const dir = await makeImportDir();
    await writeQuestionFile(dir, 'b.json');
    await writeQuestionFile(dir, 'a.JSON');
    await writeFile(join(dir, 'notes.txt'), 'x', 'utf-8');
    await mkdir(join(dir, 'done'));
    await writeQuestionFile(join(dir, 'done'), 'already.json');

    expect(await listImportFiles(dir)).toEqual(['a.JSON', 'b.json']);
  });

  it('пустая/отсутствующая папка возвращает пустой список', async () => {
    const dir = await makeImportDir();
    expect(await listImportFiles(dir)).toEqual([]);
    expect(await listImportFiles(join(dir, 'no-such-dir'))).toEqual([]);
  });

  it('moveToDone переносит файл, при коллизии имени добавляет суффикс', async () => {
    const dir = await makeImportDir();
    await writeQuestionFile(dir, 'a.json');
    expect(await moveToDone(dir, 'a.json')).toBe('a.json');

    await writeQuestionFile(dir, 'a.json');
    expect(await moveToDone(dir, 'a.json')).toBe('a_2.json');

    await writeQuestionFile(dir, 'a.json');
    expect(await moveToDone(dir, 'a.json')).toBe('a_3.json');

    expect(await listImportFiles(dir)).toEqual([]);
  });

  it('importFolder импортирует все файлы и переносит их в done', async () => {
    const t = await makeTempStore();
    const dir = await makeImportDir();
    dirs.push(t.dir);

    await writeQuestionFile(dir, 'one.json', makeQuestion({ id: 'event_000002', question: 'Первый?' }));
    await writeQuestionFile(
      dir,
      'two.json',
      makeQuestion({ id: 'event_000003', question: 'Второй?', difficulty: 4 }),
    );

    const engine = new InMemoryQuestionEngine([]);
    const reloader = new QuestionReloader({
      logger: makeLogger(),
      store: t.store,
      engine,
      dataDir: t.dir,
    });

    const report = await importFolder(reloader, dir);

    expect(report.files).toHaveLength(2);
    expect(report.files.map((f) => f.result?.imported)).toEqual([1, 1]);
    expect(await t.store.questions.getAll()).toHaveLength(2);
    expect(await listImportFiles(dir)).toEqual([]);
    expect(await listImportFiles(join(dir, 'done'))).toEqual(['one.json', 'two.json']);
  });

  it('importFolder с onlyFile импортирует только указанный файл', async () => {
    const t = await makeTempStore();
    const dir = await makeImportDir();
    dirs.push(t.dir);

    await writeQuestionFile(dir, 'one.json', makeQuestion({ id: 'event_000002', question: 'Первый?' }));
    await writeQuestionFile(
      dir,
      'two.json',
      makeQuestion({ id: 'event_000003', question: 'Второй?', difficulty: 4 }),
    );

    const engine = new InMemoryQuestionEngine([]);
    const reloader = new QuestionReloader({
      logger: makeLogger(),
      store: t.store,
      engine,
      dataDir: t.dir,
    });

    const report = await importFolder(reloader, dir, 'one.json');

    expect(report.files).toHaveLength(1);
    expect(report.files[0]?.result?.imported).toBe(1);
    expect(await t.store.questions.getAll()).toHaveLength(1);
    expect(await listImportFiles(dir)).toEqual(['two.json']);
  });

  it('битый JSON: отчёт с ошибкой, файл всё равно переносится в done', async () => {
    const t = await makeTempStore();
    const dir = await makeImportDir();
    dirs.push(t.dir);
    await writeFile(join(dir, 'broken.json'), '{ сломанный json', 'utf-8');

    const engine = new InMemoryQuestionEngine([]);
    const reloader = new QuestionReloader({
      logger: makeLogger(),
      store: t.store,
      engine,
      dataDir: t.dir,
    });

    const report = await importFolder(reloader, dir);

    expect(report.files).toHaveLength(1);
    expect(report.files[0]?.error).toContain('ошибка разбора');
    expect(await t.store.questions.getAll()).toHaveLength(0);
    expect(await listImportFiles(dir)).toEqual([]);
    expect(await listImportFiles(join(dir, 'done'))).toEqual(['broken.json']);
  });
});
