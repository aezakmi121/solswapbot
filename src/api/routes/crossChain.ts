import { Router, Request, Response } from "express";
import { getSmartQuote } from "../../aggregator/router";
import { getLiFiQuote } from "../../aggregator/lifi";
import { getSupportedChainIds, CHAINS, CROSS_CHAIN_TOKENS, findToken } from "../../aggregator/chains";
import { findUserByTelegramId } from "../../db/queries/users";
import { prisma } from "../../db/client";

/** Convert a human-readable amount string to smallest unit string using BigInt arithmetic. */
function toSmallestUnit(humanAmount: string, decimals: number): string {
    const [intPart, fracPart = ""] = humanAmount.split(".");
    const padded = fracPart.padEnd(decimals, "0").slice(0, decimals);
    return (BigInt(intPart) * BigInt(10 ** decimals) + BigInt(padded || "0")).toString();
}

export const crossChainRouter = Router();

/**
 * GET /api/cross-chain/quote
 *
 * Smart quote endpoint: automatically uses Jupiter (same-chain) or LI.FI (cross-chain).
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

        // M2: Validate slippageBps range (matching same-chain /api/quote validation)
        let parsedSlippageBps: number | undefined;
        if (slippageBps) {
            parsedSlippageBps = parseInt(slippageBps as string, 10);
            if (!Number.isInteger(parsedSlippageBps) || parsedSlippageBps < 0 || parsedSlippageBps > 5000) {
                res.status(400).json({ error: "Invalid slippageBps: must be 0\u20135000" });
                return;
            }
        }

        const result = await getSmartQuote({
            inputToken: inputToken as string,
            outputToken: outputToken as string,
            inputChain: inputChain as string,
            outputChain: outputChain as string,
            amount: amount as string,
            slippageBps: parsedSlippageBps,
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

/**
 * POST /api/cross-chain/execute
 *
 * Fetches a LI.FI quote with the user's real wallet address(es) so the
 * returned transactionRequest.data is signed for the correct wallet.
 * The frontend signs the base64 Solana transaction with Privy and then
 * calls POST /api/cross-chain/confirm to record the swap in the DB.
 *
 * Only Solana-originated swaps are supported (inputChain must be "solana").
 *
 * Body: { inputToken, outputToken, inputChain, outputChain, amount, slippageBps?, fromAddress, toAddress? }
 * Response: { transactionData: base64, lifiRouteId: string, outputAmount: string }
 */
