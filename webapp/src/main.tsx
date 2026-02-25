import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles/index.css";

// Telegram WebApp initialization
const tg = (window as any).Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor("#1a1b2e");
    tg.setBackgroundColor("#1a1b2e");
}

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;
const solanaRpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const solanaWsUrl = solanaRpcUrl.replace("https://", "wss://").replace("http://", "ws://");

if (!privyAppId) {
    console.error("VITE_PRIVY_APP_ID is not set");
}

const solanaConnectors = toSolanaWalletConnectors();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ErrorBoundary>
            <PrivyProvider
                appId={privyAppId || ""}
                config={{
                    appearance: {
                        theme: "#1a1b2e",
                        accentColor: "#7c5cfc",
                    },
                    loginMethods: ["telegram"],
                    solana: {
                        rpcs: {
                            "solana:mainnet": {
                                rpc: createSolanaRpc(solanaRpcUrl) as any,
                                rpcSubscriptions: createSolanaRpcSubscriptions(solanaWsUrl) as any,
                            },
                        },
                    },
                    externalWallets: {
                        solana: { connectors: solanaConnectors },
                    },
                    embeddedWallets: {
                        solana: { createOnLogin: "all-users" },
                    },
                }}
            >
                <App />
            </PrivyProvider>
        </ErrorBoundary>
    </StrictMode>
);
