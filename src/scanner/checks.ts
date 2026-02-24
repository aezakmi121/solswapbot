import { Connection, PublicKey } from "@solana/web3.js";
import { connection } from "../solana/connection";

/**
 * Result of a single safety check.
 */
export interface CheckResult {
    name: string;
    safe: boolean;
    detail: string;
    weight: number; // Risk score contribution if unsafe (0-30)
}

// ─── Mint Authority ──────────────────────────────────────────────────
/**
 * Check if the token's mint authority is disabled.
 * If enabled, the creator can mint infinite tokens → dump risk.
 */
export async function checkMintAuthority(mintAddress: string): Promise<CheckResult> {
    try {
        const mint = new PublicKey(mintAddress);
        const accountInfo = await connection.getAccountInfo(mint);

        if (!accountInfo) {
            return { name: "Mint Authority", safe: false, detail: "Token account not found", weight: 30 };
        }

        // SPL Token Mint layout: mintAuthority is at offset 0, 36 bytes (4 byte option + 32 byte pubkey)
        // Option byte: 0 = None (disabled), 1 = Some
        const data = accountInfo.data;
        const mintAuthorityOption = data[0];
        const hasMintAuthority = mintAuthorityOption === 1;

        // Check if it's set to the zero address (also means effectively disabled)
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
        return { name: "Mint Authority", safe: false, detail: "Failed to check", weight: 30 };
    }
}

// ─── Freeze Authority ────────────────────────────────────────────────
/**
 * Check if the token's freeze authority is disabled.
 * If enabled, someone can freeze your tokens in your wallet.
 */
export async function checkFreezeAuthority(mintAddress: string): Promise<CheckResult> {
    try {
        const mint = new PublicKey(mintAddress);
        const accountInfo = await connection.getAccountInfo(mint);

        if (!accountInfo) {
            return { name: "Freeze Authority", safe: false, detail: "Token account not found", weight: 20 };
        }

        // Freeze authority is at offset 36 in the mint layout (4 byte option + 32 byte pubkey)
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
        return { name: "Freeze Authority", safe: false, detail: "Failed to check", weight: 20 };
    }
}

// ─── Top Holders Concentration ───────────────────────────────────────
/**
 * Check if top 10 holders own more than 50% of supply.
 * High concentration = whale dump risk.
 */
export async function checkTopHolders(mintAddress: string): Promise<CheckResult> {
    try {
        const mint = new PublicKey(mintAddress);
        const largestAccounts = await connection.getTokenLargestAccounts(mint);
        const accounts = largestAccounts.value;

        if (accounts.length === 0) {
            return { name: "Top Holders", safe: false, detail: "No holders found", weight: 20 };
        }

        // Get total supply
        const supplyResponse = await connection.getTokenSupply(mint);
        const totalSupply = Number(supplyResponse.value.amount);

        if (totalSupply === 0) {
            return { name: "Top Holders", safe: false, detail: "Zero supply", weight: 20 };
        }

        // Sum top 10 holders
        const top10Amount = accounts
            .slice(0, 10)
            .reduce((sum, acc) => sum + Number(acc.amount), 0);

        const top10Percent = (top10Amount / totalSupply) * 100;

        if (top10Percent > 80) {
            return { name: "Top Holders", safe: false, detail: `Top 10 hold ${top10Percent.toFixed(1)}% (extreme concentration)`, weight: 20 };
        }
        if (top10Percent > 50) {
            return { name: "Top Holders", safe: false, detail: `Top 10 hold ${top10Percent.toFixed(1)}% (high concentration)`, weight: 20 };
        }

        return { name: "Top Holders", safe: true, detail: `Top 10 hold ${top10Percent.toFixed(1)}%`, weight: 20 };
    } catch (err) {
        return { name: "Top Holders", safe: false, detail: "Failed to check", weight: 20 };
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
        return { name: "Token Age", safe: false, detail: "Failed to check", weight: 10 };
    }
}
