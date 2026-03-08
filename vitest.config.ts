import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/*.test.ts'],
    exclude: ['webapp/**', 'node_modules/**', 'dist/**', 'src/__tests__/smoke.test.ts'],
    env: {
        NODE_ENV: 'development',
        TELEGRAM_BOT_TOKEN: 'mock_token',
        DATABASE_URL: 'file:./dev.db',
        PRIVY_APP_ID: 'mock_id',
        PRIVY_APP_SECRET: 'mock_secret',
        HELIUS_API_KEY: 'mock_key',
        HELIUS_WEBHOOK_SECRET: 'mock_secret',
        SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com',
        FEE_WALLET_ADDRESS: '11111111111111111111111111111111'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
