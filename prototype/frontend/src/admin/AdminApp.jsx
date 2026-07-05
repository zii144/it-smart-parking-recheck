import { useState } from "react";
import {
  ShieldHalf, LogOut, ParkingCircle, ClipboardList, Search, LayoutDashboard, Users, MapPinned, Settings,
} from "lucide-react";
import "../styles.css";
import "./admin.css";

import AdminLogin from "./components/AdminLogin";
import ReviewQueue from "./components/ReviewQueue";
import CaseSearch from "./components/CaseSearch";
import StatsDashboard from "./components/StatsDashboard";
import AccountsManager from "./components/AccountsManager";
import LocationsManager from "./components/LocationsManager";
import SettingsPanel from "./components/SettingsPanel";

const TABS = [
  { key: "queue", label: "複核佇列", icon: ClipboardList },
  { key: "search", label: "案件查詢", icon: Search },
  { key: "stats", label: "統計資料", icon: LayoutDashboard },
  { key: "accounts", label: "帳號管理", icon: Users },
  { key: "locations", label: "路段管理", icon: MapPinned },
  { key: "settings", label: "系統設定", icon: Settings },
];

export default function AdminApp() {
  const [admin, setAdmin] = useState(null);
  const [tab, setTab] = useState("queue");

  if (!admin) {
    return <AdminLogin onLoggedIn={setAdmin} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">
            <ShieldHalf size={20} />
          </span>
          <div>
            <div>後台管理系統</div>
            <span className="inspector-name">{admin.display_name}</span>
          </div>
        </div>
        <div className="header-actions">
          <a className="btn-ghost" href="/">
            <ParkingCircle size={15} /> 稽查員 APP
          </a>
          <button className="btn-ghost" onClick={() => setAdmin(null)}>
            <LogOut size={15} /> 登出
          </button>
        </div>
      </header>

      <nav className="admin-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={`admin-tab ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </nav>

      <main className="app-main admin-main">
        {tab === "queue" && <ReviewQueue adminUsername={admin.username} />}
        {tab === "search" && <CaseSearch adminUsername={admin.username} />}
        {tab === "stats" && <StatsDashboard />}
        {tab === "accounts" && <AccountsManager />}
        {tab === "locations" && <LocationsManager />}
        {tab === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}
