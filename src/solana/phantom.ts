/**
 * Builds a Phantom deeplink URL for signing and sending a transaction.
 *
 * The user taps this link → Phantom opens → shows tx details → user signs →
 * Phantom submits to Solana → user is redirected back to the bot.
 */
export function buildPhantomDeeplink(params: {
  swapTransaction: string;
  botUsername: string;
}): string {
  const searchParams = new URLSearchParams({
    app_url: `https://t.me/${params.botUsername}`,
    redirect_link: `https://t.me/${params.botUsername}`,
    transaction: params.swapTransaction,
  });

  return `https://phantom.app/ul/v1/signAndSendTransaction?${searchParams}`;
}
