import { Context, NextFunction } from "grammy";
import { config } from "../../config";

/** Commands that always get logged regardless of LOG_LEVEL (audit trail) */
const ALWAYS_LOG_COMMANDS = new Set(["swap", "connect", "start", "status"]);

/** Logs every incoming update with user info and command */
export async function loggerMiddleware(
  ctx: Context,
  next: NextFunction
): Promise<void> {
  const start = Date.now();
  const userId = ctx.from?.id ?? "unknown";
  const text = ctx.message?.text ?? ctx.callbackQuery?.data ?? "";
  const command = text.startsWith("/") ? text.split(/\s+/)[0].slice(1).split("@")[0] : "";

  // Always log swap-related commands for audit trail
  const shouldLog = config.LOG_LEVEL === "debug" || ALWAYS_LOG_COMMANDS.has(command);

  if (shouldLog) {
    console.log(`[${new Date().toISOString()}] [REQ] user=${userId} cmd=${command || "message"}`);
  }

  await next();

  const ms = Date.now() - start;
  if (shouldLog) {
    console.log(`[${new Date().toISOString()}] [RES] user=${userId} cmd=${command || "message"} ${ms}ms`);
  }
}
