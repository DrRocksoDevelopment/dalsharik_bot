import { loadEnv } from './env.js';
import type { EnvConfig } from './env.js';

let cached: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!cached) cached = loadEnv();
  return cached;
}

export const APP_NAME = 'Дальшарик';
export const APP_VERSION = '0.1.0';

export const DEFAULT_CONFIG = {
  enabled: true,
  answerWindow: 3600,
  questionInterval: 7200,
  questionTypes: [
    'historical_next_event',
    'scientific_next_event',
    'technology_next_event',
    'business_next_event',
    'culture_next_event',
    'geography_next_event',
  ],
  categories: ['history', 'science', 'technology', 'culture', 'geography'],
  difficultyMin: 1,
  difficultyMax: 5,
  timezoneOffsetMinutes: 180,
} as const;

export const LEGACY_DEFAULT_QUESTION_TYPES = ['historical_next_event'] as const;

export const DIFFICULTY_POINTS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
} as const;

export const STREAK = {
  maxMultiplier: 2.0,
} as const;
