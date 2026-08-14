import type { Question } from '../game/question.js';
import type { TopicCandidate } from './fact-search.js';

const STOPWORDS = new Set([
  'и', 'в', 'во', 'на', 'по', 'с', 'со', 'из', 'о', 'об', 'от', 'к', 'ко', 'до', 'за', 'при',
  'у', 'же', 'бы', 'ли', 'не', 'ни', 'как', 'что', 'это', 'тот', 'та', 'то', 'его', 'ее', 'их',
  'её', 'для', 'после', 'перед', 'между', 'через', 'а', 'но', 'или', 'и', 'событие', 'события',
  'аа', 'время', 'года', 'год', 'году', 'первый', 'первая', 'первое', 'первая', 'новый', 'новая',
]);

export function topicTokens(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^а-яёa-z0-9\s-]/gi, ' ')
    .replace(/[\s-]+/g, ' ')
    .trim();
  if (!normalized) return [];
  const tokens = normalized.split(' ').filter((w) => w.length > 1);
  const meaningful = tokens.filter((w) => !STOPWORDS.has(w));
  return meaningful.length > 0 ? meaningful : tokens;
}

export function topicSimilarity(a: string, b: string): number {
  const ta = new Set(topicTokens(a));
  const tb = new Set(topicTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  const shared = [...ta].filter((t) => tb.has(t)).length;
  return shared / Math.min(ta.size, tb.size);
}

export function isTopicSimilar(a: string, b: string, threshold = 0.66): boolean {
  return topicSimilarity(a, b) >= threshold;
}

export function extractUsedTopics(questions: Question[]): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const q of questions) {
    const title = q.event?.title?.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(title);
  }
  return topics;
}

export function buildTopicBlacklist(topics: string[], limit = 100): string[] {
  const pool = [...topics];
  pool.sort((a, b) => {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    return al < bl ? -1 : al > bl ? 1 : 0;
  });
  const step = Math.max(1, Math.floor(pool.length / limit));
  const sampled: string[] = [];
  for (let i = 0; i < pool.length && sampled.length < limit; i += step) {
    sampled.push(pool[i]!);
  }
  return sampled;
}

export interface TopicFilterResult {
  kept: TopicCandidate[];
  skipped: TopicCandidate[];
}

export function filterRepeatedTopics(
  topics: TopicCandidate[],
  used: string[],
  threshold = 0.66,
): TopicFilterResult {
  const kept: TopicCandidate[] = [];
  const skipped: TopicCandidate[] = [];
  const usedLower = used.map((u) => u.toLowerCase());
  for (const topic of topics) {
    const title = topic.title.trim();
    const titleLower = title.toLowerCase();
    const exactMatch = usedLower.includes(titleLower);
    const nearMatch = used.some((u) => isTopicSimilar(title, u, threshold));
    if (exactMatch || nearMatch) {
      skipped.push(topic);
    } else {
      kept.push(topic);
    }
  }
  return { kept, skipped };
}
