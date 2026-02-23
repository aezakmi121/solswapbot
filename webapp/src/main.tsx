import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
    ConnectionProvider,
    WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { App } from "./App";
import "./styles/index.css";
import "@solana/wallet-adapter-react-ui/styles.css";

// Telegram WebApp initialization
const tg = (window as any).Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor("#1a1b2e");
    tg.setBackgroundColor("#1a1b2e");
}

// Solana RPC (use public for read — actual swaps go through Jupiter)
const RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";

const wallets = [new PhantomWalletAdapter()];

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ConnectionProvider endpoint={RPC_ENDPOINT}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <App />
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    </StrictMode>
);
