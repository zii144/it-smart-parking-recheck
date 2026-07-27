import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { LucideProvider } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import Spinner from "./components/Spinner";
import InspectorApp from "./InspectorApp";

// Entry point for the public build (vite.public.config.js -> public.html).
// Only InspectorApp is imported directly here (not lazy — it's the sole
// content of this bundle), so AdminApp/DesignSystemApp and everything under
// src/admin/**, src/design/** are unreachable from this build's module graph
// and never emitted into dist/public. See scripts/verify-build-split.sh.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LucideProvider strokeWidth={2.5}>
      <ErrorBoundary>
        <Suspense fallback={<div className="app-shell centered"><Spinner label="載入中…" /></div>}>
          <InspectorApp />
        </Suspense>
      </ErrorBoundary>
    </LucideProvider>
  </StrictMode>
);
