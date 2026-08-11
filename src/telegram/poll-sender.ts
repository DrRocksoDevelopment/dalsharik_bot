import type { Telegram } from 'telegraf';

export interface PollPayload {
  chatId: string;
  text: string;
  options: string[];
}

export interface SentPoll {
  messageId: number;
  pollId: string;
}

export interface PollSender {
  sendPoll(payload: PollPayload): Promise<SentPoll>;
}

export class TelegramPollSender implements PollSender {
  constructor(private readonly telegram: Telegram) {}

  async sendPoll(payload: PollPayload): Promise<SentPoll> {
    const message = await this.telegram.sendPoll(
      payload.chatId,
      payload.text,
      payload.options,
      {
        is_anonymous: false,
      },
    );
    return {
      messageId: message.message_id,
      pollId: message.poll.id,
    };
  }
}
