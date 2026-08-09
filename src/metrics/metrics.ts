export interface GameMetrics {
  questions_published: number;
  questions_completed: number;
  total_answers: number;
  correct_answers: number;
  wrong_answers: number;
  average_reaction_time: number;
  median_reaction_time: number;
  fastest_correct_answer: number | null;
  slowest_correct_answer: number | null;
}

export interface UserMetrics {
  games_played: number;
  answers: number;
  correct: number;
  accuracy: number;
  score: number;
  current_streak: number;
  best_streak: number;
}

export interface ChatMetrics {
  active_players: number;
  questions_per_day: number;
  answers_per_day: number;
  average_accuracy: number;
  average_response_time: number;
}

export interface QuestionMetrics {
  times_published: number;
  times_answered: number;
  correct_rate: number;
  average_response_time: number;
  answer_distribution: Record<string, number>;
}

export interface MetricsSnapshot {
  game: GameMetrics;
  users: Record<string, UserMetrics>;
  chats: Record<string, ChatMetrics>;
  questions: Record<string, QuestionMetrics>;
}

export function emptyGameMetrics(): GameMetrics {
  return {
    questions_published: 0,
    questions_completed: 0,
    total_answers: 0,
    correct_answers: 0,
    wrong_answers: 0,
    average_reaction_time: 0,
    median_reaction_time: 0,
    fastest_correct_answer: null,
    slowest_correct_answer: null,
  };
}

export function emptyUserMetrics(): UserMetrics {
  return {
    games_played: 0,
    answers: 0,
    correct: 0,
    accuracy: 0,
    score: 0,
    current_streak: 0,
    best_streak: 0,
  };
}

export function emptyChatMetrics(): ChatMetrics {
  return {
    active_players: 0,
    questions_per_day: 0,
    answers_per_day: 0,
    average_accuracy: 0,
    average_response_time: 0,
  };
}

export function emptyQuestionMetrics(): QuestionMetrics {
  return {
    times_published: 0,
    times_answered: 0,
    correct_rate: 0,
    average_response_time: 0,
    answer_distribution: {},
  };
}

export function emptySnapshot(): MetricsSnapshot {
  return {
    game: emptyGameMetrics(),
    users: {},
    chats: {},
    questions: {},
  };
}

export interface RecordAnswerInput {
  userId: string;
  chatId: string;
  questionId: string;
  isCorrect: boolean;
  reactionTimeMs: number;
  selectedOption: string;
  score: number;
  currentStreak: number;
  bestStreak: number;
}

export interface MetricsStore {
  recordQuestionPublished(chatId: string, questionId: string): Promise<void>;
  recordQuestionCompleted(chatId: string, questionId: string): Promise<void>;
  recordAnswer(input: RecordAnswerInput): Promise<void>;
  snapshot(): Promise<MetricsSnapshot>;
}
