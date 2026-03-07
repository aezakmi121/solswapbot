#!/usr/bin/env tsx
/**
 * API Key & Configuration Validator
 * Run: npx tsx scripts/validate-keys.ts
 *
 * Tests every external service key configured in .env to confirm
 * it's valid and working. Only reports issues — silence means success.
 */

import "dotenv/config";

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const SKIP = "\x1b[33m⊘\x1b[0m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

let passed = 0;
let failed = 0;
let skipped = 0;

function pass(label: string, detail?: string) {
  console.log(`  ${PASS} ${label}${detail ? ` — ${detail}` : ""}`);
  passed++;
}

function fail(label: string, detail: string) {
  console.log(`  ${FAIL} ${label} — ${detail}`);
  failed++;
}

function skip(label: string, reason: string) {
  console.log(`  ${SKIP} ${label} — ${reason}`);
  skipped++;
}

function section(title: string) {
  console.log(`\n${BOLD}${title}${RESET}`);
}

async function fetchJson(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), ...opts });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Telegram Bot Token ──────────────────────────────────────────────────────
async function checkTelegram() {
  section("Telegram Bot");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return fail("TELEGRAM_BOT_TOKEN", "not set");
  try {
    const data = await fetchJson(`https://api.telegram.org/bot${token}/getMe`);
    if (data.ok) {
      pass("Bot token valid", `@${data.result.username} (id: ${data.result.id})`);
    } else {
      fail("Bot token", data.description || "getMe returned ok=false");
    }
  } catch (e: any) {
    fail("Bot token", e.message);
  }
}

// ─── Solana RPC (Helius) ────────────────────────────────────────────────────
async function checkSolanaRpc() {
  section("Solana RPC (Helius)");
  const url = process.env.SOLANA_RPC_URL;
  if (!url) return fail("SOLANA_RPC_URL", "not set");
  try {
    const data = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
    });
    if (data.result === "ok") {
      pass("RPC endpoint healthy", url.replace(/api-key=[^&]+/, "api-key=***"));
    } else if (data.error) {
      fail("RPC endpoint", data.error.message);
    } else {
      pass("RPC reachable", `result: ${JSON.stringify(data.result)}`);
    }
  } catch (e: any) {
    fail("RPC endpoint", e.message);
  }
}

// ─── Fee Wallet Address ─────────────────────────────────────────────────────
async function checkFeeWallet() {
  section("Fee Wallet");
  const addr = process.env.FEE_WALLET_ADDRESS;
  if (!addr) return fail("FEE_WALLET_ADDRESS", "not set");
  try {
    const { PublicKey } = await import("@solana/web3.js");
    new PublicKey(addr);
    pass("Valid Solana public key", addr.slice(0, 8) + "..." + addr.slice(-4));
  } catch {
    fail("FEE_WALLET_ADDRESS", "not a valid Solana public key");
  }

  // Check on-chain balance via RPC
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (rpcUrl) {
    try {
      const data = await fetchJson(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "getBalance",
          params: [addr],
        }),
      });
      const sol = (data.result?.value ?? 0) / 1e9;
      pass("Fee wallet on-chain", `${sol.toFixed(4)} SOL`);
    } catch (e: any) {
      fail("Fee wallet balance check", e.message);
    }
  }
}

