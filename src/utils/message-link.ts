export function buildMessageLink(chatId: string, messageId: number): string | null {
  const match = /^-(\d+)$/.exec(chatId);
  if (!match || !Number.isInteger(messageId) || messageId <= 0) return null;
  const id = match[1]!;
  const channelPart = id.startsWith('100') && id.length === 13 ? id.slice(3) : id;
  return `https://t.me/c/${channelPart}/${messageId}`;
}
