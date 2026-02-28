import { prisma } from "../client";
import { getTokensMetadata } from "../../jupiter/tokens";

export type TxType = "swap" | "send" | "receive";

export interface UnifiedTransaction {
    id: string;          // "swap_<cuid>" or "send_<cuid>" or "receive_<cuid>"
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
    // send/receive-specific
    tokenSymbol?: string;
    humanAmount?: string;
    recipientAddress?: string;
    senderAddress?: string;
    // shared
    txSignature: string | null;
    createdAt: string;
}

interface GetTransactionsParams {
    userId: string;
    type?: "all" | "swap" | "send" | "receive";
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
 * Supports type filter (all/swap/send/receive) and date range.
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

    // Transfer queries need direction filtering for send vs receive
    const sendWhere = {
        userId: params.userId,
        direction: "SEND",
        ...(createdAt ? { createdAt } : {}),
    };
    const receiveWhere = {
        userId: params.userId,
        direction: "RECEIVE",
        ...(createdAt ? { createdAt } : {}),
    };

    // Determine which tables to query based on type filter
    const wantSwaps = !params.type || params.type === "all" || params.type === "swap";
    const wantSends = !params.type || params.type === "all" || params.type === "send";
    const wantReceives = !params.type || params.type === "all" || params.type === "receive";

    const [swaps, sends, receives] = await Promise.all([
        wantSwaps
            ? prisma.swap.findMany({ where: baseSwapWhere, orderBy: { createdAt: "desc" } })
            : ([] as Awaited<ReturnType<typeof prisma.swap.findMany>>),
        wantSends
            ? prisma.transfer.findMany({ where: sendWhere, orderBy: { createdAt: "desc" } })
            : ([] as Awaited<ReturnType<typeof prisma.transfer.findMany>>),
        wantReceives
            ? prisma.transfer.findMany({ where: receiveWhere, orderBy: { createdAt: "desc" } })
            : ([] as Awaited<ReturnType<typeof prisma.transfer.findMany>>),
    ]);

    // Batch-resolve token metadata (symbol + decimals) for all swap mints
    const uniqueMints = [...new Set(swaps.flatMap((s: any) => [s.inputMint, s.outputMint]))];
    const metadata = uniqueMints.length > 0 ? await getTokensMetadata(uniqueMints) : {};

    const mintSymbol = (mint: string) =>
        metadata[mint]?.symbol ?? mint.slice(0, 6) + "...";
    const mintDecimals = (mint: string) => metadata[mint]?.decimals ?? 9;

    const swapItems: UnifiedTransaction[] = swaps.map((s: any) => ({
        id: `swap_${s.id}`,
        type: "swap" as const,
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

    const sendItems: UnifiedTransaction[] = sends.map((t: any) => ({
        id: `send_${t.id}`,
        type: "send" as const,
        status: t.status,
        tokenSymbol: t.tokenSymbol ?? t.tokenMint.slice(0, 6) + "...",
        humanAmount: t.humanAmount,
        recipientAddress: t.recipientAddress,
        txSignature: t.txSignature ?? null,
        createdAt: t.createdAt.toISOString(),
    }));

    const receiveItems: UnifiedTransaction[] = receives.map((t: any) => ({
        id: `receive_${t.id}`,
        type: "receive" as const,
        status: t.status,
        tokenSymbol: t.tokenSymbol ?? t.tokenMint.slice(0, 6) + "...",
        humanAmount: t.humanAmount,
        senderAddress: t.senderAddress ?? undefined,
        recipientAddress: t.recipientAddress,
        txSignature: t.txSignature ?? null,
        createdAt: t.createdAt.toISOString(),
    }));

    // Merge and sort all transactions by date desc
    const all = [...swapItems, ...sendItems, ...receiveItems].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
        transactions: all.slice(offset, offset + limit),
        total: all.length,
        hasMore: offset + limit < all.length,
    };
}
