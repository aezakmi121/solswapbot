/**
 * Retries an async function with exponential backoff.
 * Only retries on transient errors (network, 429, 503).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, label = "operation" } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLastAttempt = attempt === maxRetries;
      const message = err instanceof Error ? err.message : String(err);

      // Only retry on transient errors
      const isRetryable =
        message.includes("429") ||
        message.includes("503") ||
        message.includes("ECONNRESET") ||
        message.includes("ETIMEDOUT") ||
        message.includes("fetch failed");

      if (isLastAttempt || !isRetryable) {
        throw err;
      }

      const delay = baseDelayMs * 2 ** attempt;
      console.warn(`${label} attempt ${attempt + 1} failed, retrying in ${delay}ms: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unreachable");
}
