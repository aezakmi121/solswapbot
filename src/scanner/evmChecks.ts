import { config } from "../config";

/**
 * EVM Token Scanner Checks — 8 checks for ERC-20 tokens across 5 EVM chains.
 *
 * All checks use raw JSON-RPC calls (eth_call, eth_getCode, eth_getStorageAt)
 * against free public RPCs. No external API keys required.
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

import { CheckResult } from "./checks";

// ─── EVM Chain → RPC mapping ──────────────────────────────────────────────

export type EvmChain = "ethereum" | "bsc" | "polygon" | "arbitrum" | "base";

export function getEvmRpcUrl(chain: EvmChain): string {
    const map: Record<EvmChain, string> = {
        ethereum: config.EVM_RPC_ETHEREUM,
        bsc: config.EVM_RPC_BSC,
        polygon: config.EVM_RPC_POLYGON,
        arbitrum: config.EVM_RPC_ARBITRUM,
        base: config.EVM_RPC_BASE,
    };
    return map[chain];
}

// LI.FI chain IDs for honeypot simulation
const LIFI_CHAIN_IDS: Record<EvmChain, string> = {
    ethereum: "1",
    bsc: "56",
    polygon: "137",
    arbitrum: "42161",
    base: "8453",
};

// Native wrapped token addresses per chain (for honeypot sell simulation)
const WRAPPED_NATIVE: Record<EvmChain, string> = {
    ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    bsc: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",     // WBNB
    polygon: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",   // WMATIC
    arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
    base: "0x4200000000000000000000000000000000000006",       // WETH
};

// Common stablecoin addresses per chain (for liquidity check)
const USDC_ADDRESS: Record<EvmChain, string> = {
    ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    bsc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

// Common DEX factory addresses for liquidity detection
const DEX_FACTORIES: Record<EvmChain, string[]> = {
    ethereum: [
        "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Uniswap V2
        "0x1F98431c8aD98523631AE4a59f267346ea31F984", // Uniswap V3
    ],
    bsc: [
        "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", // PancakeSwap V2
        "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865", // PancakeSwap V3
    ],
    polygon: [
        "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32", // QuickSwap V2
        "0x1F98431c8aD98523631AE4a59f267346ea31F984", // Uniswap V3
    ],
    arbitrum: [
        "0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9", // Camelot V2
        "0x1F98431c8aD98523631AE4a59f267346ea31F984", // Uniswap V3
    ],
    base: [
        "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6", // Aerodrome
        "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", // Uniswap V3
    ],
};

// ─── JSON-RPC helpers ────────────────────────────────────────────────────

let rpcCallId = 1;

async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
    const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: rpcCallId++,
            method: "eth_call",
            params: [{ to, data }, "latest"],
        }),
    });
    const json = await res.json() as { result?: string; error?: { message: string } };
    if (json.error) throw new Error(json.error.message);
    return json.result ?? "0x";
}

async function ethGetCode(rpcUrl: string, address: string): Promise<string> {
    const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: rpcCallId++,
            method: "eth_getCode",
            params: [address, "latest"],
        }),
    });
    const json = await res.json() as { result?: string; error?: { message: string } };
    if (json.error) throw new Error(json.error.message);
    return json.result ?? "0x";
}

async function ethGetStorageAt(rpcUrl: string, address: string, slot: string): Promise<string> {
    const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: rpcCallId++,
            method: "eth_getStorageAt",
            params: [address, slot, "latest"],
        }),
    });
    const json = await res.json() as { result?: string; error?: { message: string } };
    if (json.error) throw new Error(json.error.message);
    return json.result ?? "0x" + "0".repeat(64);
}

/** Decode a uint256 hex result to BigInt */
function decodeUint256(hex: string): bigint {
    if (!hex || hex === "0x") return 0n;
    return BigInt(hex);
}

/** Decode an address from a 32-byte padded hex result */
function decodeAddress(hex: string): string {
    if (!hex || hex.length < 42) return "0x" + "0".repeat(40);
    return "0x" + hex.slice(-40).toLowerCase();
}

/** ERC-20 function selectors */
const SEL = {
    owner: "0x8da5cb5b",
    totalSupply: "0x18160ddd",
    balanceOf: "0x70a08231", // + address (32 bytes)
    name: "0x06fdde03",
    symbol: "0x95d89b41",
    decimals: "0x313ce567",
};

// ─── Check 1: Owner Renounced (weight 25) ─────────────────────────────

