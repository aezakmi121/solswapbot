import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminPanel } from "../AdminPanel";
import { fetchAdminStats, fetchAdminUsers } from "../../lib/api";

// Mock the API client
vi.mock("../../lib/api", () => ({
    fetchAdminStats: vi.fn(),
    fetchAdminUsers: vi.fn(),
}));

describe("AdminPanel Component", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should display a loading state initially", () => {
        // Return unresolved promises to keep it in loading state
        vi.mocked(fetchAdminStats).mockReturnValue(new Promise(() => {}));
        vi.mocked(fetchAdminUsers).mockReturnValue(new Promise(() => {}));

        render(<AdminPanel />);
        expect(screen.getByText(/Loading admin dashboard/i)).toBeInTheDocument();
    });

    it("should gracefully degrade and show an error message if the API fails (e.g., unauthorized)", async () => {
        vi.mocked(fetchAdminStats).mockImplementation(() => Promise.reject(new Error("Unauthorized access")));
        // Keep the second promise pending so it doesn't throw an unhandled rejection when Promise.all aborts early
        vi.mocked(fetchAdminUsers).mockReturnValue(new Promise(() => {}));

        render(<AdminPanel />);

        // Wait for the error state to render
        await waitFor(() => {
            expect(screen.getByText("Access Denied")).toBeInTheDocument();
            expect(screen.getByText("Unauthorized access")).toBeInTheDocument();
        });
    });

    it("should successfully render admin statistics when API calls resolve", async () => {
        vi.mocked(fetchAdminStats).mockResolvedValue({
            totalUsers: 1532,
            totalSwaps: 8400,
            totalFeesUsd: 125000.5,
            feesToday: { totalUsd: 500, swapCount: 120 },
            fees7d: { totalUsd: 3500, swapCount: 840 },
            fees30d: { totalUsd: 15000, swapCount: 3600 }
        });

        vi.mocked(fetchAdminUsers).mockResolvedValue({
            totalUsers: 1,
            users: [
                { 
                    telegramId: "123", telegramUsername: "whale_user", 
                    swapCount: 50, referralCount: 12, walletAddress: "So11111111111111111111111111111111",
                    hasEvmWallet: false, sendCount: 0, scanCount: 0, joinedAt: "2024-01-01T00:00:00Z"
                }
            ],
            topFeeGenerators: [
                { userId: "user-1", totalFeeUsd: 5000, swaps: 100 }
            ]
        });

        render(<AdminPanel />);

        // Wait for it to finish loading
        await waitFor(() => {
            expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        });

        // Assert numbers are formatted and rendered
        expect(screen.getByText("1,532")).toBeInTheDocument(); // total users
        expect(screen.getByText("8,400")).toBeInTheDocument(); // total swaps
        expect(screen.getByText("$125,000.50")).toBeInTheDocument(); // total revenue
        expect(screen.getByText("@whale_user")).toBeInTheDocument(); // feed text
    });
});
