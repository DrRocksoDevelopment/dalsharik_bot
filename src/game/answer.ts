export interface AnswerRecord {
  id: string;
  userId: string;
  chatId: string;
  questionId: string;
  telegramPollId: string;
  selectedOption: number;
  isCorrect?: boolean;
  answeredAt: string;
  reactionTimeMs: number;
  points?: number;
  isRepeat: boolean;
  scoredAt?: string;
  updateId: number;
}
