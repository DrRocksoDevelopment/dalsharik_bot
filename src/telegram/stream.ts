import type { Logger } from 'winston';
import type { Telegram } from 'telegraf';

const DEFAULT_PAUSE_MS = 5000;

export interface StreamSender {
  sendMessage(chatId: string, text: string): Promise<number>;
  editMessageText(chatId: string, messageId: number, text: string): Promise<void>;
}

export interface TextStreamer {
  stream(chatId: string, chunks: readonly string[]): Promise<void>;
}

export class TelegramStreamSender implements StreamSender {
  constructor(private readonly telegram: Telegram) {}

  async sendMessage(chatId: string, text: string): Promise<number> {
    const message = await this.telegram.sendMessage(chatId, text);
    return message.message_id;
  }

  async editMessageText(chatId: string, messageId: number, text: string): Promise<void> {
    await this.telegram.editMessageText(chatId, messageId, undefined, text);
  }
}

export interface EditTextStreamerDeps {
  sender: StreamSender;
  logger: Logger;
  pauseMs?: number;
}

export class EditTextStreamer implements TextStreamer {
  private readonly pauseMs: number;

  constructor(private readonly deps: EditTextStreamerDeps) {
    this.pauseMs = deps.pauseMs ?? DEFAULT_PAUSE_MS;
  }

  async stream(chatId: string, chunks: readonly string[]): Promise<void> {
    const lines = chunks.filter((c) => c.trim() !== '');
    if (lines.length === 0) return;

    let messageId: number;
    try {
      messageId = await this.deps.sender.sendMessage(chatId, lines[0]!);
    } catch (err) {
      this.deps.logger.error('Не удалось отправить стартовое сообщение ведущего', {
        chatId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    let acc = lines[0]!;
    for (let i = 1; i < lines.length; i++) {
      await sleep(this.pauseMs);
      acc += `\n${lines[i]}`;
      try {
        await this.deps.sender.editMessageText(chatId, messageId, acc);
      } catch (err) {
        this.deps.logger.warn('Не удалось дополнить сообщение ведущего, досылаю остаток', {
          chatId,
          messageId,
          error: err instanceof Error ? err.message : String(err),
        });
        try {
          await this.deps.sender.sendMessage(chatId, lines.slice(i).join('\n'));
        } catch (sendErr) {
          this.deps.logger.error('Не удалось отправить остаток шоу', {
            chatId,
            error: sendErr instanceof Error ? sendErr.message : String(sendErr),
          });
        }
        return;
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
