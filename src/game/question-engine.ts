import type { Category, QuestionType } from '../types/index.js';
import type { Question } from './question.js';

export interface QuestionSelectorOptions {
  questionTypes: QuestionType[];
  categories: Category[];
  difficultyMin: number;
  difficultyMax: number;
  excludeQuestionIds: string[];
}

export interface QuestionEngine {
  selectNext(options: QuestionSelectorOptions): Promise<Question | null>;
  updatePool(pool: Question[]): void;
}

export class InMemoryQuestionEngine implements QuestionEngine {
  constructor(private pool: Question[]) {}

  updatePool(pool: Question[]): void {
    this.pool = pool;
  }

  async selectNext(options: QuestionSelectorOptions): Promise<Question | null> {
    const eligible = this.pool.filter((q) => {
      if (!options.questionTypes.includes(q.type)) return false;
      if (!options.categories.includes(q.category)) return false;
      if (q.difficulty < options.difficultyMin || q.difficulty > options.difficultyMax) return false;
      if (options.excludeQuestionIds.includes(q.id)) return false;
      return true;
    });

    if (eligible.length === 0) return null;
    return eligible[Math.floor(Math.random() * eligible.length)]!;
  }
}
