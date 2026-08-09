import type { ChatConfig } from '../types/index.js';

export type ChatRecord = ChatConfig & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export interface PublishedQuestion {
  id: string;
  chatId: string;
  questionId: string;
  publishedAt: string;
}
