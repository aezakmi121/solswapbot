import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    define: {
        // Polyfill for Solana wallet-adapter
        "process.env": {},
        global: "globalThis",
    },
    resolve: {
        alias: {
            buffer: "buffer",
        },
    },
});
