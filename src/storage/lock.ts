import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

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

  constructor(private readonly filePath: string) {}

  async acquire(): Promise<void> {
    if (this.held) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.held = true;
    await mkdir(dirname(this.filePath), { recursive: true });
    await open(this.filePath, 'w').then((h) => h.close());
  }

  async release(): Promise<void> {
    this.held = false;
    try {
      await rm(this.filePath, { force: true });
    } catch {
      // ignore cleanup errors
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
