import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { LucideProvider } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import Spinner from "./components/Spinner";

// Entry point for the admin build (vite.admin.config.js -> admin.html).
// This build stays internal-only (the existing frontend container) — it's
// fine for it to also pull in InspectorApp's shared utility code if module
// boundaries do so; the security requirement is one-directional (public must
// exclude admin/design), not symmetric.
const AdminApp = lazy(() => import("./admin/AdminApp"));
const DesignSystemApp = lazy(() => import("./design/DesignSystemApp"));

function AdminEntry() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/admin";
  const isDesign = path.startsWith("/design");
  return isDesign ? <DesignSystemApp /> : <AdminApp />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LucideProvider strokeWidth={2.5}>
      <ErrorBoundary>
        <Suspense fallback={<div className="app-shell centered"><Spinner label="載入中…" /></div>}>
          <AdminEntry />
        </Suspense>
      </ErrorBoundary>
    </LucideProvider>
  </StrictMode>
);