crossChainRouter.post("/cross-chain/execute", async (req: Request, res: Response) => {
    try {
        const {
            inputToken, outputToken, inputChain, outputChain,
            amount, slippageBps, fromAddress, toAddress,
        } = req.body;

        if (!inputToken || !outputToken || !inputChain || !outputChain || !amount || !fromAddress) {
            res.status(400).json({ error: "Missing required fields: inputToken, outputToken, inputChain, outputChain, amount, fromAddress" });
            return;
        }

        if (inputChain !== "solana") {
            res.status(400).json({ error: "Only Solana-originated cross-chain swaps are currently supported" });
            return;
        }

        const inputChainInfo = CHAINS[inputChain];
        const outputChainInfo = CHAINS[outputChain];
        if (!inputChainInfo || !outputChainInfo) {
            res.status(400).json({ error: "Unsupported chain" });
            return;
        }

        const inputTokenInfo = findToken(inputToken, inputChain);
        const outputTokenInfo = findToken(outputToken, outputChain);
        if (!inputTokenInfo || !outputTokenInfo) {
            res.status(400).json({ error: "Unsupported token for the specified chain" });
            return;
        }

        const parsedAmount = parseFloat(amount);
        if (!isFinite(parsedAmount) || parsedAmount <= 0) {
            res.status(400).json({ error: "Invalid amount" });
            return;
        }

        let parsedSlippage: number | undefined;
        if (slippageBps !== undefined) {
            const bps = parseInt(String(slippageBps), 10);
            if (!Number.isInteger(bps) || bps < 0 || bps > 5000) {
                res.status(400).json({ error: "Invalid slippageBps: must be 0–5000" });
                return;
            }
            parsedSlippage = bps / 10000;
        }

        // Default toAddress: user's own wallet (for Solana output) or required for EVM
        const resolvedToAddress = toAddress ?? (outputChain === "solana" ? fromAddress : undefined);
        if (!resolvedToAddress) {
            res.status(400).json({ error: "toAddress is required for EVM destination chains" });
            return;
        }

        const fromAmount = toSmallestUnit(amount, inputTokenInfo.decimals);

        const result = await getLiFiQuote({
            fromChain: inputChainInfo.lifiChainId,
            toChain: outputChainInfo.lifiChainId,
            fromToken: inputTokenInfo.address,
            toToken: outputTokenInfo.address,
            fromAmount,
            fromAddress,
            toAddress: resolvedToAddress,
            slippage: parsedSlippage,
        });

        if (result.error) {
            res.status(400).json({ error: result.error });
            return;
        }

        if (!result.transactionRequest || !(result.transactionRequest as any).data) {
            res.status(502).json({ error: "LI.FI did not return a signable transaction. Try a different amount or token pair." });
            return;
        }

        res.json({
            transactionData: (result.transactionRequest as any).data as string,
            lifiRouteId: result.id,
            outputAmount: result.toAmount,
            outputAmountUsd: result.toAmountUsd,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Cross-chain execute error:", message);
        res.status(500).json({ error: "Failed to build bridge transaction" });
    }
});

/**
 * POST /api/cross-chain/confirm
 *
 * Records a completed bridge transaction in the DB after the user has signed
 * and broadcast the Solana transaction.
 *
 * Body: { txSignature, inputToken, outputToken, inputChain, outputChain, inputAmount, outputAmount, feeAmountUsd? }
 * Response: { swapId, status: "SUBMITTED" }
 */
crossChainRouter.post("/cross-chain/confirm", async (req: Request, res: Response) => {
    try {
        const telegramId = res.locals.telegramId as string;
        const {
            txSignature, inputToken, outputToken,
            inputChain, outputChain,
            inputAmount, outputAmount, feeAmountUsd,
        } = req.body;

        if (!txSignature || !inputToken || !outputToken || !inputChain || !outputChain) {
            res.status(400).json({ error: "Missing required fields" });
            return;
        }

        const user = await findUserByTelegramId(telegramId);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        // Resolve token addresses for the DB record
        const inputTokenInfo = findToken(inputToken, inputChain);
        const outputTokenInfo = findToken(outputToken, outputChain);

        const swap = await prisma.swap.create({
            data: {
                userId: user.id,
                inputMint: inputTokenInfo?.address ?? inputToken,
                outputMint: outputTokenInfo?.address ?? outputToken,
                inputAmount: BigInt(Math.round(parseFloat(String(inputAmount)) || 0)),
                outputAmount: BigInt(Math.round(parseFloat(String(outputAmount)) || 0)),
                inputChain: inputChain,
                outputChain: outputChain,
                feeAmountUsd: feeAmountUsd ?? null,
                txSignature,
                status: "SUBMITTED",
            },
        });

        res.json({ swapId: swap.id, status: "SUBMITTED" });
    } catch (err) {
        console.error("Cross-chain confirm error:", err);
        res.status(500).json({ error: "Failed to record bridge transaction" });
    }
});

/**
 * GET /api/cross-chain/status?txHash=&fromChain=&toChain=
 *
 * Proxies the LI.FI status API to track a bridge transaction.
 * Returns the current status of the bridge (PENDING, DONE, FAILED, NOT_FOUND).
 *
 * The txHash is the Solana transaction signature from the source chain.
 */
crossChainRouter.get("/cross-chain/status", async (req: Request, res: Response) => {
    try {
        const { txHash, fromChain, toChain } = req.query;

        if (!txHash || !fromChain || !toChain) {
            res.status(400).json({ error: "Missing required params: txHash, fromChain, toChain" });
            return;
        }

        const fromChainInfo = CHAINS[fromChain as string];
        const toChainInfo = CHAINS[toChain as string];
        if (!fromChainInfo || !toChainInfo) {
            res.status(400).json({ error: "Unsupported chain" });
            return;
        }

        const params = new URLSearchParams({
            txHash: txHash as string,
            fromChain: fromChainInfo.lifiChainId,
            toChain: toChainInfo.lifiChainId,
        });

        const response = await fetch(`https://li.quest/v1/status?${params}`, {
            headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
            // Return NOT_FOUND for 404s instead of propagating errors
            if (response.status === 404) {
                res.json({ status: "NOT_FOUND" });
                return;
            }
            res.status(response.status).json({ error: "Failed to fetch bridge status" });
            return;
        }

        const data = await response.json() as any;
        res.json({
            status: data.status ?? "PENDING",
            receivingTxHash: data.receiving?.txHash ?? null,
            substatus: data.substatus ?? null,
        });
    } catch (err) {
        console.error("Cross-chain status error:", err);
        res.status(500).json({ error: "Failed to fetch bridge status" });
    }
});
