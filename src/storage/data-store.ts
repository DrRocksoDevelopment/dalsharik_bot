import { JsonStorage } from '../storage/index.js';
import { getEnv } from '../config/config.js';
import type { Logger } from 'winston';
import type { Identifiable } from './storage.js';
import type { AnswerRecord } from '../game/answer.js';
import type { ChatRecord, PublishedQuestion } from '../game/chat.js';
import type { PollRecord } from '../game/poll.js';
import type { Question } from '../game/question.js';
import type { UserProfile } from '../game/user.js';
import type { AiSettingsRecord } from '../ai/types.js';
import type { QuestionRatingRecord } from '../game/question-rating.js';

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
  aiSettings: JsonStorage<AiSettingsRecord>;
  questionRatings: JsonStorage<QuestionRatingRecord>;
}

export function createDataStore(dir: string = getEnv().dataDir, logger?: Logger): DataStore {
  return {
    users: new JsonStorage<UserProfile>(dir, 'users.json', logger),
    questions: new JsonStorage<Question>(dir, 'questions.json', logger),
    answers: new JsonStorage<AnswerRecord>(dir, 'answers.json', logger),
    chats: new JsonStorage<ChatRecord>(dir, 'chats.json', logger),
    polls: new JsonStorage<PollRecord>(dir, 'polls.json', logger),
    questionHistory: new JsonStorage<PublishedQuestion>(dir, 'question_history.json', logger),
    metrics: new JsonStorage<MetricsRecord>(dir, 'metrics.json', logger),
    pendingQuestions: new JsonStorage<Question>(dir, 'questions_pending.json', logger),
    questionNotifications: new JsonStorage<QuestionNotification>(dir, 'questions_notified.json', logger),
    aiSettings: new JsonStorage<AiSettingsRecord>(dir, 'settings.json', logger),
    questionRatings: new JsonStorage<QuestionRatingRecord>(dir, 'question_ratings.json', logger),
  };
}
