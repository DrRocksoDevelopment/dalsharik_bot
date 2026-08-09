import type { Category, QuestionType } from '../types/index.js';

export interface QuestionEvent {
  title: string;
  context: string;
}

export interface QuestionAnswer {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  category: Category;
  difficulty: number;
  eventDate: string;
  event: QuestionEvent;
  question: string;
  answers: QuestionAnswer[];
  correctAnswer: string;
  explanation: string;
  sources: string[];
  nextEventId?: string;
  createdAt: string;
}

export function isQuestion(q: unknown): q is Question {
  if (typeof q !== 'object' || q === null) return false;
  const obj = q as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.category === 'string' &&
    typeof obj.difficulty === 'number' &&
    typeof obj.question === 'string' &&
    typeof obj.correctAnswer === 'string' &&
    Array.isArray(obj.answers) &&
    Array.isArray(obj.sources)
  );
}
