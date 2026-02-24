import {
    CheckResult,
    checkMintAuthority,
    checkFreezeAuthority,
    checkTopHolders,
    checkTokenAge,
    getTokenSupplyInfo,
} from "./checks";
import { getTokenPriceUsd } from "../jupiter/price";
import { isValidPublicKey } from "../utils/validation";

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
    };
    scannedAt: string;
}

/**
 * Runs all safety checks on a token and produces a risk score.
 *
 * Risk score algorithm:
 *   Each check has a weight (how many points it adds if unsafe).
 *   Total score = sum of weights for all UNSAFE checks.
 *   0-20:  LOW risk
 *   21-50: MEDIUM risk
 *   51+:   HIGH risk
 */
export async function analyzeToken(mintAddress: string): Promise<ScanResult> {
    if (!isValidPublicKey(mintAddress)) {
        throw new Error("Invalid Solana address");
    }

    // Run all checks in parallel for speed
    const [
        mintAuthority,
        freezeAuthority,
        topHolders,
        tokenAge,
        supplyInfo,
        price,
    ] = await Promise.all([
        checkMintAuthority(mintAddress),
        checkFreezeAuthority(mintAddress),
        checkTopHolders(mintAddress),
        checkTokenAge(mintAddress),
        getTokenSupplyInfo(mintAddress),
        getTokenPriceUsd(mintAddress).catch(() => null),
    ]);

    const checks = [mintAuthority, freezeAuthority, topHolders, tokenAge];

    // Calculate risk score: sum of weights for unsafe checks
    const riskScore = checks.reduce((score, check) => {
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
        },
        scannedAt: new Date().toISOString(),
    };
}
