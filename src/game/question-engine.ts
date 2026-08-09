import type { Category, QuestionType } from '../types/index.js';
import { DEFAULT_CONFIG } from '../config/config.js';
import type { Question } from './question.js';
import { effectiveDifficultyRange } from './time-of-day.js';

const RECENT_COUNT = 5;

export interface QuestionSelectorOptions {
  questionTypes: QuestionType[];
  categories: Category[];
  difficultyMin: number;
  difficultyMax: number;
  excludeQuestionIds: string[];
  recentQuestionIds?: string[];
  now?: number;
  timezoneOffsetMinutes?: number;
}

export interface QuestionEngine {
  selectNext(options: QuestionSelectorOptions): Promise<Question | null>;
  updatePool(pool: Question[]): void;
}

function weightedPick<T>(items: T[], weights: number[]): T | null {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export class InMemoryQuestionEngine implements QuestionEngine {
  constructor(private pool: Question[]) {}

  updatePool(pool: Question[]): void {
    this.pool = pool;
  }

  async selectNext(options: QuestionSelectorOptions): Promise<Question | null> {
    const effective = effectiveDifficultyRange(
      options.now ?? Date.now(),
      options.timezoneOffsetMinutes ?? DEFAULT_CONFIG.timezoneOffsetMinutes,
      options.difficultyMin,
      options.difficultyMax,
    );

    let eligible = this.pool.filter((q) => {
      if (!options.questionTypes.includes(q.type)) return false;
      if (!options.categories.includes(q.category)) return false;
      if (q.difficulty < effective.min || q.difficulty > effective.max) return false;
      if (options.excludeQuestionIds.includes(q.id)) return false;
      return true;
    });

    if (eligible.length === 0) {
      eligible = this.pool.filter((q) => {
        if (!options.questionTypes.includes(q.type)) return false;
        if (!options.categories.includes(q.category)) return false;
        if (q.difficulty < options.difficultyMin || q.difficulty > options.difficultyMax) {
          return false;
        }
        if (options.excludeQuestionIds.includes(q.id)) return false;
        return true;
      });
    }

    if (eligible.length === 0) return null;

    const recent = (options.recentQuestionIds ?? []).slice(-RECENT_COUNT);
    const recentCategories = new Map<Category, number>();
    const recentDifficulties = new Map<number, number>();
    for (const id of recent) {
      const q = this.pool.find((x) => x.id === id);
      if (!q) continue;
      recentCategories.set(q.category, (recentCategories.get(q.category) ?? 0) + 1);
      recentDifficulties.set(q.difficulty, (recentDifficulties.get(q.difficulty) ?? 0) + 1);
    }

    const target = (effective.min + effective.max) / 2;

    const weights = eligible.map((q) => {
      const catUses = recentCategories.get(q.category) ?? 0;
      const diffUses = recentDifficulties.get(q.difficulty) ?? 0;
      const catWeight = 1 / (1 + catUses);
      const diffWeight = 1 / (1 + 0.5 * Math.abs(q.difficulty - target));
      const repeatWeight = 1 / (1 + 0.5 * diffUses);
      return catWeight * diffWeight * repeatWeight;
    });

    return weightedPick(eligible, weights);
  }
}
