import type { DataStore, MetricsRecord } from '../storage/data-store.js';
import {
  emptyChatMetrics,
  emptyGameMetrics,
  emptyQuestionMetrics,
  emptySnapshot,
  emptyUserMetrics,
  type ChatMetrics,
  type GameMetrics,
  type MetricsSnapshot,
  type MetricsStore,
  type QuestionMetrics,
  type RecordAnswerInput,
  type UserMetrics,
} from './metrics.js';

const GLOBAL_ID = 'global';
const MEDIAN_BUFFER_SIZE = 500;

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
}

interface StoredUserMetrics {
  answers: number;
  correct: number;
  score: number;
  current_streak: number;
  best_streak: number;
  question_ids: string[];
}

interface StoredChatMetrics {
  questions_published: number;
  answers: number;
  correct: number;
  reaction_time_sum: number;
  first_seen: number;
  players: string[];
}

interface StoredQuestionMetrics {
  times_published: number;
  times_answered: number;
  correct: number;
  reaction_time_sum: number;
  answer_distribution: Record<string, number>;
}

interface StoredSnapshot {
  game: StoredGameMetrics;
  users: Record<string, StoredUserMetrics>;
  chats: Record<string, StoredChatMetrics>;
  questions: Record<string, StoredQuestionMetrics>;
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
    },
    users: {},
    chats: {},
    questions: {},
  };
}

function emptyStoredUser(): StoredUserMetrics {
  return { answers: 0, correct: 0, score: 0, current_streak: 0, best_streak: 0, question_ids: [] };
}

function emptyStoredChat(now: number): StoredChatMetrics {
  return { questions_published: 0, answers: 0, correct: 0, reaction_time_sum: 0, first_seen: now, players: [] };
}

function emptyStoredQuestion(): StoredQuestionMetrics {
  return { times_published: 0, times_answered: 0, correct: 0, reaction_time_sum: 0, answer_distribution: {} };
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
  g.median_reaction_time = median(raw.recent_reaction_times);
  g.fastest_correct_answer = raw.fastest_correct_answer;
  g.slowest_correct_answer = raw.slowest_correct_answer;
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
  u.games_played = new Set(raw.question_ids).size;
  return u;
}

function chatView(raw: StoredChatMetrics): ChatMetrics {
  const c = emptyChatMetrics();
  c.active_players = raw.players.length;
  c.questions_per_day = raw.questions_published / daysSince(raw.first_seen);
  c.answers_per_day = raw.answers / daysSince(raw.first_seen);
  c.average_accuracy = raw.answers > 0 ? raw.correct / raw.answers : 0;
  c.average_response_time = raw.answers > 0 ? raw.reaction_time_sum / raw.answers : 0;
  return c;
}

function questionView(raw: StoredQuestionMetrics): QuestionMetrics {
  const q = emptyQuestionMetrics();
  q.times_published = raw.times_published;
  q.times_answered = raw.times_answered;
  q.correct_rate = raw.times_answered > 0 ? raw.correct / raw.times_answered : 0;
  q.average_response_time = raw.times_answered > 0 ? raw.reaction_time_sum / raw.times_answered : 0;
  q.answer_distribution = { ...raw.answer_distribution };
  return q;
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
      fn(item.data);
    });
  }

  async recordQuestionPublished(chatId: string, questionId: string): Promise<void> {
    await this.mutate((s) => {
      s.game.questions_published += 1;
      const chat = (s.chats[chatId] ??= emptyStoredChat(Date.now()));
      chat.questions_published += 1;
      const q = (s.questions[questionId] ??= emptyStoredQuestion());
      q.times_published += 1;
    });
  }

  async recordQuestionCompleted(_chatId: string, _questionId: string): Promise<void> {
    await this.mutate((s) => {
      s.game.questions_completed += 1;
    });
  }

  async recordAnswer(input: RecordAnswerInput): Promise<void> {
    const rt = input.reactionTimeMs;
    await this.mutate((s) => {
      s.game.total_answers += 1;
      if (input.isCorrect) {
        s.game.correct_answers += 1;
        if (s.game.fastest_correct_answer === null || rt < s.game.fastest_correct_answer) {
          s.game.fastest_correct_answer = rt;
        }
        if (s.game.slowest_correct_answer === null || rt > s.game.slowest_correct_answer) {
          s.game.slowest_correct_answer = rt;
        }
      } else {
        s.game.wrong_answers += 1;
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
      if (!user.question_ids.includes(input.questionId)) user.question_ids.push(input.questionId);

      const chat = (s.chats[input.chatId] ??= emptyStoredChat(Date.now()));
      chat.answers += 1;
      if (input.isCorrect) chat.correct += 1;
      chat.reaction_time_sum += rt;
      if (!chat.players.includes(input.userId)) chat.players.push(input.userId);

      const q = (s.questions[input.questionId] ??= emptyStoredQuestion());
      q.times_answered += 1;
      if (input.isCorrect) q.correct += 1;
      q.reaction_time_sum += rt;
      q.answer_distribution[input.selectedOption] = (q.answer_distribution[input.selectedOption] ?? 0) + 1;
    });
  }

  async snapshot(): Promise<MetricsSnapshot> {
    const item = await this.store.metrics.get(GLOBAL_ID);
    const raw = item ? asStored(item.data) : emptyStoredSnapshot();
    const snapshot = emptySnapshot();
    snapshot.game = gameView(raw.game);
    for (const [id, m] of Object.entries(raw.users)) snapshot.users[id] = userView(m);
    for (const [id, m] of Object.entries(raw.chats)) snapshot.chats[id] = chatView(m);
    for (const [id, m] of Object.entries(raw.questions)) snapshot.questions[id] = questionView(m);
    return snapshot;
  }
}
