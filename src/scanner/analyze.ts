import {
    CheckResult,
    checkMintAuthority,
    checkFreezeAuthority,
    checkTopHolders,
    checkTokenAge,
    checkJupiterVerified,
    checkHasMetadata,
    getTokenSupplyInfo,
    fetchMetaplexMetadata,
    checkMetadataMutability,
    checkUpdateAuthority,
    checkHoneypot,
    checkCreatorHoldings,
    checkLiquidity,
    checkTransferFee,
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
        name: string | null;      // from Jupiter token list (Solana) or ERC-20 name() (EVM)
        symbol: string | null;    // from Jupiter token list (Solana) or ERC-20 symbol() (EVM)
        icon: string | null;      // from Jupiter token list (Solana only)
    };
    chain?: string;           // "solana" | "ethereum" | "bsc" | "polygon" | "arbitrum" | "base"
    scannedAt: string;
}

/**
 * Runs all safety checks on a token and produces a risk score.
 *
 * Risk score algorithm (V2 — normalized scoring):
 *   Each check has a weight (how many points it adds if unsafe).
 *   Checks that errored out (network failure) are excluded from BOTH
 *   the numerator AND denominator — they don't affect the score at all.
 *   Score = (sum of unsafe weights) / (sum of all non-errored weights) * 100
 *   0-20:  LOW risk
 *   21-50: MEDIUM risk
 *   51+:   HIGH risk
 *
 * V2 Check weights (12 checks, total 200):
 *   Mint Authority        30  — creator can print unlimited tokens
 *   Liquidity Pool        25  — no pool or LP not burned = rug vector
 *   Freeze Authority      20  — creator can freeze your wallet balance
 *   Top Holders           20  — whale concentration = dump risk
 *   Honeypot Detection    20  — token can be bought but not sold
 *   Metadata Mutability   15  — creator can change name/symbol/image
 *   Token Metadata        15  — no name/symbol = anonymous token
 *   Creator Holdings      15  — deployer still holds large %
 *   Update Authority      10  — metadata authority not revoked
 *   Jupiter Verified      10  — not on verified list = unvetted
 *   Token Age             10  — brand-new tokens are higher risk
 *   Transfer Fee          10  — Token-2022 hidden tax
 *
 * RPC optimisations:
 *   - accountInfo fetched once → shared by mintAuthority + freezeAuthority + transferFee
 *   - getTokenSupply fetched once → shared with topHolders + creatorHoldings
 *   - tokenMeta fetched once (Jupiter cache) → shared by jupiterVerified + hasMetadata
 *   - metaplexData fetched once → shared by metadataMutability + updateAuthority
 */
export async function analyzeToken(mintAddress: string): Promise<ScanResult> {
    if (!isValidPublicKey(mintAddress)) {
        throw new Error("Invalid Solana address");
    }

    const mint = new PublicKey(mintAddress);

    // Phase 1: Fetch shared data once — RPC + Jupiter cache + Metaplex PDA
    const [accountInfo, supplyInfo, price, tokenMeta, metaplexData] = await Promise.all([
        connection.getAccountInfo(mint).catch(() => null),
        getTokenSupplyInfo(mintAddress),
        getTokenPriceUsd(mintAddress).catch(() => null),
        getTokenByMint(mintAddress).catch(() => null),
        fetchMetaplexMetadata(mintAddress),
    ]);

    // Phase 2: Run all async checks in parallel — pass shared data to skip duplicate RPCs
    const [mintAuthority, freezeAuthority, topHolders, tokenAge, honeypot, creatorHoldings, liquidity] = await Promise.all([
        checkMintAuthority(mintAddress, accountInfo),
        checkFreezeAuthority(mintAddress, accountInfo),
        checkTopHolders(mintAddress, supplyInfo?.supply),
        checkTokenAge(mintAddress),
        checkHoneypot(mintAddress),
        checkCreatorHoldings(mintAddress, supplyInfo?.supply),
        checkLiquidity(mintAddress),
    ]);

    // Phase 3: Synchronous checks — no extra RPC needed
    const jupiterVerified = checkJupiterVerified(tokenMeta);
    const hasMetadata = checkHasMetadata(tokenMeta);
    const metadataMutability = checkMetadataMutability(metaplexData);
    const updateAuthority = checkUpdateAuthority(metaplexData);
    const transferFee = checkTransferFee(mintAddress, accountInfo);

    const checks = [
        mintAuthority,
        liquidity,
        freezeAuthority,
        topHolders,
        honeypot,
        metadataMutability,
        hasMetadata,
        creatorHoldings,
        updateAuthority,
        jupiterVerified,
        tokenAge,
        transferFee,
    ];

    // V2 Normalized scoring: score = unsafeWeight / totalPossibleWeight * 100
    // Only count checks that actually ran (skip errored checks from both sides)
    let unsafeWeight = 0;
    let totalPossibleWeight = 0;

    for (const check of checks) {
        if (check.errored) continue;
        totalPossibleWeight += check.weight;
        if (!check.safe) unsafeWeight += check.weight;
    }

    const riskScore = totalPossibleWeight > 0
        ? Math.round((unsafeWeight / totalPossibleWeight) * 100)
        : 0;

    // Clamp to 0-100 (should already be in range, but safety net)
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
        chain: "solana",
        scannedAt: new Date().toISOString(),
    };
}
