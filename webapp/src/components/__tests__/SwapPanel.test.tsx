import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SwapPanel } from "../SwapPanel";
import * as api from "../../lib/api";

// Mock Privy Hooks
vi.mock("@privy-io/react-auth/solana", () => ({
    useWallets: () => ({ wallets: [{ address: "wallet123" }] }),
    useSignAndSendTransaction: () => ({ signAndSendTransaction: vi.fn() })
}));

// Mock the Telegram WebApp API
(window as any).Telegram = { WebApp: { HapticFeedback: { impactOccurred: vi.fn() } } };

// Mock api
vi.mock("../../lib/api", () => ({
    fetchPopularTokens: vi.fn().mockResolvedValue([
        { mint: "So11111111111111111111111111111111111111112", symbol: "SOL" },
        { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC" }
    ]),
    fetchQuote: vi.fn(),
}));

describe("SwapPanel Component", () => {
    const defaultProps = {
        walletAddress: "wallet123",
        tokenBalances: [{ mint: "So11111111111111111111111111111111111111112", amount: 1.5 }],
        balancesLoaded: true,
        refreshBalance: vi.fn(),
        slippageBps: 50,
        onSlippageChange: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should disable the Swap button if input amount exceeds wallet balance", async () => {
        // Render the panel with 1.5 SOL balance
        render(<SwapPanel {...defaultProps} />);

        // Wait for default tokens to load
        await waitFor(() => {
            expect(screen.queryByText(/Loading tokens/i)).not.toBeInTheDocument();
        });

        // Set amount to 2.0 (exceeds 1.5 balance)
        const inputs = screen.getAllByRole("spinbutton");
        const amountInput = inputs[0]; // The 'You pay' input
        fireEvent.change(amountInput, { target: { value: "2.0" } });

        // The button should immediately change to Insufficient Balance and be disabled
        await waitFor(() => {
            const btn = screen.getByRole("button", { name: /Insufficient SOL balance/i });
            expect(btn).toBeDisabled();
        });
    });

    it("should allow custom slippage input and call onSlippageChange", async () => {
        render(<SwapPanel {...defaultProps} />);

        await waitFor(() => {
            expect(screen.queryByText(/Loading tokens/i)).not.toBeInTheDocument();
        });

        // Click the slippage indicator header button (e.g. ⚙️ 0.5%)
        const settingsBtn = screen.getByTitle("Set slippage tolerance");
        fireEvent.click(settingsBtn);

        // Click the "Custom" chip
        const customChip = screen.getByRole("button", { name: "Custom" });
        fireEvent.click(customChip);

        // Type 2.5 into the custom input
        const customInput = screen.getByPlaceholderText("e.g. 2.5");
        fireEvent.change(customInput, { target: { value: "2.5" } });
        
        // Click Set
        const setBtn = screen.getByRole("button", { name: "Set" });
        fireEvent.click(setBtn);

        // Expect the callback to fire with 250 bps
        expect(defaultProps.onSlippageChange).toHaveBeenCalledWith(250);
    });
});
