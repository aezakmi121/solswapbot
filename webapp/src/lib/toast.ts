/** Dispatch a toast notification — picked up by the <Toast> component in App.tsx */
export type ToastType = "success" | "error" | "info";

export function toast(message: string, type: ToastType = "success") {
    window.dispatchEvent(
        new CustomEvent("solswap:toast", { detail: { message, type } })
    );
}
