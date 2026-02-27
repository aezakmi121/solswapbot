import {
    CheckResult,
    checkMintAuthority,
    checkFreezeAuthority,
    checkTopHolders,
    checkTokenAge,
    checkJupiterVerified,
    checkHasMetadata,
    getTokenSupplyInfo,
} from "./checks";
import { getTokenPriceUsd } from "../jupiter/price";
import { getTokenByMint } from "../jupiter/tokens";
import { isValidPublicKey } from "../utils/validation";
import { PublicKey } from "@solana/web3.js";
import { connection } from "../solana/connection";

/**
 * Full token safety analysis result.
 */
export interface ScanResult {
    mintAddress: string;
    riskScore: number;        // 0-100
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    checks: CheckResult[];
    tokenInfo: {
        supply: string | null;
        decimals: number | null;
        price: number | null;
        name: string | null;      // from Jupiter token list
        symbol: string | null;    // from Jupiter token list
        icon: string | null;      // from Jupiter token list
    };
    scannedAt: string;
}

/**
 * Runs all safety checks on a token and produces a risk score.
 *
 * Risk score algorithm:
 *   Each check has a weight (how many points it adds if unsafe).
 *   Checks that errored out (network failure) are excluded from the score (M6).
 *   Total score = sum of weights for all UNSAFE, non-errored checks.
 *   0-20:  LOW risk
 *   21-50: MEDIUM risk
 *   51+:   HIGH risk
 *
 * Check weights (max possible = 105, clamped to 100):
 *   Mint Authority     30  — creator can print unlimited tokens
 *   Freeze Authority   20  — creator can freeze your wallet balance
 *   Top Holders        20  — whale concentration = dump risk
 *   Token Metadata     15  — no name/symbol = anonymous token
 *   Jupiter Verified   10  — not on verified list = unvetted
 *   Token Age          10  — brand-new tokens are higher risk
 *
 * RPC optimisations (M5):
 *   - accountInfo fetched once → shared by checkMintAuthority + checkFreezeAuthority
 *   - getTokenSupply fetched once (via getTokenSupplyInfo) → shared with checkTopHolders
 *   - tokenMeta fetched once (Jupiter cache) → shared by checkJupiterVerified + checkHasMetadata
 */
export async function analyzeToken(mintAddress: string): Promise<ScanResult> {
    if (!isValidPublicKey(mintAddress)) {
        throw new Error("Invalid Solana address");
    }

    const mint = new PublicKey(mintAddress);

    // Fetch shared data once — RPC + Jupiter cache (M5)
    const [accountInfo, supplyInfo, price, tokenMeta] = await Promise.all([
        connection.getAccountInfo(mint).catch(() => null),
        getTokenSupplyInfo(mintAddress),
        getTokenPriceUsd(mintAddress).catch(() => null),
        getTokenByMint(mintAddress).catch(() => null),
    ]);

    // Run async on-chain checks in parallel — pass shared data to skip duplicate RPCs (M5)
    const [mintAuthority, freezeAuthority, topHolders, tokenAge] = await Promise.all([
        checkMintAuthority(mintAddress, accountInfo),
        checkFreezeAuthority(mintAddress, accountInfo),
        checkTopHolders(mintAddress, supplyInfo?.supply),
        checkTokenAge(mintAddress),
    ]);

    // Synchronous metadata checks — no extra RPC needed
    const jupiterVerified = checkJupiterVerified(tokenMeta);
    const hasMetadata = checkHasMetadata(tokenMeta);

    const checks = [mintAuthority, freezeAuthority, topHolders, hasMetadata, jupiterVerified, tokenAge];

    // Calculate risk score: only count checks that actually ran (M6: skip errored checks)
    const riskScore = checks.reduce((score, check) => {
        if (check.errored) return score;
        return score + (check.safe ? 0 : check.weight);
    }, 0);

    // Clamp to 0-100
    const clampedScore = Math.min(100, Math.max(0, riskScore));

    const riskLevel: ScanResult["riskLevel"] =
        clampedScore <= 20 ? "LOW" :
            clampedScore <= 50 ? "MEDIUM" :
                "HIGH";

    return {
        mintAddress,
        riskScore: clampedScore,
        riskLevel,
        checks,
        tokenInfo: {
            supply: supplyInfo?.supply ?? null,
            decimals: supplyInfo?.decimals ?? null,
            price,
            name: tokenMeta?.name ?? null,
            symbol: tokenMeta?.symbol ?? null,
            icon: tokenMeta?.logoURI ?? null,
        },
        scannedAt: new Date().toISOString(),
    };
}
