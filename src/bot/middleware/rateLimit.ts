import { Context, NextFunction } from "grammy";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

const COMMAND_LIMITS: Record<string, RateLimitConfig> = {
  swap: { maxRequests: 3, windowMs: 10_000 },
  price: { maxRequests: 10, windowMs: 60_000 },
  start: { maxRequests: 1, windowMs: 30_000 },
  default: { maxRequests: 5, windowMs: 30_000 },
};

/** Per-user rate limit buckets: "userId:command" → entry */
const buckets = new Map<string, RateLimitEntry>();

/** Clean up expired entries every 5 minutes */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}, 5 * 60_000);

/** Extracts the command name from message text, e.g. "/swap 1 SOL" → "swap" */
function getCommandName(text: string | undefined): string {
  if (!text?.startsWith("/")) return "default";
  const cmd = text.split(/\s+/)[0].slice(1).split("@")[0];
  return cmd || "default";
}

/** Grammy middleware that enforces per-user, per-command rate limits */
export async function rateLimitMiddleware(
  ctx: Context,
  next: NextFunction
): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const command = getCommandName(ctx.message?.text);
  const limitConfig = COMMAND_LIMITS[command] ?? COMMAND_LIMITS.default;
  const key = `${userId}:${command}`;
  const now = Date.now();

  let entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + limitConfig.windowMs };
    buckets.set(key, entry);
  }

  entry.count++;

  if (entry.count > limitConfig.maxRequests) {
    const waitSeconds = Math.ceil((entry.resetAt - now) / 1000);
    await ctx.reply(`Too many requests. Please wait ${waitSeconds}s and try again.`);
    return;
  }

  return next();
}
