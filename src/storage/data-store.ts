import { JsonStorage } from '../storage/index.js';
import { getEnv } from '../config/config.js';
import type { Identifiable } from './storage.js';
import type { AnswerRecord } from '../game/answer.js';
import type { ChatRecord, PublishedQuestion } from '../game/chat.js';
import type { PollRecord } from '../game/poll.js';
import type { Question } from '../game/question.js';
import type { UserProfile } from '../game/user.js';

export interface MetricsRecord extends Identifiable {
  data: Record<string, unknown>;
}

export interface QuestionNotification extends Identifiable {
  notifiedAt: string;
}

export interface DataStore {
  users: JsonStorage<UserProfile>;
  questions: JsonStorage<Question>;
  answers: JsonStorage<AnswerRecord>;
  chats: JsonStorage<ChatRecord>;
  polls: JsonStorage<PollRecord>;
  questionHistory: JsonStorage<PublishedQuestion>;
  metrics: JsonStorage<MetricsRecord>;
  pendingQuestions: JsonStorage<Question>;
  questionNotifications: JsonStorage<QuestionNotification>;
}

export function createDataStore(dir: string = getEnv().dataDir): DataStore {
  return {
    users: new JsonStorage<UserProfile>(dir, 'users.json'),
    questions: new JsonStorage<Question>(dir, 'questions.json'),
    answers: new JsonStorage<AnswerRecord>(dir, 'answers.json'),
    chats: new JsonStorage<ChatRecord>(dir, 'chats.json'),
    polls: new JsonStorage<PollRecord>(dir, 'polls.json'),
    questionHistory: new JsonStorage<PublishedQuestion>(dir, 'question_history.json'),
    metrics: new JsonStorage<MetricsRecord>(dir, 'metrics.json'),
    pendingQuestions: new JsonStorage<Question>(dir, 'questions_pending.json'),
    questionNotifications: new JsonStorage<QuestionNotification>(dir, 'questions_notified.json'),
  };
}
