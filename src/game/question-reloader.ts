import { promises as fs, watch, type FSWatcher } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Logger } from 'winston';
import type { DataStore } from '../storage/data-store.js';
import type { Question } from './question.js';
import type { QuestionEngine } from './question-engine.js';
import { validateQuestion, validateQuestionSet } from './question-validator.js';

const POLL_INTERVAL_MS = 60_000;

export interface QuestionReloaderDeps {
  logger: Logger;
  store: DataStore;
  engine: QuestionEngine;
  dataDir: string;
  notifyAdmin?: (question: Question) => Promise<void>;
}

export type ModerationResult = { ok: boolean; reason?: string };

export interface QuestionImportError {
  id: string;
  errors: string[];
}

export interface QuestionImportResult {
  imported: number;
  skipped: { id: string; reason: string }[];
  errors: QuestionImportError[];
}

export class QuestionReloader {
  private readonly questionsFile: string;
  private readonly backupFile: string;
  private readonly pendingFile: string;
  private readonly watchers: FSWatcher[] = [];
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private lastGoodPool: Question[] = [];

  constructor(private readonly deps: QuestionReloaderDeps) {
    this.questionsFile = join(deps.dataDir, 'questions.json');
    this.backupFile = join(deps.dataDir, 'questions_backup.json');
    this.pendingFile = join(deps.dataDir, 'questions_pending.json');
  }

  async start(): Promise<void> {
    await this.refresh();

    const watcher = watch(this.deps.dataDir, (event, filename) => {
      if (filename === 'questions.json') void this.reloadPool();
      if (filename === 'questions_pending.json') void this.checkPending();
    });
    watcher.on('error', (err) => {
      this.deps.logger.error('Ошибка fs.watch вопросов', { error: String(err) });
    });
    this.watchers.push(watcher);

    this.timer = setInterval(() => {
      void this.refresh();
    }, POLL_INTERVAL_MS);
    this.timer.unref();
  }

  async refresh(): Promise<void> {
    await this.reloadPool();
    await this.checkPending();
  }

