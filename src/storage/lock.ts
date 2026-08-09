import { mkdir, open, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Logger } from 'winston';

export class LockError extends Error {
  constructor(public readonly resource: string) {
    super(`Не удалось получить блокировку: ${resource}`);
    this.name = 'LockError';
  }
}

export interface Lock {
  run<T>(fn: () => Promise<T>): Promise<T>;
  acquire(): Promise<void>;
  release(): Promise<void>;
}

export class FileLock implements Lock {
  private queue: Array<() => void> = [];
  private held = false;

  constructor(
    private readonly filePath: string,
    private readonly logger?: Logger,
  ) {}

  async acquire(): Promise<void> {
    if (this.held) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.held = true;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await open(this.filePath, 'w').then((h) => h.close());
    } catch (err) {
      this.held = false;
      const next = this.queue.shift();
      if (next) next();
      this.logger?.warn('Не удалось получить файловую блокировку', {
        file: this.filePath,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async release(): Promise<void> {
    this.held = false;
    try {
      await rm(this.filePath, { force: true });
    } catch (err) {
      this.logger?.debug('Не удалось удалить файл блокировки', {
        file: this.filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    const next = this.queue.shift();
    if (next) next();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      await this.release();
    }
  }
}
