import type { Category, QuestionType } from '../types/index.js';
import { isQuestionType, QUESTION_TYPES } from '../types/index.js';
import type { Question } from './question.js';

const CATEGORIES: Category[] = ['history', 'science', 'technology', 'culture', 'geography'];

export function validateQuestion(q: Question): string[] {
  const errors: string[] = [];

  if (!q.id || typeof q.id !== 'string') errors.push('нет id');
  if (!isQuestionType(q.type)) {
    errors.push(`тип "${q.type}" не из списка: ${QUESTION_TYPES.join(', ')}`);
  }
  if (!CATEGORIES.includes(q.category)) {
    errors.push(`категория "${q.category}" не из списка: ${CATEGORIES.join(', ')}`);
  }
  if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) {
    errors.push('сложность должна быть целым числом 1..5');
  }
  if (!q.eventDate || typeof q.eventDate !== 'string') errors.push('нет даты события');
  if (!q.event?.title || typeof q.event.title !== 'string') errors.push('нет заголовка события');
  if (!q.event?.context || typeof q.event.context !== 'string') errors.push('нет контекста события');
  if (!q.question || typeof q.question !== 'string') errors.push('нет текста вопроса');

  if (!Array.isArray(q.answers) || q.answers.length < 4) {
    errors.push('нужно минимум 4 варианта ответа');
  } else {
    if (q.answers.some((a) => !a.text || typeof a.text !== 'string')) {
      errors.push('у варианта нет текста');
    }
    const correctCount = q.answers.filter((a) => a.correct === true).length;
    if (correctCount !== 1) errors.push(`должен быть ровно один верный вариант, найдено: ${correctCount}`);
  }

  if (!q.explanation || typeof q.explanation !== 'string') errors.push('нет объяснения');
  if (!Array.isArray(q.sources) || q.sources.length === 0) {
    errors.push('нет источников');
  } else if (q.sources.some((s) => typeof s !== 'string')) {
    errors.push('источники должны быть строками');
  }

  return errors;
}

export function validateQuestionSet(questions: Question[]): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();

  for (const q of questions) {
    const id = q?.id;
    if (!id || typeof id !== 'string') {
      errors.push('вопрос без id');
      continue;
    }
    if (seenIds.has(id)) errors.push(`дубликат id: ${id}`);
    seenIds.add(id);

    for (const e of validateQuestion(q)) errors.push(`[${id}] ${e}`);

    const key = q?.question;
    if (key && typeof key === 'string') {
      if (seenTexts.has(key)) errors.push(`[${id}] одинаковый текст вопроса`);
      seenTexts.add(key);
    }
  }

  return errors;
}