export async function checkOwnerRenounced(
    contractAddress: string,
    rpcUrl: string,
): Promise<CheckResult> {
    try {
        const result = await ethCall(rpcUrl, contractAddress, SEL.owner);
        const owner = decodeAddress(result);

        const isRenounced = owner === "0x" + "0".repeat(40) || owner === "0x" + "0".repeat(39) + "1";

        return {
            name: "Owner Renounced",
            safe: isRenounced,
            detail: isRenounced
                ? "Contract ownership renounced"
                : `Owner: ${owner.slice(0, 6)}…${owner.slice(-4)}`,
            weight: 25,
        };
    } catch {
        // No owner() function — could be a non-Ownable contract (safe pattern)
        return {
            name: "Owner Renounced",
            safe: true,
            detail: "No owner() function (non-Ownable contract)",
            weight: 25,
        };
    }
}

// ─── Check 2: Proxy Contract (weight 20) ──────────────────────────────

export async function checkProxyContract(
    contractAddress: string,
    rpcUrl: string,
): Promise<CheckResult> {
    try {
        // EIP-1967 implementation slot
        const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
        const implResult = await ethGetStorageAt(rpcUrl, contractAddress, implSlot);
        const implAddr = decodeAddress(implResult);

        const isProxy = implAddr !== "0x" + "0".repeat(40);

        return {
            name: "Proxy Contract",
            safe: !isProxy,
            detail: isProxy
                ? `Upgradeable proxy → ${implAddr.slice(0, 6)}…${implAddr.slice(-4)}`
                : "Not a proxy contract",
            weight: 20,
        };
    } catch {
        return { name: "Proxy Contract", safe: true, detail: "Unable to check proxy status", weight: 20, errored: true };
    }
}

// ─── Check 3: Honeypot Simulation (weight 20) ─────────────────────────

