import { useState, useEffect } from "react";

interface ToastItem {
    id: number;
    message: string;
    type: string;
}

const DURATION_MS = 2500;

/** Global toast container — render once in App.tsx */
export function Toast() {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    useEffect(() => {
        const handler = (e: Event) => {
            const { message, type } = (e as CustomEvent).detail;
            const id = Date.now();
            setToasts((prev) => [...prev, { id, message, type }]);
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, DURATION_MS);
        };
        window.addEventListener("solswap:toast", handler);
        return () => window.removeEventListener("solswap:toast", handler);
    }, []);

    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map((t) => (
                <div key={t.id} className={`toast toast--${t.type}`}>
                    <span className="toast-icon">
                        {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}
                    </span>
                    {t.message}
                </div>
            ))}
        </div>
    );
}
