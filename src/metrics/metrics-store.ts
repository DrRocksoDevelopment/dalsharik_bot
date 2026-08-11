import type { DataStore, MetricsRecord } from '../storage/data-store.js';
import {
  emptyAiUsageMetrics,
  emptyChatMetrics,
  emptyGameMetrics,
  emptyQuestionMetrics,
  emptySnapshot,
  emptyUserMetrics,
  type AiUsageMetrics,
  type ChatMetrics,
  type GameMetrics,
  type MetricsSnapshot,
  type MetricsStore,
  type QuestionMeta,
  type QuestionMetrics,
  type RecordAiUsageInput,
  type RecordAnswerInput,
  type UserMetrics,
} from './metrics.js';

const GLOBAL_ID = 'global';
const MEDIAN_BUFFER_SIZE = 500;
const MAX_CHAT_PLAYERS = 200;
const MAX_USER_QUESTION_IDS = 500;

interface StoredDayMetrics {
  questions_published: number;
  questions_completed: number;
  answers: number;
  correct: number;
  wrong: number;
}

interface StoredGameMetrics {
  questions_published: number;
  questions_completed: number;
  total_answers: number;
  correct_answers: number;
  wrong_answers: number;
  reaction_time_sum: number;
  fastest_correct_answer: number | null;
  slowest_correct_answer: number | null;
  recent_reaction_times: number[];
  recent_correct_times: number[];
  recent_wrong_times: number[];
  rounds_count: number;
  rounds_participants_sum: number;
  daily: Record<string, StoredDayMetrics>;
}

interface StoredUserMetrics {
  answers: number;
  correct: number;
  score: number;
  current_streak: number;
  best_streak: number;
  games_played: number;
  question_ids: string[];
  first_seen: number | null;
  last_seen: number | null;
}

interface StoredChatMetrics {
  questions_published: number;
  answers: number;
  correct: number;
  reaction_time_sum: number;
  first_seen: number;
  players_count: number;
  players: string[];
  rounds_count: number;
  rounds_participants_sum: number;
}

interface StoredQuestionMetrics {
  times_published: number;
  times_answered: number;
  correct: number;
  reaction_time_sum: number;
  answer_distribution: Record<string, number>;
  type: string | null;
  category: string | null;
  difficulty: number | null;
}

type StoredAiUsageMetrics = Omit<AiUsageMetrics, never>;

interface StoredAiMetrics {
  generate: StoredAiUsageMetrics;
  host: StoredAiUsageMetrics;
}

interface StoredSnapshot {
  game: StoredGameMetrics;
  users: Record<string, StoredUserMetrics>;
  chats: Record<string, StoredChatMetrics>;
  questions: Record<string, StoredQuestionMetrics>;
  ai: StoredAiMetrics;
}

function emptyStoredSnapshot(): StoredSnapshot {
  return {
    game: {
      questions_published: 0,
      questions_completed: 0,
      total_answers: 0,
      correct_answers: 0,
      wrong_answers: 0,
      reaction_time_sum: 0,
      fastest_correct_answer: null,
      slowest_correct_answer: null,
      recent_reaction_times: [],
      recent_correct_times: [],
      recent_wrong_times: [],
      rounds_count: 0,
      rounds_participants_sum: 0,
      daily: {},
    },
    users: {},
    chats: {},
    questions: {},
    ai: {
      generate: emptyAiUsageMetrics(),
      host: emptyAiUsageMetrics(),
    },
  };
}

function emptyStoredUser(): StoredUserMetrics {
  return { answers: 0, correct: 0, score: 0, current_streak: 0, best_streak: 0, games_played: 0, question_ids: [], first_seen: null, last_seen: null };
}

function emptyStoredChat(now: number): StoredChatMetrics {
  return { questions_published: 0, answers: 0, correct: 0, reaction_time_sum: 0, first_seen: now, players_count: 0, players: [], rounds_count: 0, rounds_participants_sum: 0 };
}

function emptyStoredQuestion(): StoredQuestionMetrics {
  return { times_published: 0, times_answered: 0, correct: 0, reaction_time_sum: 0, answer_distribution: {}, type: null, category: null, difficulty: null };
}

