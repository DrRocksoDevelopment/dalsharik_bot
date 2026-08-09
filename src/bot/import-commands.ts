import type { Telegraf } from 'telegraf';
import type { Logger } from 'winston';
import type { QuestionReloader } from '../game/question-reloader.js';
import type { Question } from '../game/question.js';
import { MESSAGES } from '../content/messages.js';

export interface ImportDeps {
  logger: Logger;
  adminId: number | null;
  reloader: QuestionReloader;
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

export function registerImport(bot: Telegraf, deps: ImportDeps): void {
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