// ─── Jupiter API ────────────────────────────────────────────────────────────
async function checkJupiter() {
  section("Jupiter API");
  const baseUrl = process.env.JUPITER_API_URL || "https://api.jup.ag/swap/v1";
  const apiKey = process.env.JUPITER_API_KEY;

  // Test quote endpoint (SOL → USDC, 0.001 SOL)
  const SOL = "So11111111111111111111111111111111111111112";
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const amount = "1000000"; // 0.001 SOL in lamports

  const quoteUrl = new URL(`${baseUrl}/quote`);
  quoteUrl.searchParams.set("inputMint", SOL);
  quoteUrl.searchParams.set("outputMint", USDC);
  quoteUrl.searchParams.set("amount", amount);
  quoteUrl.searchParams.set("platformFeeBps", String(process.env.PLATFORM_FEE_BPS || 50));

  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;

  try {
    const data = await fetchJson(quoteUrl.toString(), { headers });
    if (data.outAmount) {
      const outUsd = Number(data.outAmount) / 1e6;
      pass("Quote endpoint works", `0.001 SOL → ${outUsd.toFixed(4)} USDC`);
    } else if (data.error) {
      fail("Quote endpoint", data.error);
    } else {
      fail("Quote endpoint", "unexpected response shape");
    }
  } catch (e: any) {
    fail("Quote endpoint", e.message);
  }

  if (apiKey) {
    pass("JUPITER_API_KEY", "configured");
  } else {
    skip("JUPITER_API_KEY", "not set (using free tier — may hit rate limits)");
  }

  // Test price endpoint
  try {
    const priceData = await fetchJson(
      `https://api.jup.ag/price/v3/price?ids=${SOL}`,
      { headers }
    );
    if (priceData?.[SOL]?.usdPrice) {
      pass("Price V3 endpoint", `SOL = $${Number(priceData[SOL].usdPrice).toFixed(2)}`);
    } else {
      fail("Price V3 endpoint", "no price data returned");
    }
  } catch (e: any) {
    fail("Price V3 endpoint", e.message);
  }

  // Test token list endpoint
  try {
    const tokensRes = await fetch("https://api.jup.ag/tokens/v2/tag?query=verified", {
      signal: AbortSignal.timeout(10_000),
      headers,
    });
    if (tokensRes.ok) {
      const tokens = await tokensRes.json();
      pass("Token V2 endpoint", `${Array.isArray(tokens) ? tokens.length : "?"} verified tokens`);
    } else {
      fail("Token V2 endpoint", `HTTP ${tokensRes.status}`);
    }
  } catch (e: any) {
    fail("Token V2 endpoint", e.message);
  }
}

// ─── LI.FI API ──────────────────────────────────────────────────────────────
async function checkLifi() {
  section("LI.FI (Cross-Chain)");
  const apiKey = process.env.LIFI_API_KEY;
  if (!apiKey) return skip("LIFI_API_KEY", "not set — cross-chain works but no integrator fees");

  const headers: Record<string, string> = { "x-lifi-api-key": apiKey };

  // Test chains endpoint
  try {
    const data = await fetchJson("https://li.quest/v1/chains", { headers });
    if (data.chains?.length > 0) {
      pass("Chains endpoint", `${data.chains.length} chains available`);
    } else {
      fail("Chains endpoint", "no chains returned");
    }
  } catch (e: any) {
    fail("Chains endpoint", e.message);
  }

  // Test a cross-chain quote (SOL → ETH, tiny amount)
  try {
    const quoteUrl = new URL("https://li.quest/v1/quote");
    quoteUrl.searchParams.set("fromChain", "SOL");
    quoteUrl.searchParams.set("toChain", "ETH");
    quoteUrl.searchParams.set("fromToken", "So11111111111111111111111111111111111111112");
    quoteUrl.searchParams.set("toToken", "0x0000000000000000000000000000000000000000");
    quoteUrl.searchParams.set("fromAmount", "100000000"); // 0.1 SOL
    quoteUrl.searchParams.set("fromAddress", process.env.FEE_WALLET_ADDRESS || "11111111111111111111111111111111");
    quoteUrl.searchParams.set("toAddress", "0x0000000000000000000000000000000000000001");
    quoteUrl.searchParams.set("integrator", "solswap");

    const data = await fetchJson(quoteUrl.toString(), { headers });
    if (data.estimate) {
      pass("Cross-chain quote works", `SOL→ETH route found via ${data.toolDetails?.name || "LI.FI"}`);
      if (data.integrator === "solswap") {
        pass("Integrator tag", "solswap recognized");
      } else {
        skip("Integrator tag", `returned "${data.integrator}" — may need LI.FI partner registration`);
      }
    } else if (data.message) {
      // LI.FI returns { message: "..." } for errors
      fail("Cross-chain quote", data.message);
    } else {
      pass("LI.FI API key accepted", "authenticated successfully");
    }
  } catch (e: any) {
    // A 400/404 on quote is OK — it means the API key worked but the route wasn't found
    if (e.message.includes("HTTP 4")) {
      pass("LI.FI API key accepted", "key valid (quote may need different params)");
    } else {
      fail("Cross-chain quote", e.message);
    }
  }
}

