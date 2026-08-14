import type { Identifiable } from '../storage/storage.js';
import type { DataStore } from '../storage/data-store.js';

export type QuestionRating = 'good' | 'normal' | 'bad';

export interface QuestionRatingRecord extends Identifiable {
  questionId: string;
  ratings: Record<string, QuestionRating>;
}

export const RATING_LABELS: Record<QuestionRating, string> = {
  good: '👍 Хорошо',
  normal: '👌 Нормально',
  bad: '👎 Плохо',
};

export interface QuestionRatingCounts {
  good: number;
  normal: number;
  bad: number;
  total: number;
}

export function aggregateRatings(record: QuestionRatingRecord | null): QuestionRatingCounts {
  const counts: QuestionRatingCounts = { good: 0, normal: 0, bad: 0, total: 0 };
  if (!record) return counts;
  for (const rating of Object.values(record.ratings)) {
    counts[rating] += 1;
    counts.total += 1;
  }
  return counts;
}

export async function rateQuestion(
  store: DataStore,
  questionId: string,
  userId: string,
  rating: QuestionRating,
): Promise<void> {
  const existing = await store.questionRatings.get(questionId);
  if (existing) {
    const ratings = { ...existing.ratings, [userId]: rating };
    await store.questionRatings.update(questionId, { ratings });
    return;
  }
  await store.questionRatings.insert({
    id: questionId,
    questionId,
    ratings: { [userId]: rating },
  });
}