export async function checkHoneypot(
    contractAddress: string,
    chain: EvmChain,
): Promise<CheckResult> {
    try {
        const wrappedNative = WRAPPED_NATIVE[chain];
        const lifiChainId = LIFI_CHAIN_IDS[chain];

        // Skip known safe tokens (wrapped native, USDC)
        const lower = contractAddress.toLowerCase();
        if (lower === wrappedNative.toLowerCase() || lower === USDC_ADDRESS[chain].toLowerCase()) {
            return { name: "Honeypot Detection", safe: true, detail: "Known liquid token", weight: 20 };
        }

        // Simulate selling token → wrapped native via LI.FI
        const url = `https://li.quest/v1/quote?fromChain=${lifiChainId}&toChain=${lifiChainId}` +
            `&fromToken=${contractAddress}&toToken=${wrappedNative}` +
            `&fromAmount=1000000000000000000&fromAddress=0x0000000000000000000000000000000000000001`;

        const res = await fetch(url, {
            headers: config.LIFI_API_KEY ? { "x-lifi-api-key": config.LIFI_API_KEY } : {},
            signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
            return { name: "Honeypot Detection", safe: true, detail: "Sell route exists (LI.FI)", weight: 20 };
        }

        // 404 or error = likely no sell route
        const body = await res.json().catch(() => ({})) as { message?: string };
        const msg = body.message ?? "";

        if (msg.includes("No available quotes") || msg.includes("Unable to find") || res.status === 404) {
            return { name: "Honeypot Detection", safe: false, detail: "No sell route found — possible honeypot", weight: 20 };
        }

        // Ambiguous error — mark errored
        return { name: "Honeypot Detection", safe: true, detail: "Sell check inconclusive", weight: 20, errored: true };
    } catch {
        return { name: "Honeypot Detection", safe: true, detail: "Sell simulation failed", weight: 20, errored: true };
    }
}

// ─── Check 4: Contract Code (weight 15) ───────────────────────────────

export async function checkContractCode(
    contractAddress: string,
    rpcUrl: string,
): Promise<CheckResult> {
    try {
        const code = await ethGetCode(rpcUrl, contractAddress);

        if (code === "0x" || code.length <= 2) {
            return { name: "Contract Code", safe: false, detail: "No contract code found (EOA, not a token)", weight: 15 };
        }

        const codeBytes = (code.length - 2) / 2;

        if (codeBytes < 100) {
            return { name: "Contract Code", safe: false, detail: `Suspiciously small contract (${codeBytes} bytes)`, weight: 15 };
        }

        return {
            name: "Contract Code",
            safe: true,
            detail: `Contract verified (${codeBytes.toLocaleString()} bytes)`,
            weight: 15,
        };
    } catch {
        return { name: "Contract Code", safe: true, detail: "Unable to fetch contract code", weight: 15, errored: true };
    }
}

// ─── Check 5: Top Holders (weight 15) ─────────────────────────────────

export async function checkTopHolders(
    contractAddress: string,
    rpcUrl: string,
    cachedTotalSupply?: bigint,
): Promise<CheckResult> {
    try {
        const totalSupply = cachedTotalSupply ??
            decodeUint256(await ethCall(rpcUrl, contractAddress, SEL.totalSupply));

        if (totalSupply === 0n) {
            return { name: "Top Holders", safe: false, detail: "Total supply is 0", weight: 15 };
        }

        // Check common high-risk addresses: dead address, deployer patterns
        // We check if the contract itself holds tokens (common anti-pattern)
        const contractBalance = decodeUint256(
            await ethCall(rpcUrl, contractAddress, SEL.balanceOf + contractAddress.slice(2).padStart(64, "0"))
        );

        const contractPct = Number((contractBalance * 10000n) / totalSupply) / 100;

        if (contractPct > 50) {
            return { name: "Top Holders", safe: false, detail: `Contract holds ${contractPct.toFixed(1)}% of supply`, weight: 15 };
        }

        // Check dead address balance (burned tokens are safe)
        const deadBalance = decodeUint256(
            await ethCall(rpcUrl, contractAddress, SEL.balanceOf + "000000000000000000000000" + "000000000000000000000000000000000000dEaD".slice(2))
        );
        const deadPct = Number((deadBalance * 10000n) / totalSupply) / 100;

        if (contractPct > 20 && deadPct < 10) {
            return { name: "Top Holders", safe: false, detail: `Contract holds ${contractPct.toFixed(1)}% (not burned)`, weight: 15 };
        }

        return {
            name: "Top Holders",
            safe: true,
            detail: deadPct > 1 ? `${deadPct.toFixed(1)}% burned` : "No extreme concentration detected",
            weight: 15,
        };
    } catch {
        return { name: "Top Holders", safe: true, detail: "Unable to check holder distribution", weight: 15, errored: true };
    }
}

// ─── Check 6: Mint Function (weight 15) ───────────────────────────────

export async function checkMintFunction(
    contractAddress: string,
    rpcUrl: string,
    cachedCode?: string,
): Promise<CheckResult> {
    try {
        const code = cachedCode ?? await ethGetCode(rpcUrl, contractAddress);

        // Look for common mint function selectors in bytecode
        // mint(address,uint256) = 0x40c10f19
        // _mint(address,uint256) internal — not detectable, but public wrappers are
        // Additional: mint(uint256) = 0xa0712d68
        const hasMintSelector = code.includes("40c10f19") || code.includes("a0712d68");

        // Also check for Ownable pattern — if no owner and no mint, that's safest
        let ownerRenounced = false;
        try {
            const ownerResult = await ethCall(rpcUrl, contractAddress, SEL.owner);
            const owner = decodeAddress(ownerResult);
            ownerRenounced = owner === "0x" + "0".repeat(40);
        } catch {
            ownerRenounced = true; // No owner function = no centralized mint risk
        }

        if (!hasMintSelector) {
            return { name: "Mint Function", safe: true, detail: "No public mint function detected", weight: 15 };
        }

        if (hasMintSelector && ownerRenounced) {
            return { name: "Mint Function", safe: true, detail: "Mint function exists but ownership renounced", weight: 15 };
        }

        return {
            name: "Mint Function",
            safe: false,
            detail: "Public mint function detected — owner can create new tokens",
            weight: 15,
        };
    } catch {
        return { name: "Mint Function", safe: true, detail: "Unable to check mint function", weight: 15, errored: true };
    }
}

// ─── Check 7: Transfer Tax (weight 10) ────────────────────────────────

export async function checkTransferTax(
    contractAddress: string,
    rpcUrl: string,
    cachedCode?: string,
): Promise<CheckResult> {
    try {
        const code = cachedCode ?? await ethGetCode(rpcUrl, contractAddress);

        // Look for common fee-on-transfer patterns in bytecode
        // Tokens with transfer fees typically have _taxFee, _liquidityFee storage variables
        // and the transfer function does amount subtraction before crediting recipient.
        // Heuristic: search for known fee variable selectors or "fee" in the bytecode
        //
        // Common patterns:
        // - Contract has "swapAndLiquify" type function (fee distribution)
        //   swapAndLiquifyEnabled = many fee tokens
        // - Contract code size > 5000 bytes + has Uniswap router interaction
        //   Common selector: 0x7d1db4a5 (setTaxFeePercent)
        //   Common selector: 0x5342acb4 (excludeFromFee)
        //   Common selector: 0x437823ec (excludeFromReward)

        const hasFeeSelectors =
            code.includes("7d1db4a5") || // setTaxFeePercent
            code.includes("5342acb4") || // excludeFromFee
            code.includes("437823ec") || // excludeFromReward
            code.includes("ea2f0b37") || // setFee
            code.includes("c0246668");   // excludeFromFees (newer pattern)

        if (hasFeeSelectors) {
            return {
                name: "Transfer Tax",
                safe: false,
                detail: "Fee-on-transfer mechanism detected in contract bytecode",
                weight: 10,
            };
        }

        return {
            name: "Transfer Tax",
            safe: true,
            detail: "No transfer tax mechanism detected",
            weight: 10,
        };
    } catch {
        return { name: "Transfer Tax", safe: true, detail: "Unable to check transfer tax", weight: 10, errored: true };
    }
}

// ─── Check 8: Liquidity (weight 10) ───────────────────────────────────

export async function checkLiquidity(
    contractAddress: string,
    chain: EvmChain,
    rpcUrl: string,
): Promise<CheckResult> {
    try {
        const wrappedNative = WRAPPED_NATIVE[chain];
        const factories = DEX_FACTORIES[chain];

        // Check if any major DEX factory has a pair for this token + wrapped native
        // UniswapV2Factory.getPair(tokenA, tokenB) = 0xe6a43905
        const selector = "0xe6a43905";

        for (const factory of factories) {
            try {
                // Pack getPair(address,address) call data
                const data = selector +
                    contractAddress.slice(2).toLowerCase().padStart(64, "0") +
                    wrappedNative.slice(2).toLowerCase().padStart(64, "0");

                const result = await ethCall(rpcUrl, factory, data);
                const pairAddress = decodeAddress(result);

                if (pairAddress !== "0x" + "0".repeat(40)) {
                    // Pair exists — check if it has any balance of the token
                    const tokenBalInPair = decodeUint256(
                        await ethCall(rpcUrl, contractAddress,
                            SEL.balanceOf + pairAddress.slice(2).padStart(64, "0"))
                    );

                    if (tokenBalInPair > 0n) {
                        return {
                            name: "Liquidity",
                            safe: true,
                            detail: `Liquidity pair found on ${chain} DEX`,
                            weight: 10,
                        };
                    }
                }
            } catch {
                continue; // Try next factory (V3 factories have different interface)
            }
        }

        // Also check USDC pair
        const usdc = USDC_ADDRESS[chain];
        for (const factory of factories) {
            try {
                const data = "0xe6a43905" +
                    contractAddress.slice(2).toLowerCase().padStart(64, "0") +
                    usdc.slice(2).toLowerCase().padStart(64, "0");

                const result = await ethCall(rpcUrl, factory, data);
                const pairAddress = decodeAddress(result);

                if (pairAddress !== "0x" + "0".repeat(40)) {
                    return { name: "Liquidity", safe: true, detail: `USDC liquidity pair found`, weight: 10 };
                }
            } catch {
                continue;
            }
        }

        return {
            name: "Liquidity",
            safe: false,
            detail: "No liquidity pair found on major DEXs",
            weight: 10,
        };
    } catch {
        return { name: "Liquidity", safe: true, detail: "Unable to check liquidity", weight: 10, errored: true };
    }
}

// ─── Token Metadata Helper ────────────────────────────────────────────

/** Decode a Solidity ABI-encoded dynamic string */
function decodeString(hex: string): string {
    try {
        if (!hex || hex === "0x" || hex.length < 130) return "";
        // offset to string data (first 32 bytes)
        const offsetHex = hex.slice(2, 66);
        const offset = parseInt(offsetHex, 16) * 2 + 2; // byte offset → hex offset + "0x"
        const lenHex = hex.slice(offset, offset + 64);
        const len = parseInt(lenHex, 16);
        if (len === 0 || len > 200) return "";
        const strHex = hex.slice(offset + 64, offset + 64 + len * 2);
        return Buffer.from(strHex, "hex").toString("utf8").replace(/\0/g, "").trim();
    } catch {
        return "";
    }
}

export interface EvmTokenInfo {
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: bigint;
}

export async function fetchEvmTokenInfo(
    contractAddress: string,
    rpcUrl: string,
): Promise<EvmTokenInfo | null> {
    try {
        const [nameHex, symbolHex, decimalsHex, supplyHex] = await Promise.all([
            ethCall(rpcUrl, contractAddress, SEL.name).catch(() => "0x"),
            ethCall(rpcUrl, contractAddress, SEL.symbol).catch(() => "0x"),
            ethCall(rpcUrl, contractAddress, SEL.decimals).catch(() => "0x12"), // default 18
            ethCall(rpcUrl, contractAddress, SEL.totalSupply).catch(() => "0x0"),
        ]);

        const name = decodeString(nameHex) || "Unknown Token";
        const symbol = decodeString(symbolHex) || contractAddress.slice(0, 8);
        const decimals = Number(decodeUint256(decimalsHex));
        const totalSupply = decodeUint256(supplyHex);

        return { name, symbol, decimals, totalSupply };
    } catch {
        return null;
    }
}
