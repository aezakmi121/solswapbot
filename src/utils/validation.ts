import { PublicKey } from "@solana/web3.js";

/**
 * Validates that a string is a valid Solana wallet/mint address.
 * Returns true if the string is a valid base58 public key.
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    const key = new PublicKey(address);
    return PublicKey.isOnCurve(key.toBytes());
  } catch {
    return false;
  }
}

/**
 * Validates that a string is a valid Solana public key format
 * (does not require it to be on the ed25519 curve — allows PDAs and program addresses).
 */
export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates swap amount: must be a positive finite number.
 */
export function isValidSwapAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}

/**
 * Sanitizes user text input: trims whitespace and limits length.
 */
export function sanitizeInput(input: string, maxLength = 200): string {
  return input.trim().slice(0, maxLength);
}
