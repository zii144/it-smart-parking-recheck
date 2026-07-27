import { lazy, Suspense } from "react";
import { LucideProvider } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import Spinner from "./components/Spinner";

// Three front ends, one Vite app: "/" is the field-inspector flow, "/admin" is
// the back-office console, "/design" is the design system showcase. This is a
// plain path check (not a SPA router library) since there are only ever these
// top-level destinations and none needs nested routes or params - keeps the
// dependency list short.
// Vite's dev server (and `vite preview`) serve index.html for any unknown
// path by default, so a hard navigation to /admin still loads this app.
//
// All three apps are code-split with React.lazy so a field inspector on a phone
// isn't forced to download the entire admin console (recharts, etc.) on first
// paint, and vice versa — only the half that's actually being viewed loads.
const InspectorApp = lazy(() => import("./InspectorApp"));
const AdminApp = lazy(() => import("./admin/AdminApp"));
const DesignSystemApp = lazy(() => import("./design/DesignSystemApp"));

export default function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const isAdmin = path.startsWith("/admin");
  const isDesign = path.startsWith("/design");
  // Heavier, rounded icon weight app-wide for a softer, friendlier look.
  return (
    <LucideProvider strokeWidth={2.5}>
      <ErrorBoundary>
        <Suspense fallback={<div className="app-shell centered"><Spinner label="載入中…" /></div>}>
          {isDesign ? <DesignSystemApp /> : isAdmin ? <AdminApp /> : <InspectorApp />}
        </Suspense>
      </ErrorBoundary>
    </LucideProvider>
  );
}
