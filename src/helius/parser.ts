/**
 * Parses Helius enhanced transaction webhook events into incoming transfer records.
 *
 * Helius "enhanced" webhook payload shape (relevant fields):
 * {
 *   signature: string,
 *   timestamp: number,
 *   type: "TRANSFER" | ...,
 *   nativeTransfers: [{ fromUserAccount, toUserAccount, amount (lamports) }],
 *   tokenTransfers: [{ fromUserAccount, toUserAccount, mint, tokenAmount (human), tokenStandard }],
 *   transactionError: object | null,
 * }
 */

const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface IncomingTransfer {
    txSignature: string;
    senderAddress: string;
    recipientAddress: string;  // Our user's wallet
    tokenMint: string;
    humanAmount: string;
    timestamp: number;         // Unix seconds
}

/**
 * Extract incoming transfers for a set of watched wallet addresses
 * from a Helius enhanced transaction event.
 *
 * Returns one IncomingTransfer per distinct (signature, recipient, mint) combo.
 */
export function parseHeliusEvent(
    event: any,
    watchedAddresses: Set<string>,
): IncomingTransfer[] {
    // Skip failed transactions
    if (event.transactionError) return [];

    const signature = event.signature as string;
    if (!signature) return [];

    const timestamp = event.timestamp as number ?? Math.floor(Date.now() / 1000);
    const results: IncomingTransfer[] = [];
    const seen = new Set<string>(); // dedup key: "sig:recipient:mint"

    // Native SOL transfers
    const nativeTransfers = event.nativeTransfers as Array<{
        fromUserAccount: string;
        toUserAccount: string;
        amount: number; // lamports
    }> ?? [];

    for (const nt of nativeTransfers) {
        if (!watchedAddresses.has(nt.toUserAccount)) continue;
        // Skip self-transfers
        if (nt.fromUserAccount === nt.toUserAccount) continue;
        // Skip tiny amounts (dust, rent)
        if (nt.amount < 1000) continue;

        const key = `${signature}:${nt.toUserAccount}:${WSOL_MINT}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const solAmount = nt.amount / 1e9;
        results.push({
            txSignature: signature,
            senderAddress: nt.fromUserAccount,
            recipientAddress: nt.toUserAccount,
            tokenMint: WSOL_MINT,
            humanAmount: solAmount < 0.0001 ? solAmount.toPrecision(3) : solAmount.toString(),
            timestamp,
        });
    }

    // SPL token transfers
    const tokenTransfers = event.tokenTransfers as Array<{
        fromUserAccount: string;
        toUserAccount: string;
        mint: string;
        tokenAmount: number; // already human-readable
        tokenStandard: string;
    }> ?? [];

    for (const tt of tokenTransfers) {
        if (!watchedAddresses.has(tt.toUserAccount)) continue;
        if (tt.fromUserAccount === tt.toUserAccount) continue;
        if (!tt.tokenAmount || tt.tokenAmount <= 0) continue;

        const key = `${signature}:${tt.toUserAccount}:${tt.mint}`;
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({
            txSignature: signature,
            senderAddress: tt.fromUserAccount,
            recipientAddress: tt.toUserAccount,
            tokenMint: tt.mint,
            humanAmount: tt.tokenAmount.toString(),
            timestamp,
        });
    }

    return results;
}
