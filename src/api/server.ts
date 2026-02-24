import express from "express";
import cors from "cors";
import { config } from "../config";
import { quoteRouter } from "./routes/quote";
import { swapRouter } from "./routes/swap";
import { priceRouter } from "./routes/price";
import { tokensRouter } from "./routes/tokens";
import { userRouter } from "./routes/user";
import { scanRouter } from "./routes/scan";
import { crossChainRouter } from "./routes/crossChain";

/**
 * Creates and configures the Express API server.
 * Runs alongside the Grammy bot to serve the Telegram Mini App.
 */
export function createApiServer(): express.Express {
    const app = express();

    // Middleware
    app.use(express.json());
    app.use(
        cors({
            origin: config.CORS_ORIGIN,
            methods: ["GET", "POST"],
        })
    );

    // Health check
    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok", timestamp: Date.now() });
    });

    // API routes
    app.use("/api", quoteRouter);
    app.use("/api", swapRouter);
    app.use("/api", priceRouter);
    app.use("/api", tokensRouter);
    app.use("/api", userRouter);
    app.use("/api", scanRouter);
    app.use("/api", crossChainRouter);

    // Error handler
    app.use(
        (
            err: Error,
            _req: express.Request,
            res: express.Response,
            _next: express.NextFunction
        ) => {
            console.error("API error:", err.message);
            res.status(500).json({ error: "Internal server error" });
        }
    );

    return app;
}

/** Start the API server on the configured port */
export function startApiServer(): void {
    const app = createApiServer();
    const port = config.API_PORT;

    app.listen(port, () => {
        console.log(`API server running on port ${port}`);
    });
}
