import type { Telegram } from 'telegraf';

export interface QuizPayload {
  chatId: string;
  text: string;
  options: string[];
  correctOptionId: number;
  explanation: string;
}

export interface SentQuiz {
  messageId: number;
  pollId: string;
}

export interface QuizSender {
  sendQuiz(payload: QuizPayload): Promise<SentQuiz>;
}

export class TelegramQuizSender implements QuizSender {
  constructor(private readonly telegram: Telegram) {}

  async sendQuiz(payload: QuizPayload): Promise<SentQuiz> {
    const message = await this.telegram.sendQuiz(
      payload.chatId,
      payload.text,
      payload.options,
      {
        correct_option_id: payload.correctOptionId,
        explanation: payload.explanation,
        is_anonymous: false,
      },
    );
    return {
      messageId: message.message_id,
      pollId: message.poll.id,
    };
  }
}
