export interface UserProfile {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  score: number;
  currentStreak: number;
  bestStreak: number;
  streakMultiplier: number;
  gamesPlayed: number;
  answers: number;
  correct: number;
  wrong: number;
  createdAt: string;
  updatedAt: string;
}
