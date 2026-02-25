import { Component, type ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error("ErrorBoundary caught:", error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="app">
                    <div className="loading-screen">
                        <div style={{ fontSize: "2rem", marginBottom: 8 }}>!</div>
                        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>
                            Something went wrong
                        </h2>
                        <p style={{ color: "#9d9db8", fontSize: "0.85rem", textAlign: "center", maxWidth: 300 }}>
                            {this.state.error?.message || "An unexpected error occurred."}
                        </p>
                        <button
                            className="swap-btn"
                            style={{ maxWidth: 200, marginTop: 16 }}
                            onClick={() => {
                                this.setState({ hasError: false, error: null });
                                window.location.reload();
                            }}
                        >
                            Reload App
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
