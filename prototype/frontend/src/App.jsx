import { lazy, Suspense } from "react";
import { LucideProvider } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import Spinner from "./components/Spinner";

// Two front ends, one Vite app: "/" is the field-inspector flow, "/admin" is
// the back-office console. This is a plain path check (not a SPA router
// library) since there are only ever these two top-level destinations and
// neither needs nested routes or params - keeps the dependency list short.
// Vite's dev server (and `vite preview`) serve index.html for any unknown
// path by default, so a hard navigation to /admin still loads this app.
//
// Both apps are code-split with React.lazy so a field inspector on a phone
// isn't forced to download the entire admin console (recharts, etc.) on first
// paint, and vice versa — only the half that's actually being viewed loads.
const InspectorApp = lazy(() => import("./InspectorApp"));
const AdminApp = lazy(() => import("./admin/AdminApp"));

export default function App() {
  const isAdmin = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  // Heavier, rounded icon weight app-wide for a softer, friendlier look.
  return (
    <LucideProvider strokeWidth={2.5}>
      <ErrorBoundary>
        <Suspense fallback={<div className="app-shell centered"><Spinner label="載入中…" /></div>}>
          {isAdmin ? <AdminApp /> : <InspectorApp />}
        </Suspense>
      </ErrorBoundary>
    </LucideProvider>
  );
}
