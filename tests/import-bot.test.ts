import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { registerImport, MAX_IMPORT_FILE_SIZE } from '../src/bot/import-commands.js';
import { MESSAGES } from '../src/content/messages.js';
import { InMemoryQuestionEngine } from '../src/game/question-engine.js';
import { QuestionReloader } from '../src/game/question-reloader.js';
import {
  makeBotHarness,
  makeLogger,
  makeQuestion,
  makeTempStore,
  commandUpdate,
  documentUpdate,
  type BotHarness,
} from './helpers.js';

const ADMIN_ID = 42;

function lastReply(h: BotHarness): string {
  const calls = h.sendMessage.mock.calls;
  const last = calls[calls.length - 1];
  return typeof last?.[1] === 'string' ? last[1] : '';
}

describe('import-commands: bot handlers', () => {
  let h: BotHarness;
  let t: Awaited<ReturnType<typeof makeTempStore>>;
  let reloader: QuestionReloader;
  let importDir: string;

  afterEach(async () => {
    vi.unstubAllGlobals();
    await h.cleanup();
    await t.cleanup();
  });

  async function setup(): Promise<void> {
    h = await makeBotHarness();
    t = await makeTempStore();
    importDir = join(t.dir, 'imports');
    reloader = new QuestionReloader({
      logger: makeLogger(),
      store: t.store,
      engine: new InMemoryQuestionEngine([]),
      dataDir: t.dir,
    });
    registerImport(h.bot, {
      logger: makeLogger(),
      adminId: ADMIN_ID,
      reloader,
      importDir,
    });
  }

  async function stubFetchJson(text: string): Promise<void> {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(text, { status: 200 })));
  }

  it('/import не-админом отклоняется', async () => {
    await setup();
    await h.bot.handleUpdate(commandUpdate('/import', { fromId: 999, chatType: 'private' }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
  });

  it('/import с пустой папкой сообщает об отсутствии файлов', async () => {
    await setup();
    await h.bot.handleUpdate(commandUpdate('/import', { fromId: ADMIN_ID, chatType: 'private' }));
    expect(lastReply(h)).toBe(MESSAGES.importFolderEmpty());
  });

  it('/import импортирует файлы из папки', async () => {
    await setup();
    await mkdir(importDir, { recursive: true });
    await writeFile(
      join(importDir, 'questions.json'),
      JSON.stringify([makeQuestion({ id: 'event_000002' })]),
      'utf-8',
    );

    await h.bot.handleUpdate(commandUpdate('/import', { fromId: ADMIN_ID, chatType: 'private' }));
    const text = lastReply(h);
    expect(text).toContain('Импорт из папки');
    expect(text).toContain('Импортировано: 1');
    expect((await t.store.questions.getAll()).map((q) => q.id)).toContain('event_000002');
  });

  it('документ не-админом отклоняется', async () => {
    await setup();
    await h.bot.handleUpdate(documentUpdate({ fromId: 999 }));
    expect(lastReply(h)).toBe(MESSAGES.notAdmin);
  });

  it('документ в группе отклоняется — импорт только в ЛС', async () => {
    await setup();
    await h.bot.handleUpdate(documentUpdate({ chatType: 'supergroup' }));
    expect(lastReply(h)).toBe(MESSAGES.importPrivateOnly);
  });

  it('слишком большой файл отклоняется', async () => {
    await setup();
    await h.bot.handleUpdate(
      documentUpdate({ fileSize: MAX_IMPORT_FILE_SIZE + 1 }),
    );
    expect(lastReply(h)).toBe(MESSAGES.importFileTooLarge);
  });

  it('битый JSON в документе сообщает об ошибке разбора', async () => {
    await setup();
    await stubFetchJson('{ сломанный json');
    await h.bot.handleUpdate(documentUpdate());
    expect(lastReply(h)).toContain('Не удалось разобрать файл');
  });

  it('документ успешно импортируется в пул', async () => {
    await setup();
    await stubFetchJson(JSON.stringify([makeQuestion({ id: 'event_000003' })]));
    await h.bot.handleUpdate(documentUpdate());

    const text = lastReply(h);
    expect(text).toContain('Импортировано: 1');
    expect((await t.store.questions.getAll()).map((q) => q.id)).toContain('event_000003');
  });
});
