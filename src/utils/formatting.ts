/**
 * Truncates a Solana address for display: "AbCd...WxYz"
 */
export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Formats a token amount from its smallest unit to a human-readable string.
 * e.g. formatTokenAmount(1500000000, 9) → "1.5"
 */
export function formatTokenAmount(
  amount: bigint | number | string,
  decimals: number
): string {
  const value = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const remainder = value % divisor;

  if (remainder === 0n) return whole.toString();

  const fractional = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractional}`;
}

/**
 * Formats a USD value to 2 decimal places with $ prefix.
 */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Converts a human-readable token amount to its smallest unit.
 * e.g. toSmallestUnit(1.5, 9) → 1500000000n
 */
export function toSmallestUnit(amount: number, decimals: number): bigint {
  const factor = 10 ** decimals;
  return BigInt(Math.round(amount * factor));
}
