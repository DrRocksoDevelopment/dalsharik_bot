import { afterEach, describe, expect, it } from 'vitest';
import { writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { JsonStorage, CorruptedDataError } from '../src/storage/json-storage.js';
import { FileLock } from '../src/storage/lock.js';
import { makeTempStore, type TempStore } from './helpers.js';

interface Item {
  id: string;
  value: number;
}

const tempStores: TempStore[] = [];

afterEach(async () => {
  for (const t of tempStores.splice(0)) await t.cleanup();
});

async function makeStorage(): Promise<TempStore> {
  const t = await makeTempStore();
  tempStores.push(t);
  return t;
}

describe('json storage', () => {
  it('базовый CRUD', async () => {
    const t = await makeStorage();
    const storage = new JsonStorage<Item>(t.dir, 'items.json');

    await storage.insert({ id: 'a', value: 1 });
    await storage.insert({ id: 'b', value: 2 });

    expect(await storage.get('a')).toEqual({ id: 'a', value: 1 });
    expect(await storage.get('missing')).toBeNull();
    expect((await storage.getAll()).map((i) => i.id)).toEqual(['a', 'b']);
    expect(await storage.exists('b')).toBe(true);
    expect(await storage.exists('missing')).toBe(false);
    expect((await storage.find((i) => i.value > 1)).map((i) => i.id)).toEqual(['b']);

    await storage.update('a', { value: 10 });
    expect((await storage.get('a'))?.value).toBe(10);

    await storage.delete('b');
    expect(await storage.exists('b')).toBe(false);
    expect(await storage.get('a')).not.toBeNull();
  });

  it('вставка дубликата id бросает ошибку', async () => {
    const t = await makeStorage();
    const storage = new JsonStorage<Item>(t.dir, 'items.json');
    await storage.insert({ id: 'a', value: 1 });
    await expect(storage.insert({ id: 'a', value: 2 })).rejects.toThrow(/уже существует/);
    expect((await storage.getAll())).toHaveLength(1);
  });

  it('обновление несуществующего id бросает ошибку', async () => {
    const t = await makeStorage();
    const storage = new JsonStorage<Item>(t.dir, 'items.json');
    await expect(storage.update('missing', { value: 1 })).rejects.toThrow(/не найден/);
  });

  it('update отбрасывает неизвестные ключи патча', async () => {
    const t = await makeStorage();
    const storage = new JsonStorage<Item>(t.dir, 'items.json');
    await storage.insert({ id: 'a', value: 1 });

    await storage.update('a', { value: 5, hacker: 'extra' } as never);
    const stored = await storage.get('a');
    expect(stored).toEqual({ id: 'a', value: 5 });
    expect((stored as unknown as Record<string, unknown>).hacker).toBeUndefined();
  });

  it('повреждённый JSON бросает CorruptedDataError', async () => {
    const t = await makeStorage();
    const storage = new JsonStorage<Item>(t.dir, 'items.json');
    await writeFile(join(t.dir, 'items.json'), '{ not valid json', 'utf-8');
    await expect(storage.getAll()).rejects.toBeInstanceOf(CorruptedDataError);
    await expect(storage.get('a')).rejects.toBeInstanceOf(CorruptedDataError);
  });

  it('несуществующий файл возвращает пустой список', async () => {
    const t = await makeStorage();
    const storage = new JsonStorage<Item>(t.dir, 'items.json');
    expect(await storage.getAll()).toEqual([]);
    expect(await storage.get('a')).toBeNull();
  });

  it('параллельные вставки не теряют данные и файл остаётся валидным', async () => {
    const t = await makeStorage();
    const storage = new JsonStorage<Item>(t.dir, 'items.json');
    await storage.insert({ id: 'seed', value: 0 });

    await Promise.all(
      Array.from({ length: 20 }, (_, i) => storage.insert({ id: `item-${i}`, value: i })),
    );

    const items = await storage.getAll();
    expect(items).toHaveLength(21);
    expect(new Set(items.map((i) => i.id)).size).toBe(21);

    const raw = await readFile(join(t.dir, 'items.json'), 'utf-8');
    expect(JSON.parse(raw)).toHaveLength(21);
  });

  it('после ошибки во время мутации файл остаётся неповреждённым', async () => {
    const t = await makeStorage();
    const storage = new JsonStorage<Item>(t.dir, 'items.json');
    await storage.insert({ id: 'a', value: 1 });

    await expect(
      storage.mutate(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const raw = JSON.parse(await readFile(join(t.dir, 'items.json'), 'utf-8'));
    expect(raw).toHaveLength(1);
    expect(raw[0].id).toBe('a');
  });
});

describe('file lock', () => {
  it('сериализует конкурентный доступ', async () => {
    const t = await makeStorage();
    const lock = new FileLock(join(t.dir, 'locks', 'test.lock'));
    let shared = 0;
    let max = 0;
    let active = 0;

    const tasks = Array.from({ length: 10 }, async () => {
      await lock.run(async () => {
        active += 1;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 5));
        shared += 1;
        active -= 1;
      });
    });

    await Promise.all(tasks);
    expect(shared).toBe(10);
    expect(max).toBe(1);
  });

  it('освобождает ресурс даже при ошибке внутри критической секции', async () => {
    const t = await makeStorage();
    const lock = new FileLock(join(t.dir, 'locks', 'test.lock'));

    await expect(
      lock.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    let ran = false;
    await lock.run(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
