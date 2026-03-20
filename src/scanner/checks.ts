import { PublicKey, AccountInfo } from "@solana/web3.js";
import { connection } from "../solana/connection";
import { config } from "../config";

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

// ─── Jupiter Verified ─────────────────────────────────────────────────
/**
 * Check if the token appears on Jupiter's verified token list.
 * Jupiter-verified tokens have passed basic curation for legitimacy.
 * Not being verified is a mild risk signal (many real tokens aren't listed).
 *
 * Accepts pre-fetched token metadata — no RPC call needed.
 */
export function checkJupiterVerified(
    tokenMeta: { name?: string; symbol?: string } | null | undefined
): CheckResult {
    if (tokenMeta) {
        return {
            name: "Jupiter Verified",
            safe: true,
            detail: "Listed on Jupiter's verified token list",
            weight: 10,
        };
    }
    return {
        name: "Jupiter Verified",
        safe: false,
        detail: "Not found on Jupiter's verified list",
        weight: 10,
    };
}

// ─── Token Metadata Present ───────────────────────────────────────────
/**
 * Check if the token has a recognized name and symbol.
 * Anonymous tokens with no on-chain metadata are a common rug indicator —
 * legitimate projects almost always register a name and ticker.
 *
 * Accepts pre-fetched token metadata — no RPC call needed.
 */
export function checkHasMetadata(
    tokenMeta: { name?: string; symbol?: string } | null | undefined
): CheckResult {
    if (tokenMeta?.name && tokenMeta?.symbol) {
        return {
            name: "Token Metadata",
            safe: true,
            detail: `${tokenMeta.symbol} — name & symbol present`,
            weight: 15,
        };
    }
    return {
        name: "Token Metadata",
        safe: false,
        detail: "No verified name or symbol found",
        weight: 15,
    };
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

// ─── Metaplex constants ──────────────────────────────────────────────
const METAPLEX_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/**
 * Derive the Metaplex metadata PDA for a given mint.
 */
function getMetadataPda(mint: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METAPLEX_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        METAPLEX_PROGRAM_ID
    );
    return pda;
}

/**
 * Fetch and parse the Metaplex metadata account.
 * Returns raw fields we need: updateAuthority, isMutable.
 */
export async function fetchMetaplexMetadata(mintAddress: string): Promise<{
    updateAuthority: string;
    isMutable: boolean;
} | null> {
    try {
        const mint = new PublicKey(mintAddress);
        const pda = getMetadataPda(mint);
        const accountInfo = await connection.getAccountInfo(pda);

        if (!accountInfo || accountInfo.data.length < 100) return null;

        const data = accountInfo.data;

        // Metaplex metadata v1 layout:
        // byte 0: key (4 = MetadataV1)
        // bytes 1-32: update authority (32 bytes)
        // bytes 33-64: mint (32 bytes)
        // Then variable-length borsh strings for name, symbol, uri
        // isMutable is near the end — we read it at a known offset after parsing strings

        const updateAuthority = new PublicKey(data.subarray(1, 33)).toBase58();

        // To find isMutable: skip past the variable-length fields
        // name: 4 bytes length + up to 32 bytes
        // symbol: 4 bytes length + up to 10 bytes
        // uri: 4 bytes length + up to 200 bytes
        // Then: sellerFeeBasisPoints (2 bytes), creators option (variable), ...
        // isMutable is the last byte of the fixed portion

        // Simpler approach: scan from the end of the data
        // In practice, isMutable is at data.length - 2 for most tokens (before edition_nonce option)
        // But the most reliable approach: read the entire data length and check the layout

        // Walk forward through the borsh-encoded fields
        let offset = 65; // past key(1) + updateAuth(32) + mint(32)

        // name: 4-byte LE length prefix + content (padded to 32)
        const nameLen = data.readUInt32LE(offset);
        offset += 4 + nameLen;

        // symbol: 4-byte LE length prefix + content (padded to 10)
        const symbolLen = data.readUInt32LE(offset);
        offset += 4 + symbolLen;

        // uri: 4-byte LE length prefix + content (padded to 200)
        const uriLen = data.readUInt32LE(offset);
        offset += 4 + uriLen;

        // seller_fee_basis_points: 2 bytes
        offset += 2;

        // creators option: 1 byte (0=None, 1=Some)
        const hasCreators = data[offset];
        offset += 1;

        if (hasCreators === 1) {
            // creators vec: 4-byte length + (32+1+1) per creator = 34 bytes each
            const numCreators = data.readUInt32LE(offset);
            offset += 4;
            offset += numCreators * 34;
        }

        // primary_sale_happened: 1 byte
        offset += 1;

        // is_mutable: 1 byte
        const isMutable = data[offset] === 1;

        return { updateAuthority, isMutable };
    } catch {
        return null;
    }
}

