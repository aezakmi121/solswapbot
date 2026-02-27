import express, { Request, Response, NextFunction, RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "../config";

/**
 * Wraps an async Express route handler so any rejected promise is forwarded
 * to Express's error middleware instead of silently hanging the request (M21).
 *
 * Usage: router.get("/path", asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
import { telegramAuthMiddleware } from "./middleware/telegramAuth";
import { quoteRouter } from "./routes/quote";
import { swapRouter } from "./routes/swap";
import { priceRouter } from "./routes/price";
import { tokensRouter } from "./routes/tokens";
import { userRouter } from "./routes/user";
import { scanRouter } from "./routes/scan";
import { crossChainRouter } from "./routes/crossChain";
import { historyRouter } from "./routes/history";
import { sendRouter } from "./routes/send";
import { transferRouter } from "./routes/transfer";
import { transactionsRouter } from "./routes/transactions";

/**
 * Creates and configures the Express API server.
 * Runs alongside the Grammy bot to serve the Telegram Mini App.
 */
export function createApiServer(): express.Express {
    const app = express();

    // Trust the first proxy (Vercel/Nginx) so express-rate-limit reads the real client IP
    // from X-Forwarded-For instead of seeing every request as the same proxy IP.
    app.set("trust proxy", 1);

    // Security headers (M2)
    app.use(helmet());

    // Body parsing
    app.use(express.json());

    // CORS — locked to specific origin in production (C4)
    app.use(
        cors({
            origin: config.CORS_ORIGIN,
            methods: ["GET", "POST"],
        })
    );

    // Global rate limiting — 100 requests per minute per IP (M1)
    const apiLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Too many requests, please try again later" },
    });
    app.use("/api", apiLimiter);

    // Health check — no auth required
    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok", timestamp: Date.now() });
    });

    // Public routes — no auth needed (read-only token/price data)
    app.use("/api", priceRouter);
    app.use("/api", tokensRouter);

    // Protected routes — require valid Telegram initData (C2/C3/C5)
    app.use("/api", telegramAuthMiddleware, quoteRouter);
    app.use("/api", telegramAuthMiddleware, swapRouter);
    app.use("/api", telegramAuthMiddleware, userRouter);
    app.use("/api", telegramAuthMiddleware, scanRouter);
    app.use("/api", telegramAuthMiddleware, crossChainRouter);
    app.use("/api", telegramAuthMiddleware, historyRouter);
    app.use("/api", telegramAuthMiddleware, sendRouter);
    app.use("/api", telegramAuthMiddleware, transferRouter);
    app.use("/api", telegramAuthMiddleware, transactionsRouter);

    // Global error handler (improved: logs full error object)
    app.use(
        (
            err: Error,
            _req: express.Request,
            res: express.Response,
            _next: express.NextFunction
        ) => {
            console.error("API error:", err);
            res.status(500).json({ error: "Internal server error" });
        }
    );

    return app;
}

/** Start the API server on the configured port */
export function startApiServer(): express.Express {
    const app = createApiServer();
    const port = config.API_PORT;

    const server = app.listen(port, () => {
        console.log(`API server running on port ${port}`);
    });

    // Expose server for graceful shutdown (H11)
    (app as any)._server = server;
    return app;
}
