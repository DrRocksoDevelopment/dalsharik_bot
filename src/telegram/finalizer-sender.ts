import type { Telegram } from 'telegraf';

export interface FinalizerSender {
  closePoll(chatId: string, messageId: number): Promise<number>;
  sendMessage(chatId: string, text: string): Promise<void>;
}

export class TelegramFinalizerSender implements FinalizerSender {
  constructor(private readonly telegram: Telegram) {}

  async closePoll(chatId: string, messageId: number): Promise<number> {
    const poll = await this.telegram.stopPoll(chatId, messageId);
    return poll.total_voter_count ?? 0;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.telegram.sendMessage(chatId, text);
  }
}
