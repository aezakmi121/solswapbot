import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, ArrowUpRight, AlertTriangle } from "lucide-react";
import { toast } from "../lib/toast";

interface ReceiveModalProps {
    walletAddress: string;
    onClose: () => void;
}

export function ReceiveModal({ walletAddress, onClose }: ReceiveModalProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(walletAddress).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast("Address copied!");
        }).catch(() => {
            // Fallback for browsers that don't support clipboard API
            const el = document.createElement("textarea");
            el.value = walletAddress;
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            document.body.removeChild(el);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast("Address copied!");
        });
    };

    const tg = (window as any).Telegram?.WebApp;
    const handleShare = () => {
        const shareText = `My Solana wallet address:\n${walletAddress}`;
        if (tg?.openTelegramLink) {
            tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(walletAddress)}&text=${encodeURIComponent("My Solana wallet address")}`);
        } else if (navigator.share) {
            navigator.share({ text: shareText }).catch(() => {});
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Receive Tokens</h3>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div className="receive-qr">
                    <QRCodeSVG
                        value={walletAddress}
                        size={180}
                        bgColor="#2a2b45"
                        fgColor="#e8e8f0"
                        level="M"
                    />
                </div>

                <p className="receive-network">Solana Network</p>

                <div className="receive-address">{walletAddress}</div>

                <div className="receive-actions">
                    <button className="receive-btn receive-btn--primary" onClick={handleCopy} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                        {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy Address</>}
                    </button>
                    <button className="receive-btn receive-btn--secondary" onClick={handleShare} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                        <ArrowUpRight size={16} /> Share
                    </button>
                </div>

                <p className="receive-warning" style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                    <span>Only send Solana (SPL) tokens to this address.</span>
                </p>
            </div>
        </div>
    );
}
