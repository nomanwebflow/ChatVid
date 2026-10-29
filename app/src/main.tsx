import { Component, StrictMode } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import "./index.css";
import App from "./App.tsx";
import { lazy, Suspense } from "react";

const Dashboard = lazy(() => import("./dashboard/Dashboard"));
const isDashboard = window.location.pathname.replace(/\/$/, "") === "/dashboard";

const convexUrl = import.meta.env.VITE_CONVEX_URL || "";
const convex = new ConvexReactClient(convexUrl);

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ChatVid captured error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            padding: "24px",
            textAlign: "center",
            background: "#f8f9fa",
            color: "#1d2939",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>
            Something went wrong
          </h2>
          <p
            style={{
              color: "#667085",
              maxWidth: "460px",
              marginBottom: "20px",
              fontSize: "14px",
              lineHeight: 1.5,
            }}
          >
            An unexpected error occurred in the editor. Your project data is saved in local storage.
          </p>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              style={{
                background: "#7f56d9",
                color: "#fff",
                border: "1px solid #7f56d9",
                borderRadius: "8px",
                padding: "8px 16px",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
              }}
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              Reload Editor
            </button>
            <button
              style={{
                background: "#fff",
                color: "#344054",
                border: "1px solid #d0d5dd",
                borderRadius: "8px",
                padding: "8px 16px",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
              }}
              onClick={() => {
                localStorage.removeItem("chatvid_project_v1");
                window.location.href = "/";
              }}
            >
              Reset to Sample
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ConvexAuthProvider client={convex}>
        {isDashboard ? <Suspense fallback={null}><Dashboard /></Suspense> : <App />}
      </ConvexAuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
