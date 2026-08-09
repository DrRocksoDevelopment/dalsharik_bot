import { DIFFICULTY_POINTS, STREAK } from '../config/config.js';

export interface CalculatePointsInput {
  difficulty: number;
  streak: number;
  alreadyAnswered: boolean;
}

export interface CalculatePointsResult {
  basePoints: number;
  multiplier: number;
  points: number;
  isRepeat: boolean;
}

export function basePointsForDifficulty(difficulty: number): number {
  return DIFFICULTY_POINTS[difficulty] ?? 0;
}

export function calculateStreakMultiplier(streak: number): number {
  if (streak <= 0) return 1;
  if (streak < 5) return 1 + streak * 0.1;
  if (streak < 10) return 1.5 + (streak - 5) * 0.08;
  return STREAK.maxMultiplier;
}

export function calculatePoints(input: CalculatePointsInput): CalculatePointsResult {
  const { difficulty, streak, alreadyAnswered } = input;

  if (alreadyAnswered) {
    return { basePoints: 0, multiplier: 1, points: 0, isRepeat: true };
  }

  const basePoints = basePointsForDifficulty(difficulty);
  const multiplier = calculateStreakMultiplier(streak);
  const points = Math.round(basePoints * multiplier);

  return { basePoints, multiplier, points, isRepeat: false };
}