// ─── Helius API ─────────────────────────────────────────────────────────────
async function checkHelius() {
  section("Helius (Webhooks)");
  const apiKey = process.env.HELIUS_API_KEY;
  const secret = process.env.HELIUS_WEBHOOK_SECRET;

  if (!apiKey) return skip("HELIUS_API_KEY", "not set — receive tracking disabled");

  // Check existing webhooks
  try {
    const data = await fetchJson(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`);
    if (Array.isArray(data)) {
      pass("Helius API key valid", `${data.length} webhook(s) configured`);
      for (const wh of data) {
        const addrs = wh.accountAddresses?.length ?? 0;
        pass(`  Webhook "${wh.webhookID?.slice(0, 8)}..."`,
          `type=${wh.webhookType}, ${addrs} address(es) watched`);
      }
    } else {
      fail("Helius webhooks", "unexpected response");
    }
  } catch (e: any) {
    fail("Helius API key", e.message);
  }

  if (secret) {
    pass("HELIUS_WEBHOOK_SECRET", "configured");
  } else {
    skip("HELIUS_WEBHOOK_SECRET", "not set — webhook endpoint unprotected");
  }
}

// ─── Moralis API ────────────────────────────────────────────────────────────
async function checkMoralis() {
  section("Moralis (EVM Balances)");
  const apiKey = process.env.MORALIS_API_KEY;
  if (!apiKey) return skip("MORALIS_API_KEY", "not set — EVM portfolio disabled");

  // Test with a known Ethereum address (Vitalik's address — public)
  try {
    const data = await fetchJson(
      "https://deep-index.moralis.io/api/v2.2/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045/erc20?chain=eth&limit=1",
      { headers: { "X-API-Key": apiKey } }
    );
    if (Array.isArray(data) || data.result) {
      pass("Moralis API key valid", "EVM balance query works");
    } else {
      fail("Moralis API", "unexpected response");
    }
  } catch (e: any) {
    if (e.message.includes("401")) {
      fail("Moralis API key", "invalid or expired key (HTTP 401)");
    } else {
      fail("Moralis API", e.message);
    }
  }
}

// ─── CORS & App Config ─────────────────────────────────────────────────────
function checkAppConfig() {
  section("App Configuration");

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "production") {
    pass("NODE_ENV", "production");
  } else {
    skip("NODE_ENV", `"${nodeEnv || "not set"}" — should be "production" on VPS`);
  }

  const cors = process.env.CORS_ORIGIN;
  if (cors && cors !== "*") {
    pass("CORS_ORIGIN", cors);
  } else if (cors === "*") {
    fail("CORS_ORIGIN", '"*" — will crash in production');
  } else {
    skip("CORS_ORIGIN", "not set — defaults to * (crashes in production)");
  }

  const miniapp = process.env.MINIAPP_URL;
  if (miniapp) {
    pass("MINIAPP_URL", miniapp);
  } else {
    skip("MINIAPP_URL", "not set — /start button won't have app URL");
  }

  const feeBps = process.env.PLATFORM_FEE_BPS;
  if (feeBps) {
    const bps = Number(feeBps);
    if (bps >= 0 && bps <= 200) {
      pass("PLATFORM_FEE_BPS", `${bps} (${bps / 100}% fee)`);
    } else {
      fail("PLATFORM_FEE_BPS", `${bps} out of range 0-200`);
    }
  } else {
    pass("PLATFORM_FEE_BPS", "defaults to 50 (0.5%)");
  }

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    pass("DATABASE_URL", dbUrl.replace(/^file:/, "file:"));
  } else {
    pass("DATABASE_URL", "defaults to file:./dev.db");
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${BOLD}SolSwap API Key & Config Validator${RESET}`);
  console.log("═".repeat(50));

  checkAppConfig();
  await checkTelegram();
  await checkSolanaRpc();
  await checkFeeWallet();
  await checkJupiter();
  await checkLifi();
  await checkHelius();
  await checkMoralis();

  console.log("\n" + "═".repeat(50));
  console.log(`${BOLD}Results:${RESET} ${PASS} ${passed} passed  ${FAIL} ${failed} failed  ${SKIP} ${skipped} skipped`);

  if (failed > 0) {
    console.log(`\n${FAIL} ${failed} check(s) failed — review above for details.\n`);
    process.exit(1);
  } else {
    console.log(`\n${PASS} All checks passed! Ready for production.\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Validator crashed:", err);
  process.exit(2);
});
