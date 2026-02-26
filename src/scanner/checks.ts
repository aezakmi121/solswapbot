import { PublicKey, AccountInfo } from "@solana/web3.js";
import { connection } from "../solana/connection";

/** SPL Token program ID */
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/** Token-2022 (Token Extensions) program ID */
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/**
 * Result of a single safety check.
 * `errored: true` means the check failed due to a network/RPC error —
 * the result should NOT be counted toward the risk score (M6).
 */
export interface CheckResult {
    name: string;
    safe: boolean;
    detail: string;
    weight: number; // Risk score contribution if unsafe (0-30)
    errored?: boolean; // True when the check couldn't run (network error etc.)
}

// ─── Mint Authority ──────────────────────────────────────────────────
/**
 * Check if the token's mint authority is disabled.
 * If enabled, the creator can mint infinite tokens → dump risk.
 *
 * Accepts pre-fetched accountInfo to avoid duplicate RPC calls (M5).
 */
export async function checkMintAuthority(
    mintAddress: string,
    cachedAccountInfo?: AccountInfo<Buffer> | null
): Promise<CheckResult> {
    try {
        const mint = new PublicKey(mintAddress);
        const accountInfo = cachedAccountInfo !== undefined
            ? cachedAccountInfo
            : await connection.getAccountInfo(mint);

        if (!accountInfo) {
            return { name: "Mint Authority", safe: false, detail: "Token account not found", weight: 30 };
        }

        // Token-2022 has a different layout — flag it but don't misread bytes (M11)
        const owner = accountInfo.owner.toBase58();
        if (owner === TOKEN_2022_PROGRAM_ID) {
            return { name: "Mint Authority", safe: true, detail: "Token-2022 (layout not fully parsed)", weight: 30 };
        }

        // SPL Token Mint layout: mintAuthority option byte at offset 0
        // Option byte: 0 = None (disabled), 1 = Some
        const data = accountInfo.data;
        const mintAuthorityOption = data[0];
        const hasMintAuthority = mintAuthorityOption === 1;

        if (hasMintAuthority) {
            const authorityBytes = data.subarray(4, 36);
            const authority = new PublicKey(authorityBytes);
            return {
                name: "Mint Authority",
                safe: false,
                detail: `Enabled (${authority.toBase58().slice(0, 8)}...)`,
                weight: 30,
            };
        }

        return { name: "Mint Authority", safe: true, detail: "Disabled", weight: 30 };
    } catch (err) {
        // Network/RPC error — don't penalise the token (M6)
        return { name: "Mint Authority", safe: true, detail: "Check unavailable", weight: 30, errored: true };
    }
}

// ─── Freeze Authority ────────────────────────────────────────────────
/**
 * Check if the token's freeze authority is disabled.
 * If enabled, someone can freeze your tokens in your wallet.
 *
 * Accepts pre-fetched accountInfo to avoid duplicate RPC calls (M5).
 */
export async function checkFreezeAuthority(
    mintAddress: string,
    cachedAccountInfo?: AccountInfo<Buffer> | null
): Promise<CheckResult> {
    try {
        const mint = new PublicKey(mintAddress);
        const accountInfo = cachedAccountInfo !== undefined
            ? cachedAccountInfo
            : await connection.getAccountInfo(mint);

        if (!accountInfo) {
            return { name: "Freeze Authority", safe: false, detail: "Token account not found", weight: 20 };
        }

        // Token-2022 has a different layout — flag it but don't misread bytes (M11)
        const owner = accountInfo.owner.toBase58();
        if (owner === TOKEN_2022_PROGRAM_ID) {
            return { name: "Freeze Authority", safe: true, detail: "Token-2022 (layout not fully parsed)", weight: 20 };
        }

        // Freeze authority is at offset 36 in the SPL mint layout (4 byte option + 32 byte pubkey)
        const data = accountInfo.data;
        const freezeAuthorityOption = data[36];
        const hasFreezeAuthority = freezeAuthorityOption === 1;

        if (hasFreezeAuthority) {
            const authorityBytes = data.subarray(40, 72);
            const authority = new PublicKey(authorityBytes);
            return {
                name: "Freeze Authority",
                safe: false,
                detail: `Enabled (${authority.toBase58().slice(0, 8)}...)`,
                weight: 20,
            };
        }

        return { name: "Freeze Authority", safe: true, detail: "Disabled", weight: 20 };
    } catch (err) {
        // Network/RPC error — don't penalise the token (M6)
        return { name: "Freeze Authority", safe: true, detail: "Check unavailable", weight: 20, errored: true };
    }
}

// ─── Top Holders Concentration ───────────────────────────────────────
/**
 * Check if top 10 holders own more than 50% of supply.
 * High concentration = whale dump risk.
 *
 * Accepts pre-fetched total supply to avoid duplicate RPC calls (M5).
 */
