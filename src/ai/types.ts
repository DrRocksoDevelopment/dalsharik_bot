import type { Category } from '../types/index.js';
import type { Question } from '../game/question.js';

export const AI_SETTINGS_ID = 'ai';

export interface AiSettingsRecord {
  id: typeof AI_SETTINGS_ID;
  apiKey: string | null;
  model: string | null;
  hostPrompt?: string;
  updatedAt: string;
}

export interface GenerationUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  webSearchRequests: number;
  totalCostCredits?: number;
  estimatedCostUsd: number;
  inferenceCostUsd: number;
  searchCostUsd: number;
}

export interface NormalizedGeneration {
  questions: Question[];
  rejected: { raw: unknown; errors: string[] }[];
}

export type NormalizeResult =
  | { ok: true; questions: Question[]; rejected: { raw: unknown; errors: string[] }[] }
  | { ok: false; reason: string };

export interface GenerateRequest {
  prompt: string;
  category: Category | null;
  count: number;
  existingTexts: string[];
}
