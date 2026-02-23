import { Context, NextFunction } from "grammy";
import { config } from "../../config";

/** Logs every incoming update with user info and command */
export async function loggerMiddleware(
  ctx: Context,
  next: NextFunction
): Promise<void> {
  const start = Date.now();
  const userId = ctx.from?.id ?? "unknown";
  const text = ctx.message?.text ?? ctx.callbackQuery?.data ?? "";

  if (config.LOG_LEVEL === "debug") {
    console.log(`[REQ] user=${userId} text="${text}"`);
  }

  await next();

  const ms = Date.now() - start;
  if (config.LOG_LEVEL === "debug") {
    console.log(`[RES] user=${userId} ${ms}ms`);
  }
}
