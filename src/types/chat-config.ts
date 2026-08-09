import { DEFAULT_CONFIG } from '../config/config.js';

export type QuestionType =
  | 'historical_next_event'
  | 'scientific_next_event'
  | 'technology_next_event'
  | 'business_next_event'
  | 'culture_next_event'
  | 'geography_next_event';

export const QUESTION_TYPES: QuestionType[] = [
  'historical_next_event',
  'scientific_next_event',
  'technology_next_event',
  'business_next_event',
  'culture_next_event',
  'geography_next_event',
];

export function isQuestionType(value: string): value is QuestionType {
  return (QUESTION_TYPES as string[]).includes(value);
}

export type Category =
  | 'history'
  | 'science'
  | 'technology'
  | 'culture'
  | 'geography';

export interface ChatConfig {
  chatId: string;
  enabled: boolean;
  answerWindow: number;
  questionInterval: number;
  questionTypes: QuestionType[];
  categories: Category[];
  difficultyMin: number;
  difficultyMax: number;
}

export function defaultChatConfig(chatId: string): ChatConfig {
  return {
    chatId,
    enabled: DEFAULT_CONFIG.enabled,
    answerWindow: DEFAULT_CONFIG.answerWindow,
    questionInterval: DEFAULT_CONFIG.questionInterval,
    questionTypes: [...DEFAULT_CONFIG.questionTypes],
    categories: [...DEFAULT_CONFIG.categories],
    difficultyMin: DEFAULT_CONFIG.difficultyMin,
    difficultyMax: DEFAULT_CONFIG.difficultyMax,
  };
}

export function isValidChatConfig(cfg: unknown): cfg is ChatConfig {
  if (typeof cfg !== 'object' || cfg === null) return false;
  const c = cfg as Record<string, unknown>;
  return (
    typeof c.chatId === 'string' &&
    typeof c.enabled === 'boolean' &&
    typeof c.answerWindow === 'number' &&
    typeof c.questionInterval === 'number' &&
    Array.isArray(c.questionTypes) &&
    Array.isArray(c.categories) &&
    typeof c.difficultyMin === 'number' &&
    typeof c.difficultyMax === 'number'
  );
}