export async function checkTopHolders(
    mintAddress: string,
    cachedTotalSupply?: string
): Promise<CheckResult> {
    try {
        const mint = new PublicKey(mintAddress);
        const largestAccounts = await connection.getTokenLargestAccounts(mint);
        const accounts = largestAccounts.value;

        if (accounts.length === 0) {
            return { name: "Top Holders", safe: false, detail: "No holders found", weight: 20 };
        }

        // Use cached supply to avoid a second getTokenSupply call (M5)
        let totalSupply: bigint;
        if (cachedTotalSupply !== undefined) {
            totalSupply = BigInt(cachedTotalSupply);
        } else {
            const supplyResponse = await connection.getTokenSupply(mint);
            totalSupply = BigInt(supplyResponse.value.amount);
        }

        if (totalSupply === 0n) {
            return { name: "Top Holders", safe: false, detail: "Zero supply", weight: 20 };
        }

        // Sum top 10 holders (use BigInt to avoid float overflow on large supplies)
        const top10Amount = accounts
            .slice(0, 10)
            .reduce((sum, acc) => sum + BigInt(acc.amount), 0n);

        // Multiply by 1000 for one decimal place of precision without floats
        const top10PerMilleRaw = (top10Amount * 1000n) / totalSupply;
        const top10Percent = Number(top10PerMilleRaw) / 10;

        if (top10Percent > 80) {
            return { name: "Top Holders", safe: false, detail: `Top 10 hold ${top10Percent.toFixed(1)}% (extreme concentration)`, weight: 20 };
        }
        if (top10Percent > 50) {
            return { name: "Top Holders", safe: false, detail: `Top 10 hold ${top10Percent.toFixed(1)}% (high concentration)`, weight: 20 };
        }

        return { name: "Top Holders", safe: true, detail: `Top 10 hold ${top10Percent.toFixed(1)}%`, weight: 20 };
    } catch (err) {
        // Network/RPC error — don't penalise the token (M6)
        return { name: "Top Holders", safe: true, detail: "Check unavailable", weight: 20, errored: true };
    }
}

// ─── Token Supply Info ───────────────────────────────────────────────
/**
 * Get basic supply info for the token.
 * Returns supply and decimals.
 */
export async function getTokenSupplyInfo(mintAddress: string): Promise<{
    supply: string;
    decimals: number;
    uiSupply: number;
} | null> {
    try {
        const mint = new PublicKey(mintAddress);
        const supplyResponse = await connection.getTokenSupply(mint);
        return {
            supply: supplyResponse.value.amount,
            decimals: supplyResponse.value.decimals,
            uiSupply: supplyResponse.value.uiAmount ?? 0,
        };
    } catch {
        return null;
    }
}

// ─── Token Age ───────────────────────────────────────────────────────
/**
 * Estimate token age by looking at first signatures on the mint account.
 * Very new tokens (< 24h) are higher risk.
 */
export async function checkTokenAge(mintAddress: string): Promise<CheckResult> {
    try {
        const mint = new PublicKey(mintAddress);

        // Walk backwards through signature history to find the oldest
        let oldestBlockTime: number | null = null;
        let before: string | undefined = undefined;

        for (let page = 0; page < 5; page++) {
            const signatures = await connection.getSignaturesForAddress(mint, {
                limit: 1000,
                before,
            });

            if (signatures.length === 0) break;

            const lastSig = signatures[signatures.length - 1];
            oldestBlockTime = lastSig.blockTime ?? null;
            before = lastSig.signature;

            if (signatures.length < 1000) break;
        }

        if (!oldestBlockTime) {
            return { name: "Token Age", safe: false, detail: "Unknown age", weight: 10 };
        }

        const now = Math.floor(Date.now() / 1000);
        const ageSeconds = now - oldestBlockTime;
        const ageHours = ageSeconds / 3600;
        const ageDays = ageHours / 24;

        if (ageHours < 24) {
            return { name: "Token Age", safe: false, detail: `${ageHours.toFixed(1)} hours old (very new!)`, weight: 10 };
        }
        if (ageDays < 7) {
            return { name: "Token Age", safe: false, detail: `${ageDays.toFixed(1)} days old (new)`, weight: 10 };
        }
        if (ageDays < 30) {
            return { name: "Token Age", safe: true, detail: `${ageDays.toFixed(0)} days old`, weight: 10 };
        }

        const months = ageDays / 30;
        if (months < 12) {
            return { name: "Token Age", safe: true, detail: `${months.toFixed(0)} months old`, weight: 10 };
        }

        const years = ageDays / 365;
        return { name: "Token Age", safe: true, detail: `${years.toFixed(1)}+ years old`, weight: 10 };
    } catch (err) {
        // Network/RPC error — don't penalise the token (M6)
        return { name: "Token Age", safe: true, detail: "Check unavailable", weight: 10, errored: true };
    }
}
