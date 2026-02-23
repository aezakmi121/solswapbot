import { Connection } from "@solana/web3.js";
import { config } from "../config";

/** Singleton Solana RPC connection */
export const connection = new Connection(config.SOLANA_RPC_URL, "confirmed");
