import { Router, Request, Response } from "express";
import {
    PublicKey,
    SystemProgram,
    VersionedTransaction,
    TransactionMessage,
} from "@solana/web3.js";
import {
    createTransferInstruction,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { connection } from "../../solana/connection";
import { isValidSolanaAddress, isValidPublicKey } from "../../utils/validation";

export const sendRouter = Router();

const WSOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * POST /api/send
 * Builds an unsigned VersionedTransaction for a SOL or SPL token transfer.
 * The frontend (Privy) signs and sends it.
 *
 * Body: { tokenMint, recipientAddress, amount, senderAddress }
 * Returns: { transaction: base64, lastValidBlockHeight }
 */
sendRouter.post("/send", async (req: Request, res: Response) => {
    try {
        const { tokenMint, recipientAddress, amount, senderAddress } = req.body;

        if (!tokenMint || !recipientAddress || amount === undefined || !senderAddress) {
            res.status(400).json({ error: "Missing required fields: tokenMint, recipientAddress, amount, senderAddress" });
            return;
        }

        // Wallet addresses must be on the ed25519 curve
        if (!isValidSolanaAddress(recipientAddress)) {
            res.status(400).json({ error: "Invalid recipient address" });
            return;
        }

        if (!isValidSolanaAddress(senderAddress)) {
            res.status(400).json({ error: "Invalid sender address" });
            return;
        }

        // Token mints can be PDAs, so use the broader isValidPublicKey check
        if (!isValidPublicKey(tokenMint)) {
            res.status(400).json({ error: "Invalid token mint" });
            return;
        }

        const amountNum = parseFloat(String(amount));
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
            res.status(400).json({ error: "Invalid amount: must be a positive number" });
            return;
        }

        const senderPubkey = new PublicKey(senderAddress);
        const recipientPubkey = new PublicKey(recipientAddress);

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        const instructions = [];

        if (tokenMint === WSOL_MINT) {
            // Native SOL transfer
            const lamports = Math.round(amountNum * 1e9);
            instructions.push(
                SystemProgram.transfer({
                    fromPubkey: senderPubkey,
                    toPubkey: recipientPubkey,
                    lamports,
                })
            );
        } else {
            // SPL token transfer
            const mintPubkey = new PublicKey(tokenMint);

            // Fetch decimals from on-chain mint account
            let decimals = 6;
            try {
                const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
                const parsed = (mintInfo.value?.data as any)?.parsed;
                if (parsed?.info?.decimals !== undefined) {
                    decimals = parsed.info.decimals;
                }
            } catch {
                // Use fallback decimals
            }

            const rawAmount = BigInt(Math.round(amountNum * 10 ** decimals));

            const senderAta = getAssociatedTokenAddressSync(mintPubkey, senderPubkey);
            const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey);

            // Create recipient's ATA if it doesn't exist (sender pays the rent)
            const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
            if (!recipientAtaInfo) {
                instructions.push(
                    createAssociatedTokenAccountInstruction(
                        senderPubkey,    // payer
                        recipientAta,    // ATA to create
                        recipientPubkey, // owner
                        mintPubkey       // mint
                    )
                );
            }

            instructions.push(
                createTransferInstruction(
                    senderAta,
                    recipientAta,
                    senderPubkey,
                    rawAmount
                )
            );
        }

        const message = new TransactionMessage({
            payerKey: senderPubkey,
            recentBlockhash: blockhash,
            instructions,
        }).compileToV0Message();

        const tx = new VersionedTransaction(message);
        const serialized = tx.serialize();
        const base64 = Buffer.from(serialized).toString("base64");

        res.json({ transaction: base64, lastValidBlockHeight });
    } catch (err) {
        console.error("Send API error:", err);
        res.status(500).json({ error: "Failed to build transfer transaction" });
    }
});
