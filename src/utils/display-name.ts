import type { UserProfile } from '../game/user.js';

export function displayName(user: UserProfile | undefined, userId: string): string {
  if (!user) return `@${userId}`;
  if (user.username) return `@${user.username}`;
  return user.firstName ?? `@${userId}`;
}
