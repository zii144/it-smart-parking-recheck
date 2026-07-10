import { LucideProvider } from "lucide-react";
import InspectorApp from "./InspectorApp";
import AdminApp from "./admin/AdminApp";

// Two front ends, one Vite app: "/" is the field-inspector flow, "/admin" is
// the back-office console. This is a plain path check (not a SPA router
// library) since there are only ever these two top-level destinations and
// neither needs nested routes or params - keeps the dependency list short.
// Vite's dev server (and `vite preview`) serve index.html for any unknown
// path by default, so a hard navigation to /admin still loads this app.
export default function App() {
  const isAdmin = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  // Heavier, rounded icon weight app-wide for a softer, friendlier look.
  return (
    <LucideProvider strokeWidth={2.5}>
      {isAdmin ? <AdminApp /> : <InspectorApp />}
    </LucideProvider>
  );
}
