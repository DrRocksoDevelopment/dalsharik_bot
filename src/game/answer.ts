export interface AnswerRecord {
  id: string;
  userId: string;
  chatId: string;
  questionId: string;
  telegramPollId: string;
  selectedOption: string;
  isCorrect?: boolean;
  answeredAt: string;
  reactionTimeMs: number;
  points?: number;
  isRepeat: boolean;
  scoredAt?: string;
  updateId: number;
}
