import type { DataStore } from '../storage/data-store.js';

const ACTIVITY_LOOKBACK_ROUNDS = 3;
const ACTIVITY_PARTICIPANT_THRESHOLD = 2;
const ACTIVITY_MULTIPLIER = 2;
const ACTIVITY_MAX_MULTIPLIER = 4;

async function averageParticipants(store: DataStore, chatId: string): Promise<number> {
  const polls = await store.polls.find(
    (p) => p.chatId === chatId && (p.status === 'completed' || p.status === 'expired'),
  );
  const sorted = [...polls].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const recent = sorted.slice(0, ACTIVITY_LOOKBACK_ROUNDS);
  if (recent.length === 0) return ACTIVITY_PARTICIPANT_THRESHOLD;
  const totals: number[] = [];
  for (const poll of recent) {
    const answers = await store.answers.find(
      (a) => a.chatId === chatId && a.telegramPollId === poll.telegramPollId,
    );
    totals.push(new Set(answers.map((a) => a.userId)).size);
  }
  return totals.reduce((sum, n) => sum + n, 0) / totals.length;
}

async function activityMultiplier(store: DataStore, chatId: string): Promise<number> {
  const average = await averageParticipants(store, chatId);
  if (average < ACTIVITY_PARTICIPANT_THRESHOLD / 2) return ACTIVITY_MAX_MULTIPLIER;
  if (average < ACTIVITY_PARTICIPANT_THRESHOLD) return ACTIVITY_MULTIPLIER;
  return 1;
}

export async function effectiveIntervalMs(store: DataStore, chatId: string, baseIntervalSec: number): Promise<number> {
  const multiplier = await activityMultiplier(store, chatId);
  return baseIntervalSec * 1000 * multiplier;
}
