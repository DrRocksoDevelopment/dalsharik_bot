export interface DifficultyWindow {
  startHour: number;
  endHour: number;
  min: number;
  max: number;
}

export const TIME_OF_DAY_DIFFICULTY: DifficultyWindow[] = [
  { startHour: 6, endHour: 12, min: 1, max: 2 },
  { startHour: 12, endHour: 18, min: 2, max: 4 },
  { startHour: 18, endHour: 24, min: 3, max: 5 },
  { startHour: 0, endHour: 6, min: 2, max: 4 },
];

export function normalizeOffsetMinutes(offsetMinutes: number): number {
  return ((offsetMinutes % 1440) + 1440) % 1440;
}

export function localHourFromUtc(nowMs: number, offsetMinutes: number): number {
  const utcMinutes = Math.floor(nowMs / 60000) % 1440;
  const localMinutes = normalizeOffsetMinutes(utcMinutes + offsetMinutes);
  return Math.floor(localMinutes / 60);
}

export function difficultyWindowForHour(hour: number): DifficultyWindow {
  return (
    TIME_OF_DAY_DIFFICULTY.find((w) => hour >= w.startHour && hour < w.endHour) ??
    TIME_OF_DAY_DIFFICULTY[TIME_OF_DAY_DIFFICULTY.length - 1]!
  );
}

export function intersectDifficultyRange(
  windowMin: number,
  windowMax: number,
  chatMin: number,
  chatMax: number,
): { min: number; max: number } {
  const min = Math.max(windowMin, chatMin);
  const max = Math.min(windowMax, chatMax);
  if (min > max) {
    return { min: chatMin, max: chatMax };
  }
  return { min, max };
}

export function effectiveDifficultyRange(
  nowMs: number,
  offsetMinutes: number,
  chatMin: number,
  chatMax: number,
): { min: number; max: number } {
  const hour = localHourFromUtc(nowMs, offsetMinutes);
  const window = difficultyWindowForHour(hour);
  return intersectDifficultyRange(window.min, window.max, chatMin, chatMax);
}
