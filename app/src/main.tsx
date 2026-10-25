import { StrictMode } from "react";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      {isDashboard ? <Suspense fallback={null}><Dashboard /></Suspense> : <App />}
    </ConvexAuthProvider>
  </StrictMode>,
);