// ─── Metadata Mutability ────────────────────────────────────────────
/**
 * Check if the token's Metaplex metadata is mutable.
 * If mutable, the creator can change the token's name, symbol, and image
 * after launch — potentially impersonating legitimate tokens.
 */
export function checkMetadataMutability(
    metaplexData: { updateAuthority: string; isMutable: boolean } | null
): CheckResult {
    if (!metaplexData) {
        return { name: "Metadata Mutability", safe: true, detail: "No on-chain metadata found", weight: 15, errored: true };
    }

    if (metaplexData.isMutable) {
        return {
            name: "Metadata Mutability",
            safe: false,
            detail: "Metadata is mutable — creator can change name/symbol/image",
            weight: 15,
        };
    }

    return {
        name: "Metadata Mutability",
        safe: true,
        detail: "Metadata is immutable",
        weight: 15,
    };
}

// ─── Update Authority ───────────────────────────────────────────────
/**
 * Check if the Metaplex update authority has been revoked.
 * A revoked update authority (set to system program 1111...1111 or the mint itself)
 * means nobody can modify the token's metadata.
 */
export function checkUpdateAuthority(
    metaplexData: { updateAuthority: string; isMutable: boolean } | null
): CheckResult {
    if (!metaplexData) {
        return { name: "Update Authority", safe: true, detail: "No on-chain metadata found", weight: 10, errored: true };
    }

    // If metadata is already immutable, update authority doesn't matter
    if (!metaplexData.isMutable) {
        return {
            name: "Update Authority",
            safe: true,
            detail: "Irrelevant — metadata is immutable",
            weight: 10,
        };
    }

    const SYSTEM_PROGRAM = "11111111111111111111111111111111";
    if (metaplexData.updateAuthority === SYSTEM_PROGRAM) {
        return {
            name: "Update Authority",
            safe: true,
            detail: "Revoked (set to system program)",
            weight: 10,
        };
    }

    return {
        name: "Update Authority",
        safe: false,
        detail: `Active (${metaplexData.updateAuthority.slice(0, 8)}...) — can modify metadata`,
        weight: 10,
    };
}

// ─── Honeypot Detection ─────────────────────────────────────────────
/**
 * Detect honeypot tokens by simulating a sell (token → SOL).
 * If Jupiter can't find a route to sell, the token may be a honeypot.
 */
