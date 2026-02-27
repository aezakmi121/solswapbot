import { prisma } from "../client";
import { getTokensMetadata } from "../../jupiter/tokens";

export type TxType = "swap" | "send";

export interface UnifiedTransaction {
    id: string;          // "swap_<cuid>" or "send_<cuid>"
    type: TxType;
    status: string;
    // swap-specific
    inputSymbol?: string;
    outputSymbol?: string;
    inputAmount?: string;   // human-readable (e.g. "0.5000")
    outputAmount?: string;
    inputChain?: string;
    outputChain?: string;
    feeAmountUsd?: number | null;
    // send-specific
    tokenSymbol?: string;
    humanAmount?: string;
    recipientAddress?: string;
    // shared
    txSignature: string | null;
    createdAt: string;
}

interface GetTransactionsParams {
    userId: string;
    type?: "all" | "swap" | "send";
    from?: Date;
    to?: Date;
    offset?: number;
    limit?: number;
}

/** Format a raw BigInt amount to human-readable string given token decimals. */
function formatRaw(raw: bigint, decimals: number): string {
    const human = Number(raw) / 10 ** decimals;
    if (human === 0) return "0";
    if (human < 0.0001) return human.toPrecision(3);
    if (human < 1) return human.toFixed(6);
    if (human >= 10_000) return human.toFixed(0);
    return human.toFixed(4);
}

/**
 * Fetch, merge, sort, and paginate swaps + transfers for a user.
 * Supports type filter (all/swap/send) and date range.
 * Uses offset-based pagination — suitable for typical user volumes (<1000 txs).
 */
export async function getTransactions(params: GetTransactionsParams): Promise<{
    transactions: UnifiedTransaction[];
    total: number;
    hasMore: boolean;
}> {
    const offset = Math.max(0, params.offset ?? 0);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));

    // Build createdAt filter
    const createdAt =
        params.from || params.to
            ? {
                  ...(params.from ? { gte: params.from } : {}),
                  ...(params.to ? { lte: params.to } : {}),
              }
            : undefined;

    const baseSwapWhere = { userId: params.userId, ...(createdAt ? { createdAt } : {}) };
    const baseTransferWhere = { userId: params.userId, ...(createdAt ? { createdAt } : {}) };

    // Fetch both tables in parallel, skip whichever the type filter excludes
    const [swaps, transfers] = await Promise.all([
        params.type === "send"
            ? ([] as Awaited<ReturnType<typeof prisma.swap.findMany>>)
            : prisma.swap.findMany({ where: baseSwapWhere, orderBy: { createdAt: "desc" } }),
        params.type === "swap"
            ? ([] as Awaited<ReturnType<typeof prisma.transfer.findMany>>)
            : prisma.transfer.findMany({ where: baseTransferWhere, orderBy: { createdAt: "desc" } }),
    ]);

    // Batch-resolve token metadata (symbol + decimals) for all swap mints
    const uniqueMints = [...new Set(swaps.flatMap((s) => [s.inputMint, s.outputMint]))];
    const metadata = uniqueMints.length > 0 ? await getTokensMetadata(uniqueMints) : {};

    const mintSymbol = (mint: string) =>
        metadata[mint]?.symbol ?? mint.slice(0, 6) + "...";
    const mintDecimals = (mint: string) => metadata[mint]?.decimals ?? 9;

    const swapItems: UnifiedTransaction[] = swaps.map((s) => ({
        id: `swap_${s.id}`,
        type: "swap",
        status: s.status,
        inputSymbol: mintSymbol(s.inputMint),
        outputSymbol: mintSymbol(s.outputMint),
        inputAmount: formatRaw(s.inputAmount, mintDecimals(s.inputMint)),
        outputAmount: formatRaw(s.outputAmount, mintDecimals(s.outputMint)),
        inputChain: s.inputChain,
        outputChain: s.outputChain,
        feeAmountUsd: s.feeAmountUsd ? Number(s.feeAmountUsd) : null,
        txSignature: s.txSignature ?? null,
        createdAt: s.createdAt.toISOString(),
    }));

    const sendItems: UnifiedTransaction[] = transfers.map((t) => ({
        id: `send_${t.id}`,
        type: "send",
        status: t.status,
        tokenSymbol: t.tokenSymbol ?? t.tokenMint.slice(0, 6) + "...",
        humanAmount: t.humanAmount,
        recipientAddress: t.recipientAddress,
        txSignature: t.txSignature ?? null,
        createdAt: t.createdAt.toISOString(),
    }));

    // Merge and sort all transactions by date desc
    const all = [...swapItems, ...sendItems].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
        transactions: all.slice(offset, offset + limit),
        total: all.length,
        hasMore: offset + limit < all.length,
    };
}
