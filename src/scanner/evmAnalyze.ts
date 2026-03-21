import { ScanResult } from "./analyze";
import {
    EvmChain,
    getEvmRpcUrl,
    fetchEvmTokenInfo,
    checkOwnerRenounced,
    checkProxyContract,
    checkHoneypot,
    checkContractCode,
    checkTopHolders,
    checkMintFunction,
    checkTransferTax,
    checkLiquidity,
} from "./evmChecks";

/**
 * Detect which EVM chain to scan based on a user-provided chain hint.
 * If no hint, defaults to "ethereum".
 */
export function resolveEvmChain(chainHint?: string): EvmChain {
    const valid: EvmChain[] = ["ethereum", "bsc", "polygon", "arbitrum", "base"];
    if (chainHint && valid.includes(chainHint as EvmChain)) return chainHint as EvmChain;
    return "ethereum";
}

/**
 * Full EVM token safety analysis.
 *
 * Mirrors the Solana `analyzeToken()` pattern:
 *   Phase 1: Fetch shared data (code, totalSupply, token info)
 *   Phase 2: Run all 8 checks in parallel
 *   Phase 3: Normalized scoring (same algorithm as Solana scanner)
 *
 * Check weights (total 130, normalized to 0-100):
 *   Owner Renounced        25
 *   Proxy Contract          20
 *   Honeypot Simulation     20
 *   Contract Code           15
 *   Top Holders             15
 *   Mint Function            15
 *   Transfer Tax            10
 *   Liquidity               10
 */
export async function analyzeEvmToken(
    contractAddress: string,
    chain: EvmChain,
): Promise<ScanResult> {
    const rpcUrl = getEvmRpcUrl(chain);

    // Phase 1: Fetch shared data — code + token metadata in parallel
    const [tokenInfo, code] = await Promise.all([
        fetchEvmTokenInfo(contractAddress, rpcUrl),
        // Fetch code once — shared by contractCode, mintFunction, transferTax
        fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: 1, method: "eth_getCode",
                params: [contractAddress, "latest"],
            }),
        }).then(r => r.json()).then((j: any) => j.result as string ?? "0x").catch(() => "0x"),
    ]);

    const totalSupply = tokenInfo?.totalSupply ?? 0n;

    // Phase 2: Run all 8 checks in parallel — pass shared data to avoid duplicate RPCs
    const [
        ownerRenounced,
        proxyContract,
        honeypot,
        contractCode,
        topHolders,
        mintFunction,
        transferTax,
        liquidity,
    ] = await Promise.all([
        checkOwnerRenounced(contractAddress, rpcUrl),
        checkProxyContract(contractAddress, rpcUrl),
        checkHoneypot(contractAddress, chain),
        checkContractCode(contractAddress, rpcUrl),
        checkTopHolders(contractAddress, rpcUrl, totalSupply > 0n ? totalSupply : undefined),
        checkMintFunction(contractAddress, rpcUrl, code),
        checkTransferTax(contractAddress, rpcUrl, code),
        checkLiquidity(contractAddress, chain, rpcUrl),
    ]);

    const checks = [
        ownerRenounced,
        proxyContract,
        honeypot,
        contractCode,
        topHolders,
        mintFunction,
        transferTax,
        liquidity,
    ];

    // Normalized scoring — same algorithm as Solana scanner
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

    const clampedScore = Math.min(100, Math.max(0, riskScore));

    const riskLevel: ScanResult["riskLevel"] =
        clampedScore <= 20 ? "LOW" :
            clampedScore <= 50 ? "MEDIUM" :
                "HIGH";

    // Format supply as human-readable
    const supplyStr = tokenInfo && totalSupply > 0n
        ? (Number(totalSupply) / Math.pow(10, tokenInfo.decimals)).toString()
        : null;

    return {
        mintAddress: contractAddress,
        riskScore: clampedScore,
        riskLevel,
        checks,
        tokenInfo: {
            supply: supplyStr,
            decimals: tokenInfo?.decimals ?? null,
            price: null, // EVM price lookup not yet implemented — can add via CoinGecko/Moralis later
            name: tokenInfo?.name ?? null,
            symbol: tokenInfo?.symbol ?? null,
            icon: null,
        },
        chain,
        scannedAt: new Date().toISOString(),
    };
}