  async stop(): Promise<void> {
    for (const w of this.watchers.splice(0)) w.close();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async getPending(): Promise<Question[]> {
    return this.deps.store.pendingQuestions.getAll();
  }

  async getPool(): Promise<Question[]> {
    return this.deps.store.questions.getAll();
  }

  async approve(questionId: string): Promise<ModerationResult> {
    const pending = await this.deps.store.pendingQuestions.get(questionId);
    if (!pending) return { ok: false, reason: 'вопрос не найден среди ожидающих' };

    const errors = validateQuestion(pending);
    if (errors.length > 0) return { ok: false, reason: errors.join('; ') };

    const current = await this.deps.store.questions.getAll();
    if (current.some((q) => q.id === pending.id)) {
      return { ok: false, reason: 'вопрос с таким id уже есть в активных' };
    }

    const next = [...current, pending];
    const setErrors = validateQuestionSet(next);
    if (setErrors.length > 0) return { ok: false, reason: setErrors.join('; ') };

    await this.applyPool(next);
    await this.deps.store.pendingQuestions.delete(questionId);
    await this.deps.store.questionNotifications.delete(questionId);

    this.deps.logger.info('Вопрос одобрен', { questionId });
    return { ok: true };
  }

  async reject(questionId: string): Promise<ModerationResult> {
    const pending = await this.deps.store.pendingQuestions.get(questionId);
    if (!pending) return { ok: false, reason: 'вопрос не найден среди ожидающих' };
    await this.deps.store.pendingQuestions.delete(questionId);
    await this.deps.store.questionNotifications.delete(questionId);
    this.deps.logger.info('Вопрос отклонён', { questionId });
    return { ok: true };
  }

  async importQuestions(input: Question[]): Promise<QuestionImportResult> {
    const result: QuestionImportResult = { imported: 0, skipped: [], errors: [] };
    const current = await this.deps.store.questions.getAll();
    const currentIds = new Set(current.map((q) => q.id));
    const seenInBatch = new Set<string>();
    const accepted: Question[] = [];

    for (const q of input) {
      if (typeof q !== 'object' || q === null) {
        result.errors.push({ id: '(без id)', errors: ['не объект'] });
        continue;
      }
      const id = q.id;
      if (!id || typeof id !== 'string') {
        result.errors.push({ id: '(без id)', errors: ['нет id'] });
        continue;
      }
      const validationErrors = validateQuestion(q);
      if (validationErrors.length > 0) {
        result.errors.push({ id, errors: validationErrors });
        continue;
      }
      if (currentIds.has(id)) {
        result.skipped.push({ id, reason: 'id уже есть в активном пуле' });
        continue;
      }
      if (seenInBatch.has(id)) {
        result.skipped.push({ id, reason: 'дубликат id внутри файла' });
        continue;
      }
      seenInBatch.add(id);
      accepted.push({ ...q, createdAt: q.createdAt ?? new Date().toISOString() });
    }

    if (accepted.length === 0) return result;

    const next = [...current, ...accepted];
    const setErrors = validateQuestionSet(next);
    if (setErrors.length > 0) {
      this.deps.logger.warn('Импорт отклонён: вопросы не прошли общую валидацию', {
        errors: setErrors.slice(0, 10),
      });
      result.errors.push({ id: '(весь файл)', errors: setErrors });
      return result;
    }

    await this.applyPool(next);
    result.imported = accepted.length;
    this.deps.logger.info('Импортированы вопросы', { count: accepted.length });
    return result;
  }

  private async applyPool(next: Question[]): Promise<void> {
    await this.writeJson(this.questionsFile, next);
    await this.writeJson(this.backupFile, next);
    this.lastGoodPool = next;
    this.deps.engine.updatePool(next);
  }

  private async reloadPool(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const raw = await this.readText(this.questionsFile);
      if (raw === null) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        await this.rollbackPool('битый JSON');
        return;
      }

      if (!Array.isArray(parsed)) {
        await this.rollbackPool('ожидался массив');
        return;
      }

      const errors = validateQuestionSet(parsed as Question[]);
      if (errors.length > 0) {
        this.deps.logger.warn('Найдены ошибки валидации вопросов', { errors: errors.slice(0, 10) });
        await this.rollbackPool('вопросы не прошли валидацию');
        return;
      }

      this.lastGoodPool = parsed as Question[];
      this.deps.engine.updatePool(parsed as Question[]);
      await this.writeJson(this.backupFile, parsed);
      this.deps.logger.info('Вопросы перезагружены', { count: (parsed as Question[]).length });
    } catch (err) {
      this.deps.logger.error('Ошибка перезагрузки вопросов', { error: String(err) });
    } finally {
      this.busy = false;
    }
  }

  private async rollbackPool(reason: string): Promise<void> {
    this.deps.logger.error('Откат к предыдущей версии вопросов', { reason });

    let backup: Question[] | null = null;
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.backupFile, 'utf-8'));
      if (Array.isArray(parsed)) backup = parsed as Question[];
    } catch {
      backup = null;
    }

    const restore = backup ?? this.lastGoodPool;
    await this.writeJson(this.questionsFile, restore);
    this.lastGoodPool = restore;
    this.deps.engine.updatePool(restore);
  }

  private async checkPending(): Promise<void> {
    let pending: Question[];
    try {
      pending = await this.deps.store.pendingQuestions.getAll();
    } catch (err) {
      this.deps.logger.warn('Не удалось прочитать ожидающие вопросы', { error: String(err) });
      return;
    }

    const notified = await this.deps.store.questionNotifications.getAll();
    const notifiedIds = new Set(notified.map((n) => n.id));

    for (const q of pending) {
      if (!q?.id || notifiedIds.has(q.id)) continue;
      const errors = validateQuestion(q);
      if (errors.length > 0) {
        this.deps.logger.warn('Ожидающий вопрос не прошёл валидацию, пропущен', {
          questionId: q.id,
          errors,
        });
        continue;
      }
      try {
        await this.deps.notifyAdmin?.(q);
        await this.deps.store.questionNotifications.insert({
          id: q.id,
          notifiedAt: new Date().toISOString(),
        });
      } catch (err) {
        this.deps.logger.error('Не удалось уведомить админа о новом вопросе', {
          questionId: q.id,
          error: String(err),
        });
      }
    }
  }

  private async readText(file: string): Promise<string | null> {
    try {
      return await fs.readFile(file, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  private async writeJson(file: string, data: unknown): Promise<void> {
    await fs.mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    const handle = await fs.open(tmp, 'w');
    try {
      await handle.writeFile(JSON.stringify(data, null, 2), 'utf-8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, file);
  }
}
