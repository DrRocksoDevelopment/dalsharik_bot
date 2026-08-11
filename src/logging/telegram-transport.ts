import Transport from 'winston-transport';
import { Telegraf } from 'telegraf';

interface TelegramTransportOptions extends Transport.TransportStreamOptions {
  bot: Telegraf;
  chatId: string;
  maxLength?: number;
}

export class TelegramTransport extends Transport {
  private readonly bot: Telegraf;
  private readonly chatId: string;
  private readonly maxLength: number;
  private readonly minLevel: string;
  private readonly rate: { windowMs: number; max: number };
  private sent: number[] = [];
  private isSending = false;

  constructor(opts: TelegramTransportOptions) {
    super(opts);
    this.bot = opts.bot;
    this.chatId = opts.chatId;
    this.maxLength = opts.maxLength ?? 4000;
    this.minLevel = opts.level ?? 'error';
    this.rate = { windowMs: 10_000, max: 10 };
  }

  private shouldSend(level: string): boolean {
    const order: Record<string, number> = { error: 3, warn: 2, info: 1, debug: 0 };
    const entry = order[level] ?? 1;
    const threshold = order[this.minLevel] ?? 3;
    return entry >= threshold;
  }

  private isRateLimited(): boolean {
    const now = Date.now();
    this.sent = this.sent.filter((t) => now - t < this.rate.windowMs);
    return this.sent.length >= this.rate.max;
  }

  log(info: any, callback: () => void): void {
    if (info.level !== 'error' && !this.shouldSend(info.level)) {
      callback();
      return;
    }

    setImmediate(() => {
      if (this.isRateLimited() || this.isSending) {
        callback();
        return;
      }

      this.isSending = true;
      const error = info.error !== undefined ? ` — ${String(info.error)}` : '';
      const message = `[${info.level.toUpperCase()}] ${info.message}${error}`;
      const safe = message.length > this.maxLength
        ? `${message.slice(0, this.maxLength - 3)}...`
        : message;

      this.bot.telegram
        .sendMessage(this.chatId, safe)
        .then(() => {
          this.sent.push(Date.now());
          callback();
        })
        .catch(() => {
          callback();
        })
        .finally(() => {
          this.isSending = false;
        });
    });
  }
}
