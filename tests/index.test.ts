import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const launch = vi.fn();
const stop = vi.fn();

vi.mock('telegraf', () => {
  class MockTelegraf {
    telegram = {
      sendMessage: async () => ({ message_id: 1 }),
      getMe: async () => ({ id: 1, username: 'mock_bot', is_bot: true, first_name: 'Bot' }),
    };
    use() {}
    command() {}
    action() {}
    on() {}
    catch() {}
    launch = launch;
    stop = stop;
  }
  return { Telegraf: MockTelegraf };
});

let dir: string;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dalsharik-index-'));
  vi.stubEnv('BOT_TOKEN', '123:token');
  vi.stubEnv('DATA_DIR', dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubEnv('LOG_CHAT_ID', '');
  vi.stubEnv('LOG_FILE', join(dir, 'app.log'));
  vi.stubEnv('BOT_ADMIN_ID', '42');
  launch.mockReset();
  stop.mockReset();
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
});

afterEach(async () => {
  exitSpy.mockRestore();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe('index main', () => {
  it('при ошибке launch останавливает бота и завершает процесс', async () => {
    launch.mockRejectedValue(new Error('launch failed'));
    const { main } = await import('../src/index.js');
    await main();

    expect(stop).toHaveBeenCalledWith('launch_error');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('по SIGINT грациозно останавливает бота', async () => {
    launch.mockResolvedValue(undefined);
    const { main } = await import('../src/index.js');
    await main();

    expect(stop).not.toHaveBeenCalled();
    process.emit('SIGINT');
    await new Promise((r) => setTimeout(r, 20));
    expect(stop).toHaveBeenCalledWith('SIGINT');
  });
});
