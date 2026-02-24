import { Router, Request, Response } from "express";
import { getSmartQuote } from "../../aggregator/router";
import { getSupportedChainIds, CHAINS, CROSS_CHAIN_TOKENS } from "../../aggregator/chains";

export const crossChainRouter = Router();

/**
 * GET /api/cross-chain/quote
 *
 * Smart quote endpoint: automatically uses Jupiter (same-chain) or Rango (cross-chain).
 *
 * Query params:
 *   inputToken   — symbol (SOL) or address
 *   outputToken  — symbol (ETH) or address
 *   inputChain   — "solana", "ethereum", etc.
 *   outputChain  — "solana", "ethereum", etc.
 *   amount       — human-readable amount (e.g. "1.5")
 *   slippageBps  — optional, default 50
 */
crossChainRouter.get("/cross-chain/quote", async (req: Request, res: Response) => {
    try {
        const { inputToken, outputToken, inputChain, outputChain, amount, slippageBps } = req.query;

        if (!inputToken || !outputToken || !inputChain || !outputChain || !amount) {
            res.status(400).json({
                error: "Missing required params: inputToken, outputToken, inputChain, outputChain, amount",
            });
            return;
        }

        const result = await getSmartQuote({
            inputToken: inputToken as string,
            outputToken: outputToken as string,
            inputChain: inputChain as string,
            outputChain: outputChain as string,
            amount: amount as string,
            slippageBps: slippageBps ? parseInt(slippageBps as string) : undefined,
        });

        if (result.error) {
            res.status(400).json({ error: result.error, provider: result.provider });
            return;
        }

        res.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Cross-chain quote error:", message);
        res.status(500).json({ error: "Failed to get quote" });
    }
});

/**
 * GET /api/cross-chain/chains
 * Returns list of supported chains for the Mini App chain selector.
 */
crossChainRouter.get("/cross-chain/chains", (_req: Request, res: Response) => {
    res.json({
        chains: Object.values(CHAINS),
        supportedChainIds: getSupportedChainIds(),
    });
});

/**
 * GET /api/cross-chain/tokens?chain=<chainId>
 * Returns tokens available on a specific chain.
 */
crossChainRouter.get("/cross-chain/tokens", (req: Request, res: Response) => {
    const chainId = req.query.chain as string;

    if (!chainId) {
        res.json({ tokens: CROSS_CHAIN_TOKENS });
        return;
    }

    const filtered = CROSS_CHAIN_TOKENS.filter(t => t.chainId === chainId.toLowerCase());
    res.json({ tokens: filtered });
});
