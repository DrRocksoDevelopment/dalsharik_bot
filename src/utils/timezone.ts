export function parseTimezoneOffset(input: string): number | null {
  const match = /^([+-]?)(\d{1,2})(?::(\d{2}))?$/.exec(input.trim());
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? '0');
  if (hours > 14 || minutes >= 60) return null;
  const total = sign * (hours * 60 + minutes);
  if (total < -720 || total > 840) return null;
  return total;
}

export function formatTimezoneOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return minutes === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`;
}

export function formatLocalTime(nowMs: number, offsetMinutes: number): string {
  const localMinutes = (((Math.floor(nowMs / 60000) % 1440) + offsetMinutes) % 1440 + 1440) % 1440;
  const hours = Math.floor(localMinutes / 60);
  const minutes = localMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function localMinutesFromUtc(nowMs: number, offsetMinutes: number): number {
  return (((Math.floor(nowMs / 60000) % 1440) + offsetMinutes) % 1440 + 1440) % 1440;
}

export function isInInterval(minutes: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function minutesUntilIntervalEnd(minutes: number, start: number, end: number): number {
  if (!isInInterval(minutes, start, end)) return 0;
  if (start < end) return end - minutes;
  return minutes < end ? end - minutes : 1440 - minutes + end;
}

export function formatRelativeDuration(ms: number): string {
  if (ms < 60_000) return 'меньше минуты';
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} мин`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`;
}
