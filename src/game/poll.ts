export type PollStatus = 'active' | 'expired' | 'completed' | 'cancelled';

export interface PollRecord {
  id: string;
  telegramPollId: string;
  chatId: string;
  questionId: string;
  messageId: number;
  optionMap: string[];
  createdAt: string;
  expiresAt: string;
  status: PollStatus;
}
