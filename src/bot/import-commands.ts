import { promises as fs } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { Telegraf } from 'telegraf';
import type { Logger } from 'winston';
import type { QuestionReloader } from '../game/question-reloader.js';
import type { QuestionImportResult } from '../game/question-reloader.js';
import type { Question } from '../game/question.js';
import { MESSAGES } from '../content/messages.js';

export interface ImportDeps {
  logger: Logger;
  adminId: number | null;
  reloader: QuestionReloader;
  importDir: string;
}

export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;

export type ParseQuestionsResult =
  | { ok: true; questions: unknown[] }
  | { ok: false; reason: string };

export function parseQuestionsFile(text: string): ParseQuestionsResult {
  const trimmed = text.replace(/^\uFEFF/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return {
      ok: false,
      reason: `невалидный JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (Array.isArray(parsed)) return { ok: true, questions: parsed };
  const wrapped = parsed as { questions?: unknown } | null;
  if (parsed !== null && typeof parsed === 'object' && Array.isArray(wrapped?.questions)) {
    return { ok: true, questions: wrapped.questions as unknown[] };
  }
  return { ok: false, reason: 'ожидался массив вопросов или объект с полем "questions"' };
}

export async function listImportFiles(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const files = entries.filter((name) => /\.json$/i.test(name));
  files.sort();
  return files;
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function moveToDone(dir: string, name: string): Promise<string> {
  const doneDir = join(dir, 'done');
  await fs.mkdir(doneDir, { recursive: true });
  const ext = extname(name);
  const stem = basename(name, ext);
  let target = join(doneDir, name);
  let counter = 2;
  while (await pathExists(target)) {
    target = join(doneDir, `${stem}_${counter}${ext}`);
    counter += 1;
  }
  await fs.rename(join(dir, name), target);
  return basename(target);
}

export interface FolderFileReport {
  file: string;
  error?: string;
  result?: QuestionImportResult;
  movedTo?: string;
}

export interface FolderImportResult {
  files: FolderFileReport[];
}

export async function importFolder(
  reloader: QuestionReloader,
  dir: string,
  onlyFile?: string,
): Promise<FolderImportResult> {
  const names = onlyFile
    ? (await listImportFiles(dir)).filter((n) => n.toLowerCase() === onlyFile.toLowerCase())
    : await listImportFiles(dir);
  const report: FolderImportResult = { files: [] };

  for (const name of names) {
    try {
      const text = await fs.readFile(join(dir, name), 'utf-8');
      const parsed = parseQuestionsFile(text);
      if (!parsed.ok) {
        const moved = await moveToDone(dir, name);
        report.files.push({ file: name, error: `ошибка разбора: ${parsed.reason} (файл перенесён в done/${moved})` });
        continue;
      }
      const result = await reloader.importQuestions(parsed.questions as Question[]);
      const moved = await moveToDone(dir, name);
      report.files.push({ file: name, result, movedTo: moved });
    } catch (err) {
      report.files.push({
        file: name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}

export function registerImport(bot: Telegraf, deps: ImportDeps): void {
  bot.command('import', async (ctx) => {
    try {
      if (ctx.from?.id !== deps.adminId) {
        await ctx.reply(MESSAGES.notAdmin);
        return;
      }
      const arg = ctx.message.text.split(/\s+/)[1];
      const report = await importFolder(deps.reloader, deps.importDir, arg);

      if (report.files.length === 0) {
        await ctx.reply(MESSAGES.importFolderEmpty(arg));
        return;
      }
      await ctx.reply(MESSAGES.importFolderResult(report));
    } catch (err) {
      deps.logger.error('Ошибка импорта из папки', {
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.reply(MESSAGES.importError);
    }
  });

  bot.on('document', async (ctx) => {
    try {
      if (ctx.from?.id !== deps.adminId) {
        await ctx.reply(MESSAGES.notAdmin);
        return;
      }
      if (ctx.chat?.type !== 'private') {
        await ctx.reply(MESSAGES.importPrivateOnly);
        return;
      }
      const document = ctx.message.document;
      if (!document) return;
      if (document.file_size && document.file_size > MAX_IMPORT_FILE_SIZE) {
        await ctx.reply(MESSAGES.importFileTooLarge);
        return;
      }

      const link = await ctx.telegram.getFileLink(document.file_id);
      const response = await fetch(link);
      if (!response.ok) {
        throw new Error(`не удалось скачать файл: HTTP ${response.status}`);
      }
      const text = await response.text();

      const parsed = parseQuestionsFile(text);
      if (!parsed.ok) {
        await ctx.reply(MESSAGES.importInvalidJson(parsed.reason));
        return;
      }

      const result = await deps.reloader.importQuestions(parsed.questions as Question[]);
      await ctx.reply(MESSAGES.importResult(result));
    } catch (err) {
      deps.logger.error('Ошибка импорта вопросов', {
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.reply(MESSAGES.importError);
    }
  });
}
