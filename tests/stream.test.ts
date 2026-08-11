import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditTextStreamer, type StreamSender } from '../src/telegram/stream.js';
import { makeLogger } from './helpers.js';

afterEach(() => {
  vi.useRealTimers();
});

function makeSender() {
  const sendMessage = vi.fn();
  const editMessageText = vi.fn();
  sendMessage.mockResolvedValue(1);
  editMessageText.mockResolvedValue(undefined);
  const sender = { sendMessage, editMessageText } as unknown as StreamSender;
  return { sender, sendMessage, editMessageText };
}

describe('EditTextStreamer', () => {
  it('дополняет стартовое сообщение по строкам через editMessageText', async () => {
    const { sender, sendMessage, editMessageText } = makeSender();
    const streamer = new EditTextStreamer({ sender, logger: makeLogger(), pauseMs: 1 });

    await streamer.stream('-100123', ['Первая строка', 'Вторая', 'Третья']);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('-100123', 'Первая строка');
    expect(editMessageText).toHaveBeenCalledTimes(2);
    expect(editMessageText).toHaveBeenNthCalledWith(1, '-100123', 1, 'Первая строка\nВторая');
    expect(editMessageText).toHaveBeenNthCalledWith(
      2,
      '-100123',
      1,
      'Первая строка\nВторая\nТретья',
    );
  });

  it('делает драматическую паузу между правками', async () => {
    vi.useFakeTimers();
    const { sender, editMessageText } = makeSender();
    const streamer = new EditTextStreamer({ sender, logger: makeLogger(), pauseMs: 5000 });

    const promise = streamer.stream('-100123', ['A', 'B', 'C']);
    expect(editMessageText).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(5000);
    expect(editMessageText).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(editMessageText).toHaveBeenCalledTimes(2);
    await promise;
  });

  it('пустой план (в т.ч. из пробелов) ничего не шлёт', async () => {
    const { sender, sendMessage, editMessageText } = makeSender();
    const streamer = new EditTextStreamer({ sender, logger: makeLogger(), pauseMs: 1 });

    await streamer.stream('-100123', []);
    await streamer.stream('-100123', ['', '   ']);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it('ошибка edit: остаток уходит отдельным сообщением, стриминг прекращается', async () => {
    const { sender, sendMessage, editMessageText } = makeSender();
    editMessageText.mockRejectedValueOnce(new Error('edit fail'));
    const streamer = new EditTextStreamer({ sender, logger: makeLogger(), pauseMs: 1 });

    await streamer.stream('-100123', ['A', 'B', 'C', 'D']);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith('-100123', 'B\nC\nD');
    expect(editMessageText).toHaveBeenCalledTimes(1);
  });

  it('ошибка стартового sendMessage пробрасывается наружу', async () => {
    const { sender, sendMessage, editMessageText } = makeSender();
    sendMessage.mockRejectedValueOnce(new Error('send fail'));
    const streamer = new EditTextStreamer({ sender, logger: makeLogger(), pauseMs: 1 });

    await expect(streamer.stream('-100123', ['A', 'B'])).rejects.toThrow('send fail');
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it('ошибка отправки остатка после деградации не роняет стриминг', async () => {
    const { sender, sendMessage, editMessageText } = makeSender();
    sendMessage.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('send fail'));
    editMessageText.mockRejectedValueOnce(new Error('edit fail'));
    const streamer = new EditTextStreamer({ sender, logger: makeLogger(), pauseMs: 1 });

    await expect(streamer.stream('-100123', ['A', 'B', 'C'])).resolves.toBeUndefined();
    expect(editMessageText).toHaveBeenCalledTimes(1);
  });
});