export async function checkHoneypot(mintAddress: string): Promise<CheckResult> {
    try {
        const WSOL = "So11111111111111111111111111111111111111112";

        // Skip check for SOL itself and common stablecoins
        const SKIP_MINTS = new Set([
            WSOL,
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
            "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
        ]);
        if (SKIP_MINTS.has(mintAddress)) {
            return { name: "Honeypot Detection", safe: true, detail: "Known liquid token — skipped", weight: 20 };
        }

        // Try to get a quote for selling 1 token unit worth of this token → SOL
        // Use a small amount: 1_000_000 raw units (works for most 6-9 decimal tokens)
        const headers: Record<string, string> = {};
        if (config.JUPITER_API_KEY) headers["x-api-key"] = config.JUPITER_API_KEY;

        const params = new URLSearchParams({
            inputMint: mintAddress,
            outputMint: WSOL,
            amount: "1000000",
            slippageBps: "500",
        });

        const response = await fetch(`${config.JUPITER_API_URL}/quote?${params}`, {
            headers,
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            const body = await response.text();
            // Jupiter returns specific errors for tokens with no route
            if (body.includes("No route found") || body.includes("could not find any routes")) {
                return {
                    name: "Honeypot Detection",
                    safe: false,
                    detail: "No sell route found — possible honeypot",
                    weight: 20,
                };
            }
            // Other Jupiter errors (rate limit, etc.) — don't penalize
            return { name: "Honeypot Detection", safe: true, detail: "Check unavailable", weight: 20, errored: true };
        }

        // If we got a valid quote, the token can be sold
        return {
            name: "Honeypot Detection",
            safe: true,
            detail: "Sell route exists — token is tradeable",
            weight: 20,
        };
    } catch (err) {
        // Timeout or network error
        return { name: "Honeypot Detection", safe: true, detail: "Check unavailable", weight: 20, errored: true };
    }
}

// ─── Creator Holdings ───────────────────────────────────────────────
/**
 * Find the token deployer and check what % of supply they still hold.
 * Large creator holdings (>10%) = dump risk.
 *
 * We find the creator by looking at the oldest signature on the mint account
 * (the deployer's create-mint transaction).
 */
export async function checkCreatorHoldings(
    mintAddress: string,
    cachedTotalSupply?: string
): Promise<CheckResult> {
    try {
        const mint = new PublicKey(mintAddress);

        // Find the deployer: oldest signature on the mint account = creation tx
        let oldestSig: { signature: string } | null = null;
        let before: string | undefined;

        // Page through signatures to find the oldest (similar to checkTokenAge)
        for (let page = 0; page < 3; page++) {
            const sigs = await connection.getSignaturesForAddress(mint, {
                limit: 1000,
                before,
            });

            if (sigs.length === 0) break;
            oldestSig = sigs[sigs.length - 1];
            before = sigs[sigs.length - 1].signature;
            if (sigs.length < 1000) break;
        }

        if (!oldestSig) {
            return { name: "Creator Holdings", safe: true, detail: "Could not identify creator", weight: 15, errored: true };
        }

        // Get the transaction to find the signer (deployer)
        const tx = await connection.getParsedTransaction(oldestSig.signature, {
            maxSupportedTransactionVersion: 0,
        });

        if (!tx?.transaction?.message?.accountKeys) {
            return { name: "Creator Holdings", safe: true, detail: "Could not parse creation tx", weight: 15, errored: true };
        }

        // The first signer is typically the deployer
        const signerKey = tx.transaction.message.accountKeys.find(k => k.signer);
        if (!signerKey) {
            return { name: "Creator Holdings", safe: true, detail: "No signer found", weight: 15, errored: true };
        }

        const creatorAddress = signerKey.pubkey.toBase58();

        // Check creator's current balance of this token
        const tokenAccounts = await connection.getTokenAccountsByOwner(
            new PublicKey(creatorAddress),
            { mint }
        );

        let creatorBalance = 0n;
        for (const account of tokenAccounts.value) {
            // Parse the token account data to get the balance
            const data = account.account.data;
            // SPL Token account layout: amount is at offset 64, 8 bytes LE
            const amount = data.readBigUInt64LE(64);
            creatorBalance += amount;
        }

        // Get total supply
        let totalSupply: bigint;
        if (cachedTotalSupply !== undefined) {
            totalSupply = BigInt(cachedTotalSupply);
        } else {
            const supplyResponse = await connection.getTokenSupply(mint);
            totalSupply = BigInt(supplyResponse.value.amount);
        }

        if (totalSupply === 0n) {
            return { name: "Creator Holdings", safe: false, detail: "Zero supply", weight: 15 };
        }

        const creatorPercent = Number((creatorBalance * 1000n) / totalSupply) / 10;

        if (creatorPercent > 30) {
            return {
                name: "Creator Holdings",
                safe: false,
                detail: `Creator holds ${creatorPercent.toFixed(1)}% (very high)`,
                weight: 15,
            };
        }

        if (creatorPercent > 10) {
            return {
                name: "Creator Holdings",
                safe: false,
                detail: `Creator holds ${creatorPercent.toFixed(1)}%`,
                weight: 15,
            };
        }

        return {
            name: "Creator Holdings",
            safe: true,
            detail: creatorPercent === 0
                ? `Creator holds 0% (fully distributed)`
                : `Creator holds ${creatorPercent.toFixed(1)}%`,
            weight: 15,
        };
    } catch (err) {
        return { name: "Creator Holdings", safe: true, detail: "Check unavailable", weight: 15, errored: true };
    }
}

// ─── Liquidity Pool Check ───────────────────────────────────────────
/**
 * Check if the token has a Raydium liquidity pool with burned/locked LP tokens.
 * If LP tokens are NOT burned, the creator can pull all liquidity at any time.
 *
 * Raydium V4 pool accounts are stored under the AMM program. We find pools
 * by searching for token accounts of the mint held by the Raydium AMM authority.
 */
export async function checkLiquidity(mintAddress: string): Promise<CheckResult> {
    try {
        const mint = new PublicKey(mintAddress);
        const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

        // Common stablecoins and major tokens — skip liquidity check
        const SKIP_MINTS = new Set([
            WSOL.toBase58(),
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
            "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
        ]);
        if (SKIP_MINTS.has(mintAddress)) {
            return { name: "Liquidity Pool", safe: true, detail: "Major token — skipped", weight: 25 };
        }

        // Strategy: Look for Raydium AMM pools by checking if there are token accounts
        // for this mint owned by the Raydium AMM authority
        // Raydium V4 AMM Authority: 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1
        const RAYDIUM_AUTHORITY = new PublicKey("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1");

        const ammAccounts = await connection.getTokenAccountsByOwner(RAYDIUM_AUTHORITY, { mint });

        if (ammAccounts.value.length === 0) {
            // No Raydium pool found — could be on another DEX or truly no liquidity
            // Check if Jupiter can route through it at all (indirect liquidity signal)
            return {
                name: "Liquidity Pool",
                safe: false,
                detail: "No Raydium liquidity pool detected",
                weight: 25,
            };
        }

        // Found a pool — check total locked amount
        let poolBalance = 0n;
        for (const account of ammAccounts.value) {
            const data = account.account.data;
            const amount = data.readBigUInt64LE(64);
            poolBalance += amount;
        }

        if (poolBalance === 0n) {
            return {
                name: "Liquidity Pool",
                safe: false,
                detail: "Pool exists but has zero balance — liquidity drained",
                weight: 25,
            };
        }

        // Pool has balance — this is good but we can't easily determine
        // if LP tokens are burned without finding the specific LP mint
        // For now, having a non-zero pool is a positive signal
        return {
            name: "Liquidity Pool",
            safe: true,
            detail: "Raydium pool active with liquidity",
            weight: 25,
        };
    } catch (err) {
        return { name: "Liquidity Pool", safe: true, detail: "Check unavailable", weight: 25, errored: true };
    }
}

// ─── Token-2022 Transfer Fee ────────────────────────────────────────
/**
 * Check if a Token-2022 token has a transfer fee extension.
 * Transfer fees are a hidden tax that takes a percentage on every transfer.
 * Most buyers don't expect this.
 *
 * Only applies to tokens owned by the Token-2022 program.
 */
export function checkTransferFee(
    mintAddress: string,
    cachedAccountInfo?: AccountInfo<Buffer> | null
): CheckResult {
    try {
        if (!cachedAccountInfo) {
            return { name: "Transfer Fee", safe: true, detail: "Not a Token-2022 token", weight: 10 };
        }

        const owner = cachedAccountInfo.owner.toBase58();
        if (owner !== TOKEN_2022_PROGRAM_ID) {
            return { name: "Transfer Fee", safe: true, detail: "Standard SPL token — no transfer fee", weight: 10 };
        }

        // Token-2022 mint layout: standard mint is 82 bytes
        // Extensions start after byte 165 (82 bytes mint + padding)
        const data = cachedAccountInfo.data;

        if (data.length <= 165) {
            return { name: "Transfer Fee", safe: true, detail: "Token-2022 with no extensions", weight: 10 };
        }

        // Walk through TLV (Type-Length-Value) extensions
        // Extension type for TransferFeeConfig = 1
        const TRANSFER_FEE_CONFIG_TYPE = 1;
        let offset = 165;

        while (offset + 4 <= data.length) {
            const extType = data.readUInt16LE(offset);
            const extLen = data.readUInt16LE(offset + 2);

            if (extType === TRANSFER_FEE_CONFIG_TYPE && extLen >= 36) {
                // TransferFeeConfig layout:
                // authority (32 bytes) + withheld amount (8 bytes comes later)
                // The actual fee is in the TransferFee struct:
                // epoch (8 bytes) + maxFee (8 bytes) + feeBasisPoints (2 bytes)
                // Located at offset + 4 + 32 (after authority)
                const feeDataOffset = offset + 4 + 32;
                if (feeDataOffset + 18 <= data.length) {
                    const feeBps = data.readUInt16LE(feeDataOffset + 16);

                    if (feeBps > 0) {
                        const feePercent = feeBps / 100;
                        return {
                            name: "Transfer Fee",
                            safe: false,
                            detail: `${feePercent}% transfer fee on every transaction`,
                            weight: 10,
                        };
                    }
                }

                return { name: "Transfer Fee", safe: true, detail: "Transfer fee extension present but set to 0%", weight: 10 };
            }

            offset += 4 + extLen;
            if (extLen === 0) break; // prevent infinite loop
        }

        return { name: "Transfer Fee", safe: true, detail: "Token-2022 — no transfer fee extension", weight: 10 };
    } catch {
        return { name: "Transfer Fee", safe: true, detail: "Check unavailable", weight: 10, errored: true };
    }
}
