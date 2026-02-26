/**
 * Retries an async function with exponential backoff.
 * Only retries on transient errors (network failures, rate limits, server errors).
 *
 * Checks err.status (numeric HTTP code) first, then falls back to message
 * pattern matching for errors that don't carry a status code (M25).
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

      // Check numeric status code first (most reliable)
      const status = (err as any)?.status as number | undefined;
      const isRetryableStatus =
        status === 429 ||   // Too Many Requests
        status === 503 ||   // Service Unavailable
        status === 502 ||   // Bad Gateway
        status === 504;     // Gateway Timeout

      // Fallback: network-level errors that don't have HTTP status codes
      const message = err instanceof Error ? err.message : String(err);
      const isRetryableMessage =
        message.includes("ECONNRESET") ||
        message.includes("ETIMEDOUT") ||
        message.includes("ENOTFOUND") ||
        message.includes("fetch failed") ||
        message.includes("network error");

      const isRetryable = isRetryableStatus || isRetryableMessage;

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
