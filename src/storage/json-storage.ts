import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Logger } from 'winston';
import { FileLock } from './lock.js';
import type { Identifiable, Storage } from './storage.js';

export class CorruptedDataError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(`Повреждённый JSON в ${filePath}: ${String(cause)}`);
    this.name = 'CorruptedDataError';
  }
}

export class JsonStorage<T extends Identifiable> implements Storage<T> {
  private readonly filePath: string;
  private readonly lock: FileLock;

  constructor(dataDir: string, fileName: string, logger?: Logger) {
    this.filePath = join(dataDir, fileName);
    this.lock = new FileLock(join(dataDir, 'locks', `${fileName}.lock`), logger);
  }

  private async readRaw(): Promise<T[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''));
      if (!Array.isArray(parsed)) {
        throw new CorruptedDataError(this.filePath, 'ожидался массив');
      }
      return parsed as T[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err instanceof CorruptedDataError ? err : new CorruptedDataError(this.filePath, err);
    }
  }

  private async writeRaw(items: T[]): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const handle = await fs.open(tmp, 'w');
    try {
      await handle.writeFile(JSON.stringify(items, null, 2), 'utf-8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, this.filePath);
  }

  async get(id: string): Promise<T | null> {
    return this.lock.run(async () => {
      const items = await this.readRaw();
      return items.find((i) => i.id === id) ?? null;
    });
  }

  async getAll(): Promise<T[]> {
    return this.lock.run(() => this.readRaw());
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return this.lock.run(async () => {
      const items = await this.readRaw();
      return items.filter(predicate);
    });
  }

  async insert(item: T): Promise<void> {
    return this.lock.run(async () => {
      const items = await this.readRaw();
      if (items.some((i) => i.id === item.id)) {
        throw new Error(`Элемент с id "${item.id}" уже существует`);
      }
      items.push(item);
      await this.writeRaw(items);
    });
  }

  async update(id: string, patch: Partial<T>): Promise<void> {
    return this.lock.run(async () => {
      const items = await this.readRaw();
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) {
        throw new Error(`Элемент с id "${id}" не найден`);
      }
      items[idx] = { ...items[idx], ...patch, id } as T;
      await this.writeRaw(items);
    });
  }

  async delete(id: string): Promise<void> {
    return this.lock.run(async () => {
      const items = await this.readRaw();
      await this.writeRaw(items.filter((i) => i.id !== id));
    });
  }

  async mutate(fn: (items: T[]) => void | Promise<void>): Promise<void> {
    return this.lock.run(async () => {
      const items = await this.readRaw();
      await fn(items);
      await this.writeRaw(items);
    });
  }

  async exists(id: string): Promise<boolean> {
    return this.lock.run(async () => {
      const items = await this.readRaw();
      return items.some((i) => i.id === id);
    });
  }
}
