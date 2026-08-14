export interface DayMetrics {
  questions_published: number;
  questions_completed: number;
  answers: number;
  correct: number;
  wrong: number;
}

export interface GameMetrics {
  questions_published: number;
  questions_completed: number;
  total_answers: number;
  correct_answers: number;
  wrong_answers: number;
  average_reaction_time: number;
  median_reaction_time: number;
  median_correct_reaction_time: number;
  median_wrong_reaction_time: number;
  fastest_correct_answer: number | null;
  slowest_correct_answer: number | null;
  rounds_count: number;
  average_round_participants: number;
  daily: Record<string, DayMetrics>;
}

export interface UserMetrics {
  games_played: number;
  answers: number;
  correct: number;
  accuracy: number;
  score: number;
  current_streak: number;
  best_streak: number;
  first_seen: number | null;
  last_seen: number | null;
}

export interface ChatMetrics {
  active_players: number;
  questions_per_day: number;
  answers_per_day: number;
  average_accuracy: number;
  average_response_time: number;
  rounds_count: number;
  average_round_participants: number;
}

export interface QuestionMetrics {
  times_published: number;
  times_answered: number;
  correct_rate: number;
  average_response_time: number;
  answer_distribution: Record<string, number>;
  type: string | null;
  category: string | null;
  difficulty: number | null;
}

export interface QuestionMeta {
  id: string;
  type: string;
  category: string;
  difficulty: number;
}

export type AiUsageKind = 'generate' | 'host';

export interface AiUsageMetrics {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  web_search_requests: number;
  estimated_cost_usd: number;
  inference_cost_usd: number;
  search_cost_usd: number;
  total_cost_credits: number;
}

export interface AiMetrics {
  generate: AiUsageMetrics;
  host: AiUsageMetrics;
  total: AiUsageMetrics;
}

export interface MetricsSnapshot {
  game: GameMetrics;
  users: Record<string, UserMetrics>;
  chats: Record<string, ChatMetrics>;
  questions: Record<string, QuestionMetrics>;
  ai: AiMetrics;
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
    median_correct_reaction_time: 0,
    median_wrong_reaction_time: 0,
    fastest_correct_answer: null,
    slowest_correct_answer: null,
    rounds_count: 0,
    average_round_participants: 0,
    daily: {},
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
    first_seen: null,
    last_seen: null,
  };
}

export function emptyChatMetrics(): ChatMetrics {
  return {
    active_players: 0,
    questions_per_day: 0,
    answers_per_day: 0,
    average_accuracy: 0,
    average_response_time: 0,
    rounds_count: 0,
    average_round_participants: 0,
  };
}

export function emptyQuestionMetrics(): QuestionMetrics {
  return {
    times_published: 0,
    times_answered: 0,
    correct_rate: 0,
    average_response_time: 0,
    answer_distribution: {},
    type: null,
    category: null,
    difficulty: null,
  };
}

export function emptyAiUsageMetrics(): AiUsageMetrics {
  return {
    calls: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    web_search_requests: 0,
    estimated_cost_usd: 0,
    inference_cost_usd: 0,
    search_cost_usd: 0,
    total_cost_credits: 0,
  };
}

export function emptySnapshot(): MetricsSnapshot {
  return {
    game: emptyGameMetrics(),
    users: {},
    chats: {},
    questions: {},
    ai: {
      generate: emptyAiUsageMetrics(),
      host: emptyAiUsageMetrics(),
      total: emptyAiUsageMetrics(),
    },
  };
}

export interface RecordAnswerInput {
  userId: string;
  chatId: string;
  questionId: string;
  isCorrect: boolean;
  reactionTimeMs: number;
  selectedOption: number;
  score: number;
  currentStreak: number;
  bestStreak: number;
}

export interface RecordAiUsageInput {
  kind: AiUsageKind;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  webSearchRequests: number;
  estimatedCostUsd: number;
  inferenceCostUsd: number;
  searchCostUsd: number;
  totalCostCredits?: number;
}

export interface MetricsStore {
  recordQuestionPublished(chatId: string, question: QuestionMeta): Promise<void>;
  recordQuestionCompleted(chatId: string, questionId: string, participantCount: number): Promise<void>;
  recordAnswer(input: RecordAnswerInput): Promise<void>;
  recordAiUsage(input: RecordAiUsageInput): Promise<void>;
  snapshot(): Promise<MetricsSnapshot>;
}
