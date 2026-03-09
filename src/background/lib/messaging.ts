import { sendMessage } from 'webext-bridge/background';

import type { JsonValue } from 'type-fest';

/**
 * Send a message to a content script with a timeout
 * Rejects if the content script doesn't respond within the specified time
 */
export async function sendMessageWithTimeout<T extends JsonValue = JsonValue>(
  messageId: string,
  data: JsonValue,
  destination: { context: 'content-script'; tabId: number },
  timeoutMs: number = 2_000,
): Promise<T> {
  const result = await Promise.race([
    sendMessage(messageId, data, destination),
    new Promise<never>((__, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
  return result as T;
}
