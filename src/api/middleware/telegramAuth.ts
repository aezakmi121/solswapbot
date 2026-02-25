import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { config } from "../../config";

/**
 * Maximum age (in seconds) for initData to be considered valid.
 * Prevents replay attacks with stolen init data.
 */
const MAX_AUTH_AGE_SECONDS = 3600; // 1 hour

/**
 * Validates Telegram Mini App initData using HMAC-SHA256.
 *
 * Algorithm (from Telegram docs):
 *   1. Parse initData as query params, extract `hash`
 *   2. Sort remaining params alphabetically, join with \n
 *   3. secret_key = HMAC-SHA256(bot_token, "WebAppData")
 *   4. computed_hash = hex(HMAC-SHA256(data_check_string, secret_key))
 *   5. Compare computed_hash with hash — must match
 *   6. Check auth_date is not too old (replay prevention)
 *
 * On success, attaches `telegramId` to res.locals for downstream routes.
 */
export function telegramAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        res.status(401).json({ error: "Missing Authorization header" });
        return;
    }

    // Expected format: "tma <initData>"
    const [authType, initDataRaw] = authHeader.split(" ", 2);

    if (authType !== "tma" || !initDataRaw) {
        res.status(401).json({ error: "Invalid Authorization format. Expected: tma <initData>" });
        return;
    }

    try {
        const params = new URLSearchParams(initDataRaw);
        const hash = params.get("hash");

        if (!hash) {
            res.status(401).json({ error: "Missing hash in initData" });
            return;
        }

        // Build data-check-string: all params except hash, sorted alphabetically, joined by \n
        params.delete("hash");
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join("\n");

        // Derive secret key: HMAC-SHA256(bot_token, "WebAppData")
        const secretKey = crypto
            .createHmac("sha256", "WebAppData")
            .update(config.TELEGRAM_BOT_TOKEN)
            .digest();

        // Compute hash: HMAC-SHA256(data_check_string, secret_key)
        const computedHash = crypto
            .createHmac("sha256", secretKey)
            .update(dataCheckString)
            .digest("hex");

        // Constant-time comparison to prevent timing attacks
        if (!crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash))) {
            res.status(401).json({ error: "Invalid initData signature" });
            return;
        }

        // Check auth_date expiration (replay attack prevention)
        const authDate = params.get("auth_date");
        if (!authDate) {
            res.status(401).json({ error: "Missing auth_date in initData" });
            return;
        }

        const authTimestamp = parseInt(authDate, 10);
        const now = Math.floor(Date.now() / 1000);

        if (isNaN(authTimestamp) || now - authTimestamp > MAX_AUTH_AGE_SECONDS) {
            res.status(401).json({ error: "initData expired" });
            return;
        }

        // Extract telegramId from user field
        const userJson = params.get("user");
        if (!userJson) {
            res.status(401).json({ error: "Missing user in initData" });
            return;
        }

        const user = JSON.parse(userJson);
        const telegramId = user?.id?.toString();

        if (!telegramId) {
            res.status(401).json({ error: "Missing user.id in initData" });
            return;
        }

        // Attach verified telegramId to response locals
        res.locals.telegramId = telegramId;
        next();
    } catch (err) {
        console.error("Telegram auth middleware error:", err);
        res.status(401).json({ error: "Failed to validate initData" });
    }
}
