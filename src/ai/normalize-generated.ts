import type { Category, QuestionType } from '../types/index.js';
import { isQuestionType } from '../types/index.js';
import { DEFAULT_CONFIG } from '../config/config.js';
import type { Question, QuestionAnswer } from '../game/question.js';
import { shuffle } from '../utils/shuffle.js';
import type { NormalizeResult } from './types.js';

const CATEGORIES = DEFAULT_CONFIG.categories as readonly Category[];

const TYPE_FIX: Record<string, string> = {
  history_next_event: 'historical_next_event',
  science_next_event: 'scientific_next_event',
};

export function parseGeneratedText(
  text: string,
): { ok: true; list: unknown[] } | { ok: false; reason: string } {
  const trimmed = text.trim().replace(/^\uFEFF/, '');
  const fenced = /^```(?:json)?\s*([\s\S]*?)```\s*$/.exec(trimmed);
  const jsonText = fenced ? fenced[1]!.trim() : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return { ok: false, reason: `невалидный JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (Array.isArray(parsed)) return { ok: true, list: parsed };
  const wrapped = (parsed as { questions?: unknown } | null)?.questions;
  if (Array.isArray(wrapped)) return { ok: true, list: wrapped };
  return { ok: false, reason: 'ожидался массив вопросов или объект с полем "questions"' };
}

export function nextQuestionId(existingIds: Iterable<string>): () => string {
  let max = 0;
  for (const id of existingIds) {
    const m = /^event_(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let counter = max;
  return () => {
    counter += 1;
    return `event_${String(counter).padStart(6, '0')}`;
  };
}

export function sanitizeGeneratedQuestion(
  raw: unknown,
  assignId: () => string,
  now: string,
): { ok: true; question: Question } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) return { ok: false, errors: ['не объект'] };
  const q = raw as Record<string, unknown>;

  let type = typeof q.type === 'string' ? q.type.trim() : '';
  type = TYPE_FIX[type] ?? type;
  if (!isQuestionType(type)) errors.push(`тип «${type || '—'}» не из списка`);

  const category = q.category;
  if (!CATEGORIES.includes(category as Category)) errors.push('категория не из списка');

  const difficulty = Number(q.difficulty);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    errors.push('сложность должна быть целым числом 1..5');
  }

  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const eventRaw = (typeof q.event === 'object' && q.event !== null ? q.event : {}) as Record<
    string,
    unknown
  >;
  const eventTitle = str(eventRaw.title);
  const eventContext = str(eventRaw.context);
  const questionText = str(q.question);
  const eventDate = str(q.eventDate);
  const explanation = str(q.explanation);

  if (!eventTitle) errors.push('нет заголовка события');
  if (!eventContext) errors.push('нет контекста события');
  if (!questionText) errors.push('нет текста вопроса');
  if (!eventDate) errors.push('нет даты события');
  if (!explanation) errors.push('нет объяснения');

  const answers = Array.isArray(q.answers) ? q.answers : [];
  const cleanAnswers: QuestionAnswer[] = [];
  let correctCount = 0;
  if (answers.length < 4) {
    errors.push('нужно минимум 4 варианта ответа');
  } else {
    for (const a of answers) {
      const rec = (typeof a === 'object' && a !== null ? a : {}) as Record<string, unknown>;
      const text = str(rec.text);
      const correct = rec.correct === true;
      if (!text) errors.push('у варианта нет текста');
      if (correct) correctCount += 1;
      if (text) cleanAnswers.push({ text, correct });
    }
  }
  if (correctCount !== 1) {
    errors.push(`должен быть ровно один верный вариант, найдено: ${correctCount}`);
  }

  const sources = Array.isArray(q.sources) ? q.sources : [];
  if (sources.length === 0) {
    errors.push('нет источников');
  } else if (!sources.every((s) => typeof s === 'string' && /^https?:\/\//.test(s.trim()))) {
    errors.push('источники должны быть непустыми http(s) URL');
  }

  if (errors.length > 0) return { ok: false, errors };

  const built: Question = {
    id: assignId(),
    type: type as QuestionType,
    category: category as Category,
    difficulty,
    eventDate,
    event: { title: eventTitle, context: eventContext },
    question: questionText,
    answers: shuffle(cleanAnswers),
    explanation,
    sources: sources.map((s) => (s as string).trim()),
    createdAt: now,
  };

  return { ok: true, question: built };
}

export function normalizeGenerated(
  text: string,
  opts: { existingIds: string[]; existingTexts: string[]; existingTopics?: string[]; now?: string },
): NormalizeResult {
  const now = opts.now ?? new Date().toISOString();
  const parsed = parseGeneratedText(text);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const assignId = nextQuestionId(opts.existingIds);
  const seenTexts = new Set(opts.existingTexts.map((t) => t.trim().toLowerCase()));
  const seenTopics = new Set((opts.existingTopics ?? []).map((t) => t.trim().toLowerCase()));
  const questions: Question[] = [];
  const rejected: { raw: unknown; errors: string[] }[] = [];

  for (const raw of parsed.list) {
    const res = sanitizeGeneratedQuestion(raw, assignId, now);
    if (!res.ok) {
      rejected.push({ raw, errors: res.errors });
      continue;
    }
    const key = res.question.question.trim().toLowerCase();
    if (seenTexts.has(key)) {
      rejected.push({ raw, errors: ['повторяет существующий вопрос'] });
      continue;
    }
    const topicKey = res.question.event.title.trim().toLowerCase();
    if (seenTopics.has(topicKey)) {
      rejected.push({ raw, errors: ['повторяет тему существующего вопроса'] });
      continue;
    }
    seenTexts.add(key);
    seenTopics.add(topicKey);
    questions.push(res.question);
  }

  return { ok: true, questions, rejected };
}