function emptyStoredDay(): StoredDayMetrics {
  return { questions_published: 0, questions_completed: 0, answers: 0, correct: 0, wrong: 0 };
}

function ensureDefaults(s: StoredSnapshot): void {
  const g = s.game;
  if (!g.daily) g.daily = {};
  if (!g.recent_correct_times) g.recent_correct_times = [];
  if (!g.recent_wrong_times) g.recent_wrong_times = [];
  if (typeof g.rounds_count !== 'number') g.rounds_count = 0;
  if (typeof g.rounds_participants_sum !== 'number') g.rounds_participants_sum = 0;
  if (!s.ai) s.ai = { generate: emptyAiUsageMetrics(), host: emptyAiUsageMetrics() };
  if (!s.ai.generate) s.ai.generate = emptyAiUsageMetrics();
  if (!s.ai.host) s.ai.host = emptyAiUsageMetrics();
  for (const u of Object.values(s.users)) {
    if (typeof u.games_played !== 'number') {
      u.games_played = new Set(u.question_ids ?? []).size;
    }
    if (typeof u.first_seen !== 'number') u.first_seen = null;
    if (typeof u.last_seen !== 'number') u.last_seen = null;
  }
  for (const c of Object.values(s.chats)) {
    if (typeof c.players_count !== 'number') {
      c.players_count = Array.isArray(c.players) ? c.players.length : 0;
    }
    if (typeof c.rounds_count !== 'number') c.rounds_count = 0;
    if (typeof c.rounds_participants_sum !== 'number') c.rounds_participants_sum = 0;
  }
  for (const q of Object.values(s.questions)) {
    if (typeof q.type !== 'string') q.type = null;
    if (typeof q.category !== 'string') q.category = null;
    if (typeof q.difficulty !== 'number') q.difficulty = null;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function daysSince(timestamp: number): number {
  const days = (Date.now() - timestamp) / 86_400_000;
  return Math.max(1, days);
}

function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function asStored(data: Record<string, unknown>): StoredSnapshot {
  return data as unknown as StoredSnapshot;
}

function gameView(raw: StoredGameMetrics): GameMetrics {
  const g = emptyGameMetrics();
  g.questions_published = raw.questions_published;
  g.questions_completed = raw.questions_completed;
  g.total_answers = raw.total_answers;
  g.correct_answers = raw.correct_answers;
  g.wrong_answers = raw.wrong_answers;
  g.average_reaction_time = raw.total_answers > 0 ? raw.reaction_time_sum / raw.total_answers : 0;
  g.median_reaction_time = median(raw.recent_reaction_times ?? []);
  g.median_correct_reaction_time = median(raw.recent_correct_times ?? []);
  g.median_wrong_reaction_time = median(raw.recent_wrong_times ?? []);
  g.fastest_correct_answer = raw.fastest_correct_answer;
  g.slowest_correct_answer = raw.slowest_correct_answer;
  g.rounds_count = raw.rounds_count ?? 0;
  g.average_round_participants =
    raw.rounds_count > 0 ? (raw.rounds_participants_sum ?? 0) / raw.rounds_count : 0;
  g.daily = {};
  for (const [day, m] of Object.entries(raw.daily ?? {})) {
    g.daily[day] = {
      questions_published: m.questions_published,
      questions_completed: m.questions_completed,
      answers: m.answers,
      correct: m.correct,
      wrong: m.wrong,
    };
  }
  return g;
}

function userView(raw: StoredUserMetrics): UserMetrics {
  const u = emptyUserMetrics();
  u.answers = raw.answers;
  u.correct = raw.correct;
  u.accuracy = raw.answers > 0 ? raw.correct / raw.answers : 0;
  u.score = raw.score;
  u.current_streak = raw.current_streak;
  u.best_streak = raw.best_streak;
  u.games_played = typeof raw.games_played === 'number'
    ? raw.games_played
    : new Set(raw.question_ids ?? []).size;
  u.first_seen = typeof raw.first_seen === 'number' ? raw.first_seen : null;
  u.last_seen = typeof raw.last_seen === 'number' ? raw.last_seen : null;
  return u;
}

function chatView(raw: StoredChatMetrics): ChatMetrics {
  const c = emptyChatMetrics();
  c.active_players = typeof raw.players_count === 'number'
    ? raw.players_count
    : (raw.players ?? []).length;
  c.questions_per_day = raw.questions_published / daysSince(raw.first_seen);
  c.answers_per_day = raw.answers / daysSince(raw.first_seen);
  c.average_accuracy = raw.answers > 0 ? raw.correct / raw.answers : 0;
  c.average_response_time = raw.answers > 0 ? raw.reaction_time_sum / raw.answers : 0;
  c.rounds_count = raw.rounds_count ?? 0;
  c.average_round_participants =
    raw.rounds_count > 0 ? (raw.rounds_participants_sum ?? 0) / raw.rounds_count : 0;
  return c;
}

function questionView(raw: StoredQuestionMetrics): QuestionMetrics {
  const q = emptyQuestionMetrics();
  q.times_published = raw.times_published;
  q.times_answered = raw.times_answered;
  q.correct_rate = raw.times_answered > 0 ? raw.correct / raw.times_answered : 0;
  q.average_response_time = raw.times_answered > 0 ? raw.reaction_time_sum / raw.times_answered : 0;
  q.answer_distribution = { ...raw.answer_distribution };
  q.type = typeof raw.type === 'string' ? raw.type : null;
  q.category = typeof raw.category === 'string' ? raw.category : null;
  q.difficulty = typeof raw.difficulty === 'number' ? raw.difficulty : null;
  return q;
}

function aiUsageTotal(a: AiUsageMetrics, b: AiUsageMetrics): AiUsageMetrics {
  return {
    calls: a.calls + b.calls,
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
    web_search_requests: a.web_search_requests + b.web_search_requests,
    estimated_cost_usd: a.estimated_cost_usd + b.estimated_cost_usd,
    inference_cost_usd: a.inference_cost_usd + b.inference_cost_usd,
    search_cost_usd: a.search_cost_usd + b.search_cost_usd,
  };
}

export class JsonMetricsStore implements MetricsStore {
  constructor(private readonly store: DataStore) {}

  private async mutate(fn: (snapshot: StoredSnapshot) => void): Promise<void> {
    await this.store.metrics.mutate((items) => {
      let item = items.find((i) => i.id === GLOBAL_ID) as (MetricsRecord & { data: StoredSnapshot }) | undefined;
      if (!item) {
        item = { id: GLOBAL_ID, data: emptyStoredSnapshot() } as MetricsRecord & { data: StoredSnapshot };
        items.push(item);
      }
      ensureDefaults(item.data);
      fn(item.data);
    });
  }

  async recordQuestionPublished(chatId: string, question: QuestionMeta): Promise<void> {
    await this.mutate((s) => {
      const now = Date.now();
      s.game.questions_published += 1;
      const day = (s.game.daily[dayKey(now)] ??= emptyStoredDay());
      day.questions_published += 1;
      const chat = (s.chats[chatId] ??= emptyStoredChat(now));
      chat.questions_published += 1;
      const q = (s.questions[question.id] ??= emptyStoredQuestion());
      q.times_published += 1;
      q.type = question.type;
      q.category = question.category;
      q.difficulty = question.difficulty;
    });
  }

  async recordQuestionCompleted(chatId: string, _questionId: string, participantCount: number): Promise<void> {
    await this.mutate((s) => {
      const now = Date.now();
      s.game.questions_completed += 1;
      const day = (s.game.daily[dayKey(now)] ??= emptyStoredDay());
      day.questions_completed += 1;
      s.game.rounds_count += 1;
      s.game.rounds_participants_sum += participantCount;

      const chat = (s.chats[chatId] ??= emptyStoredChat(now));
      chat.rounds_count += 1;
      chat.rounds_participants_sum += participantCount;
    });
  }

  async recordAnswer(input: RecordAnswerInput): Promise<void> {
    const rt = input.reactionTimeMs;
    await this.mutate((s) => {
      const now = Date.now();
      s.game.total_answers += 1;
      const day = (s.game.daily[dayKey(now)] ??= emptyStoredDay());
      day.answers += 1;
      if (input.isCorrect) {
        s.game.correct_answers += 1;
        day.correct += 1;
        if (s.game.fastest_correct_answer === null || rt < s.game.fastest_correct_answer) {
          s.game.fastest_correct_answer = rt;
        }
        if (s.game.slowest_correct_answer === null || rt > s.game.slowest_correct_answer) {
          s.game.slowest_correct_answer = rt;
        }
        s.game.recent_correct_times.push(rt);
        if (s.game.recent_correct_times.length > MEDIAN_BUFFER_SIZE) {
          s.game.recent_correct_times.splice(0, s.game.recent_correct_times.length - MEDIAN_BUFFER_SIZE);
        }
      } else {
        s.game.wrong_answers += 1;
        day.wrong += 1;
        s.game.recent_wrong_times.push(rt);
        if (s.game.recent_wrong_times.length > MEDIAN_BUFFER_SIZE) {
          s.game.recent_wrong_times.splice(0, s.game.recent_wrong_times.length - MEDIAN_BUFFER_SIZE);
        }
      }
      s.game.reaction_time_sum += rt;
      s.game.recent_reaction_times.push(rt);
      if (s.game.recent_reaction_times.length > MEDIAN_BUFFER_SIZE) {
        s.game.recent_reaction_times.splice(0, s.game.recent_reaction_times.length - MEDIAN_BUFFER_SIZE);
      }

      const user = (s.users[input.userId] ??= emptyStoredUser());
      user.answers += 1;
      if (input.isCorrect) user.correct += 1;
      user.score = input.score;
      user.current_streak = input.currentStreak;
      if (input.bestStreak > user.best_streak) user.best_streak = input.bestStreak;
      if (!user.question_ids.includes(input.questionId)) {
        user.question_ids.push(input.questionId);
        user.games_played += 1;
        if (user.question_ids.length > MAX_USER_QUESTION_IDS) {
          user.question_ids.splice(0, user.question_ids.length - MAX_USER_QUESTION_IDS);
        }
      }
      if (user.first_seen === null) user.first_seen = now;
      user.last_seen = now;

      const chat = (s.chats[input.chatId] ??= emptyStoredChat(Date.now()));
      chat.answers += 1;
      if (input.isCorrect) chat.correct += 1;
      chat.reaction_time_sum += rt;
      if (!chat.players.includes(input.userId)) {
        chat.players_count += 1;
        if (chat.players.length < MAX_CHAT_PLAYERS) {
          chat.players.push(input.userId);
        }
      }

      const q = (s.questions[input.questionId] ??= emptyStoredQuestion());
      q.times_answered += 1;
      if (input.isCorrect) q.correct += 1;
      q.reaction_time_sum += rt;
      q.answer_distribution[input.selectedOption] = (q.answer_distribution[input.selectedOption] ?? 0) + 1;
    });
  }

  async recordAiUsage(input: RecordAiUsageInput): Promise<void> {
    await this.mutate((s) => {
      const bucket = input.kind === 'generate' ? s.ai.generate : s.ai.host;
      bucket.calls += 1;
      bucket.prompt_tokens += input.promptTokens;
      bucket.completion_tokens += input.completionTokens;
      bucket.total_tokens += input.totalTokens;
      bucket.web_search_requests += input.webSearchRequests;
      bucket.estimated_cost_usd += input.estimatedCostUsd;
      bucket.inference_cost_usd += input.inferenceCostUsd;
      bucket.search_cost_usd += input.searchCostUsd;
    });
  }

  async snapshot(): Promise<MetricsSnapshot> {
    const item = await this.store.metrics.get(GLOBAL_ID);
    const raw = item ? asStored(item.data) : emptyStoredSnapshot();
    ensureDefaults(raw);
    const snapshot = emptySnapshot();
    snapshot.game = gameView(raw.game);
    for (const [id, m] of Object.entries(raw.users)) snapshot.users[id] = userView(m);
    for (const [id, m] of Object.entries(raw.chats)) snapshot.chats[id] = chatView(m);
    for (const [id, m] of Object.entries(raw.questions)) snapshot.questions[id] = questionView(m);
    snapshot.ai.generate = { ...raw.ai.generate };
    snapshot.ai.host = { ...raw.ai.host };
    snapshot.ai.total = aiUsageTotal(raw.ai.generate, raw.ai.host);
    return snapshot;
  }
}
